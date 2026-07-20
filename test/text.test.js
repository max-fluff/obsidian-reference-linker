'use strict';

const { describe, it, assert } = require('../src/shared/testing/harness');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readOutline, readSection } = require('../src/formats/text');

const tmp = (body, name = 'doc.md') => {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'reflinker-')), name);
  fs.writeFileSync(p, body, 'utf8');
  return p;
};

describe('text outline', () => {
  it('puts an ATX heading on its line', async () => {
    const o = await readOutline(tmp('intro\n\n## Setup\ntext\n'));
    assert.deepStrictEqual(o, [{ title: 'Setup', page: 3 }]);
  });

  it('reads every heading level', async () => {
    const o = await readOutline(tmp('# One\n## Two\n###### Six\n'));
    assert.deepStrictEqual(o.map((h) => h.title), ['One', 'Two', 'Six']);
  });

  it('trims closing hashes', async () => {
    const o = await readOutline(tmp('## Setup ##\n'));
    assert.strictEqual(o[0].title, 'Setup');
  });

  it('takes a setext heading as the line above its underline', async () => {
    const o = await readOutline(tmp('Title\n=====\nbody\n'));
    assert.deepStrictEqual(o, [{ title: 'Title', page: 1 }]);
  });

  it('ignores a heading inside a fenced block', async () => {
    const o = await readOutline(tmp('# Real\n\n```sh\n# not a heading\ncd x\n```\n\n## Also real\n'));
    assert.deepStrictEqual(o.map((h) => h.title), ['Real', 'Also real']);
  });

  it('ignores a tilde-fenced block too', async () => {
    const o = await readOutline(tmp('# Real\n~~~\n# hidden\n~~~\n'));
    assert.deepStrictEqual(o.map((h) => h.title), ['Real']);
  });

  it('does not take a seven-hash line for a heading', async () => {
    assert.deepStrictEqual(await readOutline(tmp('####### nope\n')), []);
  });

  it('does not take a hash with no space for a heading', async () => {
    assert.deepStrictEqual(await readOutline(tmp('#nope\n')), []);
  });

  it('is empty for a file that is not there', async () => {
    assert.deepStrictEqual(await readOutline(path.join(os.tmpdir(), 'no-such-reflinker.md')), []);
  });
});

describe('text section', () => {
  it('runs from its heading to the line before the next', async () => {
    const file = tmp('# One\nalpha\nbeta\n# Two\ngamma\n');
    const sec = await readSection(file, 1);
    assert.strictEqual(sec.title, 'One');
    assert.deepStrictEqual(sec.body, ['alpha', 'beta']);
    assert.strictEqual(sec.total, 2);
  });

  it('runs the last section to the end of the file', async () => {
    const sec = await readSection(tmp('# One\na\n# Two\nlast\n'), 3);
    assert.strictEqual(sec.title, 'Two');
    assert.deepStrictEqual(sec.body, ['last']);
  });

  it('previews from the top when the file has no headings', async () => {
    const sec = await readSection(tmp('just\nsome notes\n', 'notes.txt'), 1);
    assert.strictEqual(sec.title, '');
    assert.deepStrictEqual(sec.body, ['just', 'some notes']);
  });
});
