'use strict';

// A #page= fragment is only appended for formats whose viewer honours it. PowerPoint and
// Word are handed the fragment as part of the path and then find no file at all.

const { describe, it, assert } = require('../src/shared/testing/harness');
const path = require('path');
const { fakeApp, installStubs } = require('../src/shared/testing/stubs');

installStubs();

const load = async () => {
  const Plugin = require(path.join(__dirname, '..', 'src', 'main.js'));
  const plugin = new Plugin(fakeApp, { version: '0.0.0', id: 'reference-linker', dir: '.' });
  await plugin.onload();
  plugin.settings.codeRoot = 'D:/root';
  return plugin;
};

const section = (lang, file) => ({ name: 'Details', kind: 'section', lang, path: file, line: 3, page: 3 });

describe('section anchors', () => {
  it('gives a PDF section its page fragment', async () => {
    const plugin = await load();
    assert.strictEqual(plugin.buildUri(section('pdf', 'Spec.pdf')), 'file:///{ref-root}/Spec.pdf#page=3');
  });

  it('leaves a pptx section unanchored, since PowerPoint would choke on the fragment', async () => {
    const plugin = await load();
    assert.strictEqual(plugin.buildUri(section('pptx', 'Deck.pptx')), 'file:///{ref-root}/Deck.pptx');
  });

  it('still pins an unanchored section by its binding, so it tracks without a fragment', async () => {
    const plugin = await load();
    assert.ok(plugin.buildLink(section('pptx', 'Deck.pptx'), false).includes('"sec:Details"'));
  });

  it('anchors a file-level entry in neither format', async () => {
    const plugin = await load();
    const file = { name: 'Deck', kind: 'file', lang: 'pdf', path: 'Deck.pdf', line: 1, page: 1 };
    assert.strictEqual(plugin.buildUri(file), 'file:///{ref-root}/Deck.pdf');
  });
});
