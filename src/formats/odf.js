'use strict';

// OpenDocument (LibreOffice/OpenOffice): a zip whose content.xml holds the body. A text
// document renders as HTML, a spreadsheet as a table, a deck and a drawing as pages. No OS
// anchor: the fragment doesn't survive the viewer.

const { openZip } = require('../zip');
const { elements, elementsOf, attr, decodeEntities } = require('../xml');
const { renderLines, renderHtml, renderFrame } = require('./preview');
const { clampPosition, assetSrc, escAttr, gridToHtml, cellText: textOf, spanning, isCovered, COVERED, sectionEnd, MAX_ROWS, MAX_COLS } = require('./util');
const { sheet: cssSheet, pageCss, pt, SHEET_RULES } = require('./css');
const odfStyles = require('./odf-styles');

const MAX_LINES = 60;

// A template holds the same content.xml as the document it makes; only the mimetype differs. A
// drawing is a list of draw:page, which is what a deck is too.
const KIND = { ott: 'odt', ots: 'ods', otp: 'odp', odg: 'odp', otg: 'odp' };
const kindOf = (ext) => KIND[String(ext || '').toLowerCase()] || ext;

// A drawing reads as a deck, with one difference: its pages are named in the file and shown by
// name, where a slide's draw:name is the untouched "page1" every deck carries.
const DRAWING = new Set(['odg', 'otg']);
const named = (ext) => DRAWING.has(String(ext || '').toLowerCase());

const without = (xml, tag) => elements(xml, tag).reduce((acc, src) => acc.replace(src, ''), xml);

// Subtrees whose text belongs to the machinery rather than to the document. Dropped whole: a
// comment left in place renders its author and timestamp mid-sentence.
const ASIDES = ['office:annotation', 'office:annotation-end', 'text:tracked-changes', 'text:note'];

const readable = (xml) => (xml ? ASIDES.reduce(without, xml) : xml);

