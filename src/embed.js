'use strict';

// Inline reference embed: a ```reference-link fenced block that renders a document from
// the note. The target is a path (page/range rendering comes in Phase 4). The block
// re-renders on every index change, so an open embed follows changes on disk.

const { MarkdownRenderChild, Menu } = require('obsidian');
const nodePath = require('path');
const { readLines, renderCode } = require('./render');
const { t } = require('./shared/i18n');

const EMBED_LANG = 'reference-link';
const MAX_EMBED_LINES = 400; // bound how much a single embed can pour into the note

// First non-empty line is the target; later "key: value" lines are modifiers.
function parseSpec(source) {
  const spec = { target: '', context: '', lines: '', title: '' };
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(context|lines|title)\s*:\s*(.*)$/i.exec(line);
    if (m) spec[m[1].toLowerCase()] = m[2].trim();
    else if (!spec.target) spec.target = line;
  }
  return spec;
}

const baseName = (p) => nodePath.basename(p).replace(/\.[^.]+$/, '');
const intOr = (v, def) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : def; };

// "<from>-<to>" or "<from>" -> { from, to } (from <= to), or null.
function splitRange(v) {
  const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec((v || '').trim());
  if (!m) return null;
  const a = parseInt(m[1], 10);
  const b = m[2] ? parseInt(m[2], 10) : a;
  return { from: Math.min(a, b), to: Math.max(a, b) };
}

// "<path>:<from>[-<to>]" -> { path, from, to, single }, or null. Relative code paths
// don't contain colons, so the last :<digits> is unambiguously the line.
function splitPathRange(t) {
  const m = /^(.+?):(\d+)(?:-(\d+))?$/.exec(t);
  if (!m) return null;
  const from = parseInt(m[2], 10);
  const to = m[3] ? parseInt(m[3], 10) : from;
  return { path: m[1], from: Math.min(from, to), to: Math.max(from, to), single: !m[3] };
}

const looksLikePath = (s) => s.includes('/') || s.includes('\\') || /\.[a-z0-9]+$/i.test(s);

function langForPath(plugin, relPath) {
  const ext = nodePath.extname(relPath).toLowerCase();
  const lang = plugin.languages.find((l) => l.extensions.includes(ext));
  return lang ? lang.id : '';
}

