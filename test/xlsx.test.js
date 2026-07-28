'use strict';

// Excel workbooks: sheet order, the shared-string and date indirections, and the fact that a
// real sheet's used range starts wherever its author put it.

const { describe, it, assert } = require('../src/shared/testing/harness');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { installStubs } = require('../src/shared/testing/stubs');

installStubs();

const xlsx = require('../src/formats/xlsx');
const { gridToHtml } = require('../src/formats/util');
const { buildXlsx } = require('./helpers/ooxml');

const tmp = (buf) => {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'reflinker-')), 'a.xlsx');
  fs.writeFileSync(p, buf);
  return p;
};

// Through the same book the renderer builds: assembled by hand the shared strings and the
// number formats can each be left out, and a test then passes against a reader without them.
const grid = async (sheets, position, opts) =>
  xlsx.gridAt(xlsx.bookOf(tmp(buildXlsx(sheets, opts))), position || 1).grid;

describe('colIndex', () => {
  it('reads a single letter', () => assert.strictEqual(xlsx.colIndex('A1'), 0));
  it('reads a later letter', () => assert.strictEqual(xlsx.colIndex('B2'), 1));
  it('reads a two-letter column', () => assert.strictEqual(xlsx.colIndex('AA10'), 26));
  it('reads the last single letter', () => assert.strictEqual(xlsx.colIndex('Z1'), 25));
});

describe('xlsx outline', () => {
  it('names the sheets in tab order, not part order', async () => {
    // The fixture writes tab 1 to sheet2.xml on purpose: a reader that trusts part numbering or
    // relationship order rather than the workbook's own list gets the sheets backwards.
    const out = await xlsx.readOutline(tmp(buildXlsx([
      { name: 'Budget', rows: [['a']] },
      { name: 'Notes', rows: [['b']] },
    ])));
    assert.deepStrictEqual(out, [{ title: 'Budget', position: 1 }, { title: 'Notes', position: 2 }]);
  });

  it('reads the sheet the position names', async () => {
    const sec = await xlsx.readSection(tmp(buildXlsx([
      { name: 'Budget', rows: [['a']] },
      { name: 'Notes', rows: [['b']] },
    ])), 2);
    assert.strictEqual(sec.title, 'Notes');
    assert.deepStrictEqual(sec.body, ['b']);
  });

  it('clamps a position past the last sheet', async () => {
    const sec = await xlsx.readSection(tmp(buildXlsx([{ name: 'Only', rows: [['a']] }])), 9);
    assert.strictEqual(sec.position, 1);
  });
});

describe('xlsx cells', () => {
  it('resolves a shared string to its text', async () => {
    assert.deepStrictEqual(await grid([{ name: 'S', rows: [['Rent', 'Total']] }]), [['Rent', 'Total']]);
  });

  it('keeps a number as it reads, not as the double it is stored as', async () => {
    // A sum stored as 0.30000000000000004; printed raw it looks like a bug.
    assert.deepStrictEqual(await grid([{ name: 'S', rows: [[{ raw: '0.30000000000000004' }]] }]), [['0.3']]);
  });

  it('leaves a whole number alone', async () => {
    assert.deepStrictEqual(await grid([{ name: 'S', rows: [[132165000]] }]), [['132165000']]);
  });

  it('shows a date-formatted cell as its own format spells it, not as its day count', async () => {
    // The fixture's style names built-in 14, which is m/d/yyyy. A sheet is shown the way the
    // sheet says, not the way this machine would write a date.
    assert.deepStrictEqual(await grid([{ name: 'S', rows: [[{ date: 44927 }]] }]), [['1/1/2023']]);
  });

  it('shows a currency column the way Excel does, not as the doubles it holds', async () => {
    const money = '_(&quot;$&quot;* #,##0.00_);_(&quot;$&quot;* \\(#,##0.00\\);_(&quot;$&quot;* &quot;-&quot;??_);_(@_)';
    const g = await grid([{ name: 'S', rows: [[{ fmt: 32370 }, { fmt: 0 }]] }], 1, { numFmt: money });
    assert.deepStrictEqual(g, [['$32,370.00', '$-']]);
  });
});

