'use strict';

// A slide is a layout, not a flow: every shape carries its own place on the sheet. Reading those
// places is what turns a deck from a list of lines into something recognisable, and it is the
// same translation as docx-styles.js — absolute positions rather than paragraph spacing.

const { elements, attr } = require('../xml');
const { pt, colour, fontFamily } = require('./css');

// DrawingML measures position in EMU (914400 to the inch) and font size in hundredths of a
// point. Neither matches the units Word uses, and neither matches CSS.
const EMU = 12700;
// Number(null) and Number('') are 0, and both are finite: an absent attribute read straight
// through arrives as a stated zero, and every "did it say one?" fallback stops firing.
const finite = (v) => {
  if (v === null || v === undefined || v === '') return null;
  return Number.isFinite(Number(v)) ? Number(v) : null;
};
const emu = (v) => (finite(v) === null ? null : finite(v) / EMU);
const hundredths = (v) => (finite(v) === null ? null : finite(v) / 100);

const ALIGN = { l: 'left', ctr: 'center', r: 'right', just: 'justify', dist: 'justify' };
const ANCHOR = { t: 'flex-start', ctr: 'center', b: 'flex-end' };

// --- the theme -----------------------------------------------------------------------------

// A deck names most of its colours rather than stating them: `<a:schemeClr val="tx1"/>` is a
// slot, mapped by the master onto a slot in the theme, which finally holds the value.
function readTheme(themeXml, masterXml) {
  const scheme = new Map();
  // The twelve slots are named, not enumerable, so the scheme is walked by name rather than
  // through elements(), which takes one literal tag.
  const source = elements(themeXml || '', 'a:clrScheme')[0] || '';
  const re = /<a:(dk1|lt1|dk2|lt2|accent[1-6]|hlink|folHlink)>([\s\S]*?)<\/a:\1>/g;
  let m;
  while ((m = re.exec(source))) {
    const srgb = attr(elements(m[2], 'a:srgbClr')[0] || '', 'val');
    const sys = attr(elements(m[2], 'a:sysClr')[0] || '', 'lastClr');
    const value = colour(srgb || sys);
    if (value) scheme.set(m[1], value);
  }
  const map = new Map();
  const clrMap = elements(masterXml || '', 'p:clrMap')[0] || '';
  for (const name of ['bg1', 'tx1', 'bg2', 'tx2', 'accent1', 'accent2', 'accent3', 'accent4',
    'accent5', 'accent6', 'hlink', 'folHlink']) {
    const target = attr(clrMap, name);
    if (target) map.set(name, target);
  }
  // A run almost never names its own face: it points at the theme's major (headings) or minor
  // (body) font with "+mj-lt"/"+mn-lt". Left unresolved, a whole deck falls back to the
  // browser's default serif — the single most visible way a slide reads as not itself.
  const fonts = elements(themeXml || '', 'a:fontScheme')[0] || '';
  const face = (which) => attr(elements(elements(fonts, which)[0] || '', 'a:latin')[0] || '', 'typeface') || null;
  return { scheme, map, major: face('a:majorFont'), minor: face('a:minorFont') };
}

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const byte = (v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0');

function toHsl(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h / 6, s, l };
}

const channel = (p, q, t) => {
  const at = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
  if (at < 1 / 6) return p + (q - p) * 6 * at;
  if (at < 1 / 2) return q;
  if (at < 2 / 3) return p + (q - p) * (2 / 3 - at) * 6;
  return p;
};

function toHex({ h, s, l }) {
  if (!s) return '#' + byte(l).repeat(3);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return '#' + byte(channel(p, q, h + 1 / 3)) + byte(channel(p, q, h)) + byte(channel(p, q, h - 1 / 3));
}

const mix = (hex, towards, amount) => '#' + [1, 3, 5].map((i) => {
  const from = parseInt(hex.slice(i, i + 2), 16);
  const to = parseInt(towards.slice(i, i + 2), 16);
  return byte((from + (to - from) * amount) / 255);
}).join('');

