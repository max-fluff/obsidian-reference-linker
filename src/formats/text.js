'use strict';

// Plain text and markdown living outside the vault — a README in a sibling repo, notes kept
// elsewhere. Headings become sections on their line; the preview is the text itself, which
// is the whole content and not a stand-in for it.

const fs = require('fs');
const { isFenceLine } = require('../shared/markdown');
const { renderLines, renderMarkdown } = require('./preview');
const { assetLoader } = require('./html');

const ATX = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const SETEXT = /^(=+|-{2,})\s*$/;
const MAX_LINES = 60;

function readLines(absPath) {
  try {
    return fs.readFileSync(absPath, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  } catch {
    return null;
  }
}

// Headings with their 1-based line. A fenced block is skipped whole: `# not a heading` is
// ordinary shell in a bash example, and indexing it would put noise in every suggestion list.
function headings(lines) {
  const out = [];
  let fenced = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isFenceLine(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const atx = ATX.exec(line);
    if (atx) { out.push({ title: atx[2].trim(), page: i + 1 }); continue; }
    // Setext underlines the line above, so the heading is that line, not this one.
    if (SETEXT.test(line) && i > 0) {
      const above = lines[i - 1].trim();
      if (above && !ATX.test(above) && !isFenceLine(above)) out.push({ title: above, page: i });
    }
  }
  return out;
}

async function readOutline(absPath) {
  const lines = readLines(absPath);
  return lines ? headings(lines) : [];
}

// One section: from its heading to the line before the next one. With no headings at all the
// file previews from the top, which is what a loose .txt wants.
async function readSection(absPath, page) {
  const lines = readLines(absPath);
  if (!lines) return null;
  const hs = headings(lines);
  if (!hs.length) {
    return { title: '', body: lines.map((l) => l.trimEnd()).filter(Boolean).slice(0, MAX_LINES), page: 1, total: 1 };
  }
  const n = Math.min(Math.max(1, page | 0), lines.length);
  let at = hs.findIndex((h) => h.page === n);
  if (at < 0) at = 0;
  const here = hs[at];
  const next = hs[at + 1];
  const slice = lines.slice(here.page, next ? next.page - 1 : lines.length).map((l) => l.trimEnd());
  const body = slice.filter(Boolean);
  return {
    title: here.title,
    body: body.slice(0, MAX_LINES),
    raw: slice.slice(0, MAX_LINES).join('\n'),
    page: here.page,
    total: hs.length,
  };
}

const MARKDOWN = new Set(['md', 'markdown']);

async function render(el, req) {
  const sec = await readSection(req.abs, req.page);
  if (!req.isCurrent() || !sec) return false;
  if (MARKDOWN.has(req.ext) && sec.raw !== undefined) {
    const md = (sec.title ? '## ' + sec.title + '\n\n' : '') + sec.raw;
    const done = await renderMarkdown(el, {
      markdown: md, width: req.width, app: req.app, component: req.component, loadImage: assetLoader(req.abs),
    });
    if (done !== false) return done;
  }
  return renderLines(el, { title: sec.title, body: sec.body, width: req.width });
}

module.exports = {
  exts: ['md', 'markdown', 'txt', 'text', 'log'],
  anchorKind: null, // no viewer honours a position in a text file
  outline: readOutline,
  render,
  readOutline,
  readSection,
};
