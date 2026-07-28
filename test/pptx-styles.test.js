'use strict';

// A slide is a layout: every shape states where it sits. The units are a third set again —
// position in EMU, font size in hundredths of a point — and most colours are named rather than
// stated, so they only resolve through the theme.

const { describe, it, assert } = require('../src/shared/testing/harness');
const { installStubs } = require('../src/shared/testing/stubs');

installStubs();

const s = require('../src/formats/pptx-styles');

const THEME = '<a:theme><a:themeElements><a:clrScheme name="Office">'
  + '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>'
  + '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>'
  + '<a:dk2><a:srgbClr val="44546A"/></a:dk2>'
  + '<a:accent1><a:srgbClr val="4472C4"/></a:accent1>'
  + '</a:clrScheme></a:themeElements></a:theme>';
const MASTER = '<p:sldMaster><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1"/></p:sldMaster>';
const theme = s.readTheme(THEME, MASTER);

describe('units', () => {
  it('converts a position out of EMU', () => {
    // 914400 EMU to the inch, so an inch is 72pt.
    assert.strictEqual(s.emu(914400), 72);
    assert.strictEqual(s.emu(0), 0);
  });

  it('converts a font size out of hundredths of a point', () => {
    // Word counts half-points and ODF writes real lengths; DrawingML does neither.
    assert.strictEqual(s.hundredths(2800), 28);
  });
});

describe('theme colours', () => {
  it('takes a colour a shape states outright', () => {
    assert.strictEqual(s.solidFill('<a:rPr><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:rPr>', theme), '#ff0000');
  });

  it('follows a named slot through the master\'s map into the theme', () => {
    // tx1 is a slot the master maps onto dk1, which the theme finally gives a value.
    assert.strictEqual(s.solidFill('<a:rPr><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></a:rPr>', theme), '#000000');
    assert.strictEqual(s.solidFill('<a:rPr><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:rPr>', theme), '#4472c4');
  });

  it('reads a system colour from the value it was last resolved to', () => {
    assert.strictEqual(theme.scheme.get('lt1'), '#ffffff');
  });

  it('is null for a slot the theme does not have', () => {
    assert.strictEqual(s.solidFill('<a:solidFill><a:schemeClr val="nope"/></a:solidFill>', theme), null);
  });
});

describe('the face a run is set in', () => {
  // Nearly every run in a real deck names "+mj-lt" or "+mn-lt" rather than a font. Left
  // unresolved the whole deck falls back to the browser's serif, which is the loudest way a
  // slide reads as not itself.
  const fonts = s.readTheme(THEME.replace('</a:themeElements>',
    '<a:fontScheme><a:majorFont><a:latin typeface="Segoe UI Light"/></a:majorFont>'
    + '<a:minorFont><a:latin typeface="Segoe UI"/></a:minorFont></a:fontScheme></a:themeElements>'), MASTER);

  it('follows the theme reference to the major and minor faces', () => {
    assert.ok(/Segoe UI Light/.test(s.runCss('<a:rPr><a:latin typeface="+mj-lt"/></a:rPr>', fonts)['font-family']));
    assert.ok(/"Segoe UI"/.test(s.runCss('<a:rPr><a:latin typeface="+mn-lt"/></a:rPr>', fonts)['font-family']));
  });

  it('uses a face named outright as it stands', () => {
    assert.ok(/Georgia/.test(s.runCss('<a:rPr><a:latin typeface="Georgia"/></a:rPr>', fonts)['font-family']));
  });

  it('says nothing when the theme carries no font scheme to resolve against', () => {
    assert.strictEqual(s.runCss('<a:rPr><a:latin typeface="+mj-lt"/></a:rPr>', theme)['font-family'], undefined);
  });
});

