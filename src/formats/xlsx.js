'use strict';

// Excel: each sheet is a section, rendered as the grid it is. Cells carry their value and a
// style id; the text of a shared string and the meaning of a date both live elsewhere in the zip.

const { openZip } = require('../zip');
const { elements, attr, textIn, decodeEntities } = require('../xml');
const { renderLines, renderHtml, renderFrame } = require('./preview');
const { clampPosition, normPath, gridToHtml, cellText: textOf, spanning, COVERED, MAX_ROWS, MAX_COLS } = require('./util');
const { sheet: cssSheet, SHEET_RULES } = require('./css');
const xlsxStyles = require('./xlsx-styles');
const xlsxFormat = require('./xlsx-format');

const MAX_LINES = 60;
const SHEET_RE = /^xl\/worksheets\/sheet(\d+)\.xml$/;

const clean = (s) => decodeEntities(s).replace(/\s+/g, ' ').trim();

// "B2" -> 1. Anything past the letters is the row and stops the walk.
function colIndex(ref) {
  let n = 0;
  for (const ch of String(ref).toUpperCase()) {
    const code = ch.charCodeAt(0);
    if (code < 65 || code > 90) break;
    n = n * 26 + (code - 64);
  }
  return n - 1;
}

// Sheets in the order the tabs are shown, which is the order of workbook.xml — not the order of
// the relationships, and not the numbering of the parts.
function sheetParts(zip) {
  const rels = new Map();
  for (const r of elements(zip.text('xl/_rels/workbook.xml.rels') || '', 'Relationship')) {
    const id = attr(r, 'Id');
    const target = attr(r, 'Target');
    if (id && target) rels.set(id, normPath('xl/' + target.replace(/^\/+/, '')));
  }
  const out = [];
  for (const sheet of elements(elements(zip.text('xl/workbook.xml') || '', 'sheets')[0] || '', 'sheet')) {
    const name = attr(sheet, 'name');
    const part = rels.get(attr(sheet, 'r:id'));
    if (name && part && zip.has(part)) out.push({ name, part });
  }
  if (out.length) return out;
  return zip.names().filter((n) => SHEET_RE.test(n))
    .sort((a, b) => Number(SHEET_RE.exec(a)[1]) - Number(SHEET_RE.exec(b)[1]))
    .map((part, i) => ({ name: 'Sheet' + (i + 1), part }));
}

const sharedStrings = (zip) => elements(zip.text('xl/sharedStrings.xml') || '', 'si').map((si) => clean(textIn(si, 't')));

// The format code each cell style names. A workbook states its own codes and inherits the rest
// from the numbering every reader is expected to know.
function numberFormats(stylesXml) {
  const custom = {};
  for (const fmt of elements(stylesXml || '', 'numFmt')) {
    const id = attr(fmt, 'numFmtId');
    if (id) custom[id] = attr(fmt, 'formatCode') || '';
  }
  return elements(elements(stylesXml || '', 'cellXfs')[0] || '', 'xf')
    .map((xf) => xlsxFormat.codeFor(attr(xf, 'numFmtId') || '0', custom));
}

function cellText(cell, book) {
  const type = attr(cell, 't');
  if (type === 'inlineStr') return clean(textIn(cell, 't'));
  const raw = clean(textIn(cell, 'v'));
  if (!raw) return '';
  if (type === 's') return book.strings[Number(raw)] || '';
  if (type === 'b') return raw === '0' ? 'FALSE' : 'TRUE';
  if (type === 'e' || type === 'str') return raw;
  const shown = xlsxFormat.format(raw, (book.formats || [])[Number(attr(cell, 's') || '0')]);
  return shown === null ? raw : shown;
}

// One cell, with the formatting its style index names when there is a stylesheet to hold the
// class. Without a ctx it is a bare string, which is what the flat-text callers need.
function makeCell(cell, book, ctx) {
  const text = cellText(cell, book);
  if (!ctx || !ctx.sheet) return text;
  const cls = ctx.sheet.cls(book.styles.format(attr(cell, 's')));
  return cls ? { text, cls } : text;
}

const NO_STYLES = { format: () => ({}) };

const rowIndex = (ref) => (parseInt(String(ref).replace(/^[A-Za-z]+/, ''), 10) || 0) - 1;

// The cells a merge swallows. Excel keeps them in the sheet as empty cells beside the one that
// holds the text, so drawn as themselves they push the rest of the row out of line.
function applyMerges(grid, sheetXml, firstRow) {
  for (const m of elements(elements(sheetXml, 'mergeCells')[0] || '', 'mergeCell')) {
    const [from, to] = String(attr(m, 'ref') || '').split(':');
    if (!to) continue;
    const top = rowIndex(from) - firstRow;
    const bottom = rowIndex(to) - firstRow;
    const left = colIndex(from);
    // Clamped to what the preview keeps: a merge across the whole sheet states column XFD, and
    // marking all 16384 of it covered fills the grid with places that are then thrown away.
    const right = Math.min(colIndex(to), left + MAX_COLS);
    if (top < 0 || left < 0 || !grid[top]) continue;
    grid[top][left] = spanning(grid[top][left], right - left + 1, bottom - top + 1);
    for (let r = top; r <= bottom && grid[r]; r++) {
      for (let c = left; c <= right; c++) if (r !== top || c !== left) grid[r][c] = COVERED;
    }
  }
  return grid;
}

