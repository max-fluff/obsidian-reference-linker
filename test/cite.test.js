'use strict';

// A cite binding answers a different question from a sec binding: not "did the section move
// inside this document" but "is this still the document at all". What it repairs is therefore
// the path in the URL, not the page — the case a sec binding cannot see, because a renamed
// file drops out of the index and takes every link to it with it.

const { describe, it, assert } = require('../src/shared/testing/harness');
const path = require('path');
const { fakeApp, installStubs } = require('../src/shared/testing/stubs');
const { buildCitations, emptyCitations } = require('../src/citations');
const actualize = require('../src/actualize');

installStubs();

const ROOT = '/lib';

// The library after Zotero re-filed the paper: the document sits at papers/new.pdf, while
// notes written earlier still link to papers/old.pdf.
const load = async (opts) => {
  const o = opts || {};
  const Plugin = require(path.join(__dirname, '..', 'src', 'main.js'));
  const plugin = new Plugin(fakeApp, { version: '0.0.0', id: 'reference-linker', dir: '.' });
  await plugin.onload();
  plugin.settings.codeRoot = ROOT;
  plugin.fileCache = new Map([
    ['papers/new.pdf', { entries: [
      { name: 'new', kind: 'file', path: 'papers/new.pdf', lang: 'pdf', position: 1 },
      { name: 'Methods', kind: 'section', path: 'papers/new.pdf', lang: 'pdf', position: o.methodsAt == null ? 4 : o.methodsAt },
      { name: 'Results', kind: 'section', path: 'papers/new.pdf', lang: 'pdf', position: 4 },
    ] }],
    ['papers/other.pdf', { entries: [
      { name: 'other', kind: 'file', path: 'papers/other.pdf', lang: 'pdf', position: 1 },
    ] }],
  ]);
  if (o.noSection) plugin.fileCache.get('papers/new.pdf').entries.length = 1;
  plugin.setIndex([].concat(...[...plugin.fileCache.values()].map((v) => v.entries)));
  plugin.targetIndexedFile = (dec) => [...plugin.fileCache.keys()].find((rel) => dec.includes(rel)) || null;
  plugin.citations = o.noBib
    ? emptyCitations()
    : buildCitations(o.entries || [{ key: 'smith2020', title: '', year: '', paths: ['/lib/papers/new.pdf'] }],
      [...plugin.fileCache.keys()], ROOT);
  return plugin;
};

const link = (url, title) => url + ' "' + title + '"';
const OLD = 'file:///{ref-root}/papers/old.pdf';
const NEW = 'file:///{ref-root}/papers/new.pdf';

describe('cite binding', () => {
  it('says nothing when the key still names the document the link points at', async () => {
    const plugin = await load();
    assert.strictEqual(plugin.linkState(link(NEW, 'cite:smith2020')), null);
  });

  it('marks a link stale when the key names a document elsewhere', async () => {
    const plugin = await load();
    assert.strictEqual(plugin.linkState(link(OLD, 'cite:smith2020')), 'stale');
  });

  it('repairs the path and leaves the rest of the link alone', async () => {
    const plugin = await load();
    assert.strictEqual(
      plugin.actualizedTarget(link(OLD, 'cite:smith2020')),
      link(NEW, 'cite:smith2020'),
    );
  });

  it('keeps the fragment a link carried when only the document moved', async () => {
    const plugin = await load();
    const fixed = plugin.actualizedTarget(link(OLD + '#page=4', 'cite:smith2020 sec:Methods'));
    assert.strictEqual(fixed, link(NEW + '#page=4', 'cite:smith2020 sec:Methods'));
  });

  it('repairs the page too when the section moved in the document it moved to', async () => {
    const plugin = await load({ methodsAt: 9 });
    const fixed = plugin.actualizedTarget(link(OLD + '#page=4', 'cite:smith2020 sec:Methods'));
    assert.strictEqual(fixed, link(NEW + '#page=9', 'cite:smith2020 sec:Methods'));
  });

  it('is broken when the bibliography no longer has the key', async () => {
    const plugin = await load();
    assert.strictEqual(plugin.linkState(link(OLD, 'cite:ghost2019')), 'broken');
  });

  it('is broken when the section is gone from the document the key moved to', async () => {
    const plugin = await load({ noSection: true });
    assert.strictEqual(plugin.linkState(link(OLD, 'cite:smith2020 sec:Methods')), 'broken');
  });

  // The reference-root-misconfigured failure the sec anchor already refuses to make: with no
  // bibliography read, every cite link in the vault would light up red at once.
  it('gives no verdict at all when no bibliography is loaded', async () => {
    const plugin = await load({ noBib: true });
    assert.strictEqual(plugin.linkState(link(OLD, 'cite:smith2020')), null);
  });

  // The same false alarm from the other side: the bibliography reads perfectly, but the
  // library it names is not indexed — a root pointed at the wrong folder, or a drive not
  // mounted yet. The key is not missing, its document simply isn't known.
  it('gives no verdict when the key is there but its document is not indexed', async () => {
    const plugin = await load({ entries: [{ key: 'smith2020', title: '', year: '', paths: ['/elsewhere/entirely/a.pdf'] }] });
    assert.strictEqual(plugin.citations.keys, 1);
    assert.strictEqual(plugin.citations.matched, 0);
    assert.strictEqual(plugin.linkState(link(OLD, 'cite:smith2020')), null);
  });

  it('still judges a plain sec link, which carries no key', async () => {
    const plugin = await load({ methodsAt: 9 });
    assert.strictEqual(plugin.linkState(link(NEW + '#page=4', 'sec:Methods')), 'stale');
  });
});

