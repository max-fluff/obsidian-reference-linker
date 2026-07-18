'use strict';

// Public API at `app.plugins.plugins['reference-linker'].api`, so other plugins and
// DataviewJS can read the reference index. Mixed into the plugin prototype; methods run
// with the plugin as `this`.

const { LINKER_API } = require('./shared/discover');
const { splitTarget } = require('./shared/markdown');
const { bindingOwner, ownsBinding } = require('./shared/binding');

const OWNER = 'reference';

// A plain copy of an index entry, so a consumer can't mutate our live index.
const pick = (e) => ({ name: e.name, kind: e.kind, ext: e.lang, path: e.path, page: e.page || 1 });

module.exports = {
  buildApi() {
    const plugin = this;
    return {
      version: this.manifest.version,
      // The absolute reference root the scan paths resolve against.
      root: () => this.codeRoot(),

      // Every indexed entry: { name, kind, ext, path, page } (kind is 'file' or 'section').
      getEntries: () => this.index.map(pick),

      // One row per indexed file: { name, path, ext, entries }.
      getFiles: () => this.apiFiles(),

      // Totals: { files, entries, byExt, byKind }.
      getStats: () => this.apiStats(),

      // Entries matching a name or path tail (the same lookup the commands use).
      find: (text) => this.lookup(String(text || '')).map(pick),

      // Render helpers: a portable markdown link, or a ready-to-open absolute URI.
      linkFor: (entry) => this.buildLink(entry),
      uriFor: (entry) => this.fillRoot(this.buildUri(entry)),

      // Subscribe to index rebuilds; returns an unsubscribe function.
      onChange: (cb) => this.onIndexChange(cb),

      // What the sibling linker plugins read. See shared/discover.js and shared/link-owner.js.
      linker: {
        apiVersion: LINKER_API,
        id: 'reference-linker',
        displayName: 'Reference Linker',
        // The sigil half of the family: we resolve an explicit reference rather than
        // matching bare words, so we never contest a prose span.
        kind: 'sigil',
        get precedence() { return plugin.settings.linkPrecedence; },

        // How strongly this link is ours. A `sec:` anchor is the author's own word and
        // settles it; landing in our index is a weaker claim that the code linker can make
        // about the same file whenever the two roots overlap.
        claim: (target, title) => {
          const split = splitTarget(String(target || ''));
          const ttl = title ? String(title) : split.title;
          if (ownsBinding(ttl, OWNER)) return 'binding';
          // Somebody else's anchor. Our index may well contain the file, but the author
          // already said what this link is, and it isn't a reference link.
          if (bindingOwner(ttl)) return null;
          return split.url && plugin.refForTarget(split.url) ? 'index' : null;
        },

        // Whether we'd add a menu entry of this kind, asked before either plugin writes one
        // so the pair can share a submenu instead of doubling up.
        //
        // Both selection actions search on click rather than filtering the menu by what the
        // index holds, so the answer doesn't depend on the text — only on whether our
        // context menu is switched on at all.
        offers: (kind) => (kind === 'convert' || kind === 'open') && !!plugin.settings.contextMenu,
      },
    };
  },

  apiFiles() {
    const out = [];
    for (const v of this.fileCache.values()) {
      const f = v.entries[0]; // the file-level entry is always first
      if (f) out.push({ name: f.name, path: f.path, ext: f.lang, entries: v.entries.length });
    }
    out.sort((a, b) => a.path.localeCompare(b.path));
    return out;
  },

  apiStats() {
    const byExt = {}, byKind = {};
    for (const e of this.index) {
      byExt[e.lang] = (byExt[e.lang] || 0) + 1;
      byKind[e.kind] = (byKind[e.kind] || 0) + 1;
    }
    return { files: this.fileCache.size, entries: this.index.length, byExt, byKind };
  },

  onIndexChange(cb) {
    if (typeof cb !== 'function') return () => {};
    if (!this._indexListeners) this._indexListeners = new Set();
    this._indexListeners.add(cb);
    return () => this._indexListeners.delete(cb);
  },

  notifyIndexChange() {
    for (const cb of this._indexListeners || []) {
      try { cb(); } catch (e) { /* subscriber threw */ }
    }
  },
};
