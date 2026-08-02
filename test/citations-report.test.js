'use strict';

// What the vault cites is read off the links themselves, not off the bibliography: the
// bibliography says what could be cited, the notes say what was.

const { describe, it, assert } = require('../src/shared/testing/harness');
const { installStubs } = require('../src/shared/testing/stubs');

installStubs();

const { keysIn, collect, report } = require('../src/citations-report');
const { buildCitations } = require('../src/citations');

const cited = (key) => '[paper](file:///{ref-root}/papers/a.pdf "cite:' + key + '")';

describe('keysIn', () => {
  it('reads the key a link is pinned to', () => {
    assert.deepStrictEqual(keysIn('see ' + cited('knuth1984') + ' for more'), ['knuth1984']);
  });

  it('reads every link in the note, in order', () => {
    assert.deepStrictEqual(keysIn(cited('b2020') + '\n' + cited('a1999')), ['b2020', 'a1999']);
  });

  it('ignores a link pinned to a section rather than a key', () => {
    assert.deepStrictEqual(keysIn('[x](file:///{ref-root}/a.pdf "sec:Methods")'), []);
  });

  // A title that is a reader's tooltip is not a binding, and a code link's binding is not ours.
  it('ignores a plain tooltip and the code linker’s own binding', () => {
    assert.deepStrictEqual(keysIn('[x](a.pdf "just a note") [y](b.cs "sym:Player kind:class")'), []);
  });

  it('reads a key holding characters that had to be escaped', () => {
    assert.deepStrictEqual(keysIn('[x](a.pdf "cite:sm%20ith%3A2020")'), ['sm ith:2020']);
  });

  it('finds nothing in an empty or missing note', () => {
    assert.deepStrictEqual(keysIn(''), []);
    assert.deepStrictEqual(keysIn(null), []);
  });
});

describe('collect', () => {
  const notes = [
    { path: 'a.md', text: cited('knuth1984') + cited('knuth1984') },
    { path: 'sub/b.md', text: cited('KNUTH1984') + cited('smith2020') },
  ];

  it('counts every use but lists each note once', () => {
    const got = collect(notes).get('knuth1984');
    assert.strictEqual(got.uses, 3);
    assert.deepStrictEqual(got.notes, ['a.md', 'sub/b.md']);
  });

  // A bibliography is case-insensitive about keys; a reader is not, so the first spelling wins.
  it('folds case together and keeps the key as first written', () => {
    assert.strictEqual(collect(notes).get('knuth1984').key, 'knuth1984');
    assert.strictEqual(collect(notes).size, 2);
  });
});

describe('report', () => {
  const citations = () => buildCitations(
    [{ key: 'knuth1984', title: '', year: '', paths: ['/lib/papers/a.pdf'] },
      { key: 'orphan1999', title: '', year: '', paths: ['/lib/papers/gone.pdf'] }],
    ['papers/a.pdf'],
    '/lib',
  );

  it('names the document a key matched', () => {
    const out = report(collect([{ path: 'a.md', text: cited('knuth1984') }]), citations());
    assert.ok(out.includes('| knuth1984 | `papers/a.pdf` |'), out);
  });

  it('says so when the bibliography knows the key but nothing matched it', () => {
    const out = report(collect([{ path: 'a.md', text: cited('orphan1999') }]), citations());
    assert.ok(out.includes('— no document matched —'), out);
  });

  // A note may pin a key the bibliography has since dropped; that is the case worth seeing.
  it('says so when a note cites a key the bibliography does not carry', () => {
    const out = report(collect([{ path: 'a.md', text: cited('vanished2001') }]), citations());
    assert.ok(out.includes('— not in the bibliography —'), out);
  });

  it('links each citing note by path and captions it by name', () => {
    const out = report(collect([{ path: 'sub/b.md', text: cited('knuth1984') }]), citations());
    assert.ok(out.includes('[[sub/b|b]]'), out);
  });

  it('sorts the keys so the report does not churn between runs', () => {
    const out = report(collect([{ path: 'a.md', text: cited('zzz') + cited('aaa') }]), citations());
    assert.ok(out.indexOf('| aaa ') < out.indexOf('| zzz '), out);
  });

  // A pipe in a key would otherwise split the row into another column.
  it('escapes a pipe rather than breaking the table', () => {
    const out = report(collect([{ path: 'a.md', text: '[x](a.pdf "cite:od%7Cd")' }]), citations());
    assert.ok(out.includes('od\\|d'), out);
  });
});

describe('exporting the report', () => {
  const path = require('path');
  const { fakeApp } = require('../src/shared/testing/stubs');

  const load = async (notes, taken) => {
    const Plugin = require(path.join(__dirname, '..', 'src', 'main.js'));
    const plugin = new Plugin(fakeApp, { version: '0.0.0', id: 'reference-linker', dir: '.' });
    await plugin.onload();
    const written = [];
    plugin.app = Object.assign({}, fakeApp, {
      vault: Object.assign({}, fakeApp.vault, {
        getMarkdownFiles: () => notes.map((n) => ({ path: n.path })),
        cachedRead: (f) => Promise.resolve((notes.find((n) => n.path === f.path) || {}).text || ''),
        create: (p, body) => {
          if ((taken || []).includes(p)) return Promise.reject(new Error('exists'));
          written.push({ path: p, body });
          return Promise.resolve({ path: p });
        },
      }),
      workspace: Object.assign({}, fakeApp.workspace),
    });
    return { plugin, written };
  };

  it('writes what the notes cite', async () => {
    const { plugin, written } = await load([{ path: 'a.md', text: cited('knuth1984') }]);
    const file = await plugin.exportCitations();
    assert.strictEqual(written.length, 1);
    assert.strictEqual(file.path, 'Citations used.md');
    assert.ok(written[0].body.includes('knuth1984'), written[0].body);
  });

  // A report is a snapshot: last week's may still be open, so a new one takes a new name.
  it('never overwrites a report already there', async () => {
    const { plugin, written } = await load([{ path: 'a.md', text: cited('knuth1984') }], ['Citations used.md']);
    const file = await plugin.exportCitations();
    assert.strictEqual(file.path, 'Citations used 2.md');
    assert.strictEqual(written.length, 1);
  });

  it('writes nothing at all when no link is pinned to a key', async () => {
    const { plugin, written } = await load([{ path: 'a.md', text: '[x](a.pdf "sec:Methods")' }]);
    assert.strictEqual(await plugin.exportCitations(), undefined);
    assert.deepStrictEqual(written, []);
  });
});