// A colour reference is commonly a theme slot plus a modifier: `<a:schemeClr val="bg2">
// <a:lumMod val="25000"/></a:schemeClr>` is the theme's light grey at a quarter of its
// luminance, which is a dark heading. Read the slot alone and it stays near-white on white.
function modified(hex, source) {
  const pct = (tag) => {
    const v = attr(elements(source || '', tag)[0] || '', 'val');
    return v === null ? null : Number(v) / 100000;
  };
  let out = hex;
  const lumMod = pct('a:lumMod');
  const lumOff = pct('a:lumOff');
  if (lumMod !== null || lumOff !== null) {
    const hsl = toHsl(out);
    hsl.l = clamp01(hsl.l * (lumMod === null ? 1 : lumMod) + (lumOff === null ? 0 : lumOff));
    out = toHex(hsl);
  }
  const shade = pct('a:shade');
  if (shade !== null) out = mix(out, '#000000', 1 - shade);
  const tint = pct('a:tint');
  if (tint !== null) out = mix(out, '#ffffff', 1 - tint);
  return out;
}

// The colour a fill states, whether it names it outright or points at the theme.
function fillColour(source, theme) {
  if (!source) return null;
  const srgb = elements(source, 'a:srgbClr')[0];
  const direct = colour(attr(srgb || '', 'val'));
  if (direct) return modified(direct, srgb);
  const scheme = elements(source, 'a:schemeClr')[0];
  const named = attr(scheme || '', 'val');
  if (!named || !theme) return null;
  const slot = theme.map.get(named) || named;
  const value = theme.scheme.get(slot) || theme.scheme.get(named) || null;
  return value ? modified(value, scheme) : null;
}

const solidFill = (pr, theme) => fillColour(elements(pr || '', 'a:solidFill')[0], theme);

// --- where a shape sits ----------------------------------------------------------------------

// A group gives its children their own coordinate space: the child offsets are in that space and
// have to be mapped onto the slide, or every grouped shape lands in the wrong place.
// `parent` is the frame the group itself sits in. A group inside a group states its own place in
// its parent's child space, so the two have to compose: taking the inner one alone puts
// everything it holds wherever the outer group's space happens to start.
function groupFrame(grpSp, parent) {
  const xfrm = elements(grpSp, 'a:xfrm')[0];
  if (!xfrm) return parent || null;
  const off = elements(xfrm, 'a:off')[0];
  const ext = elements(xfrm, 'a:ext')[0];
  const chOff = elements(xfrm, 'a:chOff')[0];
  const chExt = elements(xfrm, 'a:chExt')[0];
  if (!off || !ext || !chOff || !chExt) return parent || null;
  const cx = Number(attr(chExt, 'cx'));
  const cy = Number(attr(chExt, 'cy'));
  const own = {
    x: Number(attr(off, 'x')),
    y: Number(attr(off, 'y')),
    scaleX: cx ? Number(attr(ext, 'cx')) / cx : 1,
    scaleY: cy ? Number(attr(ext, 'cy')) / cy : 1,
    childX: Number(attr(chOff, 'x')),
    childY: Number(attr(chOff, 'y')),
  };
  if (!parent) return own;
  return {
    x: parent.x + (own.x - parent.childX) * parent.scaleX,
    y: parent.y + (own.y - parent.childY) * parent.scaleY,
    scaleX: own.scaleX * parent.scaleX,
    scaleY: own.scaleY * parent.scaleY,
    childX: own.childX,
    childY: own.childY,
  };
}

