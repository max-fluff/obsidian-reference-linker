'use strict';

const { describe, it, assert } = require('../src/shared/testing/harness');
const { installStubs, obsidianStub, elLike } = require('../src/shared/testing/stubs');

installStubs();

const { suggestionThumbnailSrc } = require('../src/suggestion-thumbnail');
const { ReferenceSuggest } = require('../src/suggest');

const image = (path = 'assets/terminal.svg') => ({
  kind: 'file', lang: 'svg', name: 'terminal', path,
});

function pluginFor(absolutePath, file = new obsidianStub.TFile()) {
  const lookedUp = [];
  const vault = {
    adapter: { getBasePath: () => '/library/Videos' },
    getAbstractFileByPath: (path) => { lookedUp.push(path); return file; },
    getResourcePath: () => 'app://vault/terminal.svg',
  };
  return {
    plugin: {
      app: { vault },
      settings: { showSuggestionThumbnails: true },
      entryPath: () => absolutePath,
    },
    lookedUp,
  };
}

describe('suggestion image thumbnails', () => {
  it('resolves an indexed image inside the vault, even when the reference root is its parent', () => {
    const { plugin, lookedUp } = pluginFor('/library/Videos/assets/terminal.svg');
    assert.strictEqual(suggestionThumbnailSrc(plugin, image()), 'app://vault/terminal.svg');
    assert.deepStrictEqual(lookedUp, ['assets/terminal.svg']);
  });

  it('leaves external, sibling, and missing files as ordinary suggestions', () => {
    for (const absolutePath of ['/library/Other/terminal.svg', '/library/Videos-copy/terminal.svg']) {
      const { plugin, lookedUp } = pluginFor(absolutePath);
      assert.strictEqual(suggestionThumbnailSrc(plugin, image()), null);
      assert.deepStrictEqual(lookedUp, []);
    }
    const { plugin } = pluginFor('/library/Videos/assets/terminal.svg', null);
    assert.strictEqual(suggestionThumbnailSrc(plugin, image()), null);
  });

  it('ignores section and non-image entries without querying the vault', () => {
    const { plugin, lookedUp } = pluginFor('/library/Videos/assets/terminal.svg');
    assert.strictEqual(suggestionThumbnailSrc(plugin, { ...image(), kind: 'section' }), null);
    assert.strictEqual(suggestionThumbnailSrc(plugin, { ...image(), lang: 'pdf' }), null);
    assert.deepStrictEqual(lookedUp, []);
  });

  it('accepts each supported image extension', () => {
    const { plugin } = pluginFor('/library/Videos/assets/terminal.svg');
    for (const lang of ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif']) {
      assert.strictEqual(suggestionThumbnailSrc(plugin, { ...image(), lang }), 'app://vault/terminal.svg');
    }
  });

  it('keeps the usual row if the vault adapter cannot resolve the resource', () => {
    const { plugin } = pluginFor('/library/Videos/assets/terminal.svg');
    plugin.app.vault.getResourcePath = () => { throw new Error('resource unavailable'); };
    assert.strictEqual(suggestionThumbnailSrc(plugin, image()), null);
  });

  it('renders the thumbnail before the existing columns only when enabled', () => {
    const { plugin } = pluginFor('/library/Videos/assets/terminal.svg');
    const suggester = new ReferenceSuggest(plugin.app, plugin);
    const withThumbnail = elLike();
    suggester.renderSuggestion(image(), withThumbnail);
    assert.deepStrictEqual(withThumbnail.children.map((child) => child.tag), ['img', 'span', 'span', 'span']);
    assert.strictEqual(withThumbnail.children[0].attrs.src, 'app://vault/terminal.svg');
    assert.strictEqual(withThumbnail.children[0].attrs.alt, '');

    plugin.settings.showSuggestionThumbnails = false;
    const usual = elLike();
    suggester.renderSuggestion(image(), usual);
    assert.deepStrictEqual(usual.children.map((child) => child.tag), ['span', 'span', 'span']);
  });
});
