'use strict';

// OpenDocument shares one content.xml across three shapes: odt is headings, odp is slides,
// ods is sheets. The outline is read per kind; the text preview is common.

const { describe, it, assert } = require('../src/shared/testing/harness');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readOutline, readSection } = require('../src/formats/odf');
const { buildOdt, buildOdp, buildOds, writeZip } = require('./helpers/ooxml');

const tmp = (name, buf) => {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'reflinker-')), name);
  fs.writeFileSync(p, buf);
  return p;
};

describe('odt (text)', () => {
  const doc = () => tmp('a.odt', buildOdt([
    { heading: 'Introduction', paras: ['First para.', 'Second para.'] },
    { heading: 'Method', paras: ['How it works.'] },
    { heading: 'Results', paras: ['What happened.'] },
  ]));

  it('reads headings in order', async () => {
    assert.deepStrictEqual(await readOutline(doc(), 'odt'), [
      { title: 'Introduction', position: 1 },
      { title: 'Method', position: 2 },
      { title: 'Results', position: 3 },
    ]);
  });

  it('reads a section from its heading to the next', async () => {
    const sec = await readSection(doc(), 'odt', 1);
    assert.strictEqual(sec.title, 'Introduction');
    assert.deepStrictEqual(sec.body, ['First para.', 'Second para.']);
    assert.strictEqual(sec.total, 3);
  });

  it('reads the last section to the end', async () => {
    assert.deepStrictEqual((await readSection(doc(), 'odt', 3)).body, ['What happened.']);
  });

  it('counts the headings it skips, so a position still lands on its own section', async () => {
    // An empty heading is how a document leaves a gap. It cannot be listed, but it is still a
    // section: numbering only the named ones sends every entry to the section before it.
    const file = tmp('a.odt', buildOdt([
      { heading: '', paras: ['A spacer.'] },
      { heading: 'Real', paras: ['The one it names.'] },
    ]));
    assert.deepStrictEqual(await readOutline(file, 'odt'), [{ title: 'Real', position: 2 }]);
    assert.deepStrictEqual((await readSection(file, 'odt', 2)).body, ['The one it names.']);
    // The heading contributes no line of its own, so taking the first one off regardless eats
    // the paragraph that opens the section.
    assert.deepStrictEqual((await readSection(file, 'odt', 1)).body, ['A spacer.']);
  });
});

