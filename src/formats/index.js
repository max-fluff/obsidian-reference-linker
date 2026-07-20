'use strict';

// The one place that knows what a format can do. A handler declares its extensions and
// optionally an outline reader and a preview renderer; everything else asks here.

const pdf = require('./pdf');
const image = require('./image');
const pptx = require('./pptx');
const html = require('./html');
const text = require('./text');
const epub = require('./epub');
const media = require('./media');
const odf = require('./odf');

const HANDLERS = [pdf, image, pptx, html, text, epub, media, odf];

const byExt = new Map();
for (const h of HANDLERS) for (const e of h.exts) byExt.set(e, h);

const handlerFor = (ext) => byExt.get(String(ext || '').toLowerCase()) || null;

// Extensions with a handler, as ".ext" — what the settings pane offers and what an empty
// `extensions` setting falls back to.
const knownExtensions = () => [...byExt.keys()].map((e) => '.' + e).sort();

const canOutline = (ext) => {
  const h = handlerFor(ext);
  return !!(h && h.outline);
};

const canPreview = (ext) => {
  const h = handlerFor(ext);
  return !!(h && h.render);
};

// What a link into this format stores to say where in the file it lands: 'page' for a
// #page= number, 'id' for a named fragment, null when nothing survives being handed to the
// OS. Whoever judges drift has to compare like with like, or every link reads as moved.
const anchorKind = (ext) => {
  const h = handlerFor(ext);
  return (h && h.anchorKind) || null;
};

// The fragment a link to this entry carries, without the '#', or null for none. Per entry,
// not per format: an HTML heading with no id sits in a file whose other headings anchor fine.
const anchorFor = (entry) => {
  const h = handlerFor(entry && entry.lang);
  if (!h || !h.anchorFor) return null;
  return h.anchorFor(entry) || null;
};

// Whether a link into this format stores a position at all. False means the anchor is ours
// alone: the preview honours it, an external open lands at the top of the file.
const hasOsAnchor = (ext) => anchorKind(ext) !== null;

// How a position reads in a header — "p. 5" for a paged document, "2:05" for a recording.
// Null when the position is not worth showing (a whole file, page 1).
const positionLabel = (ext, n) => {
  if (!(n > 1)) return null;
  const h = handlerFor(ext);
  return h && h.positionLabel ? h.positionLabel(n) : 'p.' + n;
};

async function outline(ext, absPath) {
  const h = handlerFor(ext);
  if (!h || !h.outline) return [];
  try {
    // ext is passed too, for a handler (ODF) whose extensions share one reader.
    return await h.outline(absPath, ext);
  } catch {
    return [];
  }
}

// Draw a preview into `el`. Returns a cleanup function, or false when nothing was drawn —
// the caller shows its own "unreadable" notice then.
async function render(el, req) {
  const h = handlerFor(req.ext);
  if (!h || !h.render) return false;
  try {
    return await h.render(el, req);
  } catch {
    return false;
  }
}

// Called from onunload, which cannot await: a throw here would surface as an unhandled
// rejection long after the plugin is gone.
async function dispose() {
  for (const h of HANDLERS) {
    if (!h.dispose) continue;
    try { await h.dispose(); } catch { /* going away anyway */ }
  }
}

module.exports = {
  handlerFor,
  knownExtensions,
  canOutline,
  canPreview,
  anchorKind,
  anchorFor,
  hasOsAnchor,
  positionLabel,
  outline,
  render,
  dispose,
};
