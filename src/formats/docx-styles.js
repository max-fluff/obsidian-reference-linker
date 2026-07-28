'use strict';

// Word's formatting, said again in CSS. A document carries its own typography and the preview is
// only worth having if it shows it; this is the translation, and docx.js is the structure.

const { elements, attr } = require('../xml');
const { pt, twips, halfPoints, eighthPoints, num, colour, fontFamily } = require('./css');

// Three states, not two: a style can turn bold explicitly off to override the one it is based
// on, and treating that as "absent" would let the parent's bold through.
function flag(pr, tag) {
  const el = elements(pr || '', tag)[0];
  if (!el) return null;
  const val = attr(el, 'w:val');
  return val === null || !/^(0|false|off)$/i.test(val);
}

const ALIGN = {
  left: 'left', start: 'left', right: 'right', end: 'right',
  center: 'center', both: 'justify', distribute: 'justify',
};

// A run's own properties. Only what real documents actually carry: across a corpus, size and
// font dominate, then colour, weight and slant.
function runCss(rPr) {
  if (!rPr) return {};
  const out = {};
  const fonts = elements(rPr, 'w:rFonts')[0];
  if (fonts) {
    const family = fontFamily(attr(fonts, 'w:ascii') || attr(fonts, 'w:hAnsi') || attr(fonts, 'w:cs'));
    if (family) out['font-family'] = family;
  }
  const size = num(attr(elements(rPr, 'w:sz')[0] || '', 'w:val'));
  if (size !== null) out['font-size'] = halfPoints(size);

  const bold = flag(rPr, 'w:b');
  if (bold !== null) out['font-weight'] = bold ? 'bold' : 'normal';
  const italic = flag(rPr, 'w:i');
  if (italic !== null) out['font-style'] = italic ? 'italic' : 'normal';

  const underline = attr(elements(rPr, 'w:u')[0] || '', 'w:val');
  const struck = flag(rPr, 'w:strike');
  const lines = [];
  if (underline && !/^none$/i.test(underline)) lines.push('underline');
  if (struck) lines.push('line-through');
  if (lines.length) out['text-decoration'] = lines.join(' ');
  else if (underline || struck === false) out['text-decoration'] = 'none';

  const fg = colour(attr(elements(rPr, 'w:color')[0] || '', 'w:val'));
  if (fg) out.color = fg;
  const shade = elements(rPr, 'w:shd')[0];
  const bg = shade && colour(attr(shade, 'w:fill'));
  if (bg) out.background = bg;

  if (flag(rPr, 'w:caps')) out['text-transform'] = 'uppercase';
  if (flag(rPr, 'w:smallCaps')) out['font-variant'] = 'small-caps';
  const spacing = num(attr(elements(rPr, 'w:spacing')[0] || '', 'w:val'));
  if (spacing) out['letter-spacing'] = twips(spacing);
  return out;
}

// A paragraph's own properties.
function paraCss(pPr) {
  if (!pPr) return {};
  const out = {};
  const jc = attr(elements(pPr, 'w:jc')[0] || '', 'w:val');
  if (jc && ALIGN[jc]) out['text-align'] = ALIGN[jc];

  const spacing = elements(pPr, 'w:spacing')[0];
  if (spacing) {
    const before = num(attr(spacing, 'w:before'));
    const after = num(attr(spacing, 'w:after'));
    if (before !== null) out['margin-top'] = twips(before);
    if (after !== null) out['margin-bottom'] = twips(after);
    const line = num(attr(spacing, 'w:line'));
    if (line !== null) {
      // "auto" counts in 240ths of a line, everything else in twips.
      out['line-height'] = /^(atLeast|exact)$/i.test(attr(spacing, 'w:lineRule') || 'auto')
        ? twips(line)
        : String(Math.round((line / 240) * 100) / 100);
    }
  }

  const ind = elements(pPr, 'w:ind')[0];
  if (ind) {
    const left = num(attr(ind, 'w:left') || attr(ind, 'w:start'));
    const right = num(attr(ind, 'w:right') || attr(ind, 'w:end'));
    const first = num(attr(ind, 'w:firstLine'));
    const hanging = num(attr(ind, 'w:hanging'));
    if (left !== null) out['padding-left'] = twips(left);
    if (right !== null) out['padding-right'] = twips(right);
    if (hanging !== null) out['text-indent'] = twips(-hanging);
    else if (first !== null) out['text-indent'] = twips(first);
  }
  return out;
}

const BORDER_SIDE = { top: 'border-top', left: 'border-left', bottom: 'border-bottom', right: 'border-right' };

// One edge as a CSS value. Word writes the width in eighths of a point and says "nil"/"none"
// for an edge that is not drawn — which a table has to honour, or every cell grows a line the
// document does not have.
function edgeValue(edge) {
  if (!edge) return null;
  const kind = (attr(edge, 'w:val') || '').toLowerCase();
  if (!kind || kind === 'nil' || kind === 'none') return '0';
  const size = num(attr(edge, 'w:sz'));
  const style = /dash/.test(kind) ? 'dashed' : /dot/.test(kind) ? 'dotted' : /double/.test(kind) ? 'double' : 'solid';
  return eighthPoints(size === null ? 4 : Math.max(2, size)) + ' ' + style + ' '
    + (colour(attr(edge, 'w:color')) || '#767676');
}

function borderCss(pr, tag) {
  const box = elements(pr || '', tag)[0];
  if (!box) return {};
  const out = {};
  for (const [side, prop] of Object.entries(BORDER_SIDE)) {
    const value = edgeValue(elements(box, 'w:' + side)[0]);
    if (value !== null) out[prop] = value;
  }
  return out;
}