// The box a shape occupies, in points on the slide, or null when it states none — a placeholder
// that inherits its place from the layout does.
function shapeBox(sp, frame) {
  // A graphicFrame — a table, a chart — states its place in p:xfrm, where every other shape uses
  // a:xfrm. Same children either way.
  const xfrm = elements(sp, 'a:xfrm')[0] || elements(sp, 'p:xfrm')[0];
  const off = xfrm && elements(xfrm, 'a:off')[0];
  const ext = xfrm && elements(xfrm, 'a:ext')[0];
  if (!off || !ext) return null;
  let x = Number(attr(off, 'x'));
  let y = Number(attr(off, 'y'));
  let cx = Number(attr(ext, 'cx'));
  let cy = Number(attr(ext, 'cy'));
  if (frame) {
    x = frame.x + (x - frame.childX) * frame.scaleX;
    y = frame.y + (y - frame.childY) * frame.scaleY;
    cx *= frame.scaleX;
    cy *= frame.scaleY;
  }
  const box = {
    left: emu(x),
    top: emu(y),
    width: emu(cx),
    height: emu(cy),
    // Rotation is in sixtieths of a thousandth of a degree, about the shape's own centre. The
    // off/ext above is the box before it turns, so a quarter-turn shape read flat comes out as a
    // vertical bar where the deck draws a horizontal one.
    rotation: finite(attr(xfrm, 'rot')) === null ? 0 : finite(attr(xfrm, 'rot')) / 60000,
    flipH: attr(xfrm, 'flipH') === '1',
    flipV: attr(xfrm, 'flipV') === '1',
  };
  return box.width === null || box.height === null ? null : box;
}

// box-sizing, because the text insets are drawn as padding: without it a shape comes out wider
// than the deck states by its own left and right inset, and a circle arrives as an oval.
const transform = (box) => [
  box.rotation ? 'rotate(' + Math.round(box.rotation * 100) / 100 + 'deg)' : '',
  box.flipH ? 'scaleX(-1)' : '',
  box.flipV ? 'scaleY(-1)' : '',
].filter(Boolean).join(' ') || null;

const boxCss = (box) => ({
  position: 'absolute',
  'box-sizing': 'border-box',
  left: pt(box.left),
  top: pt(box.top),
  width: pt(box.width),
  height: pt(box.height),
  transform: transform(box),
});

const DASH = { dash: 'dashed', sysDash: 'dashed', lgDash: 'dashed', dashDot: 'dashed', dot: 'dotted', sysDot: 'dotted' };

// The ends a line is capped with. A deck's arrows are ordinary lines wearing one of these.
const END = new Set(['triangle', 'arrow', 'stealth', 'diamond', 'oval']);
const endType = (ln, tag) => {
  const type = attr(elements(ln || '', tag)[0] || '', 'type');
  return END.has(type) ? type : null;
};

// A shape's outline: the weight, colour, pattern and ends it draws with. `sp` is the shape
// itself, whose p:style may name the colour rather than the spPr stating it — which is how a
// deck's own drawing kit works, and reading only the spPr loses those edges entirely.
function linePen(spPr, theme, sp) {
  const ln = elements(spPr || '', 'a:ln')[0];
  const ref = elements(elements(sp || '', 'p:style')[0] || '', 'a:lnRef')[0];
  if (!ln && !ref) return null;
  if (ln && elements(ln, 'a:noFill')[0]) return null;
  const stroke = (ln && solidFill(ln, theme)) || fillColour(ref, theme);
  if (!stroke) return null;
  const width = emu(attr(ln || '', 'w'));
  return {
    width: width === null ? 1 : width,
    colour: stroke,
    dash: DASH[attr(elements(ln || '', 'a:prstDash')[0] || '', 'val')] || 'solid',
    head: endType(ln, 'a:headEnd'),
    tail: endType(ln, 'a:tailEnd'),
  };
}

// The fill a shape's own p:style names. fillRef idx="0" is the deck saying "no fill", so an
// absent index and a zero one mean different things.
function styleFill(sp, theme) {
  const ref = elements(elements(sp || '', 'p:style')[0] || '', 'a:fillRef')[0];
  if (!ref || attr(ref, 'idx') === '0') return null;
  return fillColour(ref, theme);
}

// That outline as one CSS border value. A deck draws most of its rules, boxes and underlines
// this way, and a shape carrying only a line is the commonest of them.
function lineCss(spPr, theme, sp) {
  const pen = linePen(spPr, theme, sp);
  return pen ? pt(pen.width) + ' ' + pen.dash + ' ' + pen.colour : null;
}

