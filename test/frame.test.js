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

// A laid-out document, as the frame reads one back. The rect is the drawn size: scrollHeight
// is the unscaled figure and a lie about anything that zoomed itself to fit.
const rendered = (height) => ({
  firstChild: {},
  scrollHeight: height,
  getBoundingClientRect: () => ({ width: 600, height }),
});

// The box a preview sits in, as tall as the embed body's max-height says.
const withDocument = (fn, boxMaxHeight) => () => {
  const had = { document: global.document, style: global.getComputedStyle };
  global.document = { createElement: () => ({}) };
  global.getComputedStyle = () => ({ maxHeight: boxMaxHeight === undefined ? 'none' : boxMaxHeight + 'px' });
  try { return fn(); } finally { global.document = had.document; global.getComputedStyle = had.style; }
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

  it('zooms after the page has had its say', () => {
    // A document that scales itself to the box writes its own html{zoom}; ours has to come
    // after it, or the page's rule wins and the toolbar's zoom does nothing.
    const doc = frameDoc('<p>x</p>', 'html{zoom:0.5}', 1.5);
    assert.ok(doc.lastIndexOf('html{zoom:1.5}') > doc.indexOf('html{zoom:0.5}'), doc);
  });

  it('lets a sheet keep the width its columns say', () => {
    // The frame caps tables so a stray wide one can't blow the box out; a spreadsheet is the
    // case where that cap is wrong, and its own rules are written after the cap to undo it.
    const { SHEET_RULES } = require('../src/formats/css');
    const doc = frameDoc('<table></table>', SHEET_RULES, 1, 8);
    assert.ok(doc.includes('width:max-content'), 'the sheet did not ask for its own width');
    assert.ok(doc.indexOf('width:max-content') > doc.indexOf('table,pre{max-width:100%}'),
      'the frame’s cap comes after the sheet’s rule and squeezes it again');
  });

  it('leaves the scrolling to the frame’s own window', () => {
    // On the body instead, the bars sit at the foot of the whole document rather than at the
    // frame's edge: for a long sheet that is below the fold, and a gesture over a frame never
    // reaches anything outside it.
    const doc = frameDoc('<table></table>', '', 1, 8);
    assert.ok(doc.includes('html{overflow:auto}'), doc.slice(0, 240));
    assert.ok(!/body\{[^}]*overflow/.test(doc), 'the body scrolls, so its bars are wherever it ends');
  });

  it('says nothing about zoom at natural size', () => {
    assert.ok(!frameDoc('<p>x</p>', '', 1).includes('zoom'));
    assert.ok(!frameDoc('<p>x</p>', '').includes('zoom'));
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
    assert.strictEqual(frame.style.height, '418px');
  }));

  it('gives a page no padding, which it would scroll sideways by and lose off its edge', withDocument(() => {
    // A slide is laid out to exactly the width it was given: 8px of frame padding is 16px the
    // document does not have, and the frame answers with a scrollbar that moves nothing useful.
    const page = el();
    renderFrame(page, { html: '<div class="slide">x</div>', css: '', width: 600, page: true });
    assert.ok(page.children[0].srcdoc.includes('padding:0px'), page.children[0].srcdoc.slice(0, 200));

    const loose = el();
    renderFrame(loose, { html: '<p>x</p>', css: '', width: 600 });
    assert.ok(loose.children[0].srcdoc.includes('padding:8px'), loose.children[0].srcdoc.slice(0, 200));
  }));

  it('never grows taller than the box it is shown in', withDocument(() => {
    // Taller than the box, the frame's own scrollbars sit below the fold: the horizontal one is
    // out of reach, and a middle-click autoscroll — which never crosses into a frame — has
    // nothing under the pointer that can move.
    const root = el();
    root.parentElement = null;
    renderFrame(root, { html: '<table></table>', css: '', width: 600 });
    const frame = root.children[0];
    frame.contentDocument = { body: rendered(2200) };
    frame.fire('load');
    assert.strictEqual(frame.style.height, '900px');
  }, 900));

  it('stops at its own ceiling where no box states a height', withDocument(() => {
    const root = el();
    renderFrame(root, { html: '<p>x</p>', css: '', width: 600 });
    const frame = root.children[0];
    frame.contentDocument = { body: rendered(9000) };
    frame.fire('load');
    assert.strictEqual(frame.style.height, '2000px');
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

  it('stays inside its box, zoomed or not — what does not fit is scrolled within it', withDocument(() => {
    const inside = el();
    renderFrame(inside, { html: '<p>x</p>', css: '', width: 600 });
    assert.strictEqual(inside.children[0].style.maxWidth, '100%');

    const zoomed = el();
    renderFrame(zoomed, { html: '<p>x</p>', css: '', width: 600, zoom: 1.5 });
    assert.strictEqual(zoomed.children[0].style.maxWidth, '100%');
  }));

  it('declines when there is no document to build a frame with', () => {
    const had = global.document;
    global.document = undefined;
    try {
      assert.strictEqual(renderFrame(el(), { html: '<p>x</p>', width: 600 }), false);
    } finally { global.document = had; }
  });
});
