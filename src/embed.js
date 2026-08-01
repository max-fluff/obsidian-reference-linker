'use strict';

// Inline reference embed: a ```reference-link fenced block that renders a document inline in
// the note, through the format handlers. The target is a path — optionally with #page=N, an
// #id anchor, or a range like #page=3-5 — or a name/section resolved through the index. A
// range stacks each page/section. The block re-renders on every index change, so an open
// embed follows changes on disk.

const { Notice } = require('obsidian');
const nodePath = require('path');
const formats = require('./formats');
const { EmbedViewer } = require('./viewer');
const { formatZoom } = require('./viewer-state');
const frame = require('./shared/embed-frame');
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

// A position in a recording, in seconds: "90", "1:30" or "1:02:05". The header shows a
// timecode, so a timecode is what you can write.
function parseTimecode(s) {
  const t = String(s).trim();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  return (parseInt(m[1] || '0', 10) * 3600) + (parseInt(m[2], 10) * 60) + parseInt(m[3], 10);
}

// `time:` is `page:` for a recording — the same position, written the way a recording's
// position reads.
const SPEC_KEYS = ['page', 'time', 'width', 'title', 'zoom'];
const parseSpec = (source) => frame.parseSpec(source, SPEC_KEYS);

// Split a trailing position off a path target: the fragment after '#' (a "page=3", "page=3-5",
// "t=90", or an id like "_options"), or a legacy ":3" / ":3-5" suffix. The legacy one names no
// unit — spelled as a page here it would be rejected on a recording, which reads as seconds.
function splitTarget(target) {
  const h = target.indexOf('#');
  if (h >= 0) return { path: target.slice(0, h), frag: target.slice(h + 1).trim() };
  const m = /^(.+?):(\d+(?:-\d+)?)\s*$/.exec(target);
  if (m) return { path: m[1], frag: 'at=' + m[2] };
  return { path: target, frag: '' };
}

