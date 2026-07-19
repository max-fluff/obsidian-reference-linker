'use strict';

// Migrating a stored link template to the namespaced root token.
//
// The template is our own setting, so a `{root}` in one can only ever have meant our root —
// but the rewrite has to leave a recognised preset recognised, or the settings pane files it
// under "Custom" and the reader's chosen preset silently becomes a one-off.

const { describe, it, assert } = require('../src/shared/testing/harness');
const path = require('path');
const { fakeApp, installStubs } = require('../src/shared/testing/stubs');
const { PRESETS } = require('../src/constants');

installStubs();

const Plugin = require(path.join(__dirname, '..', 'src', 'main.js'));

// migrateSettings alone, without the rest of onload.
const migrate = (settings) => {
  const plugin = new Plugin(fakeApp, { version: '0.0.0', id: 'reference-linker' });
  plugin.settings = Object.assign({ skipDirs: '', editors: [] }, settings);
  plugin.migrateSettings();
  return plugin.settings;
};

describe('root token migration', () => {
  it('rewrites the old file preset to the namespaced one', () => {
    const s = migrate({ uriTemplate: 'file:///{root}/{path}' });
    assert.strictEqual(s.uriTemplate, PRESETS.file);
  });

  it('leaves the migrated preset recognised, not filed as Custom', () => {
    // What breaks if the rewrite runs after the preset check instead of before it.
    const s = migrate({ uriTemplate: 'file:///{root}/{path}' });
    assert.deepStrictEqual(s.editors, [], 'a built-in preset was preserved as a custom editor');
  });

  it('rewrites a hand-written template too', () => {
    const s = migrate({ uriTemplate: 'myviewer://open?f={root}/{path}' });
    assert.strictEqual(s.uriTemplate, 'myviewer://open?f={ref-root}/{path}');
  });

  it('rewrites the templates of saved viewer presets', () => {
    const s = migrate({
      uriTemplate: PRESETS.file,
      editors: [{ name: 'Mine', template: 'x://{root}/{path}' }],
    });
    assert.strictEqual(s.editors[0].template, 'x://{ref-root}/{path}');
  });

  it('leaves a template with no root token alone', () => {
    const s = migrate({ uriTemplate: 'https://example.com/{path}' });
    assert.strictEqual(s.uriTemplate, 'https://example.com/{path}');
  });

  it('is idempotent — a second load changes nothing', () => {
    const once = migrate({ uriTemplate: 'file:///{root}/{path}' });
    const twice = migrate({ uriTemplate: once.uriTemplate });
    assert.strictEqual(twice.uriTemplate, once.uriTemplate);
  });

  it('never claims the sibling’s token', () => {
    const s = migrate({ uriTemplate: 'file:///{code-root}/{path}' });
    assert.strictEqual(s.uriTemplate, 'file:///{code-root}/{path}');
  });
});
