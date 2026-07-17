'use strict';

// Our own popover, not Obsidian's HoverPopover (which hides as soon as the pointer leaves
// the link), so you can scroll and stay inside the preview. Shows the target PDF page
// (rendered by pdf.js) or the image itself; other file types have no preview.

const nodePath = require('path');
const fs = require('fs');
const { openDocument, renderPageToCanvas } = require('./pdf');

const SHOW_DELAY = 200;
const HIDE_GRACE = 250;
const PREVIEW_WIDTH = 420; // CSS px the page/image is shown at

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']);
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif' };

const keyOf = (e) => e.path + ':' + (e.page || e.line || 1);

class HoverPreview {
  constructor(plugin) {
    this.plugin = plugin;
    this.el = null;
    this.timer = null;
    this.hideTimer = null;
    this.key = '';        // what's currently shown
    this.pendingKey = ''; // what's scheduled next
    this.token = 0;       // guards against a stale async render revealing itself
    this.docPath = '';    // cached PDF document, reused across pages of the same file
    this.doc = null;
    this.blobUrl = '';    // object URL of the currently shown image
  }

  ensureEl() {
    if (!this.el) {
      this.el = document.body.createDiv({ cls: 'reference-linker-hover reference-linker-hidden' });
      this.el.addEventListener('mouseenter', () => this.cancelHide());
      this.el.addEventListener('mouseleave', () => this.leave());
    }
    return this.el;
  }

  isVisible() { return !!this.el && !this.el.classList.contains('reference-linker-hidden'); }
  contains(node) { return !!this.el && !!node && this.el.contains(node); }
  cancelHide() { clearTimeout(this.hideTimer); this.hideTimer = null; }

  // Only PDFs and images preview; skip other types so nothing schedules for them.
  previewable(entry) {
    const ext = (entry.lang || '').toLowerCase();
    return ext === 'pdf' || IMAGE_EXT.has(ext);
  }

  schedule(entry, x, y) {
    this.cancelHide();
    if (!this.previewable(entry)) return;
    const key = keyOf(entry);
    if (key === this.key && this.isVisible()) return;
    if (key === this.pendingKey) return;
    this.pendingKey = key;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.pendingKey = ''; this.show(entry, x, y); }, SHOW_DELAY);
  }

  leave() {
    if (this.hideTimer) return;
    this.hideTimer = setTimeout(() => this.hide(), HIDE_GRACE);
  }

  // Open + cache the PDF for `abs`, reusing it while hovering pages of the same file.
  async getDoc(abs) {
    if (this.docPath === abs && this.doc) return this.doc;
    if (this.doc) { try { await this.doc.destroy(); } catch { /* already gone */ } this.doc = null; }
    this.doc = await openDocument(abs);
    this.docPath = this.doc ? abs : '';
    return this.doc;
  }

  async show(entry, x, y) {
    const root = this.plugin.codeRoot();
    const abs = root ? nodePath.join(root, entry.path) : entry.path;
    const ext = (entry.lang || '').toLowerCase();
    const token = ++this.token; // any newer show()/hide() invalidates this render

    const el = this.ensureEl();
    el.empty();
    // Label: the pinned section name when there is one, else the file. Page shown when > 1.
    const page = entry.page || 1;
    const label = entry.title || entry.name;
    const header = page > 1 ? label + '  ·  p.' + page : label;
    el.createDiv({ cls: 'reference-linker-hover-header', text: header });
    const body = el.createDiv({ cls: 'reference-linker-hover-body' });

    if (ext === 'pdf') {
      const doc = await this.getDoc(abs);
      if (token !== this.token || !doc) return;
      const canvas = body.createEl('canvas');
      const ok = await renderPageToCanvas(doc, entry.page || 1, canvas, PREVIEW_WIDTH);
      if (token !== this.token || !ok) return;
    } else if (IMAGE_EXT.has(ext)) {
      let buf;
      try { buf = fs.readFileSync(abs); } catch { return; }
      if (token !== this.token) return;
      this.revokeBlob();
      this.blobUrl = URL.createObjectURL(new Blob([buf], { type: MIME[ext] || 'application/octet-stream' }));
      body.createEl('img').src = this.blobUrl;
    } else {
      return;
    }

    this.key = keyOf(entry);
    // Reveal off-screen to measure, then place near the cursor, flipping on overflow.
    el.style.visibility = 'hidden';
    el.style.left = '-9999px';
    el.style.top = '0px';
    el.removeClass('reference-linker-hidden');
    const r = el.getBoundingClientRect();
    const pad = 12;
    let left = x + pad;
    let top = y + pad;
    if (left + r.width > window.innerWidth - pad) left = Math.max(pad, x - pad - r.width);
    if (top + r.height > window.innerHeight - pad) top = Math.max(pad, y - pad - r.height);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.visibility = 'visible';
  }

  revokeBlob() {
    if (this.blobUrl) { try { URL.revokeObjectURL(this.blobUrl); } catch { /* ignore */ } this.blobUrl = ''; }
  }

  hide() {
    clearTimeout(this.timer);
    clearTimeout(this.hideTimer);
    this.hideTimer = null;
    this.pendingKey = '';
    this.key = '';
    this.token++;
    this.revokeBlob();
    if (this.el) { this.el.addClass('reference-linker-hidden'); this.el.empty(); }
  }

  destroy() {
    clearTimeout(this.timer);
    clearTimeout(this.hideTimer);
    this.revokeBlob();
    if (this.doc) { try { this.doc.destroy(); } catch { /* already gone */ } this.doc = null; }
    if (this.el) { this.el.remove(); this.el = null; }
  }
}

module.exports = { HoverPreview };
