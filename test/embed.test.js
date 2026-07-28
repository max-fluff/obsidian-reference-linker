'use strict';

// The embed target grammar and how a spec resolves to what gets rendered: an #id anchor (the
// form a copied section link carries), a page range, and the header naming what is shown.

const { describe, it, assert } = require('../src/shared/testing/harness');
const path = require('path');
const { fakeApp, installStubs } = require('../src/shared/testing/stubs');

installStubs();

const { resolve, splitTarget, parseSpan, parseSpec } = require('../src/embed');

const load = async () => {
  const Plugin = require(path.join(__dirname, '..', 'src', 'main.js'));
  const plugin = new Plugin(fakeApp, { version: '0.0.0', id: 'reference-linker', dir: '.' });
  await plugin.onload();
  plugin.settings.codeRoot = '';
  const entries = [
    { name: 'Guide', kind: 'file', path: 'docs/guide.html', lang: 'html', position: 1 },
    { name: 'Intro', kind: 'section', path: 'docs/guide.html', lang: 'html', position: 1, anchor: '_intro' },
    { name: 'Options', kind: 'section', path: 'docs/guide.html', lang: 'html', position: 4, anchor: '_options' },
    { name: 'Spec', kind: 'file', path: 'Spec.pdf', lang: 'pdf', position: 1 },
    { name: 'Chapter', kind: 'section', path: 'Spec.pdf', lang: 'pdf', position: 3 },
    { name: 'Clip', kind: 'file', path: 'Clip.mp4', lang: 'mp4', position: 1 },
    { name: 'Twin', kind: 'section', path: 'a.html', lang: 'html', position: 2, anchor: 'x' },
    { name: 'Twin', kind: 'section', path: 'b.html', lang: 'html', position: 2, anchor: 'y' },
  ];
  plugin.fileCache = new Map();
  for (const e of entries) {
    const v = plugin.fileCache.get(e.path) || { mtimeMs: 1, entries: [] };
    v.entries.push(e);
    plugin.fileCache.set(e.path, v);
  }
  plugin.setIndex(entries);
  return plugin;
};

const res = async (target, extra) => resolve(await load(), Object.assign({ target, position: '', width: '', title: '' }, extra));

describe('parseSpan', () => {
  it('reads a single number', () => assert.deepStrictEqual(parseSpan('3'), { from: 3, to: 3 }));
  it('reads a hyphen range', () => assert.deepStrictEqual(parseSpan('3-5'), { from: 3, to: 5 }));
  it('reads an en-dash range', () => assert.deepStrictEqual(parseSpan('3–5'), { from: 3, to: 5 }));
  it('orders a reversed range', () => assert.deepStrictEqual(parseSpan('5-3'), { from: 5, to: 5 }));
  it('is null for a non-span', () => assert.strictEqual(parseSpan('intro'), null));
});

describe('parseTimecode', () => {
  const { parseTimecode } = require('../src/embed');
  it('reads plain seconds', () => assert.strictEqual(parseTimecode('90'), 90));
  it('reads mm:ss', () => assert.strictEqual(parseTimecode('1:30'), 90));
  it('reads h:mm:ss', () => assert.strictEqual(parseTimecode('1:02:05'), 3725));
  it('is null for something that is not a time', () => assert.strictEqual(parseTimecode('later'), null));
});

describe('a recording is positioned in time, not in pages', () => {
  const load = async () => {
    const Plugin = require(path.join(__dirname, '..', 'src', 'main.js'));
    const plugin = new Plugin(fakeApp, { version: '0.0.0', id: 'reference-linker', dir: '.' });
    await plugin.onload();
    plugin.settings.codeRoot = '';
    const entries = [{ name: 'Clip', kind: 'file', path: 'Clip.mp4', lang: 'mp4', position: 1 }];
    plugin.fileCache = new Map([['Clip.mp4', { mtimeMs: 1, entries }]]);
    plugin.setIndex(entries);
    return plugin;
  };
  const at = async (extra, target) => (await (async () => resolve(await load(),
    Object.assign({ target: target || 'Clip.mp4', page: '', time: '', width: '', title: '' }, extra)))()).position;

  it('takes a timecode on the time: line — the same form the header shows', async () => {
    assert.strictEqual(await at({ time: '1:30' }), 90);
  });

  it('takes plain seconds on the time: line too', async () => {
    assert.strictEqual(await at({ time: '90' }), 90);
  });

  it('takes a timecode in the target fragment', async () => {
    assert.strictEqual(await at({}, 'Clip.mp4#t=1:30'), 90);
    assert.strictEqual(await at({}, 'Clip.mp4#t=90'), 90);
  });

  it('refuses page: on a recording, and says which key to use', async () => {
    const r = resolve(await load(), { target: 'Clip.mp4', page: '90', time: '', width: '', title: '' });
    assert.ok(r.error, 'position: was silently accepted for a recording');
    assert.ok(/time:/.test(r.error), r.error);
  });

  it('refuses a #page= fragment on a recording', async () => {
    const r = resolve(await load(), { target: 'Clip.mp4#page=90', page: '', time: '', width: '', title: '' });
    assert.ok(r.error, r.error);
  });

  it('refuses a time that is not a time', async () => {
    const r = resolve(await load(), { target: 'Clip.mp4', page: '', time: 'later', width: '', title: '' });
    assert.ok(r.error, 'a nonsense time was accepted');
  });
});

