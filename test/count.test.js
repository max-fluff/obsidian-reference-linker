'use strict';

// How many positions a document holds — what the embed toolbar counts down from — and which
// controls a format claims at all.

const { describe, it, assert } = require('../src/shared/testing/harness');
const fs = require('fs');
const os = require('os');
const path = require('path');
const formats = require('../src/formats');
const { buildOdt, buildOdp, buildOds, buildPptx, buildDocx, buildXlsx, buildEpub } = require('./helpers/ooxml');

const tmp = (name, data) => {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'reflinker-')), name);
  fs.writeFileSync(p, data);
  return p;
};

describe('counting a document’s positions', () => {
  it('counts a deck’s slides', async () => {
    const deck = tmp('d.pptx', buildPptx([{ title: 'One' }, { title: 'Two' }, { title: 'Three' }]));
    assert.strictEqual(await formats.count('pptx', deck), 3);
  });

  it('counts a spreadsheet’s sheets, in both packagings', async () => {
    assert.strictEqual(await formats.count('ods', tmp('a.ods', buildOds([
      { name: 'Budget', rows: [['a']] },
      { name: 'Notes', rows: [['b']] },
    ]))), 2);
    assert.strictEqual(await formats.count('xlsx', tmp('a.xlsx', buildXlsx([
      { name: 'Budget', rows: [['a']] },
      { name: 'Notes', rows: [['b']] },
    ]))), 2);
  });

  it('counts a document’s headings, and the whole of one that has none', async () => {
    const doc = tmp('a.odt', buildOdt([{ heading: 'Intro', paras: ['x'] }, { heading: 'Method', paras: ['y'] }]));
    assert.strictEqual(await formats.count('odt', doc), 2);
    assert.strictEqual(await formats.count('odt', tmp('b.odt', buildOdt([{ heading: '', paras: ['x'] }]))), 1);
    assert.strictEqual(await formats.count('docx', tmp('a.docx', buildDocx([
      { h: 'Introduction', level: 1 }, { p: 'Some text.' }, { h: 'Method', level: 2 },
    ]))), 2);
    assert.strictEqual(await formats.count('docx', tmp('b.docx', buildDocx([{ p: 'No headings here.' }]))), 1);
  });

  it('counts an odp’s pages and an epub’s chapters', async () => {
    assert.strictEqual(await formats.count('odp', tmp('a.odp', buildOdp([{ title: 'A' }, { title: 'B' }]))), 2);
    assert.strictEqual(await formats.count('epub', tmp('a.epub', buildEpub([
      { title: 'Preface', body: ['x'] }, { title: 'One', body: ['y'] },
    ]))), 2);
  });

  it('counts an HTML file’s headings', async () => {
    const page = tmp('a.html', '<h1 id="a">One</h1><p>x</p><h2 id="b">Two</h2><p>y</p>');
    assert.strictEqual(await formats.count('html', page), 2);
  });

  it('is zero for a format that does not count, and for a file that cannot be read', async () => {
    assert.strictEqual(await formats.count('png', tmp('a.png', 'not really a png')), 0);
    assert.strictEqual(await formats.count('mp4', tmp('a.mp4', 'not really a film')), 0);
    assert.strictEqual(await formats.count('pptx', tmp('broken.pptx', 'not a zip at all')), 0);
    assert.strictEqual(await formats.count('nope', 'no-such-file.nope'), 0);
  });
});

describe('what a format lets the toolbar offer', () => {
  it('gives a format that claims nothing the embed it always had', () => {
    assert.deepStrictEqual(formats.capabilities('nope'),
      { paged: false, zoomable: false, scrollable: false, timed: false });
  });

  it('pages and zooms a PDF', () => {
    const c = formats.capabilities('pdf');
    assert.strictEqual(c.paged, true);
    assert.strictEqual(c.zoomable, true);
  });

  it('offers a recording neither, since its own controls are the position', () => {
    const c = formats.capabilities('mp3');
    assert.strictEqual(c.paged, false);
    assert.strictEqual(c.zoomable, false);
    assert.strictEqual(c.timed, true);
  });

  it('does not page a text file, whose position is a line and not a section number', () => {
    // Stepping it by one would move a line, not a heading: text.readSection clamps against the
    // file's length, where every other format clamps against a count of sections.
    assert.strictEqual(formats.capabilities('md').paged, false);
    assert.strictEqual(formats.capabilities('md').zoomable, true);
  });

  it('does not page an image or a CSV, which are one position by nature', () => {
    assert.strictEqual(formats.capabilities('png').paged, false);
    assert.strictEqual(formats.capabilities('csv').paged, false);
  });
});
