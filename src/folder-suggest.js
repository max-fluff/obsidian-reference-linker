'use strict';

const obsidian = require('obsidian');
const fs = require('fs');
const nodePath = require('path');
const { AbstractInputSuggest } = obsidian;

// Filesystem folder autocomplete. The scan paths point outside the vault, so
// vault-based suggesters don't apply — this walks the real tree one segment at a
// time, like a shell completer. Two modes:
//   • getRoot() returns a base → the query is relative to it (scan/skip lists).
//   • getRoot() returns '' → the query is an absolute path (the code-root field);
//     until a separator is typed the list is seeded from getSeed() so suggestions
//     show from the first keystroke instead of only after "X:/".
// AbstractInputSuggest landed after minAppVersion, so callers feature-detect with
// folderSuggestAvailable before constructing.
class FolderSuggest extends AbstractInputSuggest {
  constructor(app, inputEl, getRoot, onSelect, getSeed) {
    super(app, inputEl);
    this.inputEl = inputEl;
    this.getRoot = getRoot;
    this.onSelect = onSelect;
    this.getSeed = getSeed;
  }

  // Immediate subdirectory names of an absolute dir, or [] if it can't be read.
  subdirs(dir) {
    try {
      return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    } catch (e) { return []; }
  }

  getSuggestions(query) {
    const base = this.getRoot ? this.getRoot() : '';
    const q = query.replace(/\\/g, '/');
    const slash = q.lastIndexOf('/');
    const partial = (slash === -1 ? q : q.slice(slash + 1)).toLowerCase();
    const head = slash === -1 ? '' : q.slice(0, slash);

    let scanDir, prefix;
    if (base) {
      // Relative to the code root; an empty query lists the root's own folders.
      scanDir = nodePath.join(base, head);
      prefix = head;
    } else if (slash === -1) {
      // Code-root field, no separator yet: browse the current default.
      scanDir = this.getSeed ? this.getSeed() : '';
      prefix = scanDir;
    } else {
      // Code-root field, an absolute path is being typed: navigate it.
      scanDir = head.endsWith(':') ? head + '/' : head;
      prefix = head;
    }
    if (!scanDir) return [];
    const stem = prefix.replace(/\/+$/, '');
    return this.subdirs(scanDir)
      .filter((name) => name.toLowerCase().includes(partial))
      .map((name) => (stem ? stem + '/' + name : name))
      .sort()
      .slice(0, 50);
  }

  renderSuggestion(path, el) { el.setText(path); }

  selectSuggestion(path) {
    if (this.onSelect) { this.onSelect(path); this.setValue(''); this.close(); return; }
    this.setValue(path);
    this.inputEl.trigger('input');
    this.close();
  }
}

const folderSuggestAvailable = () => typeof AbstractInputSuggest === 'function';

module.exports = { FolderSuggest, folderSuggestAvailable };
