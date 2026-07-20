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
    { name: 'Guide', kind: 'file', path: 'docs/guide.html', lang: 'html', page: 1 },
    { name: 'Intro', kind: 'section', path: 'docs/guide.html', lang: 'html', page: 1, anchor: '_intro' },
    { name: 'Options', kind: 'section', path: 'docs/guide.html', lang: 'html', page: 4, anchor: '_options' },
    { name: 'Spec', kind: 'file', path: 'Spec.pdf', lang: 'pdf', page: 1 },
    { name: 'Chapter', kind: 'section', path: 'Spec.pdf', lang: 'pdf', page: 3 },
    { name: 'Clip', kind: 'file', path: 'Clip.mp4', lang: 'mp4', page: 1 },
    { name: 'Twin', kind: 'section', path: 'a.html', lang: 'html', page: 2, anchor: 'x' },
    { name: 'Twin', kind: 'section', path: 'b.html', lang: 'html', page: 2, anchor: 'y' },
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

const res = async (target, extra) => resolve(await load(), Object.assign({ target, page: '', width: '', title: '' }, extra));

describe('parseSpan', () => {
  it('reads a single number', () => assert.deepStrictEqual(parseSpan('3'), { from: 3, to: 3 }));
  it('reads a hyphen range', () => assert.deepStrictEqual(parseSpan('3-5'), { from: 3, to: 5 }));
  it('reads an en-dash range', () => assert.deepStrictEqual(parseSpan('3–5'), { from: 3, to: 5 }));
  it('orders a reversed range', () => assert.deepStrictEqual(parseSpan('5-3'), { from: 5, to: 5 }));
  it('is null for a non-span', () => assert.strictEqual(parseSpan('intro'), null));
});

describe('splitTarget', () => {
  it('splits a hash fragment', () => assert.deepStrictEqual(splitTarget('a.html#_x'), { path: 'a.html', frag: '_x' }));
  it('splits a page fragment', () => assert.deepStrictEqual(splitTarget('a.pdf#page=3'), { path: 'a.pdf', frag: 'page=3' }));
  it('rewrites a legacy :N suffix', () => assert.deepStrictEqual(splitTarget('a.pdf:3'), { path: 'a.pdf', frag: 'page=3' }));
  it('leaves a bare path alone', () => assert.deepStrictEqual(splitTarget('a.pdf'), { path: 'a.pdf', frag: '' }));
});

describe('embed resolve', () => {
  it('resolves an #id anchor to its section page and name', async () => {
    const r = await res('docs/guide.html#_options');
    assert.strictEqual(r.page, 4);
    assert.strictEqual(r.name, 'Options');
    assert.strictEqual(r.to, 4);
  });

  it('errors when the #id names no section', async () => {
    assert.ok((await res('docs/guide.html#_nope')).error);
  });

  it('reads a page range from the fragment', async () => {
    const r = await res('Spec.pdf#page=2-4');
    assert.strictEqual(r.page, 2);
    assert.strictEqual(r.to, 4);
  });

  it('reads a range from the page: line', async () => {
    const r = await res('Spec.pdf', { page: '3-5' });
    assert.strictEqual(r.page, 3);
    assert.strictEqual(r.to, 5);
  });

  it('names a whole-file embed after the section on its first page', async () => {
    const r = await res('docs/guide.html');
    assert.strictEqual(r.page, 1);
    assert.strictEqual(r.name, 'Intro'); // the section that starts on page 1, not a stray hit
  });

  it('names a range after the document, not one of its sections', async () => {
    const r = await res('docs/guide.html#page=1-4');
    assert.strictEqual(r.name, 'guide');
  });

  it('does not range a format with no outline — media renders once', async () => {
    const r = await res('Clip.mp4#t=10', { page: '1-9' });
    assert.strictEqual(r.to, r.page);
  });

  it('caps an over-long range', async () => {
    const r = await res('Spec.pdf#page=1-999');
    assert.strictEqual(r.to - r.page + 1, 20);
  });

  it('errors on a name that matches two documents', async () => {
    assert.ok((await res('Twin')).error);
  });
});
