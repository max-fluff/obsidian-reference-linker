'use strict';

const { describe, it, assert } = require('../src/shared/testing/harness');
const { installStubs, obsidianStub, elLike } = require('../src/shared/testing/stubs');

installStubs();

const { suggestionThumbnailSrc } = require('../src/suggestion-thumbnail');
const { ReferenceSuggest } = require('../src/suggest');

const PREFIX = 'app://0123abcd/';
obsidianStub.Platform.resourcePathPrefix = PREFIX;

const image = (lang = 'svg') => ({ kind: 'file', lang, name: 'terminal', path: 'assets/terminal.' + lang });

const pluginAt = (abs) => ({
  app: {},
  settings: { showSuggestionThumbnails: true },
  entryPath: () => abs,
});

describe('suggestion image thumbnails', () => {
  it('loads an image from a reference root outside the vault through the app resource prefix', () => {
    assert.strictEqual(suggestionThumbnailSrc(pluginAt('/refs/assets/terminal.svg'), image()),
      PREFIX + 'refs/assets/terminal.svg');
  });

  it('escapes a file name that would otherwise end the URL early', () => {
    assert.strictEqual(suggestionThumbnailSrc(pluginAt('/refs/shot #1?.png'), image('png')),
      PREFIX + 'refs/shot%20%231%3F.png');
  });

  it('stamps the URL with the indexed mtime so a replaced image is not served from cache', () => {
    const plugin = pluginAt('/refs/assets/terminal.svg');
    plugin.fileCache = new Map([['assets/terminal.svg', { mtimeMs: 1700000000123.4567, entries: [] }]]);
    assert.strictEqual(suggestionThumbnailSrc(plugin, image()), PREFIX + 'refs/assets/terminal.svg?1700000000123');
  });

  it('accepts each supported image extension', () => {
    for (const lang of ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif']) {
      assert.ok(suggestionThumbnailSrc(pluginAt('/refs/a.' + lang), image(lang)), lang);
    }
  });

  it('leaves sections, other formats and an unrooted path as ordinary suggestions', () => {
    const plugin = pluginAt('/refs/assets/terminal.svg');
    assert.strictEqual(suggestionThumbnailSrc(plugin, { ...image(), kind: 'section' }), null);
    assert.strictEqual(suggestionThumbnailSrc(plugin, image('pdf')), null);
    assert.strictEqual(suggestionThumbnailSrc(pluginAt('assets/terminal.svg'), image()), null);
  });

  it('shows no thumbnail on an app without a resource prefix', () => {
    obsidianStub.Platform.resourcePathPrefix = undefined;
    try {
      assert.strictEqual(suggestionThumbnailSrc(pluginAt('/refs/a.png'), image('png')), null);
    } finally {
      obsidianStub.Platform.resourcePathPrefix = PREFIX;
    }
  });

  it('renders the thumbnail before the existing columns only when enabled', () => {
    const plugin = pluginAt('/refs/assets/terminal.svg');
    const suggester = new ReferenceSuggest(plugin.app, plugin);
    const withThumbnail = elLike();
    suggester.renderSuggestion(image(), withThumbnail);
    assert.deepStrictEqual(withThumbnail.children.map((child) => child.tag), ['img', 'span', 'span', 'span']);
    const img = withThumbnail.children[0];
    assert.strictEqual(img.attrs.src, PREFIX + 'refs/assets/terminal.svg');
    assert.strictEqual(img.attrs.alt, '');
    assert.strictEqual(img.decoding, 'async');

    let removed = false;
    const dropped = [];
    withThumbnail.removeClass = (c) => dropped.push(c);
    img.remove = () => { removed = true; };
    img.fire('error');
    assert.ok(removed, 'broken thumbnail left in the row');
    assert.deepStrictEqual(dropped, ['reference-linker-suggestion-with-thumbnail']);

    plugin.settings.showSuggestionThumbnails = false;
    const usual = elLike();
    suggester.renderSuggestion(image(), usual);
    assert.deepStrictEqual(usual.children.map((child) => child.tag), ['span', 'span', 'span']);
  });
});
