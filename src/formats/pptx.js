'use strict';

// PowerPoint: slides are pages, so the whole page/section model carries over from PDF
// unchanged. Titles come from the title placeholder, order from sldIdLst.

const { openZip } = require('../zip');
const { elements, elementsOf, attr, textIn } = require('../xml');
const { renderLines, renderFrame } = require('./preview');
const { clampPosition, normPath, assetSrc, escAttr, escHtml } = require('./util');
const { sheet: cssSheet, pt } = require('./css');
const pptxStyles = require('./pptx-styles');

const SLIDE_RE = /^ppt\/slides\/slide(\d+)\.xml$/;
const TITLE_PH = new Set(['title', 'ctrTitle']);

// A relationship target is relative to ppt/, and PowerPoint writes some as "../slides/…".
const resolveTarget = (target) => normPath('ppt/' + String(target).replace(/^\/+/, ''));

// Presentation order, not file order: slide7.xml may well be the second slide shown.
function slideParts(zip) {
  const pres = zip.text('ppt/presentation.xml');
  const rels = zip.text('ppt/_rels/presentation.xml.rels');
  if (pres && rels) {
    const targets = new Map();
    for (const r of elements(rels, 'Relationship')) {
      const id = attr(r, 'Id');
      const tgt = attr(r, 'Target');
      if (id && tgt) targets.set(id, resolveTarget(tgt));
    }
    const lst = elements(pres, 'p:sldIdLst')[0];
    if (lst) {
      const out = [];
      for (const s of elements(lst, 'p:sldId')) {
        const tgt = targets.get(attr(s, 'r:id'));
        if (tgt && zip.has(tgt)) out.push(tgt);
      }
      if (out.length) return out;
    }
  }
  return zip.names()
    .filter((n) => SLIDE_RE.test(n))
    .sort((a, b) => Number(SLIDE_RE.exec(a)[1]) - Number(SLIDE_RE.exec(b)[1]));
}

// A line break lives inside a paragraph, so splitting on it is what keeps the runs either
// side apart — joining them blind turns "Pan & Zoom" + "Note:" into "Pan & ZoomNote:".
const BR = /<a:br(?:\s[^>]*)?\/>|<a:br(?:\s[^>]*)?>[\s\S]*?<\/a:br>/;

const paragraphs = (source) => elements(source, 'a:p')
  .flatMap((p) => p.split(BR))
  .map((chunk) => textIn(chunk, 'a:t').replace(/\s+/g, ' ').trim())
  .filter(Boolean);

function shapeIsTitle(sp) {
  const ph = elements(elements(sp, 'p:nvSpPr')[0] || '', 'p:ph')[0];
  return !!ph && TITLE_PH.has(attr(ph, 'type') || '');
}

function slideTitle(xml) {
  for (const sp of elements(xml, 'p:sp')) {
    if (!shapeIsTitle(sp)) continue;
    const text = paragraphs(sp).join(' ');
    if (text) return text;
  }
  return paragraphs(xml)[0] || '';
}

// Title plus the body text of every non-title shape, for the preview.
function slideText(xml) {
  const title = slideTitle(xml);
  const body = [];
  for (const sp of elements(xml, 'p:sp')) {
    if (shapeIsTitle(sp)) continue;
    for (const line of paragraphs(sp)) if (line !== title) body.push(line);
  }
  return { title, body };
}

function readSlides(absPath) {
  const zip = openZip(absPath);
  if (!zip) return null;
  const parts = slideParts(zip);
  if (!parts.length) return null;
  return { zip, parts };
}

// [{ title, position }] over the slides that have a title — an untitled slide would index as an
// empty name, which no query could ever reach.
async function readOutline(absPath) {
  const doc = readSlides(absPath);
  if (!doc) return [];
  const out = [];
  doc.parts.forEach((part, i) => {
    const xml = doc.zip.text(part);
    if (!xml) return;
    const title = slideTitle(xml);
    if (title) out.push({ title, position: i + 1 });
  });
  return out;
}

async function readSlide(absPath, position) {
  const doc = readSlides(absPath);
  if (!doc) return null;
  const n = clampPosition(position, doc.parts.length);
  const xml = doc.zip.text(doc.parts[n - 1]);
  if (!xml) return null;
  return { ...slideText(xml), position: n, total: doc.parts.length };
}

// --- the slide as it is laid out ---------------------------------------------------------------