describe('a colour modifier', () => {
  // A modern template states almost every heading colour as a slot plus a modifier. Reading the
  // slot alone left this deck's titles near-white on white — invisible, not merely off.
  const fill = (inner) => s.fillColour('<a:solidFill>' + inner + '</a:solidFill>', theme);

  it('darkens a slot to the luminance it names', () => {
    // Office calls #4472C4 at 50% luminance "Accent 1, Darker 50%".
    assert.strictEqual(fill('<a:schemeClr val="accent1"><a:lumMod val="50000"/></a:schemeClr>'), '#203864');
  });

  it('lightens through lumMod with lumOff, as Office\'s "Lighter 40%" does', () => {
    assert.strictEqual(fill('<a:schemeClr val="accent1"><a:lumMod val="60000"/><a:lumOff val="40000"/></a:schemeClr>'), '#8faadc');
  });

  it('blends toward black for a shade and toward white for a tint', () => {
    assert.strictEqual(fill('<a:srgbClr val="808080"><a:shade val="50000"/></a:srgbClr>'), '#404040');
    assert.strictEqual(fill('<a:srgbClr val="808080"><a:tint val="50000"/></a:srgbClr>'), '#c0c0c0');
  });

  it('leaves a colour that names no modifier alone', () => {
    assert.strictEqual(fill('<a:schemeClr val="accent1"/>'), '#4472c4');
    assert.strictEqual(fill('<a:srgbClr val="FF0000"/>'), '#ff0000');
  });
});

describe('an outline', () => {
  const spPr = (ln) => '<p:spPr><a:prstGeom prst="line"/>' + ln + '</p:spPr>';

  it('reads the weight, dash and colour of a line', () => {
    assert.strictEqual(s.lineCss(spPr('<a:ln w="25400"><a:solidFill><a:srgbClr val="D24726"/></a:solidFill></a:ln>'), theme),
      '2pt solid #d24726');
    assert.strictEqual(s.lineCss(spPr('<a:ln w="12700"><a:solidFill><a:srgbClr val="000000"/></a:solidFill>'
      + '<a:prstDash val="dash"/></a:ln>'), theme), '1pt dashed #000000');
  });

  it('is nothing for a shape told to draw no line', () => {
    assert.strictEqual(s.lineCss(spPr('<a:ln><a:noFill/></a:ln>'), theme), null);
    assert.strictEqual(s.lineCss('<p:spPr/>', theme), null);
  });

  it('takes the colour from the shape\'s own p:style when the spPr states none', () => {
    // A deck's drawing kit names the colour on p:style rather than on the shape. Read only the
    // spPr and those edges are never drawn at all.
    const sp = '<p:sp>' + spPr('<a:ln w="12700"/>')
      + '<p:style><a:lnRef idx="1"><a:schemeClr val="accent1"/></a:lnRef></p:style></p:sp>';
    assert.strictEqual(s.lineCss(spPr('<a:ln w="12700"/>'), theme, sp), '1pt solid #4472c4');
  });

  it('still draws no line when the shape says noFill, whatever p:style names', () => {
    const sp = '<p:sp><p:style><a:lnRef idx="1"><a:schemeClr val="accent1"/></a:lnRef></p:style></p:sp>';
    assert.strictEqual(s.lineCss(spPr('<a:ln><a:noFill/></a:ln>'), theme, sp), null);
  });

  it('reads the ends a line is capped with, which is how a deck draws an arrow', () => {
    const pen = s.linePen(spPr('<a:ln w="12700"><a:solidFill><a:srgbClr val="000000"/></a:solidFill>'
      + '<a:headEnd type="oval"/><a:tailEnd type="triangle"/></a:ln>'), theme);
    assert.strictEqual(pen.head, 'oval');
    assert.strictEqual(pen.tail, 'triangle');
    const none = s.linePen(spPr('<a:ln w="12700"><a:solidFill><a:srgbClr val="000000"/></a:solidFill>'
      + '<a:tailEnd type="none"/></a:ln>'), theme);
    assert.strictEqual(none.tail, null);
  });
});

