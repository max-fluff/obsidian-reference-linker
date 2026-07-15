'use strict';

// Parse "py:def:Foo.bar" into { lang, kind, container, name }: colon-separated
// prefixes are language/kind filters (the first unrecognised one starts the name),
// and the name's trailing ".Foo" is a same-file container (co-location).
// resolveLang(token) -> language id | null; kinds is a Set of kind labels.
function parseQuery(raw, resolveLang, kinds) {
  const f = { lang: null, kind: null, container: null, name: '' };
  const parts = String(raw == null ? '' : raw).split(':');
  let i = 0;
  for (; i < parts.length - 1; i++) {
    const id = resolveLang(parts[i]);
    if (id) f.lang = id;
    else if (kinds.has(parts[i])) f.kind = parts[i];
    else break;
  }
  const segs = parts.slice(i).join(':').split('.');
  f.name = segs[segs.length - 1];
  if (segs.length > 1 && segs[segs.length - 2]) f.container = segs[segs.length - 2];
  return f;
}

module.exports = { parseQuery };