describe('a paged document is positioned in pages, not in time', () => {
  const load = async () => {
    const Plugin = require(path.join(__dirname, '..', 'src', 'main.js'));
    const plugin = new Plugin(fakeApp, { version: '0.0.0', id: 'reference-linker', dir: '.' });
    await plugin.onload();
    plugin.settings.codeRoot = '';
    const entries = [{ name: 'Spec', kind: 'file', path: 'Spec.pdf', lang: 'pdf', position: 1 }];
    plugin.fileCache = new Map([['Spec.pdf', { mtimeMs: 1, entries }]]);
    plugin.setIndex(entries);
    return plugin;
  };

  it('refuses time: on a PDF, and says which key to use', async () => {
    const r = resolve(await load(), { target: 'Spec.pdf', page: '', time: '1:30', width: '', title: '' });
    assert.ok(r.error, 'time: was silently accepted for a paged document');
    assert.ok(/page:/.test(r.error), r.error);
  });

  it('refuses a #t= fragment on a PDF', async () => {
    const r = resolve(await load(), { target: 'Spec.pdf#t=90', page: '', time: '', width: '', title: '' });
    assert.ok(r.error, r.error);
  });

  it('still takes its own page: form', async () => {
    const r = resolve(await load(), { target: 'Spec.pdf', page: '3', time: '', width: '', title: '' });
    assert.strictEqual(r.position, 3);
  });
});

describe('splitTarget', () => {
  it('splits a hash fragment', () => assert.deepStrictEqual(splitTarget('a.html#_x'), { path: 'a.html', frag: '_x' }));
  it('splits a page fragment', () => assert.deepStrictEqual(splitTarget('a.pdf#page=3'), { path: 'a.pdf', frag: 'page=3' }));
  // The legacy suffix names no unit, and the format is not known here: spelled as a page it
  // would be refused on a recording, where ":90" has always meant ninety seconds.
  it('rewrites a legacy :N suffix without naming a unit', () => assert.deepStrictEqual(splitTarget('a.pdf:3'), { path: 'a.pdf', frag: 'at=3' }));
  it('leaves a bare path alone', () => assert.deepStrictEqual(splitTarget('a.pdf'), { path: 'a.pdf', frag: '' }));
});

describe('embed resolve', () => {
  it('resolves an #id anchor to its section page and name', async () => {
    const r = await res('docs/guide.html#_options');
    assert.strictEqual(r.position, 4);
    assert.strictEqual(r.name, 'Options');
    assert.strictEqual(r.to, 4);
  });

  it('errors when the #id names no section', async () => {
    assert.ok((await res('docs/guide.html#_nope')).error);
  });

  it('reads a page range from the fragment', async () => {
    const r = await res('Spec.pdf#page=2-4');
    assert.strictEqual(r.position, 2);
    assert.strictEqual(r.to, 4);
  });

  it('reads a range from the page: line', async () => {
    const r = await res('Spec.pdf', { page: '3-5' });
    assert.strictEqual(r.position, 3);
    assert.strictEqual(r.to, 5);
  });

  it('names a whole-file embed after the section on its first page', async () => {
    const r = await res('docs/guide.html');
    assert.strictEqual(r.position, 1);
    assert.strictEqual(r.name, 'Intro'); // the section that starts on page 1, not a stray hit
  });

  it('names a range after the document, not one of its sections', async () => {
    const r = await res('docs/guide.html#page=1-4');
    assert.strictEqual(r.name, 'guide');
  });

  it('does not range a format with no outline — a recording renders once', async () => {
    // The clamp is at the end of resolve, past the unit check, so the range has to reach it in
    // the spelling the format accepts: written as a page it is refused before it ever gets there.
    const r = await res('Clip.mp4:10-90');
    assert.ok(!r.error, r.error);
    assert.strictEqual(r.position, 10);
    assert.strictEqual(r.to, 10);
  });

  it('reads the legacy :N suffix in the unit the format counts in', async () => {
    // The suffix is split off before the format is known, so it cannot name a unit. Spelled as
    // a page it was refused on every recording, where ":90" has always meant ninety seconds.
    const clip = await res('Clip.mp4:90');
    assert.ok(!clip.error, clip.error);
    assert.strictEqual(clip.position, 90);
    const doc = await res('Spec.pdf:3-5');
    assert.strictEqual(doc.position, 3);
    assert.strictEqual(doc.to, 5);
  });

  it('caps an over-long range', async () => {
    const r = await res('Spec.pdf#page=1-999');
    assert.strictEqual(r.to - r.position + 1, 20);
  });

  it('errors on a name that matches two documents', async () => {
    assert.ok((await res('Twin')).error);
  });
});
