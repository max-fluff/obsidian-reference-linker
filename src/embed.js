'use strict';

// Inline reference embed: a ```reference-link fenced block that renders a document inline in
// the note, through the format handlers. The target is a path — optionally with #page=N, an
// #id anchor, or a range like #page=3-5 — or a name/section resolved through the index. A
// range stacks each page/section. The block re-renders on every index change, so an open
// embed follows changes on disk.

const { MarkdownRenderChild, Menu } = require('obsidian');
const nodePath = require('path');
const formats = require('./formats');
const { t } = require('./shared/i18n');

const EMBED_LANG = 'reference-link';
const DEFAULT_WIDTH = 600; // CSS px the page/image is rendered at (override with `width:`)
const MAX_RANGE = 20; // pages/sections one embed will stack, so a huge range can't hang the note

const baseName = (p) => nodePath.basename(p).replace(/\.[^.]+$/, '');
const looksLikePath = (s) => s.includes('/') || s.includes('\\') || /\.[a-z0-9]+$/i.test(s);

// "3" or "3-5" (or an en dash) as a span; null when it isn't one.
function parseSpan(s) {
  const m = /^(\d+)\s*[-–]\s*(\d+)$/.exec(s) || /^(\d+)$/.exec(s);
  if (!m) return null;
  const from = parseInt(m[1], 10);
  return { from, to: Math.max(from, m[2] ? parseInt(m[2], 10) : from) };
}

// First non-empty line is the target; later "key: value" lines tune it.
function parseSpec(source) {
  const spec = { target: '', page: '', width: '', title: '' };
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(page|width|title)\s*:\s*(.*)$/i.exec(line);
    if (m) spec[m[1].toLowerCase()] = m[2].trim();
    else if (!spec.target) spec.target = line;
  }
  return spec;
}

// Split a trailing position off a path target: the fragment after '#' (a "page=3", "page=3-5",
// "t=90", or an id like "_options"), or a legacy ":3" / ":3-5" page suffix.
function splitTarget(target) {
  const h = target.indexOf('#');
  if (h >= 0) return { path: target.slice(0, h), frag: target.slice(h + 1).trim() };
  const m = /^(.+?):(\d+(?:-\d+)?)\s*$/.exec(target);
  if (m) return { path: m[1], frag: 'page=' + m[2] };
  return { path: target, frag: '' };
}

