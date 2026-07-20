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
// encodeURI keeps the "D:" drive colon (per-segment encoding turns it into %3A and Windows
// resolves nothing) but leaves # and ? — in a file name those would start a fragment/query
// and point at the wrong file, so encode them too.
const fileUrl = (abs) => 'file:///'
  + encodeURI(abs.split(nodePath.sep).join('/').replace(/^\/+/, '')).replace(/#/g, '%23').replace(/\?/g, '%3F');

// Returns the blob URL it set on `el`, or '' when the file can't or shouldn't be copied. The
// caller owns the URL — this used to return its own cleanup, but the error handler that calls
// it can fire after the preview is gone, orphaning that closure and leaking the blob.
function blobFallback(el, abs, ext) {
  let size = 0;
  try {
    size = fs.statSync(abs).size;
  } catch {
    return '';
  }
  if (size > BLOB_LIMIT) return '';
  let buf;
  try {
    buf = fs.readFileSync(abs);
  } catch {
    return '';
  }
  const url = URL.createObjectURL(new Blob([buf], { type: VIDEO[ext] || AUDIO[ext] || 'application/octet-stream' }));
  el.src = url;
  return url;
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

  let blobUrl = '';
  let disposed = false;
  // Reachable from both the returned cleanup and the not-current path below, so the blob the
  // async error handler may mint can never outlive the preview.
  const dispose = () => {
    disposed = true;
    if (blobUrl) { try { URL.revokeObjectURL(blobUrl); } catch { /* ignore */ } blobUrl = ''; }
    try { media.removeAttribute('src'); } catch { /* ignore */ }
  };

  // Obsidian's CSP may or may not let a media element load a file:// source; rather than
  // guess, try it and read the failure, falling back to a Blob for a file worth copying.
  media.addEventListener('error', () => {
    if (disposed || blobUrl) return;
    blobUrl = blobFallback(media, req.abs, req.ext);
    if (blobUrl) media.addEventListener('loadedmetadata', seek, { once: true });
  }, { once: true });
  media.src = fileUrl(req.abs);

  if (!req.isCurrent()) { dispose(); return false; }
  return dispose;
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
