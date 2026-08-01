'use strict';

// The one place that knows what a format can do. A handler declares its extensions and
// optionally an outline reader and a preview renderer; everything else asks here.

const fs = require('fs');
const pdf = require('./pdf');
const image = require('./image');
const pptx = require('./pptx');
const html = require('./html');
const text = require('./text');
const epub = require('./epub');
const media = require('./media');
const odf = require('./odf');
const docx = require('./docx');
const xlsx = require('./xlsx');
const csv = require('./csv');

const HANDLERS = [pdf, image, pptx, html, text, epub, media, odf, docx, xlsx, csv];

const byExt = new Map();
for (const h of HANDLERS) for (const e of h.exts) byExt.set(e, h);

const handlerFor = (ext) => byExt.get(String(ext || '').toLowerCase()) || null;

// Extensions with a handler, as ".ext" — what the settings pane offers and what an empty
// `extensions` setting falls back to.
const knownExtensions = () => [...byExt.keys()].map((e) => '.' + e).sort();

// The settings list, one row per format.
const formatGroups = () => HANDLERS.map((h) => ({ id: h.id, exts: h.exts.map((e) => '.' + e) }));

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

// What a position in this format counts: 'time' for a recording, 'page' for everything with
// pages, slides, chapters or headings. It decides which spelling an embed accepts, so the two
// are never confused for one another.
const positionUnit = (ext) => {
  const h = handlerFor(ext);
  return (h && h.positionUnit) || 'page';
};

// How a position reads in a header — "p.5" or "p.3–5" for a paged document, "2:05" for a
// recording. Null when the number would not mean a position to a reader: the whole file, or
// an ordinal format (an HTML heading's "5" is not a page) where the name is already shown.
const positionLabel = (ext, n, to) => {
  if (!(n > 1) && !(to > 1)) return null;
  const h = handlerFor(ext);
  return h && h.positionLabel ? h.positionLabel(n, to) : null;
};

// What an embed's toolbar can offer for this format. A handler that says nothing gets the
// static embed it had before the toolbar existed.
const NO_CAPS = { paged: false, zoomable: false, scrollable: false, timed: false };

function capabilities(ext) {
  const h = handlerFor(ext);
  try {
    const c = h && h.capabilities;
    return Object.assign({}, NO_CAPS, typeof c === 'function' ? c(ext) : c);
  } catch {
    return Object.assign({}, NO_CAPS);
  }
}

const counts = new Map();

// How many positions the file holds, or 0 when the format doesn't count them. Cached against
// the file's mtime: a toolbar asks on every render, and counting can mean reading the file.
async function count(ext, absPath) {
  const h = handlerFor(ext);
  if (!h || !h.count) return 0;
  const key = ext + '|' + absPath;
  let mtimeMs = null;
  try { mtimeMs = fs.statSync(absPath).mtimeMs; } catch { /* gone or unreadable */ }
  const hit = counts.get(key);
  if (hit && hit.mtimeMs === mtimeMs) return hit.n;
  let n = 0;
  try { n = Math.max(0, Math.floor(await h.count(absPath, ext)) || 0); } catch { n = 0; }
  counts.set(key, { mtimeMs, n });
  return n;
}

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
//
// `req.width` is the box to lay out into and `req.zoom` how much larger to draw in it. They
// are two things because a page and a grid disagree: a page redrawn wider is a page zoomed,
// while a sheet redrawn wider is just a wider sheet, and has to be scaled where it stands.
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
  counts.clear();
  for (const h of HANDLERS) {
    if (!h.dispose) continue;
    try { await h.dispose(); } catch { /* going away anyway */ }
  }
}

module.exports = {
  handlerFor,
  knownExtensions,
  formatGroups,
  canOutline,
  canPreview,
  anchorKind,
  anchorFor,
  hasOsAnchor,
  positionUnit,
  positionLabel,
  capabilities,
  count,
  outline,
  render,
  dispose,
};
