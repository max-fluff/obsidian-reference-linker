'use strict';

// Word: word/document.xml is the body. Most real documents carry no heading styles at all, so
// the outline is a bonus and the body rendered as HTML is the point.

const { openZip } = require('../zip');
const { elements, attr, textIn, decodeEntities } = require('../xml');
const { renderLines, renderHtml, renderFrame } = require('./preview');
const { clampPosition, normPath, assetSrc, escHtml, escAttr, sectionEnd } = require('./util');
const { sheet: cssSheet, pageCss, num } = require('./css');
const docxStyles = require('./docx-styles');

const MAX_LINES = 60;

const para = () => /<w:p(?=[\s>])[^>]*>[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g;
const squeeze = (s) => decodeEntities(s).replace(/\s+/g, ' ');
const clean = (s) => squeeze(s).trim();

// A relationship target resolves against the part's own folder.
function relTargets(zip) {
  const out = new Map();
  for (const r of elements(zip.text('word/_rels/document.xml.rels') || '', 'Relationship')) {
    const id = attr(r, 'Id');
    const target = attr(r, 'Target');
    if (id && target) out.set(id, normPath('word/' + target.replace(/^\/+/, '')));
  }
  return out;
}

// --- headings -------------------------------------------------------------------------------

// The styleIds that mean a heading. A localized Word translates the styleId and the UI label
// but keeps the English w:name ("heading 1"), so the name is the thing to match.
function headingStyles(stylesXml) {
  const out = new Map();
  for (const style of elements(stylesXml || '', 'w:style')) {
    const id = attr(style, 'w:styleId');
    const level = /^heading\s*([1-9])/i.exec(attr(elements(style, 'w:name')[0] || '', 'w:val') || '');
    if (id && level) out.set(id, Number(level[1]));
  }
  return out;
}

// The heading level of a paragraph, or 0. Both sources are needed: across a corpus of real
// documents most carry no heading style at all, and some mark a heading with nothing but a
// directly-applied outline level.
function headingLevel(p, styles) {
  const pPr = elements(p, 'w:pPr')[0];
  if (!pPr) return 0;
  const styleId = attr(elements(pPr, 'w:pStyle')[0] || '', 'w:val');
  if (styleId) {
    if (styles.has(styleId)) return styles.get(styleId);
    const builtin = /^heading\s*([1-9])$/i.exec(styleId);
    if (builtin) return Number(builtin[1]);
  }
  const lvl = attr(elements(pPr, 'w:outlineLvl')[0] || '', 'w:val');
  const n = lvl === null ? NaN : parseInt(lvl, 10);
  return n >= 0 && n <= 8 ? n + 1 : 0; // 9 is Word's "body text"
}

// The top-level tables, in order, with where they sit.
function tableSpans(xml) {
  const out = [];
  let at = 0;
  for (const table of elements(xml, 'w:tbl')) {
    const from = xml.indexOf(table, at);
    if (from < 0) continue;
    out.push({ from, to: from + table.length, xml: table });
    at = from + table.length;
  }
  return out;
}

// Table cells hold paragraphs too, and a cell that happens to carry a heading style is not a
// section. Blank the tables out in place, so offsets into the body still line up.
function maskTables(xml) {
  let out = xml;
  for (const s of tableSpans(xml)) out = out.slice(0, s.from) + ' '.repeat(s.to - s.from) + out.slice(s.to);
  return out;
}

// Every heading with the span of the body it opens. A heading paragraph holding nothing but a
// picture has no title, and a section with no name is worse than no section.
function headings(body, styles) {
  const masked = maskTables(body);
  const out = [];
  const re = para();
  let m;
  while ((m = re.exec(masked))) {
    const level = headingLevel(m[0], styles);
    if (!level) continue;
    const title = clean(textIn(m[0], 'w:t'));
    if (title) out.push({ from: m.index, to: re.lastIndex, title, level });
  }
  return out;
}

// --- body as HTML ---------------------------------------------------------------------------

const isOn = (rPr, tag) => docxStyles.flag(rPr, tag) === true;

// Everything the conversion needs to carry: the heading styles, the document's formatting, the
// relationship targets its pictures live at, and the stylesheet being built for it.
const context = (parts, images) => ({
  levels: parts.styles,
  styles: parts.formatting || docxStyles.readStyles(''),
  images: images || new Map(),
  sheet: cssSheet('w'),
});

const withClass = (tag, cls, inner) => '<' + tag + (cls ? ' class="' + cls + '"' : '') + '>' + inner + '</' + tag + '>';

// A run's text with its emphasis kept. Word splits a sentence across runs on every edit, so the
// text is never trimmed here — "Hello " + "world" trimmed per run welds into "Helloworld".
function runHtml(run, ctx) {
  let html = '';
  for (const drawing of elements(run, 'w:drawing')) {
    const src = ctx.images.get(attr(elements(drawing, 'a:blip')[0] || '', 'r:embed'));
    if (src) html += '<img src="' + escAttr(src) + '">';
  }
  let inner = '';
  for (const chunk of run.replace(/<w:tab\b[^>]*\/?>/g, '\t').replace(/<w:br\b[^>]*\/?>/g, '\n').split(/([\n\t])/)) {
    if (chunk === '\n') inner += '<br>';
    else if (chunk === '\t') inner += ' ';
    else inner += escHtml(squeeze(textIn(chunk, 'w:t')));
  }
  if (!inner.trim()) return html;
  const rPr = elements(run, 'w:rPr')[0] || '';
  const align = attr(elements(rPr, 'w:vertAlign')[0] || '', 'w:val');
  if (align === 'superscript') inner = '<sup>' + inner + '</sup>';
  else if (align === 'subscript') inner = '<sub>' + inner + '</sub>';
  // The tags stay alongside the class: a preview that falls back to the sanitizer loses every
  // class attribute, and <strong> is what is left of the formatting then.
  if (isOn(rPr, 'w:i')) inner = '<em>' + inner + '</em>';
  if (isOn(rPr, 'w:b')) inner = '<strong>' + inner + '</strong>';
  const cls = ctx.sheet.cls(docxStyles.characterCss(ctx.styles, rPr, attr(elements(rPr, 'w:rStyle')[0] || '', 'w:val')));
  return html + (cls ? withClass('span', cls, inner) : inner);
}

function paraHtml(p, ctx) {
  const body = elements(p, 'w:r').map((r) => runHtml(r, ctx)).join('').trim();
  if (!body) return '';
  const pPr = elements(p, 'w:pPr')[0] || '';
  const styleId = attr(elements(pPr, 'w:pStyle')[0] || '', 'w:val');
  const cls = ctx.sheet.cls(docxStyles.paragraphCss(ctx.styles, pPr, styleId));
  const level = Math.min(6, headingLevel(p, ctx.levels));
  if (level) return withClass('h' + level, cls, body);
  return withClass(elements(pPr, 'w:numPr').length ? 'li' : 'p', cls, body);
}

// A cell holds blocks, not a string: its paragraphs keep their own alignment, and a picture in a
// cell is a picture rather than nothing.
function cellHtml(cell, ctx, down) {
  const tcPr = elements(cell, 'w:tcPr')[0] || '';
  const inner = elements(cell, 'w:p').map((p) => paraHtml(p, ctx)).join('');
  const span = num(attr(elements(tcPr, 'w:gridSpan')[0] || '', 'w:val'));
  const attrs = (span && span > 1 ? ' colspan="' + span + '"' : '')
    + (down > 1 ? ' rowspan="' + down + '"' : '');
  const cls = ctx.sheet.cls(docxStyles.cellCss(tcPr));
  return '<td' + attrs + (cls ? ' class="' + cls + '"' : '') + '>' + inner + '</td>';
}

const gridSpan = (tcPr) => Math.max(1, num(attr(elements(tcPr, 'w:gridSpan')[0] || '', 'w:val')) || 1);

// Word writes a vertical merge as a run of cells down one grid column: the first says "restart",
// every one under it says nothing at all. Drawn as themselves they read as blank rows beside the
// text, so each is counted onto the cell above and then dropped.
function vertical(rows) {
  const grid = rows.map((row) => {
    let col = 0;
    return elements(row, 'w:tc').map((xml) => {
      const tcPr = elements(xml, 'w:tcPr')[0] || '';
      const merge = elements(tcPr, 'w:vMerge')[0];
      const at = col;
      col += gridSpan(tcPr);
      return {
        xml,
        col: at,
        start: !merge || attr(merge, 'w:val') === 'restart',
        merged: !!merge,
        down: 1,
      };
    });
  });
  grid.forEach((cells, r) => cells.forEach((cell) => {
    if (!cell.merged || !cell.start) return;
    for (let y = r + 1; y < grid.length; y++) {
      const below = grid[y].find((c) => c.col === cell.col);
      if (!below || !below.merged || below.start) break;
      cell.down++;
    }
  }));
  return grid;
}

// Word tables have no header row unless one is marked as repeating, so the first row is not
// promoted the way a spreadsheet's is — there the guess is right, here it invents a header.
const isHeaderRow = (row) => !!elements(elements(row, 'w:trPr')[0] || '', 'w:tblHeader')[0];

// The grid the table declares, as real column widths. Without table-layout:fixed the browser
// lays the columns out by content and the widths the document states go unread.
function colGroup(table) {
  const cols = elements(elements(table, 'w:tblGrid')[0] || '', 'w:gridCol')
    .map((c) => num(attr(c, 'w:w')))
    .filter((w) => w !== null);
  if (!cols.length) return '';
  const total = cols.reduce((a, b) => a + b, 0) || 1;
  return '<colgroup>' + cols.map((w) => '<col style="width:' + (Math.round((w / total) * 1000) / 10) + '%">').join('') + '</colgroup>';
}

function tableHtml(table, ctx) {
  const source = elements(table, 'w:tr');
  const rows = vertical(source).map((cells, r) => {
    if (!cells.length) return '';
    // A row every one of whose cells continues a merge still keeps its <tr>: dropped, the rows
    // under it slide up into the space the rowspan above already claims.
    const html = cells.filter((c) => c.start).map((c) => cellHtml(c.xml, ctx, c.down));
    return '<tr>' + (isHeaderRow(source[r]) ? html.map((c) => c.replace(/^<td/, '<th').replace(/<\/td>$/, '</th>')) : html).join('') + '</tr>';
  }).filter(Boolean);
  if (!rows.length) return '';
  const tblPr = elements(table, 'w:tblPr')[0] || '';
  const look = docxStyles.tableCss(ctx.styles, tblPr);
  const classes = [
    ctx.sheet.cls(Object.assign({ 'table-layout': 'fixed', width: '100%' }, look.table)),
    ctx.sheet.cls(look.cell, 'td'),
    ctx.sheet.cls(look.cell, 'th'),
  ].filter(Boolean).join(' ');
  return '<table' + (classes ? ' class="' + classes + '"' : '') + '>' + colGroup(table) + rows.join('') + '</table>';
}

// A run of the body to HTML, blocks in the order they appear. Tables are located separately and
// merged back by offset — walking paragraphs alone would pull a table's cells out of it and
// spill them into the surrounding text.
function toHtml(xml, ctxOrLevels, images) {
  // Called with a heading-level map by the text-only callers, and with a full context by render.
  const ctx = ctxOrLevels && ctxOrLevels.sheet
    ? ctxOrLevels
    : context({ styles: ctxOrLevels || new Map() }, images);
  const blocks = tableSpans(xml).map((s) => ({ at: s.from, html: tableHtml(s.xml, ctx) }));
  const re = para();
  let m;
  // Masked once, not once per match: rebuilt inside the condition it is a fresh copy of the
  // whole body for every paragraph, and a long document hangs the hover thread for seconds.
  const masked = maskTables(xml);
  while ((m = re.exec(masked))) blocks.push({ at: m.index, html: paraHtml(m[0], ctx) });
  return blocks.sort((a, b) => a.at - b.at).map((b) => b.html).join('')
    .replace(/(?:<li[^>]*>[\s\S]*?<\/li>)+/g, (run) => '<ul>' + run + '</ul>');
}

// --- reading ---------------------------------------------------------------------------------

function partsOf(absPath) {
  const zip = openZip(absPath);
  const body = zip && zip.text('word/document.xml');
  if (!body) return null;
  const stylesXml = zip.text('word/styles.xml');
  return { zip, body, styles: headingStyles(stylesXml), formatting: docxStyles.readStyles(stylesXml) };
}

// A "document" that is only a wrapper around an embedded HTML file — what saving a web page as
// .docx produces. The chunk is the whole of the content.
function altChunk(zip, body) {
  const id = attr(elements(body, 'w:altChunk')[0] || '', 'r:id');
  const target = id && relTargets(zip).get(id);
  const buf = target && zip.read(target);
  if (!buf) return null;
  const html = buf.toString('utf8');
  const inner = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html);
  return inner ? inner[1] : html;
}

