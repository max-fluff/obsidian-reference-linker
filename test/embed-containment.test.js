'use strict';

// A reference embed's path comes from note text, and notes travel: whatever a block names,
// it must not show a document outside the reference root. The containment rule itself is
// tested in shared; this checks the embed actually goes through it.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { describe, it, assert } = require('../src/shared/testing/harness');
const { installStubs } = require('../src/shared/testing/stubs');

installStubs();
const { resolve, parseSpec } = require('../src/embed');
const { containedPath } = require('../src/shared/contained-path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-linker-embed-'));
const root = path.join(tmp, 'root');
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs', 'spec.pdf'), '%PDF-1.4\n');
fs.writeFileSync(path.join(tmp, 'secret.pdf'), '%PDF-1.4\n');

// The plugin surface resolve() touches, with codePath wired the way main.js wires it.
const plugin = {
  codeRoot: () => root,
  codePath: (rel) => containedPath(root, rel, false),
  lookup: () => [],
  entriesIn: () => [],
};

describe('reference embed paths', () => {
  it('show a document under the reference root', () => {
    const res = resolve(plugin, parseSpec('docs/spec.pdf#page=1'));
    assert.ok(!res.error, res.error);
    assert.strictEqual(res.absPath, path.join(root, 'docs', 'spec.pdf'));
  });

  it('refuse a path that climbs out of it', () => {
    for (const spec of ['../secret.pdf#page=1', '../secret.pdf', 'docs/../../secret.pdf']) {
      const res = resolve(plugin, parseSpec(spec));
      assert.ok(res.error, spec);
      assert.ok(!res.absPath, spec);
    }
  });
});
