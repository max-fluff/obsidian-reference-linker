'use strict';

// Translating Excel's cell formatting into CSS. Excel keeps the look in index tables — a cell
// names an xf, the xf names a font, a fill and a border by number — so the trap is the
// indirection, and colours written ARGB with an alpha byte CSS does not want.

const { describe, it, assert } = require('../src/shared/testing/harness');
const { installStubs } = require('../src/shared/testing/stubs');

installStubs();

const s = require('../src/formats/xlsx-styles');

const styles = (inner) => '<styleSheet>' + inner + '</styleSheet>';

describe('colour', () => {
  it('drops the alpha byte Excel writes in front', () => {
    assert.strictEqual(s.argb('<color rgb="FF4080C0"/>'), '#4080c0');
  });

  it('is null for a theme or indexed colour, which needs the theme to resolve', () => {
    assert.strictEqual(s.argb('<color theme="1"/>'), null);
    assert.strictEqual(s.argb('<color indexed="64"/>'), null);
  });
});

describe('fills', () => {
  it('takes a solid fill\'s foreground, not its background', () => {
    // A solid patternFill paints with fgColor; bgColor is for the pattern behind it.
    const fills = s.readFills(styles('<fills><fill><patternFill patternType="none"/></fill>'
      + '<fill><patternFill patternType="solid"><fgColor rgb="FFF0F0F0"/><bgColor indexed="64"/></patternFill></fill></fills>'));
    assert.deepStrictEqual(fills[0], {});
    assert.strictEqual(fills[1].background, '#f0f0f0');
  });

  it('has no colour for the gray125 pattern Excel always writes second', () => {
    const fills = s.readFills(styles('<fills><fill><patternFill patternType="gray125"/></fill></fills>'));
    assert.deepStrictEqual(fills[0], {});
  });
});

describe('fonts', () => {
  it('reads weight, slant and an explicit colour', () => {
    const fonts = s.readFonts(styles('<fonts><font><b/><i/><color rgb="FFFF0000"/><sz val="14"/></font></fonts>'));
    assert.strictEqual(fonts[0]['font-weight'], 'bold');
    assert.strictEqual(fonts[0]['font-style'], 'italic');
    assert.strictEqual(fonts[0].color, '#ff0000');
    assert.strictEqual(fonts[0]['font-size'], '14pt');
  });

  it('leaves a theme-coloured font\'s colour to the reader', () => {
    const fonts = s.readFonts(styles('<fonts><font><color theme="1"/><sz val="11"/></font></fonts>'));
    assert.strictEqual(fonts[0].color, undefined);
  });
});

describe('borders', () => {
  it('turns a named line weight into a width and keeps its colour', () => {
    const borders = s.readBorders(styles('<borders><border>'
      + '<left style="thin"><color rgb="FF808080"/></left>'
      + '<top style="thick"><color rgb="FF000000"/></top></border></borders>'));
    assert.strictEqual(borders[0]['border-left'], '1px solid #808080');
    assert.strictEqual(borders[0]['border-top'], '2px solid #000000');
  });

  it('draws no edge for a side the border does not state', () => {
    const borders = s.readBorders(styles('<borders><border><left/><right/><top/><bottom/></border></borders>'));
    assert.deepStrictEqual(borders[0], {});
  });
});

describe('resolving a cell format', () => {
  const sheet = styles(
    '<fonts><font/><font><b/></font></fonts>'
    + '<fills><fill><patternFill patternType="none"/></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FF4080C0"/></patternFill></fill></fills>'
    + '<borders><border/><border><top style="thin"><color rgb="FF808080"/></top></border></borders>'
    + '<cellXfs><xf fontId="0" fillId="0" borderId="0"/>'
    + '<xf fontId="1" fillId="1" borderId="1"/></cellXfs>');
  const read = s.readStyles(sheet);

  it('gathers the font, fill and border the xf names', () => {
    const css = read.format(1);
    assert.strictEqual(css['font-weight'], 'bold', 'from font 1');
    assert.strictEqual(css.background, '#4080c0', 'from fill 1');
    assert.strictEqual(css['border-top'], '1px solid #808080', 'from border 1');
  });

  it('is empty for the default xf that names nothing', () => {
    assert.deepStrictEqual(read.format(0), {});
  });

  it('reads the alignment an xf states', () => {
    const one = s.readStyles(styles('<cellXfs><xf><alignment horizontal="center" vertical="center"/></xf></cellXfs>'));
    assert.strictEqual(one.format(0)['text-align'], 'center');
    assert.strictEqual(one.format(0)['vertical-align'], 'middle');
  });
});

describe('column widths', () => {
  it('turns Excel\'s character width into pixels, one entry per column', () => {
    const cols = s.columnWidths('<worksheet><cols>'
      + '<col min="1" max="1" width="16" customWidth="1"/>'
      + '<col min="3" max="4" width="8"/></cols></worksheet>');
    assert.strictEqual(cols[0].width, '112px'); // 16 * 7
    assert.strictEqual(cols[1], undefined, 'a column with no stated width is left alone');
    assert.strictEqual(cols[2].width, '56px');
    assert.strictEqual(cols[3].width, '56px', 'a col spanning min..max fills every column');
  });
});