async function readOutline(absPath) {
  const parts = partsOf(absPath);
  if (!parts) return [];
  return headings(parts.body, parts.styles).map((h, i) => ({ title: h.title, position: i + 1 }));
}

// The body slice section `n` covers — its heading up to the next — or the whole of it when the
// document has no headings, which is the common case.
function sectionXml(body, styles, position) {
  const hs = headings(body, styles);
  if (!hs.length) return { title: '', xml: body, total: 1, n: 1 };
  const n = clampPosition(position, hs.length);
  return {
    title: hs[n - 1].title,
    xml: body.slice(hs[n - 1].from, sectionEnd(hs, n, body.length)),
    total: hs.length,
    n,
  };
}

async function readSection(absPath, position) {
  const parts = partsOf(absPath);
  if (!parts) return null;
  const sec = sectionXml(parts.body, parts.styles, position);
  const re = para();
  const body = [];
  let m;
  while ((m = re.exec(sec.xml)) && body.length <= MAX_LINES) {
    const line = clean(textIn(m[0], 'w:t'));
    if (line && line !== sec.title) body.push(line);
  }
  return { title: sec.title, body: body.slice(0, MAX_LINES), position: sec.n, total: sec.total };
}

async function render(el, req) {
  const parts = partsOf(req.abs);
  if (!req.isCurrent() || !parts) return false;
  const loadImage = (src) => parts.zip.read(assetSrc(src));

  const chunk = altChunk(parts.zip, parts.body);
  if (chunk) {
    const done = renderHtml(el, { html: chunk, width: req.width, loadImage });
    if (done !== false) return done;
  } else {
    const page = documentPage(parts, req.position, req.width, req.view);
    // The frame first: the sanitizer strips the class attributes the document's own formatting
    // is written against, so inlining it keeps the structure and loses the typography.
    const framed = renderFrame(el, {
      html: page.html, css: page.css, width: req.width, loadImage, onFail: () => {
        renderHtml(el, { html: page.html, width: req.width, loadImage });
      },
    });
    if (framed !== false) return framed;
    const done = renderHtml(el, { html: page.html, width: req.width, loadImage });
    if (done !== false) return done;
  }

  // No sanitizer (the test stubs) — the same content as flat lines.
  const sec = await readSection(req.abs, req.position);
  if (!req.isCurrent() || !sec) return false;
  return renderLines(el, { title: sec.title, body: sec.body, width: req.width });
}

