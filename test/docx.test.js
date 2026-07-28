'use strict';

// Word documents. Almost every test here is a shape that showed up in a corpus of real .docx
// files and would have gone unnoticed against a fixture written to match the code.

const { describe, it, assert } = require('../src/shared/testing/harness');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { installStubs } = require('../src/shared/testing/stubs');

installStubs();

const docx = require('../src/formats/docx');
const { buildDocx, buildDocxAltChunk } = require('./helpers/ooxml');

const tmp = (buf) => {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'reflinker-')), 'a.docx');
  fs.writeFileSync(p, buf);
  return p;
};

const html = (blocks, media) => {
  const { openZip } = require('../src/zip');
  const zip = openZip(tmp(buildDocx(blocks, media)));
  const { elements, attr } = require('../src/xml');
  const rels = new Map();
  for (const r of elements(zip.text('word/_rels/document.xml.rels') || '', 'Relationship')) {
    rels.set(attr(r, 'Id'), 'word/' + attr(r, 'Target'));
  }
  return docx.toHtml(zip.text('word/document.xml'), docx.headingStyles(zip.text('word/styles.xml')), rels);
};

describe('docx outline', () => {
  it('reads headings in order', async () => {
    assert.deepStrictEqual(await docx.readOutline(tmp(buildDocx([
      { h: 'Introduction', level: 1 },
      { p: 'Some text.' },
      { h: 'Method', level: 2 },
    ]))), [{ title: 'Introduction', position: 1 }, { title: 'Method', position: 2 }]);
  });

  it('finds a heading whose styleId is translated but whose w:name is not', async () => {
    // A localized Word writes w:styleId="Zagolovok1" and keeps w:name="heading 1".
    const out = await docx.readOutline(tmp(buildDocx([{ h: 'Введение', level: 1, styleId: 'Zagolovok1' }])));
    assert.deepStrictEqual(out, [{ title: 'Введение', position: 1 }]);
  });

  it('finds a heading marked only by a direct outline level', async () => {
    // Most documents in the corpus have no heading style at all; some mark headings this way
    // and a style-only reading finds nothing in them.
    const out = await docx.readOutline(tmp(buildDocx([{ p: 'Справка', outlineLvl: 0 }, { p: 'body' }])));
    assert.deepStrictEqual(out, [{ title: 'Справка', position: 1 }]);
  });

  it('does not treat outline level 9 as a heading — it is Word for body text', async () => {
    assert.deepStrictEqual(await docx.readOutline(tmp(buildDocx([{ p: 'plain', outlineLvl: 9 }]))), []);
  });

  it('skips a heading paragraph that holds only a picture', async () => {
    // A letterhead logo is routinely styled as a heading. A section with no name is worse than
    // no section.
    const out = await docx.readOutline(tmp(buildDocx([{ h: '', img: 'rId1', level: 1 }, { h: 'Real', level: 1 }],
      { media: { rId1: 'png' } })));
    assert.deepStrictEqual(out, [{ title: 'Real', position: 1 }]);
  });

  it('ignores a heading inside a table cell', async () => {
    // Letterheads are laid out in tables, and a cell that carries a heading style is not a
    // section of the document.
    const out = await docx.readOutline(tmp(buildDocx([
      { table: [[{ h: 'Ministry of Things', level: 1 }]] },
      { h: 'Report', level: 1 },
    ])));
    assert.deepStrictEqual(out, [{ title: 'Report', position: 1 }]);
  });

  it('is empty for a document with no headings, which is the common case', async () => {
    assert.deepStrictEqual(await docx.readOutline(tmp(buildDocx([{ p: 'one' }, { p: 'two' }]))), []);
  });
});

