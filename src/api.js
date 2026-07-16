'use strict';

// Public API at `app.plugins.plugins['reference-linker'].api`, so other plugins and
// DataviewJS can read the reference index. Mixed into the plugin prototype; methods run
// with the plugin as `this`.

// A plain copy of an index entry, so a consumer can't mutate our live index.
const pick = (e) => ({ name: e.name, kind: e.kind, ext: e.lang, path: e.path, page: e.page || 1 });

module.exports = {
  buildApi() {
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