describe('the fill a p:style names', () => {
  it('follows fillRef into the theme', () => {
    const sp = '<p:sp><p:style><a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef></p:style></p:sp>';
    assert.strictEqual(s.styleFill(sp, theme), '#4472c4');
  });

  it('is nothing at index zero, which is the deck saying there is no fill', () => {
    const sp = '<p:sp><p:style><a:fillRef idx="0"><a:schemeClr val="accent1"/></a:fillRef></p:style></p:sp>';
    assert.strictEqual(s.styleFill(sp, theme), null);
    assert.strictEqual(s.styleFill('<p:sp/>', theme), null);
  });

  it('draws a rule on one edge only', () => {
    // A connector is a shape of no height. A full border on it draws its top and bottom over
    // each other, at twice the weight the deck asked for.
    assert.deepStrictEqual(s.outlineCss({ width: 400, height: 0 }, '2pt solid #d24726'),
      { 'border-top': '2pt solid #d24726' });
    assert.deepStrictEqual(s.outlineCss({ width: 0, height: 400 }, '2pt solid #d24726'),
      { 'border-left': '2pt solid #d24726' });
    assert.deepStrictEqual(s.outlineCss({ width: 400, height: 200 }, '2pt solid #d24726'),
      { border: '2pt solid #d24726' });
  });
});

describe('shape geometry', () => {
  const geom = (prst) => s.geometryCss('<p:spPr><a:prstGeom prst="' + prst + '"><a:avLst/></a:prstGeom></p:spPr>');

  it('rounds the shapes CSS can honestly draw', () => {
    assert.deepStrictEqual(geom('ellipse'), { 'border-radius': '50%' });
    assert.deepStrictEqual(geom('roundRect'), { 'border-radius': '16.7%' });
    assert.deepStrictEqual(geom('round2SameRect'), { 'border-radius': '16.7%' });
  });

  it('leaves everything else its box, rather than guessing at an outline', () => {
    assert.deepStrictEqual(geom('rect'), {});
    assert.deepStrictEqual(geom('rightArrow'), {});
    assert.deepStrictEqual(s.geometryCss('<p:spPr><a:custGeom/></p:spPr>'), {});
  });
});

describe('a table cell', () => {
  it('takes its fill from the cell, not from the colour an edge states', () => {
    // An edge writes its colour as a solidFill too, and it comes first: read the tcPr whole and
    // every bordered cell is painted the colour of its own border.
    const css = s.cellCss('<a:tcPr><a:lnB w="25400"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:lnB>'
      + '<a:solidFill><a:srgbClr val="4080C0"/></a:solidFill></a:tcPr>', theme);
    assert.strictEqual(css.background, '#4080c0');
    assert.strictEqual(css['border-bottom'], '2pt solid #000000');
  });

  it('anchors its text where the cell says, top by default', () => {
    assert.strictEqual(s.cellCss('<a:tcPr anchor="ctr"/>', theme)['vertical-align'], 'middle');
    assert.strictEqual(s.cellCss('<a:tcPr/>', theme)['vertical-align'], 'top');
  });

  it('falls back to PowerPoint\'s own insets when the cell states none', () => {
    // Number('') and Number(null) are both a finite 0: an absent inset read straight through
    // arrives as a stated zero and the text sits against the cell wall.
    assert.strictEqual(s.cellCss('<a:tcPr/>', theme).padding, '3.6pt 7.2pt 3.6pt 7.2pt');
    assert.strictEqual(s.cellCss('<a:tcPr marT="0" marR="0" marB="0" marL="0"/>', theme).padding, '0pt 0pt 0pt 0pt');
  });
});