// Resolve the spec to { absPath, relPath, ext, position, to, name, entry } or { error }. `to`
// is the end of a range (equal to `position` for a single one).
function resolve(plugin, spec) {
  const target = spec.target;
  if (!target) return { error: t('embed.empty') };

  const { path: rawPath, frag } = splitTarget(target);
  let relPath, name = null, position = null, to = null, anchor = null;
  const byPath = looksLikePath(rawPath);

  if (byPath) {
    const norm = rawPath.split('\\').join('/').replace(/^\.?\//, '');
    const hit = plugin.lookup(norm)[0];
    relPath = hit ? hit.path : norm;
  } else {
    const f = plugin.parseQuery(target);
    const matches = plugin.entriesByName(f.name).filter((m) => plugin.entryPassesFilter(m, f));
    if (!matches.length) return { error: t('embed.notFound', { query: target }) };
    const paths = new Set(matches.map((m) => m.path));
    if (paths.size > 1) return { error: t('embed.ambiguous', { n: paths.size, query: target }) };
    const e = matches.find((m) => m.kind === 'section') || matches[0];
    relPath = e.path; name = e.name; position = e.position;
  }

  const ext = nodePath.extname(relPath).slice(1).toLowerCase();
  // A recording is positioned in time, everything else in pages. Each format takes only its
  // own spelling: the other one is a mistake worth naming, not something to quietly ignore.
  const timed = formats.positionUnit(ext) === 'time';
  const wrongUnit = () => ({ error: t(timed ? 'embed.needsTime' : 'embed.needsPage', { path: relPath }) });

  // The fragment is read now that the format is known.
  if (byPath && frag) {
    const pm = /^page=(\d+(?:[-–]\d+)?)$/i.exec(frag);
    const tm = /^t=(.+)$/i.exec(frag);
    const legacy = /^at=(\d+(?:-\d+)?)$/i.exec(frag);
    if (legacy) {
      const sp = parseSpan(legacy[1]);
      position = sp.from;
      to = timed ? sp.from : sp.to;
    } else if (pm) {
      if (timed) return wrongUnit();
      const sp = parseSpan(pm[1]); position = sp.from; to = sp.to;
    } else if (tm) {
      if (!timed) return wrongUnit();
      const at = parseTimecode(tm[1]);
      if (at == null) return wrongUnit();
      position = at; to = at;
    } else {
      anchor = frag; // an id fragment, resolved through the index below
    }
  }

  // An id fragment (file.html#_options) names a section the way a copied link does — resolve
  // it to that section's position through the index.
  if (anchor) {
    const sec = plugin.entriesIn(relPath).find((x) => x.kind === 'section' && x.anchor === anchor);
    if (!sec) return { error: t('embed.notFound', { query: target }) };
    position = sec.position; name = sec.name;
  }

  // The position on its own line, in the format's own unit.
  if (spec.page) {
    if (timed) return wrongUnit();
    const span = parseSpan(spec.page);
    if (span) { position = span.from; to = span.to; }
  }
  if (spec.time) {
    if (!timed) return wrongUnit();
    const at = parseTimecode(spec.time);
    if (at == null) return wrongUnit();
    position = at; to = at;
  }

  position = position || 1;
  to = to && to >= position ? to : position;
  // Only paged/sectioned formats range; media and images render once.
  if (!formats.canOutline(ext)) to = position;
  to = Math.min(to, position + MAX_RANGE - 1);

  // The header names what is actually shown: the section a single-position embed lands on, else
  // the document. A path lookup's first hit was any entry of the file — often the wrong one.
  if (name === null) {
    const sec = position === to && plugin.entriesIn(relPath).find((x) => x.kind === 'section' && x.position === position);
    name = sec ? sec.name : baseName(relPath);
  }

  const root = plugin.codeRoot();
  const absPath = root ? nodePath.join(root, relPath) : relPath;
  const kind = position > 1 || to > position ? 'section' : 'file';
  return { absPath, relPath, ext, position, to, name, entry: { name, kind, path: relPath, line: position, position } };
}

class ReferenceEmbed extends frame.EmbedFrame {
  constructor(containerEl, plugin, spec, ctx) {
    super(containerEl, plugin, spec, ctx, 'reference-linker');
    this.viewer = null;
  }

  resolve() { return resolve(this.plugin, this.spec); }

  width() { const n = parseInt(this.spec.width, 10); return Number.isFinite(n) && n > 0 ? n : DEFAULT_WIDTH; }

  // The mtime is what says whether the file behind this embed actually changed; without one
  // there is nothing to compare, so the render is never skipped.
  sig(res) {
    const cached = res.relPath && this.plugin.fileCache.get(res.relPath);
    const mtime = cached ? cached.mtimeMs : null;
    return mtime == null ? null : res.absPath + '|' + res.position + '-' + res.to + '|' + mtime + '|' + this.width();
  }

  headerText(res) {
    if (this.spec.title) return this.spec.title;
    // A paged viewer says where it is in the toolbar; the header would name where the block
    // started, which is not where the reader is.
    const paged = formats.capabilities(res.ext).paged && res.to === res.position;
    const at = paged ? null : formats.positionLabel(res.ext, res.position, res.to);
    return res.name + (at ? '  ·  ' + at : '');
  }

  unreadable(res) {
    return formats.canPreview(res.ext)
      ? t('embed.unreadable', { path: res.relPath })
      : t('embed.unsupported', { path: res.relPath });
  }

  tools(row) { this.row = row; }

  // The viewer outlives this render: its position and zoom are the reader's, not the block's.
  async renderBody(body, res) {
    if (!formats.canPreview(res.ext)) return false;
    if (!this.viewer) {
      this.viewer = new EmbedViewer({
        plugin: this.plugin,
        spec: this.spec,
        component: this,
        container: this.containerEl,
        width: this.width(),
        label: () => this.headerText(this.res),
      });
    }
    return this.viewer.show(res, this.row, body);
  }

  menuItems(menu) {
    const st = this.viewer && this.viewer.state();
    if (!st || !(st.paged || st.zoomable)) return;
    menu.addItem((i) => i.setTitle(t('embed.menu.remember')).setIcon('bookmark').onClick(() => this.remember()));
  }

  // Only on this explicit ask: a block that rewrote itself on every page turn would fill the
  // note's undo stack and its history with chrome.
  async remember() {
    const st = this.viewer && this.viewer.state();
    if (!st) return;
    const ok = await this.writeBody((body) => {
      let out = body;
      if (st.paged) out = frame.setSpecLine(out, 'page', String(st.position));
      if (st.zoomable) out = frame.setSpecLine(out, 'zoom', formatZoom(st.zoom));
      return out;
    });
    new Notice(ok ? t('notice.viewRemembered') : t('notice.embedMoved'));
  }

  release() { if (this.viewer) { this.viewer.destroy(); this.viewer = null; } }
}

function registerEmbed(plugin) {
  plugin.registerMarkdownCodeBlockProcessor(EMBED_LANG, (source, el, ctx) => {
    ctx.addChild(new ReferenceEmbed(el, plugin, parseSpec(source), ctx));
  });
}

module.exports = { registerEmbed, resolve, splitTarget, parseSpan, parseSpec, parseTimecode };
