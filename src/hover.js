'use strict';

// Our own popover, not Obsidian's HoverPopover (which hides as soon as the pointer
// leaves the link), so you can scroll and select inside the preview.

const nodePath = require('path');
const { readLines, renderCode } = require('./render');

const SHOW_DELAY = 200;
const HIDE_GRACE = 250;

const keyOf = (e) => e.path + ':' + e.line;

class HoverPreview {
  constructor(plugin) {
    this.plugin = plugin;
    this.el = null;
    this.timer = null;
    this.hideTimer = null;
    this.key = '';        // path:line currently shown
    this.pendingKey = ''; // path:line scheduled next
  }

  ensureEl() {
    if (!this.el) {
      this.el = document.body.createDiv({ cls: 'reference-linker-hover reference-linker-code reference-linker-hidden' });
      this.el.addEventListener('mouseenter', () => this.cancelHide());
      this.el.addEventListener('mouseleave', () => this.leave());
    }
    return this.el;
  }

  isVisible() { return !!this.el && !this.el.classList.contains('reference-linker-hidden'); }
  contains(node) { return !!this.el && !!node && this.el.contains(node); }
  cancelHide() { clearTimeout(this.hideTimer); this.hideTimer = null; }

  schedule(entry, x, y) {
    this.cancelHide();
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

  async show(entry, x, y) {
    const s = this.plugin.settings;
    const root = this.plugin.codeRoot();
    const abs = root ? nodePath.join(root, entry.path) : entry.path;
    const line = entry.line || 1;
    // Negative means no limit in that direction — read to the file edge.
    const before = s.hoverBefore < 0 ? Infinity : Math.max(0, s.hoverBefore | 0);
    const after = s.hoverAfter < 0 ? Infinity : Math.max(0, s.hoverAfter | 0);
    const snippet = await readLines(abs, line - before, line + after);
    if (!snippet) return;

    this.key = keyOf(entry);
    const el = this.ensureEl();
    el.empty();
    el.createDiv({ cls: 'reference-linker-hover-header', text: keyOf(entry) });
    const body = el.createDiv({ cls: 'reference-linker-hover-body' });

    const idx = Math.min(Math.max(0, line - snippet.startLine), snippet.lines.length - 1);
    const band = body.createDiv({ cls: 'reference-linker-hover-band' });
    band.style.top = 'calc(var(--cl-lh) * ' + idx + ')';

    await renderCode(body, snippet.lines.join('\n'), this.plugin.prismIdFor(entry.lang));

    // Reveal (display via CSS class) but keep it invisible and off-screen while we
    // measure, then place near the cursor, flipping when it would overflow. The final
    // coordinates are dynamic, so left/top stay inline.
    el.style.visibility = 'hidden';
    el.style.left = '-9999px';
    el.style.top = '0px';
    el.removeClass('reference-linker-hidden');
    body.scrollTop = Math.max(0, band.offsetTop - (body.clientHeight - band.offsetHeight) / 2); // center the target line
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

  hide() {
    clearTimeout(this.timer);
    clearTimeout(this.hideTimer);
    this.hideTimer = null;
    this.pendingKey = '';
    this.key = '';
    if (this.el) { this.el.addClass('reference-linker-hidden'); this.el.empty(); }
  }

  destroy() {
    clearTimeout(this.timer);
    clearTimeout(this.hideTimer);
    if (this.el) { this.el.remove(); this.el = null; }
  }
}

module.exports = { HoverPreview };
