'use strict';

// OpenDocument (LibreOffice/OpenOffice): a zip whose content.xml holds the body. Three shapes
// share it — odt is headings, odp is slides, ods is sheets — so the outline is read per kind
// but the text preview is common. No OS anchor: the fragment doesn't survive the viewer.

const { openZip } = require('../zip');
const { elements, attr, decodeEntities } = require('../xml');
const { renderLines } = require('./preview');
const { clampPage } = require('./util');

const MAX_LINES = 60;

function contentOf(absPath) {
  const zip = openZip(absPath);
  return zip ? zip.text('content.xml') : null;
}

// A run of ODF markup to readable lines: paragraphs and headings become lines, the space and
// break elements become the whitespace they stand for, everything else is dropped.
const TEXT_BLOCK = /<text:(?:h|p)\b[^>]*>([\s\S]*?)<\/text:(?:h|p)>/g;
function textLines(xml) {
  const out = [];
  let m;
  while ((m = TEXT_BLOCK.exec(xml))) {
    const line = decodeEntities(m[1]
      .replace(/<text:tab\b[^>]*\/?>/g, ' ')
      .replace(/<text:s\b[^>]*\/?>/g, ' ')
      .replace(/<text:line-break\b[^>]*\/?>/g, ' ')
      .replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
    if (line) out.push(line);
  }
  return out;
}

// odt: each heading with its 1-based order. Position is ordinal — ODF has no pages — and it is
// only ever a counter for the preview, since the link carries no anchor.
function odtOutline(xml) {
  const out = [];
  let m;
  const re = /<text:h\b[^>]*>([\s\S]*?)<\/text:h>/g;
  while ((m = re.exec(xml))) {
    const title = decodeEntities(m[1].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
    if (title) out.push({ title, page: out.length + 1 });
  }
  return out;
}

// A slide's title and body. The title comes from the frame marked presentation:class="title"
// wherever it sits in the page — frame order is not guaranteed, so the first text line is only
// a fallback for a slide that has no title frame.
function slideText(page) {
  let title = '';
  const body = [];
  for (const frame of elements(page, 'draw:frame')) {
    const lines = textLines(frame);
    if (!title && (attr(frame, 'presentation:class') || '') === 'title') title = lines.join(' ');
    else body.push(...lines);
  }
  if (!title) title = body.shift() || '';
  return { title, body };
}

function odpOutline(xml) {
  const out = [];
  for (const page of elements(xml, 'draw:page')) {
    const title = slideText(page).title;
    if (title) out.push({ title, page: out.length + 1 });
  }
  return out;
}

function odsOutline(xml) {
  const out = [];
  for (const table of elements(xml, 'table:table')) {
    const name = attr(table, 'table:name');
    if (name) out.push({ title: name, page: out.length + 1 });
  }
  return out;
}

function outlineFor(ext, xml) {
  if (ext === 'odp') return odpOutline(xml);
  if (ext === 'ods') return odsOutline(xml);
  return odtOutline(xml);
}

async function readOutline(absPath, ext) {
  const xml = contentOf(absPath);
  return xml ? outlineFor(ext, xml) : [];
}

// The text of one section: an odt heading's run up to the next, a slide's frames, a sheet's
// cells.
async function readSection(absPath, ext, page) {
  const xml = contentOf(absPath);
  if (!xml) return null;

  if (ext === 'odp') {
    const pages = elements(xml, 'draw:page');
    if (!pages.length) return null;
    const n = clampPage(page, pages.length);
    const { title, body } = slideText(pages[n - 1]);
    return { title, body: body.slice(0, MAX_LINES), page: n, total: pages.length };
  }
  if (ext === 'ods') {
    const tables = elements(xml, 'table:table');
    if (!tables.length) return null;
    const n = clampPage(page, tables.length);
    return { title: attr(tables[n - 1], 'table:name') || '', body: textLines(tables[n - 1]).slice(0, MAX_LINES), page: n, total: tables.length };
  }

  const hs = odtOutline(xml);
  const lines = textLines(xml);
  if (!hs.length) return { title: '', body: lines.slice(0, MAX_LINES), page: 1, total: 1 };
  const n = clampPage(page, hs.length);
  const here = lines.indexOf(hs[n - 1].title);
  const next = hs[n] ? lines.indexOf(hs[n].title, here + 1) : lines.length;
  const body = lines.slice(here + 1, next < 0 ? lines.length : next);
  return { title: hs[n - 1].title, body: body.slice(0, MAX_LINES), page: n, total: hs.length };
}

async function render(el, req) {
  const sec = await readSection(req.abs, req.ext, req.page);
  if (!req.isCurrent() || !sec) return false;
  return renderLines(el, { title: sec.title, body: sec.body, width: req.width });
}

module.exports = {
  exts: ['odt', 'ods', 'odp'],
  anchorKind: null,
  outline: (abs, ext) => readOutline(abs, ext),
  render,
  readOutline,
  readSection,
};