describe('writing a cite binding', () => {
  const fileEntry = { name: 'new', kind: 'file', path: 'papers/new.pdf', lang: 'pdf', position: 1 };
  const secEntry = { name: 'Methods', kind: 'section', path: 'papers/new.pdf', lang: 'pdf', position: 4 };

  it('pins a new link to the key its document is filed under', async () => {
    const plugin = await load();
    assert.strictEqual(plugin.buildLink(fileEntry, false), '[new](file:///{ref-root}/papers/new.pdf "cite:smith2020")');
  });

  it('pins a section link to both the key and the section', async () => {
    const plugin = await load();
    assert.strictEqual(
      plugin.buildLink(secEntry, false),
      '[Methods](file:///{ref-root}/papers/new.pdf#page=4 "cite:smith2020 sec:Methods")',
    );
  });

  it('writes no binding at all for a document with no key', async () => {
    const plugin = await load();
    const other = { name: 'other', kind: 'file', path: 'papers/other.pdf', lang: 'pdf', position: 1 };
    assert.strictEqual(plugin.buildLink(other, false), '[other](file:///{ref-root}/papers/other.pdf)');
  });
});

describe('pinOptionFor', () => {
  it('offers the key for an unpinned link', async () => {
    const plugin = await load();
    const opt = plugin.pinOptionFor(NEW, '');
    assert.strictEqual(opt.title, 'cite:smith2020');
    assert.strictEqual(opt.kind, 'cite');
  });

  // The retrofit that matters: a vault full of sec-pinned links gains the key without anyone
  // re-inserting them.
  it('tops an already-pinned link up with the key', async () => {
    const plugin = await load();
    const opt = plugin.pinOptionFor(NEW + '#page=4', 'sec:Methods');
    assert.strictEqual(opt.title, 'cite:smith2020 sec:Methods');
    assert.strictEqual(opt.kind, 'cite');
  });

  // Re-deriving the section from the page would silently repoint the link at Results, which
  // is not the section its author pinned it to.
  it('keeps the section a drifted link names rather than reading the page again', async () => {
    const plugin = await load({ methodsAt: 9 });
    const opt = plugin.pinOptionFor(NEW + '#page=4', 'sec:Methods');
    assert.strictEqual(opt.title, 'cite:smith2020 sec:Methods');
  });

  it('leaves a reader-written tooltip alone', async () => {
    const plugin = await load();
    assert.strictEqual(plugin.pinOptionFor(NEW, 'the methods paper'), null);
  });

  it('offers nothing when the link already carries both anchors', async () => {
    const plugin = await load();
    assert.strictEqual(plugin.pinOptionFor(NEW + '#page=4', 'cite:smith2020 sec:Methods'), null);
  });

  it('offers nothing for a document that is neither sectioned there nor keyed', async () => {
    const plugin = await load();
    assert.strictEqual(plugin.pinOptionFor('file:///{ref-root}/papers/other.pdf', ''), null);
  });
});