// What an element contains, without its own tags.
const innerXml = (src) => {
  const open = src.indexOf('>');
  const close = src.lastIndexOf('</');
  return open < 0 || close <= open ? '' : src.slice(open + 1, close);
};

const phKey = (sp) => {
  const ph = elements(elements(sp, 'p:nvSpPr')[0] || '', 'p:ph')[0];
  return ph ? (attr(ph, 'type') || 'body') + '#' + (attr(ph, 'idx') || '0') : null;
};

// Where each placeholder sits, so a slide shape that names one but states no position of its own
// can be given the place it is meant to have. Sources are read master first, then layout: a
// layout commonly restates neither the position nor the size, and stopping at it loses the shape.
function layoutBoxes(...sources) {
  const out = new Map();
  for (const source of sources) {
    for (const sp of elements(source || '', 'p:sp')) {
      const key = phKey(sp);
      if (!key) continue;
      const previous = out.get(key) || {};
      out.set(key, {
        box: pptxStyles.shapeBox(sp) || previous.box,
        lstStyle: elements(sp, 'a:lstStyle')[0] || previous.lstStyle || '',
      });
    }
  }
  return out;
}

const phType = (sp) => {
  const ph = elements(elements(sp, 'p:nvSpPr')[0] || '', 'p:ph')[0];
  return ph ? attr(ph, 'type') || '' : null;
};

// The run properties actually in force: the master's for this kind of placeholder, then the
// layout's, then the shape's own list style, then the run. Only a ninth of the runs in a real
// deck state their own size, so a reader that stops at the run sizes almost nothing.
//
// All of it is the same for every paragraph and run of one shape, so it is resolved once:
// per run it re-scans the shape's XML four times and re-parses both list styles for every word.
function chainOf(sp, ctx) {
  const type = phType(sp);
  const key = phKey(sp);
  const layout = (key && ctx.layout.get(key)) || {};
  return {
    sources: [layout.lstStyle || '', elements(sp, 'a:lstStyle')[0] || '']
      .filter(Boolean).map(pptxStyles.levelStyles),
    kind: type === null ? 'other' : pptxStyles.kindOf(type),
    fit: pptxStyles.autofit(elements(sp, 'a:bodyPr')[0]),
  };
}

// A size already in points, scaled and written back the same way. Autofit is a factor over
// whatever the chain settled on, so it can only be applied once that is known.
const scaled = (size, factor) => {
  const n = parseFloat(size);
  return Number.isFinite(n) ? pt(Math.round(n * factor * 100) / 100) : size;
};

function runStyle(chain, run, level, ctx) {
  const out = Object.assign({},
    ...pptxStyles.inheritedRun(chain.sources, level, chain.kind, ctx.master)
      .map((rPr) => pptxStyles.runCss(rPr, ctx.theme)),
    pptxStyles.runCss(elements(run, 'a:rPr')[0], ctx.theme));
  const { fit } = chain;
  if (fit && fit.font !== 1 && out['font-size']) out['font-size'] = scaled(out['font-size'], fit.font);
  return out;
}

// The pPr in force for this paragraph, outermost first, with its own last.
const paraLayers = (chain, para, level, ctx) =>
  pptxStyles.inheritedPara(chain.sources, level, chain.kind, ctx.master).concat(para || '');

// The same chain for the paragraph itself. Without it a deck's line and paragraph spacing —
// stated once on the layout, restated by almost no slide — is lost and the text runs together.
function paraStyle(chain, layers, hang) {
  // The browser's own paragraph margin is reset at the base of the stack, not in each layer:
  // written into every layer, the innermost — which usually states nothing — would clobber the
  // spacing the layout above it asked for.
  const out = Object.assign({ 'margin-top': '0', 'margin-bottom': '0' }, ...layers.map(pptxStyles.paraCss));
  // The hanging indent belongs to the bullet: applied without one it pulls the first line out
  // on its own, which is the paragraph looking broken rather than indented.
  if (hang) out['text-indent'] = pt(hang);
  const { fit } = chain;
  if (fit && fit.line) out['line-height'] = String(Math.round((Number(out['line-height']) || 1.2) * (1 - fit.line) * 100) / 100);
  return out;
}

