'use strict';

// What the hover header says a link lands on.
//
// The code linker's header always names the exact line; this is the same promise for a
// document. A pinned link carries the section in its own binding, and an unpinned one is
// looked up in the outline — falling back to the file name tells the reader only what the
// link text already told them.

const { describe, it, assert } = require('./harness');
const path = require('path');
const { fakeApp, installStubs } = require('./stubs/app');

installStubs();

const load = async () => {
  const Plugin = require(path.join(__dirname, '..', 'src', 'main.js'));
  const plugin = new Plugin(fakeApp, { version: '0.0.0', id: 'reference-linker' });
  await plugin.onload();
  return plugin;
};

// One document, indexed with an outline: the file itself plus a section starting on page 3.
// The cache is filled rather than the lookups stubbed, so the test goes through the same
// resolution the plugin really uses.
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

describe('hover header', () => {
  it('names the section a pinned link is pinned to', async () => {
    const plugin = withOutline(await load());
    const hit = hoverOn(plugin, 'file:///x/Spec.pdf', 'sec:Overview');
    assert.ok(hit, 'no hover entry at all');
    assert.strictEqual(hit.entry.title, 'Overview');
  });

  it('names the section an unpinned link lands in', async () => {
    // The gap this closes: without it the header said "Spec", which the link text already said.
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