describe('odt to structured html', () => {
  const { odtToHtml, odtSectionXml } = require('../src/formats/odf');
  const body = '<text:h text:outline-level="1">Intro</text:h>'
    + '<text:p>First <text:span>para</text:span> here.</text:p>'
    + '<text:list><text:list-item><text:p>one</text:p></text:list-item>'
    + '<text:list-item><text:p>two</text:p></text:list-item></text:list>'
    + '<table:table table:name="T"><table:table-row>'
    + '<table:table-cell><text:p>A</text:p></table:table-cell>'
    + '<table:table-cell><text:p>B</text:p></table:table-cell></table:table-row></table:table>'
    + '<text:p><draw:frame><draw:image xlink:href="Pictures/1.png"/></draw:frame></text:p>'
    + '<text:h text:outline-level="2">Next</text:h><text:p>Second bit.</text:p>';

  it('maps a heading to its level', () => {
    assert.ok(odtToHtml('<text:h text:outline-level="3">X</text:h>').startsWith('<h3>X</h3>'));
  });

  it('unwraps a span that says nothing about its text', () => {
    assert.strictEqual(odtToHtml('<text:p>a <text:span>b</text:span> c</text:p>'), '<p>a b c</p>');
  });

  it('keeps a span that carries formatting, as the class for it', () => {
    const { readStyles } = require('../src/formats/odf-styles');
    const { sheet } = require('../src/formats/css');
    const styles = readStyles('<office:automatic-styles><style:style style:name="T1" style:family="text">'
      + '<style:text-properties fo:font-weight="bold"/></style:style></office:automatic-styles>', '');
    const ctx = { styles, sheet: sheet('o') };
    const html = odtToHtml('<text:p>a <text:span text:style-name="T1">b</text:span> c</text:p>', ctx);
    assert.strictEqual(html, '<p>a <span class="o0">b</span> c</p>');
    assert.strictEqual(ctx.sheet.text(), '.o0{font-weight:bold}');
  });

  it('turns a list into ul/li', () => {
    assert.ok(odtToHtml(body).includes('<ul><li><p>one</p></li><li><p>two</p></li></ul>'));
  });

  it('renders a table with its wrapper intact — the final strip must not eat <table>', () => {
    assert.ok(/<table><tr><td>A<\/td><td>B<\/td><\/tr><\/table>/.test(odtToHtml(body)), odtToHtml(body));
  });

  it('spans a merged cell in a document table, down as well as across', () => {
    const { readStyles } = require('../src/formats/odf-styles');
    const { sheet } = require('../src/formats/css');
    const merged = '<table:table table:name="T">'
      + '<table:table-row><table:table-cell table:number-columns-spanned="2" table:number-rows-spanned="2">'
      + '<text:p>Wide</text:p></table:table-cell><table:table-cell><text:p>C</text:p></table:table-cell></table:table-row>'
      + '<table:table-row><table:covered-table-cell/><table:covered-table-cell/>'
      + '<table:table-cell><text:p>D</text:p></table:table-cell></table:table-row></table:table>';
    const out = odtToHtml(merged, { styles: readStyles('', ''), sheet: sheet('o') });
    assert.ok(/<td colspan="2" rowspan="2"><p>Wide<\/p><\/td>/.test(out), out);
    assert.ok(/<tr><td><p>D<\/p><\/td><\/tr>/.test(out), 'a covered cell was drawn: ' + out);
  });

  it('keeps an image inside a paragraph rather than stripping it', () => {
    assert.ok(odtToHtml(body).includes('<img src="Pictures/1.png">'));
  });

  it('carries a subsection along with the section that contains it', () => {
    // "Next" is a level-2 heading under the level-1 "Intro", so it is part of that section.
    // Ending at the next heading of any level leaves a chapter title previewing as nothing but
    // its own name, which is what a document whose first subheading follows straight on does.
    const s1 = odtSectionXml(body, 1);
    assert.strictEqual(s1.title, 'Intro');
    assert.strictEqual(s1.total, 2);
    assert.ok(odtToHtml(s1.xml).includes('Second bit'), 'the level-2 subsection was cut off');
  });

  it('ends a section at the next heading of the same level', () => {
    const siblings = '<text:h text:outline-level="1">One</text:h><text:p>First body.</text:p>'
      + '<text:h text:outline-level="1">Two</text:h><text:p>Second body.</text:p>';
    const s1 = odtToHtml(odtSectionXml(siblings, 1).xml);
    assert.ok(s1.includes('First body.'), s1);
    assert.ok(!s1.includes('Second body.'), 'a sibling section leaked in');
  });

  it('ends a section at the next heading of a shallower level', () => {
    const nested = '<text:h text:outline-level="2">Deep</text:h><text:p>Under deep.</text:p>'
      + '<text:h text:outline-level="1">Top</text:h><text:p>Under top.</text:p>';
    const s1 = odtToHtml(odtSectionXml(nested, 1).xml);
    assert.ok(s1.includes('Under deep.'), s1);
    assert.ok(!s1.includes('Under top.'), 'a shallower heading did not close the section');
  });

  it('still shows the last section to the end of the document', () => {
    assert.ok(odtToHtml(odtSectionXml(body, 2).xml).includes('Second bit'));
  });
});

describe('odp (slides)', () => {
  const doc = () => tmp('a.odp', buildOdp([
    { title: 'Agenda', body: ['Point one', 'Point two'] },
    { title: 'Details', body: ['The specifics'] },
  ]));

  it('reads slide titles in order', async () => {
    assert.deepStrictEqual((await readOutline(doc(), 'odp')).map((s) => s.title), ['Agenda', 'Details']);
  });

  it('separates the slide title from its body', async () => {
    const sec = await readSection(doc(), 'odp', 1);
    assert.strictEqual(sec.title, 'Agenda');
    assert.deepStrictEqual(sec.body, ['Point one', 'Point two']);
  });

  it('takes the title from the title frame even when body text comes first', async () => {
    // The fixture writes the body frame before the title frame; a reader that took the first
    // text line would answer "Point one" here.
    assert.strictEqual((await readOutline(doc(), 'odp'))[0].title, 'Agenda');
    assert.strictEqual((await readSection(doc(), 'odp', 1)).title, 'Agenda');
  });

  it('falls back to the first line for a slide with no title frame', async () => {
    const file = tmp('a.odp', buildOdp([{ body: ['Only body here'] }]));
    assert.strictEqual((await readOutline(file, 'odp'))[0].title, 'Only body here');
  });
});

