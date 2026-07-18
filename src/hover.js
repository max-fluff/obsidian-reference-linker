'use strict';

// Our own popover, not Obsidian's HoverPopover (which hides as soon as the pointer leaves
// the link), so you can scroll and stay inside the preview. Shows the target PDF page
// (rendered by pdf.js) or the image itself; other file types have no preview.
//
// The shell — timing, placement, the stale-render guard — is shared/popover.js. What is
// ours is the rendering, and the two things it has to clean up after: the opened PDF
// document and the object URL an image preview is shown through.

const nodePath = require('path');
const fs = require('fs');
const { openDocument, renderPageToCanvas } = require('./pdf');
const { Popover } = require('./shared/popover');

const PREVIEW_WIDTH = 420; // CSS px the page/image is shown at

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']);
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif' };

const keyOf = (e) => e.path + ':' + (e.page || e.line || 1);

class HoverPreview {
  constructor(plugin) {
    this.plugin = plugin;
    this.docPath = '';    // cached PDF document, reused across pages of the same file
    this.doc = null;
    this.blobUrl = '';    // object URL of the currently shown image
    this.pop = new Popover({
      cls: 'reference-linker-hover',
      hiddenCls: 'reference-linker-hidden',
      onHide: () => this.revokeBlob(),
      onDestroy: () => {
        this.revokeBlob();
        if (this.doc) { try { this.doc.destroy(); } catch (e) { /* already gone */ } this.doc = null; }
      },
    });
  }

  // Read from onHoverMove to tell "nothing scheduled" from "waiting to show". It lives on
  // the shell now, so it is forwarded rather than duplicated.
  get pendingKey() { return this.pop.pendingKey; }

  isVisible() { return this.pop.isVisible(); }
  contains(node) { return this.pop.contains(node); }
  cancelHide() { this.pop.cancelHide(); }
  leave() { this.pop.leave(); }
  hide() { this.pop.hide(); }
  destroy() { this.pop.destroy(); }

  // Only PDFs and images preview; skip other types so nothing schedules for them.
  previewable(entry) {
    const ext = (entry.lang || '').toLowerCase();
    return ext === 'pdf' || IMAGE_EXT.has(ext);
  }

  schedule(entry, x, y) {
    this.pop.cancelHide();
    if (!this.previewable(entry)) return;
    this.pop.schedule(keyOf(entry), x, y, (el, ctx) => this.build(entry, el, ctx));
  }

  // Open + cache the PDF for `abs`, reusing it while hovering pages of the same file.
  async getDoc(abs) {
    if (this.docPath === abs && this.doc) return this.doc;
    if (this.doc) { try { await this.doc.destroy(); } catch (e) { /* already gone */ } this.doc = null; }
    this.doc = await openDocument(abs);
    this.docPath = this.doc ? abs : '';
    return this.doc;
  }

  async build(entry, el, ctx) {
    const root = this.plugin.codeRoot();
    const abs = root ? nodePath.join(root, entry.path) : entry.path;
    const ext = (entry.lang || '').toLowerCase();

    // Label: the pinned section name when there is one, else the file. Page shown when > 1.
    const page = entry.page || 1;
    const label = entry.title || entry.name;
    el.createDiv({ cls: 'reference-linker-hover-header', text: page > 1 ? label + '  ·  p.' + page : label });
    const body = el.createDiv({ cls: 'reference-linker-hover-body' });

    if (ext === 'pdf') {
      const doc = await this.getDoc(abs);
      if (!ctx.isCurrent() || !doc) return false;
      const canvas = body.createEl('canvas');
      const ok = await renderPageToCanvas(doc, page, canvas, PREVIEW_WIDTH);
      if (!ctx.isCurrent() || !ok) return false;
      return undefined;
    }
    if (IMAGE_EXT.has(ext)) {
      let buf;
      try { buf = fs.readFileSync(abs); } catch (e) { return false; }
      if (!ctx.isCurrent()) return false;
      this.revokeBlob();
      this.blobUrl = URL.createObjectURL(new Blob([buf], { type: MIME[ext] || 'application/octet-stream' }));
      body.createEl('img').src = this.blobUrl;
      return undefined;
    }
    return false;
  }

  revokeBlob() {
    if (this.blobUrl) { try { URL.revokeObjectURL(this.blobUrl); } catch (e) { /* ignore */ } this.blobUrl = ''; }
  }
}

module.exports = { HoverPreview };
