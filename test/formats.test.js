'use strict';

const { describe, it, assert } = require('../src/shared/testing/harness');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openZip } = require('../src/zip');
const { readOutline, readSlide } = require('../src/formats/pptx');
const { writeZip, buildPptx } = require('./helpers/ooxml');

const tmp = (name, buf) => {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'reflinker-')), name);
  fs.writeFileSync(p, buf);
  return p;
};

describe('zip reader', () => {
  it('inflates a deflated member', () => {
    const body = 'x'.repeat(500) + ' unique tail';
    const z = openZip(tmp('a.zip', writeZip([{ name: 'a/b.xml', data: body }])));
    assert.ok(z, 'zip did not open');
    assert.strictEqual(z.text('a/b.xml'), body);
  });

  it('reads a member written after another', () => {
    const z = openZip(tmp('a.zip', writeZip([
      { name: 'first.xml', data: '<first/>' },
      { name: 'second.xml', data: '<second/>' },
    ])));
    assert.strictEqual(z.text('second.xml'), '<second/>');
  });

  it('reads a member whose local header carries a data descriptor', () => {
    const body = 'streamed body ' + 'y'.repeat(300);
    const z = openZip(tmp('a.zip', writeZip([
      { name: 'one.xml', data: body },
      { name: 'two.xml', data: '<two/>' },
    ], { dataDescriptor: true })));
    assert.ok(z, 'zip did not open');
    assert.strictEqual(z.text('one.xml'), body);
    assert.strictEqual(z.text('two.xml'), '<two/>');
  });

  it('returns null for a member that is not there', () => {
    const z = openZip(tmp('a.zip', writeZip([{ name: 'a.xml', data: 'a' }])));
    assert.strictEqual(z.text('missing.xml'), null);
    assert.strictEqual(z.has('missing.xml'), false);
  });

  it('declines a file that is not a zip', () => {
    assert.strictEqual(openZip(tmp('a.zip', Buffer.from('not a zip at all'))), null);
  });

  it('finds the real end record when the comment contains its signature', () => {
    // A valid archive whose comment holds the EOCD signature bytes: the back-scan hits those
    // first, so only the comment-length check tells the real record from the decoy.
    let buf = writeZip([{ name: 'a.xml', data: '<hello/>' }]);
    const decoy = Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x06]), Buffer.alloc(20, 0)]);
    buf.writeUInt16LE(decoy.length, buf.length - 2); // real EOCD's comment-length field
    const z = openZip(tmp('c.zip', Buffer.concat([buf, decoy])));
    assert.ok(z, 'valid archive read as unopenable');
    assert.strictEqual(z.text('a.xml'), '<hello/>');
  });

  it('declines a file that is not there', () => {
    assert.strictEqual(openZip(path.join(os.tmpdir(), 'no-such-reflinker-file.zip')), null);
  });
});

describe('pptx outline', () => {
  it('numbers slides by presentation order, not by file name', async () => {
    const file = tmp('deck.pptx', buildPptx([
      { title: 'Opening', part: 'slide7.xml' },
      { title: 'Middle', part: 'slide1.xml' },
      { title: 'Closing', part: 'slide4.xml' },
    ]));
    assert.deepStrictEqual(await readOutline(file), [
      { title: 'Opening', page: 1 },
      { title: 'Middle', page: 2 },
      { title: 'Closing', page: 3 },
    ]);
  });

  it('takes the title placeholder over other text on the slide', async () => {
    const file = tmp('deck.pptx', buildPptx([{ title: 'Real title', body: ['Body first'] }]));
    assert.deepStrictEqual(await readOutline(file), [{ title: 'Real title', page: 1 }]);
  });

  it('falls back to the first text when a slide has no title placeholder', async () => {
    const file = tmp('deck.pptx', buildPptx([{ body: ['Only body text'] }]));
    assert.deepStrictEqual(await readOutline(file), [{ title: 'Only body text', page: 1 }]);
  });

  it('skips a slide with no text rather than indexing an empty name', async () => {
    const file = tmp('deck.pptx', buildPptx([{ title: 'Has one' }, {}, { title: 'Has two' }]));
    assert.deepStrictEqual(await readOutline(file), [
      { title: 'Has one', page: 1 },
      { title: 'Has two', page: 3 },
    ]);
  });

  it('is empty for a file that is not a pptx', async () => {
    assert.deepStrictEqual(await readOutline(tmp('x.pptx', Buffer.from('garbage'))), []);
  });
});

describe('pptx slide read', () => {
  it('separates the title from the body lines', async () => {
    const file = tmp('deck.pptx', buildPptx([{ title: 'Agenda', body: ['One', 'Two'] }]));
    const slide = await readSlide(file, 1);
    assert.strictEqual(slide.title, 'Agenda');
    assert.deepStrictEqual(slide.body, ['One', 'Two']);
    assert.strictEqual(slide.total, 1);
  });

  it('breaks a line at a soft break instead of running the runs together', async () => {
    const file = tmp('deck.pptx', buildPptx([{ title: 'Steps', body: ['Pan & Zoom\nNote: it toggles'] }]));
    const slide = await readSlide(file, 1);
    assert.deepStrictEqual(slide.body, ['Pan & Zoom', 'Note: it toggles']);
  });

  it('clamps a page past the end to the last slide', async () => {
    const file = tmp('deck.pptx', buildPptx([{ title: 'One' }, { title: 'Two' }]));
    const slide = await readSlide(file, 99);
    assert.strictEqual(slide.title, 'Two');
    assert.strictEqual(slide.page, 2);
  });
});