// Which edges that outline lands on. A rule is a shape of no height, and a border on it would
// draw its top and bottom over each other at twice the weight.
function outlineCss(box, line) {
  if (!line) return {};
  if (!box.height) return { 'border-top': line };
  if (!box.width) return { 'border-left': line };
  return { border: line };
}

// The shapes a CSS box is honestly the shape of. Anything else — an arc, an arrow, a callout —
// must not be given a border: a rectangle drawn round an icon reads as a shape the deck never
// put there, which is worse than leaving it out.
const ROUND = { ellipse: '50%', circle: '50%' };
const ROUNDED_RECT = /^round\w*Rect$/;
const BOXY = /^(?:rect|line|straightConnector\d*)$/;

const presetOf = (spPr) => attr(elements(spPr || '', 'a:prstGeom')[0] || '', 'prst');

const drawsAsBox = (spPr) => {
  const prst = presetOf(spPr);
  return !prst || !!ROUND[prst] || ROUNDED_RECT.test(prst) || BOXY.test(prst);
};

function geometryCss(spPr) {
  const prst = presetOf(spPr);
  if (!prst) return {};
  if (ROUND[prst]) return { 'border-radius': ROUND[prst] };
  return ROUNDED_RECT.test(prst) ? { 'border-radius': '16.7%' } : {};
}

// The one preset worth drawing outright: an arc is an ellipse swept between two angles, and it
// is what a deck's rotate icons, pie slices and curved arrows are made of.
const ANGLE = 60000;
const adjust = (spPr, name, fallback) => {
  const gd = elements(elements(spPr || '', 'a:avLst')[0] || '', 'a:gd')
    .find((g) => attr(g, 'name') === name);
  const value = gd && /val\s+(-?\d+)/.exec(attr(gd, 'fmla') || '');
  return value ? Number(value[1]) / ANGLE : fallback;
};

function arcPath(spPr, box) {
  if (presetOf(spPr) !== 'arc' || !box.width || !box.height) return null;
  const from = adjust(spPr, 'adj1', 270);
  const to = adjust(spPr, 'adj2', 0);
  const rx = box.width / 2;
  const ry = box.height / 2;
  const at = (deg) => {
    const rad = (deg * Math.PI) / 180;
    return (rx + rx * Math.cos(rad)).toFixed(2) + ',' + (ry + ry * Math.sin(rad)).toFixed(2);
  };
  const swept = ((to - from) % 360 + 360) % 360;
  return {
    width: box.width,
    height: box.height,
    paths: [{ d: 'M' + at(from) + 'A' + rx + ',' + ry + ' 0 ' + (swept > 180 ? 1 : 0) + ' 1 ' + at(to), filled: false, stroked: true }],
  };
}

// --- a freeform shape ---------------------------------------------------------------------

// arcTo is left out: its parametric form is a conversion of its own, and a wrong curve is worse
// than a missing one. No deck surveyed used it; every freeform in one is these four verbs.
const VERB = /<a:(moveTo|lnTo|cubicBezTo|quadBezTo|close)\b(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/a:\1>)/g;
const CMD = { moveTo: 'M', lnTo: 'L', cubicBezTo: 'C', quadBezTo: 'Q' };
const POINT = /<a:pt\s[^>]*\/>/g;

function pathD(pathXml) {
  let d = '';
  VERB.lastIndex = 0;
  let verb;
  while ((verb = VERB.exec(pathXml))) {
    if (verb[1] === 'close') { d += 'Z'; continue; }
    const points = [];
    POINT.lastIndex = 0;
    let p;
    while ((p = POINT.exec(verb[2] || ''))) points.push(attr(p[0], 'x') + ',' + attr(p[0], 'y'));
    if (points.length) d += CMD[verb[1]] + points.join(' ');
  }
  return d;
}

