/* Reference Linker 1.0.0 — bundled from src/ by esbuild. Do not edit directly; edit src/ and run "npm run build". */
"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/shared/markdown.js
var require_markdown = __commonJS({
  "src/shared/markdown.js"(exports2, module2) {
    "use strict";
    var splitLines2 = (s) => (s || "").split("\n").map((x) => x.trim()).filter(Boolean);
    var LINK_PATTERN = "\\[([^\\]]*)\\]\\(([^)]+)\\)";
    var linkRegex2 = () => new RegExp(LINK_PATTERN, "g");
    var LINK_TITLE = /^([\s\S]*?)\s+(?:"([^"]*)"|'([^']*)')$/;
    function splitTarget2(raw) {
      const s = String(raw == null ? "" : raw).trim();
      const m = LINK_TITLE.exec(s);
      if (!m)
        return { url: s, title: "" };
      return { url: m[1].trim(), title: m[2] != null ? m[2] : m[3] };
    }
    var withTitle2 = (url, title) => title ? url + ' "' + title + '"' : url;
    var isFenceLine = (line) => {
      const s = line.trimStart();
      return s.startsWith("```") || s.startsWith("~~~");
    };
    var INLINE_CODE = /`[^`\n]+`/g;
    function inMatch(line, col, re) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        if (col > m.index && col < m.index + m[0].length)
          return true;
      }
      return false;
    }
    var inInlineCode = (line, col) => inMatch(line, col, INLINE_CODE);
    function locate(lines, pos) {
      let start = 0, i = 0;
      for (; i < lines.length; i++) {
        if (pos <= start + lines[i].length)
          break;
        start += lines[i].length + 1;
      }
      return { i, col: pos - start, line: lines[i] || "" };
    }
    function inCode2(text, pos) {
      if (/^---\r?\n/.test(text)) {
        const end = text.indexOf("\n---", 3);
        if (end !== -1 && pos <= end + 4)
          return true;
      }
      const lines = text.split("\n");
      const { i, col, line } = locate(lines, pos);
      let fenced = false;
      for (let k = 0; k < i; k++)
        if (isFenceLine(lines[k]))
          fenced = !fenced;
      if (fenced)
        return true;
      return inMatch(line, col, INLINE_CODE);
    }
    function inLink2(text, pos) {
      const { col, line } = locate(text.split("\n"), pos);
      return inMatch(line, col, linkRegex2());
    }
    function isProtected(text, pos) {
      return inCode2(text, pos) || inLink2(text, pos);
    }
    function inTableCell2(text, pos) {
      const lines = text.split("\n");
      const lineIdx = (text.slice(0, pos).match(/\n/g) || []).length;
      if (!lines[lineIdx] || !lines[lineIdx].includes("|"))
        return false;
      const isDelimiter = (l) => l.includes("|") && l.includes("-") && /^[\s|:-]+$/.test(l);
      let top = lineIdx, bot = lineIdx;
      while (top > 0 && lines[top - 1].trim() !== "")
        top--;
      while (bot < lines.length - 1 && lines[bot + 1].trim() !== "")
        bot++;
      for (let i = top; i <= bot; i++)
        if (isDelimiter(lines[i]))
          return true;
      return false;
    }
    function rewriteLinks(text, fn) {
      const lines = text.split("\n");
      let fenced = false, count = 0;
      for (let i = 0; i < lines.length; i++) {
        if (isFenceLine(lines[i])) {
          fenced = !fenced;
          continue;
        }
        if (fenced)
          continue;
        lines[i] = lines[i].replace(linkRegex2(), (whole, name, target, offset) => {
          if (inInlineCode(lines[i], offset))
            return whole;
          const out = fn(name, target);
          if (out == null)
            return whole;
          count++;
          return out;
        });
      }
      return { text: lines.join("\n"), count };
    }
    function rewriteFences(text, lang, fn) {
      const lines = text.split("\n");
      let count = 0;
      for (let i = 0; i < lines.length; i++) {
        const open = new RegExp("^\\s*(`{3,}|~{3,})\\s*" + lang + "\\s*$").exec(lines[i]);
        if (!open)
          continue;
        const close = new RegExp("^\\s*" + open[1][0] + "{" + open[1].length + ",}\\s*$");
        let j = i + 1;
        while (j < lines.length && !close.test(lines[j]))
          j++;
        const body = lines.slice(i + 1, j);
        const out = fn(body);
        if (out) {
          lines.splice(i + 1, body.length, ...out);
          count++;
          j = i + 1 + out.length;
        }
        i = j;
      }
      return { text: lines.join("\n"), count };
    }
    module2.exports = { splitLines: splitLines2, linkRegex: linkRegex2, splitTarget: splitTarget2, withTitle: withTitle2, rewriteLinks, rewriteFences, isFenceLine, inInlineCode, locate, inCode: inCode2, inLink: inLink2, isProtected, inTableCell: inTableCell2 };
  }
});

// src/constants.js
var require_constants = __commonJS({
  "src/constants.js"(exports2, module2) {
    "use strict";
    var { splitLines: splitLines2 } = require_markdown();
    var PRESETS2 = {
      // {ref-root} keeps the note portable: the file holds a relative path, the absolute
      // reference root is filled in on render/click. Opens in the OS default app. Namespaced,
      // so a link says which linker owns it — the bare {root} it replaces was filled by the
      // code linker too.
      file: "file:///{ref-root}/{path}"
    };
    var DEFAULT_SETTINGS2 = {
      // @@ is Code Linker's default; @! avoids a clash when both are installed.
      trigger: "@!",
      uriTemplate: PRESETS2.file,
      codeRoot: "",
      // empty => parent folder of the vault
      scanRoots: "",
      // one path per line, relative to codeRoot
      extensions: "",
      // e.g. ".pdf .docx .png"; empty => nothing indexed
      skipDirs: ".git\nnode_modules\n.obsidian",
      // one folder name per line
      editors: [],
      // user-defined viewer presets, each { name, template }
      askOnInsert: true,
      // ask which viewer format to use on every insert (vs. the default)
      autoRefresh: true,
      // watch scan folders and rebuild the index when files change
      hoverPreview: true,
      // show the preview popover when hovering a reference link
      markStaleLinks: true,
      // underline links whose target document moved or is gone
      minChars: 1,
      maxResults: 12,
      contextMenu: true,
      // the "Convert"/"Find and open" items in the editor right-click menu
      // Breaks a tie when a link lands in both our index and the code linker's and carries no
      // binding to say whose it is. A binding always decides on its own, so this only ever
      // settles the genuinely ambiguous case.
      linkPrecedence: 10
    };
    function parseExtensions2(raw) {
      const out = /* @__PURE__ */ new Set();
      for (const tok of String(raw || "").split(/[\s,]+/)) {
        const t2 = tok.trim().toLowerCase();
        if (!t2)
          continue;
        out.add(t2[0] === "." ? t2 : "." + t2);
      }
      return out;
    }
    function parseSkip2(skipDirs) {
      const names = /* @__PURE__ */ new Set();
      const paths = /* @__PURE__ */ new Set();
      for (const raw of splitLines2(skipDirs)) {
        const s = raw.split("\\").join("/").replace(/^\.?\//, "").replace(/\/+$/, "");
        if (!s)
          continue;
        if (s.includes("/"))
          paths.add(s);
        else
          names.add(s);
      }
      return { names, paths };
    }
    function underSkip2(rel, skip) {
      const segs = rel.split("/").filter(Boolean);
      for (const s of segs)
        if (skip.names.has(s))
          return true;
      if (skip.paths.size) {
        let acc = "";
        for (const seg of segs) {
          acc = acc ? acc + "/" + seg : seg;
          if (skip.paths.has(acc))
            return true;
        }
      }
      return false;
    }
    module2.exports = { PRESETS: PRESETS2, DEFAULT_SETTINGS: DEFAULT_SETTINGS2, parseExtensions: parseExtensions2, parseSkip: parseSkip2, underSkip: underSkip2 };
  }
});

// src/shared/binding.js
var require_binding = __commonJS({
  "src/shared/binding.js"(exports2, module2) {
    "use strict";
    var ANCHORS = { sym: "sym", kind: "kind", sec: "sec", line: "hash" };
    var TOKEN = /^(sym|kind|sec|line):(.+)$/;
    var OWNERS = { code: ["sym", "kind", "hash"], reference: ["sec"] };
    function ownerOf(binding) {
      if (!binding)
        return null;
      const claimed = Object.keys(OWNERS).filter((owner) => OWNERS[owner].some((anchor) => binding[anchor]));
      return claimed.length === 1 ? claimed[0] : null;
    }
    var bindingOwner2 = (title) => ownerOf(parseBinding2(title));
    var ownsBinding2 = (title, owner) => bindingOwner2(title) === owner;
    var LINE_RE = /:(\d+)(?=\D*$)/;
    var PAGE_RE = /#page=(\d+)/i;
    var encodeValue = (v) => String(v).replace(/[%"()\s]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
    var decodeValue = (v) => v.replace(/%([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    function hashLine(text) {
      let h = 2166136261;
      const s = String(text || "").trim();
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
      return h.toString(36);
    }
    function parseBinding2(title) {
      const s = String(title || "").trim();
      if (!s)
        return null;
      const b = { sym: "", kind: "", sec: "", hash: "" };
      for (const word of s.split(/\s+/)) {
        const m = TOKEN.exec(word);
        if (!m)
          return null;
        b[ANCHORS[m[1]]] = decodeValue(m[2]);
      }
      return b.sym || b.kind || b.sec || b.hash ? b : null;
    }
    function formatBinding2(b) {
      const parts = [];
      if (b.sym)
        parts.push("sym:" + encodeValue(b.sym));
      if (b.kind)
        parts.push("kind:" + encodeValue(b.kind));
      if (b.sec)
        parts.push("sec:" + encodeValue(b.sec));
      if (b.hash)
        parts.push("line:" + b.hash);
      return parts.join(" ");
    }
    function bindStateFrom2(hits, stored) {
      if (hits.includes(stored))
        return null;
      if (!hits.length)
        return { state: "broken" };
      const line = hits.reduce((a, n) => Math.abs(n - stored) < Math.abs(a - stored) ? n : a);
      return { state: "stale", line };
    }
    module2.exports = { LINE_RE, PAGE_RE, OWNERS, hashLine, parseBinding: parseBinding2, formatBinding: formatBinding2, bindStateFrom: bindStateFrom2, ownerOf, bindingOwner: bindingOwner2, ownsBinding: ownsBinding2 };
  }
});

// src/shared/root-token.js
var require_root_token = __commonJS({
  "src/shared/root-token.js"(exports2, module2) {
    "use strict";
    var OWNER_TOKENS = { code: "code-root", reference: "ref-root" };
    var LEGACY_TOKEN = "root";
    var tokenRe = (name) => new RegExp("\\{" + name + "\\}|%7B" + name + "%7D", "gi");
    function rootTokenIn(url) {
      const s = String(url == null ? "" : url);
      for (const owner of Object.keys(OWNER_TOKENS)) {
        if (tokenRe(OWNER_TOKENS[owner]).test(s))
          return owner;
      }
      return tokenRe(LEGACY_TOKEN).test(s) ? "legacy" : null;
    }
    function ownsRootToken2(url, owner, claimLegacy) {
      const found = rootTokenIn(url);
      if (found === owner)
        return true;
      return found === "legacy" && !!claimLegacy;
    }
    function fillRoot(url, { owner, root, claimLegacy = false } = {}) {
      const s = String(url == null ? "" : url);
      if (!owner || !OWNER_TOKENS[owner])
        return s;
      let out = s.replace(tokenRe(OWNER_TOKENS[owner]), root);
      if (claimLegacy)
        out = out.replace(tokenRe(LEGACY_TOKEN), root);
      return out;
    }
    function namespaceRoot2(url, owner) {
      const s = String(url == null ? "" : url);
      if (!owner || !OWNER_TOKENS[owner])
        return s;
      if (rootTokenIn(s) !== "legacy")
        return s;
      return s.replace(tokenRe(LEGACY_TOKEN), "{" + OWNER_TOKENS[owner] + "}");
    }
    module2.exports = { OWNER_TOKENS, LEGACY_TOKEN, rootTokenIn, ownsRootToken: ownsRootToken2, fillRoot, namespaceRoot: namespaceRoot2 };
  }
});

// src/shared/menu.js
var require_menu = __commonJS({
  "src/shared/menu.js"(exports2, module2) {
    "use strict";
    var obsidian = require("obsidian");
    var submenuSupport = null;
    function supportsSubmenu() {
      if (submenuSupport !== null)
        return submenuSupport;
      submenuSupport = false;
      try {
        const probe = new obsidian.Menu();
        probe.addItem((item) => {
          submenuSupport = typeof item.setSubmenu === "function";
        });
      } catch (e) {
        submenuSupport = false;
      }
      return submenuSupport;
    }
    function menuSection(menu, label, grouped, icon) {
      if (!grouped)
        return menu;
      if (!supportsSubmenu()) {
        return {
          addItem(cb) {
            return menu.addItem((item) => {
              const setTitle = item.setTitle.bind(item);
              item.setTitle = (title) => setTitle(`${label}: ${title}`);
              cb(item);
            });
          },
          addSeparator() {
            return menu.addSeparator();
          }
        };
      }
      let sub = null;
      const ensure = () => {
        if (!sub) {
          menu.addItem((item) => {
            item.setTitle(label);
            if (icon)
              item.setIcon(icon);
            sub = item.setSubmenu();
          });
        }
        return sub;
      };
      return {
        addItem(cb) {
          return ensure().addItem(cb);
        },
        addSeparator() {
          return sub ? sub.addSeparator() : null;
        }
      };
    }
    var STORE = "__linkerMenuSections";
    function sharedSection2(menu, key, label, icon) {
      if (!supportsSubmenu())
        return menuSection(menu, label, true);
      let store = menu[STORE];
      if (!store) {
        store = {};
        try {
          Object.defineProperty(menu, STORE, { value: store, enumerable: false, configurable: true });
        } catch (e) {
          return menuSection(menu, label, true, icon);
        }
      }
      if (!store[key]) {
        menu.addItem((item) => {
          item.setTitle(label);
          if (icon)
            item.setIcon(icon);
          store[key] = item.setSubmenu();
        });
      }
      return store[key];
    }
    module2.exports = { menuSection, sharedSection: sharedSection2, supportsSubmenu };
  }
});

// src/shared/discover.js
var require_discover = __commonJS({
  "src/shared/discover.js"(exports2, module2) {
    "use strict";
    var LINKER_API = 1;
    function discoverLinkers(app, opts) {
      const minVersion = opts && opts.minVersion || LINKER_API;
      const found = [];
      const plugins = app && app.plugins && app.plugins.plugins;
      if (!plugins)
        return found;
      for (const id of Object.keys(plugins)) {
        const plugin = plugins[id];
        const provider = plugin && plugin.api && plugin.api.linker;
        if (!provider || typeof provider.id !== "string")
          continue;
        if (!(provider.apiVersion >= minVersion))
          continue;
        found.push(provider);
      }
      return found;
    }
    function outranks(a, b) {
      if (a.precedence !== b.precedence)
        return (a.precedence || 0) > (b.precedence || 0);
      return String(a.id) < String(b.id);
    }
    function foreignRanges(app, self, text) {
      const ranges = [];
      for (const peer of discoverLinkers(app)) {
        if (peer.id === self.id || !outranks(peer, self))
          continue;
        if (typeof peer.matches !== "function")
          continue;
        let matches;
        try {
          matches = peer.matches(text) || [];
        } catch (e) {
          matches = [];
        }
        for (const m of matches) {
          if (m && typeof m.start === "number" && typeof m.end === "number")
            ranges.push([m.start, m.end]);
        }
      }
      return ranges.sort((a, b) => a[0] - b[0]);
    }
    function overlaps(ranges, s, e) {
      for (const [rs, re] of ranges) {
        if (rs >= e)
          break;
        if (re > s)
          return true;
      }
      return false;
    }
    function ownedMatches(app, self, text, matches) {
      if (!matches.length)
        return matches;
      const foreign = foreignRanges(app, self, text);
      if (!foreign.length)
        return matches;
      return matches.filter((m) => !overlaps(foreign, m.start, m.end));
    }
    function yieldedCandidates(app, self, text) {
      const out = [];
      for (const peer of discoverLinkers(app)) {
        if (peer.id === self.id || outranks(peer, self))
          continue;
        if (typeof peer.matches !== "function")
          continue;
        let matches;
        try {
          matches = peer.matches(text) || [];
        } catch (e) {
          matches = [];
        }
        for (const m of matches) {
          if (!m || typeof m.start !== "number" || typeof m.end !== "number")
            continue;
          out.push({
            start: m.start,
            end: m.end,
            label: m.label || m.target || "",
            target: m.target,
            // The id survives a round trip through a DOM attribute; the opener is looked up
            // again at click time.
            id: peer.id,
            source: peer.displayName || peer.id,
            open: (sourcePath, newTab) => {
              if (typeof peer.open === "function")
                peer.open(m.target, sourcePath, newTab);
            },
            hover: (event, targetEl, sourcePath, hoverParent) => {
              if (typeof peer.hover === "function")
                peer.hover(m.target, event, targetEl, sourcePath, hoverParent);
            }
          });
        }
      }
      return out;
    }
    function candidatesFor(candidates, s, e) {
      return candidates.filter((c) => c.start < e && c.end > s);
    }
    function peerSuggestions(app, self, query) {
      const out = [];
      for (const peer of discoverLinkers(app)) {
        if (peer.id === self.id || typeof peer.suggest !== "function")
          continue;
        let items;
        try {
          items = peer.suggest(String(query || "")) || [];
        } catch (e) {
          items = [];
        }
        for (const it of items) {
          if (!it || typeof it.label !== "string")
            continue;
          out.push({
            label: it.label,
            note: it.note || "",
            target: it.target,
            // null means "keep what the reader typed"; only the peer knows whether its
            // candidate matched an inflection or completed a prefix.
            display: it.display == null ? null : it.display,
            id: peer.id,
            source: peer.displayName || peer.id,
            precedence: peer.precedence || 0,
            insert: (display, inTable) => typeof peer.linkFor === "function" ? peer.linkFor(it.target, display, inTable) : null
          });
        }
      }
      return out;
    }
    function peersOffering2(app, self, kind, text) {
      const out = [];
      for (const peer of discoverLinkers(app)) {
        if (peer.id === self.id || typeof peer.offers !== "function")
          continue;
        let yes;
        try {
          yes = peer.offers(kind, text);
        } catch (e) {
          yes = false;
        }
        if (yes)
          out.push(peer);
      }
      return out;
    }
    function siblingLinkers(app, self) {
      return discoverLinkers(app).filter((p) => p.id !== self.id);
    }
    module2.exports = { LINKER_API, discoverLinkers, outranks, foreignRanges, overlaps, ownedMatches, yieldedCandidates, candidatesFor, peerSuggestions, peersOffering: peersOffering2, siblingLinkers };
  }
});

// src/shared/link-owner.js
var require_link_owner = __commonJS({
  "src/shared/link-owner.js"(exports2, module2) {
    "use strict";
    var { outranks, discoverLinkers } = require_discover();
    var RANK = { binding: 2, index: 1 };
    function linkOwner(app, target, title) {
      let best = null;
      let bestRank = 0;
      for (const peer of discoverLinkers(app)) {
        if (typeof peer.claim !== "function")
          continue;
        let claim;
        try {
          claim = peer.claim(target, title);
        } catch (e) {
          claim = null;
        }
        const rank = RANK[claim] || 0;
        if (!rank)
          continue;
        if (rank > bestRank || rank === bestRank && best && outranks(peer, best)) {
          best = peer;
          bestRank = rank;
        }
      }
      return best;
    }
    function ownsLink2(app, self, target, title) {
      const owner = linkOwner(app, target, title);
      return !!owner && owner.id === self.id;
    }
    module2.exports = { linkOwner, ownsLink: ownsLink2, RANK };
  }
});

// src/shared/deeplink/suggest.js
var require_suggest = __commonJS({
  "src/shared/deeplink/suggest.js"(exports2, module2) {
    "use strict";
    var { EditorSuggest, prepareFuzzySearch } = require("obsidian");
    var { isProtected, inTableCell: inTableCell2 } = require_markdown();
    function createSigilSuggest(config) {
      const { cls, kindText } = config;
      const prepare = config.prepare || (() => () => true);
      return class SigilSuggest extends EditorSuggest {
        constructor(app, plugin) {
          super(app);
          this.plugin = plugin;
        }
        onTrigger(cursor, editor) {
          const s = this.plugin.settings;
          const before = editor.getLine(cursor.line).slice(0, cursor.ch);
          const i = before.lastIndexOf(s.trigger);
          if (i === -1)
            return null;
          const query = before.slice(i + s.trigger.length);
          if (!/^[\w.:]*$/.test(query))
            return null;
          if (query.length < Math.max(0, s.minChars))
            return null;
          const off = editor.posToOffset(cursor);
          if (isProtected(editor.getValue(), off))
            return null;
          return { start: { line: cursor.line, ch: i }, end: cursor, query };
        }
        getSuggestions(ctx) {
          const idx = this.plugin.index;
          if (!idx || !idx.length)
            return [];
          const max = this.plugin.settings.maxResults;
          const f = this.plugin.parseQuery(ctx.query);
          const allowed = prepare(this.plugin);
          const pass = (e) => allowed(e) && this.plugin.entryPassesFilter(e, f);
          if (!f.name) {
            const out = [];
            for (const e of idx) {
              if (!pass(e))
                continue;
              out.push(e);
              if (out.length >= max)
                break;
            }
            return out;
          }
          const match = prepareFuzzySearch(f.name);
          const scored = [];
          for (const e of idx) {
            if (!pass(e))
              continue;
            const r = match(e.name);
            if (r)
              scored.push({ e, score: r.score });
          }
          scored.sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name));
          return scored.slice(0, max).map((s) => s.e);
        }
        renderSuggestion(e, el) {
          el.addClass(`${cls}-suggestion`);
          el.createSpan({ cls: `${cls}-name`, text: e.name });
          el.createSpan({ cls: `${cls}-kind`, text: kindText(e) });
          el.createSpan({ cls: `${cls}-path`, text: e.path });
        }
        selectSuggestion(e) {
          const ctx = this.context;
          if (!ctx)
            return;
          const inTable = inTableCell2(ctx.editor.getValue(), ctx.editor.posToOffset(ctx.start));
          const insert = (template) => {
            const link = this.plugin.buildLink(e, inTable, template);
            ctx.editor.replaceRange(link, ctx.start, ctx.end);
            const pos = ctx.editor.posToOffset(ctx.start) + link.length;
            ctx.editor.setCursor(ctx.editor.offsetToPos(pos));
          };
          this.plugin.withFormat(this.plugin.settings.askOnInsert, insert);
        }
      };
    }
    module2.exports = { createSigilSuggest };
  }
});

// src/suggest.js
var require_suggest2 = __commonJS({
  "src/suggest.js"(exports2, module2) {
    "use strict";
    var { createSigilSuggest } = require_suggest();
    var ReferenceSuggest2 = createSigilSuggest({
      cls: "reference-linker",
      kindText: (e) => e.kind === "section" ? "p." + e.page : e.lang
    });
    module2.exports = { ReferenceSuggest: ReferenceSuggest2 };
  }
});

// src/filter.js
var require_filter = __commonJS({
  "src/filter.js"(exports2, module2) {
    "use strict";
    function parseQuery(raw, kinds, exts) {
      const f = { kind: null, ext: null, name: "" };
      const parts = String(raw == null ? "" : raw).split(":");
      let i = 0;
      for (; i < parts.length - 1; i++) {
        const p = parts[i];
        if (kinds && kinds.has(p))
          f.kind = p;
        else if (exts && exts.has(p))
          f.ext = p;
        else
          break;
      }
      f.name = parts.slice(i).join(":");
      return f;
    }
    module2.exports = { parseQuery };
  }
});

// src/pdf.js
var require_pdf = __commonJS({
  "src/pdf.js"(exports2, module2) {
    "use strict";
    var obsidian = require("obsidian");
    var fs2 = require("fs");
    var libPromise = null;
    function pdfjsLib() {
      if (!libPromise) {
        libPromise = typeof obsidian.loadPdfJs === "function" ? obsidian.loadPdfJs().catch(() => null) : Promise.resolve(null);
      }
      return libPromise;
    }
    async function openDocument(absPath) {
      const lib = await pdfjsLib();
      if (!lib || typeof lib.getDocument !== "function")
        return null;
      try {
        const data = new Uint8Array(fs2.readFileSync(absPath));
        return await lib.getDocument({ data, isEvalSupported: false }).promise;
      } catch (e) {
        return null;
      }
    }
    async function pageOf(doc, dest) {
      try {
        let d = dest;
        if (typeof d === "string")
          d = await doc.getDestination(d);
        if (!Array.isArray(d) || !d[0])
          return null;
        return await doc.getPageIndex(d[0]) + 1;
      } catch (e) {
        return null;
      }
    }
    async function readOutline2(absPath) {
      const doc = await openDocument(absPath);
      if (!doc)
        return [];
      try {
        const outline = await doc.getOutline();
        if (!outline || !outline.length)
          return [];
        const out = [];
        const walk = async (items) => {
          for (const it of items) {
            const page = await pageOf(doc, it.dest);
            const title = it.title && it.title.trim();
            if (title && page)
              out.push({ title, page });
            if (it.items && it.items.length)
              await walk(it.items);
          }
        };
        await walk(outline);
        return out;
      } catch (e) {
        return [];
      } finally {
        try {
          await doc.destroy();
        } catch (e) {
        }
      }
    }
    async function renderPageToCanvas(doc, pageNum, canvas, cssWidth) {
      try {
        const n = Math.min(Math.max(1, pageNum | 0), doc.numPages);
        const page = await doc.getPage(n);
        const unit = page.getViewport({ scale: 1 });
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: cssWidth / unit.width * dpr });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = viewport.width / dpr + "px";
        canvas.style.height = viewport.height / dpr + "px";
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        page.cleanup();
        return true;
      } catch (e) {
        return false;
      }
    }
    module2.exports = { openDocument, readOutline: readOutline2, renderPageToCanvas };
  }
});

// src/shared/popover.js
var require_popover = __commonJS({
  "src/shared/popover.js"(exports2, module2) {
    "use strict";
    var SHOW_DELAY = 200;
    var HIDE_GRACE = 250;
    var EDGE_PAD = 12;
    var Popover = class {
      constructor(opts) {
        this.cls = opts.cls;
        this.hiddenCls = opts.hiddenCls;
        this.showDelay = opts.showDelay == null ? SHOW_DELAY : opts.showDelay;
        this.hideGrace = opts.hideGrace == null ? HIDE_GRACE : opts.hideGrace;
        this.onHide = opts.onHide || null;
        this.onDestroy = opts.onDestroy || null;
        this.keepAlive = opts.keepAlive || null;
        this.el = null;
        this.timer = null;
        this.hideTimer = null;
        this.key = "";
        this.pendingKey = "";
        this.token = 0;
      }
      ensureEl() {
        if (!this.el) {
          this.el = document.body.createDiv({ cls: `${this.cls} ${this.hiddenCls}` });
          this.el.addEventListener("mouseenter", () => this.cancelHide());
          this.el.addEventListener("mouseleave", () => this.leave());
        }
        return this.el;
      }
      isVisible() {
        return !!this.el && !this.el.classList.contains(this.hiddenCls);
      }
      contains(node) {
        return !!this.el && !!node && this.el.contains(node);
      }
      cancelHide() {
        clearTimeout(this.hideTimer);
        this.hideTimer = null;
      }
      // Re-asking for what is already up, or already on its way, changes nothing — otherwise
      // every mouse move would restart the timer.
      schedule(key, x, y, build) {
        this.cancelHide();
        if (key === this.key && this.isVisible())
          return;
        if (key === this.pendingKey)
          return;
        this.pendingKey = key;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          this.pendingKey = "";
          this.show(key, x, y, build);
        }, this.showDelay);
      }
      leave() {
        if (this.hideTimer)
          return;
        this.hideTimer = setTimeout(() => {
          this.hideTimer = null;
          if (this.keepAlive && this.keepAlive()) {
            this.leave();
            return;
          }
          this.hide();
        }, this.hideGrace);
      }
      async show(key, x, y, build) {
        const token = ++this.token;
        const ctx = { isCurrent: () => token === this.token };
        const el = this.ensureEl();
        el.empty();
        const after = await build(el, ctx);
        if (after === false || !ctx.isCurrent())
          return;
        this.key = key;
        el.style.visibility = "hidden";
        el.style.left = "-9999px";
        el.style.top = "0px";
        el.removeClass(this.hiddenCls);
        if (typeof after === "function")
          after();
        const r = el.getBoundingClientRect();
        let left = x + EDGE_PAD;
        let top = y + EDGE_PAD;
        if (left + r.width > window.innerWidth - EDGE_PAD)
          left = Math.max(EDGE_PAD, x - EDGE_PAD - r.width);
        if (top + r.height > window.innerHeight - EDGE_PAD)
          top = Math.max(EDGE_PAD, y - EDGE_PAD - r.height);
        el.style.left = left + "px";
        el.style.top = top + "px";
        el.style.visibility = "visible";
      }
      hide() {
        clearTimeout(this.timer);
        clearTimeout(this.hideTimer);
        this.hideTimer = null;
        this.pendingKey = "";
        this.key = "";
        this.token++;
        if (this.onHide)
          this.onHide();
        if (this.el) {
          this.el.addClass(this.hiddenCls);
          this.el.empty();
        }
      }
      destroy() {
        clearTimeout(this.timer);
        clearTimeout(this.hideTimer);
        this.token++;
        if (this.onDestroy)
          this.onDestroy();
        if (this.el) {
          this.el.remove();
          this.el = null;
        }
      }
    };
    module2.exports = { Popover, SHOW_DELAY, HIDE_GRACE };
  }
});

