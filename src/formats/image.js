'use strict';

// Images: no outline, no anchor — the whole file is the target. The MIME map only labels the
// Blob so the browser picks a decoder; nothing here inspects the bytes.

const fs = require('fs');

const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
};

async function render(el, req) {
  let buf;
  try {
    buf = fs.readFileSync(req.abs);
  } catch {
    return false;
  }
  if (!req.isCurrent()) return false;
  const url = URL.createObjectURL(new Blob([buf], { type: MIME[req.ext] || 'application/octet-stream' }));
  const img = el.createEl('img');
  img.src = url;
  img.style.maxWidth = req.width + 'px';
  return () => {
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  };
}

module.exports = {
  exts: Object.keys(MIME),
  anchorKind: null,
  render,
};
