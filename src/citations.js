'use strict';

// Which indexed document each citation key names. `bib.js` reads the bibliography as text;
// everything here is the matching, kept off the filesystem so it can be tested on plain data.

// file:///home/u/a.pdf is an absolute path and must keep its leading slash; file:///C:/a.pdf
// is the same URL around a drive letter and must lose it. Stripping the third slash blindly
// made every POSIX file:// path in a bibliography unmatchable.
const normalize = (p) => String(p || '').split('\\').join('/')
  .replace(/^file:\/\//i, '').replace(/^\/([A-Za-z]:)/, '$1').replace(/\/+$/, '');
const baseOf = (p) => { const n = normalize(p); const i = n.lastIndexOf('/'); return i < 0 ? n : n.slice(i + 1); };
const stemOf = (p) => baseOf(p).replace(/\.[^.]+$/, '');

// Titles and file names disagree about punctuation and case far more often than about words,
// so both sides are reduced to their letters and digits before being compared.
const foldTitle = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const push = (map, key, value) => {
  const a = map.get(key);
  if (a) a.push(value); else map.set(key, [value]);
};

// One match or none. Two documents answering to the same name is not a match: binding a key
// to the wrong one would write a wrong `cite:` into the note, which is worse than no key.
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

// The document an entry names, and how it was found. A path the bibliography states is
// trusted over any name: the same paper is often filed under a name that another paper in the
// library also carries.
function matchEntry(entry, idx) {
  for (const p of entry.paths || []) {
    const n = normalize(p).toLowerCase();
    const abs = idx.byAbs.get(n);
    if (abs) return { rel: abs, how: 'path' };
  }
  // The bibliography was written against another machine's library root, so only the tail of
  // what it states can be trusted. Longest suffix first: the most specific one that resolves.
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

// The maps the plugin resolves a binding through. An unmatched key is kept: it is still a key
// the reader may type, and it is what the settings pane counts as needing attention.
//
// A duplicated key keeps its first entry — BibTeX itself resolves duplicates that way, and a
// key bound to whichever export happened to be read last would drift for no visible reason.
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
