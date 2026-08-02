'use strict';

// What the vault actually cites, as a note. Gathering and formatting are pure — notes in,
// markdown out — so the report can be checked without a vault behind it.

const { linkRegex, splitTarget } = require('./shared/markdown');
const { parseBinding, ownsBinding } = require('./shared/binding');
const { t, plural } = require('./shared/i18n');

const OWNER = 'reference';

// Every citation key pinned in `text`, one per link, in the order they appear.
function keysIn(text) {
  const out = [];
  const re = linkRegex();
  let m;
  while ((m = re.exec(String(text || '')))) {
    const { title } = splitTarget(m[2]);
    if (!ownsBinding(title, OWNER)) continue;
    const b = parseBinding(title);
    if (b && b.cite) out.push(b.cite);
  }
  return out;
}

// key (folded) -> { key, notes, uses }, folded over `notes` given as { path, text }. The key is
// kept as first written: a bibliography is case-insensitive about keys, a reader is not.
function collect(notes) {
  const byKey = new Map();
  for (const n of notes || []) {
    for (const key of keysIn(n.text)) {
      const lc = key.toLowerCase();
      const hit = byKey.get(lc) || { key, notes: [], uses: 0 };
      if (!hit.notes.includes(n.path)) hit.notes.push(n.path);
      hit.uses += 1;
      byKey.set(lc, hit);
    }
  }
  return byKey;
}

const cell = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|');

// A wikilink to a note by path, captioned with its name — the path is what resolves, the name
// is what reads.
const noteLink = (path) => {
  const base = path.replace(/\.md$/i, '');
  const name = base.slice(base.lastIndexOf('/') + 1);
  return '[[' + cell(base) + '|' + cell(name) + ']]';
};

// The report. `citations` is the plugin's citation index, so a key a note pins but the
// bibliography no longer carries is called out rather than left blank — that is the case
// worth seeing.
function report(byKey, citations) {
  const rows = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
  const noteCount = new Set(rows.flatMap((r) => r.notes)).size;
  const out = [
    '# ' + t('report.citations.title'),
    '',
    t('report.citations.summary', { keys: plural('key', rows.length), notes: plural('note', noteCount) }),
    '',
    '| ' + [t('report.citations.key'), t('report.citations.document'), t('report.citations.citedIn')].join(' | ') + ' |',
    '|---|---|---|',
  ];
  for (const r of rows) {
    const known = citations && citations.byKey && citations.byKey.get(r.key.toLowerCase());
    let doc;
    if (!known) doc = t('report.citations.unknownKey');
    else if (!known.rel) doc = t('report.citations.noDocument');
    else doc = '`' + cell(known.rel) + '`';
    out.push('| ' + [cell(r.key), doc, r.notes.map(noteLink).join(', ')].join(' | ') + ' |');
  }
  return out.join('\n') + '\n';
}

module.exports = { keysIn, collect, report };
