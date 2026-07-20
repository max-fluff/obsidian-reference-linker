'use strict';

// The preview shared by the text-shaped formats: a heading and the lines under it. Formats
// that rasterise (PDF, images) draw their own thing and don't come here.

const obsidian = require('obsidian');
const { t } = require('../shared/i18n');

const IMAGE_BUDGET = 24 * 1024 * 1024; // total bytes inlined per preview — a glance, not a gallery
const REMOTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i; // http:, data:, blob:, file:, protocol-relative

const IMAGE_MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif',
};
const mimeForImage = (name) => IMAGE_MIME[(name.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';

// The documents live outside the vault, so a relative <img src> resolves against nothing and
// shows broken. `load(src) -> Buffer|null` reads the referenced bytes (off disk, or out of a
// zip); each becomes a blob URL — the one resource kind Obsidian's CSP lets rendered content
// show, which is why the image preview already works this way. Remote and inline sources are
// left untouched. Returns the URLs to revoke.
function inlineImages(box, load) {
  const urls = [];
  if (!box || !box.querySelectorAll) return urls;
  let spent = 0;
  for (const img of box.querySelectorAll('img')) {
    const src = img.getAttribute && img.getAttribute('src');
    if (!src || REMOTE.test(src)) continue;
    let buf = null;
    try { buf = load(src); } catch { buf = null; }
    if (!buf || spent + buf.length > IMAGE_BUDGET) { if (img.removeAttribute) img.removeAttribute('src'); continue; }
    spent += buf.length;
    const url = URL.createObjectURL(new Blob([buf], { type: mimeForImage(src) }));
    img.src = url;
    urls.push(url);
  }
  return urls;
}

const revoker = (urls) => (urls.length
  ? () => { for (const u of urls) { try { URL.revokeObjectURL(u); } catch { /* ignore */ } } }
  : null);

// Markdown and HTML are already documents; showing them as a list of lines throws away the
// headings, lists and code blocks that are half the content. Both routes are feature-detected
// so an older app (and the test stubs) fall back to plain lines rather than breaking.
async function renderMarkdown(el, { markdown, width, app, component, loadImage }) {
  const R = obsidian.MarkdownRenderer;
  const render = R && (R.render || R.renderMarkdown);
  if (!render || !component) return false;
  const box = el.createDiv({ cls: 'reference-linker-rendered markdown-rendered' });
  box.style.maxWidth = width + 'px';
  try {
    // render(app, md, el, sourcePath, component) is current; renderMarkdown drops the app.
    if (R.render) await R.render(app, markdown, box, '', component);
    else await R.renderMarkdown(markdown, box, '', component);
  } catch {
    box.remove();
    return false;
  }
  return revoker(loadImage ? inlineImages(box, loadImage) : []);
}

function renderHtml(el, { html, width, loadImage }) {
  if (typeof obsidian.sanitizeHTMLToDom !== 'function') return false;
  const box = el.createDiv({ cls: 'reference-linker-rendered markdown-rendered' });
  box.style.maxWidth = width + 'px';
  try {
    box.appendChild(obsidian.sanitizeHTMLToDom(html));
  } catch {
    box.remove();
    return false;
  }
  return revoker(loadImage ? inlineImages(box, loadImage) : []);
}

function renderLines(el, { title, body, width }) {
  const box = el.createDiv({ cls: 'reference-linker-doc' });
  box.style.maxWidth = width + 'px';
  if (title) box.createDiv({ cls: 'reference-linker-doc-title', text: title });
  for (const line of body || []) box.createDiv({ cls: 'reference-linker-doc-line', text: line });
  if (!title && !(body || []).length) {
    box.createDiv({ cls: 'reference-linker-doc-empty', text: t('preview.empty') });
  }
  return null;
}

module.exports = { renderLines, renderMarkdown, renderHtml, inlineImages };
