'use strict';

// Small shared primitives for the format handlers, so the same one-liners don't drift across
// pptx / html / epub / odf / text.

// A 1-based position clamped into a document's range — every handler resolves a requested
// position this way before reading it.
const clampPosition = (position, total) => Math.min(Math.max(1, position | 0), total);

// Collapse '.' / '..' / empty segments in a POSIX path inside an archive. Each format keeps
// its own base convention (OOXML rels resolve against the part's folder, EPUB hrefs against
// the document's) and hands the joined path here.
function normPath(pathStr) {
  const out = [];
  for (const seg of String(pathStr).split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop(); else out.push(seg);
  }
  return out.join('/');
}

// The file part of an <img src>: the query and fragment dropped, percent-escapes decoded.
const assetSrc = (src) => decodeURIComponent(String(src).split(/[?#]/)[0]);

// Where the section that heading `n` opens ends: at the next heading of the same or shallower
// level, not simply at the next heading. A chapter title with a subheading directly under it
// would otherwise preview as nothing but its own name.
function sectionEnd(headings, n, endOfDocument) {
  const level = headings[n - 1].level || 1;
  for (let i = n; i < headings.length; i++) if ((headings[i].level || 1) <= level) return headings[i].from;
  return endOfDocument;
}

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// A sheet's preview grid — enough to read, not the whole workbook.
const MAX_ROWS = 100;
const MAX_COLS = 20;

// A cell is either a plain string or `{ text, cls }` when it carries its own formatting. This
// pulls the text out of either, so the used-range and header logic reads one shape.
const cellText = (c) => (c && typeof c === 'object' ? c.text || '' : c || '');

// The place a merge swallows. It holds no text but it is still a used cell: dropped from the
// range, the columns a title spans get trimmed away and the title stops spanning them.
const COVERED = { text: '', covered: true };
const isCovered = (c) => !!(c && typeof c === 'object' && c.covered);

// `cell` widened to cover cols × rows. The text and formatting are the anchor's; everything it
// covers is marked so the table draws one cell where the sheet holds several.
const spanning = (cell, cols, rows) => Object.assign(
  {}, typeof cell === 'object' && cell ? cell : { text: cell || '' }, { cols, rows },
);

// A sheet's used range: the first and last row and column that hold anything. Real sheets do
// not start at A1 — a workbook laid out from B2 would otherwise render a blank rim.
function usedRange(grid) {
  let top = -1; let bottom = -1; let left = -1; let right = -1;
  grid.forEach((cells, r) => cells.forEach((c, i) => {
    if (!cellText(c) && !isCovered(c)) return;
    if (top < 0) top = r;
    bottom = r;
    if (left < 0 || i < left) left = i;
    if (i > right) right = i;
  }));
  return { top, bottom, left, right };
}

// A grid as an HTML table, or null when nothing is filled. A cell may be a bare string, a
// `{ text, cls }`, a `{ cols, rows }` merge or `COVERED`; `opts.cols` is per-column
// `{ width, cls }` and `opts.header` (default true) promotes the first row. Shared so ods and
// xlsx render as one thing, not two.
function gridToHtml(grid, opts = {}) {
  const { top, bottom, left, right } = usedRange(grid);
  if (top < 0) return null;
  const last = Math.min(right + 1, left + MAX_COLS);
  const width = last - left;
  const rows = grid.slice(top, Math.min(bottom + 1, top + MAX_ROWS))
    .map((cells) => Array.from({ length: width }, (_, i) => cells[left + i]));
  const header = opts.header !== false;

  // A span is clamped to what is drawn: the range is trimmed and capped after the merge was
  // read, and a colspan reaching past the last column adds columns the sheet does not have.
  const span = (n, room, name) => {
    const at = Math.min(Math.max(1, n || 1), room);
    return at > 1 ? ' ' + name + '="' + at + '"' : '';
  };
  const cellHtml = (c, tag, r, i) => {
    if (isCovered(c)) return '';
    const cls = c && typeof c === 'object' && c.cls ? ' class="' + c.cls + '"' : '';
    const merged = c && typeof c === 'object'
      ? span(c.cols, width - i, 'colspan') + span(c.rows, rows.length - r, 'rowspan') : '';
    return '<' + tag + cls + merged + '>' + escHtml(cellText(c)) + '</' + tag + '>';
  };
  const rowHtml = (cells, tag, r) => '<tr>' + cells.map((c, i) => cellHtml(c, tag, r, i)).join('') + '</tr>';

  const cols = opts.cols || [];
  const group = cols.length ? '<colgroup>' + Array.from({ length: width }, (_, i) => {
    const col = cols[left + i] || {};
    const style = col.width ? ' style="width:' + col.width + '"' : '';
    const cls = col.cls ? ' class="' + col.cls + '"' : '';
    return '<col' + style + cls + '>';
  }).join('') + '</colgroup>' : '';

  const head = header ? rowHtml(rows[0], 'th', 0) : '';
  const body = (header ? rows.slice(1) : rows).map((cs, i) => rowHtml(cs, 'td', header ? i + 1 : i)).join('');
  return '<table>' + group + head + body + '</table>';
}

module.exports = {
  clampPosition, normPath, assetSrc, escHtml, escAttr,
  usedRange, gridToHtml, cellText, spanning, isCovered, COVERED, sectionEnd, MAX_ROWS, MAX_COLS,
};