// The update dialog ticks boxes by the order links appear in, and the pass that applies them
// walks the note again. If the two passes disagree about which links count, a tick applies
// somebody else's fix — so an unfixable link must drop out of both, not one.
describe('rewriting a whole note', () => {
  // "b" is the unfixable one: a file link written against neither the root token nor the
  // reference root, so there is no path in it we could safely rewrite.
  const note = [
    '[a](file:///{ref-root}/papers/old.pdf "cite:smith2020")',
    '[b](file:///somewhere/else/old.pdf "cite:smith2020")',
    '[c](file:///{ref-root}/papers/old.pdf#page=4 "cite:smith2020 sec:Methods")',
  ].join('\n\n');

  it('previews only the links it can actually fix', async () => {
    const plugin = await load({ methodsAt: 9 });
    const r = actualize.rewriteUpdates(plugin, note, null);
    assert.deepStrictEqual(r.changes.map((c) => c.label), ['a', 'c']);
    assert.deepStrictEqual(r.changes.map((c) => c.key), [0, 1]);
    assert.deepStrictEqual(r.changes.map((c) => c.to), ['papers/new.pdf', 'papers/new.pdf']);
    assert.deepStrictEqual(r.broken, ['b']);
  });

  it('applies the tick to the link the preview numbered, not the one beside it', async () => {
    const plugin = await load({ methodsAt: 9 });
    const out = actualize.rewriteUpdates(plugin, note, new Set([1])).newText;
    assert.ok(out.includes('[a](file:///{ref-root}/papers/old.pdf "cite:smith2020")'), 'the unticked link was rewritten');
    assert.ok(out.includes('[c](file:///{ref-root}/papers/new.pdf#page=9 "cite:smith2020 sec:Methods")'), 'the ticked link was not rewritten');
  });

  it('shows the file it moved from, which is no longer in the index', async () => {
    const plugin = await load();
    const r = actualize.rewriteUpdates(plugin, note, null);
    assert.strictEqual(r.changes[0].from, 'old.pdf');
  });
});

describe('pinning a whole note', () => {
  it('tops up a sec-pinned link and leaves a tooltip alone', async () => {
    const plugin = await load({ methodsAt: 9 });
    const text = [
      '[a](file:///{ref-root}/papers/new.pdf#page=4 "sec:Methods")',
      '[b](file:///{ref-root}/papers/new.pdf "the methods paper")',
      '[c](file:///{ref-root}/papers/new.pdf)',
    ].join('\n\n');
    const out = actualize.pinLinksInText(plugin, text).text;
    assert.ok(out.includes('[a](file:///{ref-root}/papers/new.pdf#page=4 "cite:smith2020 sec:Methods")'), 'the sec-pinned link did not gain the key');
    assert.ok(out.includes('[b](file:///{ref-root}/papers/new.pdf "the methods paper")'), 'the tooltip was overwritten');
    assert.ok(out.includes('[c](file:///{ref-root}/papers/new.pdf "cite:smith2020")'), 'the unpinned link did not gain the key');
  });
});

describe('retargetUrl', () => {
  it('rewrites the path after the root token, keeping scheme and fragment', async () => {
    const plugin = await load();
    assert.strictEqual(
      plugin.retargetUrl('file:///{ref-root}/papers/old.pdf#page=2', 'papers/new.pdf'),
      'file:///{ref-root}/papers/new.pdf#page=2',
    );
  });

  it('rewrites a legacy bare {root} link too', async () => {
    const plugin = await load();
    assert.strictEqual(
      plugin.retargetUrl('file:///{root}/a.pdf', 'papers/new.pdf'),
      'file:///{root}/papers/new.pdf',
    );
  });

  it('rewrites an absolute link written against the reference root', async () => {
    const plugin = await load();
    assert.strictEqual(
      plugin.retargetUrl('file:///lib/papers/old.pdf?page=3', 'papers/new.pdf'),
      'file:///lib/papers/new.pdf?page=3',
    );
  });

  it('encodes a path segment so a space or hash cannot rewrite the URL', async () => {
    const plugin = await load();
    assert.strictEqual(
      plugin.retargetUrl('file:///{ref-root}/a.pdf', 'papers/two words #1.pdf'),
      'file:///{ref-root}/papers/two%20words%20%231.pdf',
    );
  });

  it('declines a URL holding neither the token nor the root, rather than corrupting it', async () => {
    const plugin = await load();
    assert.strictEqual(plugin.retargetUrl('zotero://open-pdf/library/items/ABCD', 'papers/new.pdf'), null);
  });
});