// Resolve a path spec to a code-root-relative path. An indexed file is matched by its
// tail through lookup(), so "http-client.ts" or "code-samples/http-client.ts" both work
// regardless of the scan-root prefix. A path that isn't indexed is kept as given, so
// out-of-index files still resolve under the root.
function resolvePath(plugin, relPath) {
  const norm = relPath.split('\\').join('/').replace(/^\.?\//, '');
  const hit = plugin.lookup(norm)[0];
  return hit ? hit.path : norm;
}

function build(plugin, relPath, langId, from, to, targetLine, name) {
  const root = plugin.codeRoot();
  const absPath = root ? nodePath.join(root, relPath) : relPath;
  const requestedTo = to;
  to = Math.min(to, from + MAX_EMBED_LINES - 1);
  return {
    absPath, relPath, from, to, targetLine,
    truncated: to < requestedTo,
    prismId: langId ? plugin.prismIdFor(langId) : '',
    entry: { name: name || baseName(relPath), path: relPath, line: targetLine || from },
  };
}

function fromPath(plugin, spec, relPath, from, to, targetLine) {
  relPath = resolvePath(plugin, relPath);
  const ctx = intOr(spec.context, 0);
  const lr = splitRange(spec.lines);
  if (lr) { from = lr.from; to = lr.to; targetLine = null; } // lines: overrides the range
  if (from == null) { from = 1; to = MAX_EMBED_LINES; }      // bare path: whole file (capped)
  // context grows the shown window symmetrically around the line or range.
  from = Math.max(1, from - ctx);
  to = to + ctx;
  return build(plugin, relPath, langForPath(plugin, relPath), from, to, targetLine, null);
}

// Resolve a parsed spec to a render target, or { error } for the inline notice.
function resolve(plugin, spec) {
  const target = spec.target;
  if (!target) return { error: t('embed.empty') };

  const pr = splitPathRange(target);
  if (pr) return fromPath(plugin, spec, pr.path, pr.from, pr.to, pr.single ? pr.from : null);
  if (looksLikePath(target)) return fromPath(plugin, spec, target, null, null, null);

  // A "py:"/"def:" filter narrows a name that collides across files (a dotted "Foo.bar"
  // is a path here — looksLikePath owns the dot — so class scope is suggestion-only).
  const f = plugin.parseQuery(target);
  const matches = plugin.entriesByName(f.name).filter((m) => plugin.entryPassesFilter(m, f));
  if (!matches.length) return { error: t('embed.notFound', { query: target }) };
  const paths = new Set(matches.map((m) => m.path));
  if (paths.size > 1) return { error: t('embed.ambiguous', { n: paths.size, query: target }) };
  const e = matches.find((m) => m.kind !== 'file') || matches[0]; // declaration over file entry
  const ctx = intOr(spec.context, 0);
  const lr = splitRange(spec.lines);
  const from = Math.max(1, (lr ? lr.from : e.line) - ctx);
  const to = (lr ? lr.to : e.line) + ctx;
  return build(plugin, e.path, e.lang, from, to, lr ? null : e.line, e.name);
}

class CodeEmbed extends MarkdownRenderChild {
  constructor(containerEl, plugin, spec) {
    super(containerEl);
    this.plugin = plugin;
    this.spec = spec;
    this.renderId = 0;
  }

  onload() {
    this.containerEl.addEventListener('contextmenu', (evt) => this.onContextMenu(evt));
    this.render();
    // fs.watch -> rebuildIndex -> notifyIndexChange, so an open embed re-reads on edit.
    this.unsub = this.plugin.onIndexChange(() => this.render());
  }

  onunload() {
    if (this.unsub) this.unsub();
  }

  // Open the embedded file, honouring the editor-link preset (and the format picker
  // when "Always ask" is on) — the same path the open/insert commands use.
  open() {
    const e = this.res && this.res.entry;
    if (!e) return;
    this.plugin.withFormat(this.plugin.settings.askOnInsert, (tpl) => this.plugin.openEntry(e, tpl));
  }

  onContextMenu(evt) {
    const res = this.res;
    if (!res) return;
    evt.preventDefault();
    evt.stopPropagation();
    const menu = new Menu();
    if (res.entry) menu.addItem((i) => i.setTitle(t('embed.menu.open')).setIcon('go-to-file').onClick(() => this.open()));
    menu.addItem((i) => i.setTitle(t('embed.menu.refresh')).setIcon('refresh-cw').onClick(() => this.render(true)));
    menu.showAtMouseEvent(evt);
  }

  notice(cls, text) {
    this.containerEl.empty();
    this.containerEl.createDiv({ cls, text });
  }

  async render(force) {
    const el = this.containerEl;
    el.addClass('reference-linker-embed', 'reference-linker-code');
    const token = ++this.renderId;
    const res = resolve(this.plugin, this.spec);
    this.res = res; // for the right-click menu (open file / refresh)

    // Skip the re-read/re-tokenize/DOM rebuild when nothing this embed shows has changed.
    // notifyIndexChange fires on any rebuild in the watched tree; the file's cached mtime
    // (plus the resolved window) tells us whether *this* embed's content actually moved.
    const cached = res.relPath && this.plugin.fileCache.get(res.relPath);
    const mtime = cached ? cached.mtimeMs : null;
    const sig = res.error ? 'err:' + res.error
      : res.absPath + '|' + res.from + '|' + res.to + '|' + res.targetLine + '|' + mtime;
    if (!force && sig === this.lastSig && (res.error || mtime != null)) return;
    this.lastSig = sig;

    if (res.error) { this.notice('reference-linker-embed-error', res.error); return; }

    // Read before clearing so a live refresh keeps the old snippet on screen until the
    // new one is ready (no blank flash when the index rebuilds).
    const snippet = await readLines(res.absPath, res.from, res.to);
    if (token !== this.renderId) return; // a later render superseded this one
    if (!snippet) { this.notice('reference-linker-embed-error', t('embed.unreadable', { path: res.relPath })); this.lastSig = null; return; }
    el.empty();

    const start = snippet.startLine;
    const end = start + snippet.lines.length - 1;
    const header = el.createDiv({ cls: 'reference-linker-embed-header mod-clickable' });
    header.createSpan({ text: this.spec.title || res.relPath + ':' + (start === end ? start : start + '-' + end) });
    header.addEventListener('click', () => this.open());

    const body = el.createDiv({ cls: 'reference-linker-embed-body' });
    if (res.targetLine != null) {
      const idx = res.targetLine - start;
      if (idx >= 0 && idx < snippet.lines.length) {
        const band = body.createDiv({ cls: 'reference-linker-embed-band' });
        band.style.top = 'calc(var(--cl-lh) * ' + idx + ')';
      }
    }
    await renderCode(body, snippet.lines.join('\n'), res.prismId);
    if (res.truncated) el.createDiv({ cls: 'reference-linker-embed-note', text: t('embed.truncated', { max: MAX_EMBED_LINES }) });
  }
}

function registerEmbed(plugin) {
  plugin.registerMarkdownCodeBlockProcessor(EMBED_LANG, (source, el, ctx) => {
    ctx.addChild(new CodeEmbed(el, plugin, parseSpec(source)));
  });
}

module.exports = { registerEmbed };