// A freeform shape's contours, in the coordinate space the path declares. CSS cannot draw a
// path, so these become an SVG laid inside the shape's box — without them a line drawing (and a
// deck is full of them) is a rectangle where an icon should be.
function customPaths(spPr) {
  const geom = elements(spPr || '', 'a:custGeom')[0];
  if (!geom) return null;
  const paths = [];
  let width = 0;
  let height = 0;
  for (const path of elements(elements(geom, 'a:pathLst')[0] || '', 'a:path')) {
    const d = pathD(path);
    if (!d) continue;
    width = width || Number(attr(path, 'w')) || 0;
    height = height || Number(attr(path, 'h')) || 0;
    paths.push({ d, filled: attr(path, 'fill') !== 'none', stroked: attr(path, 'stroke') !== '0' });
  }
  return paths.length && width && height ? { paths, width, height } : null;
}

// --- a table cell --------------------------------------------------------------------------

const EDGE = { 'a:lnL': 'border-left', 'a:lnR': 'border-right', 'a:lnT': 'border-top', 'a:lnB': 'border-bottom' };
const CELL_ANCHOR = { t: 'top', ctr: 'middle', b: 'bottom' };

// A cell's own look. The edges have to come out of the tcPr before its fill is read: an edge
// states its colour as a solidFill too, and the first one found would paint the whole cell.
function cellCss(tcPr, theme) {
  const source = tcPr || '';
  let rest = source;
  const out = {};
  for (const [tag, prop] of Object.entries(EDGE)) {
    for (const ln of elements(source, tag)) {
      rest = rest.replace(ln, '');
      if (elements(ln, 'a:noFill')[0]) continue;
      const width = emu(attr(ln, 'w'));
      const line = solidFill(ln, theme);
      if (!line && width === null) continue;
      out[prop] = pt(width === null ? 1 : width) + ' solid ' + (line || '#808080');
    }
  }
  const fill = solidFill(rest, theme);
  if (fill) out.background = fill;
  out['vertical-align'] = CELL_ANCHOR[attr(source, 'anchor') || 't'] || 'top';
  const inset = (name, fallback) => {
    const v = emu(attr(source, name));
    return pt(v === null ? fallback : v);
  };
  out.padding = [inset('marT', 3.6), inset('marR', 7.2), inset('marB', 3.6), inset('marL', 7.2)].join(' ');
  return out;
}

// --- text --------------------------------------------------------------------------------------

// A shape's text box: the insets it states, and which end of the box the text sits against.
function bodyCss(bodyPr) {
  const out = { display: 'flex', 'flex-direction': 'column', overflow: 'hidden' };
  out['justify-content'] = ANCHOR[attr(bodyPr || '', 'anchor') || 't'] || 'flex-start';
  const inset = (name, fallback) => {
    const v = emu(attr(bodyPr || '', name));
    return pt(v === null ? fallback : v);
  };
  out.padding = [inset('tIns', 3.6), inset('rIns', 7.2), inset('bIns', 3.6), inset('lIns', 7.2)].join(' ');
  return out;
}

// PowerPoint shrinks text that would not fit its shape and records by how much. Unread, a slide
// whose text was autofitted renders a size too large and spills out of its box.
function autofit(bodyPr) {
  const fit = elements(bodyPr || '', 'a:normAutofit')[0];
  if (!fit) return null;
  const font = finite(attr(fit, 'fontScale'));
  const line = finite(attr(fit, 'lnSpcReduction'));
  return { font: font === null ? 1 : font / 100000, line: line === null ? 0 : line / 100000 };
}

// Only the arabic and alphabetic families are spelled out. A roman or East Asian numbering
// falls back to its arabic value, which is the number the reader wanted either way.
function autoNumber(type, n) {
  const alpha = /^alpha(Lc|Uc)/.exec(type || '');
  let body = String(n);
  if (alpha) {
    let out = '';
    for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) out = String.fromCharCode(64 + ((i - 1) % 26) + 1) + out;
    body = alpha[1] === 'Uc' ? out : out.toLowerCase();
  }
  const suffix = /ParenBoth$/.test(type) ? [')', '('] : /ParenR$/.test(type) ? [')', ''] : ['.', ''];
  return suffix[1] + body + suffix[0];
}

