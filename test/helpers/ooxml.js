'use strict';

// Builds real OOXML files in memory so the format tests read bytes the way the plugin will,
// rather than a hand-shaped object. Writes deflated members, since that is the case that
// exercises the inflate path.

const zlib = require('zlib');

let TABLE = null;
function crc32(buf) {
  if (!TABLE) {
    TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}

// `dataDescriptor` writes the streaming variant: flag bit 3, zeroed sizes in the local
// header, real ones only in the central directory. Office and every zip writer that can't
// seek emit this, so it is the shape a reader must not take the local header on trust for.
function writeZip(files, { dataDescriptor = false } = {}) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const deflated = zlib.deflateRawSync(raw);
    const name = Buffer.from(f.name, 'utf8');
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(dataDescriptor ? 8 : 0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(dataDescriptor ? 0 : crc, 14);
    local.writeUInt32LE(dataDescriptor ? 0 : deflated.length, 18);
    local.writeUInt32LE(dataDescriptor ? 0 : raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, deflated);
    let trailer = null;
    if (dataDescriptor) {
      trailer = Buffer.alloc(16);
      trailer.writeUInt32LE(0x08074b50, 0);
      trailer.writeUInt32LE(crc, 4);
      trailer.writeUInt32LE(deflated.length, 8);
      trailer.writeUInt32LE(raw.length, 12);
      locals.push(trailer);
    }

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(dataDescriptor ? 8 : 0, 8);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(deflated.length, 20);
    cen.writeUInt32LE(raw.length, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, name);

    offset += local.length + name.length + deflated.length + (trailer ? trailer.length : 0);
  }
  const body = Buffer.concat(locals);
  const dir = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(dir.length, 12);
  eocd.writeUInt32LE(body.length, 16);
  return Buffer.concat([body, dir, eocd]);
}

// A "\n" in a line becomes a real <a:br/> between two runs of one paragraph, which is how
// PowerPoint stores a soft line break.
const para = (text) =>
  '<a:p>' + String(text).split('\n').map((s) => `<a:r><a:t>${s}</a:t></a:r>`).join('<a:br/>') + '</a:p>';

const titleShape = (text) =>
  `<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody>${para(text)}</p:txBody></p:sp>`;

const bodyShape = (lines) =>
  `<p:sp><p:nvSpPr><p:nvPr/></p:nvSpPr><p:txBody>${lines.map(para).join('')}</p:txBody></p:sp>`;

const slideXml = (slide) =>
  '<?xml version="1.0"?><p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>' +
  (slide.title ? titleShape(slide.title) : '') +
  (slide.body && slide.body.length ? bodyShape(slide.body) : '') +
  '</p:spTree></p:cSld></p:sld>';

