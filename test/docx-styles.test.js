'use strict';

// Translating Word's formatting into CSS. The units are the trap: Word counts font size in
// half-points, spacing in twentieths of a point and borders in eighths, and getting one wrong
// is a document rendered at twice or a twentieth of its size.

const { describe, it, assert } = require('../src/shared/testing/harness');
const { installStubs } = require('../src/shared/testing/stubs');

installStubs();

const s = require('../src/formats/docx-styles');
const { sheet, colour, fontFamily, pageCss } = require('../src/formats/css');

describe('run formatting', () => {
  it('reads a font size out of half-points', () => {
    assert.strictEqual(s.runCss('<w:rPr><w:sz w:val="22"/></w:rPr>')['font-size'], '11pt');
  });

  it('reads a colour, and leaves "auto" to the reader', () => {
    assert.strictEqual(s.runCss('<w:rPr><w:color w:val="FF0000"/></w:rPr>').color, '#ff0000');
    assert.strictEqual(s.runCss('<w:rPr><w:color w:val="auto"/></w:rPr>').color, undefined);
  });

  it('names the font and a generic to fall back to', () => {
    assert.strictEqual(s.runCss('<w:rPr><w:rFonts w:ascii="Cambria"/></w:rPr>')['font-family'], '"Cambria", serif');
    assert.strictEqual(s.runCss('<w:rPr><w:rFonts w:ascii="Consolas"/></w:rPr>')['font-family'], '"Consolas", monospace');
  });

  it('turns emphasis explicitly off when the document says so', () => {
    // A style can switch bold off to override the one it is based on; read as "absent" the
    // parent's bold would come through.
    assert.strictEqual(s.runCss('<w:rPr><w:b/></w:rPr>')['font-weight'], 'bold');
    assert.strictEqual(s.runCss('<w:rPr><w:b w:val="0"/></w:rPr>')['font-weight'], 'normal');
    assert.strictEqual(s.runCss('<w:rPr/>')['font-weight'], undefined);
  });

  it('collects underline and strike-through into one declaration', () => {
    const css = s.runCss('<w:rPr><w:u w:val="single"/><w:strike/></w:rPr>');
    assert.strictEqual(css['text-decoration'], 'underline line-through');
  });

  it('does not underline for w:u val="none"', () => {
    assert.strictEqual(s.runCss('<w:rPr><w:u w:val="none"/></w:rPr>')['text-decoration'], 'none');
  });
});

describe('paragraph formatting', () => {
  it('maps Word\'s alignment names onto CSS ones', () => {
    assert.strictEqual(s.paraCss('<w:pPr><w:jc w:val="both"/></w:pPr>')['text-align'], 'justify');
    assert.strictEqual(s.paraCss('<w:pPr><w:jc w:val="center"/></w:pPr>')['text-align'], 'center');
  });

  it('reads spacing out of twips', () => {
    const css = s.paraCss('<w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>');
    assert.strictEqual(css['margin-top'], '12pt');
    assert.strictEqual(css['margin-bottom'], '6pt');
  });

  it('reads automatic line spacing as a multiple, not as a length', () => {
    // w:line counts 240ths of a line when the rule is "auto"; as twips it would be 14pt of
    // leading on an 11pt font.
    assert.strictEqual(s.paraCss('<w:pPr><w:spacing w:line="276" w:lineRule="auto"/></w:pPr>')['line-height'], '1.15');
    assert.strictEqual(s.paraCss('<w:pPr><w:spacing w:line="360" w:lineRule="exact"/></w:pPr>')['line-height'], '18pt');
  });

  it('reads a hanging indent as a negative first line', () => {
    const css = s.paraCss('<w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>');
    assert.strictEqual(css['padding-left'], '36pt');
    assert.strictEqual(css['text-indent'], '-18pt');
  });
});

describe('borders', () => {
  it('reads a border width out of eighths of a point', () => {
    const css = s.borderCss('<w:tcPr><w:tcBorders><w:top w:val="single" w:sz="8" w:color="365F91"/></w:tcBorders></w:tcPr>', 'w:tcBorders');
    assert.strictEqual(css['border-top'], '1pt solid #365f91');
  });

  it('draws no line for an edge the document says is nil', () => {
    // Left as "absent" every cell grows an edge the table does not have.
    const css = s.borderCss('<w:tcPr><w:tcBorders><w:left w:val="nil"/></w:tcBorders></w:tcPr>', 'w:tcBorders');
    assert.strictEqual(css['border-left'], '0');
  });
});