function cellCss(tcPr) {
  const out = Object.assign({}, borderCss(tcPr, 'w:tcBorders'));
  const shade = elements(tcPr || '', 'w:shd')[0];
  const fill = shade && colour(attr(shade, 'w:fill'));
  if (fill) out.background = fill;
  const width = elements(tcPr || '', 'w:tcW')[0];
  const w = width && num(attr(width, 'w:w'));
  if (w && (attr(width, 'w:type') || 'dxa') === 'dxa') out.width = twips(w);
  const valign = attr(elements(tcPr || '', 'w:vAlign')[0] || '', 'w:val');
  if (valign) out['vertical-align'] = valign === 'center' ? 'middle' : valign;
  return out;
}

// --- resolving a named style -------------------------------------------------------------------

// A style-level w:rPr, not the one inside w:pPr: that inner one formats the paragraph mark, and
// taking it by mistake gives every paragraph the formatting of its own pilcrow.
function splitStyle(src) {
  const pPr = elements(src, 'w:pPr')[0] || '';
  const rest = pPr ? src.replace(pPr, '') : src;
  return { pPr, rPr: elements(rest, 'w:rPr')[0] || '' };
}

function styleTable(stylesXml) {
  const out = new Map();
  for (const style of elements(stylesXml || '', 'w:style')) {
    const id = attr(style, 'w:styleId');
    if (!id) continue;
    const parts = splitStyle(style);
    out.set(id, {
      basedOn: attr(elements(style, 'w:basedOn')[0] || '', 'w:val'),
      pPr: parts.pPr,
      rPr: parts.rPr,
      // A table style holds the borders every cell in the table gets. Real documents lean on
      // these entirely: across a corpus not one table states its borders on the table itself.
      tblPr: elements(style, 'w:tblPr')[0] || '',
    });
  }
  return out;
}

// What a table and its cells look like: the style it names, resolved through the chain, with
// anything the table states for itself on top.
function tableCss(styles, tblPr) {
  const named = attr(elements(tblPr || '', 'w:tblStyle')[0] || '', 'w:val');
  const layers = [...chain(styles, named).map((s) => s.tblPr), tblPr || ''];
  const outer = Object.assign({}, ...layers.map((pr) => borderCss(pr, 'w:tblBorders')));
  // insideH and insideV describe the lines *between* cells, which in CSS is every cell's own
  // edge — there is no other way to say it.
  const inside = {};
  for (const pr of layers) {
    const box = elements(pr, 'w:tblBorders')[0];
    if (!box) continue;
    const h = edgeValue(elements(box, 'w:insideH')[0]);
    const v = edgeValue(elements(box, 'w:insideV')[0]);
    if (h !== null) { inside['border-top'] = h; inside['border-bottom'] = h; }
    if (v !== null) { inside['border-left'] = v; inside['border-right'] = v; }
  }
  return { table: outer, cell: inside };
}

function docDefaults(stylesXml) {
  const defaults = elements(stylesXml || '', 'w:docDefaults')[0] || '';
  return {
    rPr: elements(elements(defaults, 'w:rPrDefault')[0] || '', 'w:rPr')[0] || '',
    pPr: elements(elements(defaults, 'w:pPrDefault')[0] || '', 'w:pPr')[0] || '',
  };
}

// Everything a document says about formatting, read once per file.
function readStyles(stylesXml) {
  return { table: styleTable(stylesXml), defaults: docDefaults(stylesXml) };
}

// A named style resolved through the chain it is based on, nearest last so it wins. The guard is
// not paranoia: a basedOn cycle is rare but it is a hang, not a wrong colour.
function chain(styles, id) {
  const out = [];
  const seen = new Set();
  let at = id;
  while (at && styles.table.has(at) && !seen.has(at)) {
    seen.add(at);
    out.unshift(styles.table.get(at));
    at = styles.table.get(at).basedOn;
  }
  return out;
}

// The CSS for a paragraph: the document's defaults, then the style it names and everything that
// style is based on, then the formatting applied to this paragraph itself.
function paragraphCss(styles, pPr, styleId) {
  const layers = [
    paraCss(styles.defaults.pPr), runCss(styles.defaults.rPr),
    ...chain(styles, styleId).flatMap((s) => [paraCss(s.pPr), runCss(s.rPr)]),
    paraCss(pPr),
  ];
  return Object.assign({}, ...layers);
}

// The CSS for a run, over whatever its paragraph already established.
const characterCss = (styles, rPr, styleId) => Object.assign({},
  ...chain(styles, styleId).map((s) => runCss(s.rPr)), runCss(rPr));

// --- the page ------------------------------------------------------------------------------------

// The page the body is laid out on. The body-level sectPr is the last one in the document; the
// earlier ones belong to sections that end before it.
function pageOf(body) {
  const sects = elements(body || '', 'w:sectPr');
  const sect = sects[sects.length - 1] || '';
  const size = elements(sect, 'w:pgSz')[0];
  if (!size) return null;
  const margin = elements(sect, 'w:pgMar')[0] || '';
  const points = (v) => (num(v) === null ? null : num(v) / 20);
  return {
    width: points(attr(size, 'w:w')),
    height: points(attr(size, 'w:h')),
    top: points(attr(margin, 'w:top')),
    right: points(attr(margin, 'w:right')),
    bottom: points(attr(margin, 'w:bottom')),
    left: points(attr(margin, 'w:left')),
  };
}

module.exports = {
  flag, runCss, paraCss, borderCss, cellCss, splitStyle, styleTable, docDefaults,
  readStyles, chain, paragraphCss, characterCss, pageOf, pt, edgeValue, tableCss,
};
