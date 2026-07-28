'use strict';

const path = require('path');
const { describe, it, assert } = require('../src/shared/testing/harness');
const { installStubs, fakeApp } = require('../src/shared/testing/stubs');

installStubs();

// Required lazily, as onload.test.js does: a top-level require of main.js would cache
// settings-tab before extensions.test.js can swap in its recording Setting, breaking it.
let Plugin;
const loadPlugin = () => (Plugin || (Plugin = require(path.join(__dirname, '..', 'src', 'main.js'))));

// A plugin rooted at C:/refs with one indexed file, enough to exercise path resolution and
// the drop-insertion text without the editor or the filesystem.
function plugin(fileCache = new Map()) {
  const p = new (loadPlugin())(fakeApp, { version: '0.0.0', id: 'reference-linker' });
  p.settings = { codeRoot: 'C:/refs', uriTemplate: 'file:///{ref-root}/{path}' };
  p.fileCache = fileCache;
  p.citations = { byPath: new Map() };
  return p;
}

const abs = (rel) => 'C:/refs/' + rel;

describe('drop: resolving a path to an entry', () => {
  it('synthesizes a file entry for a path under the root', () => {
    const e = plugin().entryForAbsPath(abs('papers/report.pdf'));
    assert.strictEqual(e.path, 'papers/report.pdf');
    assert.strictEqual(e.kind, 'file');
    assert.strictEqual(e.name, 'report');
    assert.strictEqual(e.lang, 'pdf');
  });

  it('reuses the indexed entry when the file is already known', () => {
    const indexed = { name: 'The Real Title', kind: 'file', lang: 'pdf', path: 'papers/report.pdf', position: 1 };
    const e = plugin(new Map([['papers/report.pdf', { entries: [indexed] }]])).entryForAbsPath(abs('papers/report.pdf'));
    assert.strictEqual(e, indexed);
  });

  it('returns null for a file outside the reference root', () => {
    assert.strictEqual(plugin().entryForAbsPath('D:/elsewhere/x.pdf'), null);
    assert.strictEqual(plugin().entryForAbsPath('C:/other/x.pdf'), null);
  });
});

// A doc + selection stand-in for a CM6 EditorView.
function fakeView(doc = '') {
  const calls = [];
  return {
    state: { doc: { toString: () => doc, length: doc.length }, selection: { main: { head: 0 } } },
    dispatch: (tr) => calls.push(tr),
    focus: () => {},
    calls,
  };
}

describe('drop: what gets inserted', () => {
  const e1 = { name: 'report', kind: 'file', lang: 'pdf', path: 'papers/report.pdf', position: 1 };
  const e2 = { name: 'notes', kind: 'file', lang: 'pdf', path: 'notes.pdf', position: 1 };

  it('inserts a portable reference link at the drop position', () => {
    const view = fakeView('hello world');
    plugin().insertDropped(view, 5, [e1], 'link');
    const tr = view.calls[0];
    assert.strictEqual(tr.changes.from, 5);
    assert.strictEqual(tr.changes.insert, '[report](file:///{ref-root}/papers/report.pdf)');
  });

  it('inserts an inline embed block', () => {
    const view = fakeView('');
    plugin().insertDropped(view, 0, [e1], 'embed');
    assert.strictEqual(view.calls[0].changes.insert, '```reference-link\npapers/report.pdf\n```\n');
  });

  it('stacks several dropped files, one link per line', () => {
    const view = fakeView('');
    plugin().insertDropped(view, 0, [e1, e2], 'link');
    const inserted = view.calls[0].changes.insert;
    assert.strictEqual(inserted.split('\n').length, 2);
    assert.ok(inserted.includes('papers/report.pdf') && inserted.includes('notes.pdf'));
  });
});
