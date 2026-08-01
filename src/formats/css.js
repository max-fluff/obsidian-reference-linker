'use strict';

// Building a stylesheet for a converted document. A document carries its own formatting, and
// the only way to show it is to say the same thing in CSS — this is where that is collected.

// Word measures in twips (a twentieth of a point) and half-points; ODF writes real units. Both
// end up as points, because the page is laid out at its true size and scaled to fit the box.
const TWIP = 20;
const pt = (n) => Math.round(n * 100) / 100 + 'pt';
const twips = (v) => pt(Number(v) / TWIP);
const halfPoints = (v) => pt(Number(v) / 2);
const eighthPoints = (v) => pt(Number(v) / 8);
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// A colour as Word and ODF write it: RRGGBB, sometimes with the hash. Anything else is not a
// colour to state — "auto" above all, which means "whatever the reader would use anyway".
function colour(v) {
  const s = String(v || '').trim().replace(/^#/, '');
  return /^[0-9a-f]{6}$/i.test(s) ? '#' + s.toLowerCase() : null;
}

// Fonts are named, not embedded, so the document's own font is a request the reader may not be
// able to honour. A generic fallback keeps a missing font from landing on the theme's UI face.
const SERIF = /times|georgia|garamond|book|minion|cambria|constantia|palatino|serif/i;
const MONO = /courier|consolas|menlo|mono/i;
function fontFamily(name) {
  const first = String(name || '').split(',')[0].trim().replace(/^["']|["']$/g, '');
  if (!first) return null;
  const generic = MONO.test(first) ? 'monospace' : SERIF.test(first) ? 'serif' : 'sans-serif';
  return JSON.stringify(first) + ', ' + generic;
}

const declaration = (props) => Object.keys(props)
  .filter((k) => props[k] !== null && props[k] !== undefined && props[k] !== '')
  .sort()
  .map((k) => k + ':' + props[k])
  .join(';');

// A stylesheet that hands out class names. Two runs formatted the same way get one class, which
// is what keeps a long document's stylesheet from being longer than the document.
function sheet(prefix) {
  const byRule = new Map();
  const order = [];
  return {
    // The class for this set of CSS properties, or '' when there is nothing to say. `within`
    // narrows the rule to a descendant — a table saying what its own cells look like.
    cls(props, within) {
      const rule = declaration(props || {});
      if (!rule) return '';
      const key = (within || '') + '{' + rule;
      let name = byRule.get(key);
      if (!name) {
        name = (prefix || 'd') + byRule.size;
        byRule.set(key, name);
        order.push([name + (within ? ' ' + within : ''), rule]);
      }
      return name;
    },
    text() {
      return order.map(([selector, rule]) => '.' + selector + '{' + rule + '}').join('\n');
    },
  };
}

// The page the document declares, at its true size. The horizontal margins are always kept —
// the width of the text column is the most visible choice an author makes. The vertical ones
// only in 'page' view: a section is an excerpt, not a sheet, and its top and bottom margins
// would be an inch of blank above and below a paragraph.
function pageCss(page, viewWidth, view) {
  const width = page && page.width;
  if (!width) return { css: '', zoom: 1 };
  const whole = view === 'page';
  const box = {
    width: pt(width),
    'min-height': whole && page.height ? pt(page.height) : null,
    'padding-right': page.right ? pt(page.right) : null,
    'padding-left': page.left ? pt(page.left) : null,
    'padding-top': whole && page.top ? pt(page.top) : '12pt',
    'padding-bottom': whole && page.bottom ? pt(page.bottom) : '12pt',
    'box-sizing': 'border-box',
    background: '#ffffff',
    color: '#1a1a1a',
    margin: '0 auto',
    'box-shadow': whole ? '0 0 0 1pt rgba(0,0,0,.15)' : null,
  };
  return { css: '.page{' + declaration(box) + '}', zoom: Math.min(1, viewWidth / (width * (96 / 72))) };
}

// The paper a grid is drawn on, under whatever formatting the cells themselves carry. Shared so
// a workbook, an ODF sheet and a CSV read as one thing rather than three.
const SHEET_RULES = [
  'body{margin:0;background:transparent;color:#1a1a1a}',
  // max-content over the frame's own cap on tables: a sheet is as wide as its columns say, and
  // a wide one is scrolled to rather than squeezed until its columns mean nothing.
  'table{border-collapse:collapse;background:#fff;font:13px system-ui,sans-serif;max-width:none;width:max-content}',
  'td,th{border:1px solid #d9d9d9;padding:2px 6px;white-space:nowrap}',
  'th{background:#f3f3f3;font-weight:600;text-align:left}',
].join('\n');

module.exports = { sheet, pt, twips, halfPoints, eighthPoints, num, colour, fontFamily, declaration, pageCss, SHEET_RULES };