// The bullet as its own inline box one hanging indent wide, so the text after it starts where
// the paragraph's own margin is. PowerPoint reaches the same place with a tab stop.
function bulletHtml(text, hang, ctx) {
  const cls = hang && hang < 0 ? ctx.sheet.cls({ display: 'inline-block', width: pt(-hang) }) : '';
  // With no indent to size the box, one non-breaking space keeps the bullet with its text.
  return '<span' + (cls ? ' class="' + cls + '"' : '') + '>' + escHtml(text)
    + (cls ? '' : ' ') + '</span>';
}

function textHtml(sp, ctx) {
  // A shape's text sits in p:txBody, a table cell's in a:txBody; the runs inside are the same.
  const body = elements(sp, 'p:txBody')[0] || elements(sp, 'a:txBody')[0];
  if (!body) return '';
  let html = '';
  // An automatic number counts within its own level, and only within this shape.
  const seen = new Map();
  const chain = chainOf(sp, ctx);
  for (const p of elements(body, 'a:p')) {
    const para = elements(p, 'a:pPr')[0];
    const level = Number(attr(para || '', 'lvl') || '0') || 0;
    // Runs and breaks in the order they appear. A paragraph holds both, and taking the runs
    // alone puts every line of it on one line — which is a block of text read as one sentence.
    const runs = elementsOf(p, ['a:br', 'a:r']).map(({ tag, xml }) => {
      if (tag === 'a:br') return '<br>';
      const cls = ctx.sheet.cls(runStyle(chain, xml, level, ctx));
      const text = escHtml(textIn(xml, 'a:t'));
      return cls ? '<span class="' + cls + '">' + text + '</span>' : text;
    }).join('');
    if (!runs) continue;
    const layers = paraLayers(chain, para, level, ctx);
    const bullet = pptxStyles.bulletOf(layers, seen.get(level) || 0);
    if (bullet !== null) seen.set(level, (seen.get(level) || 0) + 1);
    // The indent and the box that fills it are one decision, so it is resolved once.
    const hang = bullet === null ? null : pptxStyles.hangOf(layers);
    const cls = ctx.sheet.cls(paraStyle(chain, layers, hang));
    html += '<p' + (cls ? ' class="' + cls + '"' : '') + '>'
      + (bullet === null ? '' : bulletHtml(bullet, hang, ctx)) + runs + '</p>';
  }
  return html;
}

function pictureHtml(pic, ctx, frame) {
  const box = pptxStyles.shapeBox(pic, frame);
  const src = ctx.images.get(attr(elements(pic, 'a:blip')[0] || '', 'r:embed'));
  if (!box || !src) return '';
  const cls = ctx.sheet.cls(Object.assign(pptxStyles.boxCss(box), { 'object-fit': 'contain' }));
  return '<img class="' + cls + '" src="' + escAttr(src) + '">';
}

// The line ends a deck draws its arrows with, as marker paths in a 10x10 space.
const MARKER = {
  triangle: 'M0,0 L10,5 L0,10 z',
  arrow: 'M0,0 L10,5 L0,10 z',
  stealth: 'M0,0 L10,5 L0,10 L3,5 z',
  diamond: 'M0,5 L5,0 L10,5 L5,10 z',
  oval: 'M0,5 a5,5 0 1,0 10,0 a5,5 0 1,0 -10,0',
};

let markerSeq = 0;

// A freeform or preset shape drawn as the SVG its contours describe, stretched over the box the
// deck gives it. `vector-effect` keeps the stroke one width: the viewBox scales x and y by
// different amounts, and a scaled stroke comes out thin on one edge and thick on the next.
function customHtml(drawn, box, fill, pen) {
  const ends = pen && [pen.head && ['start', pen.head], pen.tail && ['end', pen.tail]].filter(Boolean);
  const ids = new Map();
  const defs = !ends || !ends.length ? '' : '<defs>' + ends.map(([where, type]) => {
    const id = 'm' + (markerSeq += 1);
    ids.set(where, id);
    return '<marker id="' + id + '" viewBox="0 0 10 10" refX="' + (where === 'start' ? 0 : 10) + '" refY="5"'
      + ' markerWidth="4" markerHeight="4" orient="auto-start-reverse" markerUnits="strokeWidth">'
      + '<path d="' + MARKER[type] + '" fill="' + pen.colour + '"/></marker>';
  }).join('') + '</defs>';
  const marker = (where) => (ids.has(where) ? ' marker-' + where + '="url(#' + ids.get(where) + ')"' : '');
  const paint = (path) => (path.filled && fill ? ' fill="' + escAttr(fill) + '"' : ' fill="none"')
    + (path.stroked && pen
      ? ' stroke="' + escAttr(pen.colour) + '" style="stroke-width:' + pt(pen.width) + '"'
        + ' vector-effect="non-scaling-stroke"' + marker('start') + marker('end')
      : '');
  return '<svg viewBox="0 0 ' + drawn.width + ' ' + drawn.height + '" preserveAspectRatio="none">'
    + defs + drawn.paths.map((p) => '<path d="' + p.d + '"' + paint(p) + '/>').join('')
    + '</svg>';
}