// src/hover.js
var require_hover = __commonJS({
  "src/hover.js"(exports2, module2) {
    "use strict";
    var nodePath2 = require("path");
    var fs2 = require("fs");
    var { openDocument, renderPageToCanvas } = require_pdf();
    var { Popover } = require_popover();
    var PREVIEW_WIDTH = 420;
    var IMAGE_EXT = /* @__PURE__ */ new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"]);
    var MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml", avif: "image/avif" };
    var keyOf = (e) => e.path + ":" + (e.page || e.line || 1);
    var HoverPreview2 = class {
      constructor(plugin) {
        this.plugin = plugin;
        this.docPath = "";
        this.doc = null;
        this.blobUrl = "";
        this.pop = new Popover({
          cls: "reference-linker-hover",
          hiddenCls: "reference-linker-hidden",
          onHide: () => this.revokeBlob(),
          onDestroy: () => {
            this.revokeBlob();
            if (this.doc) {
              try {
                this.doc.destroy();
              } catch (e) {
              }
              this.doc = null;
            }
          }
        });
      }
      // Read from onHoverMove to tell "nothing scheduled" from "waiting to show".
      get pendingKey() {
        return this.pop.pendingKey;
      }
      isVisible() {
        return this.pop.isVisible();
      }
      contains(node) {
        return this.pop.contains(node);
      }
      cancelHide() {
        this.pop.cancelHide();
      }
      leave() {
        this.pop.leave();
      }
      hide() {
        this.pop.hide();
      }
      destroy() {
        this.pop.destroy();
      }
      // Only PDFs and images preview; skip other types so nothing schedules for them.
      previewable(entry) {
        const ext = (entry.lang || "").toLowerCase();
        return ext === "pdf" || IMAGE_EXT.has(ext);
      }
      schedule(entry, x, y) {
        this.pop.cancelHide();
        if (!this.previewable(entry))
          return;
        this.pop.schedule(keyOf(entry), x, y, (el, ctx) => this.build(entry, el, ctx));
      }
      // Open + cache the PDF for `abs`, reusing it while hovering pages of the same file.
      async getDoc(abs) {
        if (this.docPath === abs && this.doc)
          return this.doc;
        if (this.doc) {
          try {
            await this.doc.destroy();
          } catch (e) {
          }
          this.doc = null;
        }
        this.doc = await openDocument(abs);
        this.docPath = this.doc ? abs : "";
        return this.doc;
      }
      async build(entry, el, ctx) {
        const root = this.plugin.codeRoot();
        const abs = root ? nodePath2.join(root, entry.path) : entry.path;
        const ext = (entry.lang || "").toLowerCase();
        const page = entry.page || 1;
        const label = entry.title || entry.name;
        el.createDiv({ cls: "reference-linker-hover-header", text: page > 1 ? label + "  \xB7  p." + page : label });
        const body = el.createDiv({ cls: "reference-linker-hover-body" });
        if (ext === "pdf") {
          const doc = await this.getDoc(abs);
          if (!ctx.isCurrent() || !doc)
            return false;
          const canvas = body.createEl("canvas");
          const ok = await renderPageToCanvas(doc, page, canvas, PREVIEW_WIDTH);
          if (!ctx.isCurrent() || !ok)
            return false;
          return void 0;
        }
        if (IMAGE_EXT.has(ext)) {
          let buf;
          try {
            buf = fs2.readFileSync(abs);
          } catch (e) {
            return false;
          }
          if (!ctx.isCurrent())
            return false;
          this.revokeBlob();
          this.blobUrl = URL.createObjectURL(new Blob([buf], { type: MIME[ext] || "application/octet-stream" }));
          body.createEl("img").src = this.blobUrl;
          return void 0;
        }
        return false;
      }
      revokeBlob() {
        if (this.blobUrl) {
          try {
            URL.revokeObjectURL(this.blobUrl);
          } catch (e) {
          }
          this.blobUrl = "";
        }
      }
    };
    module2.exports = { HoverPreview: HoverPreview2 };
  }
});

// src/shared/locales/common.js
var require_common = __commonJS({
  "src/shared/locales/common.js"(exports2, module2) {
    "use strict";
    var en = {
      "modal.andMore": "\u2026and {n} more",
      "btn.apply": "Apply",
      "btn.cancel": "Cancel",
      "set.heading.maintenance": "Maintenance",
      "set.rebuild.button": "Rebuild",
      "set.precedence.name": "Priority among linker plugins",
      "set.precedence.desc": "A word or link several linkers claim goes to the one highest in this list. You can only move this plugin \u2014 move the others from their own settings.",
      "set.precedence.other": "Moved from its own settings",
      "set.precedence.up": "Move up",
      "set.precedence.down": "Move down"
    };
    var ru = {
      "modal.andMore": "\u2026\u0438 \u0435\u0449\u0451 {n}",
      "btn.apply": "\u041F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C",
      "btn.cancel": "\u041E\u0442\u043C\u0435\u043D\u0430",
      "set.heading.maintenance": "\u041E\u0431\u0441\u043B\u0443\u0436\u0438\u0432\u0430\u043D\u0438\u0435",
      "set.rebuild.button": "\u041F\u0435\u0440\u0435\u0441\u0442\u0440\u043E\u0438\u0442\u044C",
      "set.precedence.name": "\u041F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442 \u0441\u0440\u0435\u0434\u0438 \u043F\u043B\u0430\u0433\u0438\u043D\u043E\u0432-\u043B\u0438\u043D\u043A\u0435\u0440\u043E\u0432",
      "set.precedence.desc": "\u0421\u043B\u043E\u0432\u043E \u0438\u043B\u0438 \u0441\u0441\u044B\u043B\u043A\u0443, \u043D\u0430 \u043A\u043E\u0442\u043E\u0440\u044B\u0435 \u043F\u0440\u0435\u0442\u0435\u043D\u0434\u0443\u044E\u0442 \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u043B\u0438\u043D\u043A\u0435\u0440\u043E\u0432, \u0437\u0430\u0431\u0438\u0440\u0430\u0435\u0442 \u0442\u043E\u0442, \u043A\u0442\u043E \u0432\u044B\u0448\u0435 \u0432 \u0441\u043F\u0438\u0441\u043A\u0435. \u041E\u0442\u0441\u044E\u0434\u0430 \u0434\u0432\u0438\u0433\u0430\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u044D\u0442\u043E\u0442 \u043F\u043B\u0430\u0433\u0438\u043D \u2014 \u043E\u0441\u0442\u0430\u043B\u044C\u043D\u044B\u0435 \u0438\u0437 \u0441\u0432\u043E\u0438\u0445 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043A.",
      "set.precedence.other": "\u0414\u0432\u0438\u0433\u0430\u0435\u0442\u0441\u044F \u0438\u0437 \u0441\u0432\u043E\u0438\u0445 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043A",
      "set.precedence.up": "\u0412\u044B\u0448\u0435",
      "set.precedence.down": "\u041D\u0438\u0436\u0435"
    };
    var de = {
      "modal.andMore": "\u2026und {n} weitere",
      "btn.apply": "Anwenden",
      "btn.cancel": "Abbrechen",
      "set.heading.maintenance": "Wartung",
      "set.rebuild.button": "Neu aufbauen"
    };
    var es = {
      "modal.andMore": "\u2026y {n} m\xE1s",
      "btn.apply": "Aplicar",
      "btn.cancel": "Cancelar",
      "set.heading.maintenance": "Mantenimiento",
      "set.rebuild.button": "Reconstruir"
    };
    var fr = {
      "modal.andMore": "\u2026et {n} de plus",
      "btn.apply": "Appliquer",
      "btn.cancel": "Annuler",
      "set.heading.maintenance": "Maintenance",
      "set.rebuild.button": "Reconstruire"
    };
    var uk = {
      "modal.andMore": "\u2026\u0442\u0430 \u0449\u0435 {n}",
      "btn.apply": "\u0417\u0430\u0441\u0442\u043E\u0441\u0443\u0432\u0430\u0442\u0438",
      "btn.cancel": "\u0421\u043A\u0430\u0441\u0443\u0432\u0430\u0442\u0438",
      "set.heading.maintenance": "\u041E\u0431\u0441\u043B\u0443\u0433\u043E\u0432\u0443\u0432\u0430\u043D\u043D\u044F",
      "set.rebuild.button": "\u041F\u0435\u0440\u0435\u0431\u0443\u0434\u0443\u0432\u0430\u0442\u0438"
    };
    module2.exports = { en, ru, de, es, fr, uk };
  }
});

