'use strict';

// Keeping reference links current with the documents on disk. A link freezes a document's
// path (and, for a section, its page) at insert time; if the file moves or a PDF's outline
// shifts, that drifts. These helpers re-resolve a link by its display name against the live
// index, mark the drifted/broken ones, and (on an explicit command) rewrite the target.
// Nothing is rewritten automatically.

const { Notice, MarkdownView } = require('obsidian');
const { ViewPlugin, Decoration } = require('@codemirror/view');
const { RangeSetBuilder, StateEffect } = require('@codemirror/state');
const { syntaxTree } = require('@codemirror/language');
const { linkRegex, isFenceLine, inInlineCode } = require('./shared/markdown');
const { t } = require('./shared/i18n');

// CM6 syntax-node names for contexts where a link is example text, not a live link.
const SKIP_NODE = /code|comment|frontmatter/i;

// Rewrite stale targets in `text`, skipping links inside code (fenced or inline) where
// they're example text, not live links. Returns { text, count }.
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

// A CM6 refresh signal, dispatched when the index changes so Live Preview re-scans stale
// marks without waiting for the next edit or scroll.
const refreshEffect = StateEffect.define();

function refreshStaleLinks(app) {
  app.workspace.iterateAllLeaves((leaf) => {
    const cm = leaf.view && leaf.view.editor && leaf.view.editor.cm;
    if (cm) cm.dispatch({ effects: refreshEffect.of(null) });
  });
}

// Live Preview underline for stale/broken links. Links inside code (fenced or inline) are
// skipped via the syntax tree — they're example text, not live links.
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
  // Resolving a reference link, as { entry, indexedTarget }: the current index entry it
  // points at (matched by display name, disambiguated by the still-valid path/page in the
  // target) or null; and whether the target's own path is still an indexed document.
  resolveReferenceLinkInfo(name, target) {
    if (!name || !target) return { entry: null, indexedTarget: false };
    const { dec, cand } = this.linkCandidates(name, target); // same-named entries whose path is in the target
    if (cand.length === 1) return { entry: cand[0], indexedTarget: true };
    if (cand.length > 1) {
      const pm = /#page=(\d+)/i.exec(target);
      const page = pm ? parseInt(pm[1], 10) : 1;
      const entry = cand.find((e) => (e.page || 1) === page) || cand.find((e) => e.kind === 'section') || cand[0];
      return { entry, indexedTarget: true };
    }
    // Nothing named `name` sits at the target's path. If that path is still an indexed
    // document, the link points where it says it points — a hand-retargeted link or a
    // hand-edited display name, which we take at its word rather than re-resolve.
    if (this.targetIndexedFile(dec)) return { entry: null, indexedTarget: true };
    // The target's document isn't indexed at all (it moved or is gone) — fall back to a
    // unique name match, which finds a moved file by its (unchanged) name.
    const named = this.entriesByName(name).filter((e) => e.name === name);
    return { entry: named.length === 1 ? named[0] : null, indexedTarget: false };
  },

  resolveReferenceLink(name, target) {
    return this.resolveReferenceLinkInfo(name, target).entry;
  },

  // Whether the target's extension is one we index — so a missing target reads as a broken
  // reference, not an unrelated file:// link we should leave alone.
  targetLooksIndexable(target) {
    const ext = (/(\.[a-z0-9]+)(?:[#?].*)?$/i.exec(target.split('#')[0]) || [])[1];
    return !!ext && this.watchedExts().has(ext.toLowerCase());
  },

  // Two link targets are the same document location, ignoring {root}-vs-absolute form and
  // %-encoding differences.
  sameReferenceTarget(a, b) {
    const norm = (s) => { let x = this.fillRoot(s); try { x = decodeURI(x); } catch { /* keep raw */ } return x.split('\\').join('/'); };
    return norm(a) === norm(b);
  },

  // Freshness of a reference link for the visual marks: 'stale' (target moved or its page
  // drifted — fixable), 'broken' (a document that's gone), or null (current, hand-edited,
  // or not one of our file:// reference links).
  linkState(name, target) {
    if (!name || !target) return null;
    if (!/file:\/\//i.test(target)) return null;
    const { entry, indexedTarget } = this.resolveReferenceLinkInfo(name, target);
    if (entry) return this.sameReferenceTarget(this.buildUri(entry), target) ? null : 'stale';
    // Didn't resolve, but the target is a document we index — the link opens fine and only
    // its display name is off-index. Nothing to mark.
    if (indexedTarget) return null;
    return this.targetLooksIndexable(target) ? 'broken' : null;
  },

  isLinkStale(name, target) { return this.linkState(name, target) === 'stale'; },

  // The corrected {root}-portable target for a stale link, or null when there's nothing to
  // fix. Shared by the vault/note commands and the right-click fix.
  actualizedTarget(name, target) {
    if (!/file:\/\//i.test(target)) return null;
    const entry = this.resolveReferenceLink(name, target);
    if (!entry) return null;
    const current = this.buildUri(entry);
    return this.sameReferenceTarget(current, target) ? null : current;
  },

  // Works in both edit and reading view: an open editor keeps cursor/undo, otherwise the
  // active file is rewritten through the vault.
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
