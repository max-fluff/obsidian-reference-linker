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

const { PRESETS, DEFAULT_SETTINGS, parseExtensions, parseSkip, underSkip } = require('./constants');
const { splitLines, inTableCell, inCode, inLink, linkRegex, splitTarget, withTitle } = require('./shared/markdown');
const { parseBinding, formatBinding, bindStateFrom, bindingOwner, ownsBinding } = require('./shared/binding');
const { fillRoot: fillRootToken, ownsRootToken, namespaceRoot } = require('./shared/root-token');
const { buildMenu } = require('./shared/menu-verbs');
const { watchTree } = require('./shared/fs-watch');
const { ownsLink } = require('./shared/link-owner');
const { ReferenceSuggest } = require('./suggest');
const facets = require('./shared/facets');
const { VALUE, TOKEN } = facets;
const { HoverPreview } = require('./hover');
const { registerEmbed } = require('./embed');
const actualize = require('./actualize');
const { ReferenceLinkModal, PresetPickerModal } = require('./modal');
const { ReferenceLinkerSettingTab } = require('./settings-tab');
const formats = require('./formats');
const { parseBibliography } = require('./bib');
const { buildCitations, emptyCitations } = require('./citations');
const citationsReport = require('./citations-report');
const { writeReportNote } = require('./shared/report-note');
const { initI18n, withFamily, t, plural } = require('./shared/i18n');
const api = require('./api');
const indexEvents = require('./shared/index-events');

// Open a URL through the OS. Obsidian's window.open corrupts a file:// #page= fragment
// (it doubles it — "…pdf#page=3#page=3" — and the OS then can't find the file), so hand it
// straight to the shell, which preserves it; the default PDF app (a browser) honours #page=.
function openExternal(uri) {
  try { require('electron').shell.openExternal(uri); }
  catch { window.open(uri); }
}

// A file:// link carrying a #page= fragment — the case window.open would double.
const PAGE_LINK = /^file:\/\/\/.+#page=\d+/i;

// A rendered anchor built from our {root} token — recorded before resolveRootLinks fills
// the token in, since it's gone from the href by click time.
const ROOT_ATTR = 'data-reference-root';

// Which root token and which bindings are this plugin's, as the shared modules name them.
const OWNER = 'reference';
// The other sigil linker. Its presence is what turns a bare {root} from "obviously ours"
// into a question, so it's worth asking about rather than assuming.
const SIBLING_ID = 'code-linker';

// A markdown title becomes a native tooltip that would cover our hover preview, so it's
// parked here instead.
const TITLE_ATTR = 'data-reference-title';
const anchorTitle = (a) => a.getAttribute(TITLE_ATTR) || a.getAttribute('title') || '';

const pathPart = (dec) => dec.split('#')[0].split('?')[0];
const extOf = (rel) => nodePath.extname(rel).slice(1).toLowerCase();
const normCase = (s) => (process.platform === 'win32' ? s.toLowerCase() : s);

// Whether `p` names the file at `full`: it ends with it on a path boundary (a target
// prefixes scheme and slashes), and matches the whole of `full`, not a folder-over tail.
function namesPath(p, full) {
  const a = normCase(p), b = normCase(full);
  if (!b || !a.endsWith(b)) return false;
  const i = a.length - b.length;
  return i === 0 || a[i - 1] === '/';
}

// The hover entry: the document, where the link lands, and the name of the section there.
//
// A pinned link says which section in its own binding. An unpinned one doesn't, but the
// outline still knows what begins on that page — so the header names the section either way
// rather than falling back to the file name, which the reader could already see in the link.
// The code linker's header always says exactly where the link goes; this is the same promise
// for documents.
// Where the link lands cannot be read off the URL alone: most formats store no position in
// it, so targetPage answers 1 for all of them and the preview would open every document at
// its top. The binding names the section and the index knows where that section sits.
const previewEntry = (plugin, ref, title, url) => {
  const b = parseBinding(title);
  const at = plugin.sectionAtLink(url);
  if (b && b.sec) {
    const named = at && at.name === b.sec ? at : plugin.sectionNamed(ref.entry.path, b.sec);
    return Object.assign({}, ref.entry, { position: (named && named.position) || ref.position, title: b.sec });
  }
  return Object.assign({}, ref.entry, { position: (at && at.position) || ref.position, title: at ? at.name : '' });
};

