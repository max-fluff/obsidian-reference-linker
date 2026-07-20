'use strict';

// PDF handler over Obsidian's pdf.js. One document is kept open at a time: hovering pages of
// the same file is the common case, and reopening per page made every hover re-read the file.

const { openDocument, readOutline, renderPageToCanvas } = require('../pdf');

let openPath = '';
let openDoc = null;

async function dispose() {
  if (openDoc) {
    try { await openDoc.destroy(); } catch { /* already gone */ }
  }
  openPath = '';
  openDoc = null;
}

async function getDoc(absPath) {
  if (openPath === absPath && openDoc) return openDoc;
  await dispose();
  const doc = await openDocument(absPath);
  if (doc) { openPath = absPath; openDoc = doc; }
  return doc;
}

async function render(el, req) {
  const doc = await getDoc(req.abs);
  if (!req.isCurrent() || !doc) return false;
  const canvas = el.createEl('canvas');
  const ok = await renderPageToCanvas(doc, req.page, canvas, req.width);
  if (!req.isCurrent() || !ok) return false;
  return null;
}

module.exports = {
  exts: ['pdf'],
  anchorKind: 'page',
  anchorFor: (e) => (e.kind === 'section' && e.page ? 'page=' + e.page : null),
  outline: readOutline,
  render,
  dispose,
};
