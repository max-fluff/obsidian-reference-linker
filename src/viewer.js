'use strict';

// The interactive part of an inline embed: the toolbar controls and the body they drive. It
// owns the position and zoom, which have to outlive the re-render an index rebuild triggers.

const { Menu } = require('obsidian');
const formats = require('./formats');
const { toolButton } = require('./shared/embed-frame');
const { t } = require('./shared/i18n');
const vs = require('./viewer-state');

const ZOOM_DEBOUNCE = 120; // ms; a PDF page is rasterised on every step of the ladder

class EmbedViewer {
  // opts: plugin, spec, component, container, width, label.
  constructor(opts) {
    this.opts = opts;
    this.st = null;
    this.key = '';
    this.renderId = 0;
    this.cleanup = null;
    this.timer = null;
    this.wired = null;
  }

  state() { return this.st; }

  async show(res, tools, body) {
    const key = res.absPath + '|' + res.ext + '|' + res.position + '-' + res.to;
    this.res = res;
    if (key !== this.key || tools !== this.tools || body !== this.body) {
      this.key = key;
      this.tools = tools;
      this.body = body;
      // A range is a scroll of its own positions: it doesn't page, but its contents still lead
      // somewhere — down the scroll rather than to another position.
      this.ranged = res.to > res.position;
      const caps = formats.capabilities(res.ext);
      this.st = vs.initialState({
        position: res.position,
        zoom: this.opts.spec.zoom,
        count: 0,
        paged: caps.paged && !this.ranged,
        zoomable: caps.zoomable,
      });
      this.build();
    }
    this.countPositions();
    this.sync();
    return this.draw();
  }

  destroy() {
    this.renderId++;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.release();
  }

  release() {
    if (this.cleanup) { try { this.cleanup(); } catch { /* ignore */ } this.cleanup = null; }
  }

  build() {
    const tools = this.tools;
    tools.empty();
    // The row is rebuilt from the state, so what the new one has no place for must not be left
    // pointing at the old one's detached elements.
    this.navEl = null;
    this.outlineBtn = null;
    this.posEl = null;
    this.zoomEl = null;
    if (this.st.paged || this.ranged) {
      this.navEl = tools.createDiv({ cls: 'reference-linker-embed-group', attr: { 'aria-live': 'polite' } });
      this.outlineBtn = this.button(this.navEl, 'list', t('embed.tool.contents'), (evt) => this.showOutline(evt));
    }
    if (this.st.paged) {
      this.prevBtn = this.button(this.navEl, 'chevron-left', t('embed.tool.prev'), () => this.apply({ type: 'prev' }));
      this.posEl = this.navEl.createEl('input', { cls: 'reference-linker-embed-position', type: 'text' });
      this.posEl.setAttribute('aria-label', t('embed.tool.position'));
      this.posEl.addEventListener('keydown', (evt) => this.onPositionKey(evt));
      this.posEl.addEventListener('blur', () => this.sync());
      this.totalEl = this.navEl.createSpan({ cls: 'reference-linker-embed-total' });
      this.nextBtn = this.button(this.navEl, 'chevron-right', t('embed.tool.next'), () => this.apply({ type: 'next' }));
    }
    if (this.st.zoomable) {
      const g = tools.createDiv({ cls: 'reference-linker-embed-group' });
      this.button(g, 'zoom-out', t('embed.tool.zoomOut'), () => this.apply({ type: 'zoomOut' }));
      this.zoomEl = this.button(g, null, t('embed.tool.zoomReset'), () => this.apply({ type: 'zoom', value: 100 }));
      this.zoomEl.addClass('reference-linker-embed-zoom');
      this.button(g, 'zoom-in', t('embed.tool.zoomIn'), () => this.apply({ type: 'zoomIn' }));
      this.fitBtn = this.button(g, 'maximize', t('embed.tool.fit'), () => this.apply({ type: 'fit' }));
    }
    this.wire();
  }

  // Listeners belong to the body element, which outlives a rebuild of the toolbar.
  wire() {
    if (this.wired === this.body || !(this.st.paged || this.st.zoomable)) return;
    this.wired = this.body;
    // Focusable, or the keys below have nobody to reach; named, or a screen reader announces
    // the focus stop as an unlabelled group.
    this.body.tabIndex = 0;
    this.body.setAttribute('role', 'group');
    this.body.setAttribute('aria-label', this.opts.label());
    this.body.addEventListener('keydown', (evt) => this.onKey(evt));
    this.body.addEventListener('wheel', (evt) => this.onWheel(evt), { passive: false });
    this.body.addEventListener('dblclick', () => this.apply({ type: 'fit' }));
  }

