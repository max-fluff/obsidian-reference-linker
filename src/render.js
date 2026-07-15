'use strict';

// Reading a line window off disk and syntax-highlighting it with Prism — shared by
// the hover popover (hover.js) and the inline embed (embed.js).

const fs = require('fs');
const readline = require('readline');
const { loadPrism } = require('obsidian');

const MAX_LINE = 400; // cap line length so a minified file can't blow up the view
const PRISM_MAX_LINES = 5000; // past this, skip highlighting so it can't freeze the UI

// Stream the window [from .. to] (1-based, inclusive) instead of the whole file.
// Returns { startLine, lines } or null (unreadable, binary, or empty range).
function readLines(absPath, from, to) {
  return new Promise((resolve) => {
    from = Math.max(1, from);
    const lines = [];
    let i = 0;
    let binary = false;
    let stream;
    try {
      stream = fs.createReadStream(absPath, { encoding: 'utf8' });
    } catch {
      resolve(null);
      return;
    }
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    const stop = () => { try { rl.close(); } catch { /* already closed */ } stream.destroy(); };
    rl.on('line', (text) => {
      i++;
      if (i < from) return;
      if (i > to) { stop(); return; }
      if (/[\x00-\x08\x0E-\x1F]/.test(text)) { binary = true; stop(); return; }
      lines.push(text.length > MAX_LINE ? text.slice(0, MAX_LINE) + '…' : text);
    });
    rl.on('close', () => resolve(binary || !lines.length ? null : { startLine: from, lines }));
    // Errors surface on both; handle each so neither is left unhandled.
    rl.on('error', () => resolve(null));
    stream.on('error', () => resolve(null));
  });
}

// Build DOM from Prism's token tree rather than assigning innerHTML.
function renderTokens(parent, tokens) {
  for (const tok of tokens) {
    if (typeof tok === 'string') { parent.appendText(tok); continue; }
    const aliases = Array.isArray(tok.alias) ? tok.alias.join(' ') : tok.alias || '';
    const span = parent.createSpan({ cls: ('token ' + tok.type + ' ' + aliases).trim() });
    if (typeof tok.content === 'string') span.setText(tok.content);
    else renderTokens(span, Array.isArray(tok.content) ? tok.content : [tok.content]);
  }
}

// Obsidian loads Prism (and its grammars) on demand — window.Prism isn't there until
// something first renders a code block, so hover/embed can't rely on it. loadPrism()
// resolves the ready instance; cache the promise so we pay the load once.
let prismPromise = null;
function ensurePrism() {
  if (!prismPromise) prismPromise = loadPrism().catch(() => null);
  return prismPromise;
}

// Pick the grammar for `prismId`, falling back to the generic c-like one when Prism
// doesn't bundle that language.
function prismGrammar(P, prismId) {
  if (!P || !P.languages) return null;
  return (prismId && P.languages[prismId]) || P.languages.clike || null;
}

// Append a <pre><code> to `parent` with `text`, syntax-highlighted for `prismId` when a
// grammar is available and the snippet isn't so large that tokenizing would freeze the UI.
// The <pre> deliberately carries no `language-*` class: our own .reference-linker-code token
// colours style the snippet, and that class would let a theme paint an opaque code-block
// background over the highlight band that sits behind the text.
async function renderCode(parent, text, prismId) {
  const P = text.split('\n').length <= PRISM_MAX_LINES ? await ensurePrism() : null;
  const grammar = prismGrammar(P, prismId);
  const pre = parent.createEl('pre');
  const code = pre.createEl('code');
  if (grammar) renderTokens(code, P.tokenize(text, grammar));
  else code.setText(text);
}

module.exports = { readLines, renderCode };
