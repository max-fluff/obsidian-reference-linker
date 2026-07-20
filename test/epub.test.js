'use strict';

// A book ships its contents as EPUB 3 nav, EPUB 2 NCX, or both. Position is the spine index,
// so a TOC that lists chapters out of order still resolves to reading order.

const { describe, it, assert } = require('../src/shared/testing/harness');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readOutline, readChapter } = require('../src/formats/epub');
const { buildEpub } = require('./helpers/ooxml');

const tmp = (buf) => {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'reflinker-')), 'book.epub');
  fs.writeFileSync(p, buf);
  return p;
};

const CHAPTERS = [
  { title: 'Preface', body: ['Before we begin.'] },
  { title: 'Chapter One', body: ['It was a dark night.', 'Then it rained.'] },
  { title: 'Chapter Two', body: ['The morning came.'] },
];

describe('epub outline', () => {
  it('reads the EPUB 3 nav document', async () => {
    const o = await readOutline(tmp(buildEpub(CHAPTERS, 'nav')));
    assert.deepStrictEqual(o, [
      { title: 'Preface', page: 1 },
      { title: 'Chapter One', page: 2 },
      { title: 'Chapter Two', page: 3 },
    ]);
  });

  it('falls back to the EPUB 2 NCX when there is no nav document', async () => {
    const o = await readOutline(tmp(buildEpub(CHAPTERS, 'ncx')));
    assert.deepStrictEqual(o.map((s) => s.title), ['Preface', 'Chapter One', 'Chapter Two']);
    assert.deepStrictEqual(o.map((s) => s.page), [1, 2, 3]);
  });

  it('resolves hrefs relative to the document that holds them', async () => {
    // The fixture puts content under OEBPS/text/ and the TOC under OEBPS/, so a naive join
    // would look for OEBPS/text/text/ch1.xhtml and find nothing.
    const o = await readOutline(tmp(buildEpub(CHAPTERS, 'nav')));
    assert.strictEqual(o.length, 3, 'chapters did not resolve to spine positions');
  });

  it('is empty for a file that is not an epub', async () => {
    assert.deepStrictEqual(await readOutline(tmp(Buffer.from('not a zip'))), []);
  });
});

describe('epub chapter', () => {
  it('reads a chapter at its spine position', async () => {
    const ch = await readChapter(tmp(buildEpub(CHAPTERS, 'nav')), 2);
    assert.strictEqual(ch.title, 'Chapter One');
    assert.deepStrictEqual(ch.body, ['It was a dark night.', 'Then it rained.']);
    assert.strictEqual(ch.total, 3);
  });

  it('clamps a position past the end to the last chapter', async () => {
    const ch = await readChapter(tmp(buildEpub(CHAPTERS, 'nav')), 99);
    assert.strictEqual(ch.title, 'Chapter Two');
    assert.strictEqual(ch.page, 3);
  });
});