// src/shared/locales/prose.js
var require_prose = __commonJS({
  "src/shared/locales/prose.js"(exports2, module2) {
    "use strict";
    var en = {
      "noun.file": "file",
      "noun.folder": "folder",
      "scope.first": "first",
      "scope.all": "all",
      "menu.linkThisWord": "Link \u201C{display}\u201D",
      "menu.linkHere": "Link \u201C{display}\u201D here",
      "menu.linkDisplayTo": 'Link "{display}" to\u2026',
      "menu.linkScopeTo": 'Link {scope} "{display}" to\u2026',
      "menu.openThisWord": "Open \u201C{display}\u201D",
      "modal.choose.title": "Which one?",
      "set.heading.scope": "Scope",
      "set.heading.matching": "Matching",
      "set.languages.name": "Languages",
      "set.languages.show": "Show languages",
      "set.languages.hide": "Hide languages",
      "set.lang.higher": "Higher priority",
      "set.lang.lower": "Lower priority",
      "set.linkFirstOnly.name": "Link first occurrence only",
      "set.heading.highlighting": "Highlighting",
      "set.highlightInReading.name": "Highlight in Reading view",
      "set.editingHighlight.onSave": "On save",
      "set.skipHeadings.name": "Skip headings",
      "set.statusBar.name": "Status bar count",
      "set.heading.autocomplete": "Autocomplete",
      "set.linkSuggest.name": "Suggest links while typing",
      "set.suggestMinChars.desc": "How many characters to type before suggestions appear.",
      "set.suggestSkipAfter.name": "Skip after characters",
      "set.heading.contextMenu": "Context menu"
    };
    var ru = {
      "noun.file": "\u0444\u0430\u0439\u043B",
      "noun.folder": "\u043F\u0430\u043F\u043A\u0443",
      "scope.first": "\u043F\u0435\u0440\u0432\u043E\u0435",
      "scope.all": "\u0432\u0441\u0435",
      "menu.linkThisWord": "\u0421\u0432\u044F\u0437\u0430\u0442\u044C \xAB{display}\xBB",
      "menu.linkHere": "\u0421\u0432\u044F\u0437\u0430\u0442\u044C \xAB{display}\xBB \u0437\u0434\u0435\u0441\u044C",
      "menu.linkDisplayTo": "\u0421\u0432\u044F\u0437\u0430\u0442\u044C \xAB{display}\xBB \u0441\u2026",
      "menu.linkScopeTo": "\u0421\u0432\u044F\u0437\u0430\u0442\u044C {scope} \xAB{display}\xBB \u0441\u2026",
      "menu.openThisWord": "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \xAB{display}\xBB",
      "modal.choose.title": "\u041A\u0430\u043A\u043E\u0435 \u0438\u0437 \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u0439?",
      "set.heading.scope": "\u041E\u0431\u043B\u0430\u0441\u0442\u044C",
      "set.heading.matching": "\u0421\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u0435",
      "set.languages.name": "\u042F\u0437\u044B\u043A\u0438",
      "set.languages.show": "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u044F\u0437\u044B\u043A\u0438",
      "set.languages.hide": "\u0421\u043A\u0440\u044B\u0442\u044C \u044F\u0437\u044B\u043A\u0438",
      "set.lang.higher": "\u0412\u044B\u0448\u0435 \u043F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442",
      "set.lang.lower": "\u041D\u0438\u0436\u0435 \u043F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442",
      "set.linkFirstOnly.name": "\u0421\u0432\u044F\u0437\u044B\u0432\u0430\u0442\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0435\u0440\u0432\u043E\u0435 \u0432\u0445\u043E\u0436\u0434\u0435\u043D\u0438\u0435",
      "set.heading.highlighting": "\u041F\u043E\u0434\u0441\u0432\u0435\u0442\u043A\u0430",
      "set.highlightInReading.name": "\u041F\u043E\u0434\u0441\u0432\u0435\u0442\u043A\u0430 \u0432 \u0440\u0435\u0436\u0438\u043C\u0435 \u0447\u0442\u0435\u043D\u0438\u044F",
      "set.editingHighlight.onSave": "\u041F\u0440\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0438",
      "set.skipHeadings.name": "\u041F\u0440\u043E\u043F\u0443\u0441\u043A\u0430\u0442\u044C \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u0438",
      "set.statusBar.name": "\u0421\u0447\u0451\u0442\u0447\u0438\u043A \u0432 \u0441\u0442\u0440\u043E\u043A\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F",
      "set.heading.autocomplete": "\u0410\u0432\u0442\u043E\u0434\u043E\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435",
      "set.linkSuggest.name": "\u041F\u043E\u0434\u0441\u043A\u0430\u0437\u044B\u0432\u0430\u0442\u044C \u0441\u0441\u044B\u043B\u043A\u0438 \u043F\u0440\u0438 \u043D\u0430\u0431\u043E\u0440\u0435",
      "set.suggestMinChars.desc": "\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432 \u043D\u0430\u0431\u0440\u0430\u0442\u044C, \u043F\u0440\u0435\u0436\u0434\u0435 \u0447\u0435\u043C \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F \u043F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0438.",
      "set.suggestSkipAfter.name": "\u041F\u0440\u043E\u043F\u0443\u0441\u043A\u0430\u0442\u044C \u043F\u043E\u0441\u043B\u0435 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432",
      "set.heading.contextMenu": "\u041A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u043D\u043E\u0435 \u043C\u0435\u043D\u044E"
    };
    var de = {
      "noun.file": "Datei",
      "noun.folder": "Ordner",
      "scope.first": "erstes",
      "scope.all": "alle",
      "menu.linkDisplayTo": "\u201E{display}\u201C verlinken mit\u2026",
      "menu.linkScopeTo": "{scope} \u201E{display}\u201C verlinken mit\u2026",
      "modal.choose.title": "Begriff w\xE4hlen",
      "set.heading.scope": "Bereich",
      "set.heading.matching": "Abgleich",
      "set.languages.name": "Sprachen",
      "set.languages.show": "Sprachen anzeigen",
      "set.languages.hide": "Sprachen ausblenden",
      "set.lang.higher": "H\xF6here Priorit\xE4t",
      "set.lang.lower": "Niedrigere Priorit\xE4t",
      "set.linkFirstOnly.name": "Nur erstes Vorkommen verlinken",
      "set.heading.highlighting": "Hervorhebung",
      "set.highlightInReading.name": "In der Leseansicht hervorheben",
      "set.editingHighlight.onSave": "Beim Speichern",
      "set.skipHeadings.name": "\xDCberschriften \xFCberspringen",
      "set.statusBar.name": "Z\xE4hler in der Statusleiste",
      "set.heading.autocomplete": "Autovervollst\xE4ndigung",
      "set.linkSuggest.name": "Links w\xE4hrend der Eingabe vorschlagen",
      "set.suggestMinChars.desc": "Wie viele Zeichen einzugeben sind, bevor Vorschl\xE4ge erscheinen.",
      "set.suggestSkipAfter.name": "Nach Zeichen \xFCberspringen",
      "set.heading.contextMenu": "Kontextmen\xFC"
    };
    var es = {
      "noun.file": "archivo",
      "noun.folder": "carpeta",
      "scope.first": "la primera",
      "scope.all": "todas",
      "menu.linkDisplayTo": "Enlazar \xAB{display}\xBB con\u2026",
      "menu.linkScopeTo": "Enlazar {scope} \xAB{display}\xBB con\u2026",
      "modal.choose.title": "Elegir un t\xE9rmino",
      "set.heading.scope": "\xC1mbito",
      "set.heading.matching": "Coincidencia",
      "set.languages.name": "Idiomas",
      "set.languages.show": "Mostrar idiomas",
      "set.languages.hide": "Ocultar idiomas",
      "set.lang.higher": "Mayor prioridad",
      "set.lang.lower": "Menor prioridad",
      "set.linkFirstOnly.name": "Enlazar solo la primera aparici\xF3n",
      "set.heading.highlighting": "Resaltado",
      "set.highlightInReading.name": "Resaltar en vista de lectura",
      "set.editingHighlight.onSave": "Al guardar",
      "set.skipHeadings.name": "Omitir encabezados",
      "set.statusBar.name": "Contador en la barra de estado",
      "set.heading.autocomplete": "Autocompletado",
      "set.linkSuggest.name": "Sugerir enlaces al escribir",
      "set.suggestMinChars.desc": "Cu\xE1ntos caracteres escribir antes de que aparezcan las sugerencias.",
      "set.suggestSkipAfter.name": "Omitir tras caracteres",
      "set.heading.contextMenu": "Men\xFA contextual"
    };
    var fr = {
      "noun.file": "fichier",
      "noun.folder": "dossier",
      "scope.first": "la premi\xE8re",
      "scope.all": "toutes",
      "menu.linkDisplayTo": "Lier \xAB {display} \xBB \xE0\u2026",
      "menu.linkScopeTo": "Lier {scope} \xAB {display} \xBB \xE0\u2026",
      "modal.choose.title": "Choisir un terme",
      "set.heading.scope": "Port\xE9e",
      "set.heading.matching": "Correspondance",
      "set.languages.name": "Langues",
      "set.languages.show": "Afficher les langues",
      "set.languages.hide": "Masquer les langues",
      "set.lang.higher": "Priorit\xE9 plus haute",
      "set.lang.lower": "Priorit\xE9 plus basse",
      "set.linkFirstOnly.name": "Lier seulement la premi\xE8re occurrence",
      "set.heading.highlighting": "Surlignage",
      "set.highlightInReading.name": "Surligner en mode lecture",
      "set.editingHighlight.onSave": "\xC0 l\u2019enregistrement",
      "set.skipHeadings.name": "Ignorer les titres",
      "set.statusBar.name": "Compteur dans la barre d\u2019\xE9tat",
      "set.heading.autocomplete": "Autocompl\xE9tion",
      "set.linkSuggest.name": "Sugg\xE9rer des liens pendant la saisie",
      "set.suggestMinChars.desc": "Combien de caract\xE8res saisir avant que les suggestions apparaissent.",
      "set.suggestSkipAfter.name": "Ignorer apr\xE8s caract\xE8res",
      "set.heading.contextMenu": "Menu contextuel"
    };
    var uk = {
      "noun.file": "\u0444\u0430\u0439\u043B",
      "noun.folder": "\u0442\u0435\u043A\u0443",
      "scope.first": "\u043F\u0435\u0440\u0448\u0435",
      "scope.all": "\u0443\u0441\u0456",
      "menu.linkDisplayTo": "\u0417\u0432\u2019\u044F\u0437\u0430\u0442\u0438 \xAB{display}\xBB \u0437\u2026",
      "menu.linkScopeTo": "\u0417\u0432\u2019\u044F\u0437\u0430\u0442\u0438 {scope} \xAB{display}\xBB \u0437\u2026",
      "modal.choose.title": "\u0412\u0438\u0431\u0435\u0440\u0456\u0442\u044C \u0442\u0435\u0440\u043C\u0456\u043D",
      "set.heading.scope": "\u041E\u0431\u043B\u0430\u0441\u0442\u044C",
      "set.heading.matching": "\u0417\u0456\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043D\u044F",
      "set.languages.name": "\u041C\u043E\u0432\u0438",
      "set.languages.show": "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u0438 \u043C\u043E\u0432\u0438",
      "set.languages.hide": "\u0421\u0445\u043E\u0432\u0430\u0442\u0438 \u043C\u043E\u0432\u0438",
      "set.lang.higher": "\u0412\u0438\u0449\u0438\u0439 \u043F\u0440\u0456\u043E\u0440\u0438\u0442\u0435\u0442",
      "set.lang.lower": "\u041D\u0438\u0436\u0447\u0438\u0439 \u043F\u0440\u0456\u043E\u0440\u0438\u0442\u0435\u0442",
      "set.linkFirstOnly.name": "\u0417\u0432\u2019\u044F\u0437\u0443\u0432\u0430\u0442\u0438 \u043B\u0438\u0448\u0435 \u043F\u0435\u0440\u0448\u0435 \u0432\u0445\u043E\u0434\u0436\u0435\u043D\u043D\u044F",
      "set.heading.highlighting": "\u041F\u0456\u0434\u0441\u0432\u0456\u0447\u0443\u0432\u0430\u043D\u043D\u044F",
      "set.highlightInReading.name": "\u041F\u0456\u0434\u0441\u0432\u0456\u0447\u0443\u0432\u0430\u0442\u0438 \u0432 \u0440\u0435\u0436\u0438\u043C\u0456 \u0447\u0438\u0442\u0430\u043D\u043D\u044F",
      "set.editingHighlight.onSave": "\u041F\u0456\u0434 \u0447\u0430\u0441 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043D\u044F",
      "set.skipHeadings.name": "\u041F\u0440\u043E\u043F\u0443\u0441\u043A\u0430\u0442\u0438 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u0438",
      "set.statusBar.name": "\u041B\u0456\u0447\u0438\u043B\u044C\u043D\u0438\u043A \u0443 \u0440\u044F\u0434\u043A\u0443 \u0441\u0442\u0430\u043D\u0443",
      "set.heading.autocomplete": "\u0410\u0432\u0442\u043E\u0434\u043E\u043F\u043E\u0432\u043D\u0435\u043D\u043D\u044F",
      "set.linkSuggest.name": "\u041F\u0440\u043E\u043F\u043E\u043D\u0443\u0432\u0430\u0442\u0438 \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F \u043F\u0456\u0434 \u0447\u0430\u0441 \u043D\u0430\u0431\u043E\u0440\u0443",
      "set.suggestMinChars.desc": "\u0421\u043A\u0456\u043B\u044C\u043A\u0438 \u0441\u0438\u043C\u0432\u043E\u043B\u0456\u0432 \u043D\u0430\u0431\u0440\u0430\u0442\u0438, \u043F\u0435\u0440\u0448 \u043D\u0456\u0436 \u0437\u2019\u044F\u0432\u043B\u044F\u0442\u044C\u0441\u044F \u043F\u0456\u0434\u043A\u0430\u0437\u043A\u0438.",
      "set.suggestSkipAfter.name": "\u041F\u0440\u043E\u043F\u0443\u0441\u043A\u0430\u0442\u0438 \u043F\u0456\u0441\u043B\u044F \u0441\u0438\u043C\u0432\u043E\u043B\u0456\u0432",
      "set.heading.contextMenu": "\u041A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u043D\u0435 \u043C\u0435\u043D\u044E"
    };
    module2.exports = { en, ru, de, es, fr, uk };
  }
});

// src/shared/locales/sigil.js
var require_sigil = __commonJS({
  "src/shared/locales/sigil.js"(exports2, module2) {
    "use strict";
    var en = {
      "menu.convert": "Find and convert to link",
      "menu.convert.group": "Find and convert to link",
      "menu.open.group": "Find and open",
      "notice.updateSkipped": "({n} note(s) skipped \u2014 changed since the preview)",
      "embed.menu.refresh": "Refresh embed",
      "modal.embedPlaceholder": "Choose an embed format\u2026",
      "modal.update.summary": "{links} change(s) across {files} note(s). Uncheck any change to skip it, or a note to skip all of its changes.",
      "modal.update.upToDate": "Everything is up to date \u2014 nothing to update.",
      "btn.close": "Close",
      "label.thisNote": "This note",
      "set.heading.suggestions": "Suggestions & links",
      "set.heading.hover": "Hover preview",
      "set.heading.links": "Links",
      "set.codeRoot.desc": "Base folder the scan paths are relative to. Empty = the folder containing this vault.",
      "set.scanFolders.name": "Scan folders",
      "set.folderList.add": "Add folder\u2026",
      "set.folderList.remove": "Remove",
      "set.folderList.addAria": "Add",
      "set.skipFolders.name": "Skip folders",
      "set.trigger.name": "Trigger",
      "set.preset.file": "file://",
      "set.preset.ask": "Always ask",
      "set.editors.count": "{n} added",
      "set.editors.collapse": "Collapse",
      "set.editors.expand": "Expand",
      "set.editors.namePlaceholder": "Name",
      "set.editors.remove": "Remove",
      "set.minChars.name": "Min characters",
      "set.minChars.desc": "How many characters to type before suggestions appear.",
      "set.maxResults.name": "Max results",
      "set.maxResults.desc": "Most suggestions to show at once.",
      "set.autoRefresh.name": "Auto-refresh index",
      "set.autoRefresh.unsupported": "Recursive folder watching isn\u2019t supported on this platform (Linux); rebuild manually instead.",
      "set.contextMenu.name": "Editor context menu",
      "set.markStaleLinks.name": "Mark stale links",
      "set.info.unknownRoot": "(unknown)",
      "plural.entry": { one: "{n} entry", other: "{n} entries" }
    };
    var ru = {
      "menu.convert": "\u041D\u0430\u0439\u0442\u0438 \u0438 \u043F\u0440\u0435\u0432\u0440\u0430\u0442\u0438\u0442\u044C \u0432 \u0441\u0441\u044B\u043B\u043A\u0443",
      "menu.convert.group": "\u041D\u0430\u0439\u0442\u0438 \u0438 \u043F\u0440\u0435\u0432\u0440\u0430\u0442\u0438\u0442\u044C \u0432 \u0441\u0441\u044B\u043B\u043A\u0443",
      "menu.open.group": "\u041D\u0430\u0439\u0442\u0438 \u0438 \u043E\u0442\u043A\u0440\u044B\u0442\u044C",
      "notice.updateSkipped": "(\u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E \u0437\u0430\u043C\u0435\u0442\u043E\u043A \u2014 {n}: \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0438\u0441\u044C \u043F\u043E\u0441\u043B\u0435 \u043F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430)",
      "embed.menu.refresh": "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C embed",
      "modal.embedPlaceholder": "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0444\u043E\u0440\u043C\u0430\u0442 embed\u2026",
      "modal.update.summary": "\u041F\u0440\u0430\u0432\u043E\u043A \u2014 {links} \u0432 \u0437\u0430\u043C\u0435\u0442\u043A\u0430\u0445: {files}. \u0421\u043D\u0438\u043C\u0438\u0442\u0435 \u0433\u0430\u043B\u043E\u0447\u043A\u0443 \u0441 \u043F\u0440\u0430\u0432\u043A\u0438, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u043E\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0435\u0451, \u0438\u043B\u0438 \u0441 \u0437\u0430\u043C\u0435\u0442\u043A\u0438 \u2014 \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u043E\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0432\u0441\u0435 \u0435\u0451 \u043F\u0440\u0430\u0432\u043A\u0438.",
      "modal.update.upToDate": "\u0412\u0441\u0451 \u0430\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u043E \u2014 \u043E\u0431\u043D\u043E\u0432\u043B\u044F\u0442\u044C \u043D\u0435\u0447\u0435\u0433\u043E.",
      "btn.close": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C",
      "label.thisNote": "\u042D\u0442\u0430 \u0437\u0430\u043C\u0435\u0442\u043A\u0430",
      "set.heading.suggestions": "\u041F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0438 \u0438 \u0441\u0441\u044B\u043B\u043A\u0438",
      "set.heading.hover": "\u041F\u0440\u0435\u0432\u044C\u044E \u043F\u0440\u0438 \u043D\u0430\u0432\u0435\u0434\u0435\u043D\u0438\u0438",
      "set.heading.links": "\u0421\u0441\u044B\u043B\u043A\u0438",
      "set.codeRoot.desc": "\u0411\u0430\u0437\u043E\u0432\u0430\u044F \u043F\u0430\u043F\u043A\u0430, \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u043A\u043E\u0442\u043E\u0440\u043E\u0439 \u0437\u0430\u0434\u0430\u044E\u0442\u0441\u044F \u043F\u0443\u0442\u0438 \u0441\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F. \u041F\u0443\u0441\u0442\u043E = \u043F\u0430\u043F\u043A\u0430, \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0449\u0430\u044F \u044D\u0442\u043E \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435.",
      "set.scanFolders.name": "\u041F\u0430\u043F\u043A\u0438 \u0441\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F",
      "set.folderList.add": "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043F\u0430\u043F\u043A\u0443\u2026",
      "set.folderList.remove": "\u0423\u0434\u0430\u043B\u0438\u0442\u044C",
      "set.folderList.addAria": "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C",
      "set.skipFolders.name": "\u041F\u0440\u043E\u043F\u0443\u0441\u043A\u0430\u0435\u043C\u044B\u0435 \u043F\u0430\u043F\u043A\u0438",
      "set.trigger.name": "\u0422\u0440\u0438\u0433\u0433\u0435\u0440",
      "set.preset.file": "file://",
      "set.preset.ask": "\u0412\u0441\u0435\u0433\u0434\u0430 \u0441\u043F\u0440\u0430\u0448\u0438\u0432\u0430\u0442\u044C",
      "set.editors.count": "\u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u043E: {n}",
      "set.editors.collapse": "\u0421\u0432\u0435\u0440\u043D\u0443\u0442\u044C",
      "set.editors.expand": "\u0420\u0430\u0437\u0432\u0435\u0440\u043D\u0443\u0442\u044C",
      "set.editors.namePlaceholder": "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435",
      "set.editors.remove": "\u0423\u0434\u0430\u043B\u0438\u0442\u044C",
      "set.minChars.name": "\u041C\u0438\u043D\u0438\u043C\u0443\u043C \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432",
      "set.minChars.desc": "\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432 \u0432\u0432\u0435\u0441\u0442\u0438, \u043F\u0440\u0435\u0436\u0434\u0435 \u0447\u0435\u043C \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F \u043F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0438.",
      "set.maxResults.name": "\u041C\u0430\u043A\u0441\u0438\u043C\u0443\u043C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u043E\u0432",
      "set.maxResults.desc": "\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u0434\u0441\u043A\u0430\u0437\u043E\u043A \u043F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0442\u044C \u043E\u0434\u043D\u043E\u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E.",
      "set.autoRefresh.name": "\u0410\u0432\u0442\u043E\u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u0438\u043D\u0434\u0435\u043A\u0441\u0430",
      "set.autoRefresh.unsupported": "\u0420\u0435\u043A\u0443\u0440\u0441\u0438\u0432\u043D\u043E\u0435 \u0441\u043B\u0435\u0436\u0435\u043D\u0438\u0435 \u0437\u0430 \u043F\u0430\u043F\u043A\u0430\u043C\u0438 \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F \u043D\u0430 \u044D\u0442\u043E\u0439 \u043F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0435 (Linux); \u043F\u0435\u0440\u0435\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u0439\u0442\u0435 \u0432\u0440\u0443\u0447\u043D\u0443\u044E.",
      "set.contextMenu.name": "\u041A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u043D\u043E\u0435 \u043C\u0435\u043D\u044E \u0440\u0435\u0434\u0430\u043A\u0442\u043E\u0440\u0430",
      "set.markStaleLinks.name": "\u041E\u0442\u043C\u0435\u0447\u0430\u0442\u044C \u0443\u0441\u0442\u0430\u0440\u0435\u0432\u0448\u0438\u0435 \u0441\u0441\u044B\u043B\u043A\u0438",
      "set.info.unknownRoot": "(\u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E)",
      "plural.entry": { one: "{n} \u0437\u0430\u043F\u0438\u0441\u044C", few: "{n} \u0437\u0430\u043F\u0438\u0441\u0438", many: "{n} \u0437\u0430\u043F\u0438\u0441\u0435\u0439", other: "{n} \u0437\u0430\u043F\u0438\u0441\u0435\u0439" }
    };
    module2.exports = { en, ru };
  }
});

// src/shared/i18n.js
var require_i18n = __commonJS({
  "src/shared/i18n.js"(exports2, module2) {
    "use strict";
    var LOCALES = { en: {} };
    var dict = LOCALES.en;
    var pluralRules = new Intl.PluralRules("en");
    function initI18n2(locales) {
      LOCALES = locales;
      const sys = (window.localStorage.getItem("language") || "").split("-")[0].toLowerCase();
      const locale = LOCALES[sys] ? sys : "en";
      dict = LOCALES[locale];
      try {
        pluralRules = new Intl.PluralRules(locale);
      } catch (e) {
        pluralRules = new Intl.PluralRules("en");
      }
    }
    function interpolate(str, vars) {
      if (!vars)
        return str;
      return str.replace(/\{(\w+)\}/g, (m, k) => k in vars ? String(vars[k]) : m);
    }
    function t2(key, vars) {
      let entry = dict[key];
      if (entry === void 0)
        entry = LOCALES.en[key];
      if (entry === void 0)
        return key;
      return interpolate(entry, vars);
    }
    function plural2(noun, n) {
      const forms = dict["plural." + noun] || LOCALES.en["plural." + noun];
      if (!forms)
        return n + " " + noun;
      let cat;
      try {
        cat = pluralRules.select(n);
      } catch (e) {
        cat = "other";
      }
      const tpl = forms[cat] != null ? forms[cat] : forms.other != null ? forms.other : Object.values(forms)[0];
      return interpolate(tpl, { n });
    }
    var FAMILY = {
      common: require_common(),
      prose: require_prose(),
      sigil: require_sigil()
    };
    function withFamily2(kind, pluginLocales) {
      const common = FAMILY.common;
      const pair = FAMILY[kind] || {};
      const out = {};
      for (const lang of Object.keys(pluginLocales)) {
        out[lang] = Object.assign({}, common[lang], pair[lang], pluginLocales[lang]);
      }
      return out;
    }
    module2.exports = { initI18n: initI18n2, t: t2, plural: plural2, withFamily: withFamily2 };
  }
});