function shapeHtml(sp, ctx, frame) {
  const box = pptxStyles.shapeBox(sp, frame) || (!frame && (ctx.layout.get(phKey(sp)) || {}).box);
  if (!box) return '';
  const inner = textHtml(sp, ctx);
  const spPr = elements(sp, 'p:spPr')[0] || '';
  // The line has to come out before the fill is read: an outline states its colour as a
  // solidFill too, and the first one found would paint the whole shape.
  const outline = elements(spPr, 'a:ln')[0];
  const pen = pptxStyles.linePen(spPr, ctx.theme, sp);
  const bare = outline ? spPr.replace(outline, '') : spPr;
  const fill = elements(bare, 'a:noFill')[0]
    ? null
    : pptxStyles.solidFill(bare, ctx.theme) || pptxStyles.styleFill(sp, ctx.theme);
  const drawn = pptxStyles.customPaths(spPr) || pptxStyles.arcPath(spPr, box);
  const boxy = pptxStyles.drawsAsBox(spPr);
  // A shape with none of these draws nothing a reader would miss.
  if (!inner && !drawn && !(boxy && (fill || pen))) return '';
  const css = Object.assign(pptxStyles.boxCss(box), pptxStyles.bodyCss(elements(sp, 'a:bodyPr')[0]));
  // A shape that paints its own contours must not also be given the box's fill and border, or
  // the drawing arrives framed.
  if (drawn) Object.assign(css, { padding: '0' });
  else if (boxy) {
    Object.assign(css, pptxStyles.geometryCss(spPr), pptxStyles.outlineCss(box, pptxStyles.lineCss(spPr, ctx.theme, sp)));
    if (fill) css.background = fill;
  }
  const body = drawn ? customHtml(drawn, box, fill, pen) + inner : inner;
  return '<div class="' + ctx.sheet.cls(css) + '">' + body + '</div>';
}

// A table on a slide: a p:graphicFrame holding an a:tbl. The frame says where it sits, a:tblGrid
// how wide each column is, and every cell carries its own fill and edges.
function tableHtml(graphicFrame, ctx, frame) {
  const tbl = elements(graphicFrame, 'a:tbl')[0];
  const box = pptxStyles.shapeBox(graphicFrame, frame);
  if (!tbl || !box) return '';
  const widths = elements(elements(tbl, 'a:tblGrid')[0] || '', 'a:gridCol')
    .map((col) => pptxStyles.emu(attr(col, 'w')));
  const group = '<colgroup>'
    + widths.map((w) => '<col' + (w ? ' style="width:' + pt(w) + '"' : '') + '>').join('')
    + '</colgroup>';
  const rows = elements(tbl, 'a:tr').map((tr) => {
    const cells = elements(tr, 'a:tc').map((tc) => {
      // A cell covered by a merge is written out in full and marked; drawing it would put the
      // spanned text back beside itself.
      if (attr(tc, 'hMerge') === '1' || attr(tc, 'vMerge') === '1') return '';
      const span = Number(attr(tc, 'gridSpan') || '1') || 1;
      const down = Number(attr(tc, 'rowSpan') || '1') || 1;
      const cls = ctx.sheet.cls(pptxStyles.cellCss(elements(tc, 'a:tcPr')[0], ctx.theme));
      return '<td' + (span > 1 ? ' colspan="' + span + '"' : '') + (down > 1 ? ' rowspan="' + down + '"' : '')
        + ' class="' + cls + '">' + textHtml(tc, ctx) + '</td>';
    }).join('');
    const height = pptxStyles.emu(attr(tr, 'h'));
    return cells ? '<tr' + (height ? ' class="' + ctx.sheet.cls({ height: pt(height) }) + '"' : '') + '>' + cells + '</tr>' : '';
  }).filter(Boolean).join('');
  if (!rows) return '';
  return '<div class="' + ctx.sheet.cls(pptxStyles.boxCss(box)) + '"><table>' + group + rows + '</table></div>';
}

