'use strict';

// The list writes one string that every row reads back, so what is asserted here is the
// arithmetic between a format, its own extensions and the ones no handler knows.

const { describe, it, assert } = require('../src/shared/testing/harness');
const { installStubs, obsidianStub, RecordingSetting, elLike, fakeApp } = require('../src/shared/testing/stubs');

installStubs();

const { t } = require('../src/shared/i18n');
const { parseExtensions } = require('../src/constants');

// Must be installed before the module under test destructures `Setting` from 'obsidian'.
obsidianStub.Setting = RecordingSetting;

const { ReferenceLinkerSettingTab } = require('../src/settings-tab');

function render(extensions, expand) {
  RecordingSetting.reset();
  const settings = { extensions };
  const calls = { save: [], display: 0 };
  const tab = new ReferenceLinkerSettingTab(fakeApp, { settings });
  tab.display = () => { calls.display++; };
  tab.showExtensions = true;
  if (expand) tab.expandedFormats.add(expand);
  tab.renderExtensions(elLike(), async (rebuild) => { calls.save.push(rebuild); });
  return { settings, calls, on: () => [...parseExtensions(settings.extensions)] };
}

// Rows are looked up by their rendered name, and another test file may have loaded the
// locales by the time these run: translate at assertion time, as the renderer does.
const images = () => t('set.format.image');
const pdf = () => t('set.format.pdf');

describe('the file-extension list', () => {
  it('turns on every extension of a format at once', async () => {
    const r = render('');
    await RecordingSetting.control(images(), 'toggle').change(true);
    assert.deepStrictEqual(r.on(), ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif']);
  });

  it('turns a format off without touching the others', async () => {
    const r = render('.pdf .png .jpg');
    await RecordingSetting.control(images(), 'toggle').change(false);
    assert.deepStrictEqual(r.on(), ['.pdf']);
  });

  it('reads as on while any of its extensions is', () => {
    render('.png');
    assert.strictEqual(RecordingSetting.control(images(), 'toggle').value, true);
    assert.strictEqual(
      RecordingSetting.entries.find((e) => e.name === images()).desc,
      t('set.extensions.meta', { n: 1, total: 8, exts: '.png .jpg .jpeg .gif .webp .bmp .svg .avif' }),
    );
  });

  it('toggles one extension from the expanded format', async () => {
    const r = render('.png', 'image');
    await RecordingSetting.control('.jpg', 'toggle').change(true);
    assert.deepStrictEqual(r.on(), ['.png', '.jpg']);
  });

  it('rebuilds the index for every change, since it decides what is scanned', async () => {
    const r = render('');
    await RecordingSetting.control(pdf(), 'toggle').change(true);
    assert.deepStrictEqual(r.calls.save, [true]);
  });

  it('keeps an extension no handler knows in its own list', async () => {
    const r = render('.pdf .fb2');
    assert.ok(RecordingSetting.names().includes('.fb2'), 'the unknown extension is not listed');
    await RecordingSetting.control(pdf(), 'toggle').change(false);
    assert.deepStrictEqual(r.on(), ['.fb2']);
  });
});
