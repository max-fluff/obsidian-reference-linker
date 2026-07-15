'use strict';

// PDF outline reading, on Obsidian's own pdf.js (the documented loadPdfJs() API — no
// bundled copy, no worker setup: Obsidian pre-configures all of that). Used at index
// time to turn a PDF's bookmarks into section entries with page numbers.

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
// when there's no outline, pdf.js is unavailable, or the file can't be parsed — the
// caller then falls back to the file-level entry.
async function readOutline(absPath) {
  const lib = await pdfjsLib();
  if (!lib || typeof lib.getDocument !== 'function') return [];
  let doc = null;
  try {
    const data = new Uint8Array(fs.readFileSync(absPath));
    doc = await lib.getDocument({ data, isEvalSupported: false }).promise;
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
    if (doc) { try { await doc.destroy(); } catch { /* already gone */ } }
  }
}

module.exports = { readOutline };
