'use strict';

// A bibliography read for its citation keys and the files they point at. Text only: no index
// and no filesystem here. Formatting a citation is a bibliography manager's job, not ours.

// A value may be brace-delimited, quoted, or a bare number/macro, and `#` concatenates them.
// Braces inside a value protect capitalisation ({DNA}) and carry no meaning once parsed.
const stripBraces = (s) => s.replace(/[{}]/g, '');

// Mendeley escapes the separators it writes into a `file` field; \\ has to go last or it
// would consume the backslash of a pair it just produced.
const unescapeSpec = (s) => s.replace(/\\([:;\\])/g, '$1');

function splitUnescaped(s, sep) {
  const out = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) { cur += c + s[++i]; continue; }
    if (c === sep) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

// A Windows drive letter splits on the same colon the spec uses as its separator, so put it
// back together before anything counts the fields.
function rejoinDrives(parts) {
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    if (/^[A-Za-z]$/.test(parts[i]) && i + 1 < parts.length && /^[\\/]/.test(parts[i + 1])) {
      out.push(parts[i] + ':' + parts[i + 1]);
      i++;
    } else out.push(parts[i]);
  }
  return out;
}

// The attachment paths a `file` field names. Zotero, Better BibTeX and JabRef all write
// "description:path:mimetype", several joined by ';'; a hand-written bibliography just writes
// the path. The path is what is left after dropping those two, never simply the second field.
function attachmentPaths(raw) {
  const out = [];
  for (const spec of splitUnescaped(String(raw || ''), ';')) {
    if (!spec.trim()) continue;
    const parts = rejoinDrives(splitUnescaped(spec, ':')).map((p) => unescapeSpec(p).trim());
    const path = parts.length >= 3 ? parts.slice(1, -1).join(':') : parts[parts.length - 1];
    if (path) out.push(path);
  }
  return out;
}

class Scanner {
  constructor(text) { this.s = text; this.i = 0; }

  skipSpace() { while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++; }

  // From an opening delimiter to its match, returning what sits between. Brace depth is
  // tracked inside a quoted value too, since "a {b} c" is one value.
  balanced(open, close) {
    let depth = 0;
    const start = ++this.i;
    for (; this.i < this.s.length; this.i++) {
      const c = this.s[this.i];
      if (c === '\\') { this.i++; continue; }
      if (c === open) depth++;
      else if (c === close) { if (!depth) return this.s.slice(start, this.i++); depth--; }
    }
    return this.s.slice(start);
  }

  quoted() {
    let depth = 0;
    const start = ++this.i;
    for (; this.i < this.s.length; this.i++) {
      const c = this.s[this.i];
      if (c === '\\') { this.i++; continue; }
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '"' && !depth) return this.s.slice(start, this.i++);
    }
    return this.s.slice(start);
  }

  bare() {
    const start = this.i;
    while (this.i < this.s.length && !/[,}\s#)]/.test(this.s[this.i])) this.i++;
    return this.s.slice(start, this.i);
  }

  value(macros) {
    let out = '';
    for (;;) {
      this.skipSpace();
      const c = this.s[this.i];
      if (c === '{') out += stripBraces(this.balanced('{', '}'));
      else if (c === '"') out += stripBraces(this.quoted());
      else {
        const word = this.bare();
        if (!word) break;
        out += Object.prototype.hasOwnProperty.call(macros, word.toLowerCase()) ? macros[word.toLowerCase()] : word;
      }
      this.skipSpace();
      if (this.s[this.i] !== '#') break;
      this.i++;
    }
    return out.trim();
  }
}

// Fields up to the entry's closing brace. `stop` is the delimiter the entry opened with, so a
// @entry(...) closes on its own paren.
function readFields(sc, macros, stop) {
  const fields = {};
  for (;;) {
    sc.skipSpace();
    if (sc.i >= sc.s.length || sc.s[sc.i] === stop) { sc.i++; break; }
    if (sc.s[sc.i] === ',') { sc.i++; continue; }
    const start = sc.i;
    while (sc.i < sc.s.length && !/[=,}\s)]/.test(sc.s[sc.i])) sc.i++;
    const name = sc.s.slice(start, sc.i).trim().toLowerCase();
    sc.skipSpace();
    if (sc.s[sc.i] !== '=') { if (!name) sc.i++; continue; }
    sc.i++;
    const v = sc.value(macros);
    if (name) fields[name] = v;
  }
  return fields;
}

// Every entry a BibTeX file declares: { key, type, fields }. @string macros are expanded as
// they are met, @comment and @preamble skipped. A malformed entry costs only itself — a
// bibliography is someone else's file and is never wholly trustworthy.
function parseBibtex(text) {
  const sc = new Scanner(String(text || ''));
  const macros = {};
  const out = [];
  while (sc.i < sc.s.length) {
    if (sc.s[sc.i++] !== '@') continue;
    sc.skipSpace();
    const start = sc.i;
    while (sc.i < sc.s.length && /[A-Za-z]/.test(sc.s[sc.i])) sc.i++;
    const type = sc.s.slice(start, sc.i).toLowerCase();
    sc.skipSpace();
    const open = sc.s[sc.i];
    if (open !== '{' && open !== '(') continue;
    const close = open === '{' ? '}' : ')';
    if (type === 'comment' || type === 'preamble') { sc.balanced(open, close); continue; }
    if (type === 'string') {
      const body = sc.balanced(open, close);
      const eq = body.indexOf('=');
      if (eq > 0) {
        const name = body.slice(0, eq).trim().toLowerCase();
        macros[name] = new Scanner(body.slice(eq + 1)).value(macros);
      }
      continue;
    }
    sc.i++;
    sc.skipSpace();
    const keyStart = sc.i;
    while (sc.i < sc.s.length && !/[,}\s)]/.test(sc.s[sc.i])) sc.i++;
    const key = sc.s.slice(keyStart, sc.i).trim();
    const fields = readFields(sc, macros, close);
    if (key) out.push({ key, type, fields });
  }
  return out;
}

const cslYear = (e) => {
  const parts = e.issued && e.issued['date-parts'];
  const y = Array.isArray(parts) && Array.isArray(parts[0]) ? parts[0][0] : null;
  return y == null ? '' : String(y);
};

const cslAuthor = (e) => (Array.isArray(e.author) ? e.author : [])
  .map((a) => a.family || a.literal || '').filter(Boolean).join(' and ');

// CSL-JSON carries no attachment paths — Zotero's CSL export drops them — so an entry read
// from here matches a document by title or by file name, never by a path it named.
function parseCsl(text) {
  let data;
  try { data = JSON.parse(text); } catch { return []; }
  if (!Array.isArray(data)) return [];
  return data.filter((e) => e && e.id != null).map((e) => ({
    key: String(e.id),
    type: String(e.type || 'document'),
    fields: { title: String(e.title || ''), author: cslAuthor(e), year: cslYear(e) },
  }));
}

const looksLikeJson = (text) => /^\s*\[/.test(text);

// Entries with their attachment paths resolved: { key, type, title, year, paths }.
function parseBibliography(text) {
  const raw = looksLikeJson(text) ? parseCsl(text) : parseBibtex(text);
  return raw.map((e) => ({
    key: e.key,
    type: e.type,
    title: e.fields.title || '',
    year: e.fields.year || e.fields.date || '',
    paths: attachmentPaths(e.fields.file),
  }));
}

module.exports = { parseBibtex, parseCsl, parseBibliography, attachmentPaths };
