'use strict';

// Small shared primitives for the format handlers, so the same one-liners don't drift across
// pptx / html / epub / odf / text.

// A 1-based page clamped into a document's range — every handler resolves a requested page
// this way before reading it.
const clampPage = (page, total) => Math.min(Math.max(1, page | 0), total);

// Collapse '.' / '..' / empty segments in a POSIX path inside an archive. Each format keeps
// its own base convention (OOXML rels resolve against the part's folder, EPUB hrefs against
// the document's) and hands the joined path here.
function normPath(pathStr) {
  const out = [];
  for (const seg of String(pathStr).split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop(); else out.push(seg);
  }
  return out.join('/');
}

// The file part of an <img src>: the query and fragment dropped, percent-escapes decoded.
const assetSrc = (src) => decodeURIComponent(String(src).split(/[?#]/)[0]);

module.exports = { clampPage, normPath, assetSrc };
