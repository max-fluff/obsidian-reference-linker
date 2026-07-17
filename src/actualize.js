'use strict';

// Keeping reference links current. Only a pinned link is tracked: its title says which
// section it holds on to (see shared/binding). An unpinned link is left alone, and the
// display text is never read. Nothing is rewritten automatically.

const { Notice, MarkdownView } = require('obsidian');
const { ViewPlugin, Decoration } = require('@codemirror/view');
const { RangeSetBuilder, StateEffect } = require('@codemirror/state');
const { syntaxTree } = require('@codemirror/language');
const { linkRegex, splitTarget, withTitle, rewriteLinks } = require('./shared/markdown');
const { PAGE_RE, parseBinding, formatBinding } = require('./shared/binding');
const { t } = require('./shared/i18n');

const SKIP_NODE = /code|comment|frontmatter/i;

const withPage = (url, page) => (PAGE_RE.test(url) ? url.replace(PAGE_RE, '#page=' + page) : url + '#page=' + page);

const updateLinksInText = (plugin, text) => rewriteLinks(text, (name, target) => {
  const fixed = plugin.actualizedTarget(target);
  return fixed == null ? null : '[' + name + '](' + fixed + ')';
});

// Pin every unpinned link to the section on its page — retrofits notes written before
// pinning. A link with any title is left alone: pinned, or a tooltip that isn't ours.
const pinLinksInText = (plugin, text) => rewriteLinks(text, (name, target) => {
  const { url, title } = splitTarget(target);
  if (title) return null;
  const sec = plugin.sectionAtLinkPage(url);
  return sec ? '[' + name + '](' + withTitle(url, formatBinding({ sec: sec.name })) + ')' : null;
});

const refreshEffect = StateEffect.define();

function refreshStaleLinks(app) {
  app.workspace.iterateAllLeaves((leaf) => {
    const cm = leaf.view && leaf.view.editor && leaf.view.editor.cm;
    if (cm) cm.dispatch({ effects: refreshEffect.of(null) });
  });
}

// Live Preview underline for drifted links. Links inside code are skipped — there they're
// example text.
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
          let inCode = false;
          tree.iterate({ from: start, to: end, enter: (n) => { if (SKIP_NODE.test(n.type.name)) inCode = true; } });
          const state = inCode ? null : plugin.linkState(m[2]);
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

// A link's binding against the live index, or null when there's nothing to judge: not a
// file link, or no binding.
function bindStateOf(plugin, target) {
  const { url, title } = splitTarget(target);
  if (!url || !/^file:\/\//i.test(url)) return null;
  const b = parseBinding(title);
  return b ? plugin.urlBindState(url, b, plugin.targetPage(url)) : null;
}

// Mixed into the plugin prototype; `this` is the plugin. `target` is the whole markdown
// destination (url plus any title); reading view hands the two apart and recombines them.
const methods = {
  linkState(target) {
    const r = bindStateOf(this, target);
    return r ? r.state : null;
  },

  isLinkStale(target) {
    return this.linkState(target) === 'stale';
  },

  // The link with its page corrected, or null when there's nothing to fix. The binding
  // rides along. bindStateFrom names the moved-to position `line`; here it's a page.
  actualizedTarget(target) {
    const r = bindStateOf(this, target);
    if (!r || r.state !== 'stale') return null;
    const { url, title } = splitTarget(target);
    return withTitle(withPage(url, r.line), title);
  },

  // An open editor keeps cursor and undo; reading view has none, so the file is rewritten
  // through the vault.
  async rewriteActiveNote(transform, noticeKey) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const editor = view && view.editor;
    if (editor) {
      const { text, count } = transform(this, editor.getValue());
      if (count) { const cur = editor.getCursor(); editor.setValue(text); editor.setCursor(cur); }
      new Notice(t(noticeKey, { n: count }));
      return;
    }
    const file = this.app.workspace.getActiveFile();
    if (!file) { new Notice(t(noticeKey, { n: 0 })); return; }
    const { text, count } = transform(this, await this.app.vault.read(file));
    if (count) await this.app.vault.modify(file, text);
    new Notice(t(noticeKey, { n: count }));
  },

  async rewriteVault(transform, noticeKey) {
    let files = 0, total = 0;
    for (const f of this.app.vault.getMarkdownFiles()) {
      const { text, count } = transform(this, await this.app.vault.read(f));
      if (count) { await this.app.vault.modify(f, text); files++; total += count; }
    }
    new Notice(t(noticeKey, { n: total, files }));
  },

  updateLinksInActiveNote() { return this.rewriteActiveNote(updateLinksInText, 'notice.linksUpdated'); },
  updateLinksInVault() { return this.rewriteVault(updateLinksInText, 'notice.linksUpdatedVault'); },
  pinLinksInActiveNote() { return this.rewriteActiveNote(pinLinksInText, 'notice.linksPinned'); },
  pinLinksInVault() { return this.rewriteVault(pinLinksInText, 'notice.linksPinnedVault'); },
};

module.exports = { methods, staleLinksExtension, refreshStaleLinks };