// Resolve the spec to { absPath, relPath, ext, page, to, name, entry } or { error }. `to` is
// the last page of a range (equal to `page` for a single one).
function resolve(plugin, spec) {
  const target = spec.target;
  if (!target) return { error: t('embed.empty') };

  const { path: rawPath, frag } = splitTarget(target);
  let relPath, name = null, page = null, to = null, anchor = null;
  const byPath = looksLikePath(rawPath);

  if (byPath) {
    const norm = rawPath.split('\\').join('/').replace(/^\.?\//, '');
    const hit = plugin.lookup(norm)[0];
    relPath = hit ? hit.path : norm;
    const pm = /^(?:page|t)=(\d+(?:[-–]\d+)?)$/i.exec(frag);
    if (pm) { const sp = parseSpan(pm[1]); page = sp.from; to = sp.to; }
    else if (frag) anchor = frag; // an id fragment, resolved through the index below
  } else {
    const f = plugin.parseQuery(target);
    const matches = plugin.entriesByName(f.name).filter((m) => plugin.entryPassesFilter(m, f));
    if (!matches.length) return { error: t('embed.notFound', { query: target }) };
    const paths = new Set(matches.map((m) => m.path));
    if (paths.size > 1) return { error: t('embed.ambiguous', { n: paths.size, query: target }) };
    const e = matches.find((m) => m.kind === 'section') || matches[0];
    relPath = e.path; name = e.name; page = e.page;
  }

  const ext = nodePath.extname(relPath).slice(1).toLowerCase();

  // An id fragment (file.html#_options) names a section the way a copied link does — resolve
  // it to that section's page through the index.
  if (anchor) {
    const sec = plugin.entriesIn(relPath).find((x) => x.kind === 'section' && x.anchor === anchor);
    if (!sec) return { error: t('embed.notFound', { query: target }) };
    page = sec.page; name = sec.name;
  }

  // A page or range on its own line overrides the target.
  const span = parseSpan(spec.page);
  if (span) { page = span.from; to = span.to; }

  page = page || 1;
  to = to && to >= page ? to : page;
  // Only paged/sectioned formats range; media and images render once.
  if (!formats.canOutline(ext)) to = page;
  to = Math.min(to, page + MAX_RANGE - 1);

  // The header names what is actually shown: the section a single-page embed lands on, else
  // the document. A path lookup's first hit was any entry of the file — often the wrong one.
  if (name === null) {
    const sec = page === to && plugin.entriesIn(relPath).find((x) => x.kind === 'section' && x.page === page);
    name = sec ? sec.name : baseName(relPath);
  }

  const root = plugin.codeRoot();
  const absPath = root ? nodePath.join(root, relPath) : relPath;
  const kind = page > 1 || to > page ? 'section' : 'file';
  return { absPath, relPath, ext, page, to, name, entry: { name, kind, path: relPath, line: page, page } };
}

class ReferenceEmbed extends MarkdownRenderChild {
  constructor(containerEl, plugin, spec) {
    super(containerEl);
    this.plugin = plugin;
    this.spec = spec;
    this.renderId = 0;
    this.cleanup = null;
  }

  onload() {
    this.containerEl.addEventListener('contextmenu', (evt) => this.onContextMenu(evt));
    this.render();
    // fs.watch -> rebuildIndex -> notifyIndexChange, so an open embed re-renders on change.
    this.unsub = this.plugin.onIndexChange(() => this.render());
  }

  onunload() {
    if (this.unsub) this.unsub();
    this.release();
  }

  // Open the embedded document at its page — the same path the open/insert commands use.
  open() {
    const e = this.res && this.res.entry;
    if (!e) return;
    this.plugin.withFormat(this.plugin.settings.askOnInsert, (tpl) => this.plugin.openEntry(e, tpl));
  }

  onContextMenu(evt) {
    if (!this.res) return;
    evt.preventDefault();
    evt.stopPropagation();
    const menu = new Menu();
    if (this.res.entry) menu.addItem((i) => i.setTitle(t('embed.menu.open')).setIcon('go-to-file').onClick(() => this.open()));
    menu.addItem((i) => i.setTitle(t('embed.menu.refresh')).setIcon('refresh-cw').onClick(() => this.render(true)));
    menu.showAtMouseEvent(evt);
  }

  notice(cls, text) { this.containerEl.empty(); this.containerEl.createDiv({ cls, text }); }
  release() { if (this.cleanup) { try { this.cleanup(); } catch { /* ignore */ } this.cleanup = null; } }
  width() { const n = parseInt(this.spec.width, 10); return Number.isFinite(n) && n > 0 ? n : DEFAULT_WIDTH; }

  async render(force) {
    const token = ++this.renderId;
    const res = resolve(this.plugin, this.spec);
    this.res = res; // for the right-click menu (open / refresh)

    // Skip the re-render when nothing this embed shows has changed.
    const cached = res.relPath && this.plugin.fileCache.get(res.relPath);
    const mtime = cached ? cached.mtimeMs : null;
    const sig = res.error ? 'err:' + res.error : res.absPath + '|' + res.page + '-' + res.to + '|' + mtime + '|' + this.width();
    if (!force && sig === this.lastSig && (res.error || mtime != null)) return;
    this.lastSig = sig;

    if (res.error) { this.notice('reference-linker-embed-error', res.error); return; }

    const el = this.containerEl;
    el.empty();
    el.addClass('reference-linker-embed');
    const header = el.createDiv({ cls: 'reference-linker-embed-header mod-clickable' });
    const pos = formats.positionLabel(res.ext, res.page, res.to);
    header.createSpan({ text: this.spec.title || res.name + (pos ? '  ·  ' + pos : '') });
    header.addEventListener('click', () => this.open());
    const body = el.createDiv({ cls: 'reference-linker-embed-body' });

    if (!formats.canPreview(res.ext)) {
      this.notice('reference-linker-embed-error', t('embed.unsupported', { path: res.relPath }));
      this.lastSig = null;
      return;
    }

    // A range stacks each page/section; a single embed is just the one-item case.
    this.release();
    const cleanups = [];
    let drew = false;
    for (let p = res.page; p <= res.to; p++) {
      const slot = res.to > res.page ? body.createDiv({ cls: 'reference-linker-embed-slot' }) : body;
      const cleanup = await formats.render(slot, {
        abs: res.absPath,
        ext: res.ext,
        page: p,
        width: this.width(),
        app: this.plugin.app,
        component: this,
        isCurrent: () => token === this.renderId,
      });
      if (token !== this.renderId) {
        if (typeof cleanup === 'function') { try { cleanup(); } catch { /* ignore */ } }
        cleanups.forEach((c) => { try { c(); } catch { /* ignore */ } });
        return;
      }
      if (cleanup !== false) drew = true;
      if (typeof cleanup === 'function') cleanups.push(cleanup);
    }
    if (!drew) { this.fail(res); return; }
    this.cleanup = cleanups.length ? () => cleanups.forEach((c) => { try { c(); } catch { /* ignore */ } }) : null;
  }

  fail(res) {
    this.notice('reference-linker-embed-error', t('embed.unreadable', { path: res.relPath }));
    this.lastSig = null;
  }
}

function registerEmbed(plugin) {
  plugin.registerMarkdownCodeBlockProcessor(EMBED_LANG, (source, el, ctx) => {
    ctx.addChild(new ReferenceEmbed(el, plugin, parseSpec(source)));
  });
}

module.exports = { registerEmbed, resolve, splitTarget, parseSpan, parseSpec };