class ReferenceLinkerPlugin extends Plugin {
  async onload() {
    initI18n(withFamily('sigil', { en: require('./locales/en'), ru: require('./locales/ru') }));
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.setIndex([]);
    this.watchers = []; // bibliography-folder watchers; the scan tree is watched separately
    this.scanWatcher = null;
    this.fileCache = new Map();
    this.cacheSignature = '';
    this.citations = emptyCitations();
    this._indexListeners = new Set(); // API onChange subscribers; needed before the first rebuild
    this.migrateSettings();
    await this.loadCache();
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
          drop: (evt, view) => this.onEditorDrop(evt, view),
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
    this.addCommand({ id: 'pin-links-note', name: t('cmd.pinLinksNote'), callback: () => this.pinLinksInActiveNote() });
    this.addCommand({ id: 'pin-links-vault', name: t('cmd.pinLinksVault'), callback: () => this.pinLinksInVault() });
    this.addCommand({ id: 'export-citations', name: t('cmd.exportCitations'), callback: () => this.exportCitations() });

    this.registerEvent(
      this.app.workspace.on('editor-menu', (nativeMenu, editor) => buildMenu(this, nativeMenu, (menu) => {
        if (!this.settings.contextMenu) return;
        // Convert writes a link, so it's offered only where that's safe (not in a link,
        // code, or frontmatter); open is read-only, so it's offered anywhere but a link.
        //
        // Both sigil linkers offer these two verbs on any word, so with the sibling installed
        // the menu used to carry two near-identical lines per verb. Now the verb is the entry
        // and each plugin names its own destination inside it — one "Find and open" with
        // "Code" and "Document" under it, rather than two entries the reader has to tell
        // apart. Alone, nothing is nested and the wording says which kind of link it makes.
        if (this.selectionTarget(editor, true)) {
          this.selectionItem(menu, 'convert', 'link', () => this.convertSelection(editor));
        }
        if (this.selectionTarget(editor, false)) {
          this.selectionItem(menu, 'open', 'file-search', () => this.openSelection(editor));
        }
        // Right-clicking one of our reference links: copy its target; fix a drifted pinned
        // section; pin an unpinned link or unpin a pinned one. Ownership is checked so a link
        // the code linker recognises too gets one set of actions, not two.
        const link = this.linkAtCursor(editor);
        if (link && this.ownsLinkAtCursor(link)) {
          menu.addItem((item) => item.setTitle(t('menu.copyLink')).setIcon('copy').onClick(() => this.copyLinkAtCursor(link)));
          if (this.isLinkStale(withTitle(link.target, link.title))) {
            menu.addItem((item) => item.setTitle(t('menu.fixLink')).setIcon('wrench').onClick(() => this.fixLinkAtCursor(editor, link)));
          }
          const pin = this.linkPinOption(link);
          if (pin) {
            const label = pin.kind === 'cite' ? t('menu.pinCite', { cite: pin.value }) : t('menu.pin', { sec: pin.value });
            menu.addItem((item) => item.setTitle(label).setIcon('pin').onClick(() => this.pinLinkAtCursor(editor, link)));
          }
          if (parseBinding(link.title)) {
            menu.addItem((item) => item.setTitle(t('menu.unpin')).setIcon('pin-off').onClick(() => this.unpinLinkAtCursor(editor, link)));
          }
        }
      }))
    );

    // The disk cache (loaded above) gives an instant index on startup; this
    // background rebuild validates it against the filesystem and refreshes.
    this.app.workspace.onLayoutReady(() => this.rebuildIndex(false));

    // Published last, and deliberately so. app.plugins.plugins['reference-linker'].api is how
    // the code linker finds us and decides a link we both recognise is ours — so a load that
    // throws before this point leaves no provider behind, and the sibling keeps offering its
    // own actions instead of standing down for a plugin that never came up.
    this.api = this.buildApi();
  }

  onunload() {
    this.stopWatchers();
    clearTimeout(this.watchTimer);
    clearTimeout(this.bibTimer);
    if (this.hover) this.hover.destroy();
    formats.dispose();
  }

  migrateSettings() {
    // Normalize the skip list to one folder per line (older saves were comma-separated).
    this.settings.skipDirs = (this.settings.skipDirs || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).join('\n');
    // {root} became {ref-root} so a link says whose it is. Templates are our own setting,
    // so a {root} in one can only ever have meant our root — rewriting it is safe, and it
    // has to happen before the preset check below or a migrated preset would be filed as
    // "Custom". Notes already written keep their bare {root}: it still resolves, and
    // rewriting someone's vault is not a migration anyone asked for.
    this.settings.uriTemplate = namespaceRoot(this.settings.uriTemplate, OWNER);
    for (const e of this.settings.editors || []) e.template = namespaceRoot(e.template, OWNER);

    // Preserve a non-preset template as a named viewer so it stays selectable.
    const tpl = this.settings.uriTemplate;
    const editors = this.settings.editors || (this.settings.editors = []);
    const known = Object.values(PRESETS).includes(tpl) || editors.some((e) => e.template === tpl);
    if (!known) editors.push({ name: 'Custom', template: tpl });
  }

