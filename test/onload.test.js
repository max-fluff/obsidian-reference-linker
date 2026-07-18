'use strict';

// The plugin must survive being constructed and loaded.
//
// This exists because in a sibling plugin it didn't: a helper was deleted while a call to it
// stayed behind, and the plugin threw in onload and refused to load at all. esbuild bundles
// an undefined identifier happily, and no other test reaches the event wiring — so "it builds
// and the tests pass" said nothing about whether the plugin runs. This runs it.

const { describe, it, assert } = require('./harness');
const path = require('path');
const { fakeApp, installStubs, recordingMenu, fakeEditor } = require('./stubs/app');

installStubs();

const load = async () => {
  const Plugin = require(path.join(__dirname, '..', 'src', 'main.js'));
  const plugin = new Plugin(fakeApp, { version: '0.0.0', id: 'reference-linker' });
  await plugin.onload();
  return plugin;
};

describe('onload', () => {
  it('constructs and loads without throwing', async () => {
    const plugin = await load();
    assert.ok(plugin, 'no plugin instance');
  });

  it('publishes the linker provider a sibling can find', async () => {
    const plugin = await load();
    const provider = plugin.api && plugin.api.linker;
    assert.ok(provider, 'api.linker missing — the code linker would not see us at all');
    assert.strictEqual(provider.id, 'reference-linker');
    assert.strictEqual(provider.kind, 'sigil');
    assert.strictEqual(typeof provider.claim, 'function');
    assert.strictEqual(typeof provider.offers, 'function');
    assert.strictEqual(typeof provider.precedence, 'number');
  });

  it('claims a link carrying one of our own binding anchors', async () => {
    const plugin = await load();
    const claim = plugin.api.linker.claim('file:///x/Spec.pdf', 'sec:Overview');
    assert.strictEqual(claim, 'binding');
  });

  it('leaves a link carrying the code linker’s anchor alone', async () => {
    // The whole point of the graded claim: our index may well hold this file, but the
    // author already said what the link is, and it is not a reference link.
    const plugin = await load();
    const claim = plugin.api.linker.claim('file:///x/Player.cs', 'sym:Player');
    assert.strictEqual(claim, null);
  });

  it('builds the editor menu without throwing', async () => {
    // The handler itself, not just the registration. Everything the reader sees in the
    // right-click menu is built in here, and nothing else in the suite runs a line of it —
    // which is how a call to a deleted helper survived a green test run once already.
    const plugin = await load();
    const handler = fakeApp.handlers.get('editor-menu');
    assert.ok(handler, 'no editor-menu handler was registered');
    const menu = recordingMenu();
    handler(menu, fakeEditor('nothing here matches anything', 3));
    assert.ok(Array.isArray(menu.titles()));
  });
});