// src/embed.js
var require_embed = __commonJS({
  "src/embed.js"(exports2, module2) {
    "use strict";
    var { MarkdownRenderChild, Menu } = require("obsidian");
    var nodePath2 = require("path");
    var fs2 = require("fs");
    var { openDocument, renderPageToCanvas } = require_pdf();
    var { t: t2 } = require_i18n();
    var EMBED_LANG = "reference-link";
    var DEFAULT_WIDTH = 600;
    var IMAGE_EXT = /* @__PURE__ */ new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"]);
    var MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml", avif: "image/avif" };
    var baseName = (p) => nodePath2.basename(p).replace(/\.[^.]+$/, "");
    var looksLikePath = (s) => s.includes("/") || s.includes("\\") || /\.[a-z0-9]+$/i.test(s);
    function parseSpec(source) {
      const spec = { target: "", page: "", width: "", title: "" };
      for (const raw of source.split("\n")) {
        const line = raw.trim();
        if (!line)
          continue;
        const m = /^(page|width|title)\s*:\s*(.*)$/i.exec(line);
        if (m)
          spec[m[1].toLowerCase()] = m[2].trim();
        else if (!spec.target)
          spec.target = line;
      }
      return spec;
    }
    function splitPage(target) {
      let m = /^(.*)#page=(\d+)\s*$/i.exec(target);
      if (m)
        return { path: m[1], page: parseInt(m[2], 10) };
      m = /^(.+?):(\d+)\s*$/.exec(target);
      if (m)
        return { path: m[1], page: parseInt(m[2], 10) };
      return { path: target, page: null };
    }
    function resolve(plugin, spec) {
      const target = spec.target;
      if (!target)
        return { error: t2("embed.empty") };
      const sp = splitPage(target);
      let relPath, page, name;
      if (looksLikePath(sp.path)) {
        const norm = sp.path.split("\\").join("/").replace(/^\.?\//, "");
        const hit = plugin.lookup(norm)[0];
        relPath = hit ? hit.path : norm;
        name = hit ? hit.name : baseName(relPath);
        page = sp.page;
      } else {
        const f = plugin.parseQuery(target);
        const matches = plugin.entriesByName(f.name).filter((m) => plugin.entryPassesFilter(m, f));
        if (!matches.length)
          return { error: t2("embed.notFound", { query: target }) };
        const paths = new Set(matches.map((m) => m.path));
        if (paths.size > 1)
          return { error: t2("embed.ambiguous", { n: paths.size, query: target }) };
        const e = matches.find((m) => m.kind === "section") || matches[0];
        relPath = e.path;
        name = e.name;
        page = e.page;
      }
      const specPage = parseInt(spec.page, 10);
      if (Number.isFinite(specPage))
        page = specPage;
      page = page || 1;
      const root = plugin.codeRoot();
      const absPath = root ? nodePath2.join(root, relPath) : relPath;
      const ext = nodePath2.extname(relPath).slice(1).toLowerCase();
      const kind = page > 1 ? "section" : "file";
      return { absPath, relPath, ext, page, name, entry: { name, kind, path: relPath, line: page, page } };
    }
    var ReferenceEmbed = class extends MarkdownRenderChild {
      constructor(containerEl, plugin, spec) {
        super(containerEl);
        this.plugin = plugin;
        this.spec = spec;
        this.renderId = 0;
        this.blobUrl = "";
      }
      onload() {
        this.containerEl.addEventListener("contextmenu", (evt) => this.onContextMenu(evt));
        this.render();
        this.unsub = this.plugin.onIndexChange(() => this.render());
      }
      onunload() {
        if (this.unsub)
          this.unsub();
        this.revokeBlob();
      }
      // Open the embedded document at its page — the same path the open/insert commands use.
      open() {
        const e = this.res && this.res.entry;
        if (!e)
          return;
        this.plugin.withFormat(this.plugin.settings.askOnInsert, (tpl) => this.plugin.openEntry(e, tpl));
      }
      onContextMenu(evt) {
        if (!this.res)
          return;
        evt.preventDefault();
        evt.stopPropagation();
        const menu = new Menu();
        if (this.res.entry)
          menu.addItem((i) => i.setTitle(t2("embed.menu.open")).setIcon("go-to-file").onClick(() => this.open()));
        menu.addItem((i) => i.setTitle(t2("embed.menu.refresh")).setIcon("refresh-cw").onClick(() => this.render(true)));
        menu.showAtMouseEvent(evt);
      }
      notice(cls, text) {
        this.containerEl.empty();
        this.containerEl.createDiv({ cls, text });
      }
      revokeBlob() {
        if (this.blobUrl) {
          try {
            URL.revokeObjectURL(this.blobUrl);
          } catch (e) {
          }
          this.blobUrl = "";
        }
      }
      width() {
        const n = parseInt(this.spec.width, 10);
        return Number.isFinite(n) && n > 0 ? n : DEFAULT_WIDTH;
      }
      async render(force) {
        const token = ++this.renderId;
        const res = resolve(this.plugin, this.spec);
        this.res = res;
        const cached = res.relPath && this.plugin.fileCache.get(res.relPath);
        const mtime = cached ? cached.mtimeMs : null;
        const sig = res.error ? "err:" + res.error : res.absPath + "|" + res.page + "|" + mtime + "|" + this.width();
        if (!force && sig === this.lastSig && (res.error || mtime != null))
          return;
        this.lastSig = sig;
        if (res.error) {
          this.notice("reference-linker-embed-error", res.error);
          return;
        }
        const el = this.containerEl;
        el.empty();
        el.addClass("reference-linker-embed");
        const header = el.createDiv({ cls: "reference-linker-embed-header mod-clickable" });
        header.createSpan({ text: this.spec.title || res.name + (res.entry.kind === "section" ? "  \xB7  p." + res.page : "") });
        header.addEventListener("click", () => this.open());
        const body = el.createDiv({ cls: "reference-linker-embed-body" });
        if (res.ext === "pdf") {
          const doc = await openDocument(res.absPath);
          if (token !== this.renderId) {
            if (doc) {
              try {
                await doc.destroy();
              } catch (e) {
              }
            }
            return;
          }
          if (!doc) {
            this.fail(res);
            return;
          }
          const canvas = body.createEl("canvas");
          const ok = await renderPageToCanvas(doc, res.page, canvas, this.width());
          try {
            await doc.destroy();
          } catch (e) {
          }
          if (token !== this.renderId)
            return;
          if (!ok) {
            this.fail(res);
            return;
          }
        } else if (IMAGE_EXT.has(res.ext)) {
          let buf;
          try {
            buf = fs2.readFileSync(res.absPath);
          } catch (e) {
            this.fail(res);
            return;
          }
          if (token !== this.renderId)
            return;
          this.revokeBlob();
          this.blobUrl = URL.createObjectURL(new Blob([buf], { type: MIME[res.ext] || "application/octet-stream" }));
          const img = body.createEl("img");
          img.src = this.blobUrl;
          img.style.maxWidth = this.width() + "px";
        } else {
          this.notice("reference-linker-embed-error", t2("embed.unsupported", { path: res.relPath }));
          this.lastSig = null;
        }
      }
      fail(res) {
        this.notice("reference-linker-embed-error", t2("embed.unreadable", { path: res.relPath }));
        this.lastSig = null;
      }
    };
    function registerEmbed2(plugin) {
      plugin.registerMarkdownCodeBlockProcessor(EMBED_LANG, (source, el, ctx) => {
        ctx.addChild(new ReferenceEmbed(el, plugin, parseSpec(source)));
      });
    }
    module2.exports = { registerEmbed: registerEmbed2 };
  }
});

// src/shared/actualize.js
var require_actualize = __commonJS({
  "src/shared/actualize.js"(exports2, module2) {
    "use strict";
    var { Notice: Notice2, MarkdownView: MarkdownView2 } = require("obsidian");
    var { ViewPlugin, Decoration } = require("@codemirror/view");
    var { RangeSetBuilder, StateEffect } = require("@codemirror/state");
    var { syntaxTree } = require("@codemirror/language");
    var { linkRegex: linkRegex2 } = require_markdown();
    var { t: t2 } = require_i18n();
    var SKIP_NODE = /code|comment|frontmatter/i;
    var refreshEffect = StateEffect.define();
    function refreshStaleLinks(app) {
      app.workspace.iterateAllLeaves((leaf) => {
        const cm = leaf.view && leaf.view.editor && leaf.view.editor.cm;
        if (cm)
          cm.dispatch({ effects: refreshEffect.of(null) });
      });
    }
    function staleLinksExtension(plugin, classes) {
      const marks = {
        stale: Decoration.mark({ class: classes.stale }),
        broken: Decoration.mark({ class: classes.broken })
      };
      const build = (view) => {
        const builder = new RangeSetBuilder();
        if (plugin.settings.markStaleLinks) {
          const tree = syntaxTree(view.state);
          for (const { from, to } of view.visibleRanges) {
            const text = view.state.doc.sliceString(from, to);
            const re = linkRegex2();
            let m;
            while (m = re.exec(text)) {
              const start = from + m.index;
              const end = start + m[0].length;
              let inCodeNode = false;
              tree.iterate({ from: start, to: end, enter: (n) => {
                if (SKIP_NODE.test(n.type.name))
                  inCodeNode = true;
              } });
              const state = inCodeNode ? null : plugin.linkState(m[2]);
              if (state)
                builder.add(start, end, marks[state]);
            }
          }
        }
        return builder.finish();
      };
      return ViewPlugin.fromClass(
        class {
          constructor(view) {
            this.decorations = build(view);
          }
          update(u) {
            const refresh = u.transactions.some((tr) => tr.effects.some((e) => e.is(refreshEffect)));
            if (u.docChanged || u.viewportChanged || refresh)
              this.decorations = build(u.view);
          }
        },
        { decorations: (v) => v.decorations }
      );
    }
    async function rewriteActiveNote(plugin, transform, noticeKey) {
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView2);
      const editor = view && view.editor;
      if (editor) {
        const { text: text2, count: count2 } = transform(plugin, editor.getValue());
        if (count2) {
          const cur = editor.getCursor();
          editor.setValue(text2);
          editor.setCursor(cur);
        }
        new Notice2(t2(noticeKey, { n: count2 }));
        return;
      }
      const file = plugin.app.workspace.getActiveFile();
      if (!file) {
        new Notice2(t2(noticeKey, { n: 0 }));
        return;
      }
      const { text, count } = transform(plugin, await plugin.app.vault.read(file));
      if (count)
        await plugin.app.vault.modify(file, text);
      new Notice2(t2(noticeKey, { n: count }));
    }
    async function rewriteVault(plugin, transform, noticeKey) {
      let files = 0, total = 0;
      for (const f of plugin.app.vault.getMarkdownFiles()) {
        const { text, count } = transform(plugin, await plugin.app.vault.read(f));
        if (count) {
          await plugin.app.vault.modify(f, text);
          files++;
          total += count;
        }
      }
      new Notice2(t2(noticeKey, { n: total, files }));
    }
    module2.exports = { SKIP_NODE, refreshEffect, refreshStaleLinks, staleLinksExtension, rewriteActiveNote, rewriteVault };
  }
});

// src/shared/update-preview.js
var require_update_preview = __commonJS({
  "src/shared/update-preview.js"(exports2, module2) {
    "use strict";
    var { Notice: Notice2, Modal, MarkdownView: MarkdownView2 } = require("obsidian");
    var { t: t2 } = require_i18n();
    var MAX_ROWS = 50;
    var UpdatePreviewModal = class extends Modal {
      constructor(app, entries, onApply, prefix) {
        super(app);
        this.entries = entries;
        this.onApply = onApply;
        this.prefix = prefix;
        for (const e of entries)
          for (const c of e.changes)
            c.selected = true;
      }
      cls(suffix) {
        return suffix ? this.prefix + "-" + suffix : this.prefix;
      }
      onOpen() {
        const { contentEl } = this;
        contentEl.addClass(this.cls());
        contentEl.createEl("h3", { text: t2("modal.update.title") });
        const changed = this.entries.filter((e) => e.changes.length);
        const total = changed.reduce((n, e) => n + e.changes.length, 0);
        const brokenTotal = this.entries.reduce((n, e) => n + e.broken.length, 0);
        if (!total && !brokenTotal) {
          contentEl.createEl("p", { cls: this.cls("empty"), text: t2("modal.update.upToDate") });
        } else {
          if (total)
            contentEl.createEl("p", { text: t2("modal.update.summary", { links: total, files: changed.length }) });
          if (brokenTotal)
            contentEl.createEl("p", { cls: this.cls("attention"), text: t2("modal.update.attention", { n: brokenTotal }) });
          this.entries.forEach((e) => this.renderEntry(contentEl, e));
        }
        const bar = contentEl.createDiv({ cls: this.cls("buttons") });
        if (total) {
          bar.createEl("button", { text: t2("btn.apply"), cls: "mod-cta" }).onclick = async () => {
            this.close();
            await this.onApply(this.entries);
          };
          bar.createEl("button", { text: t2("btn.cancel") }).onclick = () => this.close();
        } else {
          bar.createEl("button", { text: t2("btn.close"), cls: "mod-cta" }).onclick = () => this.close();
        }
      }
      renderEntry(contentEl, e) {
        if (!e.changes.length && !e.broken.length)
          return;
        const head = contentEl.createDiv({ cls: this.cls("file") });
        if (e.changes.length) {
          const rowBoxes = [];
          const label = head.createEl("label", { cls: this.cls("check") });
          const master = label.createEl("input", { type: "checkbox" });
          master.checked = true;
          master.onchange = () => {
            e.changes.forEach((c, i) => {
              c.selected = master.checked;
              if (rowBoxes[i])
                rowBoxes[i].checked = master.checked;
            });
            master.indeterminate = false;
          };
          label.createSpan({ text: e.label });
          const syncMaster = () => {
            const on = e.changes.filter((c) => c.selected).length;
            master.checked = on > 0;
            master.indeterminate = on > 0 && on < e.changes.length;
          };
          const table = contentEl.createEl("table", { cls: this.cls("table") });
          e.changes.slice(0, MAX_ROWS).forEach((c) => {
            const tr = table.createEl("tr");
            const cb = tr.createEl("td", { cls: this.cls("pick") }).createEl("input", { type: "checkbox" });
            cb.checked = c.selected;
            cb.onchange = () => {
              c.selected = cb.checked;
              syncMaster();
            };
            rowBoxes.push(cb);
            tr.createEl("td", { text: c.label });
            if (c.toPath) {
              tr.addClass(this.cls("moved"));
              tr.createEl("td", { cls: this.cls("move"), text: c.fromPath + ":" + c.from + " \u2192 " + c.toPath + ":" + c.to });
            } else {
              tr.createEl("td", { cls: this.cls("move"), text: c.from + " \u2192 " + c.to });
            }
          });
          if (e.changes.length > MAX_ROWS)
            contentEl.createEl("div", { cls: this.cls("more"), text: t2("modal.andMore", { n: e.changes.length - MAX_ROWS }) });
        } else {
          head.setText(e.label);
        }
        e.broken.forEach((label) => contentEl.createDiv({ cls: this.cls("broken"), text: t2("modal.update.brokenRow", { label }) }));
      }
      onClose() {
        this.contentEl.empty();
      }
    };
    async function applyUpdates(plugin, entries, rewrite) {
      let files = 0, total = 0, skipped = 0;
      for (const e of entries) {
        const keys = new Set(e.changes.filter((c) => c.selected).map((c) => c.key));
        if (!keys.size)
          continue;
        if (e.editor) {
          if (e.editor.getValue() !== e.original) {
            skipped++;
            continue;
          }
          const { newText, count } = rewrite(plugin, e.original, keys);
          const cur = e.editor.getCursor();
          e.editor.setValue(newText);
          e.editor.setCursor(cur);
          files++;
          total += count;
        } else {
          let count = 0;
          await plugin.app.vault.process(e.file, (data) => {
            if (data !== e.original)
              return data;
            const out = rewrite(plugin, data, keys);
            count = out.count;
            return out.newText;
          });
          if (count) {
            files++;
            total += count;
          } else
            skipped++;
        }
      }
      let msg = t2("notice.linksUpdatedVault", { n: total, files });
      if (skipped)
        msg += " " + t2("notice.updateSkipped", { n: skipped });
      new Notice2(msg);
    }
    function openUpdatePreview(plugin, entries, rewrite, prefix) {
      new UpdatePreviewModal(plugin.app, entries, (chosen) => applyUpdates(plugin, chosen, rewrite), prefix).open();
    }
    async function updateInActiveNote(plugin, rewrite, prefix) {
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView2);
      const editor = view && view.editor;
      const file = plugin.app.workspace.getActiveFile();
      if (editor) {
        const original2 = editor.getValue();
        const c2 = rewrite(plugin, original2, null);
        openUpdatePreview(plugin, [{ editor, label: file && file.path || t2("label.thisNote"), original: original2, changes: c2.changes, broken: c2.broken }], rewrite, prefix);
        return;
      }
      if (!file) {
        new Notice2(t2("notice.linksUpdated", { n: 0 }));
        return;
      }
      const original = await plugin.app.vault.read(file);
      const c = rewrite(plugin, original, null);
      openUpdatePreview(plugin, [{ file, label: file.path, original, changes: c.changes, broken: c.broken }], rewrite, prefix);
    }
    async function updateInVault(plugin, rewrite, prefix) {
      const entries = [];
      for (const f of plugin.app.vault.getMarkdownFiles()) {
        const original = await plugin.app.vault.read(f);
        const c = rewrite(plugin, original, null);
        if (c.changes.length || c.broken.length)
          entries.push({ file: f, label: f.path, original, changes: c.changes, broken: c.broken });
      }
      openUpdatePreview(plugin, entries, rewrite, prefix);
    }
    module2.exports = { UpdatePreviewModal, applyUpdates, openUpdatePreview, updateInActiveNote, updateInVault };
  }
});

