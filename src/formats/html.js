'use strict';

// HTML: the only format besides PDF whose anchor survives being handed to the OS, because
// the default viewer is a browser and `#id` is what browsers do. Generated documentation
// (AsciiDoc, Sphinx, Doxygen) puts an id on nearly every heading; hand-saved pages may not,
// so anchoring is decided per heading rather than per file.

const fs = require('fs');
const nodePath = require('path');
const { renderLines, renderHtml } = require('./preview');

// Read an image a page links to, from the page's own folder. Only inside that folder: a src
// like "../../etc/passwd" in a saved page must not become a file read.
function assetLoader(htmlAbs) {
  const dir = nodePath.dirname(htmlAbs);
  return (src) => {
    const rel = decodeURIComponent(src.split(/[?#]/)[0]);
    const abs = nodePath.resolve(dir, rel);
    if (abs !== dir && !abs.startsWith(dir + nodePath.sep)) return null;
    return fs.readFileSync(abs);
  };
}

// XML has five named entities; HTML has hundreds, and generated docs lean on them heavily —
// left raw they show up verbatim in the preview. This is the common set, not the full one.
const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: ' ', shy: '­', ensp: ' ', emsp: ' ', thinsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', bull: '•', middot: '·', dagger: '†',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
  copy: '©', reg: '®', trade: '™', sect: '§', para: '¶', deg: '°',
  larr: '←', rarr: '→', harr: '↔', times: '×', minus: '−', plusmn: '±',
  ne: '≠', le: '≤', ge: '≥', euro: '€', pound: '£', yen: '¥', cent: '¢',
};

function decodeEntities(s) {
  return String(s).replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (m, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    const hit = NAMED[body.toLowerCase()];
    return hit === undefined ? m : hit;
  });
}

const HEADING = /<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1\s*>/gi;
const ID_ATTR = /\b(?:id|name)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+))/i;
const DROP = /<(script|style|template)\b[\s\S]*?<\/\1\s*>/gi;
const BLOCK_END = /<\/(?:p|div|li|tr|dt|dd|h[1-6]|pre|blockquote|section|article|table)\s*>/gi;

const MAX_LINES = 40; // a section of a manual page can be enormous; the preview is a glance

const read = (absPath) => {
  try {
    return fs.readFileSync(absPath, 'utf8');
  } catch {
    return null;
  }
};

const inlineText = (fragment) => decodeEntities(fragment.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

// Lines of a fragment, with the block structure turned into line breaks. Newlines inside
// <pre> survive because only spaces within a line are collapsed.
function blockLines(fragment) {
  const flat = fragment
    .replace(DROP, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(BLOCK_END, '\n')
    .replace(/<[^>]*>/g, '');
  return decodeEntities(flat)
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean);
}

function idOf(attrs, inner) {
  const own = ID_ATTR.exec(attrs);
  if (own) return own[1] || own[2] || own[3] || null;
  // Older generators park the anchor on a child <a id> / <a name> instead of the heading.
  const child = /<a\b([^>]*)>/i.exec(inner);
  if (!child) return null;
  const m = ID_ATTR.exec(child[1]);
  return m ? m[1] || m[2] || m[3] || null : null;
}

function headings(html) {
  const out = [];
  let m;
  HEADING.lastIndex = 0;
  while ((m = HEADING.exec(html))) {
    const title = inlineText(m[3]);
    if (title) out.push({ title, anchor: idOf(m[2], m[3]), from: m.index, to: HEADING.lastIndex });
  }
  return out;
}

// Headings become sections in document order. `page` is only a position for the preview to
// count by — HTML has no pages, and it is `anchor` that a link actually carries.
async function readOutline(absPath) {
  const html = read(absPath);
  if (!html) return [];
  return headings(html).map((h, i) => ({ title: h.title, page: i + 1, anchor: h.anchor || undefined }));
}

// One section's text: everything between its heading and the next one.
async function readSection(absPath, page) {
  const html = read(absPath);
  if (!html) return null;
  const hs = headings(html);
  if (!hs.length) return { title: '', body: blockLines(html).slice(0, MAX_LINES), page: 1, total: 1 };
  const n = Math.min(Math.max(1, page | 0), hs.length);
  const here = hs[n - 1];
  const next = hs[n];
  const end = next ? next.from : html.length;
  // `raw` keeps the heading so the rendered preview shows it; `body` is the text under it,
  // which the header line already names.
  const body = blockLines(html.slice(here.to, end));
  return { title: here.title, body: body.slice(0, MAX_LINES), raw: html.slice(here.from, end), page: n, total: hs.length };
}

async function render(el, req) {
  const sec = await readSection(req.abs, req.page);
  if (!req.isCurrent() || !sec) return false;
  if (sec.raw) {
    const done = renderHtml(el, { html: sec.raw.replace(DROP, ''), width: req.width, loadImage: assetLoader(req.abs) });
    if (done !== false) return done;
  }
  return renderLines(el, { title: sec.title, body: sec.body, width: req.width });
}

module.exports = {
  // EPUB content is XHTML, so it reads its chapters with these rather than its own copy.
  blockLines,
  inlineText,
  decodeEntities,
  assetLoader,
  exts: ['html', 'htm', 'xhtml'],
  anchorKind: 'id',
  anchorFor: (e) => (e.kind === 'section' && e.anchor ? e.anchor : null),
  outline: readOutline,
  render,
  readOutline,
  readSection,
};