describe('resolving a named style', () => {
  const stylesXml = '<w:styles>'
    + '<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="20"/></w:rPr></w:rPrDefault>'
    + '<w:pPrDefault><w:pPr><w:jc w:val="left"/></w:pPr></w:pPrDefault></w:docDefaults>'
    + '<w:style w:styleId="Base"><w:rPr><w:sz w:val="24"/><w:b/></w:rPr>'
    + '<w:pPr><w:jc w:val="center"/></w:pPr></w:style>'
    + '<w:style w:styleId="Derived"><w:basedOn w:val="Base"/><w:rPr><w:b w:val="0"/></w:rPr></w:style>'
    + '</w:styles>';
  const styles = s.readStyles(stylesXml);

  it('takes the document defaults when a paragraph names no style', () => {
    const css = s.paragraphCss(styles, '', null);
    assert.strictEqual(css['font-size'], '10pt');
    assert.strictEqual(css['text-align'], 'left');
  });

  it('lets the named style win over the defaults', () => {
    const css = s.paragraphCss(styles, '', 'Base');
    assert.strictEqual(css['font-size'], '12pt');
    assert.strictEqual(css['text-align'], 'center');
  });

  it('follows the chain a style is based on, nearest last', () => {
    const css = s.paragraphCss(styles, '', 'Derived');
    assert.strictEqual(css['font-size'], '12pt', 'the size came from Base through basedOn');
    assert.strictEqual(css['font-weight'], 'normal', 'Derived switched Base\'s bold off');
  });

  it('lets the paragraph\'s own formatting win over its style', () => {
    assert.strictEqual(s.paragraphCss(styles, '<w:pPr><w:jc w:val="right"/></w:pPr>', 'Base')['text-align'], 'right');
  });

  it('does not hang on a style based on itself', () => {
    const looped = s.readStyles('<w:styles><w:style w:styleId="A"><w:basedOn w:val="B"/></w:style>'
      + '<w:style w:styleId="B"><w:basedOn w:val="A"/></w:style></w:styles>');
    assert.deepStrictEqual(s.chain(looped, 'A').length, 2);
  });

  it('does not take the paragraph mark\'s formatting for the paragraph\'s', () => {
    // A w:pPr holds a w:rPr describing the pilcrow. Reading the first w:rPr in a style picks
    // that one up and gives every paragraph the formatting of its own end mark.
    const marked = s.readStyles('<w:styles><w:style w:styleId="M">'
      + '<w:pPr><w:rPr><w:sz w:val="96"/></w:rPr></w:pPr>'
      + '<w:rPr><w:sz w:val="24"/></w:rPr></w:style></w:styles>');
    assert.strictEqual(s.paragraphCss(marked, '', 'M')['font-size'], '12pt');
  });
});

describe('the page', () => {
  const body = '<w:body><w:p/><w:sectPr><w:pgSz w:w="12240" w:h="15840"/>'
    + '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body>';

  it('reads the page size and margins out of twips', () => {
    const page = s.pageOf(body);
    assert.strictEqual(page.width, 612); // 8.5in at 72pt
    assert.strictEqual(page.height, 792);
    assert.strictEqual(page.left, 72);
  });

  it('takes the body\'s section, not one that ended earlier', () => {
    const twoSections = '<w:body><w:p><w:pPr><w:sectPr><w:pgSz w:w="99" w:h="99"/></w:sectPr></w:pPr></w:p>'
      + '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body>';
    assert.strictEqual(s.pageOf(twoSections).width, 612);
  });

  it('is null for a document that declares no page', () => {
    assert.strictEqual(s.pageOf('<w:body><w:p/></w:body>'), null);
  });

  it('scales the page down to the width there is room for', () => {
    // 612pt is 816px, so a 408px box shows it at half size — and the proportions the author
    // chose survive, which laying it out small would not.
    assert.strictEqual(pageCss({ width: 612, left: 72, right: 72 }, 408).zoom, 0.5);
    assert.strictEqual(pageCss({ width: 612 }, 2000).zoom, 1, 'never blown up past its own size');
  });
});

