'use strict';

// The preview is a real media element. Two things are easy to get wrong and invisible until
// someone tries it: the Windows drive letter in the file URL, and what happens when the app
// refuses a file:// source.

const { describe, it, assert } = require('../src/shared/testing/harness');
const fs = require('fs');
const os = require('os');
const path = require('path');

// URL and Blob are browser globals the renderer leans on; the harness has no DOM.
const withBrowserGlobals = (fn) => async () => {
  const had = { URL: global.URL, Blob: global.Blob };
  const revoked = [];
  global.URL = { createObjectURL: () => 'blob:test', revokeObjectURL: (u) => revoked.push(u) };
  global.Blob = function Blob(parts, opts) { this.size = parts[0].length; this.type = opts && opts.type; };
  try {
    await fn(revoked);
  } finally {
    global.URL = had.URL;
    global.Blob = had.Blob;
  }
};

const el = () => {
  const node = { children: [], style: {}, listeners: {} };
  node.createEl = (tag) => {
    const child = el();
    child.tag = tag;
    child.addEventListener = (n, f) => { (child.listeners[n] = child.listeners[n] || []).push(f); };
    child.fire = (n) => (child.listeners[n] || []).slice().forEach((f) => f());
    node.children.push(child);
    return child;
  };
  return node;
};

const tmpMedia = (name, bytes) => {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'reflinker-')), name);
  fs.writeFileSync(p, Buffer.alloc(bytes || 64, 1));
  return p;
};

const render = (abs, ext, page) => {
  const root = el();
  const media = require('../src/formats/media');
  return media.render(root, { abs, ext, page, width: 600, isCurrent: () => true })
    .then((cleanup) => ({ root, media: root.children[0], cleanup }));
};

describe('media preview', () => {
  it('uses a video element for video and an audio element for audio', withBrowserGlobals(async () => {
    assert.strictEqual((await render(tmpMedia('a.mp4'), 'mp4', 1)).media.tag, 'video');
    assert.strictEqual((await render(tmpMedia('a.mp3'), 'mp3', 1)).media.tag, 'audio');
  }));

  it('gives the element an explicit width so it does not collapse in the popover', withBrowserGlobals(async () => {
    const { media } = await render(tmpMedia('a.mp3'), 'mp3', 1);
    assert.strictEqual(media.style.width, '600px');
    assert.notStrictEqual(media.style.width, '100%');
  }));

  it('keeps the drive letter colon in the file URL', withBrowserGlobals(async () => {
    const { media } = await render(tmpMedia('a.mp4'), 'mp4', 1);
    assert.ok(/^file:\/\/\/[A-Za-z]:\//.test(media.src) || !/^[A-Za-z]:/.test(tmpMedia('x.mp4')),
      'drive letter was percent-encoded: ' + media.src);
    assert.ok(!media.src.includes('%3A'), 'colon was encoded, Windows resolves nothing: ' + media.src);
  }));

  it('encodes a space in the file name', withBrowserGlobals(async () => {
    const { media } = await render(tmpMedia('two words.mp4'), 'mp4', 1);
    assert.ok(media.src.includes('two%20words.mp4'), media.src);
  }));

  it('seeks to the position once metadata is in', withBrowserGlobals(async () => {
    const { media } = await render(tmpMedia('a.mp4'), 'mp4', 90);
    media.currentTime = 0;
    media.fire('loadedmetadata');
    assert.strictEqual(media.currentTime, 90);
  }));

  it('leaves a position of 1 at the start rather than seeking a second in', withBrowserGlobals(async () => {
    const { media } = await render(tmpMedia('a.mp4'), 'mp4', 1);
    media.currentTime = 0;
    media.fire('loadedmetadata');
    assert.strictEqual(media.currentTime, 0);
  }));

  it('falls back to a blob when the app refuses the file source', withBrowserGlobals(async () => {
    const { media } = await render(tmpMedia('a.mp3'), 'mp3', 1);
    assert.ok(media.src.startsWith('file:'), 'did not try file:// first');
    media.fire('error');
    assert.strictEqual(media.src, 'blob:test');
  }));

  it('releases the blob it made', withBrowserGlobals(async (revoked) => {
    const { media, cleanup } = await render(tmpMedia('a.mp3'), 'mp3', 1);
    media.fire('error');
    cleanup();
    assert.deepStrictEqual(revoked, ['blob:test']);
  }));

  it('will not read a file past the blob limit into memory', withBrowserGlobals(async () => {
    const big = tmpMedia('big.mp4', 97 * 1024 * 1024);
    const { media } = await render(big, 'mp4', 1);
    media.fire('error');
    assert.ok(media.src.startsWith('file:'), 'a 97MB file was copied into a blob: ' + media.src);
  }));

  it('labels a position as a timecode, not a page', () => {
    const { positionLabel } = require('../src/formats/media');
    assert.strictEqual(positionLabel(120), '2:00');
    assert.strictEqual(positionLabel(125), '2:05');
    assert.strictEqual(positionLabel(3725), '1:02:05');
  });

  it('through the registry, gives media a timecode and paged formats a page', () => {
    const formats = require('../src/formats');
    assert.strictEqual(formats.positionLabel('mp4', 90), '1:30');
    assert.strictEqual(formats.positionLabel('pdf', 5), 'p.5');
  });

  it('shows no position label at the start of any file', () => {
    const formats = require('../src/formats');
    assert.strictEqual(formats.positionLabel('mp4', 1), null);
    assert.strictEqual(formats.positionLabel('pdf', 1), null);
  });

  it('declines a file that is not there', withBrowserGlobals(async () => {
    const root = el();
    const media = require('../src/formats/media');
    const out = await media.render(root, {
      abs: path.join(os.tmpdir(), 'no-such-reflinker.mp4'), ext: 'mp4', page: 1, width: 600, isCurrent: () => true,
    });
    assert.strictEqual(out, false);
  }));
});
