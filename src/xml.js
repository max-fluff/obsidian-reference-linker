'use strict';

// Just enough XML for the document formats: pull balanced elements out, read an attribute,
// flatten text. Not a parser — it never validates, and it assumes the well-formed XML that
// OOXML/ODF/EPUB producers emit.

// XML defines five named entities; the document formats (EPUB XHTML especially) lean on the
// common HTML ones too, so the table carries those — left raw they show up verbatim in a
// title or preview. It is the common set, not the full HTML list.
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: ' ', shy: '­', ensp: ' ', emsp: ' ', thinsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', bull: '•', middot: '·', dagger: '†',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
  copy: '©', reg: '®', trade: '™', sect: '§', para: '¶', deg: '°',
  larr: '←', rarr: '→', harr: '↔', times: '×', minus: '−', plusmn: '±',
  ne: '≠', le: '≤', ge: '≥', euro: '€', pound: '£', yen: '¥', cent: '¢',
};

function decodeEntities(s) {
  return String(s).replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (m, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      // fromCodePoint throws past U+10FFFF; a malformed &#99999999; must not abort the file.
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    const hit = ENTITIES[body.toLowerCase()];
    return hit === undefined ? m : hit;
  });
}

// Every `<tag …>…</tag>` at any depth, as raw source including the tags. Self-closing
// elements are yielded too, so a caller counting shapes doesn't miss the empty ones.
function elements(xml, tag) {
  const out = [];
  const open = new RegExp('<' + tag + '(?=[\\s/>])', 'g');
  let m;
  while ((m = open.exec(xml))) {
    const end = scanElement(xml, m.index, tag);
    if (end < 0) break;
    out.push(xml.slice(m.index, end));
    open.lastIndex = end;
  }
  return out;
}

// Index just past the element opening at `start`, tracking nesting of the same tag.
function scanElement(xml, start, tag) {
  const open = '<' + tag;
  const close = '</' + tag + '>';
  let depth = 0;
  let i = start;
  while (i >= 0 && i < xml.length) {
    if (xml.startsWith(close, i)) {
      const gt = xml.indexOf('>', i);
      if (gt < 0) return -1;
      if (--depth === 0) return gt + 1;
      i = gt + 1;
    } else if (xml.startsWith(open, i)) {
      // "<p:sp" must not match "<p:spPr": only a delimiter may follow the name.
      if (!/[\s/>]/.test(xml[i + open.length] || '')) { i += open.length; continue; }
      const gt = xml.indexOf('>', i);
      if (gt < 0) return -1;
      if (xml[gt - 1] === '/') { if (depth === 0) return gt + 1; } else depth++;
      i = gt + 1;
    } else {
      const a = xml.indexOf(open, i);
      const b = xml.indexOf(close, i);
      if (a < 0 && b < 0) return -1;
      i = a < 0 ? b : b < 0 ? a : Math.min(a, b);
    }
  }
  return -1;
}

// Both quote styles: single quotes are well-formed XML and some EPUB/ODF producers emit them,
// and a load-bearing attribute like full-path missed would fail the whole document.
function attr(source, name) {
  const m = new RegExp('\\s' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')').exec(source);
  if (!m) return null;
  return decodeEntities(m[1] !== undefined ? m[1] : m[2]);
}

// Concatenated text of every `<tag>` in source, in document order.
function textIn(source, tag) {
  const re = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'g');
  let out = '';
  let m;
  while ((m = re.exec(source))) out += decodeEntities(m[1]);
  return out;
}

module.exports = { decodeEntities, elements, attr, textIn };
