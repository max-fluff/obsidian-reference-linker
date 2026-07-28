'use strict';

// The shapes Zotero, Better BibTeX and JabRef actually emit, plus the malformed ones: the
// file is someone else's and is never validated before we read it.

const { describe, it, assert } = require('../src/shared/testing/harness');
const { parseBibtex, parseCsl, parseBibliography, attachmentPaths } = require('../src/bib');

describe('parseBibtex', () => {
  it('reads a key, a type and its fields', () => {
    const [e] = parseBibtex('@article{smith2020,\n  title = {A Study},\n  year = 2020\n}');
    assert.strictEqual(e.key, 'smith2020');
    assert.strictEqual(e.type, 'article');
    assert.strictEqual(e.fields.title, 'A Study');
    assert.strictEqual(e.fields.year, '2020');
  });

  it('takes a value brace-delimited, quoted or bare', () => {
    const [e] = parseBibtex('@book{k, a = {braced}, b = "quoted", c = 42}');
    assert.strictEqual(e.fields.a, 'braced');
    assert.strictEqual(e.fields.b, 'quoted');
    assert.strictEqual(e.fields.c, '42');
  });

  it('drops the braces that only protect capitalisation', () => {
    const [e] = parseBibtex('@article{k, title = {The {DNA} of {IT}}}');
    assert.strictEqual(e.fields.title, 'The DNA of IT');
  });

  it('keeps a quoted value holding braces in one piece', () => {
    const [e] = parseBibtex('@article{k, title = "A {Study} of Things"}');
    assert.strictEqual(e.fields.title, 'A Study of Things');
  });

  it('expands a @string macro and concatenates with #', () => {
    const text = '@string{jos = "Journal of Silly"}\n@article{k, journal = jos # " Walks"}';
    const [e] = parseBibtex(text);
    assert.strictEqual(e.fields.journal, 'Journal of Silly Walks');
  });

  it('skips @comment and @preamble without losing the entry after them', () => {
    const text = '@comment{jabref-meta: {databaseType:bibtex;}}\n@preamble{"\\newcommand{\\x}{y}"}\n@article{k, title = {Kept}}';
    const entries = parseBibtex(text);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].fields.title, 'Kept');
  });

  it('lowercases field names, since BibTeX does not care about their case', () => {
    const [e] = parseBibtex('@Article{k, Title = {X}, YEAR = 1999}');
    assert.strictEqual(e.fields.title, 'X');
    assert.strictEqual(e.fields.year, '1999');
  });

  it('reads an entry written with parentheses', () => {
    const [e] = parseBibtex('@article(k, title = {Paren})');
    assert.strictEqual(e.key, 'k');
    assert.strictEqual(e.fields.title, 'Paren');
  });

  it('survives a trailing comma and a missing final brace', () => {
    const entries = parseBibtex('@article{k, title = {X},\n');
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].fields.title, 'X');
  });

  it('lets a malformed entry cost only itself', () => {
    const entries = parseBibtex('@article{bad, nonsense here}\n@article{good, title = {X}}');
    assert.ok(entries.some((e) => e.key === 'good'), 'the well-formed entry after a broken one is lost');
  });

  it('reads nothing out of an empty or junk file rather than throwing', () => {
    assert.deepStrictEqual(parseBibtex(''), []);
    assert.deepStrictEqual(parseBibtex('not a bibliography at all'), []);
    assert.deepStrictEqual(parseBibtex(null), []);
  });
});

describe('attachmentPaths', () => {
  it('takes the middle of the description:path:mimetype Zotero writes', () => {
    const raw = 'Full Text PDF:/home/u/Zotero/storage/AB/Smith - 2020.pdf:application/pdf';
    assert.deepStrictEqual(attachmentPaths(raw), ['/home/u/Zotero/storage/AB/Smith - 2020.pdf']);
  });

  it('keeps a Windows drive letter, whose colon splits like a separator', () => {
    const raw = 'Full Text PDF:C:\\Users\\me\\refs\\paper.pdf:application/pdf';
    assert.deepStrictEqual(attachmentPaths(raw), ['C:\\Users\\me\\refs\\paper.pdf']);
  });

  it('reads the empty description JabRef leaves', () => {
    assert.deepStrictEqual(attachmentPaths(':papers/a.pdf:PDF'), ['papers/a.pdf']);
  });

  it('reads a bare path written by hand', () => {
    assert.deepStrictEqual(attachmentPaths('papers/a.pdf'), ['papers/a.pdf']);
    assert.deepStrictEqual(attachmentPaths('C:\\refs\\a.pdf'), ['C:\\refs\\a.pdf']);
  });

  it('splits several attachments and unescapes the separators Mendeley writes', () => {
    const raw = ':a\\:b/one.pdf:PDF;:two.pdf:PDF';
    assert.deepStrictEqual(attachmentPaths(raw), ['a:b/one.pdf', 'two.pdf']);
  });

  it('is empty for a missing or blank field', () => {
    assert.deepStrictEqual(attachmentPaths(''), []);
    assert.deepStrictEqual(attachmentPaths(undefined), []);
    assert.deepStrictEqual(attachmentPaths(';;'), []);
  });
});

describe('parseCsl', () => {
  it('reads the id as the key, with title and year', () => {
    const json = JSON.stringify([{ id: 'smith2020', type: 'article-journal', title: 'A Study', issued: { 'date-parts': [[2020, 3]] } }]);
    const [e] = parseCsl(json);
    assert.strictEqual(e.key, 'smith2020');
    assert.strictEqual(e.fields.title, 'A Study');
    assert.strictEqual(e.fields.year, '2020');
  });

  it('reads nothing out of malformed JSON or a non-array rather than throwing', () => {
    assert.deepStrictEqual(parseCsl('{'), []);
    assert.deepStrictEqual(parseCsl('{"id":"x"}'), []);
  });
});

describe('parseBibliography', () => {
  it('tells CSL-JSON from BibTeX by what the file starts with', () => {
    const csl = parseBibliography('[{"id":"a","title":"T"}]');
    assert.deepStrictEqual(csl.map((e) => e.key), ['a']);
    const bib = parseBibliography('@article{b, title = {T}}');
    assert.deepStrictEqual(bib.map((e) => e.key), ['b']);
  });

  it('carries the attachment paths through', () => {
    const [e] = parseBibliography('@article{k, file = {PDF:/refs/a.pdf:application/pdf}}');
    assert.deepStrictEqual(e.paths, ['/refs/a.pdf']);
  });

  it('gives a CSL entry no paths, since the export drops attachments', () => {
    const [e] = parseBibliography('[{"id":"a","title":"T"}]');
    assert.deepStrictEqual(e.paths, []);
  });
});