describe('ods (sheets)', () => {
  const doc = () => tmp('a.ods', buildOds([
    { name: 'Budget', cells: ['Rent', '1200'] },
    { name: 'Summary', cells: ['Total'] },
  ]));

  it('reads sheet names in order', async () => {
    assert.deepStrictEqual((await readOutline(doc(), 'ods')).map((s) => s.title), ['Budget', 'Summary']);
  });

  it('shows the sheet cells as its preview', async () => {
    const sec = await readSection(doc(), 'ods', 1);
    assert.strictEqual(sec.title, 'Budget');
    assert.deepStrictEqual(sec.body, ['Rent', '1200']);
  });
});

describe('ods sheet as a table', () => {
  const { sheetGrid, sheetTable } = require('../src/formats/odf');
  const { elements } = require('../src/xml');
  const { openZip } = require('../src/zip');
  // The first (only) table:table of a built .ods.
  const tableXml = (rows) => {
    const zip = openZip(tmp('a.ods', buildOds([{ name: 'S', rows }])));
    return elements(zip.text('content.xml'), 'table:table')[0];
  };

  it('reads the grid row by row', () => {
    const grid = sheetGrid(tableXml([['A', 'B'], ['1', '2']]));
    assert.deepStrictEqual(grid, [['A', 'B'], ['1', '2']]);
  });

  it('promotes no row to a header, as a workbook does not', () => {
    // A sheet says which of its rows is a header by formatting it. Promoting the first one turns
    // a column of values into a heading whenever the sheet starts with data.
    const html = sheetTable(tableXml([['Name', 'Qty'], ['Rent', '1200']]));
    assert.ok(!/<th/.test(html), html);
    assert.ok(/<td>Name<\/td><td>Qty<\/td>.*<td>Rent<\/td><td>1200<\/td>/s.test(html), html);
  });

  it('escapes cell text that looks like markup', () => {
    // A real .ods stores "a<b>&c" as the encoded "a&lt;b&gt;&amp;c" in the XML.
    const html = sheetTable(tableXml([['a&lt;b&gt;&amp;c']]));
    assert.ok(html.includes('a&lt;b&gt;&amp;c'), html);
  });

  it('spans a merged cell and holds the place of each one it covers', () => {
    // ODF writes a table:covered-table-cell for every place a merge takes. Read by tag name
    // alone those are invisible, and the cells after them each move one column to the left.
    const html = sheetTable(tableXml([
      [{ text: '2024', cols: 3 }, { covered: true }, { covered: true }],
      ['Q1', 'Q2', 'Q3'],
    ]));
    assert.strictEqual(html,
      '<table><tr><td colspan="3">2024</td></tr><tr><td>Q1</td><td>Q2</td><td>Q3</td></tr></table>');
  });

  it('spans down a merge stated across rows', () => {
    const html = sheetTable(tableXml([
      [{ text: 'North', rows: 2 }, 'Q1'],
      [{ covered: true }, 'Q2'],
    ]));
    assert.ok(/<td rowspan="2">North<\/td>/.test(html), html);
    assert.ok(/<tr><td>Q2<\/td><\/tr>/.test(html), 'the covered cell was drawn: ' + html);
  });

  it('keeps the columns a merge covers inside the used range', () => {
    // The range is measured on the cells that hold text, and a covered one holds none. Left
    // out, the columns a title spans are trimmed off and the title stops spanning them.
    const html = sheetTable(tableXml([[{ text: '2024', cols: 3 }, { covered: true }, { covered: true }]]));
    assert.ok(/colspan="3"/.test(html), html);
  });

  it('trims trailing empty rows and columns to the used range', () => {
    const grid = sheetGrid(tableXml([['A', '', ''], ['', '', ''], ['B', '', '']]));
    assert.deepStrictEqual(grid, [['A'], [''], ['B']]); // 3rd column and any 4th row dropped
  });

  it('trims by a styled cell\'s text, not by the cell being present', () => {
    // A cell that carries a style but no value is still empty. Judging the used range by the
    // cell object rather than its text pads the sheet back out with the blank rim.
    const { readStyles } = require('../src/formats/odf-styles');
    const { sheet } = require('../src/formats/css');
    const styles = '<style:style style:name="ce1" style:family="table-cell">'
      + '<style:table-cell-properties fo:background-color="#ff0000"/></style:style>';
    const zip = openZip(tmp('a.ods', buildOds([{ name: 'S', rows: [['A', { text: '', style: 'ce1' }]] }], { styles })));
    const table = elements(zip.text('content.xml'), 'table:table')[0];
    const ctx = { styles: readStyles(zip.text('content.xml'), ''), sheet: sheet('o') };
    assert.deepStrictEqual(sheetGrid(table, ctx).map((r) => r.length), [1]);
  });

  it('expands a repeated column but stops at the used range', () => {
    // A cell repeated to fill the row (common in ODS) must not become 1000 columns.
    const zip = openZip(tmp('a.ods', writeZip([
      { name: 'mimetype', data: 'application/vnd.oasis.opendocument.spreadsheet' },
      { name: 'content.xml', data: '<?xml version="1.0"?><office:document-content xmlns:office="o" xmlns:table="t" xmlns:text="x">'
        + '<office:body><office:spreadsheet><table:table table:name="S"><table:table-row>'
        + '<table:table-cell><text:p>X</text:p></table:table-cell>'
        + '<table:table-cell table:number-columns-repeated="1000"/>'
        + '</table:table-row></table:table></office:spreadsheet></office:body></office:document-content>' },
    ])));
    const grid = sheetGrid(elements(zip.text('content.xml'), 'table:table')[0]);
    assert.deepStrictEqual(grid, [['X']]); // the 1000 empty repeats trimmed away
  });

  it('is null for an empty sheet', () => {
    assert.strictEqual(sheetTable(tableXml([['', '']])), null);
  });
});

