'use strict';

// Which indexed document each citation key names. Plain data in, no filesystem.

// file:///home/x keeps its leading slash, file:///C:/x loses it. Stripping the third slash
// blindly made every POSIX file:// path in a bibliography unmatchable.
const normalize = (p) => String(p || '').split('\\').join('/')
  .replace(/^file:\/\//i, '').replace(/^\/([A-Za-z]:)/, '$1').replace(/\/+$/, '');
const baseOf = (p) => { const n = normalize(p); const i = n.lastIndexOf('/'); return i < 0 ? n : n.slice(i + 1); };
const stemOf = (p) => baseOf(p).replace(/\.[^.]+$/, '');

// Titles and file names disagree about punctuation far more often than about words.
const foldTitle = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const push = (map, key, value) => {
  const a = map.get(key);
  if (a) a.push(value); else map.set(key, [value]);
};

// Two documents answering to one name is not a match: a wrong `cite:` in a note outlives the
// mistake, and no key is better than the wrong one.
const only = (a) => (a && a.length === 1 ? a[0] : null);

function indexPaths(relPaths, root) {
  const nroot = normalize(root).toLowerCase();
  const byAbs = new Map();
  const byTail = new Map();
  const byBase = new Map();
  const byTitle = new Map();
  for (const rel of relPaths) {
    const n = normalize(rel).toLowerCase();
    byAbs.set(nroot ? nroot + '/' + n : n, rel);
    push(byTail, n, rel);
    push(byBase, baseOf(n), rel);
    push(byTitle, foldTitle(stemOf(n)), rel);
  }
  return { byAbs, byTail, byBase, byTitle };
}

// A stated path outranks any name: libraries repeat file names far more than they repeat paths.
function matchEntry(entry, idx) {
  for (const p of entry.paths || []) {
    const n = normalize(p).toLowerCase();
    const abs = idx.byAbs.get(n);
    if (abs) return { rel: abs, how: 'path' };
  }
  // Written against another machine's root: only the tail holds. Longest suffix first.
  for (const p of entry.paths || []) {
    const segs = normalize(p).toLowerCase().split('/');
    for (let i = 0; i < segs.length - 1; i++) {
      const r = only(idx.byTail.get(segs.slice(i).join('/')));
      if (r) return { rel: r, how: 'path' };
    }
  }
  for (const p of entry.paths || []) {
    const r = only(idx.byBase.get(baseOf(p).toLowerCase()));
    if (r) return { rel: r, how: 'name' };
  }
  const title = foldTitle(entry.title);
  if (title) {
    const r = only(idx.byTitle.get(title));
    if (r) return { rel: r, how: 'title' };
  }
  return null;
}

// An unmatched key is kept: it still tells a missing key from an unindexed document.
// A duplicated key keeps its first entry, the way BibTeX itself resolves duplicates.
function buildCitations(entries, relPaths, root) {
  const idx = indexPaths(relPaths, root);
  const byKey = new Map();
  const byPath = new Map();
  let matched = 0;
  for (const e of entries) {
    const lc = String(e.key).toLowerCase();
    if (byKey.has(lc)) continue;
    const hit = matchEntry(e, idx);
    byKey.set(lc, { key: e.key, rel: hit ? hit.rel : null, how: hit ? hit.how : null, title: e.title || '', year: e.year || '' });
    if (hit) {
      matched++;
      if (!byPath.has(hit.rel)) byPath.set(hit.rel, e.key);
    }
  }
  return { byKey, byPath, keys: byKey.size, matched };
}

const emptyCitations = () => ({ byKey: new Map(), byPath: new Map(), keys: 0, matched: 0 });

module.exports = { buildCitations, emptyCitations, matchEntry, indexPaths, foldTitle, normalize };