// src/actualize.js
var require_actualize2 = __commonJS({
  "src/actualize.js"(exports2, module2) {
    "use strict";
    var { splitTarget: splitTarget2, withTitle: withTitle2, rewriteLinks } = require_markdown();
    var { PAGE_RE, parseBinding: parseBinding2, formatBinding: formatBinding2, ownsBinding: ownsBinding2 } = require_binding();
    var shared = require_actualize();
    var preview = require_update_preview();
    var OWNER2 = "reference";
    var PREVIEW_CLASS = "reference-linker-preview";
    var withPage = (url, page) => PAGE_RE.test(url) ? url.replace(PAGE_RE, "#page=" + page) : url + "#page=" + page;
    var rewriteUpdates = (plugin, text, selected) => {
      const collect = selected == null;
      const changes = [];
      const broken = [];
      let key = 0;
      const links = rewriteLinks(text, (name, target) => {
        const r = bindStateOf(plugin, target);
        if (r && r.state === "stale") {
          const k = key++;
          const { url, title } = splitTarget2(target);
          if (collect)
            changes.push({ key: k, label: name, from: String(plugin.targetPage(url)), to: String(r.line) });
          if (!collect && !selected.has(k))
            return null;
          return "[" + name + "](" + withTitle2(withPage(url, r.line), title) + ")";
        }
        if (collect && r && r.state === "broken")
          broken.push(name);
        return null;
      });
      return { newText: links.text, count: links.count, changes, broken };
    };
    var pinLinksInText = (plugin, text) => rewriteLinks(text, (name, target) => {
      const { url, title } = splitTarget2(target);
      if (title)
        return null;
      const sec = plugin.sectionAtLinkPage(url);
      return sec ? "[" + name + "](" + withTitle2(url, formatBinding2({ sec: sec.name })) + ")" : null;
    });
    var { refreshStaleLinks } = shared;
    var staleLinksExtension = (plugin) => shared.staleLinksExtension(plugin, { stale: "reference-linker-stale", broken: "reference-linker-broken" });
    function bindStateOf(plugin, target) {
      const { url, title } = splitTarget2(target);
      if (!url || !/^file:\/\//i.test(url))
        return null;
      const b = ownsBinding2(title, OWNER2) ? parseBinding2(title) : null;
      return b ? plugin.urlBindState(url, b, plugin.targetPage(url)) : null;
    }
    var methods = {
      linkState(target) {
        const r = bindStateOf(this, target);
        return r ? r.state : null;
      },
      isLinkStale(target) {
        return this.linkState(target) === "stale";
      },
      // The link with its page corrected, or null when there's nothing to fix. The binding
      // rides along. bindStateFrom names the moved-to position `line`; here it's a page.
      actualizedTarget(target) {
        const r = bindStateOf(this, target);
        if (!r || r.state !== "stale")
          return null;
        const { url, title } = splitTarget2(target);
        return withTitle2(withPage(url, r.line), title);
      },
      rewriteActiveNote(transform, noticeKey) {
        return shared.rewriteActiveNote(this, transform, noticeKey);
      },
      rewriteVault(transform, noticeKey) {
        return shared.rewriteVault(this, transform, noticeKey);
      },
      updateLinksInActiveNote() {
        return preview.updateInActiveNote(this, rewriteUpdates, PREVIEW_CLASS);
      },
      updateLinksInVault() {
        return preview.updateInVault(this, rewriteUpdates, PREVIEW_CLASS);
      },
      pinLinksInActiveNote() {
        return this.rewriteActiveNote(pinLinksInText, "notice.linksPinned");
      },
      pinLinksInVault() {
        return this.rewriteVault(pinLinksInText, "notice.linksPinnedVault");
      }
    };
    module2.exports = { methods, staleLinksExtension, refreshStaleLinks };
  }
});

// src/modal.js
var require_modal = __commonJS({
  "src/modal.js"(exports2, module2) {
    "use strict";
    var { FuzzySuggestModal } = require("obsidian");
    var { t: t2 } = require_i18n();
    var ReferenceLinkModal2 = class extends FuzzySuggestModal {
      constructor(app, plugin, opts) {
        super(app);
        this.plugin = plugin;
        this.onChoose = opts && opts.onChoose || (() => {
        });
        this.initialQuery = opts && opts.query || "";
        this.setPlaceholder(t2("modal.searchPlaceholder"));
      }
      onOpen() {
        super.onOpen();
        if (this.initialQuery) {
          this.inputEl.value = this.initialQuery;
          this.inputEl.dispatchEvent(new Event("input"));
        }
      }
      getItems() {
        return this.plugin.index;
      }
      // Path keeps same-named entries distinct in the modal's own fuzzy search.
      getItemText(e) {
        return `${e.name}  ${e.lang}  ${e.path}`;
      }
      onChooseItem(e) {
        this.onChoose(e);
      }
    };
    var PresetPickerModal2 = class extends FuzzySuggestModal {
      constructor(app, items, onChoose, placeholder) {
        super(app);
        this.items = items;
        this.onChoose = onChoose;
        if (placeholder)
          this.setPlaceholder(placeholder);
      }
      getItems() {
        return this.items;
      }
      getItemText(p) {
        return p.label;
      }
      onChooseItem(p) {
        this.onChoose(p);
      }
    };
    module2.exports = { ReferenceLinkModal: ReferenceLinkModal2, PresetPickerModal: PresetPickerModal2 };
  }
});

// src/shared/deeplink/folder-suggest.js
var require_folder_suggest = __commonJS({
  "src/shared/deeplink/folder-suggest.js"(exports2, module2) {
    "use strict";
    var obsidian = require("obsidian");
    var fs2 = require("fs");
    var nodePath2 = require("path");
    var { AbstractInputSuggest } = obsidian;
    var FolderSuggest = class extends AbstractInputSuggest {
      constructor(app, inputEl, getRoot, onSelect, getSeed) {
        super(app, inputEl);
        this.inputEl = inputEl;
        this.getRoot = getRoot;
        this.onSelect = onSelect;
        this.getSeed = getSeed;
      }
      // Immediate subdirectory names of an absolute dir, or [] if it can't be read.
      subdirs(dir) {
        try {
          return fs2.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
        } catch (e) {
          return [];
        }
      }
      getSuggestions(query) {
        const base = this.getRoot ? this.getRoot() : "";
        const q = query.replace(/\\/g, "/");
        const slash = q.lastIndexOf("/");
        const partial = (slash === -1 ? q : q.slice(slash + 1)).toLowerCase();
        const head = slash === -1 ? "" : q.slice(0, slash);
        let scanDir, prefix;
        if (base) {
          scanDir = nodePath2.join(base, head);
          prefix = head;
        } else if (slash === -1) {
          scanDir = this.getSeed ? this.getSeed() : "";
          prefix = scanDir;
        } else {
          scanDir = head.endsWith(":") ? head + "/" : head;
          prefix = head;
        }
        if (!scanDir)
          return [];
        const stem = prefix.replace(/\/+$/, "");
        return this.subdirs(scanDir).filter((name) => name.toLowerCase().includes(partial)).map((name) => stem ? stem + "/" + name : name).sort().slice(0, 50);
      }
      renderSuggestion(path, el) {
        el.setText(path);
      }
      selectSuggestion(path) {
        if (this.onSelect) {
          this.onSelect(path);
          this.setValue("");
          this.close();
          return;
        }
        this.setValue(path);
        this.inputEl.trigger("input");
        this.close();
      }
    };
    var folderSuggestAvailable = () => typeof AbstractInputSuggest === "function";
    module2.exports = { FolderSuggest, folderSuggestAvailable };
  }
});

// src/shared/folder-list.js
var require_folder_list = __commonJS({
  "src/shared/folder-list.js"(exports2, module2) {
    "use strict";
    var { Setting, setIcon } = require("obsidian");
    function renderFolderList(containerEl, opts) {
      const cls = opts.cls;
      const norm = opts.normalize || ((x) => x.trim());
      const read = () => (opts.get() || "").split("\n").map((x) => x.trim()).filter(Boolean);
      new Setting(containerEl).setName(opts.name).setDesc(opts.desc);
      const rowsEl = containerEl.createDiv({ cls: `${cls}-folder-rows` });
      const addEl = containerEl.createDiv({ cls: `${cls}-folder-add` });
      const commit = async (next) => {
        const seen = /* @__PURE__ */ new Set();
        const clean = [];
        for (const p of next) {
          const n = norm(p);
          if (n && !seen.has(n)) {
            seen.add(n);
            clean.push(n);
          }
        }
        await opts.set(clean.join("\n"));
        draw();
      };
      const draw = () => {
        rowsEl.empty();
        read().forEach((path, i) => {
          const row = new Setting(rowsEl).setName(path);
          row.settingEl.addClass(`${cls}-folder-row`);
          row.addExtraButton((b) => b.setIcon("x").setTooltip(opts.removeLabel || "").onClick(() => {
            const next = read();
            next.splice(i, 1);
            commit(next);
          }));
        });
      };
      const input = addEl.createEl("input", { type: "text", cls: `${cls}-folder-input`, attr: { placeholder: opts.placeholder || "" } });
      const addBtn = addEl.createEl("button", { cls: `${cls}-folder-addbtn`, attr: { "aria-label": opts.addLabel || "" } });
      setIcon(addBtn, "plus");
      const add = (raw) => {
        if (norm(raw))
          commit([...read(), raw]);
        input.value = "";
        input.focus();
      };
      if (opts.attachSuggest)
        opts.attachSuggest(input, add);
      addBtn.addEventListener("click", () => add(input.value));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          add(input.value);
        }
      });
      draw();
    }
    module2.exports = { renderFolderList };
  }
});

// src/shared/precedence.js
var require_precedence = __commonJS({
  "src/shared/precedence.js"(exports2, module2) {
    "use strict";
    var { discoverLinkers, outranks, siblingLinkers } = require_discover();
    var STEP = 10;
    function rankedLinkers(app) {
      return discoverLinkers(app).slice().sort((a, b) => {
        if (outranks(a, b))
          return -1;
        if (outranks(b, a))
          return 1;
        return 0;
      });
    }
    function precedenceForIndex(app, self, index) {
      const others = rankedLinkers(app).filter((p) => p.id !== self.id);
      if (!others.length)
        return self.precedence || 0;
      const at = Math.max(0, Math.min(index, others.length));
      const above = at > 0 ? others[at - 1].precedence || 0 : null;
      const below = at < others.length ? others[at].precedence || 0 : null;
      if (above === null)
        return below + STEP;
      if (below === null)
        return above - STEP;
      return (above + below) / 2;
    }
    function currentIndex(app, self) {
      return rankedLinkers(app).findIndex((p) => p.id === self.id);
    }
    function renderPrecedence(containerEl, opts) {
      const { app, provider, Setting, name, desc, save } = opts;
      if (!provider || !siblingLinkers(app, provider).length)
        return;
      new Setting(containerEl).setName(name).setDesc(desc);
      const cls = opts.cls || "linker";
      const list = containerEl.createDiv({ cls: `${cls}-precedence-list` });
      const draw = () => {
        list.empty();
        const ranked = rankedLinkers(app);
        ranked.forEach((p, i) => {
          const mine = p.id === provider.id;
          const row = new Setting(list).setName(`${i + 1}. ${p.displayName || p.id}`);
          if (!mine) {
            row.setDesc(opts.otherDesc || "");
            return;
          }
          row.settingEl.addClass(`${cls}-precedence-self`);
          row.addExtraButton((b) => b.setIcon("arrow-up").setTooltip(opts.upTooltip || "").setDisabled(i === 0).onClick(async () => {
            await save(precedenceForIndex(app, provider, i - 1));
            refresh();
          }));
          row.addExtraButton((b) => b.setIcon("arrow-down").setTooltip(opts.downTooltip || "").setDisabled(i === ranked.length - 1).onClick(async () => {
            await save(precedenceForIndex(app, provider, i + 1));
            refresh();
          }));
        });
      };
      const refresh = () => {
        for (const p of siblingLinkers(app, provider)) {
          if (typeof p.refresh === "function") {
            try {
              p.refresh();
            } catch (e) {
            }
          }
        }
        draw();
      };
      draw();
    }
    module2.exports = { STEP, rankedLinkers, precedenceForIndex, currentIndex, renderPrecedence };
  }
});

// src/settings-tab.js
var require_settings_tab = __commonJS({
  "src/settings-tab.js"(exports2, module2) {
    "use strict";
    var { PluginSettingTab, Setting } = require("obsidian");
    var { PRESETS: PRESETS2 } = require_constants();
    var { FolderSuggest, folderSuggestAvailable } = require_folder_suggest();
    var { renderFolderList } = require_folder_list();
    var { t: t2, plural: plural2 } = require_i18n();
    var { renderPrecedence: precedenceSetting } = require_precedence();
    var normFolder = (p) => p.replace(/\\/g, "/").replace(/\/+$/, "").trim();
    var ReferenceLinkerSettingTab2 = class extends PluginSettingTab {
      constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
      }
      // The dropdown key for the active preset: 'ask' in always-ask mode, else a preset
      // ('u:<i>' for a user viewer). Migration guarantees a template match.
      selectedEditor() {
        if (this.plugin.settings.askOnInsert)
          return "ask";
        const p = this.plugin.editorPresets().find((x) => x.template === this.plugin.settings.uriTemplate);
        return p ? p.key : "file";
      }
      // Chevron toggle shared by the foldable sections.
      foldButton(setting, open, onToggle) {
        setting.addExtraButton((b) => b.setIcon(open ? "chevron-up" : "chevron-down").setTooltip(open ? t2("set.editors.collapse") : t2("set.editors.expand")).onClick(onToggle));
      }
      // Update one viewer's dropdown label as its name is typed, sparing a full re-render.
      refreshPresetOption(dropdown, i, name) {
        if (!dropdown)
          return;
        const opt = Array.from(dropdown.selectEl.options).find((o) => o.value === "u:" + i);
        if (opt)
          opt.text = name || `Viewer ${i + 1}`;
      }
      display() {
        const { containerEl } = this;
        containerEl.empty();
        const s = this.plugin.settings;
        const save = async (rebuild) => {
          await this.plugin.saveSettings();
          if (rebuild)
            await this.plugin.rebuildIndex(false);
        };
        const wide = (c) => {
          c.inputEl.addClass("reference-linker-input");
          return c;
        };
        new Setting(containerEl).setName(t2("set.heading.index")).setHeading();
        new Setting(containerEl).setName(t2("set.codeRoot.name")).setDesc(t2("set.codeRoot.desc")).addText((c) => {
          wide(c).setPlaceholder(this.plugin.codeRoot()).setValue(s.codeRoot).onChange(async (v) => {
            s.codeRoot = v.trim();
            await save(false);
          });
          if (folderSuggestAvailable())
            new FolderSuggest(this.app, c.inputEl, () => "", null, () => this.plugin.codeRoot());
        });
        const folderList = (name, desc, key) => renderFolderList(containerEl, {
          cls: "reference-linker",
          name,
          desc,
          get: () => s[key],
          set: async (v) => {
            s[key] = v;
            await save(false);
          },
          normalize: normFolder,
          attachSuggest: folderSuggestAvailable() ? (inputEl, onPick) => new FolderSuggest(this.app, inputEl, () => this.plugin.codeRoot(), onPick) : null,
          placeholder: t2("set.folderList.add"),
          removeLabel: t2("set.folderList.remove"),
          addLabel: t2("set.folderList.addAria")
        });
        folderList(t2("set.scanFolders.name"), t2("set.scanFolders.desc"), "scanRoots");
        const missing = this.plugin.scanRootStatus().filter((x) => !x.exists).map((x) => x.rel);
        if (missing.length) {
          containerEl.createEl("div", { cls: "reference-linker-note is-error", text: t2("set.scanFolders.notFound", { folders: missing.join(", ") }) });
        }
        new Setting(containerEl).setName(t2("set.extensions.name")).setDesc(t2("set.extensions.desc")).addText((c) => {
          wide(c).setPlaceholder(".pdf .docx .png").setValue(s.extensions).onChange(async (v) => {
            s.extensions = v;
            await save(false);
          });
          c.inputEl.addEventListener("blur", () => this.plugin.rebuildIndex(false));
        });
        folderList(t2("set.skipFolders.name"), t2("set.skipFolders.desc"), "skipDirs");
        new Setting(containerEl).setName(t2("set.autoRefresh.name")).setDesc(t2("set.autoRefresh.desc")).addToggle((c) => c.setValue(s.autoRefresh).onChange(async (v) => {
          s.autoRefresh = v;
          await save(false);
          if (v)
            this.plugin.startWatchers();
          else
            this.plugin.stopWatchers();
        }));
        if (s.autoRefresh && this.plugin.watchUnsupported) {
          const warn = new Setting(containerEl).setDesc(t2("set.autoRefresh.unsupported"));
          warn.settingEl.addClass("mod-warning");
        }
        const root = this.plugin.codeRoot() || t2("set.info.unknownRoot");
        containerEl.createEl("div", { cls: "reference-linker-note", text: t2("set.info", { root, entries: plural2("entry", this.plugin.index.length) }) });
        new Setting(containerEl).setName(t2("set.heading.suggestions")).setHeading();
        new Setting(containerEl).setName(t2("set.trigger.name")).setDesc(t2("set.trigger.desc")).addText((c) => c.setValue(s.trigger).onChange(async (v) => {
          s.trigger = v || "@!";
          await save(false);
        }));
        new Setting(containerEl).setName(t2("set.minChars.name")).setDesc(t2("set.minChars.desc")).addText((c) => {
          c.inputEl.type = "number";
          c.inputEl.min = "0";
          c.setValue(String(s.minChars)).onChange(async (v) => {
            const n = parseInt(v, 10);
            s.minChars = Number.isFinite(n) && n >= 0 ? n : 1;
            await save(false);
          });
        });
        new Setting(containerEl).setName(t2("set.maxResults.name")).setDesc(t2("set.maxResults.desc")).addText((c) => {
          c.inputEl.type = "number";
          c.inputEl.min = "1";
          c.setValue(String(s.maxResults)).onChange(async (v) => {
            const n = parseInt(v, 10);
            s.maxResults = Number.isFinite(n) && n > 0 ? n : 12;
            await save(false);
          });
        });
        let presetDropdown;
        new Setting(containerEl).setName(t2("set.editorPreset.name")).setDesc(t2("set.editorPreset.desc")).addDropdown((d) => {
          presetDropdown = d;
          for (const p of this.plugin.editorPresets())
            d.addOption(p.key, p.label);
          d.addOption("ask", t2("set.preset.ask"));
          d.setValue(this.selectedEditor()).onChange(async (v) => {
            s.askOnInsert = v === "ask";
            if (!s.askOnInsert) {
              const p = this.plugin.editorPresets().find((x) => x.key === v);
              if (p)
                s.uriTemplate = p.template;
            }
            await save(false);
          });
        });
        if (this.showEditors === void 0)
          this.showEditors = false;
        const editors = s.editors || [];
        const editorsHeading = new Setting(containerEl).setName(t2("set.editors.name")).setDesc(t2("set.editors.count", { n: editors.length }));
        this.foldButton(editorsHeading, this.showEditors, () => {
          this.showEditors = !this.showEditors;
          this.display();
        });
        if (this.showEditors) {
          editors.forEach((ed, i) => {
            const row = new Setting(containerEl).addText((c) => {
              c.inputEl.addClass("reference-linker-editor-name");
              c.setPlaceholder(t2("set.editors.namePlaceholder")).setValue(ed.name).onChange(async (v) => {
                ed.name = v;
                this.refreshPresetOption(presetDropdown, i, v);
                await save(false);
              });
            }).addText((c) => {
              c.inputEl.addClass("reference-linker-editor-tpl");
              c.setPlaceholder("sioyek --page {page} {abs}").setValue(ed.template).onChange(async (v) => {
                if (s.uriTemplate === ed.template)
                  s.uriTemplate = v;
                ed.template = v;
                await save(false);
              });
            }).addExtraButton((b) => b.setIcon("trash").setTooltip(t2("set.editors.remove")).onClick(async () => {
              if (s.uriTemplate === ed.template)
                s.uriTemplate = PRESETS2.file;
              editors.splice(i, 1);
              await save(false);
              this.display();
            }));
            row.settingEl.addClass("reference-linker-editor-row");
          });
          new Setting(containerEl).setDesc(t2("set.editors.desc")).addButton((b) => b.setButtonText(t2("set.editors.add")).setCta().onClick(async () => {
            editors.push({ name: "", template: "" });
            s.editors = editors;
            await save(false);
            this.display();
          }));
        }
        new Setting(containerEl).setName(t2("set.contextMenu.name")).setDesc(t2("set.contextMenu.desc")).addToggle((c) => c.setValue(s.contextMenu).onChange(async (v) => {
          s.contextMenu = v;
          await save(false);
        }));
        new Setting(containerEl).setName(t2("set.heading.hover")).setHeading();
        new Setting(containerEl).setName(t2("set.hoverPreview.name")).setDesc(t2("set.hoverPreview.desc")).addToggle((c) => c.setValue(s.hoverPreview).onChange(async (v) => {
          s.hoverPreview = v;
          await save(false);
        }));
        new Setting(containerEl).setName(t2("set.heading.links")).setHeading();
        new Setting(containerEl).setName(t2("set.markStaleLinks.name")).setDesc(t2("set.markStaleLinks.desc")).addToggle((c) => c.setValue(s.markStaleLinks).onChange(async (v) => {
          s.markStaleLinks = v;
          await save(false);
        }));
        new Setting(containerEl).setName(t2("set.heading.maintenance")).setHeading();
        precedenceSetting(containerEl, {
          app: this.app,
          provider: this.plugin.api && this.plugin.api.linker,
          Setting,
          cls: "reference-linker",
          name: t2("set.precedence.name"),
          desc: t2("set.precedence.desc"),
          otherDesc: t2("set.precedence.other"),
          upTooltip: t2("set.precedence.up"),
          downTooltip: t2("set.precedence.down"),
          save: async (value) => {
            s.linkPrecedence = value;
            await save(false);
          }
        });
        new Setting(containerEl).setName(t2("set.rebuild.name")).setDesc(t2("set.rebuild.desc")).addButton((b) => b.setButtonText(t2("set.rebuild.button")).onClick(() => this.plugin.rebuildIndex(true).then(() => this.display())));
      }
    };
    module2.exports = { ReferenceLinkerSettingTab: ReferenceLinkerSettingTab2 };
  }
});

// src/api.js
var require_api = __commonJS({
  "src/api.js"(exports2, module2) {
    "use strict";
    var { LINKER_API } = require_discover();
    var { splitTarget: splitTarget2 } = require_markdown();
    var { bindingOwner: bindingOwner2, ownsBinding: ownsBinding2 } = require_binding();
    var OWNER2 = "reference";
    var pick = (e) => ({ name: e.name, kind: e.kind, ext: e.lang, path: e.path, page: e.page || 1 });
    module2.exports = {
      buildApi() {
        const plugin = this;
        return {
          version: this.manifest.version,
          // The absolute reference root the scan paths resolve against.
          root: () => this.codeRoot(),
          // Every indexed entry: { name, kind, ext, path, page } (kind is 'file' or 'section').
          getEntries: () => this.index.map(pick),
          // One row per indexed file: { name, path, ext, entries }.
          getFiles: () => this.apiFiles(),
          // Totals: { files, entries, byExt, byKind }.
          getStats: () => this.apiStats(),
          // Entries matching a name or path tail (the same lookup the commands use).
          find: (text) => this.lookup(String(text || "")).map(pick),
          // Render helpers: a portable markdown link, or a ready-to-open absolute URI.
          linkFor: (entry) => this.buildLink(entry),
          uriFor: (entry) => this.fillRoot(this.buildUri(entry)),
          // Subscribe to index rebuilds; returns an unsubscribe function.
          onChange: (cb) => this.onIndexChange(cb),
          // The provider contract the sibling linkers read (consumed in shared/discover.js and
          // shared/link-owner.js).
          linker: {
            apiVersion: LINKER_API,
            id: "reference-linker",
            displayName: "Reference Linker",
            kind: "sigil",
            get precedence() {
              return plugin.settings.linkPrecedence;
            },
            claim: (target, title) => {
              const split = splitTarget2(String(target || ""));
              const ttl = title ? String(title) : split.title;
              if (ownsBinding2(ttl, OWNER2))
                return "binding";
              if (bindingOwner2(ttl))
                return null;
              return split.url && plugin.refForTarget(split.url) ? "index" : null;
            },
            // Both selection actions search on click, so the answer doesn't depend on the text —
            // only on whether our context menu is switched on at all.
            offers: (kind) => (kind === "convert" || kind === "open") && !!plugin.settings.contextMenu
          }
        };
      },
      apiFiles() {
        const out = [];
        for (const v of this.fileCache.values()) {
          const f = v.entries[0];
          if (f)
            out.push({ name: f.name, path: f.path, ext: f.lang, entries: v.entries.length });
        }
        out.sort((a, b) => a.path.localeCompare(b.path));
        return out;
      },
      apiStats() {
        const byExt = {}, byKind = {};
        for (const e of this.index) {
          byExt[e.lang] = (byExt[e.lang] || 0) + 1;
          byKind[e.kind] = (byKind[e.kind] || 0) + 1;
        }
        return { files: this.fileCache.size, entries: this.index.length, byExt, byKind };
      }
    };
  }
});

// src/shared/index-events.js
var require_index_events = __commonJS({
  "src/shared/index-events.js"(exports2, module2) {
    "use strict";
    module2.exports = {
      // Returns an unsubscribe function.
      onIndexChange(cb) {
        if (typeof cb !== "function")
          return () => {
          };
        if (!this._indexListeners)
          this._indexListeners = /* @__PURE__ */ new Set();
        this._indexListeners.add(cb);
        return () => this._indexListeners.delete(cb);
      },
      notifyIndexChange() {
        for (const cb of this._indexListeners || []) {
          try {
            cb();
          } catch (e) {
            console.error(`${this.manifest.id}: index listener failed`, e);
          }
        }
      }
    };
  }
});