describe('ods cell formatting', () => {
  const { sheetTable } = require('../src/formats/odf');
  const { readStyles } = require('../src/formats/odf-styles');
  const { sheet } = require('../src/formats/css');
  const { elements } = require('../src/xml');
  const { openZip } = require('../src/zip');

  const STYLES = '<style:style style:name="ce1" style:family="table-cell">'
    + '<style:table-cell-properties fo:background-color="#c5e0b4" fo:border="0.5pt solid #000000"/>'
    + '<style:text-properties fo:font-weight="bold"/></style:style>'
    + '<style:style style:name="co1" style:family="table-column">'
    + '<style:table-column-properties style:column-width="2.5cm"/></style:style>';

  // The rendered table and the stylesheet it was written against, from a built .ods.
  const render = (sheets) => {
    const zip = openZip(tmp('a.ods', buildOds(sheets, { styles: STYLES })));
    const ctx = { styles: readStyles(zip.text('content.xml'), ''), sheet: sheet('o') };
    const table = elements(zip.text('content.xml'), 'table:table')[0];
    return { html: sheetTable(table, ctx), css: ctx.sheet.text() };
  };

  it('carries a cell\'s fill, border and weight across as its own class', () => {
    const { html, css } = render([{ name: 'S', rows: [[{ text: 'Total', style: 'ce1' }, 'plain']] }]);
    const cls = /<td class="(o\d+)">Total<\/td>/.exec(html);
    assert.ok(cls, html);
    assert.ok(/<td>plain<\/td>/.test(html), 'an unstyled cell gets no class: ' + html);
    assert.ok(css.includes('background:#c5e0b4'), css);
    assert.ok(css.includes('border:0.5pt solid #000000'), css);
    assert.ok(css.includes('font-weight:bold'), css);
  });

  it('states a column\'s declared width, converted to points', () => {
    const { html } = render([{ name: 'S', cols: ['co1', ''], rows: [['a', 'b']] }]);
    assert.ok(/<colgroup><col style="width:70.87pt"><col><\/colgroup>/.test(html), html); // 2.5cm
  });

  it('gives every column a repeated column stands for the same width', () => {
    const zip = openZip(tmp('a.ods', writeZip([
      { name: 'mimetype', data: 'application/vnd.oasis.opendocument.spreadsheet', store: true },
      { name: 'content.xml', data: '<?xml version="1.0"?><office:document-content xmlns:office="o" '
        + 'xmlns:table="t" xmlns:text="x" xmlns:style="s">'
        + '<office:automatic-styles>' + STYLES + '</office:automatic-styles>'
        + '<office:body><office:spreadsheet><table:table table:name="S">'
        + '<table:table-column table:style-name="co1" table:number-columns-repeated="2"/>'
        + '<table:table-row><table:table-cell><text:p>a</text:p></table:table-cell>'
        + '<table:table-cell><text:p>b</text:p></table:table-cell></table:table-row>'
        + '</table:table></office:spreadsheet></office:body></office:document-content>' },
    ])));
    const ctx = { styles: readStyles(zip.text('content.xml'), ''), sheet: sheet('o') };
    const html = sheetTable(elements(zip.text('content.xml'), 'table:table')[0], ctx);
    assert.strictEqual((html.match(/width:70.87pt/g) || []).length, 2, html);
  });
});

