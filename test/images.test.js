'use strict';

// A referenced image is read off disk (or out of the zip) and shown as a blob URL, the one
// resource kind Obsidian's CSP lets rendered content load. These tests drive the byte path:
// the blob is built from the real file's bytes, remote sources are left alone, and a src that
// escapes the document's folder is refused.

const { describe, it, assert } = require('../src/shared/testing/harness');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { inlineImages } = require('../src/formats/preview');
const { assetLoader } = require('../src/formats/html');
const epub = require('../src/formats/epub');
const { buildEpub } = require('./helpers/ooxml');

// A tiny but valid PNG (1x1). The bytes are what a loader must hand back unchanged.
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4' +
  '890000000d4944415478da6360000002000154a24f6a0000000049454e44ae426082',
  'hex');

// A DOM double: stable <img> nodes (so an assertion can read them after) behind a box whose
// querySelectorAll returns the same set every call.
const fakeImg = (src) => {
  const attrs = { src };
  return {
    getAttribute: (n) => attrs[n],
    removeAttribute: (n) => { delete attrs[n]; },
    set src(v) { attrs.src = v; },
    get src() { return attrs.src; },
  };
};
const boxOf = (imgs) => ({ querySelectorAll: () => imgs });

const withBlobs = (fn) => () => {
  const had = { URL: global.URL, Blob: global.Blob };
  const made = [];
  global.Blob = function Blob(parts) { this.bytes = parts[0]; };
  global.URL = {
    createObjectURL: (b) => { made.push(b); return 'blob:' + made.length; },
    revokeObjectURL: () => {},
  };
  try { return fn(made); } finally { global.URL = had.URL; global.Blob = had.Blob; }
};

const tmpWith = (name, bytes) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reflinker-'));
  fs.writeFileSync(path.join(dir, name), bytes);
  return dir;
};

describe('image inlining', () => {
  it('turns a relative image into a blob built from the file bytes', withBlobs((made) => {
    const dir = tmpWith('pic.png', PNG);
    const img = fakeImg('pic.png');
    const urls = inlineImages(boxOf([img]), assetLoader(path.join(dir, 'doc.html')));
    assert.strictEqual(urls.length, 1);
    assert.strictEqual(made[0].bytes.length, PNG.length);
    assert.ok(img.getAttribute('src').startsWith('blob:'), 'src not rewritten to a blob');
  }));

  it('leaves a remote src untouched', withBlobs((made) => {
    const img = fakeImg('https://example.com/a.png');
    const urls = inlineImages(boxOf([img]), () => PNG);
    assert.strictEqual(urls.length, 0);
    assert.strictEqual(made.length, 0);
    assert.strictEqual(img.getAttribute('src'), 'https://example.com/a.png');
  }));

  it('leaves a data URI untouched', withBlobs(() => {
    const img = fakeImg('data:image/png;base64,AAAA');
    assert.strictEqual(inlineImages(boxOf([img]), () => PNG).length, 0);
  }));

  it('drops the src when the loader has nothing', withBlobs(() => {
    const img = fakeImg('missing.png');
    inlineImages(boxOf([img]), () => null);
    assert.strictEqual(img.getAttribute('src'), undefined);
  }));

  it('stops once the byte budget is spent, rather than reading a gallery', withBlobs((made) => {
    const big = Buffer.alloc(20 * 1024 * 1024, 1); // two of these exceed the 24MB budget
    const imgs = [fakeImg('a.png'), fakeImg('b.png')];
    const urls = inlineImages(boxOf(imgs), () => big);
    assert.strictEqual(urls.length, 1, 'budget did not cap the second image');
    assert.strictEqual(made.length, 1);
  }));
});

describe('html asset loader', () => {
  it('reads an image next to the document', () => {
    const dir = tmpWith('pic.png', PNG);
    const buf = assetLoader(path.join(dir, 'page.html'))('pic.png');
    assert.ok(buf.equals(PNG));
  });

  it('reads an image in a subfolder of the document', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reflinker-'));
    fs.mkdirSync(path.join(dir, 'img'));
    fs.writeFileSync(path.join(dir, 'img', 'pic.png'), PNG);
    const buf = assetLoader(path.join(dir, 'page.html'))('img/pic.png');
    assert.ok(buf.equals(PNG));
  });

  it('refuses a src that climbs out of the document folder', () => {
    const dir = tmpWith('pic.png', PNG);
    assert.strictEqual(assetLoader(path.join(dir, 'sub', 'page.html'))('../../secret.png'), null);
  });

  it('decodes a percent-encoded name and ignores a query string', () => {
    const dir = tmpWith('a b.png', PNG);
    const buf = assetLoader(path.join(dir, 'page.html'))('a%20b.png?v=2');
    assert.ok(buf.equals(PNG));
  });
});

describe('epub images', () => {
  const bookWithImage = () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'reflinker-')), 'book.epub');
    fs.writeFileSync(file, buildEpub([{ title: 'Cover', body: ['See below.'], img: PNG }], 'nav'));
    return file;
  };

  it('resolves an image src against the chapter and reads it out of the zip', () => {
    const doc = epub.open(bookWithImage());
    const load = epub.imageLoader(doc, doc.spine.order[0]);
    // The chapter is OEBPS/text/ch1.xhtml and references ../images/img1.png.
    assert.ok(load('../images/img1.png').equals(PNG), 'image bytes not read intact');
  });

  it('returns null for an image the book does not contain', () => {
    const doc = epub.open(bookWithImage());
    const load = epub.imageLoader(doc, doc.spine.order[0]);
    assert.strictEqual(load('../images/missing.png'), null);
  });
});
