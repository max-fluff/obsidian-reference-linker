'use strict';

// Binding a key to the wrong document writes a wrong `cite:` into someone's note, and the
// note outlives the mistake. So these tests are mostly about when *not* to match.

const { describe, it, assert } = require('../src/shared/testing/harness');
const { buildCitations } = require('../src/citations');

const entry = (key, over) => Object.assign({ key, title: '', year: '', paths: [] }, over);
const ROOT = '/home/u/library';

describe('buildCitations', () => {
  it('matches on the absolute path the bibliography states', () => {
    const c = buildCitations([entry('smith2020', { paths: ['/home/u/library/papers/a.pdf'] })], ['papers/a.pdf'], ROOT);
    assert.strictEqual(c.byKey.get('smith2020').rel, 'papers/a.pdf');
    assert.strictEqual(c.byPath.get('papers/a.pdf'), 'smith2020');
    assert.strictEqual(c.matched, 1);
  });

  it('matches on the path tail when the library sits elsewhere on this machine', () => {
    const c = buildCitations([entry('k', { paths: ['D:\\Zotero\\papers\\a.pdf'] })], ['papers/a.pdf'], ROOT);
    assert.strictEqual(c.byKey.get('k').rel, 'papers/a.pdf');
  });

  it('matches a path the bibliography stated as a file:// URL', () => {
    const c = buildCitations([entry('k', { paths: ['file:///home/u/library/papers/a.pdf'] })], ['papers/a.pdf'], ROOT);
    assert.strictEqual(c.byKey.get('k').rel, 'papers/a.pdf');
    assert.strictEqual(c.byKey.get('k').how, 'path');
  });

  it('matches a Windows file:// URL, where the slash before the drive is the URL’s own', () => {
    const c = buildCitations([entry('k', { paths: ['file:///D:/Zotero/papers/a.pdf'] })], ['papers/a.pdf'], 'D:/Zotero');
    assert.strictEqual(c.byKey.get('k').rel, 'papers/a.pdf');
    assert.strictEqual(c.byKey.get('k').how, 'path');
  });

  it('ignores case and slash direction on both sides', () => {
    const c = buildCitations([entry('k', { paths: ['/HOME/U/Library/Papers/A.PDF'] })], ['papers/a.pdf'], ROOT);
    assert.strictEqual(c.byKey.get('k').rel, 'papers/a.pdf');
  });

  it('falls back to the file name when no path resolves', () => {
    const c = buildCitations([entry('k', { paths: ['/gone/elsewhere/a.pdf'] })], ['papers/a.pdf'], ROOT);
    assert.strictEqual(c.byKey.get('k').rel, 'papers/a.pdf');
    assert.strictEqual(c.byKey.get('k').how, 'name');
  });

  it('falls back to the title, which is all a CSL export gives', () => {
    const c = buildCitations([entry('k', { title: 'A Study of Things!' })], ['papers/a study of things.pdf'], ROOT);
    assert.strictEqual(c.byKey.get('k').rel, 'papers/a study of things.pdf');
    assert.strictEqual(c.byKey.get('k').how, 'title');
  });

  it('refuses a name that two documents answer to', () => {
    const c = buildCitations([entry('k', { paths: ['/gone/a.pdf'] })], ['one/a.pdf', 'two/a.pdf'], ROOT);
    assert.strictEqual(c.byKey.get('k').rel, null);
    assert.strictEqual(c.matched, 0);
  });

  it('refuses a title that two documents answer to', () => {
    const c = buildCitations([entry('k', { title: 'Report' })], ['one/report.pdf', 'two/Report.pdf'], ROOT);
    assert.strictEqual(c.byKey.get('k').rel, null);
  });

  it('prefers the stated path over a same-named document elsewhere', () => {
    const c = buildCitations([entry('k', { paths: ['/home/u/library/two/a.pdf'] })], ['one/a.pdf', 'two/a.pdf'], ROOT);
    assert.strictEqual(c.byKey.get('k').rel, 'two/a.pdf');
    assert.strictEqual(c.byKey.get('k').how, 'path');
  });

  it('keeps an unmatched key, since the reader may still type it', () => {
    const c = buildCitations([entry('ghost', { paths: ['/nowhere/x.pdf'] })], ['papers/a.pdf'], ROOT);
    assert.ok(c.byKey.has('ghost'));
    assert.strictEqual(c.byKey.get('ghost').rel, null);
    assert.strictEqual(c.keys, 1);
    assert.strictEqual(c.matched, 0);
  });

  it('resolves a key case-insensitively but keeps it as written', () => {
    const c = buildCitations([entry('Smith2020', { paths: ['/home/u/library/a.pdf'] })], ['a.pdf'], ROOT);
    assert.strictEqual(c.byKey.get('smith2020').key, 'Smith2020');
  });

  it('keeps the first of a duplicated key, the way BibTeX itself resolves it', () => {
    const entries = [entry('k', { paths: ['/home/u/library/one.pdf'] }), entry('k', { paths: ['/home/u/library/two.pdf'] })];
    const c = buildCitations(entries, ['one.pdf', 'two.pdf'], ROOT);
    assert.strictEqual(c.byKey.get('k').rel, 'one.pdf');
    assert.strictEqual(c.keys, 1);
  });

  it('is empty rather than absent when there is no bibliography', () => {
    const c = buildCitations([], ['a.pdf'], ROOT);
    assert.strictEqual(c.keys, 0);
    assert.strictEqual(c.byPath.size, 0);
  });
});