describe('where a shape sits', () => {
  const shape = (x, y, cx, cy) => '<p:sp><p:spPr><a:xfrm>'
    + '<a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + cx + '" cy="' + cy + '"/>'
    + '</a:xfrm></p:spPr></p:sp>';

  const geometry = ({ left, top, width, height }) => ({ left, top, width, height });

  it('reads a box off the shape', () => {
    assert.deepStrictEqual(geometry(s.shapeBox(shape(914400, 457200, 1828800, 914400))),
      { left: 72, top: 36, width: 144, height: 72 });
  });

  it('reads the quarter-turn a shape is drawn at', () => {
    // Sixtieths of a thousandth of a degree. The box is stated before the turn, so a rotated
    // shape read flat comes out as a vertical bar where the deck draws a horizontal one.
    const turned = '<p:sp><p:spPr><a:xfrm rot="5400000" flipH="1"><a:off x="0" y="0"/>'
      + '<a:ext cx="914400" cy="914400"/></a:xfrm></p:spPr></p:sp>';
    const box = s.shapeBox(turned);
    assert.strictEqual(box.rotation, 90);
    assert.strictEqual(box.flipH, true);
    assert.strictEqual(s.boxCss(box).transform, 'rotate(90deg) scaleX(-1)');
  });

  it('states no transform for a shape that is not turned', () => {
    assert.strictEqual(s.boxCss(s.shapeBox(shape(0, 0, 914400, 914400))).transform, null);
  });

  it('sizes a shape to the box the deck states, insets included', () => {
    // The text insets are drawn as padding; without box-sizing a shape comes out wider than the
    // deck says by its own left and right inset, and a circle arrives as an oval.
    assert.strictEqual(s.boxCss(s.shapeBox(shape(0, 0, 914400, 914400)))['box-sizing'], 'border-box');
  });

  it('is null for a shape that states no place — a placeholder inherits one', () => {
    assert.strictEqual(s.shapeBox('<p:sp><p:spPr/></p:sp>'), null);
  });

  it('reads a graphic frame\'s place out of p:xfrm, where a table states it', () => {
    const table = '<p:graphicFrame><p:xfrm><a:off x="914400" y="0"/><a:ext cx="914400" cy="457200"/></p:xfrm></p:graphicFrame>';
    assert.deepStrictEqual(geometry(s.shapeBox(table)), { left: 72, top: 0, width: 72, height: 36 });
  });

  it('maps a grouped shape out of the group\'s own coordinate space', () => {
    // A group scales and shifts what it contains; a child read at face value lands elsewhere.
    const group = '<p:grpSp><p:grpSpPr><a:xfrm>'
      + '<a:off x="914400" y="0"/><a:ext cx="1828800" cy="914400"/>'
      + '<a:chOff x="0" y="0"/><a:chExt cx="914400" cy="457200"/>'
      + '</a:xfrm></p:grpSpPr></p:grpSp>';
    const frame = s.groupFrame(group);
    assert.strictEqual(frame.scaleX, 2);
    const box = s.shapeBox(shape(457200, 228600, 457200, 228600), frame);
    // The group sits at 72pt, and the child's own 36pt offset is scaled with everything else.
    assert.strictEqual(box.left, 72 + 36 * 2);
    assert.strictEqual(box.width, 72, 'the child is drawn at twice its stated width');
  });

  it('has no frame for a group that states no child space', () => {
    assert.strictEqual(s.groupFrame('<p:grpSp><p:grpSpPr/></p:grpSp>'), null);
  });

  it('composes a nested group with the one that holds it', () => {
    // An inner group states its place in its parent's child space, not on the slide. Taking the
    // inner frame alone puts everything it holds wherever the outer space happens to start.
    const grp = (off, ch) => '<p:grpSp><p:grpSpPr><a:xfrm>'
      + `<a:off x="${off}" y="0"/><a:ext cx="914400" cy="914400"/>`
      + `<a:chOff x="${ch}" y="0"/><a:chExt cx="914400" cy="914400"/></a:xfrm></p:grpSpPr></p:grpSp>`;
    // The outer group shifts its children by 2in; the inner one sits at the very start of that
    // space, so what it holds must land at the outer group's own offset.
    const outer = s.groupFrame(grp(1828800, 0));
    const inner = s.groupFrame(grp(0, 0), outer);
    assert.strictEqual(inner.x, 1828800);
    assert.strictEqual(s.shapeBox(shape(0, 0, 914400, 914400), inner).left, 144);
  });
});