// Shapes in the order the slide states, so a later one covers an earlier one exactly as it does
// in PowerPoint. A group hands its own coordinate space down to its children.
function shapesHtml(source, ctx, frame) {
  const spans = [];
  // p:cxnSp is a connector — a line. A deck's rules and underlines are all connectors, and a
  // reader that walks only p:sp loses every one of them.
  for (const tag of ['p:sp', 'p:cxnSp', 'p:pic', 'p:grpSp', 'p:graphicFrame']) {
    let at = 0;
    for (const src of elements(source, tag)) {
      const from = source.indexOf(src, at);
      if (from < 0) continue;
      spans.push({ from, to: from + src.length, tag, src });
      at = from + src.length;
    }
  }
  spans.sort((a, b) => a.from - b.from || b.to - a.to);
  let end = -1;
  let html = '';
  for (const s of spans) {
    if (s.from < end) continue;
    end = s.to;
    // Into the group's contents, not the group: elements() finds the element it was handed, so
    // recursing on the source itself walks the same group for ever.
    if (s.tag === 'p:grpSp') html += shapesHtml(innerXml(s.src), ctx, pptxStyles.groupFrame(s.src, frame));
    else if (s.tag === 'p:pic') html += pictureHtml(s.src, ctx, frame);
    else if (s.tag === 'p:graphicFrame') html += tableHtml(s.src, ctx, frame);
    else html += shapeHtml(s.src, ctx, frame);
  }
  return html;
}

const SLIDE_RULES = [
  'body{margin:0;background:transparent}',
  '.slide{position:relative;overflow:hidden;background:#ffffff;color:#1a1a1a;margin:0 auto;box-shadow:0 0 0 1pt rgba(0,0,0,.15)}',
  // Only display — a picture's size is the box the slide gives it, and `.slide img` outranks
  // the class that box is written on, so anything more here overrides the placement.
  '.slide img{display:block}',
  // Nothing here that a cell's own class also states, for that same reason: `.slide td` would
  // outrank it. The table fills the box its frame was given.
  '.slide table{border-collapse:collapse;table-layout:fixed;width:100%;height:100%}',
  '.slide svg{display:block;width:100%;height:100%;overflow:visible}',
].join('\n');

// Whatever a layout or master draws that the slide does not fill in: its decoration. The
// placeholders there hold prompt text ("Click to edit Master title style"), so drawing them puts
// that prompt underneath the slide's own words.
const decorationOnly = (source) => {
  let html = source || '';
  for (const sp of elements(html, 'p:sp')) {
    if (elements(elements(sp, 'p:nvSpPr')[0] || '', 'p:ph')[0]) html = html.replace(sp, '');
  }
  return html;
};

// The sheet the slide is drawn on: its own background, or the one it inherits. bgRef points at a
// fill in the theme, and the colour it carries is the part of it worth having.
function backgroundCss(sources, theme) {
  for (const source of sources) {
    const bg = elements(source || '', 'p:bg')[0];
    if (!bg) continue;
    const fill = pptxStyles.solidFill(elements(bg, 'p:bgPr')[0] || '', theme)
      || pptxStyles.fillColour(elements(bg, 'p:bgRef')[0], theme);
    if (fill) return fill;
  }
  return null;
}

// The slide drawn at its own size and shrunk to the width there is room for. Every shape keeps
// the place the deck gives it, which is the whole of what a slide is.
function slidePage(zip, part, width) {
  const xml = zip.text(part);
  if (!xml) return null;
  const size = pptxStyles.slideSize(zip.text('ppt/presentation.xml'));
  if (!size) return null;
  const layoutPart = layoutPartOf(zip, part);
  const layoutXml = (layoutPart && zip.text(layoutPart)) || '';
  const masterPart = masterPartOf(zip, layoutPart);
  const masterXml = (masterPart && zip.text(masterPart)) || '';
  const theme = pptxStyles.readTheme(zip.text(themePartOf(zip, masterPart)), masterXml);
  const ctx = {
    theme,
    layout: layoutBoxes(masterXml, layoutXml),
    master: pptxStyles.masterTextStyles(masterXml),
    images: partImages(zip, part),
    sheet: cssSheet('s'),
  };

  // Back to front: the master's decoration, then the layout's, then the slide itself. A layout
  // that says showMasterSp="0" is saying it replaces the master's, not that it sits on top; a
  // slide saying it replaces both, so the master layer is gated on the slide's word as well.
  const under = [];
  const inherits = (source) => attr(source, 'showMasterSp') !== '0';
  if (masterXml && inherits(layoutXml) && inherits(xml)) {
    under.push(shapesHtml(decorationOnly(masterXml), { ...ctx, images: partImages(zip, masterPart) }, null));
  }
  if (layoutXml && inherits(xml)) {
    under.push(shapesHtml(decorationOnly(layoutXml), { ...ctx, images: partImages(zip, layoutPart) }, null));
  }

  const background = backgroundCss([xml, layoutXml, masterXml], theme);
  const zoom = Math.min(1, width / (size.width * (96 / 72)));
  return {
    html: '<div class="slide">' + under.join('') + shapesHtml(xml, ctx, null) + '</div>',
    css: [SLIDE_RULES,
      '.slide{width:' + pt(size.width) + ';height:' + pt(size.height)
        + (background ? ';background:' + background : '') + '}',
      'html{zoom:' + zoom + '}', ctx.sheet.text()].join('\n'),
  };
}

