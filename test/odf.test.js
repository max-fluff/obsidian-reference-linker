'use strict';

// OpenDocument shares one content.xml across three shapes: odt is headings, odp is slides,
// ods is sheets. The outline is read per kind; the text preview is common.

const { describe, it, assert } = require('../src/shared/testing/harness');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readOutline, readSection } = require('../src/formats/odf');
const { buildOdt, buildOdp, buildOds } = require('./helpers/ooxml');

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
      { title: 'Introduction', page: 1 },
      { title: 'Method', page: 2 },
      { title: 'Results', page: 3 },
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
});

describe('odf robustness', () => {
  it('is empty for a file that is not an odf zip', async () => {
    assert.deepStrictEqual(await readOutline(tmp('a.odt', Buffer.from('nope')), 'odt'), []);
  });
});