describe('a preset shape', () => {
  const arc = (adj1, adj2) => '<p:spPr><a:prstGeom prst="arc"><a:avLst>'
    + `<a:gd name="adj1" fmla="val ${adj1}"/><a:gd name="adj2" fmla="val ${adj2}"/>`
    + '</a:avLst></a:prstGeom></p:spPr>';

  it('draws an arc as the ellipse sweep it is', () => {
    // A deck's rotate icons and curved arrows are arcs. Given a box and a border they come out
    // as a rectangle — which is what turned this deck's rotate glyph into a red cross.
    const p = s.arcPath(arc(0, 5400000), { width: 100, height: 100 });
    assert.strictEqual(p.paths.length, 1);
    assert.ok(/^M100.00,50.00A50,50 0 0 1 50.00,100.00$/.test(p.paths[0].d), p.paths[0].d);
    assert.strictEqual(p.paths[0].filled, false, 'an arc is a line, not a region');
  });

  it('marks the long way round when the sweep passes half a turn', () => {
    assert.ok(/A50,50 0 1 1 /.test(s.arcPath(arc(0, 16200000), { width: 100, height: 100 }).paths[0].d));
  });

  it('is nothing for a preset that is not an arc', () => {
    assert.strictEqual(s.arcPath('<p:spPr><a:prstGeom prst="rect"/></p:spPr>', { width: 10, height: 10 }), null);
  });

  it('knows which presets a CSS box is honestly the shape of', () => {
    const of = (prst) => s.drawsAsBox(`<p:spPr><a:prstGeom prst="${prst}"/></p:spPr>`);
    assert.ok(of('rect') && of('roundRect') && of('ellipse') && of('line'));
    assert.ok(s.drawsAsBox('<p:spPr/>'), 'a shape stating no geometry is a box');
    assert.ok(!of('arc') && !of('rightArrow') && !of('wedgeRoundRectCallout'),
      'a rectangle drawn round an icon reads as a shape the deck never put there');
  });
});

describe('text', () => {
  it('reads size, weight and slant off a run', () => {
    const css = s.runCss('<a:rPr sz="1800" b="1" i="1"/>', theme);
    assert.strictEqual(css['font-size'], '18pt');
    assert.strictEqual(css['font-weight'], 'bold');
    assert.strictEqual(css['font-style'], 'italic');
  });

  it('turns emphasis explicitly off when the run says so', () => {
    assert.strictEqual(s.runCss('<a:rPr b="0"/>', theme)['font-weight'], 'normal');
  });

  it('leaves a theme font reference to the reader', () => {
    // "+mn-lt" points back at the theme's minor face rather than naming one.
    assert.strictEqual(s.runCss('<a:rPr><a:latin typeface="+mn-lt"/></a:rPr>', theme)['font-family'], undefined);
    assert.strictEqual(s.runCss('<a:rPr><a:latin typeface="Segoe UI"/></a:rPr>', theme)['font-family'], '"Segoe UI", sans-serif');
  });

  it('anchors the text against the end of the box the shape names', () => {
    assert.strictEqual(s.bodyCss('<a:bodyPr anchor="b"/>')['justify-content'], 'flex-end');
    assert.strictEqual(s.bodyCss('<a:bodyPr anchor="ctr"/>')['justify-content'], 'center');
    assert.strictEqual(s.bodyCss('<a:bodyPr/>')['justify-content'], 'flex-start');
  });

  it('reads line spacing as a share of one line, not of the font size', () => {
    // spcPct counts thousandths of a percent, and the percentage is of the single spacing the
    // face already needs. Written into CSS as a bare 0.9 the lines overlap.
    assert.strictEqual(s.paraCss('<a:pPr><a:lnSpc><a:spcPct val="90000"/></a:lnSpc></a:pPr>')['line-height'], '1.08');
    assert.strictEqual(s.paraCss('<a:pPr><a:lnSpc><a:spcPct val="100000"/></a:lnSpc></a:pPr>')['line-height'], '1.2');
  });

  it('reads the gap before and after a paragraph, stated either way', () => {
    assert.strictEqual(s.paraCss('<a:pPr><a:spcAft><a:spcPts val="1200"/></a:spcAft></a:pPr>')['margin-bottom'], '12pt');
    assert.strictEqual(s.paraCss('<a:pPr><a:spcBef><a:spcPct val="50000"/></a:spcBef></a:pPr>')['margin-top'], '0.5em');
  });

  it('states no gap the paragraph did not ask for, so an outer level survives the merge', () => {
    // Written as an explicit 0 in every layer, the innermost — which usually states nothing —
    // would clobber the spacing the layout above it asked for.
    assert.strictEqual(s.paraCss('<a:pPr/>')['margin-bottom'], undefined);
    assert.strictEqual(s.paraCss(undefined)['margin-top'], undefined);
  });

  it('maps the alignment names DrawingML uses', () => {
    assert.strictEqual(s.paraCss('<a:pPr algn="ctr"/>')['text-align'], 'center');
    assert.strictEqual(s.paraCss('<a:pPr algn="just"/>')['text-align'], 'justify');
  });
});

