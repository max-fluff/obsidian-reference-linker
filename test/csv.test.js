'use strict';

// A CSV is a text file that is really a table. The parse is the whole of it: a naive split on
// the delimiter tears every quoted field that holds one.

const { describe, it, assert } = require('../src/shared/testing/harness');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { installStubs } = require('../src/shared/testing/stubs');

installStubs();

const csv = require('../src/formats/csv');

const tmp = (name, text) => {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'reflinker-')), name);
  fs.writeFileSync(p, text);
  return p;
};

describe('parsing', () => {
  it('reads plain rows', () => {
    assert.deepStrictEqual(csv.parse('a,b\n1,2\n', ','), [['a', 'b'], ['1', '2']]);
  });

  it('keeps a delimiter that sits inside a quoted field', () => {
    assert.deepStrictEqual(csv.parse('name,note\nAcme,"up, sharply"\n', ','), [['name', 'note'], ['Acme', 'up, sharply']]);
  });

  it('reads a doubled quote as one literal quote', () => {
    assert.deepStrictEqual(csv.parse('said\n"he ""left"" early"\n', ','), [['said'], ['he "left" early']]);
  });

  it('keeps a newline inside a quoted field', () => {
    assert.deepStrictEqual(csv.parse('a\n"one\ntwo"\n', ','), [['a'], ['one\ntwo']]);
  });

  it('handles CRLF line endings', () => {
    assert.deepStrictEqual(csv.parse('a,b\r\n1,2\r\n', ','), [['a', 'b'], ['1', '2']]);
  });

  it('drops rows that are entirely empty', () => {
    assert.deepStrictEqual(csv.parse('a\n\n\nb\n', ','), [['a'], ['b']]);
  });
});

describe('the delimiter', () => {
  it('is a tab for a .tsv whatever the content', () => {
    assert.strictEqual(csv.delimiter('a,b,c\n', 'tsv'), '\t');
  });

  it('is guessed from the first line', () => {
    assert.strictEqual(csv.delimiter('a\tb\tc\n', 'csv'), '\t');
    assert.strictEqual(csv.delimiter('a;b;c\n', 'csv'), ';');
    assert.strictEqual(csv.delimiter('a,b,c\n', 'csv'), ',');
  });

  it('prefers a comma when a field happens to hold a semicolon', () => {
    assert.strictEqual(csv.delimiter('a,b,"c; still one field"\n', 'csv'), ',');
  });
});

describe('the grid', () => {
  it('trims each cell and drops a blank rim', () => {
    assert.deepStrictEqual(csv.grid(tmp('a.csv', ' a , b \n 1 , 2 \n'), 'csv'), [['a', 'b'], ['1', '2']]);
  });

  it('strips a UTF-8 BOM rather than reading it into the first cell', () => {
    assert.deepStrictEqual(csv.grid(tmp('a.csv', '﻿a,b\n1,2\n'), 'csv'), [['a', 'b'], ['1', '2']]);
  });

  it('is an empty grid for an empty file, not null', () => {
    assert.deepStrictEqual(csv.grid(tmp('a.csv', '   \n'), 'csv'), []);
  });

  it('is null for a file that cannot be read', () => {
    assert.strictEqual(csv.grid('/no/such/file.csv', 'csv'), null);
  });
});

describe('through the registry', () => {
  const formats = require('../src/formats');

  it('is a known extension that previews but has no outline', () => {
    assert.ok(formats.knownExtensions().includes('.csv'));
    assert.ok(formats.knownExtensions().includes('.tsv'));
    assert.ok(formats.canPreview('csv'));
    assert.ok(!formats.canOutline('csv'));
  });

  it('carries no anchor', () => {
    assert.strictEqual(formats.anchorKind('csv'), null);
  });
});