// The sheet as a grid. Rows are placed by their own number, so a gap between two stacked tables
// stays a gap instead of pulling the lower one up against the upper.
function sheetGrid(sheetXml, book, ctx) {
  if (!book.styles) {
    book = { strings: book.strings || [], formats: book.formats || [], styles: NO_STYLES };
  }
  const rows = new Map();
  for (const row of elements(sheetXml, 'row')) {
    const cells = [];
    for (const cell of elements(row, 'c')) {
      const at = colIndex(attr(cell, 'r') || '');
      if (at >= 0 && at < MAX_COLS * 4) cells[at] = makeCell(cell, book, ctx);
    }
    if (!cells.some((c) => textOf(c))) continue;
    rows.set(parseInt(attr(row, 'r') || '0', 10) || rows.size + 1, cells);
    if (rows.size >= MAX_ROWS) break;
  }
  if (!rows.size) return [];
  const keys = [...rows.keys()];
  const first = Math.min(...keys);
  const out = [];
  for (let r = first; r <= Math.max(...keys) && out.length < MAX_ROWS; r++) {
    const cells = rows.get(r) || [];
    out.push(Array.from({ length: cells.length }, (_, i) => cells[i] || ''));
  }
  // A row of nothing but covered cells was skipped above, so the merge is applied against the
  // rows that survived: `first` is a sheet row number, and the grid starts there.
  return applyMerges(out, sheetXml, first - 1);
}

function bookOf(absPath) {
  const zip = openZip(absPath);
  if (!zip) return null;
  const sheets = sheetParts(zip);
  if (!sheets.length) return null;
  const stylesXml = zip.text('xl/styles.xml');
  return {
    zip,
    sheets,
    strings: sharedStrings(zip),
    formats: numberFormats(stylesXml),
    styles: xlsxStyles.readStyles(stylesXml),
  };
}

const gridAt = (book, position, ctx) => {
  const n = clampPosition(position, book.sheets.length);
  const sheetXml = book.zip.text(book.sheets[n - 1].part) || '';
  return { n, name: book.sheets[n - 1].name, sheetXml, grid: sheetGrid(sheetXml, book, ctx) };
};

async function readOutline(absPath) {
  const book = bookOf(absPath);
  return book ? book.sheets.map((s, i) => ({ title: s.name, position: i + 1 })) : [];
}

async function readSection(absPath, position) {
  const book = bookOf(absPath);
  if (!book) return null;
  const { n, name, grid } = gridAt(book, position);
  const lines = grid.map((cells) => cells.map(textOf).filter(Boolean).join(' · ')).filter(Boolean);
  return { title: name, body: lines.slice(0, MAX_LINES), position: n, total: book.sheets.length };
}

async function count(absPath) {
  const zip = openZip(absPath);
  return zip ? sheetParts(zip).length : 0;
}

async function render(el, req) {
  const book = bookOf(req.abs);
  if (!req.isCurrent() || !book) return false;
  const ctx = { sheet: cssSheet('x') };
  const { name, sheetXml, grid } = gridAt(book, req.position, ctx);
  // A workbook has no header row of its own, so the first row is not promoted — that guess is
  // right for a bare list of values but wrong for a real sheet, which styles its own header.
  const html = gridToHtml(grid, { header: false, cols: xlsxStyles.columnWidths(sheetXml) });
  if (html) {
    const css = [SHEET_RULES, ctx.sheet.text()].join('\n');
    // The frame first: the sanitizer strips the class attributes every cell's formatting is
    // written against, so the inline path keeps the grid but shows none of the look.
    const framed = renderFrame(el, {
      html, css, width: req.width, zoom: req.zoom, onFail: () => { renderHtml(el, { html, width: req.width, zoom: req.zoom, css }); },
    });
    if (framed !== false) return framed;
    const done = renderHtml(el, { html, width: req.width, zoom: req.zoom, css });
    if (done !== false) return done;
  }
  // No sanitizer (the test stubs) — the same cells as flat lines.
  const lines = grid.map((cells) => cells.map(textOf).filter(Boolean).join(' · ')).filter(Boolean);
  return renderLines(el, { title: name, body: lines.slice(0, MAX_LINES), width: req.width, zoom: req.zoom });
}

module.exports = {
  id: 'xlsx',
  exts: ['xlsx', 'xlsm', 'xltx', 'xltm'],
  // Excel takes the fragment as part of the file name, exactly as Word and PowerPoint do.
  anchorKind: null,
  capabilities: { paged: true, zoomable: true, scrollable: true },
  count,
  outline: readOutline,
  render,
  readOutline,
  readSection,
  sheetParts,
  sheetGrid,
  bookOf,
  gridAt,
  colIndex,
  numberFormats,
};
