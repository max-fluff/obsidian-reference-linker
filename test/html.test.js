'use strict';

// Anchoring is decided per heading, not per file: generated docs put an id on nearly every
// heading, but the page title usually has none, and hand-saved pages may have none at all.

const { describe, it, assert } = require('../src/shared/testing/harness');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readOutline, readSection } = require('../src/formats/html');

const tmp = (body) => {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'reflinker-')), 'doc.html');
  fs.writeFileSync(p, '<html><body>' + body + '</body></html>', 'utf8');
  return p;
};

describe('html outline', () => {
  it('anchors a heading that carries an id', async () => {
    const o = await readOutline(tmp('<h2 id="_options">OPTIONS</h2><p>x</p>'));
    assert.deepStrictEqual(o, [{ title: 'OPTIONS', page: 1, anchor: '_options' }]);
  });

  it('indexes a heading with no id, but without an anchor', async () => {
    const o = await readOutline(tmp('<h1>Manual Page</h1>'));
    assert.deepStrictEqual(o, [{ title: 'Manual Page', page: 1, anchor: undefined }]);
  });

  it('takes the anchor off a child <a>, as older generators emit it', async () => {
    const o = await readOutline(tmp('<h2><a name="sect_two"></a>Two</h2>'));
    assert.strictEqual(o[0].anchor, 'sect_two');
  });

  it('reads single-quoted and unquoted id attributes', async () => {
    const o = await readOutline(tmp("<h2 id='one'>One</h2><h3 id=two>Two</h3>"));
    assert.deepStrictEqual(o.map((s) => s.anchor), ['one', 'two']);
  });

  it('strips inline markup out of the heading text', async () => {
    const o = await readOutline(tmp('<h2 id="a">Use <code>git&nbsp;add</code> now</h2>'));
    assert.strictEqual(o[0].title, 'Use git add now');
  });

  it('does not mistake a tag that merely starts with h for a heading', async () => {
    const o = await readOutline(tmp('<header>no</header><hgroup>no</hgroup><h2 id="a">Yes</h2>'));
    assert.deepStrictEqual(o.map((s) => s.title), ['Yes']);
  });

  it('numbers sections in document order', async () => {
    const o = await readOutline(tmp('<h1>A</h1><h2 id="b">B</h2><h3 id="c">C</h3>'));
    assert.deepStrictEqual(o.map((s) => s.page), [1, 2, 3]);
  });

  it('is empty for a file that is not there', async () => {
    assert.deepStrictEqual(await readOutline(path.join(os.tmpdir(), 'no-such-reflinker.html')), []);
  });
});

describe('html section text', () => {
  it('takes the text between one heading and the next', async () => {
    const file = tmp('<h2 id="a">A</h2><p>first</p><p>second</p><h2 id="b">B</h2><p>other</p>');
    const sec = await readSection(file, 1);
    assert.strictEqual(sec.title, 'A');
    assert.deepStrictEqual(sec.body, ['first', 'second']);
    assert.strictEqual(sec.total, 2);
  });

  it('runs the last section to the end of the file', async () => {
    const sec = await readSection(tmp('<h2 id="a">A</h2><p>x</p><h2 id="b">B</h2><p>last</p>'), 2);
    assert.deepStrictEqual(sec.body, ['last']);
  });

  it('drops script and style rather than showing their source', async () => {
    const file = tmp('<h2 id="a">A</h2><script>var x=1;</script><style>p{color:red}</style><p>real</p>');
    assert.deepStrictEqual((await readSection(file, 1)).body, ['real']);
  });

  it('keeps the line structure of a code block', async () => {
    const file = tmp('<h2 id="a">A</h2><pre>one\ntwo\nthree</pre>');
    assert.deepStrictEqual((await readSection(file, 1)).body, ['one', 'two', 'three']);
  });

  it('breaks a line at <br>', async () => {
    const file = tmp('<h2 id="a">A</h2><p>one<br>two</p>');
    assert.deepStrictEqual((await readSection(file, 1)).body, ['one', 'two']);
  });

  it('clamps a section past the end to the last one', async () => {
    const sec = await readSection(tmp('<h2 id="a">A</h2><h2 id="b">B</h2>'), 99);
    assert.strictEqual(sec.title, 'B');
    assert.strictEqual(sec.page, 2);
  });

  it('falls back to the whole document when there are no headings at all', async () => {
    const sec = await readSection(tmp('<p>just text</p>'), 1);
    assert.strictEqual(sec.title, '');
    assert.deepStrictEqual(sec.body, ['just text']);
  });
});
