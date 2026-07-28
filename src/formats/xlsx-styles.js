'use strict';

// Excel keeps a cell's look in index tables, not on the cell: the cell names an xf, the xf names
// a font, a fill and a border by number. This resolves an xf index to CSS by walking those.

const { elements, attr } = require('../xml');
const { colour } = require('./css');

// An ARGB "FFRRGGBB" down to "#RRGGBB"; the alpha byte Excel writes is dropped. A theme or
// indexed colour is left to the reader — resolving those means the theme, which for a preview is
// more than the value is worth.
function argb(el) {
  if (!el) return null;
  const rgb = attr(el, 'rgb');
  if (!rgb) return null;
  const hex = rgb.length === 8 ? rgb.slice(2) : rgb;
  return colour(hex);
}

const at = (list, id) => (id === null || id === undefined ? null : list[Number(id)] || null);

function readFonts(stylesXml) {
  return elements(elements(stylesXml, 'fonts')[0] || '', 'font').map((font) => {
    const css = {};
    if (elements(font, 'b')[0]) css['font-weight'] = 'bold';
    if (elements(font, 'i')[0]) css['font-style'] = 'italic';
    if (elements(font, 'u')[0]) css['text-decoration'] = 'underline';
    const fg = argb(elements(font, 'color')[0]);
    if (fg) css.color = fg;
    const size = attr(elements(font, 'sz')[0] || '', 'val');
    if (size) css['font-size'] = (Math.round(Number(size) * 100) / 100) + 'pt';
    return css;
  });
}

// A fill's colour is its foreground, not its background: a solid patternFill paints with fgColor
// and leaves bgColor for the pattern behind it, which for "solid" there is none of.
function readFills(stylesXml) {
  return elements(elements(stylesXml, 'fills')[0] || '', 'fill').map((fill) => {
    const pattern = elements(fill, 'patternFill')[0] || '';
    if (!/patternType="solid"/.test(pattern)) return {};
    const fg = argb(elements(pattern, 'fgColor')[0]);
    return fg ? { background: fg } : {};
  });
}

const SIDE = { left: 'border-left', right: 'border-right', top: 'border-top', bottom: 'border-bottom' };

// Excel names a line weight rather than measuring it; the common ones map to a width, and any
// dotted or dashed kind keeps its style.
const edgeWidth = (style) => (/thick|medium/.test(style) ? '2px' : '1px');
const edgeStyle = (style) => (/dash/.test(style) ? 'dashed' : /dot|hair/.test(style) ? 'dotted' : /double/.test(style) ? 'double' : 'solid');

function readBorders(stylesXml) {
  return elements(elements(stylesXml, 'borders')[0] || '', 'border').map((border) => {
    const css = {};
    for (const [side, prop] of Object.entries(SIDE)) {
      const edge = elements(border, side)[0];
      const style = edge && attr(edge, 'style');
      if (!style) continue;
      css[prop] = edgeWidth(style) + ' ' + edgeStyle(style) + ' ' + (argb(elements(edge, 'color')[0]) || '#808080');
    }
    return css;
  });
}

const HALIGN = { left: 'left', center: 'center', right: 'right', justify: 'justify' };
const VALIGN = { top: 'top', center: 'middle', bottom: 'bottom' };

// A cell format, as the CSS for the font, fill, border and alignment its xf names.
function readCellFormats(stylesXml, parts) {
  return elements(elements(stylesXml, 'cellXfs')[0] || '', 'xf').map((xf) => {
    const css = Object.assign({},
      at(parts.fonts, attr(xf, 'fontId')),
      at(parts.fills, attr(xf, 'fillId')),
      at(parts.borders, attr(xf, 'borderId')));
    const align = elements(xf, 'alignment')[0];
    if (align) {
      const h = HALIGN[attr(align, 'horizontal')];
      const v = VALIGN[attr(align, 'vertical')];
      if (h) css['text-align'] = h;
      if (v) css['vertical-align'] = v;
    }
    return css;
  });
}

// Everything a workbook says about how its cells look, read once. `format(s)` gives the CSS for
// the style index a cell carries in its `s` attribute.
function readStyles(stylesXml) {
  const xml = stylesXml || '';
  const parts = { fonts: readFonts(xml), fills: readFills(xml), borders: readBorders(xml) };
  const formats = readCellFormats(xml, parts);
  // 0 is a real xf index, not "no style": a cell with no `s` is the absent one.
  return { format: (s) => (s === null || s === undefined || s === '' ? {} : formats[Number(s)] || {}) };
}

// The column widths a sheet states, as CSS. Excel's width is in characters of the default font;
// the usual 7px-per-character rule turns it into something close to what the app shows.
function columnWidths(sheetXml) {
  const out = [];
  for (const col of elements(elements(sheetXml || '', 'cols')[0] || '', 'col')) {
    const width = Number(attr(col, 'width'));
    const min = Number(attr(col, 'min'));
    const max = Number(attr(col, 'max'));
    if (!width || !min) continue;
    for (let c = min; c <= max; c++) out[c - 1] = { width: Math.round(width * 7) + 'px' };
  }
  return out;
}

module.exports = { readStyles, columnWidths, argb, readFonts, readFills, readBorders };