// src/locales/en.js
var require_en = __commonJS({
  "src/locales/en.js"(exports2, module2) {
    "use strict";
    module2.exports = {
      // Commands
      "cmd.rebuildIndex": "Rebuild reference index",
      "cmd.insertLink": "Insert reference link",
      "cmd.insertLinkAs": "Insert reference link as\u2026",
      "cmd.openFile": "Open referenced document",
      "cmd.copyLink": "Copy reference link",
      "cmd.convertSelection": "Convert selection to reference link",
      "cmd.openSelection": "Find and open document",
      "cmd.insertEmbed": "Insert reference embed",
      "cmd.updateLinksNote": "Update reference links in this note",
      "cmd.updateLinksVault": "Update reference links in the whole vault",
      "cmd.pinLinksNote": "Pin unpinned reference links in this note",
      "cmd.pinLinksVault": "Pin unpinned reference links in the whole vault",
      // Editor context menu
      // Selection actions. `.solo` is the flat wording used when no sibling linker offers the
      // same verb; `.group` labels the shared submenu when one does, and `.item` names our
      // destination inside it. The `.group` wording must match the sibling's word for word —
      // whichever plugin is called first creates the group and its label is the one shown.
      "menu.convert.solo": "Find and convert to reference link",
      "menu.convert.item": "Document",
      "menu.open.solo": "Find and open document",
      "menu.open.item": "Document",
      "menu.copyLink": "Copy reference link",
      "menu.fixLink": "Update this reference link",
      "menu.pin": "Pin to section \u201C{sec}\u201D",
      "menu.unpin": "Unpin this reference link",
      // Notices
      "notice.noCodeRoot": "Reference Linker: could not determine the reference root",
      "notice.noExtensions": "Reference Linker: no file extensions configured",
      "notice.scanFailed": "Reference Linker: scan failed \u2014 {error}",
      "notice.indexed": "Reference Linker: {entries} indexed",
      "notice.missingFolders": "Reference Linker: scan folder not found \u2014 {folders}",
      "notice.copied": "Reference Linker: link copied",
      "notice.noSelection": "Reference Linker: select a name or path first",
      "notice.noMatch": "Reference Linker: no document matches \u201C{query}\u201D",
      "notice.watchUnsupported": "Reference Linker: auto-refresh is unavailable on this platform \u2014 rebuild manually",
      "notice.linksUpdated": "Reference Linker: {n} link(s) updated",
      "notice.linksUpdatedVault": "Reference Linker: {n} link(s) updated across {files} note(s)",
      "modal.update.title": "Update reference links",
      "modal.update.attention": "{n} link(s) need attention: their section is gone (renamed, or the outline changed), so there\u2019s no page to fix.",
      "modal.update.brokenRow": "{label} \u2014 no fix (section renamed or removed)",
      "notice.linksPinned": "Reference Linker: {n} link(s) pinned",
      "notice.linksPinnedVault": "Reference Linker: {n} link(s) pinned across {files} note(s)",
      "notice.pinned": "Reference Linker: link pinned to section \u201C{sec}\u201D",
      "notice.unpinned": "Reference Linker: link unpinned \u2014 it is no longer tracked",
      "notice.cantPin": "Reference Linker: can't pin \u2014 no section begins on that page",
      // Inline embeds
      "embed.empty": "Reference Linker: empty embed \u2014 give a document path",
      "embed.fmt.file": "Document (first page)",
      "embed.fmt.section": "Section page ({page})",
      "embed.unsupported": "Reference Linker: no inline preview for {path}",
      "embed.menu.open": "Open document",
      "embed.notFound": "Reference Linker: no document matches \u201C{query}\u201D",
      "embed.ambiguous": "Reference Linker: {n} documents match \u201C{query}\u201D \u2014 add a path to pick one",
      "embed.unreadable": "Reference Linker: can\u2019t read {path}",
      "embed.truncated": "Reference Linker: showing the first {max} lines",
      // Status bar
      "status.indexing": "Reference Linker: indexing\u2026 {n}",
      // Command-palette modal
      "modal.searchPlaceholder": "Search documents\u2026",
      "modal.formatPlaceholder": "Choose a viewer format for this link\u2026",
      // Settings — headings
      "set.heading.index": "Reference index",
      // Settings — reference index
      "set.codeRoot.name": "Reference root",
      "set.scanFolders.desc": "Folders scanned for documents, relative to the reference root. Leave empty to scan the whole root.",
      "set.scanFolders.notFound": "\u26A0 Not found under the reference root \u2014 {folders}",
      "set.extensions.name": "File extensions",
      "set.extensions.desc": "Which file types to index, space- or comma-separated (e.g. .pdf .docx .png). Empty = nothing is indexed.",
      "set.skipFolders.desc": "A bare name (node_modules) is skipped at any depth; a path with a slash (archive/raw) skips only that folder, relative to the reference root.",
      "set.autoRefresh.desc": "Watch the scan folders and rebuild the index when documents change.",
      "set.info": "Reference root: {root} \xB7 {entries} indexed",
      "set.rebuild.name": "Rebuild reference index",
      "set.rebuild.desc": "Re-scan the document folders now.",
      // Settings — suggestions & links
      "set.trigger.desc": "Type this to start a reference suggestion. Default @! (Code Linker uses @@).",
      "set.editorPreset.name": "Viewer link preset",
      "set.editorPreset.desc": "How inserted links open. file:// uses the OS default app. Add your own under \u201CYour viewers\u201D.",
      "set.editors.name": "Your viewers",
      "set.editors.desc": "Named URL/command templates for the dropdown above. Placeholders: {abs} {path} {page} {name} {root}.",
      "set.editors.add": "+ Add viewer",
      "set.contextMenu.desc": "Add \u201CFind and convert to link\u201D and \u201CFind and open document\u201D to the editor right-click menu \u2014 plus \u201CCopy reference link\u201D when you right-click a reference link.",
      // Settings — hover preview
      "set.hoverPreview.name": "Preview on hover",
      "set.hoverPreview.desc": "Preview the referenced document when you hover a link. In live preview, hold Ctrl/Cmd; in reading view a plain hover is enough.",
      // Settings — links
      "set.markStaleLinks.desc": "Underline a reference link when its document moved (warning colour, fixable with \u201CUpdate reference links\u201D) or is gone from disk (error colour). A link you edited by hand is left alone: the page you typed and the text you wrote are yours."
    };
  }
});

// src/locales/ru.js
var require_ru = __commonJS({
  "src/locales/ru.js"(exports2, module2) {
    "use strict";
    module2.exports = {
      // Commands
      "cmd.rebuildIndex": "\u041F\u0435\u0440\u0435\u0441\u0442\u0440\u043E\u0438\u0442\u044C \u0438\u043D\u0434\u0435\u043A\u0441 \u0441\u0441\u044B\u043B\u043E\u043A",
      "cmd.insertLink": "\u0412\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442",
      "cmd.insertLinkAs": "\u0412\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u043A\u0430\u043A\u2026",
      "cmd.openFile": "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442",
      "cmd.copyLink": "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442",
      "cmd.convertSelection": "\u041F\u0440\u0435\u0432\u0440\u0430\u0442\u0438\u0442\u044C \u0432\u044B\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u0432 \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442",
      "cmd.openSelection": "\u041D\u0430\u0439\u0442\u0438 \u0438 \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442",
      "cmd.insertEmbed": "\u0412\u0441\u0442\u0430\u0432\u0438\u0442\u044C embed \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430",
      "cmd.updateLinksNote": "\u0410\u043A\u0442\u0443\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u0441\u044B\u043B\u043A\u0438 \u0432 \u044D\u0442\u043E\u0439 \u0437\u0430\u043C\u0435\u0442\u043A\u0435",
      "cmd.updateLinksVault": "\u0410\u043A\u0442\u0443\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u0441\u044B\u043B\u043A\u0438 \u0432\u043E \u0432\u0441\u0451\u043C \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435",
      "cmd.pinLinksNote": "\u0417\u0430\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u043D\u0435\u0437\u0430\u043A\u0440\u0435\u043F\u043B\u0451\u043D\u043D\u044B\u0435 \u0441\u0441\u044B\u043B\u043A\u0438 \u0432 \u044D\u0442\u043E\u0439 \u0437\u0430\u043C\u0435\u0442\u043A\u0435",
      "cmd.pinLinksVault": "\u0417\u0430\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u043D\u0435\u0437\u0430\u043A\u0440\u0435\u043F\u043B\u0451\u043D\u043D\u044B\u0435 \u0441\u0441\u044B\u043B\u043A\u0438 \u0432\u043E \u0432\u0441\u0451\u043C \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435",
      // Editor context menu
      "menu.convert.solo": "\u041D\u0430\u0439\u0442\u0438 \u0438 \u043F\u0440\u0435\u0432\u0440\u0430\u0442\u0438\u0442\u044C \u0432 \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442",
      "menu.convert.item": "\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442",
      "menu.open.solo": "\u041D\u0430\u0439\u0442\u0438 \u0438 \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442",
      "menu.open.item": "\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442",
      "menu.copyLink": "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442",
      "menu.fixLink": "\u0410\u043A\u0442\u0443\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u044D\u0442\u0443 \u0441\u0441\u044B\u043B\u043A\u0443",
      "menu.pin": "\u0417\u0430\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u0437\u0430 \u0440\u0430\u0437\u0434\u0435\u043B\u043E\u043C \xAB{sec}\xBB",
      "menu.unpin": "\u041E\u0442\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u044D\u0442\u0443 \u0441\u0441\u044B\u043B\u043A\u0443",
      // Notices
      "notice.noCodeRoot": "Reference Linker: \u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0438\u0442\u044C \u043A\u043E\u0440\u0435\u043D\u044C \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432",
      "notice.noExtensions": "Reference Linker: \u043D\u0435 \u0437\u0430\u0434\u0430\u043D\u043E \u043D\u0438 \u043E\u0434\u043D\u043E\u0433\u043E \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u044F",
      "notice.scanFailed": "Reference Linker: \u0441\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u2014 {error}",
      "notice.indexed": "Reference Linker: \u043F\u0440\u043E\u0438\u043D\u0434\u0435\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D\u043E {entries}",
      "notice.missingFolders": "Reference Linker: \u043F\u0430\u043F\u043A\u0430 \u0441\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430 \u2014 {folders}",
      "notice.copied": "Reference Linker: \u0441\u0441\u044B\u043B\u043A\u0430 \u0441\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u0430",
      "notice.noSelection": "Reference Linker: \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u0432\u044B\u0434\u0435\u043B\u0438\u0442\u0435 \u0438\u043C\u044F \u0438\u043B\u0438 \u043F\u0443\u0442\u044C",
      "notice.noMatch": "Reference Linker: \u043D\u0435\u0442 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430 \u0434\u043B\u044F \xAB{query}\xBB",
      "notice.watchUnsupported": "Reference Linker: \u0430\u0432\u0442\u043E\u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u043D\u0430 \u044D\u0442\u043E\u0439 \u043F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0435 \u2014 \u043F\u0435\u0440\u0435\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u0439\u0442\u0435 \u0432\u0440\u0443\u0447\u043D\u0443\u044E",
      "notice.linksUpdated": "Reference Linker: \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u043E \u0441\u0441\u044B\u043B\u043E\u043A \u2014 {n}",
      "notice.linksUpdatedVault": "Reference Linker: \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u043E \u0441\u0441\u044B\u043B\u043E\u043A \u2014 {n} \u0432 \u0437\u0430\u043C\u0435\u0442\u043A\u0430\u0445: {files}",
      "modal.update.title": "\u0410\u043A\u0442\u0443\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u0441\u044B\u043B\u043A\u0438 \u043D\u0430 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B",
      "modal.update.attention": "\u0422\u0440\u0435\u0431\u0443\u044E\u0442 \u0432\u043D\u0438\u043C\u0430\u043D\u0438\u044F \u2014 {n}: \u0438\u0445 \u0440\u0430\u0437\u0434\u0435\u043B \u043F\u0440\u043E\u043F\u0430\u043B (\u043F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u043D, \u0438\u043B\u0438 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u043E\u0441\u044C \u043E\u0433\u043B\u0430\u0432\u043B\u0435\u043D\u0438\u0435), \u043F\u043E\u044D\u0442\u043E\u043C\u0443 \u0447\u0438\u043D\u0438\u0442\u044C \u043D\u0435\u0447\u0435\u0433\u043E.",
      "modal.update.brokenRow": "{label} \u2014 \u043D\u0435 \u043F\u043E\u0447\u0438\u043D\u0438\u0442\u044C (\u0440\u0430\u0437\u0434\u0435\u043B \u043F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u043D \u0438\u043B\u0438 \u0443\u0434\u0430\u043B\u0451\u043D)",
      "notice.linksPinned": "Reference Linker: \u0437\u0430\u043A\u0440\u0435\u043F\u043B\u0435\u043D\u043E \u0441\u0441\u044B\u043B\u043E\u043A \u2014 {n}",
      "notice.linksPinnedVault": "Reference Linker: \u0437\u0430\u043A\u0440\u0435\u043F\u043B\u0435\u043D\u043E \u0441\u0441\u044B\u043B\u043E\u043A \u2014 {n} \u0432 \u0437\u0430\u043C\u0435\u0442\u043A\u0430\u0445: {files}",
      "notice.pinned": "Reference Linker: \u0441\u0441\u044B\u043B\u043A\u0430 \u0437\u0430\u043A\u0440\u0435\u043F\u043B\u0435\u043D\u0430 \u0437\u0430 \u0440\u0430\u0437\u0434\u0435\u043B\u043E\u043C \xAB{sec}\xBB",
      "notice.unpinned": "Reference Linker: \u0441\u0441\u044B\u043B\u043A\u0430 \u043E\u0442\u043A\u0440\u0435\u043F\u043B\u0435\u043D\u0430 \u2014 \u0431\u043E\u043B\u044C\u0448\u0435 \u043D\u0435 \u043E\u0442\u0441\u043B\u0435\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F",
      "notice.cantPin": "Reference Linker: \u043D\u0435 \u0437\u0430 \u0447\u0442\u043E \u0437\u0430\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u2014 \u043D\u0430 \u044D\u0442\u043E\u0439 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435 \u043D\u0435 \u043D\u0430\u0447\u0438\u043D\u0430\u0435\u0442\u0441\u044F \u0440\u0430\u0437\u0434\u0435\u043B",
      // Inline embeds
      "embed.empty": "Reference Linker: \u043F\u0443\u0441\u0442\u043E\u0439 embed \u2014 \u0443\u043A\u0430\u0436\u0438\u0442\u0435 \u043F\u0443\u0442\u044C \u043A \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0443",
      "embed.fmt.file": "\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442 (\u043F\u0435\u0440\u0432\u0430\u044F \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0430)",
      "embed.fmt.section": "\u0421\u0442\u0440\u0430\u043D\u0438\u0446\u0430 \u0440\u0430\u0437\u0434\u0435\u043B\u0430 ({page})",
      "embed.unsupported": "Reference Linker: \u043D\u0435\u0442 \u0438\u043D\u043B\u0430\u0439\u043D-\u043F\u0440\u0435\u0432\u044C\u044E \u0434\u043B\u044F {path}",
      "embed.menu.open": "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442",
      "embed.notFound": "Reference Linker: \u043D\u0435\u0442 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430 \u0434\u043B\u044F \xAB{query}\xBB",
      "embed.ambiguous": "Reference Linker: \u043F\u043E\u0434 \xAB{query}\xBB \u043F\u043E\u0434\u0445\u043E\u0434\u0438\u0442 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432: {n} \u2014 \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u0435 \u043F\u0443\u0442\u0451\u043C",
      "embed.unreadable": "Reference Linker: \u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C {path}",
      "embed.truncated": "Reference Linker: \u043F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u043F\u0435\u0440\u0432\u044B\u0435 {max} \u0441\u0442\u0440\u043E\u043A",
      // Status bar
      "status.indexing": "Reference Linker: \u0438\u043D\u0434\u0435\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435\u2026 {n}",
      // Command-palette modal
      "modal.searchPlaceholder": "\u041F\u043E\u0438\u0441\u043A \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432\u2026",
      "modal.formatPlaceholder": "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0444\u043E\u0440\u043C\u0430\u0442 \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0449\u0438\u043A\u0430 \u0434\u043B\u044F \u044D\u0442\u043E\u0439 \u0441\u0441\u044B\u043B\u043A\u0438\u2026",
      // Settings — headings
      "set.heading.index": "\u0418\u043D\u0434\u0435\u043A\u0441 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432",
      // Settings — reference index
      "set.codeRoot.name": "\u041A\u043E\u0440\u0435\u043D\u044C \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432",
      "set.scanFolders.desc": "\u041F\u0430\u043F\u043A\u0438, \u0441\u043A\u0430\u043D\u0438\u0440\u0443\u0435\u043C\u044B\u0435 \u043D\u0430 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B, \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u043A\u043E\u0440\u043D\u044F. \u041E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u0443\u0441\u0442\u044B\u043C, \u0447\u0442\u043E\u0431\u044B \u0441\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0432\u0435\u0441\u044C \u043A\u043E\u0440\u0435\u043D\u044C.",
      "set.scanFolders.notFound": "\u26A0 \u041D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E \u0432 \u043A\u043E\u0440\u043D\u0435 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432 \u2014 {folders}",
      "set.extensions.name": "\u0420\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u044F \u0444\u0430\u0439\u043B\u043E\u0432",
      "set.extensions.desc": "\u041A\u0430\u043A\u0438\u0435 \u0442\u0438\u043F\u044B \u0444\u0430\u0439\u043B\u043E\u0432 \u0438\u043D\u0434\u0435\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C, \u0447\u0435\u0440\u0435\u0437 \u043F\u0440\u043E\u0431\u0435\u043B \u0438\u043B\u0438 \u0437\u0430\u043F\u044F\u0442\u0443\u044E (\u043D\u0430\u043F\u0440. .pdf .docx .png). \u041F\u0443\u0441\u0442\u043E = \u043D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u0438\u043D\u0434\u0435\u043A\u0441\u0438\u0440\u0443\u0435\u0442\u0441\u044F.",
      "set.skipFolders.desc": "\u041F\u0440\u043E\u0441\u0442\u043E \u0438\u043C\u044F (node_modules) \u043F\u0440\u043E\u043F\u0443\u0441\u043A\u0430\u0435\u0442\u0441\u044F \u043D\u0430 \u043B\u044E\u0431\u043E\u0439 \u0433\u043B\u0443\u0431\u0438\u043D\u0435; \u043F\u0443\u0442\u044C \u0441\u043E \u0441\u043B\u044D\u0448\u0435\u043C (archive/raw) \u043F\u0440\u043E\u043F\u0443\u0441\u043A\u0430\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u044D\u0442\u0443 \u043F\u0430\u043F\u043A\u0443 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u043A\u043E\u0440\u043D\u044F.",
      "set.autoRefresh.desc": "\u0421\u043B\u0435\u0434\u0438\u0442\u044C \u0437\u0430 \u043F\u0430\u043F\u043A\u0430\u043C\u0438 \u0441\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F \u0438 \u043F\u0435\u0440\u0435\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u0442\u044C \u0438\u043D\u0434\u0435\u043A\u0441 \u043F\u0440\u0438 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0438 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432.",
      "set.info": "\u041A\u043E\u0440\u0435\u043D\u044C \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432: {root} \xB7 \u043F\u0440\u043E\u0438\u043D\u0434\u0435\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D\u043E {entries}",
      "set.rebuild.name": "\u041F\u0435\u0440\u0435\u0441\u0442\u0440\u043E\u0438\u0442\u044C \u0438\u043D\u0434\u0435\u043A\u0441 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432",
      "set.rebuild.desc": "\u041F\u0435\u0440\u0435\u0441\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u0430\u043F\u043A\u0438 \u0441 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430\u043C\u0438 \u0441\u0435\u0439\u0447\u0430\u0441.",
      // Settings — suggestions & links
      "set.trigger.desc": "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u044D\u0442\u043E, \u0447\u0442\u043E\u0431\u044B \u043D\u0430\u0447\u0430\u0442\u044C \u043F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0443. \u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E @! (Code Linker \u0437\u0430\u043D\u0438\u043C\u0430\u0435\u0442 @@).",
      "set.editorPreset.name": "\u041F\u0440\u0435\u0441\u0435\u0442 \u043E\u0442\u043A\u0440\u044B\u0442\u0438\u044F",
      "set.editorPreset.desc": "\u041A\u0430\u043A \u043E\u0442\u043A\u0440\u044B\u0432\u0430\u044E\u0442\u0441\u044F \u0432\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043D\u044B\u0435 \u0441\u0441\u044B\u043B\u043A\u0438. file:// \u2014 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u041E\u0421 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E. \u0421\u0432\u043E\u0438 \u2014 \u0432 \xAB\u0412\u0430\u0448\u0438 \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0449\u0438\u043A\u0438\xBB.",
      "set.editors.name": "\u0412\u0430\u0448\u0438 \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0449\u0438\u043A\u0438",
      "set.editors.desc": "\u0418\u043C\u0435\u043D\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u0448\u0430\u0431\u043B\u043E\u043D\u044B URL/\u043A\u043E\u043C\u0430\u043D\u0434 \u0434\u043B\u044F \u0441\u043F\u0438\u0441\u043A\u0430 \u0432\u044B\u0448\u0435. \u041F\u043B\u0435\u0439\u0441\u0445\u043E\u043B\u0434\u0435\u0440\u044B: {abs} {path} {page} {name} {root}.",
      "set.editors.add": "+ \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0449\u0438\u043A",
      "set.contextMenu.desc": "\u0414\u043E\u0431\u0430\u0432\u043B\u044F\u0442\u044C \xAB\u041D\u0430\u0439\u0442\u0438 \u0438 \u043F\u0440\u0435\u0432\u0440\u0430\u0442\u0438\u0442\u044C \u0432 \u0441\u0441\u044B\u043B\u043A\u0443\xBB \u0438 \xAB\u041D\u0430\u0439\u0442\u0438 \u0438 \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\xBB \u0432 \u043C\u0435\u043D\u044E \u043F\u043E \u043F\u0440\u0430\u0432\u043E\u043C\u0443 \u043A\u043B\u0438\u043A\u0443 \u2014 \u043F\u043B\u044E\u0441 \xAB\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\xBB \u043F\u0440\u0438 \u043A\u043B\u0438\u043A\u0435 \u043F\u043E \u0441\u0441\u044B\u043B\u043A\u0435.",
      // Settings — hover preview
      "set.hoverPreview.name": "\u041F\u0440\u0435\u0432\u044C\u044E \u043F\u0440\u0438 \u043D\u0430\u0432\u0435\u0434\u0435\u043D\u0438\u0438",
      "set.hoverPreview.desc": "\u041F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0442\u044C \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u043F\u0440\u0438 \u043D\u0430\u0432\u0435\u0434\u0435\u043D\u0438\u0438 \u043D\u0430 \u0441\u0441\u044B\u043B\u043A\u0443. \u0412 \u0440\u0435\u0436\u0438\u043C\u0435 live preview \u0443\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0439\u0442\u0435 Ctrl/Cmd; \u0432 \u0440\u0435\u0436\u0438\u043C\u0435 \u0447\u0442\u0435\u043D\u0438\u044F \u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u043E\u0441\u0442\u043E\u0433\u043E \u043D\u0430\u0432\u0435\u0434\u0435\u043D\u0438\u044F.",
      // Settings — links
      "set.markStaleLinks.desc": "\u041F\u043E\u0434\u0447\u0451\u0440\u043A\u0438\u0432\u0430\u0442\u044C \u0441\u0441\u044B\u043B\u043A\u0443, \u0435\u0441\u043B\u0438 \u0435\u0451 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u043F\u0435\u0440\u0435\u0435\u0445\u0430\u043B (\u0446\u0432\u0435\u0442 \u043F\u0440\u0435\u0434\u0443\u043F\u0440\u0435\u0436\u0434\u0435\u043D\u0438\u044F, \u0447\u0438\u043D\u0438\u0442\u0441\u044F \u043A\u043E\u043C\u0430\u043D\u0434\u043E\u0439 \xAB\u0410\u043A\u0442\u0443\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u0441\u044B\u043B\u043A\u0438\xBB) \u0438\u043B\u0438 \u043F\u0440\u043E\u043F\u0430\u043B \u0441 \u0434\u0438\u0441\u043A\u0430 (\u0446\u0432\u0435\u0442 \u043E\u0448\u0438\u0431\u043A\u0438). \u0421\u0441\u044B\u043B\u043A\u0443, \u043F\u043E\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043D\u0443\u044E \u0440\u0443\u043A\u0430\u043C\u0438, \u043F\u043B\u0430\u0433\u0438\u043D \u043D\u0435 \u0442\u0440\u043E\u0433\u0430\u0435\u0442: \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0430 \u0438 \u0442\u0435\u043A\u0441\u0442 \u2014 \u0442\u0432\u043E\u0438."
    };
  }
});

