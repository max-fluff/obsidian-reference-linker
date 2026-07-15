'use strict';

// Keeping stored links current with the code. A link freezes the declaration's line
// at insert time; as code moves, that line drifts. These helpers re-resolve a link by
// its symbol name + path against the live index, mark the drifted ones, and (on an
// explicit command) rewrite the stale line number. Nothing is rewritten automatically.

const { Notice, MarkdownView } = require('obsidian');
const { ViewPlugin, Decoration } = require('@codemirror/view');
const { RangeSetBuilder, StateEffect } = require('@codemirror/state');
const { syntaxTree } = require('@codemirror/language');
const { linkRegex, isFenceLine, inInlineCode } = require('./shared/markdown');
const { t } = require('./shared/i18n');

// The line lives as the last :<digits> before the end; relative code paths carry no
// colon, so it's unambiguous. Not global, so replace() only touches that one number.
const LINE_RE = /:(\d+)(?=\D*$)/;
// CM6 syntax-node names for contexts where a link is example text, not a live link.
const SKIP_NODE = /code|comment|frontmatter/i;

// Rewrite stale line numbers in `text`, skipping links inside code (fenced or inline)
// where they're example text, not live links. Returns { text, count }.
function updateLinksInText(plugin, text) {
  const lines = text.split('\n');
  let fenced = false, count = 0;
  for (let i = 0; i < lines.length; i++) {
    if (isFenceLine(lines[i])) { fenced = !fenced; continue; }
    if (fenced) continue;
    lines[i] = lines[i].replace(linkRegex(), (whole, name, target, offset) => {
      if (inInlineCode(lines[i], offset)) return whole;
      const fixed = plugin.actualizedTarget(name, target);
      if (fixed == null) return whole;
      count++;
      return '[' + name + '](' + fixed + ')';
    });
  }
  return { text: lines.join('\n'), count };
}

// A CM6 refresh signal, dispatched when the index changes so Live Preview re-scans
// stale marks without waiting for the next edit or scroll.
const refreshEffect = StateEffect.define();

function refreshStaleLinks(app) {
  app.workspace.iterateAllLeaves((leaf) => {
    const cm = leaf.view && leaf.view.editor && leaf.view.editor.cm;
    if (cm) cm.dispatch({ effects: refreshEffect.of(null) });
  });
}

// Live Preview underline for links whose line has drifted. Links inside code (fenced or
// inline) are skipped via the syntax tree — they're example text, not live links, so the
// note/vault commands won't touch them and marking them would mislead.
function staleLinksExtension(plugin) {
  const marks = {
    stale: Decoration.mark({ class: 'reference-linker-stale' }),
    broken: Decoration.mark({ class: 'reference-linker-broken' }),
  };
  const build = (view) => {
    const builder = new RangeSetBuilder();
    if (plugin.settings.markStaleLinks) {
      const tree = syntaxTree(view.state);
      for (const { from, to } of view.visibleRanges) {
        const text = view.state.doc.sliceString(from, to);
        const re = linkRegex();
        let m;
        while ((m = re.exec(text))) {
          const start = from + m.index;
          const end = start + m[0].length;
          let inCodeNode = false;
          tree.iterate({ from: start, to: end, enter: (n) => { if (SKIP_NODE.test(n.type.name)) inCodeNode = true; } });
          const state = inCodeNode ? null : plugin.linkState(m[1], m[2]);
          if (state) builder.add(start, end, marks[state]);
        }
      }
    }
    return builder.finish();
  };
  return ViewPlugin.fromClass(
    class {
      constructor(view) { this.decorations = build(view); }
      update(u) {
        const refresh = u.transactions.some((tr) => tr.effects.some((e) => e.is(refreshEffect)));
        if (u.docChanged || u.viewportChanged || refresh) this.decorations = build(u.view);
      }
    },
    { decorations: (v) => v.decorations }
  );
}

// Mixed into the plugin prototype (like api.js); `this` is the plugin.
const methods = {
  // A stored link resolved to its live entry, or null when it can't be safely
  // actualized (no line, not a code link, or an ambiguous name in the file). Unlike
  // entryUnderPointer it never uses the stored line to disambiguate — that would hide
  // the very drift we're detecting.
  resolveStoredLink(name, target) {
    if (!name || !target) return null;
    const m = LINE_RE.exec(target);
    if (!m) return null;
    const storedLine = parseInt(m[1], 10);
    const { cand } = this.linkCandidates(name, target);
    const decls = cand.filter((e) => e.kind !== 'file');
    let entry;
    if (decls.length === 1) entry = decls[0];
    else if (!decls.length && cand.length === 1) entry = cand[0];
    else return null;
    return { entry, storedLine, currentLine: entry.line };
  },

  isLinkStale(name, target) {
    const r = this.resolveStoredLink(name, target);
    return !!r && r.currentLine !== r.storedLine;
  },

  // Freshness of a code link for the visual marks: 'stale' (line drifted, fixable),
  // 'broken' (its file is still indexed but the symbol is gone — renamed or removed),
  // or null (current, ambiguous, not a code link, or unrelated — nothing to mark).
  linkState(name, target) {
    if (!name || !target) return null;
    if (!LINE_RE.test(target)) return null; // no line: not a tracked code link
    const r = this.resolveStoredLink(name, target);
    if (r) return r.currentLine === r.storedLine ? null : 'stale';
    // Didn't resolve. If the target still points at an indexed file, the symbol was
    // renamed or removed → broken; otherwise it's an unrelated link → leave it alone.
    const { dec, cand } = this.linkCandidates(name, target);
    if (cand.length) return null; // name matched but ambiguous in the file — don't guess
    return this.targetIndexedFile(dec) ? 'broken' : null;
  },

  // The link target with its line corrected to the current declaration, or null when
  // there's nothing to fix. Shared by the vault/note commands and the right-click fix.
  actualizedTarget(name, target) {
    const r = this.resolveStoredLink(name, target);
    if (!r || r.currentLine === r.storedLine) return null;
    return target.replace(LINE_RE, ':' + r.currentLine);
  },

  // Works in both edit and reading view: an open editor keeps cursor/undo, otherwise
  // the active file is rewritten through the vault.
  async updateLinksInActiveNote() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const editor = view && view.editor;
    if (editor) {
      const { text, count } = updateLinksInText(this, editor.getValue());
      if (count) { const cur = editor.getCursor(); editor.setValue(text); editor.setCursor(cur); }
      new Notice(t('notice.linksUpdated', { n: count }));
      return;
    }
    const file = this.app.workspace.getActiveFile();
    if (!file) { new Notice(t('notice.linksUpdated', { n: 0 })); return; }
    const { text, count } = updateLinksInText(this, await this.app.vault.read(file));
    if (count) await this.app.vault.modify(file, text);
    new Notice(t('notice.linksUpdated', { n: count }));
  },

  async updateLinksInVault() {
    let files = 0, total = 0;
    for (const f of this.app.vault.getMarkdownFiles()) {
      const src = await this.app.vault.read(f);
      const { text, count } = updateLinksInText(this, src);
      if (count) { await this.app.vault.modify(f, text); files++; total += count; }
    }
    new Notice(t('notice.linksUpdatedVault', { n: total, files }));
  },
};

module.exports = { methods, staleLinksExtension, refreshStaleLinks };
