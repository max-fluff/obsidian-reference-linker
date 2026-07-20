'use strict';

// Drift is judged against the page the link stores. A format with no OS anchor stores none,
// so targetPage answers 1 for every link into it — the case that once marked every slide
// past the first as moved.

const { describe, it, assert } = require('../src/shared/testing/harness');
const path = require('path');
const { fakeApp, installStubs } = require('../src/shared/testing/stubs');

installStubs();

// Two indexed documents whose outlines both put a section on a late page, so a link that
// stores no page is as far from the truth as it can get.
const load = async () => {
  const Plugin = require(path.join(__dirname, '..', 'src', 'main.js'));
  const plugin = new Plugin(fakeApp, { version: '0.0.0', id: 'reference-linker', dir: '.' });
  await plugin.onload();
  plugin.targetIndexedFile = (dec) => (/Deck/.test(dec) ? 'Deck.pptx' : /Doc/.test(dec) ? 'Doc.html' : 'Spec.pdf');
  plugin.fileCache = new Map([
    ['Spec.pdf', { entries: [
      { name: 'Spec', kind: 'file', path: 'Spec.pdf', lang: 'pdf', page: 1 },
      { name: 'Details', kind: 'section', path: 'Spec.pdf', lang: 'pdf', page: 7 },
    ] }],
    // The title slide is a section too, which is what makes an unanchored link pinnable to
    // the wrong thing: every one of them reads as page 1.
    ['Deck.pptx', { entries: [
      { name: 'Deck', kind: 'file', path: 'Deck.pptx', lang: 'pptx', page: 1 },
      { name: 'Title Slide', kind: 'section', path: 'Deck.pptx', lang: 'pptx', page: 1 },
      { name: 'Pan and Zoom', kind: 'section', path: 'Deck.pptx', lang: 'pptx', page: 7 },
    ] }],
    // One heading anchors, one never had an id — the mix a real doc page has. "Notes" appears
    // twice: once with no id (a link pins to that), once with an id — the duplicate-heading trap.
    ['Doc.html', { entries: [
      { name: 'Doc', kind: 'file', path: 'Doc.html', lang: 'html', page: 1 },
      { name: 'Title', kind: 'section', path: 'Doc.html', lang: 'html', page: 1 },
      { name: 'Options', kind: 'section', path: 'Doc.html', lang: 'html', page: 5, anchor: '_options' },
      { name: 'Notes', kind: 'section', path: 'Doc.html', lang: 'html', page: 6 },
      { name: 'Notes', kind: 'section', path: 'Doc.html', lang: 'html', page: 8, anchor: '_notes' },
    ] }],
  ]);
  return plugin;
};

const link = (url, sec) => url + ' "sec:' + encodeURIComponent(sec) + '"';

describe('stale marks', () => {
  it('leaves an unanchored section link alone, however late its slide', async () => {
    const plugin = await load();
    assert.strictEqual(plugin.linkState(link('file:///x/Deck.pptx', 'Pan and Zoom')), null);
  });

  it('still calls an unanchored link broken when its section is gone', async () => {
    const plugin = await load();
    assert.strictEqual(plugin.linkState(link('file:///x/Deck.pptx', 'Removed Slide')), 'broken');
  });

  it('offers no page fix for an unanchored link, so no fragment is ever written in', async () => {
    const plugin = await load();
    assert.strictEqual(plugin.actualizedTarget(link('file:///x/Deck.pptx', 'Pan and Zoom')), null);
  });

  it('still sees a PDF section that drifted', async () => {
    const plugin = await load();
    assert.strictEqual(plugin.linkState(link('file:///x/Spec.pdf#page=3', 'Details')), 'stale');
  });

  it('still fixes a drifted PDF link to its new page', async () => {
    const plugin = await load();
    const fixed = plugin.actualizedTarget(link('file:///x/Spec.pdf#page=3', 'Details'));
    assert.ok(fixed.startsWith('file:///x/Spec.pdf#page=7'), 'not repointed to page 7: ' + fixed);
  });

  it('fixes a page carried in a query in place, not by appending a dead #page=', async () => {
    // A custom viewer template can carry {page} in the query. Appending #page= left the real
    // ?page= untouched, so the link stayed stale forever and every update rewrote the note.
    const plugin = await load();
    const fixed = plugin.actualizedTarget(link('file:///x/Spec.pdf?page=3', 'Details'));
    assert.ok(/\?page=7/.test(fixed) && !/#page=/.test(fixed), 'query page not fixed in place: ' + fixed);
    assert.strictEqual(plugin.targetPage(fixed), 7);
  });

  it('does not flag a link pinned to an id-less heading that a same-named id sibling shadows', async () => {
    const plugin = await load();
    assert.strictEqual(plugin.linkState(link('file:///x/Doc.html', 'Notes')), null);
  });

  it('still fixes a real id drift even when a same-named heading exists', async () => {
    const plugin = await load();
    assert.strictEqual(plugin.linkState(link('file:///x/Doc.html#_gone', 'Notes')), 'stale');
  });

  it('leaves a PDF link that is already right alone', async () => {
    const plugin = await load();
    assert.strictEqual(plugin.linkState(link('file:///x/Spec.pdf#page=7', 'Details')), null);
  });
});

describe('stale marks on id anchors', () => {
  it('leaves a link alone when its heading still has that id', async () => {
    const plugin = await load();
    assert.strictEqual(plugin.linkState(link('file:///x/Doc.html#_options', 'Options')), null);
  });

  it('calls a link stale when the heading was regenerated under a new id', async () => {
    const plugin = await load();
    assert.strictEqual(plugin.linkState(link('file:///x/Doc.html#_old_options', 'Options')), 'stale');
  });

  it('repoints a drifted link at the new id rather than appending a page', async () => {
    const plugin = await load();
    const fixed = plugin.actualizedTarget(link('file:///x/Doc.html#_old_options', 'Options'));
    assert.ok(fixed.startsWith('file:///x/Doc.html#_options'), 'not repointed: ' + fixed);
    assert.ok(!/page=/.test(fixed), 'a page fragment leaked into an id-anchored link: ' + fixed);
  });

  it('never marks a heading that never had an id', async () => {
    const plugin = await load();
    assert.strictEqual(plugin.linkState(link('file:///x/Doc.html', 'Title')), null);
  });

  it('still calls it broken when the heading itself is gone', async () => {
    const plugin = await load();
    assert.strictEqual(plugin.linkState(link('file:///x/Doc.html#_options', 'Removed')), 'broken');
  });
});

describe('pinning', () => {
  it('pins an html link to the heading its fragment names', async () => {
    const plugin = await load();
    const sec = plugin.sectionAtLinkPage('file:///x/Doc.html#_options');
    assert.strictEqual(sec && sec.name, 'Options');
  });

  it('will not pin an html link whose fragment names no heading', async () => {
    const plugin = await load();
    assert.strictEqual(plugin.sectionAtLinkPage('file:///x/Doc.html#_nope'), null);
  });

  it('will not pin an unanchored link, which has no page to read a section off', async () => {
    const plugin = await load();
    assert.strictEqual(plugin.sectionAtLinkPage('file:///x/Deck.pptx'), null);
  });

  it('still pins a PDF link to the section on its page', async () => {
    const plugin = await load();
    const sec = plugin.sectionAtLinkPage('file:///x/Spec.pdf#page=7');
    assert.strictEqual(sec && sec.name, 'Details');
  });
});
