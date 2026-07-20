'use strict';

// Regressions from the review: a malformed numeric entity once threw and aborted the whole
// file; single-quoted attributes returned null and broke EPUBs that used them; the common
// named entities were left as literal text.

const { describe, it, assert } = require('../src/shared/testing/harness');
const { decodeEntities, attr } = require('../src/xml');

describe('decodeEntities', () => {
  it('does not throw on a numeric reference past the last code point', () => {
    assert.strictEqual(decodeEntities('A&#x110000;B'), 'A&#x110000;B');
    assert.strictEqual(decodeEntities('A&#99999999;B'), 'A&#99999999;B');
  });

  it('still decodes valid numeric references', () => {
    assert.strictEqual(decodeEntities('&#65;&#x42;'), 'AB');
  });

  it('decodes the common named entities, not just the five XML ones', () => {
    assert.strictEqual(decodeEntities('&nbsp;').charCodeAt(0), 0x20);
    assert.strictEqual(decodeEntities('&mdash;').charCodeAt(0), 0x2014);
    assert.strictEqual(decodeEntities('&copy;').charCodeAt(0), 0xa9);
    assert.strictEqual(decodeEntities('&amp;&lt;&gt;'), '&<>');
  });

  it('leaves an unknown named entity as written', () => {
    assert.strictEqual(decodeEntities('&notareal;'), '&notareal;');
  });
});

describe('attr', () => {
  it('reads a double-quoted value', () => {
    assert.strictEqual(attr('<rootfile full-path="OEBPS/x.opf"/>', 'full-path'), 'OEBPS/x.opf');
  });

  it('reads a single-quoted value — well-formed XML some producers emit', () => {
    assert.strictEqual(attr("<rootfile full-path='OEBPS/x.opf'/>", 'full-path'), 'OEBPS/x.opf');
  });

  it('is null when the attribute is absent', () => {
    assert.strictEqual(attr('<rootfile media-type="x"/>', 'full-path'), null);
  });
});