// The pictures a part points at, by relationship id. A layout and a master keep their own
// relationships, so each has to be looked up against its own folder.
function partImages(zip, part) {
  const out = new Map();
  if (!part) return out;
  const folder = part.slice(0, part.lastIndexOf('/'));
  const rels = zip.text(folder + '/_rels/' + part.slice(part.lastIndexOf('/') + 1) + '.rels') || '';
  for (const r of elements(rels, 'Relationship')) {
    const id = attr(r, 'Id');
    const target = attr(r, 'Target') || '';
    if (id && /media\//.test(target)) out.set(id, normPath(folder + '/' + target));
  }
  return out;
}


// The part a slide is laid out on, and the master that layout belongs to.
function relatedPart(zip, part, pattern) {
  if (!part) return null;
  const folder = part.slice(0, part.lastIndexOf('/'));
  const rels = zip.text(folder + '/_rels/' + part.slice(part.lastIndexOf('/') + 1) + '.rels') || '';
  for (const r of elements(rels, 'Relationship')) {
    const target = attr(r, 'Target') || '';
    if (pattern.test(target)) {
      const resolved = normPath(folder + '/' + target);
      if (zip.has(resolved)) return resolved;
    }
  }
  return null;
}

const layoutPartOf = (zip, slidePart) => relatedPart(zip, slidePart, /slideLayout\d+\.xml$/);
const masterPartOf = (zip, layoutPart) => relatedPart(zip, layoutPart, /slideMaster\d+\.xml$/);
// A deck assembled from two presentations has a theme per master, and every scheme colour and
// theme font on its second master resolves against the wrong one if the first is assumed.
const themePartOf = (zip, masterPart) => relatedPart(zip, masterPart, /theme\d+\.xml$/) || 'ppt/theme/theme1.xml';

async function count(absPath) {
  const doc = readSlides(absPath);
  return doc ? doc.parts.length : 0;
}

async function render(el, req) {
  const doc = readSlides(req.abs);
  if (!req.isCurrent() || !doc) return false;
  const n = clampPosition(req.position, doc.parts.length);
  const zoom = req.zoom || 1;
  const width = req.width * zoom;
  const page = slidePage(doc.zip, doc.parts[n - 1], width);
  if (page) {
    const loadImage = (src) => doc.zip.read(assetSrc(src));
    // The frame first: the sanitizer strips the class attributes every shape's position is
    // written against, and inlining would pile the whole slide into one column.
    const framed = renderFrame(el, {
      html: page.html, css: page.css, width, page: true, loadImage,
      onFail: () => {
        const slide = slideText(doc.zip.text(doc.parts[n - 1]) || '');
        renderLines(el, { title: slide.title, body: slide.body, width: req.width, zoom: req.zoom });
      },
    });
    if (framed !== false) return framed;
  }
  const slide = await readSlide(req.abs, req.position);
  if (!req.isCurrent() || !slide) return false;
  return renderLines(el, { title: slide.title, body: slide.body, width: req.width, zoom: req.zoom });
}

module.exports = {
  id: 'pptx',
  exts: ['pptx', 'pptm', 'potx', 'potm'],
  anchorKind: null, // PowerPoint takes a fragment as part of the file name and finds nothing
  capabilities: { paged: true, zoomable: true },
  count,
  outline: readOutline,
  render,
  readOutline,
  readSlide,
  slidePage,
  layoutBoxes,
  shapesHtml,
};