// Rules the document does not state but a page implies, kept apart from the translated CSS so it
// is obvious which of the two a given declaration came from.
const PAGE_RULES = [
  'body{margin:0;background:transparent}',
  '.page table{border-collapse:collapse}',
  '.page td,.page th{padding:2pt 4pt;vertical-align:top}',
  '.page td>p:only-child,.page th>p:only-child{margin:0}',
  '.page img{max-width:100%;height:auto}',
  '.page ul{margin:0;padding-left:1.5em}',
].join('\n');

// The section drawn on the page the document declares, at that page's true size, and shrunk to
// the width there is room for. Laying it out small instead would change every proportion the
// author chose, which is the whole of what a document's design is.
function documentPage(parts, position, width, view) {
  const sec = sectionXml(parts.body, parts.styles, position);
  const ctx = context(parts, relTargets(parts.zip));
  const body = toHtml(sec.xml, ctx);
  const page = pageCss(docxStyles.pageOf(parts.body), width, view);
  return {
    html: '<div class="page">' + body + '</div>',
    css: [PAGE_RULES, page.css, 'html{zoom:' + page.zoom + '}', ctx.sheet.text()].filter(Boolean).join('\n'),
  };
}

module.exports = {
  // A macro-enabled document and a template are the same package: word/document.xml, read the
  // same way. Only the .doc of old Word is a different format, and it is not one of these.
  exts: ['docx', 'docm', 'dotx', 'dotm'],
  // Word takes the fragment as part of the file name and then opens nothing at all, exactly as
  // PowerPoint does, so a link into a .docx carries no anchor.
  anchorKind: null,
  outline: readOutline,
  render,
  readOutline,
  readSection,
  headingStyles,
  headingLevel,
  headings,
  toHtml,
  documentPage,
  sectionXml,
  altChunk,
  partsOf,
};
