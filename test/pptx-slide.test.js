'use strict';

// A slide drawn as a slide. What made the first attempt look wrong was not the shapes it drew
// but the ones it did not: a deck's design lives on its layout and master, and a slide rendered
// without them is a handful of words on a blank white sheet.

const { describe, it, assert } = require('../src/shared/testing/harness');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { installStubs } = require('../src/shared/testing/stubs');

installStubs();

const pptx = require('../src/formats/pptx');
const { openZip } = require('../src/zip');
const { buildPptx } = require('./helpers/ooxml');

const deck = (slides, opts) => {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'reflinker-')), 'd.pptx');
  fs.writeFileSync(p, buildPptx(slides, opts));
  return openZip(p);
};
const page = (slides, opts) => pptx.slidePage(deck(slides, opts), 'ppt/slides/slide1.xml', 420);

describe('the sheet a slide is drawn on', () => {
  it('is the size the deck declares, scaled to the width there is room for', () => {
    const p = page([{ title: 'T' }]);
    // 10in by 7.5in is 720pt by 540pt; 720pt is 960px, so a 420px box shows it at 0.4375.
    assert.ok(/\.slide\{width:720pt;height:540pt/.test(p.css), p.css);
    assert.ok(/zoom:0\.4375/.test(p.css), p.css);
  });

  it('resolves a scheme colour against the theme its own master names', () => {
    // A deck assembled from two presentations has a theme per master. Assuming theme1 paints
    // every named colour on the second master's slides from the first master's palette.
    const shape = '<p:sp><p:nvSpPr><p:cNvPr name="s"/><p:nvPr/></p:nvSpPr><p:spPr>'
      + '<a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm>'
      + '<a:prstGeom prst="rect"/><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:spPr></p:sp>';
    const p = page([{ raw: shape }], { theme: { n: 7, accent1: '00FF00' } });
    assert.ok(/background:#00ff00/.test(p.css), p.css);
    assert.ok(!/#000001/.test(p.css), 'theme1 was assumed: ' + p.css);
  });

  it('takes the background the master gives it', () => {
    assert.ok(/\.slide\{[^}]*background:#123456/.test(page([{ title: 'T' }], { masterBg: '123456' }).css));
  });
});

describe('what the layout and master contribute', () => {
  const decoration = [{ x: 0, y: 0, cx: 10, cy: 1, fill: 'D24726' }];

  it('draws the layout\'s decoration under the slide\'s own shapes', () => {
    const p = page([{ title: 'Real title' }], { layout: decoration });
    const fill = /\.(s\d+)\{[^}]*background:#d24726/.exec(p.css);
    assert.ok(fill, 'the layout\'s banner was not drawn: ' + p.css);
    assert.ok(p.html.indexOf('class="' + fill[1] + '"') < p.html.indexOf('Real title'),
      'the decoration must sit behind the slide, not over it');
  });

  it('draws the master\'s decoration too', () => {
    assert.ok(/background:#00ff00/.test(page([{ title: 'T' }], { master: [{ cx: 1, cy: 1, fill: '00FF00' }] }).css));
  });

  it('leaves the master out when the layout says it replaces it', () => {
    // showMasterSp="0" is the layout saying it supersedes the master's shapes.
    const p = page([{ title: 'T' }], { master: [{ cx: 1, cy: 1, fill: '00FF00' }], showMasterSp: false });
    assert.ok(!/background:#00ff00/.test(p.css), p.css);
  });

  it('leaves the master out when the slide itself says so, not only the layout', () => {
    // A divider slide written as <p:sld showMasterSp="0"> is a clean sheet in PowerPoint. Read
    // only off the layout, the master's logo and footer are drawn over it anyway.
    const bare = '<?xml version="1.0"?><p:sld xmlns:p="p" xmlns:a="a" showMasterSp="0"><p:cSld><p:spTree>'
      + '</p:spTree></p:cSld></p:sld>';
    const p = pptx.slidePage(deck([{ xml: bare }], { master: [{ cx: 1, cy: 1, fill: '00FF00' }] }),
      'ppt/slides/slide1.xml', 420);
    assert.ok(!/background:#00ff00/.test(p.css), p.css);
  });

  it('never draws a placeholder\'s prompt text from the layout', () => {
    // A layout's placeholders hold "Click to edit Master title style"; drawn, that prompt lands
    // underneath the slide's own words.
    const p = page([{ title: 'Real title' }], {
      layout: [{ ph: 'ctrTitle', text: 'Click to edit Master title style', cx: 5, cy: 1 }],
    });
    assert.ok(!/Click to edit/.test(p.html), p.html);
    assert.ok(/Real title/.test(p.html), p.html);
  });
});

describe('a placeholder inherits its place down the whole chain', () => {
  it('takes the master\'s box when the layout restates neither position nor size', () => {
    // A layout commonly names a placeholder and says nothing more about it. Stopping at the
    // layout loses the shape outright — every title in a deck built this way disappears.
    const bare = '<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/>'
      + '<p:txBody><a:p><a:r><a:t>Real title</a:t></a:r></a:p></p:txBody></p:sp>';
    const p = page([{ raw: bare }], {
      master: [{ ph: 'title', x: 1, y: 0.5, cx: 8, cy: 1 }],
      layout: [{ ph: 'title', noBox: true }],
    });
    assert.ok(/Real title/.test(p.html), 'the title was dropped: ' + p.html);
    assert.ok(/left:72pt/.test(p.css), 'and it did not land where the master put it: ' + p.css);
  });
});

describe('paragraph spacing comes down the chain, like everything else', () => {
  const bodyOnSlide = '<p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>'
    + '<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="4572000" cy="2743200"/></a:xfrm></p:spPr>'
    + '<p:txBody><a:p><a:r><a:t>One</a:t></a:r></a:p><a:p><a:r><a:t>Two</a:t></a:r></a:p></p:txBody></p:sp>';

  it('lets the shape\'s own list style win over the layout\'s', () => {
    // The chain is resolved once per shape now; keeping only its outer source would silently
    // drop everything a shape states for itself, which is where a slide's own sizing lives.
    const shaped = '<p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>'
      + '<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="4572000" cy="2743200"/></a:xfrm></p:spPr>'
      + '<p:txBody><a:bodyPr/><a:lstStyle><a:lvl1pPr><a:defRPr sz="900"/></a:lvl1pPr></a:lstStyle>'
      + '<a:p><a:r><a:t>One</a:t></a:r></a:p></p:txBody></p:sp>';
    const p = page([{ raw: shaped }], {
      layout: [{
        ph: 'body',
        idx: 1,
        noBox: true,
        lstStyle: '<a:lstStyle><a:lvl1pPr><a:defRPr sz="4000"/></a:lvl1pPr></a:lstStyle>',
      }],
    });
    assert.ok(/font-size:9pt/.test(p.css), p.css);
    assert.ok(!/font-size:40pt/.test(p.css), 'the layout won over the shape: ' + p.css);
  });

  it('takes the gap the layout states for that placeholder', () => {
    // A deck states its spacing once, on the layout, and almost no slide restates it. Read only
    // the paragraph's own pPr and every block of text runs together.
    const p = page([{ raw: bodyOnSlide }], {
      layout: [{
        ph: 'body',
        idx: 1,
        noBox: true,
        lstStyle: '<a:lstStyle><a:lvl1pPr><a:spcAft><a:spcPts val="1200"/></a:spcAft></a:lvl1pPr></a:lstStyle>',
      }],
    });
    assert.ok(/margin-bottom:12pt/.test(p.css), 'the layout\'s paragraph gap was lost: ' + p.css);
  });

  it('resets the browser\'s own paragraph margin when the deck states none', () => {
    const p = page([{ raw: bodyOnSlide }]);
    assert.ok(/margin-bottom:0/.test(p.css) && /margin-top:0/.test(p.css), p.css);
  });
});

describe('a paragraph laid out the way the deck states it', () => {
  const shape = (body, spPr) => '<p:sp><p:nvSpPr><p:cNvPr name="t"/><p:nvPr/></p:nvSpPr>'
    + '<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="4572000" cy="2743200"/></a:xfrm></p:spPr>'
    + '<p:txBody>' + (spPr || '<a:bodyPr/>') + body + '</p:txBody></p:sp>';

  it('breaks a line where the paragraph does, not only where the paragraph ends', () => {
    // A real deck writes a:br between the runs of one paragraph. Taking the runs alone puts
    // every line of it on one line, and a block of instructions reads as one sentence.
    const p = page([{ raw: shape('<a:p><a:r><a:t>go to</a:t></a:r><a:br/>'
      + '<a:r><a:t>Insert</a:t></a:r></a:p>') }]);
    assert.ok(/go to<br>Insert/.test(p.html), p.html);
  });

  it('draws the bullet character its level names', () => {
    const p = page([{ raw: shape('<a:p><a:pPr marL="228600" indent="-228600">'
      + '<a:buChar char="•"/></a:pPr><a:r><a:t>One</a:t></a:r></a:p>') }]);
    assert.ok(/<p[^>]*><span[^>]*>•<\/span>/.test(p.html), p.html);
    assert.ok(/text-indent:-18pt/.test(p.css), 'the hanging indent is missing: ' + p.css);
    assert.ok(/width:18pt/.test(p.css), 'the bullet does not hold the text out to marL: ' + p.css);
  });

  it('numbers an automatic list from one, counting within its own level', () => {
    const p = page([{ raw: shape('<a:p><a:pPr><a:buAutoNum type="arabicPeriod"/></a:pPr>'
      + '<a:r><a:t>One</a:t></a:r></a:p>'
      + '<a:p><a:pPr><a:buAutoNum type="arabicPeriod"/></a:pPr><a:r><a:t>Two</a:t></a:r></a:p>') }]);
    assert.ok(/>1\. <\/span>/.test(p.html) && />2\. <\/span>/.test(p.html), p.html);
  });

  it('takes buNone as a statement, not as saying nothing', () => {
    // A master gives every level a dot; a layout or a paragraph turns it off by naming buNone,
    // and a reader that only looks for a character keeps drawing the one above.
    const dotted = '<a:bodyPr/><a:lstStyle><a:lvl1pPr><a:buChar char="•"/></a:lvl1pPr></a:lstStyle>';
    const p = page([{
      raw: shape('<a:p><a:r><a:t>Dotted</a:t></a:r></a:p>'
        + '<a:p><a:pPr><a:buNone/></a:pPr><a:r><a:t>Plain</a:t></a:r></a:p>', dotted),
    }]);
    assert.strictEqual((p.html.match(/•/g) || []).length, 1, 'buNone was read as saying nothing: ' + p.html);
    assert.ok(p.html.indexOf('•') < p.html.indexOf('Dotted'), p.html);
  });

  it('lets a paragraph reset the indent it inherits by stating zero', () => {
    // marL="0" indent="0" is what PowerPoint writes for a flush bullet-free paragraph. Read as
    // "stated nothing", the layer above wins and the line renders indented to the right of it.
    const indented = '<a:bodyPr/><a:lstStyle><a:lvl1pPr marL="342900" indent="-342900">'
      + '<a:buChar char="•"/></a:lvl1pPr></a:lstStyle>';
    const p = page([{
      raw: shape('<a:p><a:pPr marL="0" indent="0"><a:buNone/></a:pPr><a:r><a:t>Flush</a:t></a:r></a:p>'
        + '<a:p><a:pPr marL="0" indent="0"/><a:r><a:t>Dotted</a:t></a:r></a:p>', indented),
    }]);
    assert.ok(/padding-left:0/.test(p.css), p.css);
    assert.ok(!/padding-left:27pt/.test(p.css), 'the inherited indent survived the reset: ' + p.css);
    // The second paragraph keeps the bullet and still resets the hang it comes with.
    assert.ok(/•/.test(p.html), p.html);
    assert.ok(!/text-indent/.test(p.css), 'the inherited hanging indent survived the reset: ' + p.css);
  });

  it('leaves the hanging indent off a paragraph with no bullet', () => {
    // Applied alone it pulls the first line out to the left of the rest, which reads as the
    // paragraph being broken rather than as it being indented.
    const p = page([{ raw: shape('<a:p><a:pPr marL="228600" indent="-228600"><a:buNone/></a:pPr>'
      + '<a:r><a:t>Plain</a:t></a:r></a:p>') }]);
    assert.ok(/padding-left:18pt/.test(p.css), p.css);
    assert.ok(!/text-indent/.test(p.css), p.css);
  });

  it('spaces the lines by the exact height lnSpc states, not only by a percentage', () => {
    const p = page([{ raw: shape('<a:p><a:pPr><a:lnSpc><a:spcPts val="1800"/></a:lnSpc></a:pPr>'
      + '<a:r><a:t>One</a:t></a:r></a:p>') }]);
    assert.ok(/line-height:18pt/.test(p.css), p.css);
  });

  it('shrinks text by the scale PowerPoint recorded when it autofitted the shape', () => {
    // PowerPoint writes down what it did to make the text fit. Unread, the shape renders at the
    // size the chain states and spills out of the box the deck drew.
    const body = '<a:p><a:pPr><a:lnSpc><a:spcPct val="100000"/></a:lnSpc></a:pPr>'
      + '<a:r><a:rPr sz="2000"/><a:t>Long</a:t></a:r></a:p>';
    const p = page([{ raw: shape(body, '<a:bodyPr><a:normAutofit fontScale="62500" lnSpcReduction="20000"/></a:bodyPr>') }]);
    assert.ok(/font-size:12\.5pt/.test(p.css), p.css);
    assert.ok(/line-height:0\.96/.test(p.css), p.css);
  });
});

describe('the shapes a deck draws with no text and no fill', () => {
  const connector = '<p:cxnSp><p:nvCxnSpPr><p:cNvPr name="rule"/><p:nvPr/></p:nvCxnSpPr>'
    + '<p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="9144000" cy="0"/></a:xfrm>'
    + '<a:prstGeom prst="line"/><a:ln w="25400"><a:solidFill><a:srgbClr val="D24726"/></a:solidFill></a:ln>'
    + '</p:spPr></p:cxnSp>';

  it('draws a connector, which is where a deck keeps its rules', () => {
    const p = page([{ title: 'T', raw: connector }]);
    assert.ok(/border-top:2pt solid #d24726/.test(p.css), 'the rule under the title is missing: ' + p.css);
  });

  it('caps a drawn line with the arrowhead it names, at one stroke width throughout', () => {
    // The viewBox scales x and y by different amounts; a stroke scaled with it comes out thin on
    // one edge and thick on the next, which is what makes a line drawing read as broken.
    const arrow = '<p:sp><p:nvSpPr><p:cNvPr name="a"/><p:nvPr/></p:nvSpPr><p:spPr>'
      + '<a:xfrm><a:off x="0" y="0"/><a:ext cx="1828800" cy="457200"/></a:xfrm>'
      + '<a:prstGeom prst="arc"><a:avLst/></a:prstGeom>'
      + '<a:ln w="25400"><a:solidFill><a:srgbClr val="D24726"/></a:solidFill>'
      + '<a:tailEnd type="triangle"/></a:ln></p:spPr></p:sp>';
    const p = page([{ raw: arrow }]);
    assert.ok(/<marker id="(m\d+)"[^>]*>[\s\S]*?<\/marker>/.test(p.html), p.html);
    assert.ok(/marker-end="url\(#m\d+\)"/.test(p.html), p.html);
    assert.ok(/vector-effect="non-scaling-stroke"/.test(p.html), p.html);
    assert.ok(/stroke-width:2pt/.test(p.html), p.html);
  });

  it('draws a freeform as the path it states, not as its bounding box', () => {
    // A box with an outline where an icon belongs is worse than nothing: it reads as a shape
    // the deck never drew.
    const freeform = '<p:sp><p:nvSpPr><p:cNvPr name="bulb"/><p:nvPr/></p:nvSpPr><p:spPr>'
      + '<a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm>'
      + '<a:custGeom><a:pathLst><a:path w="100" h="100">'
      + '<a:moveTo><a:pt x="0" y="0"/></a:moveTo>'
      + '<a:lnTo><a:pt x="100" y="0"/></a:lnTo>'
      + '<a:cubicBezTo><a:pt x="100" y="50"/><a:pt x="50" y="100"/><a:pt x="0" y="100"/></a:cubicBezTo>'
      + '<a:close/></a:path></a:pathLst></a:custGeom>'
      + '<a:solidFill><a:srgbClr val="00FF00"/></a:solidFill>'
      + '<a:ln w="12700"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:ln>'
      + '</p:spPr></p:sp>';
    const p = page([{ raw: freeform }]);
    assert.ok(/<svg viewBox="0 0 100 100"/.test(p.html), p.html);
    assert.ok(/d="M0,0L100,0C100,50 50,100 0,100Z"/.test(p.html), p.html);
    assert.ok(/fill="#00ff00"/.test(p.html) && /stroke="#ff0000"/.test(p.html), p.html);
    assert.ok(!/border:/.test(p.css), 'the box must not be framed as well: ' + p.css);
  });
});

describe('a table on a slide', () => {
  const table = (rows) => '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr name="t"/><p:nvPr/></p:nvGraphicFramePr>'
    + '<p:xfrm><a:off x="914400" y="914400"/><a:ext cx="5486400" cy="1828800"/></p:xfrm>'
    + '<a:graphic><a:graphicData><a:tbl>'
    + '<a:tblGrid><a:gridCol w="1828800"/><a:gridCol w="1828800"/><a:gridCol w="1828800"/></a:tblGrid>'
    + rows + '</a:tbl></a:graphicData></a:graphic></p:graphicFrame>';
  const cell = (text, attrs = '') => `<a:tc${attrs}><a:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></a:txBody>`
    + '<a:tcPr><a:solidFill><a:srgbClr val="4080C0"/></a:solidFill></a:tcPr></a:tc>';

  it('draws it, where a reader that walks only p:sp shows nothing at all', () => {
    const p = page([{ raw: table('<a:tr h="457200">' + cell('Region') + cell('Q1') + cell('Q2') + '</a:tr>') }]);
    assert.ok(/<table>/.test(p.html), p.html);
    assert.ok(/Region/.test(p.html) && /Q2/.test(p.html), p.html);
    assert.ok(/<col style="width:144pt">/.test(p.html), 'the grid states its column widths: ' + p.html);
    assert.ok(/background:#4080c0/.test(p.css), p.css);
  });

  it('spans a merged cell rather than drawing its covered half beside it', () => {
    const rows = '<a:tr h="457200">' + cell('Wide', ' gridSpan="2"') + cell('', ' hMerge="1"') + cell('Q2') + '</a:tr>';
    const p = page([{ raw: table(rows) }]);
    assert.ok(/colspan="2"/.test(p.html), p.html);
    assert.strictEqual((p.html.match(/<td/g) || []).length, 2, 'the covered cell was drawn too: ' + p.html);
  });
});

describe('a picture keeps the box the slide gives it', () => {
  it('has no rule that would size every image to the whole slide', () => {
    // `.slide img` outranks the class the placement is written on, so a width or height there
    // silently replaces the position the deck states — one picture filling the entire slide.
    const rule = /\.slide img\{([^}]*)\}/.exec(page([{ title: 'T' }]).css);
    assert.ok(rule, 'the img rule is gone entirely');
    assert.ok(!/width|height/.test(rule[1]), 'sizing here overrides every picture\'s own box: ' + rule[1]);
  });
});
