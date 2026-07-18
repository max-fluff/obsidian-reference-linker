'use strict';

// The link binding stored in a markdown title: [text](url "sym:Name kind:class").
// This module is shared with Reference Linker, so these tests guard the format both
// plugins read and write.

const { describe, it, assert } = require('./harness');
const { parseBinding, formatBinding, hashLine, bindStateFrom, LINE_RE, PAGE_RE, ownerOf, bindingOwner, ownsBinding } = require('../src/shared/binding');

describe('parseBinding', () => {
  it('reads the anchors a code link pins to', () => {
    assert.deepStrictEqual(parseBinding('sym:Player kind:class'), { sym: 'Player', kind: 'class', sec: '', hash: '' });
  });

  it('maps the line token onto the hash field', () => {
    assert.deepStrictEqual(parseBinding('line:h7x2k'), { sym: '', kind: '', sec: '', hash: 'h7x2k' });
  });

  it('treats a reader-written tooltip as not ours', () => {
    assert.strictEqual(parseBinding('the movement service'), null);
    assert.strictEqual(parseBinding(''), null);
    assert.strictEqual(parseBinding(null), null);
  });

  it('rejects a title where even one word is not a known token', () => {
    // A stray word must never read as a binding gone missing — that is what keeps a lost
    // binding reportable without crying wolf.
    assert.strictEqual(parseBinding('sym:Player and some prose'), null);
  });

  it('decodes escaped characters in a value', () => {
    const parsed = parseBinding(formatBinding({ sec: 'Chapter 2 (draft)' }));
    assert.strictEqual(parsed.sec, 'Chapter 2 (draft)');
  });
});

describe('formatBinding', () => {
  it('round-trips every anchor', () => {
    const binding = { sym: 'Move', kind: 'method', sec: 'Overview', hash: 'abc123' };
    assert.deepStrictEqual(parseBinding(formatBinding(binding)), binding);
  });

  it('keeps a fixed token order so re-pinning does not churn the text', () => {
    assert.strictEqual(formatBinding({ hash: 'z9', sym: 'A', sec: 'S', kind: 'class' }), 'sym:A kind:class sec:S line:z9');
  });

  it('escapes characters that would break the markdown destination', () => {
    const out = formatBinding({ sec: 'A "quoted" name' });
    assert.ok(!/[\s"]/.test(out.slice('sec:'.length)), `value still holds a space or quote: ${out}`);
    assert.strictEqual(parseBinding(out).sec, 'A "quoted" name');
  });

  it('round-trips a Cyrillic value unescaped', () => {
    assert.strictEqual(parseBinding(formatBinding({ sec: 'Обзор' })).sec, 'Обзор');
  });
});

describe('ownership', () => {
  // Both sigil plugins share the anchor vocabulary, so parseBinding alone can't tell whose
  // binding it read — that is what let each plugin act on the other's links and mark them
  // broken. The owner reads off the anchor set, which is disjoint in practice.
  it('assigns a code binding to the code plugin', () => {
    assert.strictEqual(bindingOwner('sym:Player kind:class'), 'code');
    assert.strictEqual(bindingOwner('line:h7x2k'), 'code');
  });

  it('assigns a document binding to the reference plugin', () => {
    assert.strictEqual(bindingOwner('sec:Overview'), 'reference');
  });

  it('leaves a tooltip and an empty title unowned', () => {
    assert.strictEqual(bindingOwner('the movement service'), null);
    assert.strictEqual(bindingOwner(''), null);
    assert.strictEqual(bindingOwner(null), null);
  });

  it('leaves a binding mixing both sides unowned, so neither plugin acts on it', () => {
    assert.strictEqual(bindingOwner('sym:Player sec:Overview'), null);
  });

  it('ownsBinding gates a plugin to its own links', () => {
    assert.ok(ownsBinding('sym:Player kind:class', 'code'));
    assert.ok(!ownsBinding('sec:Overview', 'code'));
    assert.ok(ownsBinding('sec:Overview', 'reference'));
    assert.ok(!ownsBinding('sym:Player kind:class', 'reference'));
  });

  it('reads the owner off a parsed binding too', () => {
    assert.strictEqual(ownerOf(parseBinding('sec:Overview')), 'reference');
    assert.strictEqual(ownerOf(null), null);
  });

  it('still parses the other side, so ownership is a separate decision from validity', () => {
    // parseBinding stays format-level: a reference binding is well-formed to the code
    // plugin, it simply isn't its to act on. Consumers ask ownsBinding, not parseBinding.
    assert.notStrictEqual(parseBinding('sec:Overview'), null);
    assert.notStrictEqual(parseBinding('sym:Player kind:class'), null);
  });
});

describe('hashLine', () => {
  it('is stable for the same trimmed text', () => {
    assert.strictEqual(hashLine('  public void Move()  '), hashLine('public void Move()'));
  });

  it('separates different lines', () => {
    assert.notStrictEqual(hashLine('public void Move()'), hashLine('public void Spawn()'));
  });

  it('handles empty and missing input without throwing', () => {
    assert.strictEqual(typeof hashLine(''), 'string');
    assert.strictEqual(typeof hashLine(null), 'string');
  });
});

describe('bindStateFrom', () => {
  it('reports nothing when the binding still sits on a match', () => {
    assert.strictEqual(bindStateFrom([10, 40], 10), null);
  });

  it('reports the nearest match when the target drifted', () => {
    assert.deepStrictEqual(bindStateFrom([12, 40], 10), { state: 'stale', line: 12 });
  });

  it('reports broken when nothing matches', () => {
    // Note this is why an unresolvable binding trends to a false "broken" mark today:
    // a plugin that cannot resolve another plugin's anchors finds no hits.
    assert.deepStrictEqual(bindStateFrom([], 10), { state: 'broken' });
  });
});

describe('url anchors', () => {
  it('finds the line a code url points at', () => {
    assert.strictEqual(LINE_RE.exec('file:///root/Player.cs:42')[1], '42');
  });

  it('finds the page a document url points at', () => {
    assert.strictEqual(PAGE_RE.exec('file:///root/Spec.pdf#page=7')[1], '7');
  });
});