  // Our own {ref-root} is always ours to fill. A bare {root} predates the namespacing and
  // Code Linker used to fill it too, so it takes a verdict — see legacyRootIsOurs. The
  // default claims it, which is what every call about our own links wants; only the render
  // path, where another plugin's links go past, asks first.
  fillRoot(v, claimLegacy = true) {
    const root = encodeURI(this.codeRoot().split(nodePath.sep).join('/'));
    return fillRootToken(v, { owner: OWNER, root, claimLegacy });
  }

  siblingLinkerInstalled() {
    const plugins = this.app.plugins && this.app.plugins.plugins;
    return !!(plugins && plugins[SIBLING_ID]);
  }

  // Whether a bare {root} in a rendered link is ours to resolve. The binding settles it
  // when there is one. Failing that, being the only linker installed makes every legacy
  // link ours, which keeps a solo vault behaving exactly as it always did. Otherwise the
  // link has to point at something inside our root to count as ours.
  legacyRootIsOurs(url, title) {
    const owner = bindingOwner(title);
    if (owner) return owner === OWNER;
    if (!this.siblingLinkerInstalled()) return true;
    return !!this.targetIndexedFile(this.decodeTarget(url));
  }

  resolveRootLinks(el) {
    const links = el.querySelectorAll ? el.querySelectorAll('a') : [];
    for (const a of links) {
      const title = a.getAttribute('title') || '';
      let ours = false;
      for (const attr of ['href', 'data-href']) {
        const v = a.getAttribute(attr);
        if (!v) continue;
        const out = this.fillRoot(v, this.legacyRootIsOurs(v, title));
        if (out !== v) { a.setAttribute(attr, out); ours = true; }
      }
      // Only a token we were entitled to fill marks the link ours to open — the other
      // plugin's links now go past untouched instead of being claimed by whoever rendered
      // first.
      if (ours) a.setAttribute(ROOT_ATTR, '');
      this.stashTitle(a);
    }
    this.markStaleAnchors(el);
  }

  // Park a binding title on a data attribute and drop the real one, so the binding string
  // doesn't show as a native tooltip. A plain tooltip the reader wrote is left as-is, and
  // so is Code Linker's binding: taking its title away left it unable to read its own
  // pin and marking its links wrongly.
  stashTitle(a) {
    const title = a.getAttribute('title');
    if (!title || a.hasAttribute(TITLE_ATTR) || !ownsBinding(title, OWNER)) return;
    a.setAttribute(TITLE_ATTR, title);
    a.removeAttribute('title');
  }

  // Toggle the drifted/broken-link underline on every rendered anchor in `el`. toggle (not
  // add) so re-running after an index rebuild also clears links that are now current.
  markStaleAnchors(el) {
    const links = el.querySelectorAll ? el.querySelectorAll('a') : [];
    for (const a of links) {
      const href = a.getAttribute('href') || a.getAttribute('data-href') || '';
      const state = this.settings.markStaleLinks ? this.linkState(withTitle(href, anchorTitle(a))) : null;
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
      const href = a.getAttribute('href') || a.getAttribute('data-href') || '';
      const ref = this.refForTarget(href);
      if (ref) return { entry: previewEntry(this, ref, anchorTitle(a), href), requireMod: false };
    }
    if (el.closest('.cm-link')) {
      const view = typeof EditorView.findFromDOM === 'function' ? EditorView.findFromDOM(el) : this.activeCm();
      const at = view && this.codeRefAt(view, x, y);
      const ref = at && this.refForTarget(at.target);
      if (ref) return { entry: previewEntry(this, ref, at.title, at.target), requireMod: true };
    }
    return null;
  }

  // The CM6 EditorView of the active Markdown editor, used as a fallback when
  // EditorView.findFromDOM isn't available to map a point to its editor.
  activeCm() {
    const mv = this.app.workspace.getActiveViewOfType(MarkdownView);
    return mv && mv.editor && mv.editor.cm;
  }

  // {root} filled in, %-escapes undone, backslashes normalised — the form links are matched on.
  decodeTarget(target) {
    let dec = this.fillRoot(target);
    try { dec = decodeURIComponent(dec); } catch { /* malformed escape: match on the raw form */ }
    return dec.split('\\').join('/');
  }