describe('odf through the registry', () => {
  const formats = require('../src/formats');

  it('threads the extension so a slide deck is not read as a text document', async () => {
    // odt/ods/odp share one reader; the registry must pass the ext or an .odp reads as odt
    // (headings) and yields nothing.
    const file = tmp('a.odp', buildOdp([{ title: 'Kickoff', body: ['Welcome'] }]));
    assert.deepStrictEqual((await formats.outline('odp', file)).map((s) => s.title), ['Kickoff']);
  });

  it('reads a spreadsheet through the registry too', async () => {
    const file = tmp('a.ods', buildOds([{ name: 'Sheet1', cells: ['x'] }]));
    assert.deepStrictEqual((await formats.outline('ods', file)).map((s) => s.title), ['Sheet1']);
  });

  it('reads the drawing template the same way as the drawing', async () => {
    const file = tmp('a.otg', require('./helpers/ooxml').buildOdg([{ name: 'Flowchart' }]));
    assert.deepStrictEqual(await formats.outline('otg', file), [{ title: 'Flowchart', position: 1 }]);
  });

  it('reads a template as the document it makes', async () => {
    // ott/ots/otp hold the same content.xml; only the mimetype differs. Routed as themselves
    // they fall through to the odt reader, and a spreadsheet template yields nothing.
    const file = tmp('a.ots', buildOds([{ name: 'Prices', cells: ['x'] }]));
    assert.deepStrictEqual((await formats.outline('ots', file)).map((s) => s.title), ['Prices']);
    assert.deepStrictEqual((await formats.outline('otp', tmp('a.otp', buildOdp([{ title: 'Kickoff' }]))))
      .map((s) => s.title), ['Kickoff']);
  });
});

describe('odg (drawing)', () => {
  const { buildOdg } = require('./helpers/ooxml');

  it('reads its pages the way a deck reads its slides', async () => {
    const file = tmp('a.odg', buildOdg([{ name: 'page1', lines: ['Start'] }, { name: 'page2', lines: ['End'] }]));
    assert.deepStrictEqual(await readOutline(file, 'odg'), [
      { title: 'Start', position: 1 },
      { title: 'End', position: 2 },
    ]);
  });

  it('names a page with no text after the page itself', async () => {
    // A drawing's pages are named in the file and shown by name; a page holding only shapes
    // would otherwise drop out of the outline and take the numbering of the rest with it.
    const file = tmp('a.odg', buildOdg([{ name: 'Flowchart' }, { name: 'Legend', lines: ['Key'] }]));
    assert.deepStrictEqual(await readOutline(file, 'odg'), [
      { title: 'Flowchart', position: 1 },
      { title: 'Key', position: 2 },
    ]);
    assert.strictEqual((await readSection(file, 'odg', 1)).title, 'Flowchart');
  });

  it('leaves a deck\'s slides unnamed, where draw:name is boilerplate', async () => {
    // Every slide PowerPoint or Impress writes carries draw:name="page1"; used as a title it
    // fills the outline with names no reader has ever seen. The skipped slide is still counted,
    // or the entry after it opens the blank one.
    const file = tmp('a.odp', buildOdp([{}, { title: 'Kickoff' }]));
    assert.deepStrictEqual(await readOutline(file, 'odp'), [{ title: 'Kickoff', position: 2 }]);
  });
});

