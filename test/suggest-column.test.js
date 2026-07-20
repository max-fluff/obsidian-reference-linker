'use strict';

// The suggestion's middle column. A doc corpus repeats headings (NAME, OPTIONS) across every
// file, so an HTML/EPUB section is told apart by its file, not by a page number it hasn't got.

const { describe, it, assert } = require('../src/shared/testing/harness');
const { installStubs } = require('../src/shared/testing/stubs');

installStubs();

// The column function the shared suggester is configured with.
let kindText;
{
  const nodePath = require('path');
  const formats = require('../src/formats');
  const baseName = (p) => nodePath.basename(p).replace(/\.[^.]+$/, '');
  kindText = (e) => {
    if (e.kind !== 'section') return e.lang;
    return formats.anchorKind(e.lang) === 'page' ? 'p.' + e.page : baseName(e.path);
  };
}

const section = (lang, path, page) => ({ kind: 'section', lang, path, page });

describe('suggestion middle column', () => {
  it('shows the page for a PDF section — the page is real', () => {
    assert.strictEqual(kindText(section('pdf', 'Spec.pdf', 7)), 'p.7');
  });

  it('shows the file for an HTML section, since "p.5" would mean the 5th heading', () => {
    assert.strictEqual(kindText(section('html', 'docs/git-add.html', 5)), 'git-add');
  });

  it('shows the file for an EPUB chapter', () => {
    assert.strictEqual(kindText(section('epub', 'books/handbook.epub', 3)), 'handbook');
  });

  it('tells two identically-named sections apart by their file', () => {
    assert.notStrictEqual(
      kindText(section('html', 'docs/git-add.html', 5)),
      kindText(section('html', 'docs/git-commit.html', 5)),
    );
  });

  it('shows the extension for a file entry, unchanged', () => {
    assert.strictEqual(kindText({ kind: 'file', lang: 'html', path: 'docs/x.html' }), 'html');
  });
});
