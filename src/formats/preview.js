'use strict';

// The preview shared by the text-shaped formats: a heading and the lines under it. Formats
// that rasterise (PDF, images) draw their own thing and don't come here.

const obsidian = require('obsidian');
const { t } = require('../shared/i18n');

const IMAGE_BUDGET = 24 * 1024 * 1024; // total bytes inlined per preview — a glance, not a gallery

// XHTML lets any element close itself; HTML lets only the void ones. An EPUB's `<a id="x"/>`
// therefore parses as an anchor that is never closed, and the rest of the chapter becomes the
// text of that link — which is what a whole preview rendered as one blue link means.
const VOID = /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i;
const expandSelfClosing = (html) => String(html)
  .replace(/<([a-z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)\s*\/>/gi,
    (all, tag, attrs) => (VOID.test(tag) ? all : '<' + tag + attrs + '></' + tag + '>'));
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

// Images inlined as data: URIs rather than blob:. A sandboxed frame cannot reach the parent's
// blob URLs, and file:// is blocked outright, so the bytes have to travel inside the document.
function inlineImagesAsData(html, load) {
  let spent = 0;
  return String(html).replace(/(<img\b[^>]*?\bsrc\s*=\s*)(["'])(.*?)\2/gi, (whole, head, q, src) => {
    if (!src || REMOTE.test(src)) return whole;
    let buf = null;
    try { buf = load(src); } catch { buf = null; }
    if (!buf || spent + buf.length > IMAGE_BUDGET) return head + q + q;
    spent += buf.length;
    return head + q + 'data:' + mimeForImage(src) + ';base64,' + buf.toString('base64') + q;
  });
}

const FRAME_MIN = 80;
const FRAME_MAX = 2000; // where no box says otherwise, as tall as a preview may grow
const FRAME_PAD = 8; // room around loose markup; a page that draws its own sheet asks for none

// A frame taller than its box leaves its own scrollbars below the fold, and a gesture over it
// never reaches what is around it — a middle-click autoscroll does not cross into a frame.
function boxHeight(el) {
  if (typeof getComputedStyle !== 'function') return 0;
  for (let node = el; node; node = node.parentElement) {
    const max = parseFloat(getComputedStyle(node).maxHeight);
    if (Number.isFinite(max) && max > 0) return max;
  }
  return 0;
}

// The page's own stylesheet and markup, untouched; `base` keeps relative links from resolving
// against the app. The zoom comes last, after a page that scales itself to the box.
const frameDoc = (html, css, zoom, pad = FRAME_PAD) => '<!doctype html><html><head><meta charset="utf-8">'
  + '<base target="_blank">'
  // The window scrolls, not the body: its bars would sit at the foot of the whole sheet.
  + '<style>html{overflow:auto}body{margin:0;padding:' + pad + 'px}img,table,pre{max-width:100%}</style>'
  + (css ? '<style>' + String(css) + '</style>' : '')
  + (zoom && zoom !== 1 ? '<style>html{zoom:' + zoom + '}</style>' : '')
  + '</head><body>' + html + '</body></html>';

// Render a document the way a browser would: inside an iframe, which is the only real style
// isolation there is. Obsidian's theme cannot reach in to repaint the page's code blocks, the
// page's CSS cannot reach out to restyle the app, and the markup keeps the classes its own
// stylesheet is written against — none of which survives the HTML sanitizer.
//
// No `allow-scripts`, so nothing in the document executes; `allow-same-origin` only so the
// height can be measured once it has laid out.
function renderFrame(el, { html, css, width, zoom, page, loadImage, onFail }) {
  if (typeof document === 'undefined' || !el.createEl) return false;
  // A page is laid out to exactly the width it was given: padding is width it does not have.
  const pad = page ? 0 : FRAME_PAD;
  let frame;
  try {
    frame = el.createEl('iframe');
    if (!frame) return false;
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.style.width = width + 'px';
    // The frame stays inside its box and scrolls its own document: nothing else can, since a
    // gesture over a frame never reaches what is around it.
    frame.style.maxWidth = '100%';
    frame.style.height = FRAME_MIN + 'px';
    // Whether the app's CSP lets a srcdoc frame load at all can only be learned here. An empty
    // or unreadable frame is a blank hole in the note, so it hands back to the caller's own
    // rendering instead.
    frame.addEventListener('load', () => {
      let body = null;
      try { body = frame.contentDocument && frame.contentDocument.body; } catch { body = null; }
      if (!body || !body.firstChild) {
        try { frame.remove(); } catch { /* already gone */ }
        if (onFail) onFail();
        return;
      }
      // getBoundingClientRect, not scrollHeight: a document scaled with `zoom` to fit the box
      // reports its unscaled height to scrollHeight, and the frame would be twice as tall as
      // what it draws.
      let height = 0;
      try { height = body.getBoundingClientRect().height; } catch { height = 0; }
      const room = boxHeight(el) || FRAME_MAX;
      frame.style.height = Math.max(FRAME_MIN, Math.min(room, (height || body.scrollHeight) + 2 * pad + 2)) + 'px';
    });
    const body = expandSelfClosing(html);
    frame.srcdoc = frameDoc(loadImage ? inlineImagesAsData(body, loadImage) : body, css, zoom, pad);
  } catch {
    if (frame && frame.remove) frame.remove();
    return false;
  }
  return null;
}

let scopeSeq = 0;
const CSS_LIMIT = 256 * 1024;

// A single selector confined to the preview box: html/body/:root become the box itself, the
// universal selector stays inside it, everything else is a descendant of it.
function scopeSelector(sel, scope) {
  const s = sel.trim();
  if (!s || s.startsWith('@')) return '';
  if (/^(?:html|body|:root)$/i.test(s)) return scope;
  const m = /^(?:html|body|:root)\b([\s\S]*)$/i.exec(s);
  if (m) return scope + m[1];
  if (s === '*') return scope + ' *';
  return scope + ' ' + s;
}

// The paper the document is written for, laid down *before* its own CSS so the page overrides
// it when it says so. A stylesheet that sets dark text but no background — common enough —
// would otherwise put black on a dark vault; this guarantees the page is legible on its own
// terms. Rendered PDF pages are white in a dark vault too: a document reads as a document.
const paper = (scope) => scope + '{background:#ffffff;color:#1a1a1a}';

// Rules appended after the page's own, so a stylesheet written for a full window cannot push
// content out of a preview box. They come last, which is what makes them win the tie.
const containment = (scope) => [
  scope + '{max-width:100%;overflow-wrap:anywhere}',
  scope + ' img,' + scope + ' table,' + scope + ' pre,' + scope + ' svg{max-width:100%}',
  scope + ' pre{overflow-x:auto;white-space:pre-wrap}',
  scope + ' table{display:block;overflow-x:auto}',
].join('\n');

// Confine a page's own CSS to one preview box. Without this a page's global `body{…}` or
// `h2{…}` would restyle Obsidian itself, which the review guidelines forbid. Every selector is
// prefixed with a class unique to this render; anything that could escape the box — @media /
// @font-face / @import and the like, fixed/sticky positioning — is dropped or pinned. @media
// is dropped whole, so a preview is never responsive; that is the safe trade.
function scopeCss(css, scope) {
  let text = String(css).slice(0, CSS_LIMIT).replace(/\/\*[\s\S]*?\*\//g, '');
  text = text.replace(/@[\w-]+[^{;]*(?:;|\{(?:[^{}]|\{[^}]*\})*\})/g, '');
  const out = [paper(scope)];
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = rule.exec(text))) {
    const sels = m[1].split(',').map((s) => scopeSelector(s, scope)).filter(Boolean);
    if (!sels.length) continue;
    const decls = m[2].replace(/position\s*:\s*(?:fixed|sticky)/gi, 'position: static').trim();
    if (decls) out.push(sels.join(',') + '{' + decls + '}');
  }
  out.push(containment(scope));
  return out.join('\n');
}

// Markdown and HTML are already documents; showing them as a list of lines throws away the
// headings, lists and code blocks that are half the content. Both routes are feature-detected
// so an older app (and the test stubs) fall back to plain lines rather than breaking.
async function renderMarkdown(el, { markdown, width, zoom, app, component, loadImage }) {
  const R = obsidian.MarkdownRenderer;
  const render = R && (R.render || R.renderMarkdown);
  if (!render || !component) return false;
  const box = el.createDiv({ cls: 'reference-linker-rendered markdown-rendered' });
  box.style.maxWidth = width + 'px';
  scale(box, zoom);
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

// Text has no raster to redraw, so the box itself is scaled — absolute font sizes and all.
function scale(box, zoom) {
  if (zoom && zoom !== 1) box.style.zoom = zoom;
}

function renderHtml(el, { html, width, zoom, loadImage, css }) {
  if (typeof obsidian.sanitizeHTMLToDom !== 'function') return false;
  // A class unique to this render, so one embed's page CSS scopes to its own box and not to
  // every other preview on the page.
  const scopeCls = 'reference-linker-scope-' + (++scopeSeq);
  const scoped = css && typeof document !== 'undefined' ? scopeCss(css, '.' + scopeCls) : '';
  // `markdown-rendered` lends Obsidian's own styling to a document that brought none. A page
  // that brought its stylesheet must not get both: theme rules like
  // `.theme-dark .markdown-rendered pre` outrank `.scope pre` and would repaint the page's
  // light code blocks dark — the document's design has to win inside its own preview.
  const box = el.createDiv({ cls: 'reference-linker-rendered ' + (scoped ? '' : 'markdown-rendered ') + scopeCls });
  box.style.maxWidth = width + 'px';
  scale(box, zoom);
  try {
    // The sanitizer strips <style>, so the scoped CSS is added as a real element it never sees.
    if (scoped) { const style = document.createElement('style'); style.textContent = scoped; box.appendChild(style); }
    box.appendChild(obsidian.sanitizeHTMLToDom(expandSelfClosing(html)));
  } catch {
    box.remove();
    return false;
  }
  return revoker(loadImage ? inlineImages(box, loadImage) : []);
}

function renderLines(el, { title, body, width, zoom }) {
  const box = el.createDiv({ cls: 'reference-linker-doc' });
  box.style.maxWidth = width + 'px';
  scale(box, zoom);
  if (title) box.createDiv({ cls: 'reference-linker-doc-title', text: title });
  for (const line of body || []) box.createDiv({ cls: 'reference-linker-doc-line', text: line });
  if (!title && !(body || []).length) {
    box.createDiv({ cls: 'reference-linker-doc-empty', text: t('preview.empty') });
  }
  return null;
}

module.exports = {
  renderLines, renderMarkdown, renderHtml, renderFrame,
  inlineImages, inlineImagesAsData, frameDoc, scopeCss, expandSelfClosing,
};