// The bullet in force, from the innermost layer that states one. buNone is a statement too: a
// layout says "nothing here" over a master that gives every level a dot.
function bulletOf(layers, ordinal) {
  for (let i = layers.length - 1; i >= 0; i--) {
    const src = layers[i] || '';
    if (elements(src, 'a:buNone')[0]) return null;
    const ch = elements(src, 'a:buChar')[0];
    if (ch) return attr(ch, 'char') || null;
    const num = elements(src, 'a:buAutoNum')[0];
    if (num) return autoNumber(attr(num, 'type'), (finite(attr(num, 'startAt')) || 1) + ordinal);
  }
  return null;
}

// The hanging indent a bulleted paragraph is laid out with: the bullet sits at marL+indent and
// the text at marL. Read off the opening tag, since a level style carries children of its own.
function hangOf(layers) {
  for (let i = layers.length - 1; i >= 0; i--) {
    // A stated zero is the paragraph resetting the indent it inherits, not saying nothing.
    const v = emu(own(layers[i], 'indent'));
    if (v !== null) return v;
  }
  return null;
}

// A gap stated either as a real height or as a share of the line it sits against.
function gap(pPr, tag) {
  const el = elements(pPr || '', tag)[0];
  if (!el) return null;
  const points = attr(elements(el, 'a:spcPts')[0] || '', 'val');
  if (points) return pt(Number(points) / 100);
  const percent = attr(elements(el, 'a:spcPct')[0] || '', 'val');
  return percent ? (Number(percent) / 100000) + 'em' : null;
}

// An element's own attribute. A level style is carried whole so its lnSpc and spacing children
// survive, and `attr` scans whatever it is handed — read off the opening tag or a paragraph
// takes the alignment of the first thing nested inside it.
const own = (src, name) => attr(String(src || '').slice(0, (String(src || '').indexOf('>') + 1) || undefined), name);

function paraCss(pPr) {
  const out = {};
  const align = own(pPr, 'algn');
  if (align && ALIGN[align]) out['text-align'] = ALIGN[align];
  const indent = emu(own(pPr, 'marL'));
  if (indent !== null) out['padding-left'] = pt(indent);
  const spacing = elements(pPr || '', 'a:lnSpc')[0];
  const percent = spacing && attr(elements(spacing, 'a:spcPct')[0] || '', 'val');
  // DrawingML's percentage is of one line, not of the font size: 90% means nine tenths of what
  // the face already needs, which CSS writes as 0.9 of its own ~1.2 single spacing.
  if (percent) out['line-height'] = String(Math.round((Number(percent) / 100000) * 1.2 * 100) / 100);
  // The other half of lnSpc, and the one a deck reaches for when it wants the lines exactly so.
  const exact = spacing && attr(elements(spacing, 'a:spcPts')[0] || '', 'val');
  if (exact && !percent) out['line-height'] = pt(Number(exact) / 100);
  const before = gap(pPr, 'a:spcBef');
  if (before) out['margin-top'] = before;
  const after = gap(pPr, 'a:spcAft');
  if (after) out['margin-bottom'] = after;
  return out;
}

// A run's own look, over whatever the shape's level defaults already established.
function runCss(rPr, theme) {
  const out = {};
  if (!rPr) return out;
  const size = hundredths(attr(rPr, 'sz'));
  if (size) out['font-size'] = pt(size);
  const bold = attr(rPr, 'b');
  if (bold !== null) out['font-weight'] = bold === '1' ? 'bold' : 'normal';
  const italic = attr(rPr, 'i');
  if (italic !== null) out['font-style'] = italic === '1' ? 'italic' : 'normal';
  const underline = attr(rPr, 'u');
  if (underline && underline !== 'none') out['text-decoration'] = 'underline';
  const fg = solidFill(rPr, theme);
  if (fg) out.color = fg;
  // "+mj-lt" and "+mn-lt" point back at the theme's major and minor faces, which is how nearly
  // every run in a real deck names its font.
  const face = attr(elements(rPr, 'a:latin')[0] || '', 'typeface');
  const named = /^\+mj/.test(face || '') ? theme && theme.major
    : /^\+mn/.test(face || '') ? theme && theme.minor
      : face;
  const family = fontFamily(named);
  if (family) out['font-family'] = family;
  return out;
}