describe('a sheet that does not start at A1', () => {
  it('trims the empty rim rather than rendering it', async () => {
    const g = await grid([{ name: 'S', at: 'C4', rows: [['Name', 'Qty'], ['Rent', '1200']] }]);
    assert.strictEqual(gridToHtml(g),
      '<table><tr><th>Name</th><th>Qty</th></tr><tr><td>Rent</td><td>1200</td></tr></table>');
  });

  it('keeps the gap between two tables stacked in one sheet', async () => {
    // Rows are placed by their own number: collapsing the gap pulls the lower table up against
    // the upper one and they read as a single table.
    const g = await grid([{ name: 'S', at: 'A1', rows: [['top'], [''], [''], ['bottom']] }]);
    assert.strictEqual(g.length, 4);
    assert.deepStrictEqual(g[3], ['bottom']);
  });

  it('is empty for a sheet with nothing in it', async () => {
    assert.deepStrictEqual(await grid([{ name: 'S', rows: [['']] }]), []);
  });
});

describe('merged cells in a workbook', () => {
  it('spans the merge and drops the empty cells it covers', async () => {
    // Excel keeps every covered cell in sheetData as an empty one and states the merge apart.
    // Read without mergeCells they are drawn as blanks, and the heading sits over one column.
    const g = await grid([{
      name: 'S',
      rows: [['2024 results', '', ''], ['Q1', 'Q2', 'Q3']],
      merges: ['A1:C1'],
    }]);
    assert.strictEqual(gridToHtml(g, { header: false }),
      '<table><tr><td colspan="3">2024 results</td></tr>'
      + '<tr><td>Q1</td><td>Q2</td><td>Q3</td></tr></table>');
  });

  it('spans down a merge stated across rows', async () => {
    const g = await grid([{ name: 'S', rows: [['Region', 'Q1'], ['', 'Q2']], merges: ['A1:A2'] }]);
    assert.ok(/<td rowspan="2">Region<\/td>/.test(gridToHtml(g, { header: false })));
  });

  it('does not expand the grid to the width the merge claims', async () => {
    // Excel writes a sheet-wide merge as A1:XFD1, and marking all 16384 columns covered fills
    // the grid with places that the preview's own column cap then throws away.
    const g = await grid([{ name: 'S', rows: [['Everything', '']], merges: ['A1:XFD1'] }]);
    assert.ok(g[0].length <= 21, 'the row was expanded to ' + g[0].length + ' cells');
  });

  it('places a merge against the sheet\'s own row numbers, not the first drawn row', async () => {
    // The grid starts at the first row that holds anything, and a merge is stated in sheet
    // coordinates: subtracting the wrong origin lands the span on another row entirely.
    const g = await grid([{ name: 'S', at: 'A5', rows: [['Total', ''], ['a', 'b']], merges: ['A5:B5'] }]);
    assert.ok(/<td colspan="2">Total<\/td>/.test(gridToHtml(g, { header: false })));
  });
});

describe('xlsx through the registry', () => {
  const formats = require('../src/formats');

  it('is a known extension that can outline and preview', () => {
    assert.ok(formats.knownExtensions().includes('.xlsx'));
    assert.ok(formats.canOutline('xlsx'));
    assert.ok(formats.canPreview('xlsx'));
  });

  it('carries no anchor — Excel takes a fragment as part of the file name', () => {
    assert.strictEqual(formats.anchorKind('xlsx'), null);
  });

  it('reads a workbook through the registry outline', async () => {
    const out = await formats.outline('xlsx', tmp(buildXlsx([{ name: 'Q1', rows: [['a']] }])));
    assert.deepStrictEqual(out, [{ title: 'Q1', position: 1 }]);
  });
});
