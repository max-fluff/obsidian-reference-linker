'use strict';
// Reference Linker — autocomplete links to external documents (PDF, Office, images).
//
// Type the trigger (default "@!") followed by a file name; pick a match to insert a
// markdown link whose URL opens the document in an external viewer.
//
// The plugin scans the configured folders itself (Node fs, desktop only) and
// keeps the index in memory — no external build step or index file.

const { Plugin, Notice, normalizePath, MarkdownView } = require('obsidian');
const { EditorView } = require('@codemirror/view');
const { Prec } = require('@codemirror/state');
const fs = require('fs');
const fsp = fs.promises;
const nodePath = require('path');

const { PRESETS, DEFAULT_SETTINGS, parseExtensions, parseSkip, underSkip, pathInTarget } = require('./constants');
const { splitLines, inTableCell, inCode, inLink, linkRegex } = require('./shared/markdown');
const { ReferenceSuggest } = require('./suggest');
const filter = require('./filter');
const { HoverPreview } = require('./hover');
const { registerEmbed } = require('./embed');
const actualize = require('./actualize');
const { ReferenceLinkModal, PresetPickerModal } = require('./modal');
const { ReferenceLinkerSettingTab } = require('./settings-tab');
const { readOutline } = require('./pdf');
const { initI18n, t, plural } = require('./shared/i18n');
const api = require('./api');

// Open a URL through the OS. Obsidian's window.open corrupts a file:// #page= fragment
// (it doubles it — "…pdf#page=3#page=3" — and the OS then can't find the file), so hand it
// straight to the shell, which preserves it; the default PDF app (a browser) honours #page=.
function openExternal(uri) {
  try { require('electron').shell.openExternal(uri); }
  catch { window.open(uri); }
}

// A file:// link carrying a #page= fragment — the case window.open would double.
const PAGE_LINK = /^file:\/\/\/.+#page=\d+/i;

