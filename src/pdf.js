'use strict';

// PDF work on Obsidian's own pdf.js (the documented loadPdfJs() API — no bundled copy,
// no worker setup: Obsidian pre-configures all of that). Used to read a PDF's outline at
// index time and to render a page to a canvas for the in-app page view (and, later, hover
// previews and embeds).

const obsidian = require('obsidian');
const fs = require('fs');

// loadPdfJs() resolves the shared window.pdfjsLib; cache the promise so we load once.
let libPromise = null;
function pdfjsLib() {
  if (!libPromise) {
    libPromise = typeof obsidian.loadPdfJs === 'function'
      ? obsidian.loadPdfJs().catch(() => null)
      : Promise.resolve(null);
  }
  return libPromise;
}

// Open a PDF from disk, or null when pdf.js is unavailable or the file can't be read.
// The caller must destroy() the returned document.
async function openDocument(absPath) {
  const lib = await pdfjsLib();
  if (!lib || typeof lib.getDocument !== 'function') return null;
  try {
    const data = new Uint8Array(fs.readFileSync(absPath));
    return await lib.getDocument({ data, isEvalSupported: false }).promise;
  } catch {
    return null;
  }
}

// An outline item's destination resolved to a 1-based page number, or null.
async function pageOf(doc, dest) {
  try {
    let d = dest;
    if (typeof d === 'string') d = await doc.getDestination(d);
    if (!Array.isArray(d) || !d[0]) return null;
    return (await doc.getPageIndex(d[0])) + 1;
  } catch {
    return null;
  }
}

// A PDF's outline flattened to [{ title, page }] (1-based, in reading order). Returns []
// when there's no outline or the file can't be parsed — the caller then falls back to the
// file-level entry.
async function readOutline(absPath) {
  const doc = await openDocument(absPath);
  if (!doc) return [];
  try {
    const outline = await doc.getOutline();
    if (!outline || !outline.length) return [];
    const out = [];
    const walk = async (items) => {
      for (const it of items) {
        const page = await pageOf(doc, it.dest);
        const title = it.title && it.title.trim();
        if (title && page) out.push({ title, page });
        if (it.items && it.items.length) await walk(it.items);
      }
    };
    await walk(outline);
    return out;
  } catch {
    return [];
  } finally {
    try { await doc.destroy(); } catch { /* already gone */ }
  }
}

// Render page `pageNum` of an open document into `canvas`, sized to `cssWidth` CSS px wide
// (height follows the page aspect), rasterised at devicePixelRatio for sharpness. Returns
// true on success.
async function renderPageToCanvas(doc, pageNum, canvas, cssWidth) {
  try {
    const n = Math.min(Math.max(1, pageNum | 0), doc.numPages);
    const page = await doc.getPage(n);
    const unit = page.getViewport({ scale: 1 });
    const dpr = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: (cssWidth / unit.width) * dpr });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = (viewport.width / dpr) + 'px';
    canvas.style.height = (viewport.height / dpr) + 'px';
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    page.cleanup();
    return true;
  } catch {
    return false;
  }
}

module.exports = { openDocument, readOutline, renderPageToCanvas };
