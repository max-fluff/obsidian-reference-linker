'use strict';

// Inline reference embed: a ```reference-link fenced block that renders a document page (or
// an image) inline in the note, on the same pdf.js renderer as the hover preview. The target
// is a path (optionally with #page=N or :N), or a name/section resolved through the index.
// The block re-renders on every index change, so an open embed follows changes on disk.

const { MarkdownRenderChild, Menu } = require('obsidian');
const nodePath = require('path');
const fs = require('fs');
const { openDocument, renderPageToCanvas } = require('./pdf');
const { t } = require('./shared/i18n');

const EMBED_LANG = 'reference-link';
const DEFAULT_WIDTH = 600; // CSS px the page/image is rendered at (override with `width:`)

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']);
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif' };

const baseName = (p) => nodePath.basename(p).replace(/\.[^.]+$/, '');
const looksLikePath = (s) => s.includes('/') || s.includes('\\') || /\.[a-z0-9]+$/i.test(s);

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

// Split a trailing page off a path target: "file.pdf#page=3" or "file.pdf:3".
function splitPage(target) {
  let m = /^(.*)#page=(\d+)\s*$/i.exec(target);
  if (m) return { path: m[1], page: parseInt(m[2], 10) };
  m = /^(.+?):(\d+)\s*$/.exec(target);
  if (m) return { path: m[1], page: parseInt(m[2], 10) };
  return { path: target, page: null };
}

// Resolve the spec to { absPath, relPath, ext, page, name, entry } or { error }.
function resolve(plugin, spec) {
  const target = spec.target;
  if (!target) return { error: t('embed.empty') };

  const sp = splitPage(target);
  let relPath, page, name;
  if (looksLikePath(sp.path)) {
    const norm = sp.path.split('\\').join('/').replace(/^\.?\//, '');
    const hit = plugin.lookup(norm)[0];
    relPath = hit ? hit.path : norm;
    name = hit ? hit.name : baseName(relPath);
    page = sp.page;
  } else {
    const f = plugin.parseQuery(target);
    const matches = plugin.entriesByName(f.name).filter((m) => plugin.entryPassesFilter(m, f));
    if (!matches.length) return { error: t('embed.notFound', { query: target }) };
    const paths = new Set(matches.map((m) => m.path));
    if (paths.size > 1) return { error: t('embed.ambiguous', { n: paths.size, query: target }) };
    const e = matches.find((m) => m.kind === 'section') || matches[0];
    relPath = e.path; name = e.name; page = e.page;
  }

  const specPage = parseInt(spec.page, 10);
  if (Number.isFinite(specPage)) page = specPage;
  page = page || 1;
  const root = plugin.codeRoot();
  const absPath = root ? nodePath.join(root, relPath) : relPath;
  const ext = nodePath.extname(relPath).slice(1).toLowerCase();
  const kind = page > 1 ? 'section' : 'file';
  return { absPath, relPath, ext, page, name, entry: { name, kind, path: relPath, line: page, page } };
}

class ReferenceEmbed extends MarkdownRenderChild {
  constructor(containerEl, plugin, spec) {
    super(containerEl);
    this.plugin = plugin;
    this.spec = spec;
    this.renderId = 0;
    this.blobUrl = '';
  }

  onload() {
    this.containerEl.addEventListener('contextmenu', (evt) => this.onContextMenu(evt));
    this.render();
    // fs.watch -> rebuildIndex -> notifyIndexChange, so an open embed re-renders on change.
    this.unsub = this.plugin.onIndexChange(() => this.render());
  }

  onunload() {
    if (this.unsub) this.unsub();
    this.revokeBlob();
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
  revokeBlob() { if (this.blobUrl) { try { URL.revokeObjectURL(this.blobUrl); } catch { /* ignore */ } this.blobUrl = ''; } }
  width() { const n = parseInt(this.spec.width, 10); return Number.isFinite(n) && n > 0 ? n : DEFAULT_WIDTH; }

  async render(force) {
    const token = ++this.renderId;
    const res = resolve(this.plugin, this.spec);
    this.res = res; // for the right-click menu (open / refresh)

    // Skip the re-render when nothing this embed shows has changed.
    const cached = res.relPath && this.plugin.fileCache.get(res.relPath);
    const mtime = cached ? cached.mtimeMs : null;
    const sig = res.error ? 'err:' + res.error : res.absPath + '|' + res.page + '|' + mtime + '|' + this.width();
    if (!force && sig === this.lastSig && (res.error || mtime != null)) return;
    this.lastSig = sig;

    if (res.error) { this.notice('reference-linker-embed-error', res.error); return; }

    const el = this.containerEl;
    el.empty();
    el.addClass('reference-linker-embed');
    const header = el.createDiv({ cls: 'reference-linker-embed-header mod-clickable' });
    header.createSpan({ text: this.spec.title || res.name + (res.entry.kind === 'section' ? '  ·  p.' + res.page : '') });
    header.addEventListener('click', () => this.open());
    const body = el.createDiv({ cls: 'reference-linker-embed-body' });

    if (res.ext === 'pdf') {
      const doc = await openDocument(res.absPath);
      if (token !== this.renderId) { if (doc) { try { await doc.destroy(); } catch { /* ignore */ } } return; }
      if (!doc) { this.fail(res); return; }
      const canvas = body.createEl('canvas');
      const ok = await renderPageToCanvas(doc, res.page, canvas, this.width());
      try { await doc.destroy(); } catch { /* ignore */ }
      if (token !== this.renderId) return;
      if (!ok) { this.fail(res); return; }
    } else if (IMAGE_EXT.has(res.ext)) {
      let buf;
      try { buf = fs.readFileSync(res.absPath); } catch { this.fail(res); return; }
      if (token !== this.renderId) return;
      this.revokeBlob();
      this.blobUrl = URL.createObjectURL(new Blob([buf], { type: MIME[res.ext] || 'application/octet-stream' }));
      const img = body.createEl('img');
      img.src = this.blobUrl;
      img.style.maxWidth = this.width() + 'px';
    } else {
      this.notice('reference-linker-embed-error', t('embed.unsupported', { path: res.relPath }));
      this.lastSig = null;
    }
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

module.exports = { registerEmbed };