  // The position a link asks for — only ever read, never overridden. A #page fragment or a
  // {page} query both count, and #t= is the same question asked of a recording.
  targetPosition(dec) {
    const m = /[#?&](?:page|t)=(\d+)/i.exec(dec);
    return m ? parseInt(m[1], 10) : 1;
  }

  // The document a link points at, from its target alone: { entry, position }, or null for a
  // link into no indexed document. The label is never consulted.
  refForTarget(target) {
    if (!target) return null;
    const dec = this.decodeTarget(target);
    const cached = this.fileCache.get(this.targetIndexedFile(dec));
    const entry = cached && cached.entries[0];
    return entry ? { entry, position: this.targetPosition(dec) } : null;
  }

  entriesIn(rel) {
    return rel ? (this.fileCache.get(rel) || { entries: [] }).entries : [];
  }

  // A document's section by name — how a link that stores no position finds where it points.
  sectionNamed(rel, name) {
    return this.entriesIn(rel).find((e) => e.kind === 'section' && e.name === name) || null;
  }

  // What a section binding says about the page a link stores: null when the section still
  // sits there, stale with the page it moved to, or broken when the document is indexed but
  // no such section resolves any more (renamed, or the outline changed).
  //
  // Broken is reserved for a document the index *has*, never for one it doesn't know — a
  // reference root pointed at the wrong folder, or a document not scanned yet, would
  // otherwise turn every link red at once. An unknown document gets no verdict rather than
  // a guess. Code Linker already worked this way; this is the two brought into line.
  urlBindState(url, b, storedPosition) {
    const here = this.targetIndexedFile(this.decodeTarget(url));
    const moved = this.citeMovedTo(b, here);
    if (moved === 'broken') return { state: 'broken' };
    // Judged by the outline of where it moved to, not of where the link still points.
    const rel = moved || here;
    if (!rel) return null;
    const sec = b.sec ? this.secBindState(url, rel, b.sec, storedPosition) : null;
    if (sec && sec.state === 'broken') return { state: 'broken' };
    if (!moved) return sec;
    const r = { state: 'stale', path: moved };
    if (sec && sec.anchor != null) r.anchor = sec.anchor;
    else if (sec && sec.line != null) r.line = sec.line;
    return r;
  }

  // A path when the document moved, 'broken' for a key the bibliography lost, else null. A key
  // it still has but cannot place is the unknown-document case sec refuses to judge — a
  // misconfigured root would otherwise redden every cite link at once.
  citeMovedTo(b, here) {
    if (!b.cite) return null;
    const known = this.citations.byKey.get(String(b.cite).toLowerCase());
    if (!known) return this.hasCitations() ? 'broken' : null;
    if (!known.rel) return null;
    return known.rel === here ? null : known.rel;
  }

  secBindState(url, rel, sec, storedPosition) {
    const hits = this.entriesIn(rel).filter((e) => e.kind === 'section' && e.name === sec);
    if (!hits.length) return { state: 'broken' };
    const kind = formats.anchorKind(extOf(rel));
    // Nothing stored to compare against: the binding alone says which section, so only its
    // disappearance is worth a verdict. Judging by page here marked every slide past the
    // first as moved, because a link that stores no page reads as page 1.
    if (!kind) return null;
    if (kind === 'id') return this.idBindState(url, hits);
    return bindStateFrom(hits.map((e) => e.position), storedPosition);
  }

  // The same link pointed at another file. Null when the URL holds neither our root token nor
  // the reference root: a path we cannot locate in it cannot be rewritten, only corrupted.
  retargetUrl(url, rel) {
    const enc = rel.split('/').map(encodeURIComponent).join('/');
    const token = /(\{(?:ref-)?root\}\/)[^#?]*/;
    if (token.test(url)) return url.replace(token, (_, head) => head + enc);
    const root = this.codeRoot().split(nodePath.sep).join('/').replace(/\/+$/, '');
    if (!root) return null;
    for (const base of [root, encodeURI(root)]) {
      const i = url.indexOf(base + '/');
      if (i < 0) continue;
      const head = url.slice(0, i + base.length + 1);
      const tail = url.slice(head.length);
      const cut = tail.search(/[#?]/);
      return head + enc + (cut < 0 ? '' : tail.slice(cut));
    }
    return null;
  }

  // An id-anchored link drifts when its heading is still there under a different id, which
  // is what regenerating a doc site does. A heading with no id anchors as the empty fragment,
  // so a link pinned to it must match by that — else a same-named heading that does have an id
  // would drag the link onto the wrong one.
  idBindState(url, hits) {
    const stored = this.targetAnchor(this.decodeTarget(url));
    const anchors = hits.map((e) => e.anchor || '');
    if (anchors.includes(stored)) return null;
    const withId = anchors.filter(Boolean);
    return withId.length ? { state: 'stale', anchor: withId[0] } : null;
  }

  // The fragment a link carries, without the '#'.
  targetAnchor(dec) {
    const i = dec.indexOf('#');
    return i < 0 ? '' : dec.slice(i + 1);
  }

  // The outline section beginning on a link's page — what it can be pinned to. Null when the
  // page is mid-section or the document has no outline.
  sectionAtLink(url) {
    const rel = url && this.targetIndexedFile(this.decodeTarget(url));
    if (!rel) return null;
    const kind = formats.anchorKind(extOf(rel));
    // Without an anchor there is nothing in the link to read a section off, and defaulting to
    // page 1 would pin every link in the deck to the title slide.
    if (!kind) return null;
    const entries = this.entriesIn(rel);
    if (kind === 'id') {
      const frag = this.targetAnchor(this.decodeTarget(url));
      return (frag && entries.find((e) => e.kind === 'section' && e.anchor === frag)) || null;
    }
    const position = this.targetPosition(url);
    return entries.find((e) => e.kind === 'section' && e.position === position) || null;
  }

  linkPinOption(link) {
    return this.pinOptionFor(link.target, link.title);
  }

  // A binding already there is topped up with the key, never re-derived: reading its section
  // off the page again would repoint a link that has drifted. A tooltip is prose, left alone.
  pinOptionFor(url, title) {
    const existing = ownsBinding(title, OWNER) ? parseBinding(title) : null;
    if (!existing && title) return null;
    const b = existing ? { sec: existing.sec, cite: existing.cite } : {};
    if (!existing) {
      const sec = this.sectionAtLink(url);
      if (sec) b.sec = sec.name;
    }
    if (!b.cite) {
      const cite = this.citeOf(this.targetIndexedFile(this.decodeTarget(url)));
      if (cite) b.cite = cite;
    }
    const next = formatBinding(b);
    if (!next || next === (title || '')) return null;
    const addedSec = b.sec && b.sec !== (existing ? existing.sec : '');
    return { title: next, value: addedSec ? b.sec : b.cite, kind: addedSec ? 'sec' : 'cite' };
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

  // Reading view renders our links as real <a>; Obsidian's opener corrupts a #page=
  // fragment, so we intercept and open through the shell — for a link resolveRootLinks
  // marked ours, and any file:// link with a page. Everything else is left to Obsidian.
  //
  // This runs in the capture phase, ahead of every other handler, so it has to be sure the
  // link is ours before swallowing the click: claiming a Code Linker link here sent it to
  // the OS viewer instead of the editor.
  onAnchorClick(evt) {
    if (evt.button !== 0 && evt.button !== 1) return;
    const a = evt.target && evt.target.closest && evt.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href') || a.getAttribute('data-href') || '';
    const filled = this.fillRoot(href, this.legacyRootIsOurs(href, anchorTitle(a)));
    if (!a.hasAttribute(ROOT_ATTR) && !PAGE_LINK.test(filled)) return;
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
      const { url, title } = splitTarget(m[2]);
      return { name: m[1], target: url, title };
    }
    return null;
  }

  // The link under the click resolved, if the token it carries is ours — else null, so a
  // plain link falls through to Obsidian's own opener and the other linker's link falls
  // through to that plugin. Both register a highest-precedence handler, so each has to
  // claim only its own; otherwise the winner comes down to which plugin loaded first.
  // codeRefAt has already split the title off the target.
  rootUriAt(evt, view) {
    const el = evt.target;
    if (!el || !el.closest || !el.closest('.cm-link')) return null;
    const ref = this.codeRefAt(view, evt.clientX, evt.clientY);
    if (!ref) return null;
    const claimLegacy = this.legacyRootIsOurs(ref.target, ref.title);
    return ownsRootToken(ref.target, OWNER, claimLegacy) ? this.fillRoot(ref.target, claimLegacy) : null;
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
    return JSON.stringify({ v: 5, exts: [...parseExtensions(this.settings.extensions)].sort() });
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
      await this.loadCitations();
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

  bibPaths() {
    const root = this.codeRoot();
    return splitLines(this.settings.bibFiles)
      .map((line) => line.split('\\').join('/').trim())
      .filter(Boolean)
      .map((p) => (nodePath.isAbsolute(p) ? p : root ? nodePath.join(root, p) : p));
  }

  // Apart from the file scan, which caches per file by mtime: a re-export moves a key onto
  // another document without that document changing.
  async loadCitations() {
    const entries = [];
    for (const abs of this.bibPaths()) {
      try {
        entries.push(...parseBibliography(await fsp.readFile(abs, 'utf8')));
      } catch {
        /* unreadable or not there yet: the remaining bibliographies still count */
      }
    }
    this.citations = buildCitations(entries, [...this.fileCache.keys()], this.codeRoot());
  }

  citeOf(rel) {
    return (rel && this.citations.byPath.get(rel)) || null;
  }

  // Keys the bibliography carries that no indexed document answers to. Shown in settings, so a
  // key that silently found nothing is visible rather than only counted.
  unmatchedCitations() {
    return [...this.citations.byKey.values()].filter((v) => !v.rel).map((v) => v.key);
  }

  // What the vault cites, gathered from the links themselves and written into a new note. The
  // note is never overwritten: a report is a snapshot, and last week's may still be open.
  async exportCitations() {
    const notes = [];
    // Reading every note can fail on one of them; the command that called this cannot await,
    // so a rejection here would be a silent no-op with a console trace.
    try {
      for (const f of this.app.vault.getMarkdownFiles()) {
        notes.push({ path: f.path, text: await this.app.vault.cachedRead(f) });
      }
    } catch {
      new Notice(t('notice.reportFailed'));
      return;
    }
    const used = citationsReport.collect(notes);
    if (!used.size) { new Notice(t('notice.noCitationsUsed')); return; }
    const file = await writeReportNote(this.app.vault, t('report.citations.file'), citationsReport.report(used, this.citations));
    if (!file) { new Notice(t('notice.reportFailed')); return; }
    new Notice(t('notice.citationsExported', { n: used.size, file: file.path }));
    const leaf = this.app.workspace.getLeaf && this.app.workspace.getLeaf(true);
    if (leaf && leaf.openFile) await leaf.openFile(file);
    return file;
  }

  // With no bibliography read, no cite binding is judged at all.
  hasCitations() {
    return this.citations.keys > 0;
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

  // Every way an entry can be addressed, built once: the suggest asks per entry over the whole
  // index, and each of these reads live state anyway. A facet that declares an anchor is also
  // what a link pins to — see shared/facets.
  buildFacets() {
    return [
      { name: 'kind', typed: VALUE, resolve: (t) => (this.kinds.has(t) ? t : null), of: (e) => e.kind },
      { name: 'ext', typed: VALUE, resolve: (t) => (this.exts.has(t) ? t : null), of: (e) => e.lang },
      { name: 'sec', typed: TOKEN, anchor: 'sec', of: (e) => (e.kind === 'section' ? e.name : '') },
      { name: 'cite', typed: TOKEN, anchor: 'cite', of: (e) => this.citeOf(e.path) || '' },
    ];
  }

  facets() {
    if (!this.queryFacets) this.queryFacets = this.buildFacets();
    return this.queryFacets;
  }

  parseQuery(raw) {
    return facets.parseQuery(raw, this.facets());
  }

  entryPassesFilter(e, f) {
    return facets.passes(e, f, this.facets());
  }

  matchTextFor(e, f) {
    return facets.matchText(e, f, this.facets());
  }

  entriesForQuery(f) {
    return facets.entriesFor(this, f, this.facets());
  }

  // The indexed document a link target names, or null: the entry whose root-joined path the
  // target ends with. Works whatever scheme the link was built with.
  targetIndexedFile(dec) {
    const p = pathPart(dec);
    const root = this.codeRoot().split(nodePath.sep).join('/').replace(/\/+$/, '');
    for (const rel of this.fileCache.keys()) {
      if (namesPath(p, root ? root + '/' + rel : rel)) return rel;
    }
    return null;
  }

  // The set of indexed extensions (".pdf" etc.), used for the scan and watch filtering.
  watchedExts() {
    return parseExtensions(this.settings.extensions);
  }

  startWatchers() {
    this.stopWatchers();
    this.watchUnsupported = false;
    if (!this.settings.autoRefresh) return;
    // The folder, not the file: Zotero re-exports by renaming a temp file over the target, and
    // a watch on the file itself is left bound to an unlinked inode, deaf from then on.
    for (const [dir, names] of this.bibFolders()) {
      try {
        if (!fs.existsSync(dir)) continue;
        this.watchers.push(fs.watch(dir, (_evt, filename) => {
          if (!filename || names.has(nodePath.basename(String(filename)).toLowerCase())) this.onBibChange();
        }));
      } catch {
        /* transient FS issue; a manual rebuild re-arms the watchers */
      }
    }
    const root = this.codeRoot();
    if (!root) return;
    const roots = this.scanFolders().map((r) => ({ dir: nodePath.join(root, r), rel: String(r || '').split('\\').join('/').replace(/\/+$/, '') }));
    this.scanWatcher = watchTree(roots, {
      onEvent: (rel, filename) => this.onWatchEvent(rel, filename),
      // Recursive watching isn't available on Linux; the shared watcher falls back to
      // per-directory watches and tells us so, so the notice fires once.
      onUnsupported: () => {
        this.watchUnsupported = true;
        if (!this.watchUnsupportedNotified) { this.watchUnsupportedNotified = true; new Notice(t('notice.watchUnsupported')); }
      },
      shouldDescend: (rel) => !underSkip(rel, parseSkip(this.settings.skipDirs)),
    });
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
    if (this.scanWatcher) { this.scanWatcher.close(); this.scanWatcher = null; }
  }

  // Debounce a background rebuild on a scan-folder change. `rel` is the changed path relative
  // to the reference root; skip-dir noise (node_modules) and files we don't index are dropped
  // cheaply before scheduling.
  onWatchEvent(rel, filename) {
    if (filename) {
      if (underSkip(rel, parseSkip(this.settings.skipDirs))) return;
      const ext = nodePath.extname(rel).toLowerCase();
      if (ext && !this.watchedExts().has(ext)) return;
    }
    clearTimeout(this.watchTimer);
    this.watchTimer = setTimeout(() => this.rebuildIndex(false), 1500);
  }

  // Only the citation maps: no document changed, so a rescan would re-read every outline for
  // nothing.
  onBibChange() {
    clearTimeout(this.bibTimer);
    this.bibTimer = setTimeout(async () => {
      await this.loadCitations();
      this.notifyIndexChange();
    }, 1500);
  }

  // Empty the index (nothing to scan) and persist, telling whoever's listening.
  async resetIndex(noticeKey, notify) {
    this.setIndex([]);
    this.fileCache = new Map();
    this.citations = emptyCitations();
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
    await this.loadCitations();
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
    const entries = [{ name: base, kind: 'file', lang: ext, path: rel, line: 1, position: 1 }];
    // A document's outline becomes section entries on their pages (the Phase 2
    // differentiator). Cached with the file, so it is only re-read when the mtime changes.
    for (const s of await formats.outline(ext, abs)) {
      const entry = { name: s.title, kind: 'section', lang: ext, path: rel, line: s.position, position: s.position };
      if (s.anchor) entry.anchor = s.anchor;
      entries.push(entry);
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
    const page = String(e.position || 1);
    // Encode segments so #, ?, & or spaces can't rewrite the URL ({abs} keeps the C: colon).
    const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');
    let uri = tpl
      .replace(/{abs}/g, encodeURI(absFwd))
      .replace(/{path}/g, encPath(e.path))
      .replace(/{page}/g, page)
      .replace(/{name}/g, encodeURIComponent(e.name));
    // A section carries where it starts so the link opens there. What that looks like is the
    // format's business — a page for a PDF, an id for HTML, nothing where the viewer would
    // choke on a fragment (see CONTRIBUTING, "Adding a document format").
    const anchor = formats.anchorFor(e);
    if (anchor && /^file:/i.test(uri) && !uri.includes('#')) uri += '#' + anchor;
    return uri;
  }

  // The markdown link to insert. A section link is pinned to its section by a title binding
  // (see shared/binding), so it tracks without the label being read. A pipe would split a
  // table row.
  buildLink(e, inTable, template) {
    const url = this.buildUri(e, template);
    const title = formatBinding(this.bindingFor(e));
    const link = `[${e.name}](${title ? withTitle(url, title) : url})`;
    return inTable ? link.replace(/\|/g, '\\|') : link;
  }

  bindingFor(e) {
    return facets.bindingFrom(e, this.facets());
  }

  pickEntry(onChoose, query) {
    new ReferenceLinkModal(this.app, this, { onChoose, query }).open();
  }

  insertLink(editor, e, template) {
    const inTable = inTableCell(editor.getValue(), editor.posToOffset(editor.getCursor('from')));
    editor.replaceSelection(this.buildLink(e, inTable, template));
  }

  // The ```reference-link block body offered for an entry: a section embeds by its own anchor
  // (a #id for HTML, #page= for a PDF, the ordinal page otherwise), any document by its path.
  embedFormats(e) {
    const out = [];
    if (e.kind === 'section' && e.position) {
      const frag = formats.anchorFor(e) || ('page=' + e.position);
      out.push({ label: t('embed.fmt.section', { name: e.name }), body: e.path + '#' + frag });
    }
    out.push({ label: t('embed.fmt.file'), body: e.path });
    return out;
  }

  insertEmbed(editor, e) {
    const formats = this.embedFormats(e);
    new PresetPickerModal(this.app, formats, (f) => {
      editor.replaceSelection('```reference-link\n' + f.body + '\n```\n');
    }, t('modal.embedPlaceholder')).open();
  }

  // The index entry for a file dropped from outside the vault, or null when it sits outside
  // the reference root — a link there couldn't carry the portable {ref-root} token. An
  // indexed file reuses its own entry (its real name); an unindexed one gets a bare file entry.
  entryForAbsPath(abs) {
    const root = this.codeRoot();
    if (!root) return null;
    const rel = nodePath.relative(root, abs).split(nodePath.sep).join('/');
    if (!rel || rel === '..' || rel.startsWith('../') || nodePath.isAbsolute(rel)) return null;
    const cached = this.fileCache.get(rel);
    if (cached && cached.entries && cached.entries[0]) return cached.entries[0];
    return { name: nodePath.basename(rel).replace(/\.[^.]+$/, ''), kind: 'file', lang: extOf(rel), path: rel, line: 1, position: 1 };
  }

  // Drop of OS files into the editor: turn each into a portable reference link or embed,
  // asked once for the whole drop. Only files under the reference root are ours; a drop with
  // none is left to Obsidian (so an image still imports as usual).
  onEditorDrop(evt, view) {
    const files = (evt.dataTransfer && evt.dataTransfer.files) || [];
    const entries = [];
    let outside = 0;
    for (const f of files) {
      // Only an OS file carries a path; an internal drag (a note) does not, and stays Obsidian's.
      if (!f || !f.path) continue;
      const e = this.entryForAbsPath(f.path);
      if (e) entries.push(e); else outside++;
    }
    if (!entries.length) return false;
    evt.preventDefault();
    if (outside) new Notice(t('notice.dropOutsideRoot', { count: outside }));
    const at = typeof view.posAtCoords === 'function'
      ? view.posAtCoords({ x: evt.clientX, y: evt.clientY })
      : null;
    const pos = at == null ? view.state.selection.main.head : at;
    new PresetPickerModal(this.app, [
      { key: 'link', label: t('drop.asLink') },
      { key: 'embed', label: t('drop.asEmbed') },
    ], (choice) => this.insertDropped(view, pos, entries, choice.key), t('drop.placeholder')).open();
    return true;
  }

  insertDropped(view, pos, entries, kind) {
    let text;
    if (kind === 'embed') {
      text = entries.map((e) => '```reference-link\n' + e.path + '\n```\n').join('');
    } else {
      const inTable = inTableCell(view.state.doc.toString(), pos);
      text = entries.map((e) => this.buildLink(e, inTable, undefined)).join(inTable ? ' ' : '\n');
    }
    view.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length } });
    if (typeof view.focus === 'function') view.focus();
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
    // Where the OS drops our anchor the file opens at the top, so hand the section name over
    // for a paste into the viewer's own find box.
    if (e.kind === 'section' && e.name && !formats.hasOsAnchor(e.lang)) {
      navigator.clipboard.writeText(e.name);
      new Notice(t('notice.anchorCopied', { section: e.name }));
    }
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
        const { url, title } = splitTarget(m[2]);
        return { name: m[1], target: url, title, line: cur.line, from: m.index, to: m.index + m[0].length };
      }
    }
    return null;
  }

  fixLinkAtCursor(editor, link) {
    const fixed = this.actualizedTarget(withTitle(link.target, link.title));
    if (fixed == null) { new Notice(t('notice.linksUpdated', { n: 0 })); return; }
    editor.replaceRange('[' + link.name + '](' + fixed + ')', { line: link.line, ch: link.from }, { line: link.line, ch: link.to });
    new Notice(t('notice.linksUpdated', { n: 1 }));
  }

  pinLinkAtCursor(editor, link) {
    const opt = this.linkPinOption(link);
    if (!opt) { new Notice(t('notice.cantPin')); return; }
    const pinned = withTitle(link.target, opt.title);
    editor.replaceRange('[' + link.name + '](' + pinned + ')', { line: link.line, ch: link.from }, { line: link.line, ch: link.to });
    new Notice(opt.kind === 'cite' ? t('notice.pinnedCite', { cite: opt.value }) : t('notice.pinned', { sec: opt.value }));
  }

  unpinLinkAtCursor(editor, link) {
    if (!parseBinding(link.title)) return;
    editor.replaceRange('[' + link.name + '](' + link.target + ')', { line: link.line, ch: link.from }, { line: link.line, ch: link.to });
    new Notice(t('notice.unpinned'));
  }

  // One of the two selection verbs. The builder decides whether it ends up under the verb
  // or on its own; the wording follows, since inside the submenu the verb is already named.
  selectionItem(menu, kind, icon, run) {
    menu.tagged(kind, {}, (item, grouped) => item
      .setTitle(t('menu.' + kind + (grouped ? '.item' : '.solo')))
      .setIcon(icon)
      .onClick(run));
  }

  // Whether the link under the cursor is ours to act on. Recognising it isn't enough: the
  // code linker recognises a file both indexes cover just as readily, and two Copy and two
  // Unpin items on one link tell the reader nothing about which is which.
  ownsLinkAtCursor(link) {
    if (!this.isReferenceLink(link.name, link.target, link.title)) return false;
    const provider = this.api && this.api.linker;
    if (!provider) return true;
    return ownsLink(this.app, provider, link.target, link.title);
  }

  // One of ours — a link into an indexed document — so the copy/pin/fix items show only on
  // our links.
  isReferenceLink(name, target, title) {
    return !!this.refForTarget(target) || !!this.linkState(withTitle(target, title));
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

  // isFile, not just exists: reading a folder throws EISDIR into loadCitations' catch, and
  // the row would sit there looking healthy.
  bibStatus() {
    return this.bibPaths().map((abs) => {
      let stat = null;
      try { stat = fs.statSync(abs); } catch { /* not there */ }
      return { abs, exists: !!stat, isFile: !!stat && stat.isFile() };
    });
  }

  // Folder -> the file names that count in it, so bibliographies side by side cost one watcher.
  bibFolders() {
    const dirs = new Map();
    for (const abs of this.bibPaths()) {
      const dir = nodePath.dirname(abs);
      if (!dirs.has(dir)) dirs.set(dir, new Set());
      dirs.get(dir).add(nodePath.basename(abs).toLowerCase());
    }
    return dirs;
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

Object.assign(ReferenceLinkerPlugin.prototype, api, indexEvents);
Object.assign(ReferenceLinkerPlugin.prototype, actualize.methods);

module.exports = ReferenceLinkerPlugin;
