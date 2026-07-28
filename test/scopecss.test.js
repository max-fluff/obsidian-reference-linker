'use strict';

// A page's own stylesheet is confined to one preview box before it is injected. The danger is
// a rule escaping the box and restyling Obsidian itself, so these pin down that every emitted
// selector begins with the scope, and that rules which can't be safely scoped are dropped.

const { describe, it, assert } = require('../src/shared/testing/harness');
const { installStubs } = require('../src/shared/testing/stubs');

installStubs();
const { scopeCss } = require('../src/formats/preview');

const S = '.scope';

// Every selector (the text before each `{`) must start with the scope — nothing may target
// outside the box.
const selectorsEscape = (out) => out
  .split('}').map((r) => r.split('{')[0].trim()).filter(Boolean)
  .flatMap((sel) => sel.split(','))
  .map((s) => s.trim())
  .some((s) => s && !s.startsWith(S));

describe('scopeCss', () => {
  it('prefixes an ordinary selector with the scope', () => {
    assert.ok(scopeCss('p { margin: 1em }', S).includes('.scope p{margin: 1em}'));
  });

  it('maps body / html / :root to the box itself', () => {
    assert.ok(scopeCss('body { margin: 0 }', S).includes('.scope{margin: 0}'));
    assert.ok(scopeCss('html { font-size: 14px }', S).includes('.scope{font-size: 14px}'));
    assert.ok(scopeCss(':root { --x: 1 }', S).includes('.scope{--x: 1}'));
  });

  it('keeps a body descendant scoped to the box', () => {
    assert.ok(scopeCss('body .note { margin: 0 }', S).includes('.scope .note{margin: 0}'));
  });

  it('confines the universal selector to the box', () => {
    assert.ok(scopeCss('* { box-sizing: border-box }', S).includes('.scope *{box-sizing: border-box}'));
  });

  it('scopes every selector in a comma list', () => {
    assert.ok(scopeCss('h1, h2 { margin: 0 }', S).includes('.scope h1,.scope h2{margin: 0}'));
    assert.ok(!selectorsEscape(scopeCss('h1, h2, body { margin: 0 }', S)));
  });

  it('keeps the page colours — the document is shown as it was designed', () => {
    const out = scopeCss('body { background: #eee; color: #222; margin: 0 }', S);
    assert.ok(out.includes('background: #eee'), out);
    assert.ok(out.includes('color: #222'), out);
  });

  it('lays paper down before the page CSS, so a page that sets only text colour stays legible', () => {
    const out = scopeCss('body { color: #222 }', S);
    const paperAt = out.indexOf('background:#ffffff');
    const pageAt = out.indexOf('color: #222');
    assert.ok(paperAt >= 0, 'no paper base: dark text would land on a dark vault');
    assert.ok(paperAt < pageAt, 'paper must come first so the page overrides it');
  });

  it('lets the page override the paper when it brings its own background', () => {
    const out = scopeCss('body { background: #101010; color: #eee }', S);
    assert.ok(out.indexOf('background:#ffffff') < out.indexOf('background: #101010'));
  });

  it('appends containment so a page cannot push content out of the box', () => {
    const out = scopeCss('p { margin: 0 }', S);
    assert.ok(out.includes('.scope pre{overflow-x:auto'), out);
    assert.ok(out.includes('.scope{max-width:100%'), out);
  });

  it('drops @media entirely rather than emit an unscoped rule', () => {
    const out = scopeCss('@media (max-width: 40em) { body { color: red } }', S);
    assert.ok(!selectorsEscape(out), out);
  });

  it('drops @font-face and @import', () => {
    for (const css of ['@import url(x.css);', '@font-face { font-family: X; src: url(x) }']) {
      const out = scopeCss(css, S);
      assert.ok(!/@(?:import|font-face)/.test(out), out);
      assert.ok(!/font-family/.test(out), out); // nothing of the at-rule survived
    }
  });

  it('drops @keyframes without leaking its inner selectors', () => {
    const out = scopeCss('@keyframes spin { from { top: 0 } to { top: 9 } }', S);
    assert.ok(!selectorsEscape(out), out);
  });

  it('neutralises fixed and sticky positioning', () => {
    assert.ok(scopeCss('.x { position: fixed; top: 0 }', S).includes('position: static'));
    assert.ok(scopeCss('.x { position: sticky }', S).includes('position: static'));
    assert.ok(scopeCss('.x { position: relative }', S).includes('position: relative'));
  });

  it('strips comments', () => {
    const out = scopeCss('/* a comment */ p { margin: 2px }', S);
    assert.ok(out.includes('.scope p{margin: 2px}'), out);
    assert.ok(!out.includes('comment'), out);
  });

  it('does not mix Obsidian theming into a page that brought its own stylesheet', () => {
    // `.theme-dark .markdown-rendered pre` outranks `.scope pre`, so leaving that class on a
    // self-styled page repaints its light code blocks dark.
    const obsidian = require('obsidian');
    const had = obsidian.sanitizeHTMLToDom;
    const hadDoc = global.document;
    obsidian.sanitizeHTMLToDom = (h) => ({ html: h });
    global.document = { createElement: () => ({ set textContent(v) { this.v = v; } }) };
    const el = () => {
      const node = { children: [], style: {} };
      node.createDiv = (o) => { const c = { cls: (o && o.cls) || '', style: {}, children: [], appendChild() {}, querySelectorAll: () => [], remove() {} }; node.children.push(c); return c; };
      node.appendChild = () => {};
      return node;
    };
    try {
      const { renderHtml } = require('../src/formats/preview');
      const styled = el();
      renderHtml(styled, { html: '<p>x</p>', width: 600, css: 'body{background:#fff}' });
      assert.ok(!styled.children[0].cls.includes('markdown-rendered'), styled.children[0].cls);

      const bare = el();
      renderHtml(bare, { html: '<p>x</p>', width: 600 });
      assert.ok(bare.children[0].cls.includes('markdown-rendered'), bare.children[0].cls);
    } finally {
      obsidian.sanitizeHTMLToDom = had;
      global.document = hadDoc;
    }
  });

  it('never emits a selector outside the scope, for a mixed real-world sheet', () => {
    const css = 'body{margin:0}h1,h2{color:#333}.admonitionblock td{border:1px}'
      + '@media print{a{color:#000}}*{box-sizing:border-box}#header .details{display:flex}';
    assert.ok(!selectorsEscape(scopeCss(css, S)), scopeCss(css, S));
  });
});
