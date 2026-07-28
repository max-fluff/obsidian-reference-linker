'use strict';

// Translating OpenDocument's formatting into CSS. ODF writes real lengths rather than counting
// twentieths of a point, so the traps are different from Word's: units that CSS does not share,
// and a style table split across two files.

const { describe, it, assert } = require('../src/shared/testing/harness');
const { installStubs } = require('../src/shared/testing/stubs');

installStubs();

const s = require('../src/formats/odf-styles');

describe('lengths', () => {
  it('converts the units a document is written in to points', () => {
    assert.strictEqual(Math.round(s.points('2.54cm')), 72);
    assert.strictEqual(Math.round(s.points('25.4mm')), 72);
    assert.strictEqual(s.points('1in'), 72);
    assert.strictEqual(s.points('12pt'), 12);
  });

  it('is null for anything that is not a length', () => {
    // A bad declaration is worse than a missing one, so a guess is not made.
    assert.strictEqual(s.points('normal'), null);
    assert.strictEqual(s.points('100%'), null);
    assert.strictEqual(s.points(''), null);
  });
});

describe('text properties', () => {
  it('takes the font from either of the two ways a document names it', () => {
    assert.strictEqual(s.textCss('<style:text-properties fo:font-family="Cambria"/>')['font-family'], '"Cambria", serif');
    assert.strictEqual(s.textCss('<style:text-properties style:font-name="Arial"/>')['font-family'], '"Arial", sans-serif');
  });

  it('carries weight, slant and colour across', () => {
    const css = s.textCss('<style:text-properties fo:font-weight="bold" fo:font-style="italic" fo:color="#ff0000"/>');
    assert.strictEqual(css['font-weight'], 'bold');
    assert.strictEqual(css['font-style'], 'italic');
    assert.strictEqual(css.color, '#ff0000');
  });

  it('reads underline and strike from their own style attributes', () => {
    const css = s.textCss('<style:text-properties style:text-underline-style="solid" style:text-line-through-style="solid"/>');
    assert.strictEqual(css['text-decoration'], 'underline line-through');
  });

  it('does not underline for a style of "none"', () => {
    assert.strictEqual(s.textCss('<style:text-properties style:text-underline-style="none"/>')['text-decoration'], undefined);
  });

  it('reads a negative text position as a subscript', () => {
    assert.strictEqual(s.textCss('<style:text-properties style:text-position="-33% 58%"/>')['vertical-align'], 'sub');
    assert.strictEqual(s.textCss('<style:text-properties style:text-position="33% 58%"/>')['vertical-align'], 'super');
  });
});

describe('paragraph properties', () => {
  it('maps ODF\'s alignment names onto CSS ones', () => {
    assert.strictEqual(s.paraCss('<style:paragraph-properties fo:text-align="start"/>')['text-align'], 'left');
    assert.strictEqual(s.paraCss('<style:paragraph-properties fo:text-align="justify"/>')['text-align'], 'justify');
  });

  it('converts margins to points', () => {
    const css = s.paraCss('<style:paragraph-properties fo:margin-top="0.5cm" fo:margin-left="1in"/>');
    assert.strictEqual(css['margin-top'], '14.17pt');
    assert.strictEqual(css['padding-left'], '72pt');
  });

  it('keeps a percentage line height as a multiple, not as a length', () => {
    // "150%" is already what CSS means; putting it through the length parser drops it entirely.
    assert.strictEqual(s.paraCss('<style:paragraph-properties fo:line-height="150%"/>')['line-height'], '1.5');
    assert.strictEqual(s.paraCss('<style:paragraph-properties fo:line-height="14pt"/>')['line-height'], '14pt');
  });
});

describe('cell properties', () => {
  it('carries a border across as the document writes it', () => {
    assert.strictEqual(s.cellCss('<style:table-cell-properties fo:border="0.5pt solid #000000"/>').border, '0.5pt solid #000000');
  });

  it('draws no edge where the document says none', () => {
    assert.strictEqual(s.cellCss('<style:table-cell-properties fo:border-left="none"/>')['border-left'], '0');
  });
});

