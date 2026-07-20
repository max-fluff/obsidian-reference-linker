'use strict';

// Our own popover, not Obsidian's HoverPopover (which hides as soon as the pointer leaves
// the link), so you can scroll and stay inside the preview. What a format draws is the
// format handler's business (see formats/); this owns the shell and the cleanup.
//
// The shell — timing, placement, the stale-render guard — is shared/popover.js.

const nodePath = require('path');
const formats = require('./formats');
const { Popover } = require('./shared/popover');

const PREVIEW_WIDTH = 420; // CSS px the page/image is shown at

const keyOf = (e) => e.path + ':' + (e.page || e.line || 1);

class HoverPreview {
  constructor(plugin) {
    this.plugin = plugin;
    this.cleanup = null;  // releases whatever the last render held (an object URL, say)
    this.pop = new Popover({
      cls: 'reference-linker-hover',
      hiddenCls: 'reference-linker-hidden',
      onHide: () => this.release(),
      onDestroy: () => this.release(),
    });
  }

  // Read from onHoverMove to tell "nothing scheduled" from "waiting to show".
  get pendingKey() { return this.pop.pendingKey; }

  isVisible() { return this.pop.isVisible(); }
  contains(node) { return this.pop.contains(node); }
  cancelHide() { this.pop.cancelHide(); }
  leave() { this.pop.leave(); }
  hide() { this.pop.hide(); }
  destroy() { this.pop.destroy(); }

  // Skip types no handler can draw, so nothing schedules for them.
  previewable(entry) {
    return formats.canPreview(entry.lang);
  }

  schedule(entry, x, y) {
    this.pop.cancelHide();
    if (!this.previewable(entry)) return;
    this.pop.schedule(keyOf(entry), x, y, (el, ctx) => this.build(entry, el, ctx));
  }

  async build(entry, el, ctx) {
    const root = this.plugin.codeRoot();
    const abs = root ? nodePath.join(root, entry.path) : entry.path;
    const ext = (entry.lang || '').toLowerCase();

    // Label: the pinned section name when there is one, else the file. The position — a page
    // or a timecode, per format — is shown only when it isn't the top of the file.
    const page = entry.page || 1;
    const label = entry.title || entry.name;
    const pos = formats.positionLabel(ext, page);
    el.createDiv({ cls: 'reference-linker-hover-header', text: pos ? label + '  ·  ' + pos : label });
    const body = el.createDiv({ cls: 'reference-linker-hover-body' });

    this.release();
    const cleanup = await formats.render(body, {
      abs,
      ext,
      page,
      width: PREVIEW_WIDTH,
      app: this.plugin.app,
      component: this.plugin,
      isCurrent: () => ctx.isCurrent(),
    });
    if (cleanup === false) return false;
    this.cleanup = cleanup || null;
    return undefined;
  }

  release() {
    if (this.cleanup) { try { this.cleanup(); } catch (e) { /* ignore */ } this.cleanup = null; }
  }
}

module.exports = { HoverPreview };
