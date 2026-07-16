'use strict';

// Parse "pdf:intro" / "sec:intro" into { kind, ext, name }: leading colon-separated
// prefixes are a kind ("sec") or an indexed extension ("pdf") filter; the first unrecognised
// one starts the name. kinds/exts are Sets of the labels present in the index.
function parseQuery(raw, kinds, exts) {
  const f = { kind: null, ext: null, name: '' };
  const parts = String(raw == null ? '' : raw).split(':');
  let i = 0;
  for (; i < parts.length - 1; i++) {
    const p = parts[i];
    if (kinds && kinds.has(p)) f.kind = p;
    else if (exts && exts.has(p)) f.ext = p;
    else break;
  }
  f.name = parts.slice(i).join(':');
  return f;
}

module.exports = { parseQuery };