  button(parent, icon, label, onClick) {
    return toolButton(parent, 'reference-linker', icon, label, onClick);
  }

  // The document's own outline, as the index already read it. A range can only lead to what it
  // shows: the rest of the document is not this block's to open.
  sections() {
    const plugin = this.opts.plugin;
    if (!this.res || typeof plugin.entriesIn !== 'function') return [];
    let all = [];
    try {
      all = plugin.entriesIn(this.res.relPath).filter((e) => e.kind === 'section' && e.position > 0);
    } catch {
      return [];
    }
    return this.ranged ? all.filter((e) => e.position >= this.res.position && e.position <= this.res.to) : all;
  }

  showOutline(evt) {
    const menu = new Menu();
    for (const section of this.sections()) {
      const at = formats.positionLabel(this.res.ext, section.position);
      menu.addItem((i) => i
        .setTitle(at ? section.name + '  ·  ' + at : section.name)
        .setChecked(!this.ranged && section.position === this.st.position)
        .onClick(() => this.goTo(section.position)));
    }
    menu.showAtMouseEvent(evt);
  }

  // A paged embed changes what it draws; a range already holds the position, so it scrolls to
  // the slot — which is also what makes the observer draw it.
  goTo(position) {
    if (!this.ranged) { this.apply({ type: 'goto', value: position }); return; }
    const slot = (this.slots || []).find((s) => s.position === position);
    if (slot) this.body.scrollTop = slot.el.offsetTop;
  }

  sync() {
    const st = this.st;
    if (this.navEl) {
      // Both answers arrive late: the count is read from the file, and the index may still have
      // been reading it when the block was drawn.
      const pages = st.paged && st.count !== 1;
      const outline = this.sections().length > 1;
      this.outlineBtn.toggleClass('is-hidden', !outline);
      this.navEl.toggleClass('is-hidden', !pages && !outline);
    }
    if (st.paged) {
      if (document.activeElement !== this.posEl) this.posEl.value = String(st.position);
      this.posEl.size = Math.max(2, String(st.count || st.position).length);
      this.totalEl.setText(st.count ? '/ ' + st.count : '');
      this.prevBtn.disabled = st.position <= 1;
      this.nextBtn.disabled = st.count > 0 && st.position >= st.count;
    }
    if (st.zoomable) {
      // "fit" has no percentage of its own, so the label shows the one it currently works out to.
      this.zoomEl.setText((st.zoom === vs.FIT ? Math.round((this.size().width / this.opts.width) * 100) : st.zoom) + '%');
      this.fitBtn.toggleClass('is-active', st.zoom === vs.FIT);
      this.body.toggleClass('is-zoomed', st.zoom !== vs.FIT && st.zoom > 100);
    }
  }

  apply(action) {
    const prev = this.st;
    const next = vs.reduce(prev, action);
    if (next === prev) return;
    this.st = next;
    this.sync();
    if (next.zoom !== prev.zoom) this.schedule();
    else if (next.position !== prev.position) this.draw();
  }

  schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; this.draw(); }, ZOOM_DEBOUNCE);
  }

  async countPositions() {
    if (!this.st.paged) return;
    const key = this.key;
    const n = await formats.count(this.res.ext, this.res.absPath);
    if (key === this.key) this.apply({ type: 'count', value: n });
  }

  onKey(evt) {
    const before = this.st;
    this.apply(vs.keyAction(evt));
    if (this.st !== before) { evt.preventDefault(); evt.stopPropagation(); }
  }

  // Typing a page is not paging: the arrows belong to the box while it has the cursor.
  onPositionKey(evt) {
    evt.stopPropagation();
    if (evt.key === 'Enter') {
      evt.preventDefault();
      this.apply({ type: 'goto', value: this.posEl.value });
      this.body.focus();
    } else if (evt.key === 'Escape') {
      this.posEl.blur();
    }
  }

  // Only a wheel that moved something is swallowed, or the last page would trap the note.
  onWheel(evt) {
    const before = this.st;
    if (evt.ctrlKey || evt.metaKey) {
      this.apply({ type: evt.deltaY < 0 ? 'zoomIn' : 'zoomOut' });
    } else if (this.st.paged && this.body.scrollHeight <= this.body.clientHeight + 1) {
      this.apply({ type: evt.deltaY < 0 ? 'prev' : 'next' });
    }
    if (this.st !== before) evt.preventDefault();
  }

  size() {
    const box = this.opts.container.parentElement || this.opts.container;
    return vs.renderSize(this.st, this.opts.width, box.clientWidth - 2);
  }

  async draw() {
    const token = ++this.renderId;
    const res = this.res;
    const size = this.size();
    // The box is the reader's, not the content's: zooming scrolls inside it rather than
    // stretching the embed and the toolbar along with the page.
    this.body.style.maxWidth = size.width + 'px';
    const from = this.st.paged ? this.st.position : res.position;
    const to = this.st.paged ? this.st.position : res.to;
    const holder = document.createElement('div');
    const cleanups = [];
    let watcher = null;
    const drop = () => {
      if (watcher) { watcher.disconnect(); watcher = null; }
      cleanups.forEach((c) => { try { c(); } catch { /* ignore */ } });
      cleanups.length = 0;
    };

    const paint = async (slot, position) => {
      const cleanup = await formats.render(slot, {
        abs: res.absPath,
        ext: res.ext,
        position,
        width: size.width,
        zoom: size.zoom,
        view: this.opts.plugin.settings.documentView,
        app: this.opts.plugin.app,
        component: this.opts.component,
        isCurrent: () => token === this.renderId,
      });
      if (token !== this.renderId) {
        if (typeof cleanup === 'function') { try { cleanup(); } catch { /* ignore */ } }
        return false;
      }
      if (typeof cleanup === 'function') cleanups.push(cleanup);
      return cleanup !== false;
    };

    const slots = [];
    for (let p = from; p <= to; p++) {
      if (to === from) { slots.push({ el: holder, position: p }); break; }
      const el = document.createElement('div');
      el.className = 'reference-linker-embed-slot';
      holder.appendChild(el);
      slots.push({ el, position: p });
    }

    // The first position decides whether anything can be shown at all; the rest of a range is
    // drawn as it is scrolled to, so a twenty-page span doesn't rasterise twenty pages at once.
    const drew = await paint(slots[0].el, slots[0].position);
    if (token !== this.renderId) { drop(); return true; }
    if (!drew) { drop(); return false; }

    this.release();
    this.swap(holder, token);
    this.cleanup = drop;
    this.slots = slots; // the contents menu scrolls a range to one of them
    if (slots.length > 1) watcher = this.watch(slots.slice(1), paint);
    return true;
  }

  // A frame only loads once it is in the document, so the new position cannot be made ready
  // before it is shown. The old one stays in the flow and holds the box until it is.
  swap(holder, token) {
    if (!this.body.firstElementChild) { this.body.appendChild(holder); return; }
    holder.addClass('reference-linker-embed-pending');
    this.body.appendChild(holder);
    // Everything else goes, not just the position this one replaces: a turn made while another
    // was still loading leaves its half-drawn holder behind.
    const show = () => {
      if (token !== this.renderId || holder.parentElement !== this.body) return;
      for (const el of Array.from(this.body.children)) if (el !== holder) el.remove();
      holder.removeClass('reference-linker-embed-pending');
    };
    const frames = holder.querySelectorAll('iframe');
    let left = frames.length;
    frames.forEach((f) => f.addEventListener('load', () => { if (--left === 0) show(); }, { once: true }));
    if (!frames.length) requestAnimationFrame(show);
    // A frame the app never loads must not leave the old position on screen for good.
    else setTimeout(show, 1200);
  }

  // Each slot painted when it comes near the viewport. Without IntersectionObserver they are
  // all painted at once, which is what a range did before.
  watch(slots, paint) {
    if (typeof IntersectionObserver !== 'function') {
      slots.forEach((s) => paint(s.el, s.position));
      return null;
    }
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const slot = slots.find((s) => s.el === entry.target);
        io.unobserve(entry.target);
        if (slot) paint(slot.el, slot.position);
      }
    }, { root: this.body, rootMargin: '300px' });
    slots.forEach((s) => io.observe(s.el));
    return io;
  }
}

module.exports = { EmbedViewer };
