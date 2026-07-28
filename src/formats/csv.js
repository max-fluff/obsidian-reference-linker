'use strict';

// Comma-separated values: a text file that is really a table, so it renders as one rather than
// as its raw lines. No outline — a CSV has no sections — so it is a file entry with a preview.

const fs = require('fs');
const { renderLines, renderHtml } = require('./preview');
const { gridToHtml, MAX_ROWS, MAX_COLS } = require('./util');
const { SHEET_RULES } = require('./css');

const MAX_LINES = 60;

// The separator a file uses, guessed from the first line: whichever of tab, semicolon or comma
// appears most. A `.tsv` is tabs, European exports are semicolons, and both are common enough
// that assuming a comma renders them as one long column.
function delimiter(text, ext) {
  if (ext === 'tsv') return '\t';
  const line = text.slice(0, text.indexOf('\n') + 1 || text.length);
  const count = (ch) => line.split(ch).length - 1;
  const tabs = count('\t');
  const semis = count(';');
  const commas = count(',');
  if (tabs >= semis && tabs >= commas && tabs) return '\t';
  if (semis > commas) return ';';
  return ',';
}

// A row-oriented parse that respects quotes: a quoted field may hold the delimiter, a newline,
// and a doubled "" for a literal quote. A hand-split on the delimiter tears every such field.
function parse(text, sep) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === sep) {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
      if (rows.length > MAX_ROWS + 1) break;
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  // A trailing newline leaves one empty row; a file of nothing but blank lines has no grid.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function grid(absPath, ext) {
  let text;
  try { text = fs.readFileSync(absPath, 'utf8').replace(/^﻿/, ''); } catch { return null; }
  if (!text.trim()) return [];
  const rows = parse(text, delimiter(text, ext));
  return rows.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS).map((c) => c.trim()));
}

async function render(el, req) {
  const rows = grid(req.abs, req.ext);
  if (!req.isCurrent() || !rows) return false;
  // A CSV's first row is nearly always a header, unlike a spreadsheet's — the format has no
  // other place to name its columns.
  const html = gridToHtml(rows, { header: rows.length > 1 });
  if (html) {
    const done = renderHtml(el, { html, width: req.width, css: SHEET_RULES });
    if (done !== false) return done;
  }
  const lines = rows.map((r) => r.filter(Boolean).join(' · ')).filter(Boolean);
  return renderLines(el, { title: '', body: lines.slice(0, MAX_LINES), width: req.width });
}

module.exports = {
  exts: ['csv', 'tsv'],
  // A CSV is opened in whatever the OS hands .csv to; there is no page to land on.
  anchorKind: null,
  render,
  parse,
  delimiter,
  grid,
};
