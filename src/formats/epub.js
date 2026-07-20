'use strict';

// EPUB: a zip of XHTML with a real table of contents, so sections come out as well as a
// PDF's outline does. Position is the spine index — the reading order the book itself
// declares. No OS anchor: an e-reader takes the whole file and ignores a fragment.

const { openZip } = require('../zip');
const { elements, attr, textIn } = require('../xml');
const { blockLines, inlineText } = require('./html');
const { renderLines, renderHtml } = require('./preview');
const { clampPage, normPath, assetSrc } = require('./util');

const MAX_LINES = 60;

// Zip member paths are absolute within the archive; hrefs inside a document are relative to
// the document that holds them, so resolve against the base file's folder.
const resolve = (base, href) => normPath((base ? base.split('/').slice(0, -1).join('/') + '/' : '') + href);

const dropFragment = (href) => String(href).split('#')[0];

function opfPath(zip) {
  const container = zip.text('META-INF/container.xml');
  if (!container) return null;
  for (const r of elements(container, 'rootfile')) {
    const p = attr(r, 'full-path');
    if (p && zip.has(p)) return p;
  }
  return null;
}

// The spine, as zip paths in reading order, plus the manifest for looking hrefs up.
function readSpine(zip, opf, xml) {
  const items = new Map();
  const manifest = elements(xml, 'manifest')[0] || '';
  for (const it of elements(manifest, 'item')) {
    const id = attr(it, 'id');
    const href = attr(it, 'href');
    if (id && href) items.set(id, { path: resolve(opf, dropFragment(href)), props: attr(it, 'properties') || '' });
  }
  const spine = elements(xml, 'spine')[0] || '';
  const order = [];
  for (const ref of elements(spine, 'itemref')) {
    const hit = items.get(attr(ref, 'idref'));
    if (hit && zip.has(hit.path)) order.push(hit.path);
  }
  return { items, order, tocId: attr(spine, 'toc') };
}

// EPUB 3 keeps the contents in a nav document; EPUB 2 in an NCX. Both are read, newer first,
// because a book may ship both and the nav one is the one it means.
function readToc(zip, spine) {
  const nav = [...spine.items.values()].find((i) => /\bnav\b/.test(i.props));
  if (nav) {
    const doc = zip.text(nav.path);
    const out = doc ? tocFromNav(doc, nav.path) : [];
    if (out.length) return out;
  }
  const ncx = spine.tocId && spine.items.get(spine.tocId);
  if (ncx) {
    const doc = zip.text(ncx.path);
    if (doc) return tocFromNcx(doc, ncx.path);
  }
  return [];
}

function tocFromNav(doc, base) {
  const toc = elements(doc, 'nav').find((n) => /toc/i.test(attr(n, 'epub:type') || attr(n, 'type') || ''))
    || elements(doc, 'nav')[0];
  if (!toc) return [];
  const out = [];
  for (const a of elements(toc, 'a')) {
    const href = attr(a, 'href');
    const title = inlineText(a);
    if (href && title) out.push({ title, path: resolve(base, dropFragment(href)) });
  }
  return out;
}

function tocFromNcx(doc, base) {
  const out = [];
  for (const p of elements(doc, 'navPoint')) {
    const title = textIn(elements(p, 'navLabel')[0] || '', 'text').replace(/\s+/g, ' ').trim();
    const content = elements(p, 'content')[0];
    const src = content && attr(content, 'src');
    if (title && src) out.push({ title, path: resolve(base, dropFragment(src)) });
  }
  return out;
}

function open(absPath) {
  const zip = openZip(absPath);
  if (!zip) return null;
  const opf = opfPath(zip);
  const xml = opf && zip.text(opf);
  if (!xml) return null;
  const spine = readSpine(zip, opf, xml);
  if (!spine.order.length) return null;
  return { zip, opf, spine };
}

// A chapter's title against its spine position, so a link lands on the right document even
// though the reader will open the book at the beginning.
async function readOutline(absPath) {
  const doc = open(absPath);
  if (!doc) return [];
  const at = new Map(doc.spine.order.map((p, i) => [p, i + 1]));
  const out = [];
  const seen = new Set();
  for (const entry of readToc(doc.zip, doc.spine)) {
    const page = at.get(entry.path);
    // Several TOC entries can point into one chapter; only the first can be told apart by
    // position, and the rest would be duplicates under different names.
    if (!page || seen.has(entry.title + '|' + page)) continue;
    seen.add(entry.title + '|' + page);
    out.push({ title: entry.title, page });
  }
  return out;
}

// `path` is the chapter's own zip path, kept so images inside it resolve against it.
function chapterAt(doc, page) {
  const n = clampPage(page, doc.spine.order.length);
  const path = doc.spine.order[n - 1];
  const xhtml = doc.zip.text(path);
  if (!xhtml) return null;
  const body = elements(xhtml, 'body')[0] || xhtml;
  const lines = blockLines(body);
  return { title: lines[0] || '', body: lines.slice(1, MAX_LINES), raw: body, path, page: n, total: doc.spine.order.length };
}

async function readChapter(absPath, page) {
  const doc = open(absPath);
  return doc ? chapterAt(doc, page) : null;
}

// A chapter is XHTML, so it renders as markup, and its images live in the same zip — read
// each member and hand it to the inliner as bytes.
async function render(el, req) {
  const doc = open(req.abs);
  const ch = doc && chapterAt(doc, req.page);
  if (!req.isCurrent() || !ch) return false;
  if (ch.raw) {
    const done = renderHtml(el, { html: ch.raw, width: req.width, loadImage: imageLoader(doc, ch.path) });
    if (done !== false) return done;
  }
  return renderLines(el, { title: ch.title, body: ch.body, width: req.width });
}

// Reads an image the chapter references out of the same zip, its src resolved against the
// chapter's own path — "../images/x.png" from OEBPS/text/ lands on OEBPS/images/x.png.
const imageLoader = (doc, chapterPath) => (src) => doc.zip.read(resolve(chapterPath, assetSrc(src)));

module.exports = {
  exts: ['epub'],
  anchorKind: null, // an e-reader takes the file and ignores the fragment
  outline: readOutline,
  render,
  readOutline,
  readChapter,
  open,
  imageLoader,
};