// src/main.js
var { Plugin, Notice, normalizePath, MarkdownView } = require("obsidian");
var { EditorView } = require("@codemirror/view");
var { Prec } = require("@codemirror/state");
var fs = require("fs");
var fsp = fs.promises;
var nodePath = require("path");
var { PRESETS, DEFAULT_SETTINGS, parseExtensions, parseSkip, underSkip } = require_constants();
var { splitLines, inTableCell, inCode, inLink, linkRegex, splitTarget, withTitle } = require_markdown();
var { parseBinding, formatBinding, bindStateFrom, bindingOwner, ownsBinding } = require_binding();
var { fillRoot: fillRootToken, ownsRootToken, namespaceRoot } = require_root_token();
var { sharedSection } = require_menu();
var { peersOffering } = require_discover();
var { ownsLink } = require_link_owner();
var { ReferenceSuggest } = require_suggest2();
var filter = require_filter();
var { HoverPreview } = require_hover();
var { registerEmbed } = require_embed();
var actualize = require_actualize2();
var { ReferenceLinkModal, PresetPickerModal } = require_modal();
var { ReferenceLinkerSettingTab } = require_settings_tab();
var { readOutline } = require_pdf();
var { initI18n, withFamily, t, plural } = require_i18n();
var api = require_api();
var indexEvents = require_index_events();
function openExternal(uri) {
  try {
    require("electron").shell.openExternal(uri);
  } catch (e) {
    window.open(uri);
  }
}
var PAGE_LINK = /^file:\/\/\/.+#page=\d+/i;
var ROOT_ATTR = "data-reference-root";
var OWNER = "reference";
var SIBLING_ID = "code-linker";
var TITLE_ATTR = "data-reference-title";
var anchorTitle = (a) => a.getAttribute(TITLE_ATTR) || a.getAttribute("title") || "";
var pathPart = (dec) => dec.split("#")[0].split("?")[0];
var normCase = (s) => process.platform === "win32" ? s.toLowerCase() : s;
function namesPath(p, full) {
  const a = normCase(p), b = normCase(full);
  if (!b || !a.endsWith(b))
    return false;
  const i = a.length - b.length;
  return i === 0 || a[i - 1] === "/";
}
var previewEntry = (plugin, ref, title, url) => {
  const b = parseBinding(title);
  if (b && b.sec)
    return Object.assign({}, ref.entry, { page: ref.page, title: b.sec });
  const sec = plugin.sectionAtLinkPage(url);
  return Object.assign({}, ref.entry, { page: ref.page, title: sec ? sec.name : "" });
};
var ReferenceLinkerPlugin = class extends Plugin {
  async onload() {
    initI18n(withFamily("sigil", { en: require_en(), ru: require_ru() }));
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.setIndex([]);
    this.watchers = [];
    this.fileCache = /* @__PURE__ */ new Map();
    this.cacheSignature = "";
    this._indexListeners = /* @__PURE__ */ new Set();
    this.migrateSettings();
    await this.loadCache();
    this.hover = new HoverPreview(this);
    this.registerEditorSuggest(new ReferenceSuggest(this.app, this));
    this.registerMarkdownPostProcessor((el) => this.resolveRootLinks(el));
    this.registerEditorExtension(
      Prec.highest(
        EditorView.domEventHandlers({
          mousedown: (evt, view) => this.onEditorLink(evt, view, false),
          click: (evt, view) => this.onEditorLink(evt, view, true),
          auxclick: (evt, view) => this.onEditorLink(evt, view, true)
        })
      )
    );
    registerEmbed(this);
    this.registerEditorExtension(actualize.staleLinksExtension(this));
    this.register(this.onIndexChange(() => this.refreshStale()));
    this.lastX = 0;
    this.lastY = 0;
    this.registerDomEvent(document, "mousemove", (evt) => this.onHoverMove(evt));
    this.registerDomEvent(document, "keydown", (evt) => {
      if (evt.key === "Control" || evt.key === "Meta")
        this.onHoverKey();
    });
    this.registerDomEvent(document, "scroll", (evt) => {
      if (!this.hover.contains(evt.target))
        this.hover.hide();
    }, { capture: true });
    this.registerDomEvent(window, "blur", () => this.hover.hide());
    this.registerDomEvent(document, "keyup", (evt) => {
      if (evt.key === "Escape")
        this.hover.hide();
    });
    this.registerDomEvent(document, "click", (evt) => this.onAnchorClick(evt), { capture: true });
    this.registerDomEvent(document, "auxclick", (evt) => this.onAnchorClick(evt), { capture: true });
    this.addSettingTab(new ReferenceLinkerSettingTab(this.app, this));
    this.statusEl = this.addStatusBarItem();
    this.addCommand({ id: "rebuild-reference-index", name: t("cmd.rebuildIndex"), callback: () => this.rebuildIndex(true) });
    this.addCommand({ id: "insert-reference-link", name: t("cmd.insertLink"), editorCallback: (editor) => this.pickEntry((e) => this.withFormat(this.settings.askOnInsert, (tpl) => this.insertLink(editor, e, tpl))) });
    this.addCommand({ id: "insert-reference-link-as", name: t("cmd.insertLinkAs"), editorCallback: (editor) => this.pickEntry((e) => this.withFormat(true, (tpl) => this.insertLink(editor, e, tpl))) });
    this.addCommand({ id: "open-reference-file", name: t("cmd.openFile"), callback: () => this.pickEntry((e) => this.withFormat(this.settings.askOnInsert, (tpl) => this.openEntry(e, tpl))) });
    this.addCommand({ id: "copy-reference-link", name: t("cmd.copyLink"), callback: () => this.pickEntry((e) => this.withFormat(this.settings.askOnInsert, (tpl) => this.copyLink(e, tpl))) });
    this.addCommand({ id: "convert-selection-to-link", name: t("cmd.convertSelection"), editorCallback: (editor) => this.convertSelection(editor) });
    this.addCommand({ id: "open-selected-reference", name: t("cmd.openSelection"), editorCallback: (editor) => this.openSelection(editor) });
    this.addCommand({ id: "insert-reference-embed", name: t("cmd.insertEmbed"), editorCallback: (editor) => this.pickEntry((e) => this.insertEmbed(editor, e)) });
    this.addCommand({ id: "update-links-note", name: t("cmd.updateLinksNote"), callback: () => this.updateLinksInActiveNote() });
    this.addCommand({ id: "update-links-vault", name: t("cmd.updateLinksVault"), callback: () => this.updateLinksInVault() });
    this.addCommand({ id: "pin-links-note", name: t("cmd.pinLinksNote"), callback: () => this.pinLinksInActiveNote() });
    this.addCommand({ id: "pin-links-vault", name: t("cmd.pinLinksVault"), callback: () => this.pinLinksInVault() });
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        if (!this.settings.contextMenu)
          return;
        if (this.selectionTarget(editor, true)) {
          this.selectionItem(menu, "convert", "link", () => this.convertSelection(editor));
        }
        if (this.selectionTarget(editor, false)) {
          this.selectionItem(menu, "open", "file-search", () => this.openSelection(editor));
        }
        const link = this.linkAtCursor(editor);
        if (link && this.ownsLinkAtCursor(link)) {
          menu.addItem((item) => item.setTitle(t("menu.copyLink")).setIcon("copy").onClick(() => this.copyLinkAtCursor(link)));
          if (this.isLinkStale(withTitle(link.target, link.title))) {
            menu.addItem((item) => item.setTitle(t("menu.fixLink")).setIcon("wrench").onClick(() => this.fixLinkAtCursor(editor, link)));
          }
          const bound = !!parseBinding(link.title);
          const pin = bound ? null : this.linkPinOption(link);
          if (bound) {
            menu.addItem((item) => item.setTitle(t("menu.unpin")).setIcon("pin-off").onClick(() => this.unpinLinkAtCursor(editor, link)));
          } else if (pin) {
            menu.addItem((item) => item.setTitle(t("menu.pin", { sec: pin.value })).setIcon("pin").onClick(() => this.pinLinkAtCursor(editor, link)));
          }
        }
      })
    );
    this.app.workspace.onLayoutReady(() => this.rebuildIndex(false));
    this.api = this.buildApi();
  }
  onunload() {
    this.stopWatchers();
    clearTimeout(this.watchTimer);
    if (this.hover)
      this.hover.destroy();
  }
  migrateSettings() {
    this.settings.skipDirs = (this.settings.skipDirs || "").split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).join("\n");
    this.settings.uriTemplate = namespaceRoot(this.settings.uriTemplate, OWNER);
    for (const e of this.settings.editors || [])
      e.template = namespaceRoot(e.template, OWNER);
    const tpl = this.settings.uriTemplate;
    const editors = this.settings.editors || (this.settings.editors = []);
    const known = Object.values(PRESETS).includes(tpl) || editors.some((e) => e.template === tpl);
    if (!known)
      editors.push({ name: "Custom", template: tpl });
  }
  // Our own {ref-root} is always ours to fill. A bare {root} predates the namespacing and
  // Code Linker used to fill it too, so it takes a verdict — see legacyRootIsOurs. The
  // default claims it, which is what every call about our own links wants; only the render
  // path, where another plugin's links go past, asks first.
  fillRoot(v, claimLegacy = true) {
    const root = encodeURI(this.codeRoot().split(nodePath.sep).join("/"));
    return fillRootToken(v, { owner: OWNER, root, claimLegacy });
  }
  siblingLinkerInstalled() {
    const plugins = this.app.plugins && this.app.plugins.plugins;
    return !!(plugins && plugins[SIBLING_ID]);
  }
  // Whether a bare {root} in a rendered link is ours to resolve. The binding settles it
  // when there is one. Failing that, being the only linker installed makes every legacy
  // link ours, which keeps a solo vault behaving exactly as it always did. Otherwise the
  // link has to point at something inside our root to count as ours.
  legacyRootIsOurs(url, title) {
    const owner = bindingOwner(title);
    if (owner)
      return owner === OWNER;
    if (!this.siblingLinkerInstalled())
      return true;
    return !!this.targetIndexedFile(this.decodeTarget(url));
  }
  resolveRootLinks(el) {
    const links = el.querySelectorAll ? el.querySelectorAll("a") : [];
    for (const a of links) {
      const title = a.getAttribute("title") || "";
      let ours = false;
      for (const attr of ["href", "data-href"]) {
        const v = a.getAttribute(attr);
        if (!v)
          continue;
        const out = this.fillRoot(v, this.legacyRootIsOurs(v, title));
        if (out !== v) {
          a.setAttribute(attr, out);
          ours = true;
        }
      }
      if (ours)
        a.setAttribute(ROOT_ATTR, "");
      this.stashTitle(a);
    }
    this.markStaleAnchors(el);
  }
  // Park a binding title on a data attribute and drop the real one, so the binding string
  // doesn't show as a native tooltip. A plain tooltip the reader wrote is left as-is, and
  // so is Code Linker's binding: taking its title away left it unable to read its own
  // pin and marking its links wrongly.
  stashTitle(a) {
    const title = a.getAttribute("title");
    if (!title || a.hasAttribute(TITLE_ATTR) || !ownsBinding(title, OWNER))
      return;
    a.setAttribute(TITLE_ATTR, title);
    a.removeAttribute("title");
  }
  // Toggle the drifted/broken-link underline on every rendered anchor in `el`. toggle (not
  // add) so re-running after an index rebuild also clears links that are now current.
  markStaleAnchors(el) {
    const links = el.querySelectorAll ? el.querySelectorAll("a") : [];
    for (const a of links) {
      const href = a.getAttribute("href") || a.getAttribute("data-href") || "";
      const state = this.settings.markStaleLinks ? this.linkState(withTitle(href, anchorTitle(a))) : null;
      a.classList.toggle("reference-linker-stale", state === "stale");
      a.classList.toggle("reference-linker-broken", state === "broken");
    }
  }
  // After an index rebuild, refresh stale marks in both render modes: the CM6 effect for
  // Live Preview, and a re-scan of rendered anchors for Reading view (its post-processor
  // doesn't re-run on its own).
  refreshStale() {
    actualize.refreshStaleLinks(this.app);
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (view && view.getViewType && view.getViewType() === "markdown" && view.containerEl) {
        this.markStaleAnchors(view.containerEl);
      }
    });
  }
  hoverEnabled() {
    return this.settings.hoverPreview;
  }
  // Pointer tracking that mirrors a real page preview. Rendered (Reading view) links
  // preview on plain hover; the editor (Live Preview) needs the modifier — same split
  // as native page preview. Idle in the editor (nothing shown, no modifier, not over a
  // rendered link) does no work beyond storing the position. While a preview is up it
  // follows the pointer so it stays until you leave the link (entering it keeps it).
  onHoverMove(evt) {
    this.lastX = evt.clientX;
    this.lastY = evt.clientY;
    if (!this.hoverEnabled())
      return;
    if (evt.buttons)
      return;
    const el = evt.target;
    if (this.hover.contains(el)) {
      this.hover.cancelHide();
      return;
    }
    const mod = evt.ctrlKey || evt.metaKey;
    const overAnchor = !!(el && el.closest && el.closest("a"));
    if (!this.hover.isVisible() && !this.hover.pendingKey && !mod && !overAnchor)
      return;
    const hit = this.entryAtPoint(el, evt.clientX, evt.clientY);
    if (hit && (!hit.requireMod || mod)) {
      this.hover.cancelHide();
      this.hover.schedule(hit.entry, evt.clientX, evt.clientY);
    } else if (this.hover.isVisible() || this.hover.pendingKey) {
      this.hover.leave();
    }
  }
  // Pressing the modifier while already hovering a link shows it — the other order
  // (modifier first, then move onto the link) is handled by onHoverMove.
  onHoverKey() {
    if (!this.hoverEnabled())
      return;
    const el = document.elementFromPoint(this.lastX, this.lastY);
    if (this.hover.contains(el))
      return;
    const hit = this.entryAtPoint(el, this.lastX, this.lastY);
    if (hit)
      this.hover.schedule(hit.entry, this.lastX, this.lastY);
  }
  // The document under a screen point as { entry, requireMod }, across both render
  // modes, or null. Reading view carries the URL on a rendered anchor and previews on
  // plain hover; Live Preview's CM6 link span has no href (recovered from the editor at
  // those coordinates) and requires the modifier, like a link in the editor natively.
  entryAtPoint(el, x, y) {
    if (!el || !el.closest)
      return null;
    const a = el.closest("a");
    if (a && !(a.classList && a.classList.contains("internal-link"))) {
      const href = a.getAttribute("href") || a.getAttribute("data-href") || "";
      const ref = this.refForTarget(href);
      if (ref)
        return { entry: previewEntry(this, ref, anchorTitle(a), href), requireMod: false };
    }
    if (el.closest(".cm-link")) {
      const view = typeof EditorView.findFromDOM === "function" ? EditorView.findFromDOM(el) : this.activeCm();
      const at = view && this.codeRefAt(view, x, y);
      const ref = at && this.refForTarget(at.target);
      if (ref)
        return { entry: previewEntry(this, ref, at.title, at.target), requireMod: true };
    }
    return null;
  }
  // The CM6 EditorView of the active Markdown editor, used as a fallback when
  // EditorView.findFromDOM isn't available to map a point to its editor.
  activeCm() {
    const mv = this.app.workspace.getActiveViewOfType(MarkdownView);
    return mv && mv.editor && mv.editor.cm;
  }
  // {root} filled in, %-escapes undone, backslashes normalised — the form links are matched on.
  decodeTarget(target) {
    let dec = this.fillRoot(target);
    try {
      dec = decodeURIComponent(dec);
    } catch (e) {
    }
    return dec.split("\\").join("/");
  }
  // The page a link asks for — only ever read, never overridden. A #page fragment or a
  // {page} query both count.
  targetPage(dec) {
    const m = /[#?&]page=(\d+)/i.exec(dec);
    return m ? parseInt(m[1], 10) : 1;
  }
  // The document a link points at, from its target alone: { entry, page }, or null for a
  // link into no indexed document. The label is never consulted.
  refForTarget(target) {
    if (!target)
      return null;
    const dec = this.decodeTarget(target);
    const cached = this.fileCache.get(this.targetIndexedFile(dec));
    const entry = cached && cached.entries[0];
    return entry ? { entry, page: this.targetPage(dec) } : null;
  }
  entriesIn(rel) {
    return rel ? (this.fileCache.get(rel) || { entries: [] }).entries : [];
  }
  // What a section binding says about the page a link stores: null when the section still
  // sits there, stale with the page it moved to, or broken when the document is indexed but
  // no such section resolves any more (renamed, or the outline changed).
  //
  // Broken is reserved for a document the index *has*, never for one it doesn't know — a
  // reference root pointed at the wrong folder, or a document not scanned yet, would
  // otherwise turn every link red at once. An unknown document gets no verdict rather than
  // a guess. Code Linker already worked this way; this is the two brought into line.
  urlBindState(url, b, storedPage) {
    if (!b.sec)
      return null;
    const rel = this.targetIndexedFile(this.decodeTarget(url));
    if (!rel)
      return null;
    const pages = this.entriesIn(rel).filter((e) => e.kind === "section" && e.name === b.sec).map((e) => e.page);
    return bindStateFrom(pages, storedPage);
  }
  // The outline section beginning on a link's page — what it can be pinned to. Null when the
  // page is mid-section or the document has no outline.
  sectionAtLinkPage(url) {
    const rel = url && this.targetIndexedFile(this.decodeTarget(url));
    if (!rel)
      return null;
    const page = this.targetPage(url);
    return this.entriesIn(rel).find((e) => e.kind === "section" && e.page === page) || null;
  }
  // The title pinning would produce and the section it pins to, or null when there's nothing
  // to pin or it would change nothing.
  linkPinOption(link) {
    const sec = this.sectionAtLinkPage(link.target);
    if (!sec)
      return null;
    const title = formatBinding({ sec: sec.name });
    return title === (link.title || "") ? null : { title, value: sec.name };
  }
  // CM6 link handler for Live Preview. Suppresses Obsidian's open of the literal
  // {root} URL; opens the resolved one on click/auxclick. Returns true when handled.
  onEditorLink(evt, view, open) {
    if (evt.button !== 0 && evt.button !== 1)
      return false;
    const uri = this.rootUriAt(evt, view);
    if (!uri)
      return false;
    evt.preventDefault();
    evt.stopPropagation();
    if (open)
      openExternal(uri);
    return true;
  }
  // Reading view renders our links as real <a>; Obsidian's opener corrupts a #page=
  // fragment, so we intercept and open through the shell — for a link resolveRootLinks
  // marked ours, and any file:// link with a page. Everything else is left to Obsidian.
  //
  // This runs in the capture phase, ahead of every other handler, so it has to be sure the
  // link is ours before swallowing the click: claiming a Code Linker link here sent it to
  // the OS viewer instead of the editor.
  onAnchorClick(evt) {
    if (evt.button !== 0 && evt.button !== 1)
      return;
    const a = evt.target && evt.target.closest && evt.target.closest("a");
    if (!a)
      return;
    const href = a.getAttribute("href") || a.getAttribute("data-href") || "";
    const filled = this.fillRoot(href, this.legacyRootIsOurs(href, anchorTitle(a)));
    if (!a.hasAttribute(ROOT_ATTR) && !PAGE_LINK.test(filled))
      return;
    evt.preventDefault();
    evt.stopPropagation();
    openExternal(filled);
  }
  // The markdown link at screen coords in Live Preview, as { name, target }. The
  // rendered span has no href, so map the coords to a document position and read it.
  codeRefAt(view, x, y) {
    if (typeof view.posAtCoords !== "function")
      return null;
    const offset = view.posAtCoords({ x, y });
    if (offset == null)
      return null;
    const line = view.state.doc.lineAt(offset);
    const ch = offset - line.from;
    const re = linkRegex();
    let m;
    while (m = re.exec(line.text)) {
      if (ch < m.index || ch > m.index + m[0].length)
        continue;
      const { url, title } = splitTarget(m[2]);
      return { name: m[1], target: url, title };
    }
    return null;
  }
  // The link under the click resolved, if the token it carries is ours — else null, so a
  // plain link falls through to Obsidian's own opener and the other linker's link falls
  // through to that plugin. Both register a highest-precedence handler, so each has to
  // claim only its own; otherwise the winner comes down to which plugin loaded first.
  // codeRefAt has already split the title off the target.
  rootUriAt(evt, view) {
    const el = evt.target;
    if (!el || !el.closest || !el.closest(".cm-link"))
      return null;
    const ref = this.codeRefAt(view, evt.clientX, evt.clientY);
    if (!ref)
      return null;
    const claimLegacy = this.legacyRootIsOurs(ref.target, ref.title);
    return ownsRootToken(ref.target, OWNER, claimLegacy) ? this.fillRoot(ref.target, claimLegacy) : null;
  }
  // Absolute base folder the scan paths are resolved against.
  codeRoot() {
    if (this.settings.codeRoot)
      return this.settings.codeRoot;
    const adapter = this.app.vault.adapter;
    const base = adapter && typeof adapter.getBasePath === "function" ? adapter.getBasePath() : "";
    return base ? nodePath.dirname(base) : "";
  }
  cacheFilePath() {
    return normalizePath(`${this.manifest.dir}/index-cache.json`);
  }
  // A fingerprint of what the scan would produce: the indexed extensions plus a format
  // version (bumped when indexing logic changes, e.g. PDF sections were added). When it
  // changes, the per-file cache is stale even if mtimes haven't moved, so we drop it.
  indexSignature() {
    return JSON.stringify({ v: 2, exts: [...parseExtensions(this.settings.extensions)].sort() });
  }
  async loadCache() {
    try {
      const p = this.cacheFilePath();
      if (!await this.app.vault.adapter.exists(p))
        return;
      const data = JSON.parse(await this.app.vault.adapter.read(p));
      if (!data || data.version !== 1 || !data.files)
        return;
      this.cacheSignature = data.signature || "";
      this.fileCache = new Map(Object.entries(data.files));
      this.setIndex(this.flattenCache());
    } catch (e) {
    }
  }
  async saveCache() {
    try {
      const files = {};
      for (const [rel, v] of this.fileCache.entries())
        files[rel] = v;
      const data = { version: 1, signature: this.cacheSignature, files };
      await this.app.vault.adapter.write(this.cacheFilePath(), JSON.stringify(data));
    } catch (e) {
    }
  }
  flattenCache() {
    const out = [];
    for (const v of this.fileCache.values())
      for (const e of v.entries)
        out.push(e);
    out.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
    return out;
  }
  // Set the index and its name lookup together. byName groups entries by lowercased
  // name so resolving a link/symbol scans only the same-named entries, not the whole
  // index (the hot paths — hover, stale marks, embeds — call this per event).
  setIndex(entries) {
    this.index = entries;
    this.byName = /* @__PURE__ */ new Map();
    this.kinds = /* @__PURE__ */ new Set();
    this.exts = /* @__PURE__ */ new Set();
    for (const e of entries) {
      const k = e.name.toLowerCase();
      const a = this.byName.get(k);
      if (a)
        a.push(e);
      else
        this.byName.set(k, [e]);
      this.kinds.add(e.kind);
      this.exts.add(e.lang);
    }
  }
  // Index entries whose (lowercased) name equals `name` — the candidate set a bare
  // symbol resolves against.
  entriesByName(name) {
    return this.byName.get(String(name).toLowerCase()) || [];
  }
  // An inline prefix filters by extension ("pdf:") or kind ("sec:", a shorthand for
  // "section"); the rest is the name to match.
  parseQuery(raw) {
    const kinds = this.kinds && this.kinds.has("section") ? /* @__PURE__ */ new Set([...this.kinds, "sec"]) : this.kinds;
    const f = filter.parseQuery(raw, kinds, this.exts);
    if (f.kind === "sec")
      f.kind = "section";
    return f;
  }
  entryPassesFilter(e, f) {
    return (!f.kind || e.kind === f.kind) && (!f.ext || e.lang === f.ext);
  }
  // The indexed document a link target names, or null: the entry whose root-joined path the
  // target ends with. Works whatever scheme the link was built with.
  targetIndexedFile(dec) {
    const p = pathPart(dec);
    const root = this.codeRoot().split(nodePath.sep).join("/").replace(/\/+$/, "");
    for (const rel of this.fileCache.keys()) {
      if (namesPath(p, root ? root + "/" + rel : rel))
        return rel;
    }
    return null;
  }
  // The set of indexed extensions (".pdf" etc.), used for the scan and watch filtering.
  watchedExts() {
    return parseExtensions(this.settings.extensions);
  }
  startWatchers() {
    this.stopWatchers();
    this.watchUnsupported = false;
    if (!this.settings.autoRefresh)
      return;
    const root = this.codeRoot();
    if (!root)
      return;
    for (const r of this.scanFolders()) {
      const dir = nodePath.join(root, r);
      if (!fs.existsSync(dir))
        continue;
      try {
        const w = fs.watch(dir, { recursive: true }, (_evt, filename) => this.onWatchEvent(r, filename));
        this.watchers.push(w);
      } catch (e) {
        if (e && e.code === "ERR_FEATURE_UNAVAILABLE_ON_PLATFORM")
          this.watchUnsupported = true;
      }
    }
    if (this.watchUnsupported && !this.watchUnsupportedNotified) {
      this.watchUnsupportedNotified = true;
      new Notice(t("notice.watchUnsupported"));
    }
  }
  stopWatchers() {
    for (const w of this.watchers) {
      try {
        w.close();
      } catch (e) {
      }
    }
    this.watchers = [];
  }
  // Debounce a background rebuild on file changes. Skip-dir noise (node_modules)
  // and files we don't index are dropped cheaply before scheduling. `r` is the scan
  // root the event came from, so the path can be resolved relative to the reference root.
  onWatchEvent(r, filename) {
    if (filename) {
      const base = (r || "").split("\\").join("/").replace(/\/+$/, "");
      const rel = (base ? base + "/" : "") + String(filename).split("\\").join("/");
      if (underSkip(rel, parseSkip(this.settings.skipDirs)))
        return;
      const ext = nodePath.extname(rel).toLowerCase();
      if (ext && !this.watchedExts().has(ext))
        return;
    }
    clearTimeout(this.watchTimer);
    this.watchTimer = setTimeout(() => this.rebuildIndex(false), 1500);
  }
  // Empty the index (nothing to scan) and persist, telling whoever's listening.
  async resetIndex(noticeKey, notify) {
    this.setIndex([]);
    this.fileCache = /* @__PURE__ */ new Map();
    await this.saveCache();
    this.notifyIndexChange();
    if (notify)
      new Notice(t(noticeKey));
  }
  async rebuildIndex(notify) {
    this.stopWatchers();
    const root = this.codeRoot();
    if (!root) {
      if (notify)
        new Notice(t("notice.noCodeRoot"));
      return;
    }
    const roots = this.scanFolders();
    const exts = this.watchedExts();
    if (!exts.size) {
      await this.resetIndex("notice.noExtensions", notify);
      return;
    }
    const signature = this.indexSignature();
    const old = signature === this.cacheSignature ? this.fileCache : /* @__PURE__ */ new Map();
    let seen = 0;
    const onFile = () => {
      if (++seen % 200 === 0)
        this.statusEl.setText(t("status.indexing", { n: seen }));
    };
    const scan = { root, exts, skip: parseSkip(this.settings.skipDirs), old, next: /* @__PURE__ */ new Map(), onFile };
    try {
      for (const r of roots) {
        await this.walk(nodePath.join(root, r), scan);
      }
    } catch (err) {
      this.statusEl.setText("");
      if (notify)
        new Notice(t("notice.scanFailed", { error: err && err.message }));
      return;
    }
    this.statusEl.setText("");
    this.fileCache = scan.next;
    this.cacheSignature = signature;
    this.setIndex(this.flattenCache());
    await this.saveCache();
    this.notifyIndexChange();
    this.startWatchers();
    if (notify) {
      const missing = this.scanRootStatus().filter((st) => !st.exists).map((st) => st.rel);
      if (missing.length)
        new Notice(t("notice.missingFolders", { folders: missing.join(", ") }));
      else
        new Notice(t("notice.indexed", { entries: plural("entry", this.index.length) }));
    }
  }
  async walk(absDir, scan) {
    let items;
    try {
      items = await fsp.readdir(absDir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const it of items) {
      const abs = nodePath.join(absDir, it.name);
      if (it.isDirectory()) {
        const rel = nodePath.relative(scan.root, abs).split(nodePath.sep).join("/");
        if (!underSkip(rel, scan.skip))
          await this.walk(abs, scan);
      } else if (it.isFile()) {
        if (scan.exts.has(nodePath.extname(it.name).toLowerCase()))
          await this.indexFile(abs, scan);
      }
    }
  }
  async indexFile(abs, scan) {
    const rel = nodePath.relative(scan.root, abs).split(nodePath.sep).join("/");
    let stat;
    try {
      stat = await fsp.stat(abs);
    } catch (e) {
      return;
    }
    if (scan.onFile)
      scan.onFile();
    const cached = scan.old.get(rel);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      scan.next.set(rel, cached);
      return;
    }
    const base = nodePath.basename(abs).replace(/\.[^.]+$/, "");
    const ext = nodePath.extname(abs).slice(1).toLowerCase();
    const entries = [{ name: base, kind: "file", lang: ext, path: rel, line: 1, page: 1 }];
    if (ext === "pdf") {
      for (const s of await readOutline(abs)) {
        entries.push({ name: s.title, kind: "section", lang: "pdf", path: rel, line: s.page, page: s.page });
      }
    }
    scan.next.set(rel, { mtimeMs: stat.mtimeMs, entries });
  }
  // An entry's absolute path on disk: the reference root joined with its stored relative path.
  entryPath(e) {
    const root = this.codeRoot();
    return root ? nodePath.join(root, e.path) : e.path;
  }
  // {root} stays in the link for portability (resolved on render/click); call fillRoot()
  // when opening the URI directly. `template` overrides the default preset.
  buildUri(e, template) {
    const tpl = template || this.settings.uriTemplate;
    const absFwd = this.entryPath(e).split(nodePath.sep).join("/");
    const page = String(e.page || 1);
    const encPath = (p) => p.split("/").map(encodeURIComponent).join("/");
    let uri = tpl.replace(/{abs}/g, encodeURI(absFwd)).replace(/{path}/g, encPath(e.path)).replace(/{page}/g, page).replace(/{name}/g, encodeURIComponent(e.name));
    if (e.kind === "section" && e.page && /^file:/i.test(uri) && !/#page=/i.test(uri)) {
      uri += "#page=" + e.page;
    }
    return uri;
  }
  // The markdown link to insert. A section link is pinned to its section by a title binding
  // (see shared/binding), so it tracks without the label being read. A pipe would split a
  // table row.
  buildLink(e, inTable, template) {
    const url = this.buildUri(e, template);
    const link = `[${e.name}](${e.kind === "section" ? withTitle(url, formatBinding({ sec: e.name })) : url})`;
    return inTable ? link.replace(/\|/g, "\\|") : link;
  }
  pickEntry(onChoose, query) {
    new ReferenceLinkModal(this.app, this, { onChoose, query }).open();
  }
  insertLink(editor, e, template) {
    const inTable = inTableCell(editor.getValue(), editor.posToOffset(editor.getCursor("from")));
    editor.replaceSelection(this.buildLink(e, inTable, template));
  }
  // The ```reference-link block body offered for an entry: a section embeds its page,
  // and any document embeds by its relative path (page 1).
  embedFormats(e) {
    const out = [];
    if (e.kind === "section" && e.page)
      out.push({ label: t("embed.fmt.section", { page: e.page }), body: e.path + "#page=" + e.page });
    out.push({ label: t("embed.fmt.file"), body: e.path });
    return out;
  }
  insertEmbed(editor, e) {
    const formats = this.embedFormats(e);
    new PresetPickerModal(this.app, formats, (f) => {
      editor.replaceSelection("```reference-link\n" + f.body + "\n```\n");
    }, t("modal.embedPlaceholder")).open();
  }
  // The selectable viewer presets — the built-in file:// then the user's own. 'u:<i>' is a
  // user viewer's key in the settings dropdown.
  editorPresets() {
    const out = [{ key: "file", label: t("set.preset.file"), template: PRESETS.file }];
    (this.settings.editors || []).forEach((e, i) => out.push({ key: "u:" + i, label: e.name || `Viewer ${i + 1}`, template: e.template }));
    return out;
  }
  // Ask-on-insert picks the viewer format per insert; otherwise the default preset is used.
  withFormat(ask, run) {
    if (ask)
      new PresetPickerModal(this.app, this.editorPresets(), (p) => run(p.template), t("modal.formatPlaceholder")).open();
    else
      run(void 0);
  }
  // Resolve {root} to the absolute reference root: a copied link is usually pasted outside
  // the vault (a browser, a terminal), where the portable {root} token wouldn't resolve.
  // Inserted links keep {root} for note portability.
  copyLink(e, template) {
    navigator.clipboard.writeText(this.fillRoot(this.buildLink(e, false, template)));
    new Notice(t("notice.copied"));
  }
  // fillRoot resolves the portable {root} token, since there's no note to render it.
  openEntry(e, template) {
    openExternal(this.fillRoot(this.buildUri(e, template)));
  }
  // Entries matched by name, or by path tail so a selected "Foo/Bar.cs" resolves too.
  lookup(text) {
    const q = text.trim();
    if (!q)
      return [];
    const lc = q.toLowerCase();
    const norm = lc.split("\\").join("/");
    const out = [];
    for (const e of this.index) {
      const p = e.path.toLowerCase();
      if (e.name.toLowerCase() === lc || p === norm || p.endsWith("/" + norm))
        out.push(e);
    }
    return out;
  }
  selectionOrWord(editor) {
    const sel = editor.getSelection();
    if (sel)
      return { text: sel, from: editor.getCursor("from"), to: editor.getCursor("to") };
    const cur = editor.getCursor();
    const line = editor.getLine(cur.line);
    const isWord = (ch) => ch && /[\w./\\-]/.test(ch);
    let s = cur.ch, en = cur.ch;
    while (s > 0 && isWord(line[s - 1]))
      s--;
    while (en < line.length && isWord(line[en]))
      en++;
    const text = line.slice(s, en);
    return text ? { text, from: { line: cur.line, ch: s }, to: { line: cur.line, ch: en } } : null;
  }
  // The selection/word to act on, or null when it makes no sense there. Never inside an
  // existing link (both actions). For `write` (convert-to-link) also never inside code or
  // frontmatter, where inserting a link would corrupt the sample; opening code from there
  // is harmless, so read-only actions are allowed.
  selectionTarget(editor, write) {
    const target = this.selectionOrWord(editor);
    if (!target)
      return null;
    const text = editor.getValue();
    const off = editor.posToOffset(target.from);
    if (inLink(text, off))
      return null;
    if (write && inCode(text, off))
      return null;
    return target;
  }
  // The markdown link spanning the editor cursor, as { name, target, line, from, to }
  // (character offsets within the line), or null. Right-click puts the cursor on the
  // click, so this reads the link that was clicked.
  linkAtCursor(editor) {
    const cur = editor.getCursor();
    const line = editor.getLine(cur.line);
    const re = linkRegex();
    let m;
    while (m = re.exec(line)) {
      if (cur.ch >= m.index && cur.ch <= m.index + m[0].length) {
        const { url, title } = splitTarget(m[2]);
        return { name: m[1], target: url, title, line: cur.line, from: m.index, to: m.index + m[0].length };
      }
    }
    return null;
  }
  fixLinkAtCursor(editor, link) {
    const fixed = this.actualizedTarget(withTitle(link.target, link.title));
    if (fixed == null) {
      new Notice(t("notice.linksUpdated", { n: 0 }));
      return;
    }
    editor.replaceRange("[" + link.name + "](" + fixed + ")", { line: link.line, ch: link.from }, { line: link.line, ch: link.to });
    new Notice(t("notice.linksUpdated", { n: 1 }));
  }
  pinLinkAtCursor(editor, link) {
    const opt = this.linkPinOption(link);
    if (!opt) {
      new Notice(t("notice.cantPin"));
      return;
    }
    const pinned = withTitle(link.target, opt.title);
    editor.replaceRange("[" + link.name + "](" + pinned + ")", { line: link.line, ch: link.from }, { line: link.line, ch: link.to });
    new Notice(t("notice.pinned", { sec: opt.value }));
  }
  unpinLinkAtCursor(editor, link) {
    if (!parseBinding(link.title))
      return;
    editor.replaceRange("[" + link.name + "](" + link.target + ")", { line: link.line, ch: link.from }, { line: link.line, ch: link.to });
    new Notice(t("notice.unpinned"));
  }
  // One of the two selection verbs, nested under the verb itself when the code linker will
  // offer the same one. Whether to nest has to be settled before anything is written: an item
  // already in Obsidian's menu can't be pulled back out and reparented, so we ask the sibling
  // first rather than discovering the clash afterwards.
  selectionItem(menu, kind, icon, run) {
    const provider = this.api && this.api.linker;
    const shared = !!provider && peersOffering(this.app, provider, kind).length > 0;
    const where = shared ? sharedSection(menu, "linker:" + kind, t("menu." + kind + ".group"), icon) : menu;
    where.addItem((item) => item.setTitle(t(shared ? "menu." + kind + ".item" : "menu." + kind + ".solo")).setIcon(icon).onClick(run));
  }
  // Whether the link under the cursor is ours to act on. Recognising it isn't enough: the
  // code linker recognises a file both indexes cover just as readily, and two Copy and two
  // Unpin items on one link tell the reader nothing about which is which.
  ownsLinkAtCursor(link) {
    if (!this.isReferenceLink(link.name, link.target, link.title))
      return false;
    const provider = this.api && this.api.linker;
    if (!provider)
      return true;
    return ownsLink(this.app, provider, link.target, link.title);
  }
  // One of ours — a link into an indexed document — so the copy/pin/fix items show only on
  // our links.
  isReferenceLink(name, target, title) {
    return !!this.refForTarget(target) || !!this.linkState(withTitle(target, title));
  }
  // Copy the clicked link's own target ({root} filled in), keeping the scheme it was
  // saved with — unlike copyLink, which builds a fresh link from the default preset.
  copyLinkAtCursor(link) {
    navigator.clipboard.writeText(this.fillRoot(link.target));
    new Notice(t("notice.copied"));
  }
  // Run the selected (or under-cursor) token through the index: a single match runs
  // `action`, several open the picker, none notifies. `write` gates the protected-range
  // check (convert may not run in code; open may).
  resolveSelection(editor, action, write) {
    const target = this.selectionTarget(editor, write);
    if (!target) {
      new Notice(t("notice.noSelection"));
      return;
    }
    const matches = this.lookup(target.text);
    if (!matches.length) {
      new Notice(t("notice.noMatch", { query: target.text }));
      return;
    }
    const run = (e) => action(e, target);
    if (matches.length === 1)
      run(matches[0]);
    else
      this.pickEntry(run, target.text);
  }
  convertSelection(editor) {
    this.resolveSelection(editor, (e, target) => this.withFormat(this.settings.askOnInsert, (template) => {
      const inTable = inTableCell(editor.getValue(), editor.posToOffset(target.from));
      editor.replaceRange(this.buildLink(e, inTable, template), target.from, target.to);
    }), true);
  }
  openSelection(editor) {
    this.resolveSelection(editor, (e) => this.withFormat(this.settings.askOnInsert, (template) => this.openEntry(e, template)), false);
  }
  // Folders to scan, relative to the reference root; empty means the whole reference root.
  scanFolders() {
    const roots = splitLines(this.settings.scanRoots);
    return roots.length ? roots : ["."];
  }
  scanRootStatus() {
    const root = this.codeRoot();
    return this.scanFolders().map((rel) => ({
      rel,
      exists: !!root && fs.existsSync(nodePath.join(root, rel))
    }));
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
Object.assign(ReferenceLinkerPlugin.prototype, api, indexEvents);
Object.assign(ReferenceLinkerPlugin.prototype, actualize.methods);
module.exports = ReferenceLinkerPlugin;
