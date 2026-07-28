'use strict';

// The shared grid-to-table conversion, which ods, xlsx and csv all render through. A cell is a
// bare string or a `{ text, cls }` that carries its own formatting; the used range is trimmed so
// a sheet that starts away from A1 does not render a blank rim.

const { describe, it, assert } = require('../src/shared/testing/harness');
const { installStubs } = require('../src/shared/testing/stubs');

installStubs();

const { gridToHtml, cellText } = require('../src/formats/util');

describe('cellText', () => {
  it('reads the text of a bare string or a rich cell alike', () => {
    assert.strictEqual(cellText('x'), 'x');
    assert.strictEqual(cellText({ text: 'y', cls: 'a' }), 'y');
    assert.strictEqual(cellText(''), '');
    assert.strictEqual(cellText(undefined), '');
  });
});

describe('gridToHtml', () => {
  it('promotes the first row to a header by default', () => {
    const html = gridToHtml([['A', 'B'], ['1', '2']]);
    assert.ok(/<th>A<\/th><th>B<\/th>/.test(html), html);
    assert.ok(/<td>1<\/td><td>2<\/td>/.test(html), html);
  });

  it('leaves every row a body row when told there is no header', () => {
    const html = gridToHtml([['1', '2']], { header: false });
    assert.ok(!/<th/.test(html), html);
    assert.ok(/<td>1<\/td>/.test(html), html);
  });

  it('carries a rich cell\'s class onto its element', () => {
    const html = gridToHtml([[{ text: 'hi', cls: 'x3' }]], { header: false });
    assert.ok(/<td class="x3">hi<\/td>/.test(html), html);
  });

  it('writes a colgroup from the column widths it is given', () => {
    const html = gridToHtml([['a', 'b']], { header: false, cols: [{ width: '90px' }, {}] });
    assert.ok(/<colgroup><col style="width:90px"><col><\/colgroup>/.test(html), html);
  });

  it('lines a column\'s width up with the used range, not with A1', () => {
    // A sheet whose data starts at the second column must apply that column's width to what is
    // drawn as the first, or every width lands one column to the left.
    const html = gridToHtml([['', 'body']], { header: false, cols: [{ width: '10px' }, { width: '90px' }] });
    assert.ok(/<col style="width:90px">/.test(html), html);
    assert.ok(!/10px/.test(html), html);
  });

  it('trims a grid that does not start at A1 to its used range', () => {
    const html = gridToHtml([['', '', ''], ['', 'x', ''], ['', 'y', '']], { header: false });
    assert.ok(/<td>x<\/td>/.test(html) && /<td>y<\/td>/.test(html), html);
    assert.ok(!/<td><\/td>/.test(html), 'the empty rim was rendered: ' + html);
  });

  it('escapes cell text that looks like markup', () => {
    assert.ok(gridToHtml([['a<b>&c']], { header: false }).includes('a&lt;b&gt;&amp;c'));
  });

  it('is null when nothing is filled', () => {
    assert.strictEqual(gridToHtml([['', ''], ['', '']]), null);
    assert.strictEqual(gridToHtml([]), null);
  });
});

describe('a merged cell in the grid', () => {
  const { spanning, COVERED } = require('../src/formats/util');

  it('spans the cells it covers and draws none of them', () => {
    const html = gridToHtml([[spanning('Total', 3, 1), COVERED, COVERED], ['a', 'b', 'c']], { header: false });
    assert.ok(/<td colspan="3">Total<\/td>/.test(html), html);
    assert.strictEqual((html.match(/<tr>/g) || []).length, 2, html);
    assert.strictEqual(html.split('</tr>')[0].match(/<td/g).length, 1, 'the covered cells were drawn: ' + html);
  });

  it('spans down as well as across', () => {
    const html = gridToHtml([[spanning('Q1', 1, 2), 'x'], [COVERED, 'y']], { header: false });
    assert.ok(/<td rowspan="2">Q1<\/td>/.test(html), html);
  });

  it('keeps the columns a merge covers inside the used range', () => {
    // The range is measured on filled cells, and the cells a merge covers hold no text of their
    // own: counted as empty, those columns are trimmed away and the span is clamped with them.
    const html = gridToHtml([[spanning('Report', 3, 1), COVERED, COVERED]], { header: false });
    assert.ok(/colspan="3"/.test(html), html);
  });

  it('clamps a span that reaches past what is drawn', () => {
    // A merge stated over 12 columns in a grid trimmed to 2 would add ten columns the table
    // does not have, and every row below it would sit under the wrong heading.
    const html = gridToHtml([[spanning('Wide', 12, 4), COVERED], ['a', 'b']], { header: false });
    assert.ok(/colspan="2"/.test(html), html);
    assert.ok(/rowspan="2"/.test(html), html);
  });
});
