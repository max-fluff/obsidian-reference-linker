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
// A member marked `store: true` is written uncompressed, which ODF requires of its mimetype.
function writeZip(files, { dataDescriptor = false } = {}) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const body = f.store ? raw : zlib.deflateRawSync(raw);
    const method = f.store ? 0 : 8;
    const streamed = dataDescriptor && !f.store;
    const name = Buffer.from(f.name, 'utf8');
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(streamed ? 8 : 0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(streamed ? 0 : crc, 14);
    local.writeUInt32LE(streamed ? 0 : body.length, 18);
    local.writeUInt32LE(streamed ? 0 : raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);
    let trailer = null;
    if (streamed) {
      trailer = Buffer.alloc(16);
      trailer.writeUInt32LE(0x08074b50, 0);
      trailer.writeUInt32LE(crc, 4);
      trailer.writeUInt32LE(body.length, 8);
      trailer.writeUInt32LE(raw.length, 12);
      locals.push(trailer);
    }

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(streamed ? 8 : 0, 8);
    cen.writeUInt16LE(method, 10);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(body.length, 20);
    cen.writeUInt32LE(raw.length, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, name);

    offset += local.length + name.length + body.length + (trailer ? trailer.length : 0);
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

// Shapes carry a place of their own, as a real slide's do. A shape with none inherits the box
// of the layout placeholder it names, and a fixture without either is simply not drawn.
const at = (x, y, cx, cy) => '<p:spPr><a:xfrm>'
  + `<a:off x="${Math.round(x * 914400)}" y="${Math.round(y * 914400)}"/>`
  + `<a:ext cx="${Math.round(cx * 914400)}" cy="${Math.round(cy * 914400)}"/></a:xfrm></p:spPr>`;

const titleShape = (text) =>
  '<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>'
  + at(0.5, 0.5, 9, 1.5) + `<p:txBody>${para(text)}</p:txBody></p:sp>`;

const bodyShape = (lines) =>
  '<p:sp><p:nvSpPr><p:nvPr/></p:nvSpPr>'
  + at(0.5, 2.5, 9, 4) + `<p:txBody>${lines.map(para).join('')}</p:txBody></p:sp>`;

// `raw` is markup dropped into the shape tree as it stands, for the shapes a helper would only
// obscure — a connector, a table, a freeform.
const slideXml = (slide) => slide.xml ||
  '<?xml version="1.0"?><p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>' +
  (slide.title ? titleShape(slide.title) : '') +
  (slide.body && slide.body.length ? bodyShape(slide.body) : '') +
  (slide.raw || '') +
  '</p:spTree></p:cSld></p:sld>';

// `slides` is in presentation order; each may carry a `part` naming the file it lands in, so
// a test can put presentation order and file numbering deliberately at odds.
// A shape at a stated place, for the decoration a layout or master draws. `ph` makes it a
// placeholder instead, which is what holds the "Click to edit…" prompt a preview must not show.
const EMU_IN = 914400;
// `noBox` leaves out the xfrm, which is how a layout states a placeholder whose position it
// inherits from the master rather than restating.
const placed = ({ x = 0, y = 0, cx = 1, cy = 1, fill, text, ph, idx, noBox, lstStyle }) =>
  '<p:sp><p:nvSpPr><p:cNvPr name="s"/><p:nvPr>'
  + (ph ? `<p:ph type="${ph}"${idx === undefined ? '' : ` idx="${idx}"`}/>` : '') + '</p:nvPr></p:nvSpPr><p:spPr>'
  + (noBox ? '' : '<a:xfrm>'
    + `<a:off x="${Math.round(x * EMU_IN)}" y="${Math.round(y * EMU_IN)}"/>`
    + `<a:ext cx="${Math.round(cx * EMU_IN)}" cy="${Math.round(cy * EMU_IN)}"/></a:xfrm>`)
  + (fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '')
  + '</p:spPr>' + (lstStyle || '')
  + (text === undefined ? '' : `<p:txBody>${para(text)}</p:txBody>`) + '</p:sp>';

// `opts.layout` and `opts.master` are lists of shapes in that form; `opts.showMasterSp: false`
// makes the layout say it replaces the master's decoration rather than sitting on top of it,
// and `opts.masterBg` is the sheet colour the deck inherits.
function buildPptx(slides, opts = {}) {
  const parts = slides.map((s, i) => s.part || `slide${i + 1}.xml`);
  const rels = parts
    .map((p, i) => `<Relationship Id="rId${i + 1}" Target="slides/${p}"/>`)
    .join('');
  const sldIds = parts
    .map((p, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`)
    .join('');
  const shapes = (list) => (list || []).map(placed).join('');
  const files = [
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types/>' },
    { name: 'ppt/_rels/presentation.xml.rels', data: `<?xml version="1.0"?><Relationships>${rels}</Relationships>` },
    {
      name: 'ppt/presentation.xml',
      data: '<?xml version="1.0"?><p:presentation xmlns:p="p" xmlns:r="r">'
        + `<p:sldSz cx="${10 * EMU_IN}" cy="${7.5 * EMU_IN}"/><p:sldIdLst>${sldIds}</p:sldIdLst></p:presentation>`,
    },
    {
      name: 'ppt/slideLayouts/slideLayout1.xml',
      data: '<?xml version="1.0"?><p:sldLayout xmlns:p="p" xmlns:a="a"'
        + (opts.showMasterSp === false ? ' showMasterSp="0"' : '')
        + `><p:cSld><p:spTree>${shapes(opts.layout)}</p:spTree></p:cSld></p:sldLayout>`,
    },
    {
      name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
      data: '<?xml version="1.0"?><Relationships><Relationship Id="rIdM" '
        + 'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" '
        + 'Target="../slideMasters/slideMaster1.xml"/></Relationships>',
    },
    {
      name: 'ppt/slideMasters/slideMaster1.xml',
      data: '<?xml version="1.0"?><p:sldMaster xmlns:p="p" xmlns:a="a">'
        + (opts.masterBg ? `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${opts.masterBg}"/></a:solidFill></p:bgPr></p:bg>` : '')
        + `<p:cSld><p:spTree>${shapes(opts.master)}</p:spTree></p:cSld></p:sldMaster>`,
    },
  ];

  // `opts.theme` is { n, accent1 }: the theme the master actually points at. A decoy theme1 with
  // another accent1 is written beside it, so a reader that assumes theme1 resolves the wrong one.
  if (opts.theme) {
    const scheme = (colour) => '<?xml version="1.0"?><a:theme xmlns:a="a"><a:themeElements><a:clrScheme>'
      + `<a:accent1><a:srgbClr val="${colour}"/></a:accent1></a:clrScheme></a:themeElements></a:theme>`;
    files.push({ name: 'ppt/theme/theme1.xml', data: scheme('000001') });
    files.push({ name: `ppt/theme/theme${opts.theme.n}.xml`, data: scheme(opts.theme.accent1) });
    files.push({
      name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      data: '<?xml version="1.0"?><Relationships><Relationship Id="rIdT" '
        + 'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" '
        + `Target="../theme/theme${opts.theme.n}.xml"/></Relationships>`,
    });
  }
  slides.forEach((s, i) => {
    files.push({ name: `ppt/slides/${parts[i]}`, data: slideXml(s) });
    files.push({
      name: `ppt/slides/_rels/${parts[i]}.rels`,
      data: '<?xml version="1.0"?><Relationships><Relationship Id="rIdL" '
        + 'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" '
        + 'Target="../slideLayouts/slideLayout1.xml"/></Relationships>',
    });
  });
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
    { name: 'mimetype', data: 'application/epub+zip', store: true },
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

// The flat form is the same body under office:document, saved as one file: no zip, and the
// styles a zip would keep in styles.xml sit here beside the automatic ones.
const odfDoc = (body, styles, flat) => {
  const root = flat ? 'office:document' : 'office:document-content';
  return '<?xml version="1.0"?><' + root + ' '
    + 'xmlns:office="urn:o" xmlns:text="urn:t" xmlns:draw="urn:d" xmlns:table="urn:tb" '
    + 'xmlns:presentation="urn:p" xmlns:style="urn:s" xmlns:fo="urn:f">'
    + (styles ? '<office:automatic-styles>' + styles + '</office:automatic-styles>' : '')
    + '<office:body>' + body + '</office:body></' + root + '>';
};

const odfFile = (mimetype, body, styles, flat) => (flat
  ? odfDoc(body, styles, true)
  : writeZip([
    { name: 'mimetype', data: mimetype, store: true },
    { name: 'content.xml', data: odfDoc(body, styles) },
  ]));

// An .odt from [{ heading, paras }]. Real ODF wraps the text in office:text; headings carry
// an outline level.
function buildOdt(sections, { flat = false } = {}) {
  const body = '<office:text>' + sections.map((s) =>
    '<text:h text:outline-level="1">' + s.heading + '</text:h>'
    + (s.paras || []).map((p) => '<text:p>' + p + '</text:p>').join('')).join('') + '</office:text>';
  return odfFile('application/vnd.oasis.opendocument.text', body, '', flat);
}

// An .odp from [{ title, body }]. Each slide is a draw:page; the title sits in a frame marked
// presentation:class="title". The body frame is written FIRST, before the title frame, so a
// reader that just took the first text line would get the body, not the title — frame order
// is not guaranteed in real files.
function buildOdp(slides, { flat = false } = {}) {
  const body = '<office:presentation>' + slides.map((s) =>
    '<draw:page draw:name="page">'
    + '<draw:frame presentation:class="outline">' + (s.body || []).map((l) => '<text:p>' + l + '</text:p>').join('') + '</draw:frame>'
    + (s.title ? '<draw:frame presentation:class="title"><text:p>' + s.title + '</text:p></draw:frame>' : '')
    + '</draw:page>').join('') + '</office:presentation>';
  return odfFile('application/vnd.oasis.opendocument.presentation', body, '', flat);
}

// An .odg from [{ name, lines }]. A drawing is draw:page like a deck, but its pages are named
// rather than titled and a page may hold only shapes.
function buildOdg(pages, { flat = false } = {}) {
  const body = '<office:drawing>' + pages.map((p) =>
    '<draw:page draw:name="' + p.name + '">'
    + (p.lines || []).map((l) => '<draw:frame><text:p>' + l + '</text:p></draw:frame>').join('')
    + '</draw:page>').join('') + '</office:drawing>';
  return odfFile('application/vnd.oasis.opendocument.graphics', body, '', flat);
}

// An .ods from [{ name, rows }] (rows is an array of cell-string arrays) or the shorthand
// [{ name, cells }] for a single row. A cell may be `{ text, style }` and a sheet may carry
// `cols: [styleName]`; `opts.styles` is the raw style:style run those names refer to.
function buildOds(sheets, { styles = '', flat = false } = {}) {
  const cellXml = (c) => {
    const { text, style, cols, rows, covered } = typeof c === 'object' && c ? c : { text: c };
    if (covered) return '<table:covered-table-cell/>';
    const span = (n, name) => (n > 1 ? ' table:number-' + name + '-spanned="' + n + '"' : '');
    return '<table:table-cell' + (style ? ' table:style-name="' + style + '"' : '')
      + span(cols, 'columns') + span(rows, 'rows') + '>'
      + '<text:p>' + text + '</text:p></table:table-cell>';
  };
  const rowXml = (cells) => '<table:table-row>' + cells.map(cellXml).join('') + '</table:table-row>';
  const colXml = (style) => '<table:table-column' + (style ? ' table:style-name="' + style + '"' : '') + '/>';
  const body = '<office:spreadsheet>' + sheets.map((s) => {
    const rows = s.rows || (s.cells ? [s.cells] : []);
    return '<table:table table:name="' + s.name + '">'
      + (s.cols || []).map(colXml).join('') + rows.map(rowXml).join('') + '</table:table>';
  }).join('') + '</office:spreadsheet>';
  return odfFile('application/vnd.oasis.opendocument.spreadsheet', body, styles, flat);
}

// A .docx from a list of blocks:
//   { h, level, styleId }  a heading, by style
//   { p, outlineLvl }      a paragraph, optionally a heading by direct formatting
//   { p: [...] }           one paragraph split across runs, the way Word rewrites text on edit
//   { table: [[...]] }     rows of cell strings
//   { img: 'rId7' }        a picture run
//   { li }                 a numbered paragraph
// `styleId` names the style in the body while styles.xml keeps the English w:name, which is what
// a localized Word writes; `media` adds parts and relationships an { img } can point at.
function buildDocx(blocks, { media = {} } = {}) {
  const runs = (text, b) => [].concat(text).map((s) => {
    const pr = [b && b.bold ? '<w:b/>' : '', b && b.italic ? '<w:i/>' : '',
      b && b.sup ? '<w:vertAlign w:val="superscript"/>' : ''].join('');
    return '<w:r>' + (pr ? '<w:rPr>' + pr + '</w:rPr>' : '') + '<w:t xml:space="preserve">' + s + '</w:t></w:r>';
  }).join('');
  const pPr = (parts) => (parts.filter(Boolean).length ? '<w:pPr>' + parts.filter(Boolean).join('') + '</w:pPr>' : '');
  const styleIds = new Map();

  const drawing = (id) => '<w:r><w:drawing><a:blip r:embed="' + id + '"/></w:drawing></w:r>';

  const blockXml = (b) => {
    // A cell may itself be a block, so a test can put a heading-styled paragraph inside a table.
    if (b.table) {
      // `grid` is the column widths in twips, as w:tblGrid states them; `style` names a table
      // style, which is where a real document keeps its borders.
      const grid = b.grid ? '<w:tblGrid>' + b.grid.map((w) => '<w:gridCol w:w="' + w + '"/>').join('') + '</w:tblGrid>' : '';
      const pr = b.style ? '<w:tblPr><w:tblStyle w:val="' + b.style + '"/></w:tblPr>' : '';
      // A cell given as { tc, vMerge, gridSpan } carries a w:tcPr; anything else is its content.
      const tcXml = (c) => {
        const spec = c && typeof c === 'object' && (c.vMerge || c.gridSpan) ? c : null;
        const inner = spec ? spec.tc : c;
        const tcPr = spec ? '<w:tcPr>'
          + (spec.gridSpan ? '<w:gridSpan w:val="' + spec.gridSpan + '"/>' : '')
          + (spec.vMerge ? '<w:vMerge' + (spec.vMerge === 'restart' ? ' w:val="restart"' : '') + '/>' : '')
          + '</w:tcPr>' : '';
        const body = inner && typeof inner === 'object' ? blockXml(inner)
          : '<w:p>' + (inner === '' || inner === undefined ? '' : runs(inner)) + '</w:p>';
        return '<w:tc>' + tcPr + body + '</w:tc>';
      };
      return '<w:tbl>' + pr + grid + b.table.map((row) => '<w:tr>' + row.map(tcXml).join('') + '</w:tr>').join('')
        + '</w:tbl>';
    }
    if (b.h !== undefined) {
      const id = b.styleId || ('Heading' + (b.level || 1));
      styleIds.set(id, b.level || 1);
      return '<w:p>' + pPr(['<w:pStyle w:val="' + id + '"/>'])
        + (b.img ? drawing(b.img) : '') + (b.h === '' ? '' : runs(b.h, b)) + '</w:p>';
    }
    if (b.img) return '<w:p>' + drawing(b.img) + '</w:p>';
    const marks = [
      b.outlineLvl === undefined ? '' : '<w:outlineLvl w:val="' + b.outlineLvl + '"/>',
      b.li === undefined ? '' : '<w:numPr><w:ilvl w:val="0"/></w:numPr>',
    ];
    return '<w:p>' + pPr(marks) + runs(b.li === undefined ? b.p : b.li, b) + '</w:p>';
  };

  const body = blocks.map(blockXml).join('');
  const styles = '<?xml version="1.0"?><w:styles xmlns:w="w">' + [...styleIds]
    .map(([id, lvl]) => '<w:style w:styleId="' + id + '"><w:name w:val="heading ' + lvl + '"/></w:style>').join('')
    + '</w:styles>';
  const rels = Object.keys(media)
    .map((id) => '<Relationship Id="' + id + '" Target="media/' + id + '.png"/>').join('');
  const files = [
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types/>' },
    { name: 'word/document.xml', data: '<?xml version="1.0"?><w:document xmlns:w="w" xmlns:r="r" xmlns:a="a"><w:body>' + body + '</w:body></w:document>' },
    { name: 'word/styles.xml', data: styles },
    { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0"?><Relationships>' + rels + '</Relationships>' },
  ];
  for (const [id, data] of Object.entries(media)) files.push({ name: 'word/media/' + id + '.png', data });
  return writeZip(files);
}

// A .docx that is only a wrapper around an embedded HTML file, which is what saving a web page
// as .docx produces.
function buildDocxAltChunk(html) {
  return writeZip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types/>' },
    { name: 'word/document.xml', data: '<?xml version="1.0"?><w:document xmlns:w="w" xmlns:r="r"><w:body><w:altChunk r:id="rId9"/></w:body></w:document>' },
    { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0"?><Relationships><Relationship Id="rId9" Target="chunk.html"/></Relationships>' },
    { name: 'word/chunk.html', data: html },
  ]);
}

// An .xlsx from [{ name, rows, at }]. A cell is a string (stored shared, as Excel does), a
// number, or { date: serial }. `at` is where the used range starts — real sheets do not begin at
// A1. Sheets are written to parts in reverse, so tab order and part numbering disagree.
function buildXlsx(sheets, { numFmt = '' } = {}) {
  const strings = [];
  const share = (s) => {
    const at = strings.indexOf(s);
    return at >= 0 ? at : strings.push(s) - 1;
  };
  const colRef = (i) => {
    let out = '';
    for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) out = String.fromCharCode(65 + (n % 26)) + out;
    return out;
  };
  const origin = (at) => {
    const m = /^([A-Z]+)(\d+)$/.exec(at || 'A1');
    let col = 0;
    for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
    return { col: col - 1, row: Number(m[2]) };
  };

  const bodies = sheets.map((s) => {
    const o = origin(s.at);
    const rows = (s.rows || []).map((cells, r) => {
      const xml = cells.map((c, i) => {
        const ref = colRef(o.col + i) + (o.row + r);
        if (c === '' || c === null || c === undefined) return '';
        if (typeof c === 'object' && c.date !== undefined) return '<c r="' + ref + '" s="1"><v>' + c.date + '</v></c>';
        // { fmt } is a cell under the custom format `opts.numFmt`, which is style index 2.
        if (typeof c === 'object' && c.fmt !== undefined) return '<c r="' + ref + '" s="2"><v>' + c.fmt + '</v></c>';
        // { raw } writes the literal the sheet stores. A JS number cannot: the engine prints a
        // double as its shortest round-trip form, so 0.56999999999999995 would reach the file
        // already collapsed to 0.57 and the test would prove nothing.
        if (typeof c === 'object' && c.raw !== undefined) return '<c r="' + ref + '"><v>' + c.raw + '</v></c>';
        if (typeof c === 'number') return '<c r="' + ref + '"><v>' + c + '</v></c>';
        return '<c r="' + ref + '" t="s"><v>' + share(String(c)) + '</v></c>';
      }).join('');
      return '<row r="' + (o.row + r) + '">' + xml + '</row>';
    }).join('');
    // `merges: ['A1:C1']` is what Excel writes for a merge: the covered cells stay in sheetData
    // as empty ones, and only this list says they are covered.
    const merges = (s.merges || []).length
      ? '<mergeCells count="' + s.merges.length + '">'
        + s.merges.map((ref) => '<mergeCell ref="' + ref + '"/>').join('') + '</mergeCells>'
      : '';
    return '<?xml version="1.0"?><worksheet xmlns="x"><sheetData>' + rows + '</sheetData>' + merges + '</worksheet>';
  });

  // Reversed on purpose: rId1 is the LAST tab, so a reader that trusts part numbering or
  // relationship order rather than the workbook's own list gets the sheets backwards.
  const parts = sheets.map((s, i) => 'worksheets/sheet' + (sheets.length - i) + '.xml');
  const files = [
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types/>' },
    {
      name: 'xl/workbook.xml',
      data: '<?xml version="1.0"?><workbook xmlns:r="r"><sheets>' + sheets
        .map((s, i) => '<sheet name="' + s.name + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('')
        + '</sheets></workbook>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: '<?xml version="1.0"?><Relationships>' + parts
        .map((p, i) => '<Relationship Id="rId' + (i + 1) + '" Target="' + p + '"/>').join('') + '</Relationships>',
    },
    {
      name: 'xl/styles.xml',
      data: '<?xml version="1.0"?><styleSheet>'
        + (numFmt ? '<numFmts><numFmt numFmtId="164" formatCode="' + numFmt + '"/></numFmts>' : '')
        + '<cellXfs><xf numFmtId="0"/><xf numFmtId="14"/>'
        + (numFmt ? '<xf numFmtId="164"/>' : '') + '</cellXfs></styleSheet>',
    },
    {
      name: 'xl/sharedStrings.xml',
      data: '<?xml version="1.0"?><sst>' + strings.map((s) => '<si><t>' + s + '</t></si>').join('') + '</sst>',
    },
  ];
  parts.forEach((p, i) => files.push({ name: 'xl/' + p, data: bodies[i] }));
  return writeZip(files);
}

module.exports = {
  writeZip, buildPptx, buildEpub, buildOdt, buildOdp, buildOdg, buildOds, buildDocx, buildDocxAltChunk, buildXlsx, crc32,
};
