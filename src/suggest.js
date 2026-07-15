'use strict';

const { EditorSuggest, prepareFuzzySearch } = require('obsidian');
const { isProtected, inTableCell } = require('./shared/markdown');

class ReferenceSuggest extends EditorSuggest {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }

  onTrigger(cursor, editor) {
    const s = this.plugin.settings;
    const before = editor.getLine(cursor.line).slice(0, cursor.ch);
    const i = before.lastIndexOf(s.trigger);
    if (i === -1) return null;
    const query = before.slice(i + s.trigger.length);
    // Stop once the typed text is no longer an identifier or an inline filter
    // (a space, etc.). ":" joins the lang/kind qualifiers, "." the container scope.
    if (!/^[\w.:]*$/.test(query)) return null;
    if (query.length < Math.max(0, s.minChars)) return null;
    // Don't suggest inside code, frontmatter or an existing link. Tables stay live.
    const off = editor.posToOffset(cursor);
    if (isProtected(editor.getValue(), off)) return null;
    return { start: { line: cursor.line, ch: i }, end: cursor, query };
  }

  getSuggestions(ctx) {
    const idx = this.plugin.index;
    if (!idx || !idx.length) return [];
    const max = this.plugin.settings.maxResults;
    const hidden = new Set(this.plugin.settings.disabledKinds || []);
    // Inline filter: "py:handler", "def:handler", "Foo.bar".
    const f = this.plugin.parseQuery(ctx.query);
    const pass = (e) => !hidden.has(e.lang + ':' + e.kind) && this.plugin.entryPassesFilter(e, f);

    if (!f.name) { // "py:", "Foo." or empty — list what passes the filter
      const out = [];
      for (const e of idx) {
        if (!pass(e)) continue;
        out.push(e);
        if (out.length >= max) break;
      }
      return out;
    }

    // Fuzzy/subsequence match ranks camelCase abbreviations (ssis -> ServerSendInputsSystem).
    const match = prepareFuzzySearch(f.name);
    const scored = [];
    for (const e of idx) {
      if (!pass(e)) continue;
      const r = match(e.name);
      if (r) scored.push({ e, score: r.score });
    }
    scored.sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name));
    return scored.slice(0, max).map((s) => s.e);
  }

  renderSuggestion(e, el) {
    el.addClass('reference-linker-suggestion');
    el.createSpan({ cls: 'reference-linker-name', text: e.name });
    el.createSpan({ cls: 'reference-linker-kind', text: e.kind === 'section' ? 'p.' + e.page : e.lang });
    el.createSpan({ cls: 'reference-linker-path', text: e.path });
  }

  selectSuggestion(e) {
    const ctx = this.context;
    if (!ctx) return;
    const inTable = inTableCell(ctx.editor.getValue(), ctx.editor.posToOffset(ctx.start));
    const insert = (template) => {
      const link = this.plugin.buildLink(e, inTable, template);
      ctx.editor.replaceRange(link, ctx.start, ctx.end);
      const pos = ctx.editor.posToOffset(ctx.start) + link.length;
      ctx.editor.setCursor(ctx.editor.offsetToPos(pos));
    };
    this.plugin.withFormat(this.plugin.settings.askOnInsert, insert);
  }
}

module.exports = { ReferenceSuggest };
