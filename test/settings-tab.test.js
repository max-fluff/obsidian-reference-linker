'use strict';

// Nothing else in the suite builds this tab end to end — extensions.test.js stubs display()
// out and calls one renderer directly — so a section lost or a throw halfway through it would
// only surface when a reader opens Settings.

const { describe, it, assert } = require('../src/shared/testing/harness');
const path = require('path');
const { fakeApp, installStubs, obsidianStub, RecordingSetting, elLike } = require('../src/shared/testing/stubs');

installStubs();

obsidianStub.Setting = RecordingSetting;

const { t } = require('../src/shared/i18n');
const { PRESETS } = require('../src/constants');
const { emptyCitations } = require('../src/citations');
// The tab destructures `Setting` when it loads, and another test file may already have pulled
// it in through main.js — so it would hold the plain stub. Drop it and load it again, now that
// the recording one is installed.
const TAB = require.resolve(path.join(__dirname, '..', 'src', 'settings-tab.js'));
delete require.cache[TAB];
const { ReferenceLinkerSettingTab } = require(TAB);

function fakePlugin(over) {
  return Object.assign({
    settings: {
      codeRoot: '/lib', scanRoots: '', extensions: '.pdf', skipDirs: '', bibFiles: '',
      autoRefresh: true, trigger: '@!', minChars: 1, maxResults: 12,
      uriTemplate: PRESETS.file, editors: [], askOnInsert: true,
      hoverPreview: true, documentView: 'column', markStaleLinks: true,
      contextMenu: true, linkPrecedence: 10,
    },
    index: [],
    citations: emptyCitations(),
    watchUnsupported: false,
    api: { linker: { id: 'reference-linker', precedence: 10 } },
    codeRoot: () => '/lib',
    scanRootStatus: () => [],
    bibStatus: () => [],
    unmatchedCitations: () => [],
    editorPresets: () => [{ key: 'file', name: 'file://', template: PRESETS.file }],
    saveSettings: async () => {},
    rebuildIndex: async () => {},
    loadCitations: async () => {},
    startWatchers: () => {},
  }, over || {});
}

const draw = (over) => {
  RecordingSetting.reset();
  const tab = new ReferenceLinkerSettingTab(fakeApp, fakePlugin(over));
  tab.containerEl = elLike();
  tab.display();
  return tab;
};

describe('the reference settings tab', () => {
  it('renders every section without throwing', () => {
    draw();
    const headings = RecordingSetting.entries.filter((e) => e.heading).map((e) => e.name);
    assert.ok(headings.includes(t('set.heading.index')), 'index section missing');
    assert.ok(headings.includes(t('set.heading.suggestions')), 'suggestions section missing');
    assert.ok(headings.includes(t('set.heading.hover')), 'hover section missing');
    assert.ok(headings.includes(t('set.heading.maintenance')), 'maintenance section missing');
  });

  it('offers the settings this plugin owns', () => {
    draw();
    const names = RecordingSetting.names();
    assert.ok(names.includes(t('set.codeRoot.name')), 'reference root missing');
    assert.ok(names.includes(t('set.bibFiles.name')), 'bibliographies missing');
    assert.ok(names.includes(t('set.documentView.name')), 'document view missing');
  });

  it('keeps the reader’s place when a fold redraws the pane', () => {
    const tab = draw();
    tab.containerEl.scrollTop = 340;
    tab.display();
    assert.strictEqual(tab.containerEl.scrollTop, 340);
  });
});