describe('the stylesheet', () => {
  it('gives one class to two runs formatted the same way', () => {
    const sh = sheet('w');
    const a = sh.cls({ color: '#ff0000' });
    const b = sh.cls({ color: '#ff0000' });
    assert.strictEqual(a, b);
    assert.strictEqual(sh.text(), '.w0{color:#ff0000}');
  });

  it('has no class for nothing to say', () => {
    assert.strictEqual(sheet('w').cls({}), '');
    assert.strictEqual(sheet('w').cls({ color: null }), '');
  });

  it('can say what a table\'s own cells look like, not just the table', () => {
    // A table's borders live on its cells; there is no way to state that without a descendant
    // rule, and collapsed onto the table itself it paints one box instead of a grid.
    const sh = sheet('w');
    const cls = sh.cls({ 'border-top': '1pt solid #000' }, 'td');
    assert.strictEqual(sh.text(), '.' + cls + ' td{border-top:1pt solid #000}');
  });

  it('tells a rule for the element apart from one for its cells', () => {
    const sh = sheet('w');
    const own = sh.cls({ color: 'red' });
    const cells = sh.cls({ color: 'red' }, 'td');
    assert.notStrictEqual(own, cells);
  });

  it('orders declarations so the same formatting written two ways is one class', () => {
    const sh = sheet('w');
    assert.strictEqual(sh.cls({ color: 'red', 'font-size': '1pt' }), sh.cls({ 'font-size': '1pt', color: 'red' }));
  });
});

describe('colour and font helpers', () => {
  it('takes RRGGBB with or without a hash', () => {
    assert.strictEqual(colour('FF0000'), '#ff0000');
    assert.strictEqual(colour('#00ff00'), '#00ff00');
  });

  it('refuses anything that is not a colour', () => {
    assert.strictEqual(colour('auto'), null);
    assert.strictEqual(colour(''), null);
    assert.strictEqual(colour('rebeccapurple'), null);
  });

  it('is null for no font at all', () => {
    assert.strictEqual(fontFamily(''), null);
  });
});

describe('a table\'s look', () => {
  // Across a real corpus not one table states its borders on itself: they all name a table
  // style. Reading only the table gives every one of them no borders at all.
  const styles = s.readStyles('<w:styles>'
    + '<w:style w:styleId="Grid" w:type="table"><w:tblPr><w:tblBorders>'
    + '<w:top w:val="single" w:sz="8" w:color="4F81BD"/>'
    + '<w:insideH w:val="single" w:sz="4" w:color="4F81BD"/>'
    + '<w:insideV w:val="single" w:sz="4" w:color="4F81BD"/>'
    + '</w:tblBorders></w:tblPr></w:style>'
    + '<w:style w:styleId="Plain" w:type="table"><w:basedOn w:val="Grid"/></w:style>'
    + '</w:styles>');

  it('takes the borders from the style the table names', () => {
    const look = s.tableCss(styles, '<w:tblPr><w:tblStyle w:val="Grid"/></w:tblPr>');
    assert.strictEqual(look.table['border-top'], '1pt solid #4f81bd');
  });

  it('turns the lines between cells into every cell\'s own edges', () => {
    // insideH and insideV describe what separates two cells; CSS has no other way to say it.
    const look = s.tableCss(styles, '<w:tblPr><w:tblStyle w:val="Grid"/></w:tblPr>');
    assert.strictEqual(look.cell['border-top'], '0.5pt solid #4f81bd');
    assert.strictEqual(look.cell['border-left'], '0.5pt solid #4f81bd');
  });

  it('follows the chain a table style is based on', () => {
    const look = s.tableCss(styles, '<w:tblPr><w:tblStyle w:val="Plain"/></w:tblPr>');
    assert.strictEqual(look.table['border-top'], '1pt solid #4f81bd');
  });

  it('lets the table\'s own borders win over the style it names', () => {
    const look = s.tableCss(styles, '<w:tblPr><w:tblStyle w:val="Grid"/><w:tblBorders>'
      + '<w:top w:val="single" w:sz="24" w:color="FF0000"/></w:tblBorders></w:tblPr>');
    assert.strictEqual(look.table['border-top'], '3pt solid #ff0000');
  });

  it('has nothing to say for a table that names no style and states no borders', () => {
    assert.deepStrictEqual(s.tableCss(styles, '<w:tblPr/>'), { table: {}, cell: {} });
  });
});
