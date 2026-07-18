'use strict';

// The namespaced root placeholder. These tests are the guard on the one thing this change
// must not do: break notes that already carry a bare {root}.

const { describe, it, assert } = require('./harness');
const { rootTokenIn, ownsRootToken, fillRoot, namespaceRoot, OWNER_TOKENS } = require('../src/shared/root-token');

const ROOT = 'D:/work/code';

describe('rootTokenIn', () => {
  it("recognises each plugin's own token", () => {
    assert.strictEqual(rootTokenIn('file:///{code-root}/Player.cs'), 'code');
    assert.strictEqual(rootTokenIn('file:///{ref-root}/Spec.pdf'), 'reference');
  });

  it('recognises the percent-encoded spelling Obsidian may hand back', () => {
    assert.strictEqual(rootTokenIn('file:///%7Bcode-root%7D/Player.cs'), 'code');
    assert.strictEqual(rootTokenIn('file:///%7Broot%7D/Player.cs'), 'legacy');
  });

  it('reports the un-namespaced token as legacy', () => {
    assert.strictEqual(rootTokenIn('file:///{root}/Player.cs'), 'legacy');
  });

  it('does not read {root} out of a namespaced token', () => {
    // The brace has to sit immediately before the name, or {code-root} would also look
    // like a legacy token and get claimed by whoever asked first.
    assert.notStrictEqual(rootTokenIn('file:///{code-root}/Player.cs'), 'legacy');
    assert.notStrictEqual(rootTokenIn('file:///{ref-root}/Spec.pdf'), 'legacy');
  });

  it('reports nothing for a plain url', () => {
    assert.strictEqual(rootTokenIn('file:///D:/abs/Player.cs'), null);
    assert.strictEqual(rootTokenIn(''), null);
    assert.strictEqual(rootTokenIn(null), null);
  });
});

describe('fillRoot', () => {
  it("fills this owner's token", () => {
    assert.strictEqual(fillRoot('file:///{code-root}/Player.cs', { owner: 'code', root: ROOT }), `file:///${ROOT}/Player.cs`);
  });

  it("leaves the other plugin's token alone — the whole point", () => {
    const url = 'file:///{ref-root}/Spec.pdf';
    assert.strictEqual(fillRoot(url, { owner: 'code', root: ROOT }), url);
  });

  it('fills the percent-encoded spelling too', () => {
    assert.strictEqual(fillRoot('file:///%7Bcode-root%7D/a.cs', { owner: 'code', root: ROOT }), `file:///${ROOT}/a.cs`);
  });

  it('leaves a legacy token alone unless the caller claims it', () => {
    const url = 'file:///{root}/Player.cs';
    assert.strictEqual(fillRoot(url, { owner: 'code', root: ROOT }), url);
    assert.strictEqual(fillRoot(url, { owner: 'code', root: ROOT, claimLegacy: true }), `file:///${ROOT}/Player.cs`);
  });

  it('returns the url untouched for an unknown owner', () => {
    const url = 'file:///{code-root}/Player.cs';
    assert.strictEqual(fillRoot(url, { owner: 'nobody', root: ROOT }), url);
    assert.strictEqual(fillRoot(url, {}), url);
  });

  it('fills every occurrence', () => {
    const out = fillRoot('{code-root}/a.cs and {code-root}/b.cs', { owner: 'code', root: ROOT });
    assert.strictEqual(out, `${ROOT}/a.cs and ${ROOT}/b.cs`);
  });
});

describe('ownsRootToken', () => {
  it("claims only this owner's token", () => {
    assert.ok(ownsRootToken('{code-root}/a.cs', 'code'));
    assert.ok(!ownsRootToken('{ref-root}/a.pdf', 'code'));
    assert.ok(ownsRootToken('{ref-root}/a.pdf', 'reference'));
  });

  it("claims a legacy token only on the caller's verdict", () => {
    assert.ok(!ownsRootToken('{root}/a.cs', 'code'));
    assert.ok(ownsRootToken('{root}/a.cs', 'code', true));
  });

  it('claims nothing when there is no token', () => {
    assert.ok(!ownsRootToken('file:///D:/abs/a.cs', 'code', true));
  });
});

describe('namespaceRoot (migration)', () => {
  it("rewrites a legacy token to the owner's namespaced one", () => {
    assert.strictEqual(namespaceRoot('file:///{root}/Player.cs', 'code'), 'file:///{code-root}/Player.cs');
    assert.strictEqual(namespaceRoot('file:///{root}/Spec.pdf', 'reference'), 'file:///{ref-root}/Spec.pdf');
  });

  it('is idempotent — running it twice changes nothing', () => {
    const once = namespaceRoot('file:///{root}/Player.cs', 'code');
    assert.strictEqual(namespaceRoot(once, 'code'), once);
  });

  it("never touches another plugin's token", () => {
    const url = 'file:///{ref-root}/Spec.pdf';
    assert.strictEqual(namespaceRoot(url, 'code'), url);
  });

  it('leaves a url with no token alone', () => {
    const url = 'file:///D:/abs/Player.cs';
    assert.strictEqual(namespaceRoot(url, 'code'), url);
  });

  it('migrates the percent-encoded spelling as well', () => {
    assert.strictEqual(namespaceRoot('file:///%7Broot%7D/a.cs', 'code'), 'file:///{code-root}/a.cs');
  });
});

describe('token vocabulary', () => {
  it('gives each plugin a distinct token', () => {
    const tokens = Object.values(OWNER_TOKENS);
    assert.strictEqual(new Set(tokens).size, tokens.length);
  });
});
