'use strict';

const { PluginSettingTab, Setting } = require('obsidian');
const { PRESETS, parseExtensions } = require('./constants');
const { formatGroups, knownExtensions } = require('./formats');
const { FolderSuggest, folderSuggestAvailable } = require('./shared/deeplink/folder-suggest');
const { renderFolderList } = require('./shared/folder-list');
const { t, plural } = require('./shared/i18n');
const { renderPrecedenceSetting: precedenceSetting } = require('./shared/precedence');

// Path tidy for the folder-list rows: backslashes to slashes, no trailing slash.
const normFolder = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '').trim();

const normExt = (e) => {
  const x = e.trim().toLowerCase().replace(/^\.+/, '');
  return x ? '.' + x : '';
};

class ReferenceLinkerSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; this.expandedFormats = new Set(); }

  // The dropdown key for the active preset: 'ask' in always-ask mode, else a preset
  // ('u:<i>' for a user viewer). Migration guarantees a template match.
  selectedEditor() {
    if (this.plugin.settings.askOnInsert) return 'ask';
    const p = this.plugin.editorPresets().find((x) => x.template === this.plugin.settings.uriTemplate);
    return p ? p.key : 'file';
  }

  // Chevron toggle shared by the foldable sections.
  foldButton(setting, open, onToggle) {
    setting.addExtraButton((b) => b.setIcon(open ? 'chevron-up' : 'chevron-down')
      .setTooltip(open ? t('set.editors.collapse') : t('set.editors.expand'))
      .onClick(onToggle));
  }

  // Update one viewer's dropdown label as its name is typed, sparing a full re-render.
  refreshPresetOption(dropdown, i, name) {
    if (!dropdown) return;
    const opt = Array.from(dropdown.selectEl.options).find((o) => o.value === 'u:' + i);
    if (opt) opt.text = name || `Viewer ${i + 1}`;
  }

  // Files, not folders, so this is a plain textarea rather than the folder list: the folder
  // autocomplete next to it would offer exactly the wrong thing.
  renderBibliographies(containerEl, save) {
    const s = this.plugin.settings;
    new Setting(containerEl)
      .setName(t('set.bibFiles.name'))
      .setDesc(t('set.bibFiles.desc'))
      .addTextArea((c) => {
        const was = s.bibFiles;
        c.inputEl.addClass('reference-linker-input');
        c.inputEl.rows = 3;
        c.setValue(s.bibFiles).onChange(async (v) => { s.bibFiles = v; await save(false); });
        // On blur, not on every keystroke: re-reading a megabyte of BibTeX per character
        // typed would stall the pane.
        c.inputEl.addEventListener('blur', async () => {
          if (s.bibFiles === was) return;
          await this.plugin.loadCitations();
          this.plugin.startWatchers();
          this.display();
        });
      });

    const missing = this.plugin.bibStatus().filter((x) => !x.exists).map((x) => x.abs);
    if (missing.length) {
      containerEl.createEl('div', { cls: 'reference-linker-note is-error', text: t('set.bibFiles.notFound', { files: missing.join(', ') }) });
    }
    const { keys, matched } = this.plugin.citations;
    containerEl.createEl('div', {
      cls: 'reference-linker-note',
      text: keys ? t('set.bibFiles.stats', { keys, matched }) : t('set.bibFiles.none'),
    });
  }

  // The setting stays one string — parseExtensions reads it unchanged, the list only
  // writes it, so there is nothing to migrate.
  renderExtensions(containerEl, save) {
    const s = this.plugin.settings;
    const known = new Set(knownExtensions());
    const current = [...parseExtensions(s.extensions)];
    const on = new Set(current);

    const commit = async (next) => {
      s.extensions = [...new Set(next)].join(' ');
      await save(true);
      this.display();
    };

    if (this.showExtensions === undefined) this.showExtensions = !on.size;
    const heading = new Setting(containerEl)
      .setName(t('set.extensions.name'))
      .setDesc(on.size
        ? t('set.extensions.count', { n: current.filter((e) => known.has(e)).length, total: known.size })
        : t('set.extensions.none'))
      .addExtraButton((c) => c
        .setIcon('list-plus')
        .setTooltip(t('set.extensions.addAll'))
        .onClick(() => commit([...current, ...known])));
    this.foldButton(heading, this.showExtensions, () => { this.showExtensions = !this.showExtensions; this.display(); });
    if (!this.showExtensions) return;

    for (const g of formatGroups()) {
      const enabled = g.exts.filter((e) => on.has(e));
      const open = this.expandedFormats.has(g.id);
      const partial = enabled.length > 0 && enabled.length < g.exts.length;
      const row = new Setting(containerEl)
        .setName(t('set.format.' + g.id))
        .setDesc(partial
          ? t('set.extensions.meta', { n: enabled.length, total: g.exts.length, exts: g.exts.join(' ') })
          : g.exts.join(' '));

      if (g.exts.length > 1) {
        this.foldButton(row, open, () => {
          if (open) this.expandedFormats.delete(g.id); else this.expandedFormats.add(g.id);
          this.display();
        });
      }
      row.addToggle((c) => c.setValue(enabled.length > 0)
        .onChange((v) => commit(v ? [...current, ...g.exts] : current.filter((e) => !g.exts.includes(e)))));

      if (!open) continue;
      for (const ext of g.exts) {
        const sub = new Setting(containerEl)
          .setName(ext)
          .addToggle((c) => c.setValue(on.has(ext))
            .onChange((v) => commit(v ? [...current, ext] : current.filter((e) => e !== ext))));
        sub.settingEl.addClass('reference-linker-kind-row');
      }
    }

    renderFolderList(containerEl, {
      cls: 'reference-linker',
      name: t('set.extensions.other.name'),
      desc: t('set.extensions.other.desc'),
      get: () => [...parseExtensions(s.extensions)].filter((e) => !known.has(e)).join('\n'),
      set: (v) => commit([...current.filter((e) => known.has(e)), ...parseExtensions(v)]),
      normalize: normExt,
      placeholder: t('set.extensions.other.add'),
      removeLabel: t('set.folderList.remove'),
      addLabel: t('set.folderList.addAria'),
    });
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    // Scanned-content changes pass rebuild=true; query-time tweaks just persist.
    const save = async (rebuild) => { await this.plugin.saveSettings(); if (rebuild) await this.plugin.rebuildIndex(false); };
    const wide = (c) => { c.inputEl.addClass('reference-linker-input'); return c; };

    // --- Reference index ----------------------------------------------------
    new Setting(containerEl).setName(t('set.heading.index')).setHeading();

    new Setting(containerEl)
      .setName(t('set.codeRoot.name'))
      .setDesc(t('set.codeRoot.desc'))
      .addText((c) => {
        wide(c).setPlaceholder(this.plugin.codeRoot()).setValue(s.codeRoot).onChange(async (v) => { s.codeRoot = v.trim(); await save(false); });
        if (folderSuggestAvailable()) new FolderSuggest(this.app, c.inputEl, () => '', null, () => this.plugin.codeRoot());
      });

    const folderList = (name, desc, key) => renderFolderList(containerEl, {
      cls: 'reference-linker',
      name,
      desc,
      get: () => s[key],
      set: async (v) => { s[key] = v; await save(false); },
      normalize: normFolder,
      attachSuggest: folderSuggestAvailable()
        ? (inputEl, onPick) => new FolderSuggest(this.app, inputEl, () => this.plugin.codeRoot(), onPick)
        : null,
      placeholder: t('set.folderList.add'),
      removeLabel: t('set.folderList.remove'),
      addLabel: t('set.folderList.addAria'),
    });

    folderList(t('set.scanFolders.name'), t('set.scanFolders.desc'), 'scanRoots');
    const missing = this.plugin.scanRootStatus().filter((x) => !x.exists).map((x) => x.rel);
    if (missing.length) {
      containerEl.createEl('div', { cls: 'reference-linker-note is-error', text: t('set.scanFolders.notFound', { folders: missing.join(', ') }) });
    }

    this.renderExtensions(containerEl, save);

    folderList(t('set.skipFolders.name'), t('set.skipFolders.desc'), 'skipDirs');

    new Setting(containerEl)
      .setName(t('set.autoRefresh.name'))
      .setDesc(t('set.autoRefresh.desc'))
      .addToggle((c) => c.setValue(s.autoRefresh).onChange(async (v) => { s.autoRefresh = v; await save(false); if (v) this.plugin.startWatchers(); else this.plugin.stopWatchers(); }));

    if (s.autoRefresh && this.plugin.watchUnsupported) {
      const warn = new Setting(containerEl).setDesc(t('set.autoRefresh.unsupported'));
      warn.settingEl.addClass('mod-warning');
    }

    this.renderBibliographies(containerEl, save);

    const root = this.plugin.codeRoot() || t('set.info.unknownRoot');
    containerEl.createEl('div', { cls: 'reference-linker-note', text: t('set.info', { root, entries: plural('entry', this.plugin.index.length) }) });

    // --- Suggestions & links ------------------------------------------------
    new Setting(containerEl).setName(t('set.heading.suggestions')).setHeading();

    new Setting(containerEl)
      .setName(t('set.trigger.name'))
      .setDesc(t('set.trigger.desc'))
      .addText((c) => c.setValue(s.trigger).onChange(async (v) => { s.trigger = v || '@!'; await save(false); }));

    new Setting(containerEl).setName(t('set.minChars.name')).setDesc(t('set.minChars.desc')).addText((c) => {
      c.inputEl.type = 'number';
      c.inputEl.min = '0';
      c.setValue(String(s.minChars)).onChange(async (v) => { const n = parseInt(v, 10); s.minChars = Number.isFinite(n) && n >= 0 ? n : 1; await save(false); });
    });

    new Setting(containerEl).setName(t('set.maxResults.name')).setDesc(t('set.maxResults.desc')).addText((c) => {
      c.inputEl.type = 'number';
      c.inputEl.min = '1';
      c.setValue(String(s.maxResults)).onChange(async (v) => { const n = parseInt(v, 10); s.maxResults = Number.isFinite(n) && n > 0 ? n : 12; await save(false); });
    });

    let presetDropdown; // so a rename below can refresh its label without a re-render

    new Setting(containerEl)
      .setName(t('set.editorPreset.name'))
      .setDesc(t('set.editorPreset.desc'))
      .addDropdown((d) => {
        presetDropdown = d;
        for (const p of this.plugin.editorPresets()) d.addOption(p.key, p.label);
        d.addOption('ask', t('set.preset.ask'));
        d.setValue(this.selectedEditor()).onChange(async (v) => {
          s.askOnInsert = v === 'ask';
          if (!s.askOnInsert) {
            const p = this.plugin.editorPresets().find((x) => x.key === v);
            if (p) s.uriTemplate = p.template;
          }
          await save(false);
        });
      });

    // Your viewers — foldable list of named URL templates that join the dropdown above.
    if (this.showEditors === undefined) this.showEditors = false;
    const editors = s.editors || [];
    const editorsHeading = new Setting(containerEl)
      .setName(t('set.editors.name'))
      .setDesc(t('set.editors.count', { n: editors.length }));
    this.foldButton(editorsHeading, this.showEditors, () => { this.showEditors = !this.showEditors; this.display(); });

    if (this.showEditors) {
      editors.forEach((ed, i) => {
        const row = new Setting(containerEl)
          .addText((c) => { c.inputEl.addClass('reference-linker-editor-name'); c.setPlaceholder(t('set.editors.namePlaceholder')).setValue(ed.name).onChange(async (v) => { ed.name = v; this.refreshPresetOption(presetDropdown, i, v); await save(false); }); })
          .addText((c) => { c.inputEl.addClass('reference-linker-editor-tpl'); c.setPlaceholder('sioyek --page {page} {abs}').setValue(ed.template).onChange(async (v) => { if (s.uriTemplate === ed.template) s.uriTemplate = v; ed.template = v; await save(false); }); })
          .addExtraButton((b) => b.setIcon('trash').setTooltip(t('set.editors.remove')).onClick(async () => { if (s.uriTemplate === ed.template) s.uriTemplate = PRESETS.file; editors.splice(i, 1); await save(false); this.display(); }));
        row.settingEl.addClass('reference-linker-editor-row');
      });
      new Setting(containerEl)
        .setDesc(t('set.editors.desc'))
        .addButton((b) => b.setButtonText(t('set.editors.add')).setCta().onClick(async () => { editors.push({ name: '', template: '' }); s.editors = editors; await save(false); this.display(); }));
    }

    new Setting(containerEl)
      .setName(t('set.contextMenu.name'))
      .setDesc(t('set.contextMenu.desc'))
      .addToggle((c) => c.setValue(s.contextMenu).onChange(async (v) => { s.contextMenu = v; await save(false); }));

    new Setting(containerEl).setName(t('set.heading.hover')).setHeading();

    new Setting(containerEl)
      .setName(t('set.hoverPreview.name'))
      .setDesc(t('set.hoverPreview.desc'))
      .addToggle((c) => c.setValue(s.hoverPreview).onChange(async (v) => { s.hoverPreview = v; await save(false); }));

    new Setting(containerEl)
      .setName(t('set.documentView.name'))
      .setDesc(t('set.documentView.desc'))
      .addDropdown((c) => c
        .addOption('column', t('set.documentView.column'))
        .addOption('page', t('set.documentView.page'))
        .setValue(s.documentView === 'page' ? 'page' : 'column')
        .onChange(async (v) => { s.documentView = v; await save(false); }));

    new Setting(containerEl).setName(t('set.heading.links')).setHeading();

    new Setting(containerEl)
      .setName(t('set.markStaleLinks.name'))
      .setDesc(t('set.markStaleLinks.desc'))
      .addToggle((c) => c.setValue(s.markStaleLinks).onChange(async (v) => { s.markStaleLinks = v; await save(false); }));

    new Setting(containerEl).setName(t('set.heading.maintenance')).setHeading();

    // First thing in Maintenance, in the same place in all four plugins: it is a
    // vault-wide arrangement between plugins rather than a knob for this one, and it
    // renders nothing at all unless another linker is installed.
    precedenceSetting(containerEl, {
      app: this.app,
      provider: this.plugin.api && this.plugin.api.linker,
      Setting,
      cls: 'reference-linker',
      save: async (value) => { s.linkPrecedence = value; await save(false); },
    });

    new Setting(containerEl)
      .setName(t('set.rebuild.name'))
      .setDesc(t('set.rebuild.desc'))
      .addButton((b) => b.setButtonText(t('set.rebuild.button')).onClick(() => this.plugin.rebuildIndex(true).then(() => this.display())));
  }
}

module.exports = { ReferenceLinkerSettingTab };
