'use strict';

// A page that brought its own stylesheet renders in an isolated frame. That is the only way
// its markup keeps the classes its CSS is written against (the HTML sanitizer strips them) and
// the only way Obsidian's theme can't reach in to repaint its code blocks.

const { describe, it, assert } = require('../src/shared/testing/harness');
const { installStubs } = require('../src/shared/testing/stubs');

installStubs();
const { frameDoc, inlineImagesAsData, renderFrame } = require('../src/formats/preview');

const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

// An element double with Obsidian's createEl, and an iframe that can be driven through load.
const el = () => {
  const node = { children: [] };
  node.createEl = (tag) => {
    const frame = {
      tag, style: {}, attrs: {}, listeners: {},
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(n, f) { (this.listeners[n] = this.listeners[n] || []).push(f); },
      fire(n) { (this.listeners[n] || []).slice().forEach((f) => f()); },
      remove() { node.children = node.children.filter((c) => c !== frame); },
    };
    node.children.push(frame);
    return frame;
  };
  return node;
};

const withDocument = (fn) => () => {
  const had = global.document;
  global.document = { createElement: () => ({}) };
  try { return fn(); } finally { global.document = had; }
};

describe('frame document', () => {
  it('carries the page CSS and markup verbatim', () => {
    const doc = frameDoc('<div class="listingblock"><pre>x</pre></div>', '.listingblock{background:#f7f7f8}');
    assert.ok(doc.includes('class="listingblock"'), 'markup classes lost');
    assert.ok(doc.includes('.listingblock{background:#f7f7f8}'), 'page CSS lost');
  });

  it('is a complete document so the page lays out as itself', () => {
    const doc = frameDoc('<p>x</p>', '');
    assert.ok(doc.startsWith('<!doctype html>'));
    assert.ok(doc.includes('<body>'));
  });
});

describe('frame images', () => {
  it('inlines a local image as a data URI, since a frame cannot read blob or file URLs', () => {
    const out = inlineImagesAsData('<img src="pic.png">', () => PNG);
    assert.ok(out.includes('src="data:image/png;base64,' + PNG.toString('base64') + '"'), out);
  });

  it('leaves a remote image alone', () => {
    const src = '<img src="https://example.com/a.png">';
    assert.strictEqual(inlineImagesAsData(src, () => PNG), src);
  });

  it('blanks an image it cannot read rather than leaving a dead path', () => {
    assert.strictEqual(inlineImagesAsData('<img src="gone.png">', () => null), '<img src="">');
  });

  it('stops at the byte budget', () => {
    // Each fits on its own; together they pass the 24MB budget, so only the first is carried.
    const big = Buffer.alloc(13 * 1024 * 1024, 1);
    const out = inlineImagesAsData('<img src="a.png"><img src="b.png">', () => big);
    assert.strictEqual((out.match(/data:/g) || []).length, 1);
  });
});

describe('renderFrame', () => {
  it('sandboxes the frame and never allows scripts', withDocument(() => {
    const root = el();
    renderFrame(root, { html: '<p>x</p>', css: 'p{margin:0}', width: 600 });
    const frame = root.children[0];
    assert.strictEqual(frame.tag, 'iframe');
    assert.ok(frame.attrs.sandbox.includes('allow-same-origin'), frame.attrs.sandbox);
    assert.ok(!frame.attrs.sandbox.includes('allow-scripts'), 'page scripts would run');
  }));

  it('grows to the content once it has laid out', withDocument(() => {
    const root = el();
    renderFrame(root, { html: '<p>x</p>', css: '', width: 600 });
    const frame = root.children[0];
    frame.contentDocument = { body: { firstChild: {}, scrollHeight: 400 } };
    frame.fire('load');
    assert.strictEqual(frame.style.height, '416px');
  }));

  it('hands back to the caller when the frame comes up empty — a blocked frame is a blank hole', withDocument(() => {
    const root = el();
    let fellBack = false;
    renderFrame(root, { html: '<p>x</p>', css: '', width: 600, onFail: () => { fellBack = true; } });
    const frame = root.children[0];
    frame.contentDocument = { body: { firstChild: null, scrollHeight: 0 } };
    frame.fire('load');
    assert.ok(fellBack, 'no fallback when the frame stayed empty');
    assert.strictEqual(root.children.length, 0, 'the empty frame was left in the note');
  }));

  it('declines when there is no document to build a frame with', () => {
    const had = global.document;
    global.document = undefined;
    try {
      assert.strictEqual(renderFrame(el(), { html: '<p>x</p>', width: 600 }), false);
    } finally { global.document = had; }
  });
});
