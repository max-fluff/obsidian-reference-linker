'use strict';

// OpenDocument's formatting, said again in CSS. Same job as docx-styles.js and the same shape,
// but ODF writes real lengths ("2cm", "12pt") rather than counting twentieths of a point.

const { elements, attr } = require('../xml');
const { pt, colour, fontFamily } = require('./css');

// ODF lengths are CSS lengths already, except that CSS has no "pica" and the page maths needs a
// number. Everything becomes points, which is what the page is measured in.
const PER_PT = { cm: 72 / 2.54, mm: 72 / 25.4, in: 72, pt: 1, pc: 12, px: 0.75 };
function points(value) {
  const m = /^\s*(-?[\d.]+)\s*(cm|mm|in|pt|pc|px)\s*$/i.exec(String(value || ''));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n * PER_PT[m[2].toLowerCase()] : null;
}

// A length copied through as CSS. Anything that is not a length at all is dropped rather than
// guessed at: a bad declaration is worse than a missing one.
const length = (value) => {
  const n = points(value);
  return n === null ? null : pt(n);
};

const ALIGN = { start: 'left', end: 'right', left: 'left', right: 'right', center: 'center', justify: 'justify' };

// A run's properties. `style:font-name` names a font declared elsewhere in the file; `fo:font-
// family` gives it directly, and a document may carry either.
function textCss(props) {
  if (!props) return {};
  const out = {};
  const family = fontFamily(attr(props, 'fo:font-family') || attr(props, 'style:font-name'));
  if (family) out['font-family'] = family;
  const size = length(attr(props, 'fo:font-size'));
  if (size) out['font-size'] = size;

  const weight = attr(props, 'fo:font-weight');
  if (weight) out['font-weight'] = weight;
  const style = attr(props, 'fo:font-style');
  if (style) out['font-style'] = style;

  const fg = colour(attr(props, 'fo:color'));
  if (fg) out.color = fg;
  const bg = colour(attr(props, 'fo:background-color'));
  if (bg) out.background = bg;

  const lines = [];
  const underline = attr(props, 'style:text-underline-style');
  const strike = attr(props, 'style:text-line-through-style');
  if (underline && !/^none$/i.test(underline)) lines.push('underline');
  if (strike && !/^none$/i.test(strike)) lines.push('line-through');
  if (lines.length) out['text-decoration'] = lines.join(' ');

  const caps = attr(props, 'fo:text-transform');
  if (caps && caps !== 'none') out['text-transform'] = caps;
  const variant = attr(props, 'fo:font-variant');
  if (variant && variant !== 'normal') out['font-variant'] = variant;
  const position = attr(props, 'style:text-position');
  if (position) out['vertical-align'] = /^-/.test(position.trim()) ? 'sub' : 'super';
  return out;
}

// A paragraph's properties. Line height comes as a length, a percentage or "normal", and only
// the first needs converting — a percentage is already what CSS means by it.
function paraCss(props) {
  if (!props) return {};
  const out = {};
  const align = attr(props, 'fo:text-align');
  if (align && ALIGN[align]) out['text-align'] = ALIGN[align];

  for (const [from, to] of [['fo:margin-top', 'margin-top'], ['fo:margin-bottom', 'margin-bottom'],
    ['fo:margin-left', 'padding-left'], ['fo:margin-right', 'padding-right'],
    ['fo:text-indent', 'text-indent']]) {
    const value = length(attr(props, from));
    if (value) out[to] = value;
  }

  const line = attr(props, 'fo:line-height');
  if (line && /%$/.test(line)) out['line-height'] = String(parseFloat(line) / 100);
  else if (line && length(line)) out['line-height'] = length(line);

  const bg = colour(attr(props, 'fo:background-color'));
  if (bg) out.background = bg;
  const border = attr(props, 'fo:border');
  if (border) out.border = border;
  return out;
}

function cellCss(props) {
  if (!props) return {};
  const out = {};
  const bg = colour(attr(props, 'fo:background-color'));
  if (bg) out.background = bg;
  for (const [from, to] of [['fo:border', 'border'], ['fo:border-top', 'border-top'],
    ['fo:border-right', 'border-right'], ['fo:border-bottom', 'border-bottom'],
    ['fo:border-left', 'border-left']]) {
    const value = attr(props, from);
    // "none" is a real statement in ODF: the cell is told not to draw that edge.
    if (value) out[to] = /^none$/i.test(value.trim()) ? '0' : value;
  }
  const align = attr(props, 'style:vertical-align');
  if (align) out['vertical-align'] = align === 'middle' ? 'middle' : align;
  return out;
}

// A column's properties, which is only ever its width. It sits on the column, not on the cells:
// ODF states the width once and says how many columns it stands for.
function columnCss(props) {
  const width = props && length(attr(props, 'style:column-width'));
  return width ? { width } : {};
}

// --- the style table -----------------------------------------------------------------------

// Both halves of a document's formatting: the named styles in styles.xml and the one-off ones
// content.xml generates for direct formatting. A paragraph names either.
function readStyles(contentXml, stylesXml) {
  const table = new Map();
  for (const source of [stylesXml || '', contentXml || '']) {
    for (const style of elements(source, 'style:style')) {
      const name = attr(style, 'style:name');
      if (!name) continue;
      table.set(name, {
        parent: attr(style, 'style:parent-style-name'),
        family: attr(style, 'style:family') || 'paragraph',
        para: elements(style, 'style:paragraph-properties')[0] || '',
        text: elements(style, 'style:text-properties')[0] || '',
        cell: elements(style, 'style:table-cell-properties')[0] || '',
        column: elements(style, 'style:table-column-properties')[0] || '',
      });
    }
  }
  return table;
}

// The chain a style inherits through, nearest last. A parent that names itself is a hang, not a
// wrong colour, so the walk stops the second time it sees a name.
function chain(table, name) {
  const out = [];
  const seen = new Set();
  let at = name;
  while (at && table.has(at) && !seen.has(at)) {
    seen.add(at);
    out.unshift(table.get(at));
    at = table.get(at).parent;
  }
  return out;
}

const styleCss = (table, name) => Object.assign({},
  ...chain(table, name).flatMap((s) => [paraCss(s.para), textCss(s.text), cellCss(s.cell), columnCss(s.column)]));

// --- the page ---------------------------------------------------------------------------------

// The sheet the document is written for. It has to be reached through the master page: a file
// carries a layout for its notes as well as for its body, and a presentation's notes page is A4
// portrait while the slide itself is landscape.
function pageOf(stylesXml) {
  const master = elements(stylesXml || '', 'style:master-page')[0];
  const named = master && attr(master, 'style:page-layout-name');
  const layouts = elements(stylesXml || '', 'style:page-layout');
  const layout = (named && layouts.find((l) => attr(l, 'style:name') === named)) || layouts[0];
  const props = layout && elements(layout, 'style:page-layout-properties')[0];
  if (!props) return null;
  const width = points(attr(props, 'fo:page-width'));
  if (!width) return null;
  return {
    width,
    height: points(attr(props, 'fo:page-height')),
    top: points(attr(props, 'fo:margin-top')),
    right: points(attr(props, 'fo:margin-right')),
    bottom: points(attr(props, 'fo:margin-bottom')),
    left: points(attr(props, 'fo:margin-left')),
  };
}

module.exports = { points, length, textCss, paraCss, cellCss, columnCss, readStyles, chain, styleCss, pageOf };