describe('the style table', () => {
  // A document keeps its named styles in styles.xml and generates one-off ones into content.xml
  // for direct formatting; a paragraph names either, so both have to be read.
  const stylesXml = '<office:styles>'
    + '<style:style style:name="Standard" style:family="paragraph">'
    + '<style:text-properties fo:font-size="10pt"/></style:style>'
    + '<style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard">'
    + '<style:text-properties fo:font-weight="bold"/>'
    + '<style:paragraph-properties fo:text-align="center"/></style:style>'
    + '</office:styles>';
  const contentXml = '<office:automatic-styles>'
    + '<style:style style:name="P1" style:family="paragraph" style:parent-style-name="Heading">'
    + '<style:text-properties fo:font-size="20pt"/></style:style>'
    + '</office:automatic-styles>';
  const table = s.readStyles(contentXml, stylesXml);

  it('reads styles out of both files', () => {
    assert.ok(table.has('Standard'), 'a named style from styles.xml');
    assert.ok(table.has('P1'), 'an automatic style from content.xml');
  });

  it('inherits through the parent chain, nearest last', () => {
    const css = s.styleCss(table, 'P1');
    assert.strictEqual(css['font-size'], '20pt', 'P1\'s own size wins');
    assert.strictEqual(css['font-weight'], 'bold', 'from Heading');
    assert.strictEqual(css['text-align'], 'center', 'from Heading');
  });

  it('is empty for a style the document does not have', () => {
    assert.deepStrictEqual(s.styleCss(table, 'Nope'), {});
  });

  it('does not hang on a style that is its own parent', () => {
    const looped = s.readStyles('', '<office:styles>'
      + '<style:style style:name="A" style:parent-style-name="B"/>'
      + '<style:style style:name="B" style:parent-style-name="A"/></office:styles>');
    assert.strictEqual(s.chain(looped, 'A').length, 2);
  });
});

describe('the page', () => {
  const stylesXml = '<office:automatic-styles><style:page-layout style:name="pm1">'
    + '<style:page-layout-properties fo:page-width="21.001cm" fo:page-height="29.7cm"'
    + ' fo:margin-top="2cm" fo:margin-left="2cm" fo:margin-right="2cm" fo:margin-bottom="2cm"/>'
    + '</style:page-layout></office:automatic-styles>';

  it('reads an A4 sheet out of its centimetres', () => {
    const page = s.pageOf(stylesXml);
    assert.strictEqual(Math.round(page.width), 595);
    assert.strictEqual(Math.round(page.height), 842);
    assert.strictEqual(Math.round(page.left), 57);
  });

  it('is null for a file that declares no page', () => {
    assert.strictEqual(s.pageOf('<office:styles/>'), null);
    assert.strictEqual(s.pageOf(''), null);
  });

  it('takes the layout the master page names, not the first one in the file', () => {
    // A presentation carries a layout for its notes as well as for its slides, and the notes
    // one comes first: taken at face value a 16:9 deck previews as an A4 sheet in portrait.
    const twoLayouts = '<office:automatic-styles>'
      + '<style:page-layout style:name="PMnotes"><style:page-layout-properties'
      + ' fo:page-width="21cm" fo:page-height="29.7cm"/></style:page-layout>'
      + '<style:page-layout style:name="PMslide"><style:page-layout-properties'
      + ' fo:page-width="25.4cm" fo:page-height="14.29cm"/></style:page-layout>'
      + '</office:automatic-styles>'
      + '<office:master-styles><style:master-page style:name="Default" style:page-layout-name="PMslide"/>'
      + '</office:master-styles>';
    const page = s.pageOf(twoLayouts);
    assert.strictEqual(Math.round(page.width), 720, 'the slide, not the notes sheet');
    assert.ok(page.width > page.height, 'a deck is landscape');
  });
});