describe('docx sections', () => {
  const doc = () => tmp(buildDocx([
    { h: 'Introduction', level: 1 },
    { p: 'First para.' },
    { p: 'Second para.' },
    { h: 'Method', level: 1 },
    { p: 'How it works.' },
  ]));

  it('runs from a heading to the next', async () => {
    const sec = await docx.readSection(doc(), 1);
    assert.strictEqual(sec.title, 'Introduction');
    assert.deepStrictEqual(sec.body, ['First para.', 'Second para.']);
    assert.strictEqual(sec.total, 2);
  });

  it('runs from the last heading to the end', async () => {
    assert.deepStrictEqual((await docx.readSection(doc(), 2)).body, ['How it works.']);
  });

  it('clamps a position past the end', async () => {
    assert.strictEqual((await docx.readSection(doc(), 99)).position, 2);
  });

  it('gives the whole body when there are no headings', async () => {
    const sec = await docx.readSection(tmp(buildDocx([{ p: 'alone' }])), 1);
    assert.deepStrictEqual(sec.body, ['alone']);
    assert.strictEqual(sec.total, 1);
  });
});

describe('docx as HTML', () => {
  it('keeps the space between runs Word split a sentence across', () => {
    // Word rewrites run boundaries on every edit. Trimming each run welds "Hello " + "world"
    // into "Helloworld" — the same defect that once joined two pptx lines.
    assert.ok(/Hello world/.test(html([{ p: ['Hello ', 'world'] }])), html([{ p: ['Hello ', 'world'] }]));
  });

  it('turns a line break inside a paragraph into a break', () => {
    assert.ok(/<br>/.test(docx.toHtml('<w:p><w:r><w:t>a</w:t><w:br/><w:t>b</w:t></w:r></w:p>', new Map(), new Map())));
  });

  it('keeps bold, italic and superscript', () => {
    const out = html([{ p: 'x', bold: true }, { p: 'y', italic: true }, { p: '22', sup: true }]);
    assert.ok(/<strong>x<\/strong>/.test(out), out);
    assert.ok(/<em>y<\/em>/.test(out), out);
    assert.ok(/<sup>22<\/sup>/.test(out), out);
  });

  it('renders a heading at its own level', () => {
    assert.ok(/<h2>Method<\/h2>/.test(html([{ h: 'Method', level: 2 }])));
  });

  it('renders a table as a table, every row a body row', () => {
    // A spreadsheet's first row is a header worth guessing at; a Word table's is not, and
    // promoting it invents a header the document does not have.
    const out = html([{ table: [['Name', 'Qty'], ['Rent', '1200']] }]);
    assert.ok(/<table[^>]*><tr><td[^>]*>.*?Name.*?<\/td><td[^>]*>.*?Qty.*?<\/td><\/tr>/.test(out), out);
    assert.ok(/Rent/.test(out) && /1200/.test(out), out);
    assert.ok(!/<th/.test(out), 'a header row was invented');
  });

  it('spans a vertically merged cell instead of drawing the blanks under it', () => {
    // Word writes the merge as a run of cells down one column: the first says "restart", the
    // rest say nothing. Drawn as themselves they read as empty rows beside the text.
    const out = html([{
      table: [
        [{ tc: 'North', vMerge: 'restart' }, 'Q1'],
        [{ tc: '', vMerge: 'continue' }, 'Q2'],
        [{ tc: '', vMerge: 'continue' }, 'Q3'],
      ],
    }]);
    assert.ok(/<td rowspan="3"[^>]*>.*?North/.test(out), out);
    assert.strictEqual((out.match(/<td/g) || []).length, 4, 'a covered cell was drawn: ' + out);
    assert.strictEqual((out.match(/<tr>/g) || []).length, 3, 'a row was swallowed: ' + out);
  });

  it('keeps a row whose every cell continues a merge', () => {
    // Dropping it lets the rows under it slide up into the space the rowspan already claims,
    // and a one-column table merged top to bottom collapses to a single row.
    const out = html([{
      table: [[{ tc: 'One', vMerge: 'restart' }], [{ tc: '', vMerge: 'continue' }]],
    }]);
    assert.strictEqual((out.match(/<tr>/g) || []).length, 2, out);
    assert.ok(/rowspan="2"/.test(out), out);
  });

  it('counts a merge down its own grid column, not down the cell\'s place in the row', () => {
    // A cell spanning two grid columns shifts every cell after it, so the one below lines up
    // with a different column than its index says. Counted by index the merge runs away.
    const out = html([
      { table: [[{ tc: 'wide', gridSpan: 2 }, { tc: 'A', vMerge: 'restart' }], ['x', 'y', { tc: '', vMerge: 'continue' }]] },
    ]);
    assert.ok(/rowspan="2"/.test(out), out);
  });

  it('keeps blocks in document order', () => {
    // Walking paragraphs and tables separately spills every table to one end of the document.
    const out = html([{ p: 'before' }, { table: [['cell']] }, { p: 'after' }]);
    assert.ok(out.indexOf('before') < out.indexOf('<table'), out);
    assert.ok(out.indexOf('<table') < out.indexOf('after'), out);
  });

  it('lays the columns out at the widths the table states', () => {
    // Without table-layout:fixed the browser sizes columns by their content and the grid the
    // document declares goes unread.
    const out = html([{ table: [['a', 'b']], grid: [3000, 1000] }]);
    assert.ok(/<colgroup><col style="width:75%"><col style="width:25%"><\/colgroup>/.test(out), out);
    // The widths only bind under a fixed layout; with the default the browser ignores them.
    const page = docx.documentPage(docx.partsOf(tmp(buildDocx([{ table: [['a', 'b']], grid: [3000, 1000] }]))), 1, 400);
    assert.ok(/table-layout:fixed/.test(page.css), page.css);
  });

  it('keeps a cell inside its table rather than beside it', () => {
    const out = html([{ table: [['inside']] }, { p: 'outside' }]);
    assert.ok(out.indexOf('inside') < out.indexOf('</table>'), out);
    assert.ok(out.indexOf('outside') > out.indexOf('</table>'), out);
  });

  it('groups consecutive numbered paragraphs into one list', () => {
    const out = html([{ li: 'one' }, { li: 'two' }, { p: 'after' }]);
    assert.ok(/<ul><li>one<\/li><li>two<\/li><\/ul>/.test(out), out);
  });

  it('points an image at the part its relationship names', () => {
    const out = html([{ img: 'rId7' }], { media: { rId7: 'png-bytes' } });
    assert.ok(/<img src="word\/media\/rId7\.png">/.test(out), out);
  });

  it('escapes text that looks like markup', () => {
    assert.ok(html([{ p: 'a &lt;b&gt; c' }]).includes('a &lt;b&gt; c'));
  });

  it('drops an empty paragraph', () => {
    assert.strictEqual(html([{ p: '' }]), '');
  });
});