// `slides` is in presentation order; each may carry a `part` naming the file it lands in, so
// a test can put presentation order and file numbering deliberately at odds.
function buildPptx(slides) {
  const parts = slides.map((s, i) => s.part || `slide${i + 1}.xml`);
  const rels = parts
    .map((p, i) => `<Relationship Id="rId${i + 1}" Target="slides/${p}"/>`)
    .join('');
  const sldIds = parts
    .map((p, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`)
    .join('');
  const files = [
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types/>' },
    { name: 'ppt/_rels/presentation.xml.rels', data: `<?xml version="1.0"?><Relationships>${rels}</Relationships>` },
    {
      name: 'ppt/presentation.xml',
      data: `<?xml version="1.0"?><p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst>${sldIds}</p:sldIdLst></p:presentation>`,
    },
  ];
  slides.forEach((s, i) => files.push({ name: `ppt/slides/${parts[i]}`, data: slideXml(s) }));
  return writeZip(files);
}

// `chapters` is [{ title, body, img }] in reading order; `img` is a Buffer to embed under
// OEBPS/images/ and reference from that chapter. `flavour` picks where the contents live:
// 'nav' is EPUB 3, 'ncx' is EPUB 2. Everything sits under OEBPS/ so the fixture exercises the
// relative-path resolution a flat archive would hide.
function buildEpub(chapters, flavour = 'nav') {
  const docs = chapters.map((c, i) => ({
    id: 'ch' + (i + 1),
    href: 'text/ch' + (i + 1) + '.xhtml',
    title: c.title,
    body: c.body || [],
    img: c.img || null,
  }));
  const files = [
    { name: 'mimetype', data: 'application/epub+zip' },
    {
      name: 'META-INF/container.xml',
      data: '<?xml version="1.0"?><container><rootfiles>'
        + '<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>'
        + '</rootfiles></container>',
    },
  ];
  docs.forEach((d, i) => {
    if (d.img) files.push({ name: 'OEBPS/images/img' + (i + 1) + '.png', data: d.img });
    // The chapter is under OEBPS/text/, the image under OEBPS/images/, so the src has to walk
    // up — exactly the resolution a real book needs.
    const pic = d.img ? '<img src="../images/img' + (i + 1) + '.png"/>' : '';
    files.push({
      name: 'OEBPS/' + d.href,
      data: '<?xml version="1.0"?><html><body><h1>' + d.title + '</h1>'
        + d.body.map((l) => '<p>' + l + '</p>').join('') + pic + '</body></html>',
    });
  });

  const manifest = docs.map((d) => `<item id="${d.id}" href="${d.href}" media-type="application/xhtml+xml"/>`).join('');
  const spine = docs.map((d) => `<itemref idref="${d.id}"/>`).join('');

  if (flavour === 'nav') {
    const links = docs.map((d) => `<li><a href="${d.href}">${d.title}</a></li>`).join('');
    files.push({
      name: 'OEBPS/nav.xhtml',
      data: '<?xml version="1.0"?><html><body><nav epub:type="toc"><ol>' + links + '</ol></nav></body></html>',
    });
    files.push({
      name: 'OEBPS/content.opf',
      data: '<?xml version="1.0"?><package><manifest>' + manifest
        + '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
        + '</manifest><spine>' + spine + '</spine></package>',
    });
  } else {
    const points = docs.map((d, i) =>
      `<navPoint id="n${i}" playOrder="${i + 1}"><navLabel><text>${d.title}</text></navLabel>`
      + `<content src="${d.href}"/></navPoint>`).join('');
    files.push({
      name: 'OEBPS/toc.ncx',
      data: '<?xml version="1.0"?><ncx><navMap>' + points + '</navMap></ncx>',
    });
    files.push({
      name: 'OEBPS/content.opf',
      data: '<?xml version="1.0"?><package><manifest>' + manifest
        + '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'
        + '</manifest><spine toc="ncx">' + spine + '</spine></package>',
    });
  }
  return writeZip(files);
}

const odfDoc = (body) =>
  '<?xml version="1.0"?><office:document-content '
  + 'xmlns:office="urn:o" xmlns:text="urn:t" xmlns:draw="urn:d" xmlns:table="urn:tb" '
  + 'xmlns:presentation="urn:p">'
  + '<office:body>' + body + '</office:body></office:document-content>';

// An .odt from [{ heading, paras }]. Real ODF wraps the text in office:text; headings carry
// an outline level.
function buildOdt(sections) {
  const body = '<office:text>' + sections.map((s) =>
    '<text:h text:outline-level="1">' + s.heading + '</text:h>'
    + (s.paras || []).map((p) => '<text:p>' + p + '</text:p>').join('')).join('') + '</office:text>';
  return writeZip([
    { name: 'mimetype', data: 'application/vnd.oasis.opendocument.text' },
    { name: 'content.xml', data: odfDoc(body) },
  ]);
}

// An .odp from [{ title, body }]. Each slide is a draw:page; the title sits in a frame marked
// presentation:class="title". The body frame is written FIRST, before the title frame, so a
// reader that just took the first text line would get the body, not the title — frame order
// is not guaranteed in real files.
function buildOdp(slides) {
  const body = '<office:presentation>' + slides.map((s) =>
    '<draw:page draw:name="page">'
    + '<draw:frame presentation:class="outline">' + (s.body || []).map((l) => '<text:p>' + l + '</text:p>').join('') + '</draw:frame>'
    + (s.title ? '<draw:frame presentation:class="title"><text:p>' + s.title + '</text:p></draw:frame>' : '')
    + '</draw:page>').join('') + '</office:presentation>';
  return writeZip([
    { name: 'mimetype', data: 'application/vnd.oasis.opendocument.presentation' },
    { name: 'content.xml', data: odfDoc(body) },
  ]);
}

// An .ods from [{ name, cells }]. Each sheet is a table:table named by table:name.
function buildOds(sheets) {
  const body = '<office:spreadsheet>' + sheets.map((s) =>
    '<table:table table:name="' + s.name + '">'
    + (s.cells || []).map((c) => '<table:table-cell><text:p>' + c + '</text:p></table:table-cell>').join('')
    + '</table:table>').join('') + '</office:spreadsheet>';
  return writeZip([
    { name: 'mimetype', data: 'application/vnd.oasis.opendocument.spreadsheet' },
    { name: 'content.xml', data: odfDoc(body) },
  ]);
}

module.exports = { writeZip, buildPptx, buildEpub, buildOdt, buildOdp, buildOds, crc32 };
