'use strict';

const { splitLines } = require('./shared/markdown');

const PRESETS = {
  // {root} keeps the note portable: the file holds a relative path, the absolute
  // reference root is filled in on render/click. Opens in the OS default app.
  file: 'file:///{root}/{path}',
};

const DEFAULT_SETTINGS = {
  // @@ is Code Linker's default; @! avoids a clash when both are installed.
  trigger: '@!',
  uriTemplate: PRESETS.file,
  codeRoot: '', // empty => parent folder of the vault
  scanRoots: '', // one path per line, relative to codeRoot
  extensions: '', // e.g. ".pdf .docx .png"; empty => nothing indexed
  skipDirs: '.git\nnode_modules\n.obsidian', // one folder name per line
  editors: [], // user-defined viewer presets, each { name, template }
  hiddenPresets: [], // presets kept out of the pickers
  presetsInitialized: false,
  recentPresets: [], // preset keys, most-recent first, to float recent picks up the picker
  askOnInsert: true, // ask which viewer format to use on every insert (vs. a fixed preset)
  showStatusBar: false, // show the active viewer preset in the status bar, click to switch
  disabledKinds: [], // "<ext>:<kind>" keys hidden from suggestions (query-time filter)
  autoRefresh: true, // watch scan folders and rebuild the index when files change
  hoverPreview: true, // show the preview popover when hovering a reference link
  hoverBefore: 3,
  hoverAfter: 20,
  markStaleLinks: true, // underline links whose target file is gone
  minChars: 1,
  maxResults: 12,
  contextMenu: true, // the "Convert"/"Find and open" items in the editor right-click menu
};

// Parse the extensions field into a Set of normalized ".ext" (lowercase). Accepts
// whitespace-, comma- or newline-separated tokens, with or without a leading dot.
function parseExtensions(raw) {
  const out = new Set();
  for (const tok of String(raw || '').split(/[\s,]+/)) {
    const t = tok.trim().toLowerCase();
    if (!t) continue;
    out.add(t[0] === '.' ? t : '.' + t);
  }
  return out;
}

// Split the skip list into two matchers: bare names (skipped at any depth) and
// reference-root-relative paths with a slash (that exact folder only).
function parseSkip(skipDirs) {
  const names = new Set();
  const paths = new Set();
  for (const raw of splitLines(skipDirs)) {
    const s = raw.split('\\').join('/').replace(/^\.?\//, '').replace(/\/+$/, '');
    if (!s) continue;
    if (s.includes('/')) paths.add(s); else names.add(s);
  }
  return { names, paths };
}

// Whether a reference-root-relative path is under the skip list: any path segment is a
// skipped name, or the path (or an ancestor) is a skipped path.
function underSkip(rel, skip) {
  const segs = rel.split('/').filter(Boolean);
  for (const s of segs) if (skip.names.has(s)) return true;
  if (skip.paths.size) {
    let acc = '';
    for (const seg of segs) { acc = acc ? acc + '/' + seg : seg; if (skip.paths.has(acc)) return true; }
  }
  return false;
}

// Whether a relative path appears in a (decoded, forward-slashed) link target at a
// segment boundary — so "a.pdf" doesn't falsely match the tail of "docs/a.pdf".
function pathInTarget(dec, p) {
  let from = 0, i;
  while ((i = dec.indexOf(p, from)) !== -1) {
    if (i === 0 || dec[i - 1] === '/') return true;
    from = i + 1;
  }
  return false;
}

module.exports = { PRESETS, DEFAULT_SETTINGS, parseExtensions, parseSkip, underSkip, pathInTarget };