describe('docx that only wraps an embedded HTML file', () => {
  // Saving a web page as .docx produces a body holding nothing but an altChunk reference, so
  // reading the body alone finds an empty document.
  const chunk = (html) => {
    const parts = docx.partsOf(tmp(buildDocxAltChunk(html)));
    return docx.altChunk(parts.zip, parts.body);
  };

  it('reads the embedded file the body points at', () => {
    assert.strictEqual(chunk('<html><body><h1>From the web</h1></body></html>'), '<h1>From the web</h1>');
  });

  it('takes a chunk that has no body element as it stands', () => {
    assert.strictEqual(chunk('<h1>Bare</h1>'), '<h1>Bare</h1>');
  });

  it('is null for an ordinary document, so the normal path runs', () => {
    const parts = docx.partsOf(tmp(buildDocx([{ p: 'ordinary' }])));
    assert.strictEqual(docx.altChunk(parts.zip, parts.body), null);
  });
});

describe('docx through the registry', () => {
  const formats = require('../src/formats');
  it('is a known extension that can outline and preview', () => {
    assert.ok(formats.knownExtensions().includes('.docx'));
    assert.ok(formats.canOutline('docx'));
    assert.ok(formats.canPreview('docx'));
  });

  it('carries no anchor — Word takes a fragment as part of the file name', () => {
    assert.strictEqual(formats.anchorKind('docx'), null);
    assert.strictEqual(formats.hasOsAnchor('docx'), false);
  });

  it('has no position label: a heading number is not a page', () => {
    assert.strictEqual(formats.positionLabel('docx', 3), null);
  });
});