describe('the sheet', () => {
  it('reads the slide size out of the presentation', () => {
    const size = s.slideSize('<p:presentation><p:sldSz cx="12192000" cy="6858000"/></p:presentation>');
    assert.strictEqual(size.width, 960);
    assert.strictEqual(size.height, 540);
  });

  it('is null for a deck that states none', () => {
    assert.strictEqual(s.slideSize('<p:presentation/>'), null);
  });
});

describe('what a run inherits', () => {
  // Only a ninth of the runs in a real deck state a size. The rest take one from the shape, the
  // layout and the master in turn, and a reader that stops at the run sizes almost nothing on
  // the slide — which is what made every preview look wrong.
  const master = s.masterTextStyles('<p:sldMaster><p:txStyles>'
    + '<p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle>'
    + '<p:bodyStyle><a:lvl1pPr><a:defRPr sz="2800"/></a:lvl1pPr>'
    + '<a:lvl2pPr><a:defRPr sz="2400"/></a:lvl2pPr></p:bodyStyle>'
    + '<p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle>'
    + '</p:txStyles></p:sldMaster>');

  const sizeOf = (layers) => {
    const css = Object.assign({}, ...layers.map((rPr) => s.runCss(rPr, theme)));
    return css['font-size'];
  };

  it('reads a level style out of each lvlNpPr', () => {
    const levels = s.levelStyles('<a:lstStyle><a:lvl1pPr><a:defRPr sz="1200"/></a:lvl1pPr>'
      + '<a:lvl3pPr><a:defRPr sz="900"/></a:lvl3pPr></a:lstStyle>');
    assert.strictEqual(s.runCss(levels[0].rPr, theme)['font-size'], '12pt');
    assert.strictEqual(s.runCss(levels[2].rPr, theme)['font-size'], '9pt');
  });

  it('sorts a placeholder into the set of styles that governs it', () => {
    assert.strictEqual(s.kindOf('ctrTitle'), 'title');
    assert.strictEqual(s.kindOf('subTitle'), 'body');
    assert.strictEqual(s.kindOf('ftr'), 'other');
  });

  it('takes the master\'s size for the kind of placeholder', () => {
    assert.strictEqual(sizeOf(s.inheritedRun([], 0, 'title', master)), '44pt');
    assert.strictEqual(sizeOf(s.inheritedRun([], 0, 'body', master)), '28pt');
    assert.strictEqual(sizeOf(s.inheritedRun([], 0, 'other', master)), '18pt');
  });

  it('takes the master\'s size for the outline level the paragraph is at', () => {
    assert.strictEqual(sizeOf(s.inheritedRun([], 1, 'body', master)), '24pt');
  });

  it('falls back to the first level for a depth the master does not describe', () => {
    assert.strictEqual(sizeOf(s.inheritedRun([], 5, 'body', master)), '28pt');
  });

  it('lets the shape override the master, outermost first', () => {
    const shape = '<a:lstStyle><a:lvl1pPr><a:defRPr sz="1000"/></a:lvl1pPr></a:lstStyle>';
    assert.strictEqual(sizeOf(s.inheritedRun([shape], 0, 'body', master)), '10pt');
  });

  it('lets the layout sit between the master and the shape', () => {
    const layout = '<a:lstStyle><a:lvl1pPr><a:defRPr sz="2000"/></a:lvl1pPr></a:lstStyle>';
    const shape = '<a:lstStyle><a:lvl1pPr><a:defRPr b="1"/></a:lvl1pPr></a:lstStyle>';
    const layers = s.inheritedRun([layout, shape], 0, 'body', master);
    const css = Object.assign({}, ...layers.map((rPr) => s.runCss(rPr, theme)));
    assert.strictEqual(css['font-size'], '20pt', 'the layout\'s size, not the master\'s');
    assert.strictEqual(css['font-weight'], 'bold', 'and the shape\'s weight on top');
  });
});