class ReferenceLinkerPlugin extends Plugin {
  async onload() {
    initI18n({ en: require('./locales/en'), ru: require('./locales/ru') });
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.setIndex([]);
    this.watchers = [];
    this.fileCache = new Map();
    this.cacheSignature = '';
    this._indexListeners = new Set(); // API onChange subscribers; needed before the first rebuild
    this.migrateSettings();
    await this.loadCache();
    this.api = this.buildApi(); // app.plugins.plugins['reference-linker'].api
    this.hover = new HoverPreview(this);

    this.registerEditorSuggest(new ReferenceSuggest(this.app, this));
    // Links keep a portable {root} token in the note; the absolute reference root is
    // filled in only when the link is shown or opened, so notes stay portable.
    // Reading view: rewrite the rendered href so Obsidian opens the real file.
    this.registerMarkdownPostProcessor((el) => this.resolveRootLinks(el));
    // Live Preview renders links in CM6 as <span class="cm-link"> with no href, so
    // the post-processor can't reach them and Obsidian would open the literal
    // {root} URL. A high-precedence CM6 handler suppresses that and re-opens the
    // resolved URL through Obsidian's own window.open path — same native prompt as
    // any other external link. Suppress on mousedown (where Obsidian acts) and
    // open on click/auxclick, like a normal link.
    this.registerEditorExtension(
      Prec.highest(
        EditorView.domEventHandlers({
          mousedown: (evt, view) => this.onEditorLink(evt, view, false),
          click: (evt, view) => this.onEditorLink(evt, view, true),
          auxclick: (evt, view) => this.onEditorLink(evt, view, true),
        })
      )
    );
    // Inline ```reference-link embeds, and the Live Preview underline for stale links.
    registerEmbed(this);
    this.registerEditorExtension(actualize.staleLinksExtension(this));
    // Re-scan open editors' stale marks when the index rebuilds (embeds re-render via
    // their own onIndexChange subscription).
    this.register(this.onIndexChange(() => this.refreshStale()));
    this.lastX = 0;
    this.lastY = 0;
    this.registerDomEvent(document, 'mousemove', (evt) => this.onHoverMove(evt));
    this.registerDomEvent(document, 'keydown', (evt) => {
      if (evt.key === 'Control' || evt.key === 'Meta') this.onHoverKey();
    });
    // Scrolling inside the popover must not dismiss it; only scrolls elsewhere do.
    this.registerDomEvent(document, 'scroll', (evt) => {
      if (!this.hover.contains(evt.target)) this.hover.hide();
    }, { capture: true });
    this.registerDomEvent(window, 'blur', () => this.hover.hide());
    this.registerDomEvent(document, 'keyup', (evt) => { if (evt.key === 'Escape') this.hover.hide(); });
    // Reading-view clicks on a #page= link: intercept before Obsidian's opener doubles the
    // fragment (Live Preview goes through onEditorLink).
    this.registerDomEvent(document, 'click', (evt) => this.onAnchorClick(evt), { capture: true });
    this.registerDomEvent(document, 'auxclick', (evt) => this.onAnchorClick(evt), { capture: true });
    this.addSettingTab(new ReferenceLinkerSettingTab(this.app, this));
    this.statusEl = this.addStatusBarItem();
    this.addCommand({ id: 'rebuild-reference-index', name: t('cmd.rebuildIndex'), callback: () => this.rebuildIndex(true) });
    this.addCommand({ id: 'insert-reference-link', name: t('cmd.insertLink'), editorCallback: (editor) => this.pickEntry((e) => this.withFormat(this.settings.askOnInsert, (tpl) => this.insertLink(editor, e, tpl))) });
    this.addCommand({ id: 'insert-reference-link-as', name: t('cmd.insertLinkAs'), editorCallback: (editor) => this.pickEntry((e) => this.withFormat(true, (tpl) => this.insertLink(editor, e, tpl))) });
    this.addCommand({ id: 'open-reference-file', name: t('cmd.openFile'), callback: () => this.pickEntry((e) => this.withFormat(this.settings.askOnInsert, (tpl) => this.openEntry(e, tpl))) });
    this.addCommand({ id: 'copy-reference-link', name: t('cmd.copyLink'), callback: () => this.pickEntry((e) => this.withFormat(this.settings.askOnInsert, (tpl) => this.copyLink(e, tpl))) });
    this.addCommand({ id: 'convert-selection-to-link', name: t('cmd.convertSelection'), editorCallback: (editor) => this.convertSelection(editor) });
    this.addCommand({ id: 'open-selected-reference', name: t('cmd.openSelection'), editorCallback: (editor) => this.openSelection(editor) });
    this.addCommand({ id: 'insert-reference-embed', name: t('cmd.insertEmbed'), editorCallback: (editor) => this.pickEntry((e) => this.insertEmbed(editor, e)) });
    this.addCommand({ id: 'update-links-note', name: t('cmd.updateLinksNote'), callback: () => this.updateLinksInActiveNote() });
    this.addCommand({ id: 'update-links-vault', name: t('cmd.updateLinksVault'), callback: () => this.updateLinksInVault() });

    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor) => {
        if (!this.settings.contextMenu) return;
        // Convert writes a link, so it's offered only where that's safe (not in a link,
        // code, or frontmatter); open is read-only, so it's offered anywhere but a link.
        if (this.selectionTarget(editor, true)) {
          menu.addItem((item) => item.setTitle(t('menu.convert')).setIcon('link').onClick(() => this.convertSelection(editor)));
        }
        if (this.selectionTarget(editor, false)) {
          menu.addItem((item) => item.setTitle(t('cmd.openSelection')).setIcon('file-search').onClick(() => this.openSelection(editor)));
        }
        // Right-clicking one of our reference links: copy its resolved target, and — if the
        // stored line has drifted — offer to fix just that link.
        const link = this.linkAtCursor(editor);
        if (link && this.isReferenceLink(link.name, link.target)) {
          menu.addItem((item) => item.setTitle(t('menu.copyLink')).setIcon('copy').onClick(() => this.copyLinkAtCursor(link)));
          if (this.isLinkStale(link.name, link.target)) {
            menu.addItem((item) => item.setTitle(t('menu.fixLink')).setIcon('wrench').onClick(() => this.fixLinkAtCursor(editor, link)));
          }
        }
      })
    );

    // The disk cache (loaded above) gives an instant index on startup; this
    // background rebuild validates it against the filesystem and refreshes.
    this.app.workspace.onLayoutReady(() => this.rebuildIndex(false));
  }

  onunload() {
    this.stopWatchers();
    clearTimeout(this.watchTimer);
    if (this.hover) this.hover.destroy();
  }

  migrateSettings() {
    // Normalize the skip list to one folder per line (older saves were comma-separated).
    this.settings.skipDirs = (this.settings.skipDirs || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).join('\n');
    // Preserve a non-preset template as a named viewer so it stays selectable.
    const tpl = this.settings.uriTemplate;
    const editors = this.settings.editors || (this.settings.editors = []);
    const known = Object.values(PRESETS).includes(tpl) || editors.some((e) => e.template === tpl);
    if (!known) editors.push({ name: 'Custom', template: tpl });
  }

  // Obsidian URL-encodes the braces in a rendered href, so match both forms.
  fillRoot(v) {
    const root = encodeURI(this.codeRoot().split(nodePath.sep).join('/'));
    return v.replace(/\{root\}|%7Broot%7D/gi, root);
  }

  resolveRootLinks(el) {
    const links = el.querySelectorAll ? el.querySelectorAll('a') : [];
    for (const a of links) {
      for (const attr of ['href', 'data-href']) {
        const v = a.getAttribute(attr);
        if (!v) continue;
        const out = this.fillRoot(v);
        if (out !== v) a.setAttribute(attr, out);
      }
    }
    this.markStaleAnchors(el);
  }

  // Toggle the drifted/broken-link underline on every rendered anchor in `el`. toggle (not
  // add) so re-running after an index rebuild also clears links that are now current.
  markStaleAnchors(el) {
    const links = el.querySelectorAll ? el.querySelectorAll('a') : [];
    for (const a of links) {
      const state = this.settings.markStaleLinks ? this.linkState(a.textContent, a.getAttribute('href') || '') : null;
      a.classList.toggle('reference-linker-stale', state === 'stale');
      a.classList.toggle('reference-linker-broken', state === 'broken');
    }
  }

  // After an index rebuild, refresh stale marks in both render modes: the CM6 effect for
  // Live Preview, and a re-scan of rendered anchors for Reading view (its post-processor
  // doesn't re-run on its own).
  refreshStale() {
    actualize.refreshStaleLinks(this.app);
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (view && view.getViewType && view.getViewType() === 'markdown' && view.containerEl) {
        this.markStaleAnchors(view.containerEl);
      }
    });
  }

  hoverEnabled() {
    return this.settings.hoverPreview;
  }

  // Pointer tracking that mirrors a real page preview. Rendered (Reading view) links
  // preview on plain hover; the editor (Live Preview) needs the modifier — same split
  // as native page preview. Idle in the editor (nothing shown, no modifier, not over a
  // rendered link) does no work beyond storing the position. While a preview is up it
  // follows the pointer so it stays until you leave the link (entering it keeps it).
  onHoverMove(evt) {
    this.lastX = evt.clientX;
    this.lastY = evt.clientY;
    if (!this.hoverEnabled()) return;
    if (evt.buttons) return;
    // evt.target is already the element under the pointer for a mousemove; using it
    // avoids elementFromPoint's synchronous layout flush on every pointer move.
    const el = evt.target;
    if (this.hover.contains(el)) { this.hover.cancelHide(); return; }
    const mod = evt.ctrlKey || evt.metaKey;
    // A rendered anchor can preview without the modifier, so we must resolve over one
    // even when idle; the editor's modifier-gated links don't, so skip the work there.
    const overAnchor = !!(el && el.closest && el.closest('a'));
    if (!this.hover.isVisible() && !this.hover.pendingKey && !mod && !overAnchor) return;
    const hit = this.entryAtPoint(el, evt.clientX, evt.clientY);
    if (hit && (!hit.requireMod || mod)) {
      this.hover.cancelHide();
      this.hover.schedule(hit.entry, evt.clientX, evt.clientY);
    } else if (this.hover.isVisible() || this.hover.pendingKey) {
      this.hover.leave();
    }
  }

  // Pressing the modifier while already hovering a link shows it — the other order
  // (modifier first, then move onto the link) is handled by onHoverMove.
  onHoverKey() {
    if (!this.hoverEnabled()) return;
    const el = document.elementFromPoint(this.lastX, this.lastY);
    if (this.hover.contains(el)) return;
    const hit = this.entryAtPoint(el, this.lastX, this.lastY);
    if (hit) this.hover.schedule(hit.entry, this.lastX, this.lastY);
  }

  // The document under a screen point as { entry, requireMod }, across both render
  // modes, or null. Reading view carries the URL on a rendered anchor and previews on
  // plain hover; Live Preview's CM6 link span has no href (recovered from the editor at
  // those coordinates) and requires the modifier, like a link in the editor natively.
  entryAtPoint(el, x, y) {
    if (!el || !el.closest) return null;
    const a = el.closest('a');
    if (a && !(a.classList && a.classList.contains('internal-link'))) {
      const entry = this.entryUnderPointer(a.textContent, a.getAttribute('href') || a.getAttribute('data-href') || '');
      if (entry) return { entry, requireMod: false };
    }
    if (el.closest('.cm-link')) {
      const view = typeof EditorView.findFromDOM === 'function' ? EditorView.findFromDOM(el) : this.activeCm();
      const ref = view && this.codeRefAt(view, x, y);
      if (ref) {
        const entry = this.entryUnderPointer(ref.name, ref.target);
        if (entry) return { entry, requireMod: true };
      }
    }
    return null;
  }

  // The CM6 EditorView of the active Markdown editor, used as a fallback when
  // EditorView.findFromDOM isn't available to map a point to its editor.
  activeCm() {
    const mv = this.app.workspace.getActiveViewOfType(MarkdownView);
    return mv && mv.editor && mv.editor.cm;
  }

  // Resolve a hovered link's display name + target to an index entry, or null
  // (so non-reference links — a wiki link, a web link, a custom Unity-scene link —
  // simply show nothing). The entry's relative path must appear in the target,
  // which every preset embeds via {path}/{abs}; that rejects unrelated links even
  // when their text matches a symbol name. Ties are broken by the line in the
  // target, preferring a declaration over the bare file entry.
  entryUnderPointer(name, target) {
    if (!name || !target) return null;
    const { dec, cand } = this.linkCandidates(name, target);
    if (cand.length <= 1) return cand[0] || null;
    const onLine = cand.find((e) => new RegExp('[:=]' + e.line + '(?:\\D|$)').test(dec));
    return onLine || cand.find((e) => e.kind !== 'file') || cand[0];
  }

  // CM6 link handler for Live Preview. Suppresses Obsidian's open of the literal
  // {root} URL; opens the resolved one on click/auxclick. Returns true when handled.
  onEditorLink(evt, view, open) {
    if (evt.button !== 0 && evt.button !== 1) return false; // left/middle only; keep right-click menu
    const uri = this.rootUriAt(evt, view);
    if (!uri) return false;
    // return true only prevents CM6's default; stopPropagation keeps the event from
    // reaching Obsidian's document-level opener (which would open the literal URL).
    evt.preventDefault();
    evt.stopPropagation();
    if (open) openExternal(uri);
    return true;
  }

  // Reading view renders our links as real <a>. Obsidian's own click handler opens them
  // via window.open, which doubles a #page= fragment — so for those links we intercept in
  // the capture phase and open through the shell instead. Other links are left to Obsidian.
  onAnchorClick(evt) {
    if (evt.button !== 0 && evt.button !== 1) return;
    const a = evt.target && evt.target.closest && evt.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href') || a.getAttribute('data-href') || '';
    const filled = /\{root\}|%7Broot%7D/i.test(href) ? this.fillRoot(href) : href;
    if (!PAGE_LINK.test(filled)) return;
    evt.preventDefault();
    evt.stopPropagation();
    openExternal(filled);
  }

  // The markdown link at screen coords in Live Preview, as { name, target }. The
  // rendered span has no href, so map the coords to a document position and read it.
  codeRefAt(view, x, y) {
    if (typeof view.posAtCoords !== 'function') return null;
    const offset = view.posAtCoords({ x, y });
    if (offset == null) return null;
    const line = view.state.doc.lineAt(offset);
    const ch = offset - line.from;
    const re = linkRegex();
    let m;
    while ((m = re.exec(line.text))) {
      if (ch < m.index || ch > m.index + m[0].length) continue;
      return { name: m[1], target: m[2].trim() };
    }
    return null;
  }

  // The link under the click resolved, if it carries a {root} token (else null,
  // so a plain link falls through to Obsidian's own opener).
  rootUriAt(evt, view) {
    const el = evt.target;
    if (!el || !el.closest || !el.closest('.cm-link')) return null;
    const ref = this.codeRefAt(view, evt.clientX, evt.clientY);
    if (!ref) return null;
    return /\{root\}|%7Broot%7D/i.test(ref.target) ? this.fillRoot(ref.target) : null;
  }

  // Absolute base folder the scan paths are resolved against.
  codeRoot() {
    if (this.settings.codeRoot) return this.settings.codeRoot;
    const adapter = this.app.vault.adapter;
    const base = adapter && typeof adapter.getBasePath === 'function' ? adapter.getBasePath() : '';
    return base ? nodePath.dirname(base) : '';
  }

  cacheFilePath() {
    return normalizePath(`${this.manifest.dir}/index-cache.json`);
  }

  // A fingerprint of what the scan would produce: the indexed extensions plus a format
  // version (bumped when indexing logic changes, e.g. PDF sections were added). When it
  // changes, the per-file cache is stale even if mtimes haven't moved, so we drop it.
  indexSignature() {
    return JSON.stringify({ v: 2, exts: [...parseExtensions(this.settings.extensions)].sort() });
  }

  async loadCache() {
    try {
      const p = this.cacheFilePath();
      if (!(await this.app.vault.adapter.exists(p))) return;
      const data = JSON.parse(await this.app.vault.adapter.read(p));
      if (!data || data.version !== 1 || !data.files) return;
      this.cacheSignature = data.signature || '';
      this.fileCache = new Map(Object.entries(data.files));
      this.setIndex(this.flattenCache());
    } catch {
      /* corrupt cache: ignore, the rebuild will repopulate it */
    }
  }

  async saveCache() {
    try {
      const files = {};
      for (const [rel, v] of this.fileCache.entries()) files[rel] = v;
      const data = { version: 1, signature: this.cacheSignature, files };
      await this.app.vault.adapter.write(this.cacheFilePath(), JSON.stringify(data));
    } catch {
      /* best-effort: a missing cache only costs a slower next startup */
    }
  }

  flattenCache() {
    const out = [];
    for (const v of this.fileCache.values()) for (const e of v.entries) out.push(e);
    out.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
    return out;
  }

  // Set the index and its name lookup together. byName groups entries by lowercased
  // name so resolving a link/symbol scans only the same-named entries, not the whole
  // index (the hot paths — hover, stale marks, embeds — call this per event).
  setIndex(entries) {
    this.index = entries;
    this.byName = new Map();
    this.kinds = new Set(); // kind labels present, for inline "sec:" filters
    this.exts = new Set();  // extensions present, for inline "pdf:" filters
    for (const e of entries) {
      const k = e.name.toLowerCase();
      const a = this.byName.get(k);
      if (a) a.push(e); else this.byName.set(k, [e]);
      this.kinds.add(e.kind);
      this.exts.add(e.lang);
    }
  }

  // Index entries whose (lowercased) name equals `name` — the candidate set a bare
  // symbol resolves against.
  entriesByName(name) {
    return this.byName.get(String(name).toLowerCase()) || [];
  }

  // An inline prefix filters by extension ("pdf:") or kind ("sec:", a shorthand for
  // "section"); the rest is the name to match.
  parseQuery(raw) {
    const kinds = this.kinds && this.kinds.has('section') ? new Set([...this.kinds, 'sec']) : this.kinds;
    const f = filter.parseQuery(raw, kinds, this.exts);
    if (f.kind === 'sec') f.kind = 'section';
    return f;
  }

  entryPassesFilter(e, f) {
    return (!f.kind || e.kind === f.kind) && (!f.ext || e.lang === f.ext);
  }

  // Decode a link target and return { dec, cand }: the decoded string and the entries
  // whose display name matches and whose path appears in it — the shared first step of
  // resolving a link. Callers apply their own tie-break (hover uses the stored line,
  // actualization must not).
  linkCandidates(name, target) {
    let dec = this.fillRoot(target);
    try { dec = decodeURIComponent(dec); } catch { /* malformed escape: match on the raw form */ }
    dec = dec.split('\\').join('/');
    const named = this.entriesByName(name).filter((e) => e.name === name && pathInTarget(dec, e.path));
    // A shorter path can be a boundary-tail of the real one (Foo.cs inside src/Foo.cs);
    // the longest matching path is the file the link actually points at.
    const bestLen = named.reduce((mx, e) => Math.max(mx, e.path.length), 0);
    const cand = named.filter((e) => e.path.length === bestLen);
    return { dec, cand };
  }

  // The longest indexed file path a link target points at, or null — lets linkState tell a
  // broken link (file indexed, symbol gone) from an unrelated one. Only runs for links that
  // don't resolve, so the file scan stays off the hot path.
  targetIndexedFile(dec) {
    let best = null;
    for (const rel of this.fileCache.keys()) {
      if ((!best || rel.length > best.length) && pathInTarget(dec, rel)) best = rel;
    }
    return best;
  }

  // The set of indexed extensions (".pdf" etc.), used for the scan and watch filtering.
  watchedExts() {
    return parseExtensions(this.settings.extensions);
  }

  startWatchers() {
    this.stopWatchers();
    this.watchUnsupported = false;
    if (!this.settings.autoRefresh) return;
    const root = this.codeRoot();
    if (!root) return;
    for (const r of this.scanFolders()) {
      const dir = nodePath.join(root, r);
      if (!fs.existsSync(dir)) continue;
      try {
        const w = fs.watch(dir, { recursive: true }, (_evt, filename) => this.onWatchEvent(r, filename));
        this.watchers.push(w);
      } catch (e) {
        // Recursive watching isn't available on Linux — auto-refresh can't work there.
        if (e && e.code === 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM') this.watchUnsupported = true;
        /* else: transient FS issue; a manual rebuild re-arms the watchers */
      }
    }
    if (this.watchUnsupported && !this.watchUnsupportedNotified) {
      this.watchUnsupportedNotified = true;
      new Notice(t('notice.watchUnsupported'));
    }
  }

  stopWatchers() {
    for (const w of this.watchers) {
      try {
        w.close();
      } catch {
        /* already closed */
      }
    }
    this.watchers = [];
  }

  // Debounce a background rebuild on file changes. Skip-dir noise (node_modules)
  // and files we don't index are dropped cheaply before scheduling. `r` is the scan
  // root the event came from, so the path can be resolved relative to the reference root.
  onWatchEvent(r, filename) {
    if (filename) {
      const base = (r || '').split('\\').join('/').replace(/\/+$/, '');
      const rel = (base ? base + '/' : '') + String(filename).split('\\').join('/');
      if (underSkip(rel, parseSkip(this.settings.skipDirs))) return;
      const ext = nodePath.extname(rel).toLowerCase();
      if (ext && !this.watchedExts().has(ext)) return;
    }
    clearTimeout(this.watchTimer);
    this.watchTimer = setTimeout(() => this.rebuildIndex(false), 1500);
  }

  // Empty the index (nothing to scan) and persist, telling whoever's listening.
  async resetIndex(noticeKey, notify) {
    this.setIndex([]);
    this.fileCache = new Map();
    await this.saveCache();
    this.notifyIndexChange();
    if (notify) new Notice(t(noticeKey));
  }

  async rebuildIndex(notify) {
    this.stopWatchers();
    const root = this.codeRoot();
    if (!root) {
      if (notify) new Notice(t('notice.noCodeRoot'));
      return;
    }
    const roots = this.scanFolders();

    const exts = this.watchedExts();
    if (!exts.size) {
      await this.resetIndex('notice.noExtensions', notify);
      return;
    }

    // Reuse cached entries only while the indexed extensions haven't changed.
    const signature = this.indexSignature();
    const old = signature === this.cacheSignature ? this.fileCache : new Map();
    // Update the status bar every 200th file, not every file, to spare layout.
    let seen = 0;
    const onFile = () => { if (++seen % 200 === 0) this.statusEl.setText(t('status.indexing', { n: seen })); };
    const scan = { root, exts, skip: parseSkip(this.settings.skipDirs), old, next: new Map(), onFile };
    try {
      for (const r of roots) {
        await this.walk(nodePath.join(root, r), scan);
      }
    } catch (err) {
      this.statusEl.setText('');
      if (notify) new Notice(t('notice.scanFailed', { error: err && err.message }));
      return;
    }
    this.statusEl.setText('');

    this.fileCache = scan.next;
    this.cacheSignature = signature;
    this.setIndex(this.flattenCache());
    await this.saveCache();
    this.notifyIndexChange();
    this.startWatchers();
    if (notify) {
      const missing = this.scanRootStatus().filter((st) => !st.exists).map((st) => st.rel);
      if (missing.length) new Notice(t('notice.missingFolders', { folders: missing.join(', ') }));
      else new Notice(t('notice.indexed', { entries: plural('entry', this.index.length) }));
    }
  }

  async walk(absDir, scan) {
    let items;
    try {
      items = await fsp.readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const it of items) {
      const abs = nodePath.join(absDir, it.name);
      if (it.isDirectory()) {
        const rel = nodePath.relative(scan.root, abs).split(nodePath.sep).join('/');
        if (!underSkip(rel, scan.skip)) await this.walk(abs, scan);
      } else if (it.isFile()) {
        if (scan.exts.has(nodePath.extname(it.name).toLowerCase())) await this.indexFile(abs, scan);
      }
    }
  }

  async indexFile(abs, scan) {
    const rel = nodePath.relative(scan.root, abs).split(nodePath.sep).join('/');
    let stat;
    try {
      stat = await fsp.stat(abs);
    } catch {
      return;
    }
    if (scan.onFile) scan.onFile();
    const cached = scan.old.get(rel);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      scan.next.set(rel, cached);
      return;
    }
    // The file-level entry, keyed by extension (no dot) as the "lang".
    const base = nodePath.basename(abs).replace(/\.[^.]+$/, '');
    const ext = nodePath.extname(abs).slice(1).toLowerCase();
    const entries = [{ name: base, kind: 'file', lang: ext, path: rel, line: 1, page: 1 }];
    // A PDF's outline becomes section entries on their pages (the Phase 2 differentiator).
    // Cached with the file, so a PDF's outline is only re-read when its mtime changes.
    if (ext === 'pdf') {
      for (const s of await readOutline(abs)) {
        entries.push({ name: s.title, kind: 'section', lang: 'pdf', path: rel, line: s.page, page: s.page });
      }
    }
    scan.next.set(rel, { mtimeMs: stat.mtimeMs, entries });
  }

  // An entry's absolute path on disk: the reference root joined with its stored relative path.
  entryPath(e) {
    const root = this.codeRoot();
    return root ? nodePath.join(root, e.path) : e.path;
  }

  // {root} stays in the link for portability (resolved on render/click); call fillRoot()
  // when opening the URI directly. `template` overrides the default preset.
  buildUri(e, template) {
    const tpl = template || this.settings.uriTemplate;
    const absFwd = this.entryPath(e).split(nodePath.sep).join('/');
    const page = String(e.page || 1);
    // Encode segments so #, ?, & or spaces can't rewrite the URL ({abs} keeps the C: colon).
    const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');
    let uri = tpl
      .replace(/{abs}/g, encodeURI(absFwd))
      .replace(/{path}/g, encPath(e.path))
      .replace(/{page}/g, page)
      .replace(/{name}/g, encodeURIComponent(e.name));
    // A section carries its page in the link so it opens there; the file preset has no
    // {page}, so append the fragment when the template didn't already encode one.
    if (e.kind === 'section' && e.page && /^file:/i.test(uri) && !/#page=/i.test(uri)) {
      uri += '#page=' + e.page;
    }
    return uri;
  }

  // The markdown link to insert. Inside a table cell a literal pipe splits the row.
  buildLink(e, inTable, template) {
    const link = `[${e.name}](${this.buildUri(e, template)})`;
    return inTable ? link.replace(/\|/g, '\\|') : link;
  }

  pickEntry(onChoose, query) {
    new ReferenceLinkModal(this.app, this, { onChoose, query }).open();
  }

  insertLink(editor, e, template) {
    const inTable = inTableCell(editor.getValue(), editor.posToOffset(editor.getCursor('from')));
    editor.replaceSelection(this.buildLink(e, inTable, template));
  }

  // The ```reference-link block body offered for an entry: a section embeds its page,
  // and any document embeds by its relative path (page 1).
  embedFormats(e) {
    const out = [];
    if (e.kind === 'section' && e.page) out.push({ label: t('embed.fmt.section', { page: e.page }), body: e.path + '#page=' + e.page });
    out.push({ label: t('embed.fmt.file'), body: e.path });
    return out;
  }

  insertEmbed(editor, e) {
    const formats = this.embedFormats(e);
    new PresetPickerModal(this.app, formats, (f) => {
      editor.replaceSelection('```reference-link\n' + f.body + '\n```\n');
    }, t('modal.embedPlaceholder')).open();
  }

  // The selectable viewer presets — the built-in file:// then the user's own. 'u:<i>' is a
  // user viewer's key in the settings dropdown.
  editorPresets() {
    const out = [{ key: 'file', label: t('set.preset.file'), template: PRESETS.file }];
    (this.settings.editors || []).forEach((e, i) =>
      out.push({ key: 'u:' + i, label: e.name || `Viewer ${i + 1}`, template: e.template }));
    return out;
  }

  // Ask-on-insert picks the viewer format per insert; otherwise the default preset is used.
  withFormat(ask, run) {
    if (ask) new PresetPickerModal(this.app, this.editorPresets(), (p) => run(p.template), t('modal.formatPlaceholder')).open();
    else run(undefined);
  }

  // Resolve {root} to the absolute reference root: a copied link is usually pasted outside
  // the vault (a browser, a terminal), where the portable {root} token wouldn't resolve.
  // Inserted links keep {root} for note portability.
  copyLink(e, template) {
    navigator.clipboard.writeText(this.fillRoot(this.buildLink(e, false, template)));
    new Notice(t('notice.copied'));
  }

  // fillRoot resolves the portable {root} token, since there's no note to render it.
  openEntry(e, template) {
    openExternal(this.fillRoot(this.buildUri(e, template)));
  }

  // Entries matched by name, or by path tail so a selected "Foo/Bar.cs" resolves too.
  lookup(text) {
    const q = text.trim();
    if (!q) return [];
    const lc = q.toLowerCase();
    const norm = lc.split('\\').join('/');
    const out = [];
    for (const e of this.index) {
      const p = e.path.toLowerCase();
      if (e.name.toLowerCase() === lc || p === norm || p.endsWith('/' + norm)) out.push(e);
    }
    return out;
  }

  selectionOrWord(editor) {
    const sel = editor.getSelection();
    if (sel) return { text: sel, from: editor.getCursor('from'), to: editor.getCursor('to') };
    const cur = editor.getCursor();
    const line = editor.getLine(cur.line);
    const isWord = (ch) => ch && /[\w./\\-]/.test(ch);
    let s = cur.ch, en = cur.ch;
    while (s > 0 && isWord(line[s - 1])) s--;
    while (en < line.length && isWord(line[en])) en++;
    const text = line.slice(s, en);
    return text ? { text, from: { line: cur.line, ch: s }, to: { line: cur.line, ch: en } } : null;
  }

  // The selection/word to act on, or null when it makes no sense there. Never inside an
  // existing link (both actions). For `write` (convert-to-link) also never inside code or
  // frontmatter, where inserting a link would corrupt the sample; opening code from there
  // is harmless, so read-only actions are allowed.
  selectionTarget(editor, write) {
    const target = this.selectionOrWord(editor);
    if (!target) return null;
    const text = editor.getValue();
    const off = editor.posToOffset(target.from);
    if (inLink(text, off)) return null;
    if (write && inCode(text, off)) return null;
    return target;
  }

  // The markdown link spanning the editor cursor, as { name, target, line, from, to }
  // (character offsets within the line), or null. Right-click puts the cursor on the
  // click, so this reads the link that was clicked.
  linkAtCursor(editor) {
    const cur = editor.getCursor();
    const line = editor.getLine(cur.line);
    const re = linkRegex();
    let m;
    while ((m = re.exec(line))) {
      if (cur.ch >= m.index && cur.ch <= m.index + m[0].length) {
        return { name: m[1], target: m[2], line: cur.line, from: m.index, to: m.index + m[0].length };
      }
    }
    return null;
  }

  fixLinkAtCursor(editor, link) {
    const target = this.actualizedTarget(link.name, link.target);
    if (target == null) { new Notice(t('notice.linksUpdated', { n: 0 })); return; }
    editor.replaceRange('[' + link.name + '](' + target + ')', { line: link.line, ch: link.from }, { line: link.line, ch: link.to });
    new Notice(t('notice.linksUpdated', { n: 1 }));
  }

  // Whether a markdown link is one of ours (points at an indexed document) rather than a
  // wiki or web link — true for current, stale and broken reference links alike, so the
  // right-click copy/fix items only show on links this plugin owns.
  isReferenceLink(name, target) {
    return !!this.entryUnderPointer(name, target) || !!this.linkState(name, target);
  }

  // Copy the clicked link's own target ({root} filled in), keeping the scheme it was
  // saved with — unlike copyLink, which builds a fresh link from the default preset.
  copyLinkAtCursor(link) {
    navigator.clipboard.writeText(this.fillRoot(link.target));
    new Notice(t('notice.copied'));
  }

  // Run the selected (or under-cursor) token through the index: a single match runs
  // `action`, several open the picker, none notifies. `write` gates the protected-range
  // check (convert may not run in code; open may).
  resolveSelection(editor, action, write) {
    const target = this.selectionTarget(editor, write);
    if (!target) { new Notice(t('notice.noSelection')); return; }
    const matches = this.lookup(target.text);
    if (!matches.length) { new Notice(t('notice.noMatch', { query: target.text })); return; }
    const run = (e) => action(e, target);
    if (matches.length === 1) run(matches[0]);
    else this.pickEntry(run, target.text);
  }

  convertSelection(editor) {
    this.resolveSelection(editor, (e, target) => this.withFormat(this.settings.askOnInsert, (template) => {
      const inTable = inTableCell(editor.getValue(), editor.posToOffset(target.from));
      editor.replaceRange(this.buildLink(e, inTable, template), target.from, target.to);
    }), true);
  }

  openSelection(editor) {
    this.resolveSelection(editor, (e) => this.withFormat(this.settings.askOnInsert, (template) => this.openEntry(e, template)), false);
  }

  // Folders to scan, relative to the reference root; empty means the whole reference root.
  scanFolders() {
    const roots = splitLines(this.settings.scanRoots);
    return roots.length ? roots : ['.'];
  }

  scanRootStatus() {
    const root = this.codeRoot();
    return this.scanFolders().map((rel) => ({
      rel,
      exists: !!root && fs.existsSync(nodePath.join(root, rel)),
    }));
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

Object.assign(ReferenceLinkerPlugin.prototype, api);
Object.assign(ReferenceLinkerPlugin.prototype, actualize.methods);

module.exports = ReferenceLinkerPlugin;
