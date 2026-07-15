'use strict';

const { FuzzySuggestModal } = require('obsidian');
const { t } = require('./shared/i18n');

// Full-screen picker over the reference index. The caller supplies what to do with the
// chosen entry (insert, open, copy…), so the same modal serves every command.
class ReferenceLinkModal extends FuzzySuggestModal {
  constructor(app, plugin, opts) {
    super(app);
    this.plugin = plugin;
    this.onChoose = (opts && opts.onChoose) || (() => {});
    this.initialQuery = (opts && opts.query) || '';
    this.setPlaceholder(t('modal.searchPlaceholder'));
  }

  onOpen() {
    super.onOpen();
    if (this.initialQuery) {
      this.inputEl.value = this.initialQuery;
      this.inputEl.dispatchEvent(new Event('input'));
    }
  }

  getItems() {
    const hidden = new Set(this.plugin.settings.disabledKinds || []);
    return this.plugin.index.filter((e) => !hidden.has(e.lang + ':' + e.kind));
  }

  // Path keeps same-named entries distinct in the modal's own fuzzy search.
  getItemText(e) {
    return `${e.name}  ${e.lang}  ${e.path}`;
  }

  onChooseItem(e) {
    this.onChoose(e);
  }
}

// Small fuzzy picker over viewer presets ({ label, ... }). Used to switch the
// default viewer and to choose a format per insert ("Always ask" / "Insert as…").
class PresetPickerModal extends FuzzySuggestModal {
  constructor(app, items, onChoose, placeholder) {
    super(app);
    this.items = items;
    this.onChoose = onChoose;
    if (placeholder) this.setPlaceholder(placeholder);
  }

  getItems() { return this.items; }
  getItemText(p) { return p.label; }
  onChooseItem(p) { this.onChoose(p); }
}

module.exports = { ReferenceLinkModal, PresetPickerModal };
