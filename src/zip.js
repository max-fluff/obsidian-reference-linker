'use strict';

// Minimal ZIP reader over node:zlib, enough for the OOXML/ODF/EPUB family: read the central
// directory, inflate one member by name. No streaming — these are documents, not archives.

const fs = require('fs');
const zlib = require('zlib');

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;
const EOCD_MIN = 22;
const MAX_COMMENT = 0xffff;

// The EOCD sits at the end, behind a comment of unknown length, so it is found by scanning
// back for its signature. The comment can itself contain the signature bytes, so a candidate
// only counts when its own comment-length field accounts for exactly the bytes that follow —
// that is what tells the real record from those four bytes appearing inside the comment.
function findEocd(buf) {
  const start = Math.max(0, buf.length - EOCD_MIN - MAX_COMMENT);
  for (let i = buf.length - EOCD_MIN; i >= start; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG && buf.readUInt16LE(i + 20) === buf.length - i - EOCD_MIN) return i;
  }
  return -1;
}

function readCentral(buf) {
  const eocd = findEocd(buf);
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  // ZIP64 parks 0xffffffff here and puts the real offset in an extra record we do not read.
  if (p === 0xffffffff) return null;
  const out = new Map();
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN_SIG) break;
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const uncompressed = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
    out.set(name, { method, compressed, uncompressed, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

// Sizes come from the central directory, never the local header: with a data descriptor
// (flag bit 3) the local header carries zeroes and slicing by it yields an empty member.
function inflateMember(buf, ent) {
  if (ent.offset + 30 > buf.length || buf.readUInt32LE(ent.offset) !== LOC_SIG) return null;
  const nameLen = buf.readUInt16LE(ent.offset + 26);
  const extraLen = buf.readUInt16LE(ent.offset + 28);
  const start = ent.offset + 30 + nameLen + extraLen;
  const raw = buf.slice(start, start + ent.compressed);
  if (ent.method === 0) return raw;
  if (ent.method !== 8) return null;
  try {
    return zlib.inflateRawSync(raw);
  } catch {
    return null;
  }
}

// A zip opened from disk, or null when it can't be read or isn't a zip. Members are inflated
// on demand and cached, so repeated reads of one document cost one inflate each.
function openZip(absPath) {
  let buf;
  try {
    buf = fs.readFileSync(absPath);
  } catch {
    return null;
  }
  const central = readCentral(buf);
  if (!central) return null;
  const cache = new Map();
  const read = (name) => {
    if (cache.has(name)) return cache.get(name);
    const ent = central.get(name);
    const out = ent ? inflateMember(buf, ent) : null;
    cache.set(name, out);
    return out;
  };
  return {
    names: () => [...central.keys()],
    has: (name) => central.has(name),
    read,
    text: (name) => {
      const b = read(name);
      return b ? b.toString('utf8') : null;
    },
  };
}

module.exports = { openZip };