describe('odf robustness', () => {
  it('is empty for a file that is not an odf zip', async () => {
    assert.deepStrictEqual(await readOutline(tmp('a.odt', Buffer.from('nope')), 'odt'), []);
  });
});

describe('the built fixtures are files an office suite will open', () => {
  // ODF requires mimetype to be the first member and stored uncompressed. Our reader does not
  // care, so a fixture that breaks the rule reads fine here and is reported as damaged by the
  // application — which is how these three ended up unopenable in the test vault.
  const firstMember = (buf) => ({
    signature: buf.readUInt32LE(0),
    method: buf.readUInt16LE(8),
    extraLen: buf.readUInt16LE(28),
    name: buf.slice(30, 30 + buf.readUInt16LE(26)).toString('utf8'),
  });

  for (const [ext, build] of [['odt', () => buildOdt([{ heading: 'H', paras: ['p'] }])],
    ['odp', () => buildOdp([{ title: 'T' }])],
    ['ods', () => buildOds([{ name: 'S', cells: ['x'] }])]]) {
    it('writes ' + ext + ' with mimetype first and uncompressed', () => {
      const m = firstMember(build());
      assert.strictEqual(m.signature, 0x04034b50);
      assert.strictEqual(m.name, 'mimetype');
      assert.strictEqual(m.method, 0, 'mimetype must be stored, not deflated');
      assert.strictEqual(m.extraLen, 0, 'mimetype must carry no extra field');
    });
  }

  it('still reads a stored member back', async () => {
    // Storing rather than deflating is a path through the zip reader of its own.
    assert.deepStrictEqual(await readOutline(tmp('a.odt', buildOdt([{ heading: 'Kept', paras: [] }])), 'odt'),
      [{ title: 'Kept', position: 1 }]);
  });
});