function contentOf(absPath) {
  const zip = openZip(absPath);
  return zip ? readable(zip.text('content.xml')) : null;
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
// The position counts every heading, not every named one: a document spaced out with empty
// headings would otherwise send each entry to the section before it.
function odtOutline(xml) {
  const out = [];
  let m;
  let n = 0;
  const re = /<text:h\b[^>]*>([\s\S]*?)<\/text:h>/g;
  while ((m = re.exec(xml))) {
    n += 1;
    const title = decodeEntities(m[1].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
    if (title) out.push({ title, position: n });
  }
  return out;
}

// A slide's title and body. The whole slide is read, not shape by shape — a deck converted from
// PowerPoint keeps its text in draw:custom-shape, and a draw:frame-only reader finds nothing at
// all in one. The title is the frame marked presentation:class="title" wherever it sits (frame
// order is not guaranteed); its own lines are then taken back out of the body.
function slideText(slide) {
  const body = textLines(slide);
  const titled = elements(slide, 'draw:frame')
    .find((frame) => (attr(frame, 'presentation:class') || '') === 'title');
  const titleLines = titled ? textLines(titled) : [];
  for (const line of titleLines) {
    const at = body.indexOf(line);
    if (at >= 0) body.splice(at, 1);
  }
  return { title: titleLines.join(' ') || body.shift() || '', body };
}

// A drawing falls back to the page's own name, which is what its tabs show. A deck must not:
// there draw:name is the untouched "page1" that every slide carries.
function pageOutline(xml, named) {
  const out = [];
  elements(xml, 'draw:page').forEach((page, i) => {
    const title = slideText(page).title || (named ? attr(page, 'draw:name') || '' : '');
    if (title) out.push({ title, position: i + 1 });
  });
  return out;
}

function odsOutline(xml) {
  const out = [];
  elements(xml, 'table:table').forEach((table, i) => {
    const name = attr(table, 'table:name');
    if (name) out.push({ title: name, position: i + 1 });
  });
  return out;
}

const cellText = (cell) => textLines(cell).join(' ').trim();
const repeat = (source, name) => Math.max(1, parseInt(attr(source, name) || '1', 10) || 1);

// A sheet's cells as a grid, its run-length-encoded repeats expanded but bounded — ODS pads
// rows and columns out to the used range (and sometimes far past it) with repeat counts. With a
// ctx each cell carries the class its own style translates to.
function sheetGrid(tableXml, ctx) {
  const rows = [];
  for (const row of elements(tableXml, 'table:table-row')) {
    if (rows.length >= MAX_ROWS) break;
    const cells = [];
    // Covered cells are read alongside the ordinary ones: ODF writes a place-holder for each
    // one a merge swallows, and skipping them pulls the rest of the row a column to the left.
    for (const { tag, xml } of elementsOf(row, ['table:covered-table-cell', 'table:table-cell'])) {
      const covered = tag === 'table:covered-table-cell';
      const text = cellText(xml);
      const cls = ctx && ctx.sheet ? ctx.sheet.cls(odfStyles.styleCss(ctx.styles, ownAttr(xml, 'table:style-name'))) : '';
      const across = repeat(xml, 'table:number-columns-spanned');
      const down = repeat(xml, 'table:number-rows-spanned');
      let value = cls ? { text, cls } : text;
      if (covered) value = COVERED;
      else if (across > 1 || down > 1) value = spanning(value, across, down);
      for (let i = 0; i < repeat(xml, 'table:number-columns-repeated') && cells.length <= MAX_COLS; i++) cells.push(value);
    }
    for (let r = 0; r < repeat(row, 'table:number-rows-repeated') && rows.length < MAX_ROWS; r++) rows.push(cells.slice());
  }
  // Trim to the used range: the last row/column that holds anything.
  let lastRow = -1;
  let lastCol = -1;
  rows.forEach((cs, ri) => cs.forEach((c, ci) => {
    if (textOf(c) || isCovered(c)) { lastRow = Math.max(lastRow, ri); lastCol = Math.max(lastCol, ci); }
  }));
  if (lastRow < 0) return [];
  return rows.slice(0, lastRow + 1).map((cs) => cs.slice(0, Math.min(lastCol + 1, MAX_COLS)));
}

// The width of each column, the repeats expanded the same way the cells' are.
function sheetColumns(tableXml, ctx) {
  const out = [];
  for (const col of elements(tableXml, 'table:table-column')) {
    const width = odfStyles.styleCss(ctx.styles, ownAttr(col, 'table:style-name')).width || null;
    for (let i = 0; i < repeat(col, 'table:number-columns-repeated') && out.length <= MAX_COLS; i++) {
      out.push(width ? { width } : {});
    }
  }
  return out;
}

// A sheet is a grid of values, so no row of it is promoted to a header — a spreadsheet says
// which of its rows is one by formatting it, exactly as a workbook does.
const sheetTable = (tableXml, ctx) => gridToHtml(sheetGrid(tableXml, ctx), {
  header: false,
  cols: ctx ? sheetColumns(tableXml, ctx) : [],
});

// --- odt as structured HTML ---------------------------------------------------------------

const cleanTitle = (hXml) => decodeEntities(hXml.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

// An element's own attribute, read off its opening tag. `attr` scans whatever it is given, so
// handing it a whole block finds the first matching attribute anywhere inside — a paragraph
// would take the style name of the first span within it.
const openingTag = (src) => src.slice(0, (src.indexOf('>') + 1) || src.length);
const ownAttr = (src, name) => attr(openingTag(src), name);

const headingLevel = (src) => Math.min(6, Math.max(1, parseInt(ownAttr(src, 'text:outline-level') || '1', 10) || 1));

// Each heading with the span of content.xml it opens, so a section can be sliced out.
function odtHeadings(xml) {
  const out = [];
  const re = /<text:h\b[^>]*>[\s\S]*?<\/text:h>/g;
  let m;
  while ((m = re.exec(xml))) {
    out.push({ from: m.index, to: re.lastIndex, title: cleanTitle(m[0]), level: headingLevel(m[0]) });
  }
  return out;
}

// ODF inline runs to HTML: keep the already-encoded text, turn breaks/tabs/spaces into their
// HTML equivalents, and carry a span's own formatting across as a class before the rest of the
// ODF tags are dropped.
const inlineHtml = (s, ctx) => s
  .replace(/<text:line-break\b[^>]*\/?>/g, '<br>')
  .replace(/<text:(?:tab|s)\b[^>]*\/?>/g, ' ')
  .replace(/<text:span\b([^>]*)>/g, (m, a) => {
    const cls = ctx && ctx.sheet ? ctx.sheet.cls(odfStyles.styleCss(ctx.styles, attr(m, 'text:style-name'))) : '';
    return cls ? '<span class="' + cls + '">' : '<span>';
  })
  .replace(/<\/text:span>/g, '</span>')
  .replace(/<(?!\/?(?:br|img|span)\b)[^>]+>/gi, '')
  // A span whose style said nothing is just a wrapper; unwrap it rather than leave the tag.
  .replace(/<span>([\s\S]*?)<\/span>/g, '$1')
  // All of it, newlines included: ODF pretty-prints inside a paragraph and writes a space it
  // means to keep as <text:s/>, so raw whitespace is never significant.
  .replace(/\s+/g, ' ')
  .trim();

// The blocks a document is built from, in the order they appear. Nothing else is emitted —
// keeping the text of whatever is left over is how a document's own markup leaks into it.
const BLOCK = ['text:h', 'text:p', 'text:list', 'table:table'];

function blocks(xml) {
  const spans = [];
  for (const tag of BLOCK) {
    let at = 0;
    for (const src of elements(xml, tag)) {
      const from = xml.indexOf(src, at);
      if (from < 0) continue;
      spans.push({ from, to: from + src.length, tag, src });
      at = from + src.length;
    }
  }
  // Outermost first at the same offset, then skip anything a taken block already covers: a
  // list's paragraphs belong to the list, not beside it.
  spans.sort((a, b) => a.from - b.from || b.to - a.to);
  const out = [];
  let end = -1;
  for (const s of spans) if (s.from >= end) { out.push(s); end = s.to; }
  return out;
}

const openTag = (tag, cls) => '<' + tag + (cls ? ' class="' + cls + '"' : '') + '>';

// A table in a text document, with the borders and fills its cells carry. A spreadsheet stays a
// plain grid — there the values are the point — but in a document the table is part of the page.
function tableHtml(table, ctx) {
  const rows = elements(table, 'table:table-row').map((row) => {
    const cells = elements(row, 'table:table-cell').map((cell) => {
      const cls = ctx.sheet.cls(odfStyles.styleCss(ctx.styles, ownAttr(cell, 'table:style-name')));
      const inner = blocks(cell).map((b) => blockHtml(b, ctx)).join('');
      const span = (name, as) => {
        const n = parseInt(ownAttr(cell, name) || '1', 10) || 1;
        return n > 1 ? ' ' + as + '="' + n + '"' : '';
      };
      return '<td' + span('table:number-columns-spanned', 'colspan')
        + span('table:number-rows-spanned', 'rowspan') + (cls ? ' class="' + cls + '"' : '') + '>'
        + inner + '</td>';
    });
    return cells.length ? '<tr>' + cells.join('') + '</tr>' : '';
  }).filter(Boolean);
  return rows.length ? '<table>' + rows.join('') + '</table>' : '';
}

function blockHtml(span, ctx) {
  const { tag, src } = span;
  if (tag === 'table:table') return ctx && ctx.sheet ? tableHtml(src, ctx) : (sheetTable(src) || '');
  if (tag === 'text:list') {
    const items = elements(src, 'text:list-item')
      .map((item) => blocks(item).map((b) => blockHtml(b, ctx)).join(''))
      .filter(Boolean);
    return items.length ? '<ul>' + items.map((i) => '<li>' + i + '</li>').join('') + '</ul>' : '';
  }
  const inner = inlineHtml(src.replace(/^<[^>]*>/, '').replace(/<\/[^>]*>$/, ''), ctx);
  if (!inner) return '';
  const cls = ctx && ctx.sheet ? ctx.sheet.cls(odfStyles.styleCss(ctx.styles, ownAttr(src, 'text:style-name'))) : '';
  const name = tag === 'text:h' ? 'h' + headingLevel(src) : 'p';
  return openTag(name, cls) + inner + '</' + name + '>';
}

// A run of ODF text markup to HTML: headings, paragraphs, lists, tables and images become their
// HTML counterparts and everything else is dropped. Not a full ODF renderer — enough structure
// that a document reads as a document, not a list of lines.
function odtToHtml(xml, ctx) {
  const body = readable(xml)
    .replace(/<draw:image\b[^>]*\/?>/g, (m) => {
      const href = attr(m, 'xlink:href');
      return href ? '<img src="' + escAttr(href) + '">' : '';
    });
  return blocks(body).map((b) => blockHtml(b, ctx)).join('');
}

// The content.xml slice for section `n` — its heading up to the next — or the whole body when
// the document has no headings.
function odtSectionXml(xml, position) {
  const hs = odtHeadings(xml);
  if (!hs.length) return { title: '', xml, total: 1, n: 1 };
  const n = clampPosition(position, hs.length);
  return {
    title: hs[n - 1].title,
    xml: xml.slice(hs[n - 1].from, sectionEnd(hs, n, xml.length)),
    total: hs.length,
    n,
  };
}

function outlineFor(ext, xml) {
  if (kindOf(ext) === 'odp') return pageOutline(xml, named(ext));
  if (kindOf(ext) === 'ods') return odsOutline(xml);
  return odtOutline(xml);
}

async function readOutline(absPath, ext) {
  const xml = contentOf(absPath);
  return xml ? outlineFor(ext, xml) : [];
}

// The text of one section: an odt heading's run up to the next, a slide's frames, a sheet's
// cells.
async function readSection(absPath, ext, position) {
  const xml = contentOf(absPath);
  if (!xml) return null;

  if (kindOf(ext) === 'odp') {
    const slides = elements(xml, 'draw:page');
    if (!slides.length) return null;
    const n = clampPosition(position, slides.length);
    const { title, body } = slideText(slides[n - 1]);
    return {
      title: title || (named(ext) ? attr(slides[n - 1], 'draw:name') || '' : ''),
      body: body.slice(0, MAX_LINES),
      position: n,
      total: slides.length,
    };
  }
  if (kindOf(ext) === 'ods') {
    const tables = elements(xml, 'table:table');
    if (!tables.length) return null;
    const n = clampPosition(position, tables.length);
    return { title: attr(tables[n - 1], 'table:name') || '', body: textLines(tables[n - 1]).slice(0, MAX_LINES), position: n, total: tables.length };
  }

  if (!odtHeadings(xml).length) return { title: '', body: textLines(xml).slice(0, MAX_LINES), position: 1, total: 1 };
  const sec = odtSectionXml(xml, position);
  // The heading is dropped by name, not by position: an untitled one contributes no line at
  // all, and taking the first line off regardless eats the section's opening paragraph.
  const lines = textLines(sec.xml);
  if (lines[0] === sec.title) lines.shift();
  return { title: sec.title, body: lines.slice(0, MAX_LINES), position: sec.n, total: sec.total };
}

async function count(absPath, ext) {
  const xml = contentOf(absPath);
  if (!xml) return 0;
  if (kindOf(ext) === 'odp') return elements(xml, 'draw:page').length;
  if (kindOf(ext) === 'ods') return elements(xml, 'table:table').length;
  return odtHeadings(xml).length || 1;
}

// Images in an odt live in the zip (the href is a member path like "Pictures/1000.png").
const imageLoader = (zip) => (src) => (zip ? zip.read(assetSrc(src)) : null);

// Rules the document does not state but a page implies, kept apart from the translated CSS so
// which of the two a declaration came from stays obvious.
const PAGE_RULES = [
  'body{margin:0;background:transparent}',
  '.page table{border-collapse:collapse}',
  '.page td,.page th{border:1px solid #b9b9b9;padding:2pt 4pt;vertical-align:top}',
  '.page img{max-width:100%;height:auto}',
  '.page ul{margin:0;padding-left:1.5em}',
].join('\n');

// --- a slide, laid out ------------------------------------------------------------------------

const SHAPE = ['draw:frame', 'draw:custom-shape', 'draw:text-box', 'draw:g'];

const SLIDE_RULES = [
  'body{margin:0;background:transparent}',
  '.slide{position:relative;overflow:hidden;background:#ffffff;color:#1a1a1a;margin:0 auto;'
    + 'box-shadow:0 0 0 1pt rgba(0,0,0,.15)}',
  '.slide p{margin:0}',
  '.slide img{display:block;width:100%;height:100%;object-fit:contain}',
].join('\n');

// A shape's own place on the slide. ODF states it in the units the author's application chose,
// which are CSS units already once they are in points.
function shapeBox(shape) {
  const box = {
    left: odfStyles.length(ownAttr(shape, 'svg:x')),
    top: odfStyles.length(ownAttr(shape, 'svg:y')),
    width: odfStyles.length(ownAttr(shape, 'svg:width')),
    height: odfStyles.length(ownAttr(shape, 'svg:height')),
  };
  return box.left && box.top && box.width ? box : null;
}

function shapeHtml(shape, ctx) {
  const box = shapeBox(shape);
  if (!box) return '';
  const image = elements(shape, 'draw:image')[0];
  const href = image && attr(openingTag(image), 'xlink:href');
  const css = Object.assign({ position: 'absolute', overflow: 'hidden' }, {
    left: box.left, top: box.top, width: box.width, height: box.height || null,
  }, odfStyles.styleCss(ctx.styles, ownAttr(shape, 'draw:style-name')));
  const cls = ctx.sheet.cls(css);
  const inner = href
    ? '<img src="' + escAttr(href) + '">'
    : blocks(shape).map((b) => blockHtml(b, ctx)).join('');
  return inner ? '<div class="' + cls + '">' + inner + '</div>' : '';
}

// The slide drawn at the size the deck declares, every shape where the deck puts it. A slide is
// a layout, and text alone throws that away.
function slidePage(zip, xml, position, width) {
  const slides = elements(xml, 'draw:page');
  if (!slides.length) return null;
  const page = odfStyles.pageOf(zip.text('styles.xml'));
  if (!page) return null;
  const slide = slides[clampPosition(position, slides.length) - 1];
  const ctx = { styles: odfStyles.readStyles(zip.text('content.xml'), zip.text('styles.xml')), sheet: cssSheet('o') };
  const shapes = SHAPE.flatMap((tag) => elements(slide, tag))
    .map((s) => ({ at: slide.indexOf(s), html: shapeHtml(s, ctx) }))
    .filter((s) => s.html)
    .sort((a, b) => a.at - b.at)
    .map((s) => s.html)
    .join('');
  return {
    html: '<div class="slide">' + shapes + '</div>',
    css: [SLIDE_RULES,
      '.slide{width:' + pt(page.width) + ';height:' + pt(page.height) + '}',
      'html{zoom:' + Math.min(1, width / (page.width * (96 / 72))) + '}',
      ctx.sheet.text()].join('\n'),
  };
}

// The section drawn on the sheet the document declares, at that sheet's true size and shrunk to
// the width there is room for, so the proportions stay the author's.
function documentPage(zip, xml, position, width, view) {
  const sec = odtSectionXml(xml, position);
  const ctx = { styles: odfStyles.readStyles(zip.text('content.xml'), zip.text('styles.xml')), sheet: cssSheet('o') };
  const body = odtToHtml(sec.xml, ctx);
  const page = pageCss(odfStyles.pageOf(zip.text('styles.xml')), width, view);
  return {
    html: '<div class="page">' + body + '</div>',
    css: [PAGE_RULES, page.css, 'html{zoom:' + page.zoom + '}', ctx.sheet.text()].filter(Boolean).join('\n'),
  };
}

async function render(el, req) {
  const kind = kindOf(req.ext);
  const zoom = req.zoom || 1;
  const width = kind === 'ods' ? req.width : req.width * zoom;
  // A spreadsheet is a grid, not a list of values; a text document is structure, not lines.
  // Both render as HTML when the app can, and fall back to the flat text otherwise (the test
  // stubs have no sanitizer).
  if (kind === 'ods') {
    const zip = openZip(req.abs);
    const xml = zip ? readable(zip.text('content.xml')) : null;
    const tables = xml ? elements(xml, 'table:table') : [];
    if (req.isCurrent() && tables.length) {
      const ctx = { styles: odfStyles.readStyles(zip.text('content.xml'), zip.text('styles.xml')), sheet: cssSheet('o') };
      const html = sheetTable(tables[clampPosition(req.position, tables.length) - 1], ctx);
      if (html) {
        const css = [SHEET_RULES, ctx.sheet.text()].join('\n');
        // The frame first, for the same reason odt uses it: the sanitizer strips the class
        // attributes every cell's formatting is written against.
        const framed = renderFrame(el, {
          html, css, width, zoom, onFail: () => { renderHtml(el, { html, width, zoom, css }); },
        });
        if (framed !== false) return framed;
        const done = renderHtml(el, { html, width, zoom, css });
        if (done !== false) return done;
      }
    }
  }
  if (kind === 'odt') {
    const zip = openZip(req.abs);
    const xml = zip ? readable(zip.text('content.xml')) : null;
    if (req.isCurrent() && xml) {
      const page = documentPage(zip, xml, req.position, width, req.view);
      const loadImage = imageLoader(zip);
      // The frame first: the sanitizer strips the class attributes the document's own
      // formatting is written against, and inlining keeps the structure but loses it.
      const framed = renderFrame(el, {
        html: page.html, css: page.css, width, grow: zoom > 1, page: true, loadImage,
        onFail: () => { renderHtml(el, { html: page.html, width, loadImage }); },
      });
      if (framed !== false) return framed;
      const done = renderHtml(el, { html: page.html, width, loadImage });
      if (done !== false) return done;
    }
  }

  if (kind === 'odp') {
    const zip = openZip(req.abs);
    const xml = zip ? readable(zip.text('content.xml')) : null;
    const page = xml && req.isCurrent() ? slidePage(zip, xml, req.position, width) : null;
    if (page) {
      const loadImage = imageLoader(zip);
      const flat = () => readSection(req.abs, req.ext, req.position)
        .then((sec) => sec && renderLines(el, { title: sec.title, body: sec.body, width: req.width, zoom }));
      // A frame the app refuses must still leave something readable: renderFrame reports its
      // own success before the document has laid out, so the tail below is never reached.
      const framed = renderFrame(el, {
        html: page.html, css: page.css, width, grow: zoom > 1, page: true, loadImage, onFail: flat,
      });
      if (framed !== false) return framed;
    }
  }

  const sec = await readSection(req.abs, req.ext, req.position);
  if (!req.isCurrent() || !sec) return false;
  return renderLines(el, { title: sec.title, body: sec.body, width: req.width, zoom });
}

module.exports = {
  id: 'odf',
  exts: ['odt', 'ods', 'odp', 'odg', 'ott', 'ots', 'otp', 'otg'],
  anchorKind: null,
  capabilities: (ext) => ({ paged: true, zoomable: true, scrollable: kindOf(ext) !== 'odp' }),
  count,
  outline: (abs, ext) => readOutline(abs, ext),
  render,
  readOutline,
  readSection,
  sheetTable,
  sheetGrid,
  odtToHtml,
  odtSectionXml,
  documentPage,
  slidePage,
};
