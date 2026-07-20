'use strict';

// Audio and video. No outline to read — the position is one the reader chose — but the
// preview is the file itself, seeked to that second, which is as faithful as a preview gets.

const fs = require('fs');
const nodePath = require('path');

const VIDEO = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime', ogv: 'video/ogg' };
const AUDIO = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', opus: 'audio/ogg', aac: 'audio/aac' };

// Reading a film into a Blob would cost its size in memory, so that is the fallback, not the
// first try, and only for files small enough to be worth it.
const BLOB_LIMIT = 96 * 1024 * 1024;

// encodeURI, not per-segment encodeURIComponent: the latter turns the "D:" drive letter into
// "D%3A" and Windows then resolves nothing. buildUri encodes {abs} the same way.
const fileUrl = (abs) => 'file:///' + encodeURI(abs.split(nodePath.sep).join('/').replace(/^\/+/, ''));

function blobFallback(el, abs, ext) {
  let size = 0;
  try {
    size = fs.statSync(abs).size;
  } catch {
    return null;
  }
  if (size > BLOB_LIMIT) return null;
  let buf;
  try {
    buf = fs.readFileSync(abs);
  } catch {
    return null;
  }
  const url = URL.createObjectURL(new Blob([buf], { type: VIDEO[ext] || AUDIO[ext] || 'application/octet-stream' }));
  el.src = url;
  return () => {
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  };
}

async function render(el, req) {
  if (!fs.existsSync(req.abs)) return false;
  const isVideo = !!VIDEO[req.ext];
  const media = el.createEl(isVideo ? 'video' : 'audio');
  media.controls = true;
  media.preload = 'metadata';
  // An explicit width, not width:100%: the popover shrinks to its content, and an <audio>
  // has no intrinsic width, so a percentage resolves against a container that is itself
  // sizing to the audio and collapses it to the controls' minimum.
  media.style.width = req.width + 'px';
  media.style.maxWidth = '100%';

  const at = Math.max(0, (req.page | 0) - (req.page > 1 ? 0 : 1)); // page 1 means "from the start"
  const seek = () => { try { if (at > 0) media.currentTime = at; } catch { /* not seekable */ } };
  media.addEventListener('loadedmetadata', seek, { once: true });

  let release = null;
  // Obsidian's CSP may or may not let a media element load a file:// source; rather than
  // guess, try it and read the failure, falling back to a Blob for a file worth copying.
  media.addEventListener('error', () => {
    if (release) return;
    release = blobFallback(media, req.abs, req.ext);
    if (release) media.addEventListener('loadedmetadata', seek, { once: true });
  }, { once: true });
  media.src = fileUrl(req.abs);

  if (!req.isCurrent()) return false;
  return () => { if (release) release(); };
}

// A position in a recording is a time, not a page: 125 reads as 2:05.
function positionLabel(n) {
  const s = Math.max(0, n | 0);
  const mm = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return mm >= 60 ? Math.floor(mm / 60) + ':' + String(mm % 60).padStart(2, '0') + ':' + ss : mm + ':' + ss;
}

module.exports = {
  exts: [...Object.keys(VIDEO), ...Object.keys(AUDIO)],
  anchorKind: null, // no outline, so nothing writes an anchor; a hand-written #t= still previews
  positionLabel,
  render,
};