// Every case below is a shape taken from a file LibreOffice actually wrote. None of them
// appeared in a hand-built fixture, and each rendered as visible rubbish.
describe('odf as the applications really write it', () => {
  const { odtToHtml, readOutline: outlineOf, readSection: sectionOf } = require('../src/formats/odf');
  const NS = 'xmlns:office="o" xmlns:text="t" xmlns:draw="d" xmlns:table="tb" '
    + 'xmlns:presentation="p" xmlns:dc="dc" xmlns:svg="s"';
  const doc = (inner) => '<?xml version="1.0" encoding="UTF-8"?>\n<office:document-content ' + NS + '>\n'
    + inner + '\n</office:document-content>';
  const file = (name, inner) => tmp(name, writeZip([
    { name: 'mimetype', data: 'application/vnd.oasis.opendocument.text' },
    { name: 'content.xml', data: doc(inner) },
  ]));

  it('does not render the style preamble that sits before office:body', () => {
    // A real content.xml opens with kilobytes of font and style declarations. Converting the
    // whole file turned that into a wall of blank lines above the document.
    const html = odtToHtml(doc(
      '  <office:automatic-styles>\n    <style:style style:name="P1">\n'
      + '      <style:text-properties fo:font-size="12pt"/>\n    </style:style>\n'
      + '  </office:automatic-styles>\n'
      + '  <office:body>\n    <office:text>\n      <text:p>Real content.</text:p>\n'
      + '    </office:text>\n  </office:body>'));
    assert.strictEqual(html, '<p>Real content.</p>');
  });

  it('drops a comment instead of printing its author and timestamp', () => {
    // Keeping the text of every unrecognized element put "Miklos 2013-03-19T16:29:00" into the
    // middle of a sentence.
    const html = odtToHtml(doc('<office:body><office:text><text:p>Aaa'
      + '<office:annotation><dc:creator>Miklos</dc:creator><dc:date>2013-03-19T16:29:00</dc:date>'
      + '<text:p>a note</text:p></office:annotation>'
      + ' bbb</text:p></office:text></office:body>'));
    assert.strictEqual(html, '<p>Aaa bbb</p>');
  });

  it('emits only the blocks it knows, never the text of what is left over', () => {
    // The converter used to strip tags and keep whatever text was inside them, so any element
    // it did not understand emptied its contents into the document.
    const html = odtToHtml(doc('<office:body><office:text>'
      + '<text:sequence-decls><text:sequence-decl text:name="Illustration"/></text:sequence-decls>'
      + 'stray text<text:p>Kept.</text:p>more stray text'
      + '</office:text></office:body>'));
    assert.strictEqual(html, '<p>Kept.</p>');
  });

  it('collapses the indentation a pretty-printed paragraph is written with', () => {
    const html = odtToHtml(doc('<office:body><office:text>\n  <text:p>\n    one\n    two\n'
      + '  </text:p>\n</office:text></office:body>'));
    assert.strictEqual(html, '<p>one two</p>');
  });

  it('reads slide text out of a custom shape, not only out of a frame', async () => {
    // A deck converted from PowerPoint keeps its text in draw:custom-shape. Reading frames
    // alone found nothing at all and the deck indexed as having no slides.
    const odp = tmp('a.odp', writeZip([
      { name: 'mimetype', data: 'application/vnd.oasis.opendocument.presentation' },
      {
        name: 'content.xml',
        data: doc('<office:body><office:presentation><draw:page draw:name="page1">'
          + '<draw:custom-shape><text:p>Some Text</text:p></draw:custom-shape>'
          + '</draw:page></office:presentation></office:body>'),
      },
    ]));
    assert.deepStrictEqual(await outlineOf(odp, 'odp'), [{ title: 'Some Text', position: 1 }]);
  });

  it('still prefers the marked title shape over the first line on the slide', async () => {
    const odp = tmp('a.odp', writeZip([
      { name: 'mimetype', data: 'application/vnd.oasis.opendocument.presentation' },
      {
        name: 'content.xml',
        data: doc('<office:body><office:presentation><draw:page draw:name="page1">'
          + '<draw:custom-shape><text:p>Body first</text:p></draw:custom-shape>'
          + '<draw:frame presentation:class="title"><text:p>The Title</text:p></draw:frame>'
          + '</draw:page></office:presentation></office:body>'),
      },
    ]));
    assert.deepStrictEqual(await outlineOf(odp, 'odp'), [{ title: 'The Title', position: 1 }]);
    assert.deepStrictEqual((await sectionOf(odp, 'odp', 1)).body, ['Body first']);
  });

  it('does not count an empty self-closing paragraph as slide text', async () => {
    // <text:p/> inside a draw:image is how LibreOffice writes a picture with no caption.
    const odp = tmp('a.odp', writeZip([
      { name: 'mimetype', data: 'application/vnd.oasis.opendocument.presentation' },
      {
        name: 'content.xml',
        data: doc('<office:body><office:presentation><draw:page draw:name="page1">'
          + '<draw:frame><draw:image xlink:href="Pictures/a.jpg"><text:p/></draw:image></draw:frame>'
          + '</draw:page></office:presentation></office:body>'),
      },
    ]));
    assert.deepStrictEqual(await outlineOf(odp, 'odp'), []);
  });

  it('keeps a section slice free of the preamble too', async () => {
    const odt = file('a.odt',
      '<office:automatic-styles><style:style style:name="P1"/></office:automatic-styles>'
      + '<office:body><office:text><text:h text:outline-level="1">Intro</text:h>'
      + '<text:p>Body.</text:p></office:text></office:body>');
    const sec = await sectionOf(odt, 'odt', 1);
    assert.strictEqual(sec.title, 'Intro');
    assert.deepStrictEqual(sec.body, ['Body.']);
  });
});
