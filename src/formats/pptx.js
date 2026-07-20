'use strict';

// PowerPoint: slides are pages, so the whole page/section model carries over from PDF
// unchanged. Titles come from the title placeholder, order from sldIdLst.

const { openZip } = require('../zip');
const { elements, attr, textIn } = require('../xml');
const { renderLines } = require('./preview');
const { clampPage, normPath } = require('./util');

const SLIDE_RE = /^ppt\/slides\/slide(\d+)\.xml$/;
const TITLE_PH = new Set(['title', 'ctrTitle']);

// A relationship target is relative to ppt/, and PowerPoint writes some as "../slides/…".
const resolveTarget = (target) => normPath('ppt/' + String(target).replace(/^\/+/, ''));

// Presentation order, not file order: slide7.xml may well be the second slide shown.
function slideParts(zip) {
  const pres = zip.text('ppt/presentation.xml');
  const rels = zip.text('ppt/_rels/presentation.xml.rels');
  if (pres && rels) {
    const targets = new Map();
    for (const r of elements(rels, 'Relationship')) {
      const id = attr(r, 'Id');
      const tgt = attr(r, 'Target');
      if (id && tgt) targets.set(id, resolveTarget(tgt));
    }
    const lst = elements(pres, 'p:sldIdLst')[0];
    if (lst) {
      const out = [];
      for (const s of elements(lst, 'p:sldId')) {
        const tgt = targets.get(attr(s, 'r:id'));
        if (tgt && zip.has(tgt)) out.push(tgt);
      }
      if (out.length) return out;
    }
  }
  return zip.names()
    .filter((n) => SLIDE_RE.test(n))
    .sort((a, b) => Number(SLIDE_RE.exec(a)[1]) - Number(SLIDE_RE.exec(b)[1]));
}

// A line break lives inside a paragraph, so splitting on it is what keeps the runs either
// side apart — joining them blind turns "Pan & Zoom" + "Note:" into "Pan & ZoomNote:".
const BR = /<a:br(?:\s[^>]*)?\/>|<a:br(?:\s[^>]*)?>[\s\S]*?<\/a:br>/;

const paragraphs = (source) => elements(source, 'a:p')
  .flatMap((p) => p.split(BR))
  .map((chunk) => textIn(chunk, 'a:t').replace(/\s+/g, ' ').trim())
  .filter(Boolean);

function shapeIsTitle(sp) {
  const ph = elements(elements(sp, 'p:nvSpPr')[0] || '', 'p:ph')[0];
  return !!ph && TITLE_PH.has(attr(ph, 'type') || '');
}

function slideTitle(xml) {
  for (const sp of elements(xml, 'p:sp')) {
    if (!shapeIsTitle(sp)) continue;
    const text = paragraphs(sp).join(' ');
    if (text) return text;
  }
  return paragraphs(xml)[0] || '';
}

// Title plus the body text of every non-title shape, for the preview.
function slideText(xml) {
  const title = slideTitle(xml);
  const body = [];
  for (const sp of elements(xml, 'p:sp')) {
    if (shapeIsTitle(sp)) continue;
    for (const line of paragraphs(sp)) if (line !== title) body.push(line);
  }
  return { title, body };
}

function readSlides(absPath) {
  const zip = openZip(absPath);
  if (!zip) return null;
  const parts = slideParts(zip);
  if (!parts.length) return null;
  return { zip, parts };
}

// [{ title, page }] over the slides that have a title — an untitled slide would index as an
// empty name, which no query could ever reach.
async function readOutline(absPath) {
  const doc = readSlides(absPath);
  if (!doc) return [];
  const out = [];
  doc.parts.forEach((part, i) => {
    const xml = doc.zip.text(part);
    if (!xml) return;
    const title = slideTitle(xml);
    if (title) out.push({ title, page: i + 1 });
  });
  return out;
}

async function readSlide(absPath, page) {
  const doc = readSlides(absPath);
  if (!doc) return null;
  const n = clampPage(page, doc.parts.length);
  const xml = doc.zip.text(doc.parts[n - 1]);
  if (!xml) return null;
  return { ...slideText(xml), page: n, total: doc.parts.length };
}

// Text, not a picture: rendering DrawingML would be a second product.
async function render(el, req) {
  const slide = await readSlide(req.abs, req.page);
  if (!req.isCurrent() || !slide) return false;
  return renderLines(el, { title: slide.title, body: slide.body, width: req.width });
}

module.exports = {
  exts: ['pptx'],
  anchorKind: null, // PowerPoint takes a fragment as part of the file name and finds nothing
  outline: readOutline,
  render,
  readOutline,
  readSlide,
};
