'use strict';

// What the hover header says a link lands on. A pinned link carries the section in its own
// binding; an unpinned one is looked up in the outline — the file name would only repeat
// what the link text already says.

const { describe, it, assert } = require('../src/shared/testing/harness');
const path = require('path');
const { fakeApp, installStubs } = require('../src/shared/testing/stubs');

installStubs();

const load = async () => {
  const Plugin = require(path.join(__dirname, '..', 'src', 'main.js'));
  const plugin = new Plugin(fakeApp, { version: '0.0.0', id: 'reference-linker' });
  await plugin.onload();
  return plugin;
};

// One document with an outline: the file itself plus a section starting on page 3. The
// cache is filled rather than the lookups stubbed, so the test resolves the way the plugin
// really does.
const withOutline = (plugin) => {
  plugin.targetIndexedFile = () => 'Spec.pdf';
  plugin.fileCache = new Map([['Spec.pdf', {
    entries: [
      { name: 'Spec', kind: 'file', path: 'Spec.pdf', lang: 'pdf', page: 1 },
      { name: 'Details', kind: 'section', path: 'Spec.pdf', lang: 'pdf', page: 3 },
    ],
  }]]);
  return plugin;
};

// entryAtPoint's reading-view branch, driven through a fake anchor.
const hoverOn = (plugin, href, title) => {
  const a = {
    classList: { contains: () => false },
    closest: () => a,
    getAttribute: (n) => (n === 'href' ? href : (n === 'data-reference-title' ? title : null)),
  };
  return plugin.entryAtPoint(a, 0, 0);
};

// A format that stores no position in its link: the binding is the only thing that says
// which section, so the preview has to resolve the page through the index.
const unanchored = (plugin) => {
  plugin.targetIndexedFile = () => 'Deck.pptx';
  plugin.fileCache = new Map([['Deck.pptx', {
    entries: [
      { name: 'Deck', kind: 'file', path: 'Deck.pptx', lang: 'pptx', page: 1 },
      { name: 'Title Slide', kind: 'section', path: 'Deck.pptx', lang: 'pptx', page: 1 },
      { name: 'Pan and Zoom', kind: 'section', path: 'Deck.pptx', lang: 'pptx', page: 7 },
    ],
  }]]);
  return plugin;
};

describe('hover on a link with no position in it', () => {
  it('previews the slide the binding names, not the first one', async () => {
    const plugin = unanchored(await load());
    const hit = hoverOn(plugin, 'file:///x/Deck.pptx', 'sec:Pan%20and%20Zoom');
    assert.ok(hit, 'no hover entry at all');
    assert.strictEqual(hit.entry.page, 7);
    assert.strictEqual(hit.entry.title, 'Pan and Zoom');
  });

  it('still previews the first slide when that is what the binding names', async () => {
    const plugin = unanchored(await load());
    const hit = hoverOn(plugin, 'file:///x/Deck.pptx', 'sec:Title%20Slide');
    assert.strictEqual(hit.entry.page, 1);
  });

  it('falls back to the file itself when the binding names no indexed section', async () => {
    const plugin = unanchored(await load());
    const hit = hoverOn(plugin, 'file:///x/Deck.pptx', 'sec:Gone');
    assert.strictEqual(hit.entry.page, 1);
    assert.strictEqual(hit.entry.title, 'Gone');
  });
});

describe('hover header', () => {
  it('names the section a pinned link is pinned to', async () => {
    const plugin = withOutline(await load());
    const hit = hoverOn(plugin, 'file:///x/Spec.pdf', 'sec:Overview');
    assert.ok(hit, 'no hover entry at all');
    assert.strictEqual(hit.entry.title, 'Overview');
  });

  it('names the section an unpinned link lands in', async () => {
    const plugin = withOutline(await load());
    const hit = hoverOn(plugin, 'file:///x/Spec.pdf#page=3', '');
    assert.ok(hit, 'no hover entry at all');
    assert.strictEqual(hit.entry.title, 'Details');
  });

  it('says nothing rather than guessing when the page is mid-section', async () => {
    const plugin = withOutline(await load());
    const hit = hoverOn(plugin, 'file:///x/Spec.pdf#page=2', '');
    assert.ok(hit, 'no hover entry at all');
    assert.strictEqual(hit.entry.title, '');
  });
});