// --- what a run inherits ------------------------------------------------------------------------

// Nine tenths of the runs in a real deck state no size of their own: they take it from the shape,
// which takes it from the layout, which takes it from the master. Read only the run and almost
// every word on the slide comes out at the browser's default size instead of the deck's.
const LEVEL = /<a:lvl([1-9])pPr\b[^>]*>([\s\S]*?)<\/a:lvl\1pPr>/g;

function levelStyles(lstStyle) {
  const out = [];
  if (!lstStyle) return out;
  LEVEL.lastIndex = 0;
  let m;
  while ((m = LEVEL.exec(lstStyle))) {
    // The whole element, not just its opening tag: the line and paragraph spacing a level
    // states are children of it, and a slide's own paragraphs almost never restate them.
    out[Number(m[1]) - 1] = { rPr: elements(m[2], 'a:defRPr')[0] || '', pPr: m[0] };
  }
  return out;
}

// The master keeps one set of level styles per kind of placeholder.
const TITLE_PH = new Set(['title', 'ctrTitle']);
const BODY_PH = new Set(['body', 'subTitle', 'obj', 'outline', '']);

function masterTextStyles(masterXml) {
  const styles = elements(masterXml || '', 'p:txStyles')[0] || '';
  return {
    title: levelStyles(elements(styles, 'p:titleStyle')[0]),
    body: levelStyles(elements(styles, 'p:bodyStyle')[0]),
    other: levelStyles(elements(styles, 'p:otherStyle')[0]),
  };
}

const kindOf = (phType) => (TITLE_PH.has(phType) ? 'title' : BODY_PH.has(phType) ? 'body' : 'other');

// The properties in force, outermost first so the shape's own win. `sources` is the list of
// a:lstStyle sources from the master down to the shape, either raw or already through
// `levelStyles`; `part` is 'rPr' or 'pPr'. A shape parses its sources once and hands them in
// parsed — read per run, the same two kilobytes of list style are re-scanned for every word.
function inherited(sources, level, kind, masterStyles, part) {
  const layers = [];
  const at = (levels) => levels && (levels[level] || levels[0]);
  const fromMaster = at(masterStyles && masterStyles[kind]);
  if (fromMaster) layers.push(fromMaster[part]);
  for (const source of sources) {
    const level0 = at(Array.isArray(source) ? source : levelStyles(source));
    if (level0) layers.push(level0[part]);
  }
  return layers;
}

const inheritedRun = (sources, level, kind, masterStyles) => inherited(sources, level, kind, masterStyles, 'rPr');
const inheritedPara = (sources, level, kind, masterStyles) => inherited(sources, level, kind, masterStyles, 'pPr');

// The size of the sheet the deck is drawn on, in points.
function slideSize(presentationXml) {
  const size = elements(presentationXml || '', 'p:sldSz')[0];
  if (!size) return null;
  const width = emu(attr(size, 'cx'));
  const height = emu(attr(size, 'cy'));
  return width && height ? { width, height } : null;
}

module.exports = {
  emu, hundredths, readTheme, fillColour, solidFill, groupFrame, shapeBox, boxCss,
  linePen, lineCss, styleFill, outlineCss, geometryCss, drawsAsBox, customPaths, arcPath, pathD,
  bodyCss, cellCss, paraCss, runCss, slideSize, levelStyles, masterTextStyles, kindOf,
  inheritedRun, inheritedPara, autofit, autoNumber, bulletOf, hangOf,
};
