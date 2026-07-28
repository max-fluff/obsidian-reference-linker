/* Reference Linker 1.1.0 — bundled from src/ by esbuild. Do not edit directly; edit src/ and run "npm run build". */
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
    function wordAt(line, ch) {
      const s = String(line == null ? "" : line);
      if (!s)
        return "";
      const isWord = (c) => /[\p{L}\p{Nd}]/u.test(c || "");
      const at = Math.max(0, Math.min(ch, s.length));
      if (!isWord(s[at]) && !isWord(s[at - 1]))
        return "";
      let start = at;
      while (start > 0 && isWord(s[start - 1]))
        start--;
      let end = at;
      while (end < s.length && isWord(s[end]))
        end++;
      return s.slice(start, end);
    }
    module2.exports = { splitLines: splitLines2, linkRegex: linkRegex2, splitTarget: splitTarget2, withTitle: withTitle2, rewriteLinks, rewriteFences, isFenceLine, inInlineCode, locate, inCode: inCode2, inLink: inLink2, isProtected, inTableCell: inTableCell2, wordAt };
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
    var BIB_EXTS = [".bib", ".json"];
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
      bibFiles: "",
      // bibliographies: a file or a folder of them, one path per line
      editors: [],
      // user-defined viewer presets, each { name, template }
      askOnInsert: true,
      // ask which viewer format to use on every insert (vs. the default)
      autoRefresh: true,
      // watch scan folders and rebuild the index when files change
      hoverPreview: true,
      // show the preview popover when hovering a reference link
      // How a document preview is shaped. 'column' keeps the page's width and side margins and lets
      // the height follow the content, which suits a section; 'page' draws the whole sheet the
      // document declares, top and bottom margins included. Either way the size comes from the file.
      documentView: "column",
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
    module2.exports = { PRESETS: PRESETS2, DEFAULT_SETTINGS: DEFAULT_SETTINGS2, BIB_EXTS, parseExtensions: parseExtensions2, parseSkip: parseSkip2, underSkip: underSkip2 };
  }
});

// src/shared/binding.js
var require_binding = __commonJS({
  "src/shared/binding.js"(exports2, module2) {
    "use strict";
    var ANCHORS = { sym: "sym", kind: "kind", sec: "sec", cite: "cite", line: "hash" };
    var TOKEN = /^(sym|kind|sec|cite|line):(.+)$/;
    var OWNERS = { code: ["sym", "kind", "hash"], reference: ["sec", "cite"] };
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
      const b = { sym: "", kind: "", sec: "", cite: "", hash: "" };
      for (const word of s.split(/\s+/)) {
        const m = TOKEN.exec(word);
        if (!m)
          return null;
        b[ANCHORS[m[1]]] = decodeValue(m[2]);
      }
      return b.sym || b.kind || b.sec || b.cite || b.hash ? b : null;
    }
    function formatBinding2(b) {
      const parts = [];
      if (b.sym)
        parts.push("sym:" + encodeValue(b.sym));
      if (b.kind)
        parts.push("kind:" + encodeValue(b.kind));
      if (b.cite)
        parts.push("cite:" + encodeValue(b.cite));
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
    function sharedSection(menu, key, label, icon) {
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
    module2.exports = { menuSection, sharedSection, supportsSubmenu };
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
    function drawsHere(peer, where) {
      if (typeof peer.drawsIn !== "function")
        return true;
      const w = where || {};
      try {
        return peer.drawsIn(w.path, w.surface) !== false;
      } catch (e) {
        return true;
      }
    }
    function foreignRanges(app, self, text, where) {
      const ranges = [];
      for (const peer of discoverLinkers(app)) {
        if (peer.id === self.id || !outranks(peer, self))
          continue;
        if (typeof peer.matches !== "function" || !drawsHere(peer, where))
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
    function ownedMatches(app, self, text, matches, where) {
      if (!matches.length)
        return matches;
      const foreign = foreignRanges(app, self, text, where);
      if (!foreign.length)
        return matches;
      return matches.filter((m) => !overlaps(foreign, m.start, m.end));
    }
    function yieldedCandidates(app, self, text, where) {
      const out = [];
      for (const peer of discoverLinkers(app)) {
        if (peer.id === self.id || outranks(peer, self))
          continue;
        if (typeof peer.matches !== "function" || !drawsHere(peer, where))
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
            // How this row reads in an ambiguity list, asked of its owner and only when a list is
            // actually drawn — every span on screen produces candidates, few are ever looked at.
            describe: (display) => {
              if (typeof peer.describe !== "function")
                return null;
              try {
                return peer.describe(m.target, display);
              } catch (e) {
                return null;
              }
            },
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
    function peerSuggestions(app, self, query, sourcePath) {
      const out = [];
      for (const peer of discoverLinkers(app)) {
        if (peer.id === self.id || typeof peer.suggest !== "function")
          continue;
        let items;
        try {
          items = peer.suggest(String(query || ""), sourcePath) || [];
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
            // Answered by the row's owner, including whether to compose a link at all. A peer
            // that predates `insertFor` has only `linkFor`, which always links — the right
            // reading for a plugin with no plain-text mode to consult.
            insert: (display, inTable) => {
              if (typeof peer.insertFor === "function")
                return peer.insertFor(it.target, display, inTable);
              return typeof peer.linkFor === "function" ? peer.linkFor(it.target, display, inTable) : null;
            }
          });
        }
      }
      return out;
    }
    function peersOffering(app, self, kind, text) {
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
    module2.exports = { LINKER_API, discoverLinkers, outranks, drawsHere, foreignRanges, overlaps, ownedMatches, yieldedCandidates, candidatesFor, peerSuggestions, peersOffering, siblingLinkers };
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
      "set.suggestPlainText.name": "Insert plain text",
      "set.suggestPlainText.desc": "Suggestions complete the word without turning it into a link.",
      "set.heading.contextMenu": "Context menu",
      // The shared submenu the exclusion items collect into, and their wording inside it, where
      // the parent already names the word.
      "exclude.group": "Exclude \u201C{value}\u201D",
      "exclude.addShort": "Add to {noun}",
      "exclude.removeShort": "Remove from {noun}",
      "label.selection": "Selection",
      "modal.leftAsText": "(left as text)",
      "modal.skipOption": "skip",
      "modal.materialize.summary": "Reviewing {files} file(s), {replacements} replacement(s).",
      "modal.unlink.summary": "Reviewing {files} file(s), {links} link(s).",
      "modal.choose.body": "This word has more than one match.",
      "notice.noActiveNote": "No active note.",
      "notice.noSelection": "Nothing selected.",
      "notice.scopeSkipped": " Skipped {n} note(s) changed since the preview.",
      "set.editingHighlight.live": "Live",
      "set.editingHighlight.name": "Highlight in the editor",
      "set.lang.invalid": "Invalid: {error}",
      "set.languages.desc": "{enabled} of {total} enabled",
      "set.matchMode.name": "Match mode",
      "set.matchMode.exact": "Exact (case-insensitive)",
      "set.matchMode.endingStrip": "Light ending strip",
      "set.matchMode.stemmer": "Stemmer (best across forms)",
      "kind.heading": "Heading",
      "kind.term": "Term",
      "kind.viaAlias": "via alias \u201C{form}\u201D",
      "set.smartCase.name": "Smart case for acronyms",
      "set.smartCase.desc": "Match mostly-uppercase terms (like \u201CIT\u201D or \u201CNASA\u201D) case-sensitively, so they don\u2019t link ordinary words.",
      "set.scopeMode.name": "Where to link",
      "set.scopeMode.vault": "The whole vault",
      "set.scopeMode.folders": "Only chosen folders",
      "set.suggestMinChars.name": "Minimum typed length",
      "set.statusBarIncludeLinks.name": "Count existing links too",
      "set.folderList.add": "Add path\u2026",
      "set.folderList.addAria": "Add",
      "plural.alias": { one: "{n} alias", other: "{n} aliases" }
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
      "set.suggestPlainText.name": "\u0412\u0441\u0442\u0430\u0432\u043B\u044F\u0442\u044C \u043F\u0440\u043E\u0441\u0442\u043E\u0439 \u0442\u0435\u043A\u0441\u0442",
      "set.suggestPlainText.desc": "\u041F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0430 \u0434\u043E\u043F\u0438\u0441\u044B\u0432\u0430\u0435\u0442 \u0441\u043B\u043E\u0432\u043E, \u043D\u0435 \u043F\u0440\u0435\u0432\u0440\u0430\u0449\u0430\u044F \u0435\u0433\u043E \u0432 \u0441\u0441\u044B\u043B\u043A\u0443.",
      "set.heading.contextMenu": "\u041A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u043D\u043E\u0435 \u043C\u0435\u043D\u044E",
      "exclude.group": "\u0418\u0441\u043A\u043B\u044E\u0447\u0438\u0442\u044C \xAB{value}\xBB",
      "exclude.addShort": "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0432 {noun}",
      "exclude.removeShort": "\u0423\u0431\u0440\u0430\u0442\u044C \u0438\u0437 {noun}",
      "label.selection": "\u0412\u044B\u0434\u0435\u043B\u0435\u043D\u0438\u0435",
      "modal.leftAsText": "(\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E \u0442\u0435\u043A\u0441\u0442\u043E\u043C)",
      "modal.skipOption": "\u043F\u0440\u043E\u043F\u0443\u0441\u0442\u0438\u0442\u044C",
      "modal.materialize.summary": "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430: \u0444\u0430\u0439\u043B\u043E\u0432 \u2014 {files}, \u0437\u0430\u043C\u0435\u043D \u2014 {replacements}.",
      "modal.unlink.summary": "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430: \u0444\u0430\u0439\u043B\u043E\u0432 \u2014 {files}, \u0441\u0441\u044B\u043B\u043E\u043A \u2014 {links}.",
      "modal.choose.body": "\u0423 \u044D\u0442\u043E\u0433\u043E \u0441\u043B\u043E\u0432\u0430 \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u0439.",
      "notice.noActiveNote": "\u041D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0439 \u0437\u0430\u043C\u0435\u0442\u043A\u0438.",
      "notice.noSelection": "\u041D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u0432\u044B\u0434\u0435\u043B\u0435\u043D\u043E.",
      "notice.scopeSkipped": " \u041F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E \u0437\u0430\u043C\u0435\u0442\u043E\u043A, \u0438\u0437\u043C\u0435\u043D\u0451\u043D\u043D\u044B\u0445 \u043F\u043E\u0441\u043B\u0435 \u043F\u0440\u0435\u0432\u044C\u044E: {n}.",
      "set.editingHighlight.live": "\u041D\u0430 \u043B\u0435\u0442\u0443",
      "set.editingHighlight.name": "\u041F\u043E\u0434\u0441\u0432\u0435\u0442\u043A\u0430 \u0432 \u0440\u0435\u0434\u0430\u043A\u0442\u043E\u0440\u0435",
      "set.lang.invalid": "\u041E\u0448\u0438\u0431\u043A\u0430: {error}",
      "set.languages.desc": "\u0412\u043A\u043B\u044E\u0447\u0435\u043D\u043E {enabled} \u0438\u0437 {total}",
      "set.matchMode.name": "\u0420\u0435\u0436\u0438\u043C \u0441\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u044F",
      "set.matchMode.exact": "\u0422\u043E\u0447\u043D\u043E\u0435 (\u0431\u0435\u0437 \u0443\u0447\u0451\u0442\u0430 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430)",
      "set.matchMode.endingStrip": "\u041B\u0451\u0433\u043A\u043E\u0435 \u043E\u0442\u0441\u0435\u0447\u0435\u043D\u0438\u0435 \u043E\u043A\u043E\u043D\u0447\u0430\u043D\u0438\u0439",
      "set.matchMode.stemmer": "\u0421\u0442\u0435\u043C\u043C\u0435\u0440 (\u043B\u0443\u0447\u0448\u0435 \u0434\u043B\u044F \u0432\u0441\u0435\u0445 \u0444\u043E\u0440\u043C)",
      "kind.heading": "\u0417\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A",
      "kind.term": "\u0422\u0435\u0440\u043C\u0438\u043D",
      "kind.viaAlias": "\u043F\u043E \u0430\u043B\u0438\u0430\u0441\u0443 \xAB{form}\xBB",
      "set.smartCase.name": "\u0423\u043C\u043D\u044B\u0439 \u0440\u0435\u0433\u0438\u0441\u0442\u0440 \u0434\u043B\u044F \u0430\u0431\u0431\u0440\u0435\u0432\u0438\u0430\u0442\u0443\u0440",
      "set.smartCase.desc": "\u0422\u0435\u0440\u043C\u0438\u043D\u044B \u0438\u0437 \u0437\u0430\u0433\u043B\u0430\u0432\u043D\u044B\u0445 \u0431\u0443\u043A\u0432 (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440 \xABIT\xBB \u0438\u043B\u0438 \xABNASA\xBB) \u0441\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u044F\u044E\u0442\u0441\u044F \u0441 \u0443\u0447\u0451\u0442\u043E\u043C \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430, \u0447\u0442\u043E\u0431\u044B \u043D\u0435 \u0446\u0435\u043F\u043B\u044F\u0442\u044C \u043E\u0431\u044B\u0447\u043D\u044B\u0435 \u0441\u043B\u043E\u0432\u0430.",
      "set.scopeMode.name": "\u0413\u0434\u0435 \u0441\u0432\u044F\u0437\u044B\u0432\u0430\u0442\u044C",
      "set.scopeMode.vault": "\u0412\u0441\u0451 \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435",
      "set.scopeMode.folders": "\u0422\u043E\u043B\u044C\u043A\u043E \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0435 \u043F\u0430\u043F\u043A\u0438",
      "set.suggestMinChars.name": "\u041C\u0438\u043D\u0438\u043C\u0443\u043C \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432",
      "set.statusBarIncludeLinks.name": "\u0421\u0447\u0438\u0442\u0430\u0442\u044C \u0438 \u0443\u0436\u0435 \u0441\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u0435",
      "set.folderList.add": "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043F\u0443\u0442\u044C\u2026",
      "set.folderList.addAria": "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C",
      "plural.alias": { one: "{n} \u043F\u0441\u0435\u0432\u0434\u043E\u043D\u0438\u043C", few: "{n} \u043F\u0441\u0435\u0432\u0434\u043E\u043D\u0438\u043C\u0430", many: "{n} \u043F\u0441\u0435\u0432\u0434\u043E\u043D\u0438\u043C\u043E\u0432", other: "{n} \u043F\u0441\u0435\u0432\u0434\u043E\u043D\u0438\u043C\u043E\u0432" }
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
      "set.suggestPlainText.name": "Reinen Text einf\xFCgen",
      "set.suggestPlainText.desc": "Vorschl\xE4ge vervollst\xE4ndigen das Wort, ohne daraus einen Link zu machen.",
      "set.heading.contextMenu": "Kontextmen\xFC",
      "label.selection": "Auswahl",
      "modal.leftAsText": "\u2014 als Text belassen \u2014",
      "modal.skipOption": "(\xFCberspringen \u2014 als Text belassen)",
      "modal.materialize.summary": "Dateien: {files}, Ersetzungen: {replacements}",
      "modal.unlink.summary": "Dateien: {files}, zu entfernende Links: {links}",
      "modal.choose.body": "Dieses Wort passt zu mehr als einem Begriff \u2014 eines w\xE4hlen:",
      "notice.noActiveNote": "Keine aktive Notiz",
      "notice.noSelection": "Keine Auswahl",
      "notice.scopeSkipped": ", {n} \xFCbersprungen (seit der Vorschau ge\xE4ndert)",
      "set.editingHighlight.live": "Live (w\xE4hrend der Eingabe)",
      "set.editingHighlight.name": "Beim Bearbeiten hervorheben",
      "set.lang.invalid": "Ung\xFCltiges Modul: {error}",
      "set.languages.desc": "Mitgelieferte Morphologie-Module \u2014 {enabled} von {total} aktiviert",
      "set.matchMode.name": "Morphologie",
      "set.matchMode.exact": "Exakter Treffer",
      "set.matchMode.endingStrip": "Endungen abschneiden",
      "set.matchMode.stemmer": "Stemmer (empfohlen)",
      "kind.heading": "\xDCberschrift",
      "kind.term": "Begriff",
      "kind.viaAlias": "\xFCber Alias \u201E{form}\u201C",
      "set.smartCase.name": "Schreibweise von Abk\xFCrzungen beachten",
      "set.smartCase.desc": "\xDCberwiegend gro\xDFgeschriebene Begriffe (etwa \u201EIT\u201C oder \u201ENASA\u201C) werden nur bei gleicher Schreibweise verkn\xFCpft, damit sie keine gew\xF6hnlichen W\xF6rter erfassen.",
      "set.scopeMode.name": "Verlinkungsbereich",
      "set.scopeMode.vault": "\xDCberall",
      "set.scopeMode.folders": "Nur aufgef\xFChrte Pfade",
      "set.suggestMinChars.name": "Mindestanzahl Zeichen",
      "set.statusBarIncludeLinks.name": "Direkte Links z\xE4hlen",
      "plural.alias": { one: "{n} Alias", other: "{n} Aliasse" }
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
      "set.suggestPlainText.name": "Insertar texto sin enlace",
      "set.suggestPlainText.desc": "Las sugerencias completan la palabra sin convertirla en un enlace.",
      "set.heading.contextMenu": "Men\xFA contextual",
      "label.selection": "selecci\xF3n",
      "modal.leftAsText": "\u2014 dejado como texto \u2014",
      "modal.skipOption": "(omitir \u2014 dejar como texto)",
      "modal.materialize.summary": "Archivos: {files}, reemplazos: {replacements}",
      "modal.unlink.summary": "Archivos: {files}, enlaces a eliminar: {links}",
      "modal.choose.body": "Esta palabra coincide con m\xE1s de un t\xE9rmino \u2014 elige uno:",
      "notice.noActiveNote": "No hay nota activa",
      "notice.noSelection": "No hay selecci\xF3n",
      "notice.scopeSkipped": ", {n} omitido(s) (cambiado desde la vista previa)",
      "set.editingHighlight.live": "En vivo (mientras escribes)",
      "set.editingHighlight.name": "Resaltar al editar",
      "set.lang.invalid": "M\xF3dulo no v\xE1lido: {error}",
      "set.languages.desc": "M\xF3dulos de morfolog\xEDa incluidos \u2014 {enabled} de {total} activados",
      "set.matchMode.name": "Morfolog\xEDa",
      "set.matchMode.exact": "Coincidencia exacta",
      "set.matchMode.endingStrip": "Quitar terminaciones",
      "set.matchMode.stemmer": "Lematizador (recomendado)",
      "kind.heading": "Encabezado",
      "kind.term": "T\xE9rmino",
      "kind.viaAlias": "por el alias \xAB{form}\xBB",
      "set.smartCase.name": "Distinguir may\xFAsculas en siglas",
      "set.smartCase.desc": "Los t\xE9rminos escritos casi todo en may\xFAsculas (como \xABIT\xBB o \xABNASA\xBB) solo coinciden con esa misma graf\xEDa, para que no enlacen palabras corrientes.",
      "set.scopeMode.name": "\xC1mbito de enlazado",
      "set.scopeMode.vault": "En todas partes",
      "set.scopeMode.folders": "Solo rutas indicadas",
      "set.suggestMinChars.name": "Caracteres m\xEDnimos",
      "set.statusBarIncludeLinks.name": "Contar enlaces directos",
      "plural.alias": { one: "{n} alias", other: "{n} alias" }
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
      "set.suggestPlainText.name": "Ins\xE9rer du texte simple",
      "set.suggestPlainText.desc": "Les suggestions compl\xE8tent le mot sans en faire un lien.",
      "set.heading.contextMenu": "Menu contextuel",
      "label.selection": "s\xE9lection",
      "modal.leftAsText": "\u2014 laiss\xE9 en texte \u2014",
      "modal.skipOption": "(ignorer \u2014 laisser en texte)",
      "modal.materialize.summary": "Fichiers : {files}, remplacements : {replacements}",
      "modal.unlink.summary": "Fichiers : {files}, liens \xE0 supprimer : {links}",
      "modal.choose.body": "Ce mot correspond \xE0 plus d\u2019un terme \u2014 choisissez-en un :",
      "notice.noActiveNote": "Aucune note active",
      "notice.noSelection": "Aucune s\xE9lection",
      "notice.scopeSkipped": ", {n} ignor\xE9(s) (modifi\xE9 depuis l\u2019aper\xE7u)",
      "set.editingHighlight.live": "En direct (pendant la saisie)",
      "set.editingHighlight.name": "Surligner pendant l\u2019\xE9dition",
      "set.lang.invalid": "Module non valide : {error}",
      "set.languages.desc": "Modules de morphologie inclus \u2014 {enabled} sur {total} activ\xE9s",
      "set.matchMode.name": "Morphologie",
      "set.matchMode.exact": "Correspondance exacte",
      "set.matchMode.endingStrip": "Suppression des terminaisons",
      "set.matchMode.stemmer": "Racinisation (recommand\xE9)",
      "kind.heading": "Titre",
      "kind.term": "Terme",
      "kind.viaAlias": "via l\u2019alias \xAB {form} \xBB",
      "set.smartCase.name": "Respecter la casse des sigles",
      "set.smartCase.desc": "Les termes \xE9crits en majuscules (comme \xAB IT \xBB ou \xAB NASA \xBB) ne correspondent qu\u2019\xE0 la m\xEAme graphie, afin de ne pas lier des mots ordinaires.",
      "set.scopeMode.name": "Port\xE9e du liage",
      "set.scopeMode.vault": "Partout",
      "set.scopeMode.folders": "Chemins list\xE9s seulement",
      "set.suggestMinChars.name": "Caract\xE8res minimum",
      "set.statusBarIncludeLinks.name": "Compter les liens directs",
      "plural.alias": { one: "{n} alias", other: "{n} alias" }
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
      "set.suggestPlainText.name": "\u0412\u0441\u0442\u0430\u0432\u043B\u044F\u0442\u0438 \u043F\u0440\u043E\u0441\u0442\u0438\u0439 \u0442\u0435\u043A\u0441\u0442",
      "set.suggestPlainText.desc": "\u041F\u0456\u0434\u043A\u0430\u0437\u043A\u0430 \u0434\u043E\u043F\u0438\u0441\u0443\u0454 \u0441\u043B\u043E\u0432\u043E, \u043D\u0435 \u043F\u0435\u0440\u0435\u0442\u0432\u043E\u0440\u044E\u044E\u0447\u0438 \u0439\u043E\u0433\u043E \u043D\u0430 \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F.",
      "set.heading.contextMenu": "\u041A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u043D\u0435 \u043C\u0435\u043D\u044E",
      "label.selection": "\u0432\u0438\u0434\u0456\u043B\u0435\u043D\u043D\u044F",
      "modal.leftAsText": "\u2014 \u0437\u0430\u043B\u0438\u0448\u0435\u043D\u043E \u0442\u0435\u043A\u0441\u0442\u043E\u043C \u2014",
      "modal.skipOption": "(\u043F\u0440\u043E\u043F\u0443\u0441\u0442\u0438\u0442\u0438 \u2014 \u0437\u0430\u043B\u0438\u0448\u0438\u0442\u0438 \u0442\u0435\u043A\u0441\u0442\u043E\u043C)",
      "modal.materialize.summary": "\u0424\u0430\u0439\u043B\u0456\u0432: {files}, \u0437\u0430\u043C\u0456\u043D: {replacements}",
      "modal.unlink.summary": "\u0424\u0430\u0439\u043B\u0456\u0432: {files}, \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u044C \u0434\u043E \u0432\u0438\u0434\u0430\u043B\u0435\u043D\u043D\u044F: {links}",
      "modal.choose.body": "\u0426\u0435 \u0441\u043B\u043E\u0432\u043E \u0437\u0431\u0456\u0433\u0430\u0454\u0442\u044C\u0441\u044F \u0437 \u043A\u0456\u043B\u044C\u043A\u043E\u043C\u0430 \u0442\u0435\u0440\u043C\u0456\u043D\u0430\u043C\u0438 \u2014 \u0432\u0438\u0431\u0435\u0440\u0456\u0442\u044C \u043E\u0434\u0438\u043D:",
      "notice.noActiveNote": "\u041D\u0435\u043C\u0430\u0454 \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0457 \u043D\u043E\u0442\u0430\u0442\u043A\u0438",
      "notice.noSelection": "\u041D\u0435\u043C\u0430\u0454 \u0432\u0438\u0434\u0456\u043B\u0435\u043D\u043D\u044F",
      "notice.scopeSkipped": ", \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E: {n} (\u0437\u043C\u0456\u043D\u0435\u043D\u043E \u043F\u0456\u0441\u043B\u044F \u043F\u043E\u043F\u0435\u0440\u0435\u0434\u043D\u044C\u043E\u0433\u043E \u043F\u0435\u0440\u0435\u0433\u043B\u044F\u0434\u0443)",
      "set.editingHighlight.live": "\u041D\u0430 \u043B\u044C\u043E\u0442\u0443 (\u043F\u0456\u0434 \u0447\u0430\u0441 \u043D\u0430\u0431\u043E\u0440\u0443)",
      "set.editingHighlight.name": "\u041F\u0456\u0434\u0441\u0432\u0456\u0447\u0443\u0432\u0430\u0442\u0438 \u043F\u0456\u0434 \u0447\u0430\u0441 \u0440\u0435\u0434\u0430\u0433\u0443\u0432\u0430\u043D\u043D\u044F",
      "set.lang.invalid": "\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u0438\u0439 \u043C\u043E\u0434\u0443\u043B\u044C: {error}",
      "set.languages.desc": "\u0412\u0431\u0443\u0434\u043E\u0432\u0430\u043D\u0456 \u043C\u043E\u0434\u0443\u043B\u0456 \u043C\u043E\u0440\u0444\u043E\u043B\u043E\u0433\u0456\u0457 \u2014 \u0443\u0432\u0456\u043C\u043A\u043D\u0435\u043D\u043E {enabled} \u0437 {total}",
      "set.matchMode.name": "\u041C\u043E\u0440\u0444\u043E\u043B\u043E\u0433\u0456\u044F",
      "set.matchMode.exact": "\u0422\u043E\u0447\u043D\u0438\u0439 \u0437\u0431\u0456\u0433",
      "set.matchMode.endingStrip": "\u0412\u0456\u0434\u0441\u0456\u043A\u0430\u043D\u043D\u044F \u0437\u0430\u043A\u0456\u043D\u0447\u0435\u043D\u044C",
      "set.matchMode.stemmer": "\u0421\u0442\u0435\u043C\u0435\u0440 (\u0440\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u043E\u0432\u0430\u043D\u043E)",
      "kind.heading": "\u0417\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A",
      "kind.term": "\u0422\u0435\u0440\u043C\u0456\u043D",
      "kind.viaAlias": "\u0437\u0430 \u0430\u043B\u0456\u0430\u0441\u043E\u043C \xAB{form}\xBB",
      "set.smartCase.name": "\u0420\u043E\u0437\u0443\u043C\u043D\u0438\u0439 \u0440\u0435\u0433\u0456\u0441\u0442\u0440 \u0434\u043B\u044F \u0430\u0431\u0440\u0435\u0432\u0456\u0430\u0442\u0443\u0440",
      "set.smartCase.desc": "\u0422\u0435\u0440\u043C\u0456\u043D\u0438 \u0437 \u0432\u0435\u043B\u0438\u043A\u0438\u0445 \u043B\u0456\u0442\u0435\u0440 (\u043D\u0430\u043F\u0440\u0438\u043A\u043B\u0430\u0434 \xABIT\xBB \u0430\u0431\u043E \xABNASA\xBB) \u0437\u0456\u0441\u0442\u0430\u0432\u043B\u044F\u044E\u0442\u044C\u0441\u044F \u0437 \u0443\u0440\u0430\u0445\u0443\u0432\u0430\u043D\u043D\u044F\u043C \u0440\u0435\u0433\u0456\u0441\u0442\u0440\u0443, \u0449\u043E\u0431 \u043D\u0435 \u0447\u0456\u043F\u043B\u044F\u0442\u0438 \u0437\u0432\u0438\u0447\u0430\u0439\u043D\u0456 \u0441\u043B\u043E\u0432\u0430.",
      "set.scopeMode.name": "\u041E\u0431\u043B\u0430\u0441\u0442\u044C \u0437\u0432\u2019\u044F\u0437\u0443\u0432\u0430\u043D\u043D\u044F",
      "set.scopeMode.vault": "\u0423\u0441\u044E\u0434\u0438",
      "set.scopeMode.folders": "\u041B\u0438\u0448\u0435 \u0432\u043A\u0430\u0437\u0430\u043D\u0456 \u0448\u043B\u044F\u0445\u0438",
      "set.suggestMinChars.name": "\u041C\u0456\u043D\u0456\u043C\u0443\u043C \u0441\u0438\u043C\u0432\u043E\u043B\u0456\u0432",
      "set.statusBarIncludeLinks.name": "\u0420\u0430\u0445\u0443\u0432\u0430\u0442\u0438 \u043F\u0440\u044F\u043C\u0456 \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F",
      "plural.alias": { one: "{n} \u043F\u0441\u0435\u0432\u0434\u043E\u043D\u0456\u043C", few: "{n} \u043F\u0441\u0435\u0432\u0434\u043E\u043D\u0456\u043C\u0438", many: "{n} \u043F\u0441\u0435\u0432\u0434\u043E\u043D\u0456\u043C\u0456\u0432", other: "{n} \u043F\u0441\u0435\u0432\u0434\u043E\u043D\u0456\u043C\u0456\u0432" }
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

// src/shared/menu-verbs.js
var require_menu_verbs = __commonJS({
  "src/shared/menu-verbs.js"(exports2, module2) {
    "use strict";
    var { sharedSection, menuSection } = require_menu();
    var { peersOffering } = require_discover();
    var { t: t2 } = require_i18n();
    var VERBS = {
      convert: { label: "menu.convert.group", icon: "link" },
      open: { label: "menu.open.group", icon: "file-search" },
      exclude: { label: "exclude.group", icon: "ban" }
    };
    var MenuBuilder = class {
      constructor(plugin, menu) {
        this.plugin = plugin;
        this.menu = menu;
        this.entries = [];
      }
      // Untagged: written where it stands, exactly as Obsidian's own Menu would.
      addItem(cb) {
        this.entries.push({ cb });
        return this;
      }
      addSeparator() {
        this.entries.push({ separator: true });
        return this;
      }
      // Tagged. `cb(item, grouped)` is told whether it ended up in a submenu, since the wording
      // differs: inside one, the parent already names the object.
      tagged(verb, opts, cb) {
        if (!VERBS[verb])
          throw new Error("unknown menu verb: " + verb);
        this.entries.push({ cb, verb, value: opts && opts.value });
        return this;
      }
      // A submenu of this plugin's own — the several ways to link one word, say. Unlike a verb it
      // is never shared, and it is built even for a single item because the items only read as a
      // set. Takes items the way a menu does.
      section(label, icon) {
        const entry = { section: { label, icon }, children: [] };
        this.entries.push(entry);
        const child = {
          addItem(cb) {
            entry.children.push({ cb });
            return child;
          },
          addSeparator() {
            entry.children.push({ separator: true });
            return child;
          }
        };
        return child;
      }
      // Verb -> the object it acts on, for those that earned a submenu. All items of one verb in
      // one menu act on the same object, so the first one's value names the group.
      groupedVerbs() {
        const counts = /* @__PURE__ */ new Map();
        for (const e of this.entries) {
          if (!e.verb)
            continue;
          const seen = counts.get(e.verb) || { count: 0, value: e.value };
          seen.count++;
          counts.set(e.verb, seen);
        }
        const provider = this.plugin.api && this.plugin.api.linker;
        const grouped = /* @__PURE__ */ new Map();
        for (const [verb, { count, value }] of counts) {
          const peers = provider ? peersOffering(this.plugin.app, provider, verb, value).length : 0;
          if (count + peers > 1)
            grouped.set(verb, value);
        }
        return grouped;
      }
      // menuSection builds the group on its first item, so an empty one leaves no trace, and it
      // falls back to prefixed titles where the app has no submenus.
      writeSection(entry) {
        if (!entry.children.length)
          return;
        const sub = menuSection(this.menu, entry.section.label, true, entry.section.icon);
        for (const child of entry.children) {
          if (child.separator)
            sub.addSeparator();
          else
            sub.addItem((item) => child.cb(item, true));
        }
      }
      sectionFor(verb, value) {
        const spec = VERBS[verb];
        const label = t2(spec.label, value == null ? void 0 : { value });
        return sharedSection(this.menu, "linker:" + verb, label, spec.icon);
      }
      // Replayed in declaration order, so a verb's submenu appears where its first item would
      // have. Anything else keeps its place.
      flush() {
        const grouped = this.groupedVerbs();
        const sections = /* @__PURE__ */ new Map();
        for (const e of this.entries) {
          if (e.separator) {
            this.menu.addSeparator();
            continue;
          }
          if (e.section) {
            this.writeSection(e);
            continue;
          }
          if (!e.verb || !grouped.has(e.verb)) {
            this.menu.addItem((item) => e.cb(item, false));
            continue;
          }
          if (!sections.has(e.verb))
            sections.set(e.verb, this.sectionFor(e.verb, grouped.get(e.verb)));
          sections.get(e.verb).addItem((item) => e.cb(item, true));
        }
      }
    };
    function buildMenu2(plugin, menu, fn) {
      const builder = new MenuBuilder(plugin, menu);
      fn(builder);
      builder.flush();
    }
    module2.exports = { VERBS, MenuBuilder, buildMenu: buildMenu2 };
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
    async function readOutline(absPath) {
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
              out.push({ title, position: page });
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
    module2.exports = { openDocument, readOutline, renderPageToCanvas };
  }
});

// src/formats/pdf.js
var require_pdf2 = __commonJS({
  "src/formats/pdf.js"(exports2, module2) {
    "use strict";
    var { openDocument, readOutline, renderPageToCanvas } = require_pdf();
    var openPath = "";
    var openDoc = null;
    async function dispose() {
      if (openDoc) {
        try {
          await openDoc.destroy();
        } catch (e) {
        }
      }
      openPath = "";
      openDoc = null;
    }
    async function getDoc(absPath) {
      if (openPath === absPath && openDoc)
        return openDoc;
      await dispose();
      const doc = await openDocument(absPath);
      if (doc) {
        openPath = absPath;
        openDoc = doc;
      }
      return doc;
    }
    async function render(el, req) {
      const doc = await getDoc(req.abs);
      if (!req.isCurrent() || !doc)
        return false;
      const canvas = el.createEl("canvas");
      const ok = await renderPageToCanvas(doc, req.position, canvas, req.width);
      if (!req.isCurrent() || !ok)
        return false;
      return null;
    }
    module2.exports = {
      id: "pdf",
      exts: ["pdf"],
      anchorKind: "page",
      anchorFor: (e) => e.kind === "section" && e.position ? "page=" + e.position : null,
      positionLabel: (n, to) => "p." + n + (to && to > n ? "\u2013" + to : ""),
      outline: readOutline,
      render,
      dispose
    };
  }
});

// src/formats/image.js
var require_image = __commonJS({
  "src/formats/image.js"(exports2, module2) {
    "use strict";
    var fs2 = require("fs");
    var MIME = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      bmp: "image/bmp",
      svg: "image/svg+xml",
      avif: "image/avif"
    };
    async function render(el, req) {
      let buf;
      try {
        buf = fs2.readFileSync(req.abs);
      } catch (e) {
        return false;
      }
      if (!req.isCurrent())
        return false;
      const url = URL.createObjectURL(new Blob([buf], { type: MIME[req.ext] || "application/octet-stream" }));
      const img = el.createEl("img");
      img.src = url;
      img.style.maxWidth = req.width + "px";
      return () => {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {
        }
      };
    }
    module2.exports = {
      id: "image",
      exts: Object.keys(MIME),
      anchorKind: null,
      render
    };
  }
});

// src/zip.js
var require_zip = __commonJS({
  "src/zip.js"(exports2, module2) {
    "use strict";
    var fs2 = require("fs");
    var zlib = require("zlib");
    var EOCD_SIG = 101010256;
    var CEN_SIG = 33639248;
    var LOC_SIG = 67324752;
    var EOCD_MIN = 22;
    var MAX_COMMENT = 65535;
    function findEocd(buf) {
      const start = Math.max(0, buf.length - EOCD_MIN - MAX_COMMENT);
      for (let i = buf.length - EOCD_MIN; i >= start; i--) {
        if (buf.readUInt32LE(i) === EOCD_SIG && buf.readUInt16LE(i + 20) === buf.length - i - EOCD_MIN)
          return i;
      }
      return -1;
    }
    function readCentral(buf) {
      const eocd = findEocd(buf);
      if (eocd < 0)
        return null;
      const count = buf.readUInt16LE(eocd + 10);
      let p = buf.readUInt32LE(eocd + 16);
      if (p === 4294967295)
        return null;
      const out = /* @__PURE__ */ new Map();
      for (let i = 0; i < count; i++) {
        if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN_SIG)
          break;
        const method = buf.readUInt16LE(p + 10);
        const compressed = buf.readUInt32LE(p + 20);
        const uncompressed = buf.readUInt32LE(p + 24);
        const nameLen = buf.readUInt16LE(p + 28);
        const extraLen = buf.readUInt16LE(p + 30);
        const commentLen = buf.readUInt16LE(p + 32);
        const offset = buf.readUInt32LE(p + 42);
        const name = buf.slice(p + 46, p + 46 + nameLen).toString("utf8");
        out.set(name, { method, compressed, uncompressed, offset });
        p += 46 + nameLen + extraLen + commentLen;
      }
      return out;
    }
    function inflateMember(buf, ent) {
      if (ent.offset + 30 > buf.length || buf.readUInt32LE(ent.offset) !== LOC_SIG)
        return null;
      const nameLen = buf.readUInt16LE(ent.offset + 26);
      const extraLen = buf.readUInt16LE(ent.offset + 28);
      const start = ent.offset + 30 + nameLen + extraLen;
      const raw = buf.slice(start, start + ent.compressed);
      if (ent.method === 0)
        return raw;
      if (ent.method !== 8)
        return null;
      try {
        return zlib.inflateRawSync(raw);
      } catch (e) {
        return null;
      }
    }
    function openZip(absPath) {
      let buf;
      try {
        buf = fs2.readFileSync(absPath);
      } catch (e) {
        return null;
      }
      const central = readCentral(buf);
      if (!central)
        return null;
      const cache = /* @__PURE__ */ new Map();
      const read = (name) => {
        if (cache.has(name))
          return cache.get(name);
        const ent = central.get(name);
        const out = ent ? inflateMember(buf, ent) : null;
        cache.set(name, out);
        return out;
      };
      return {
        names: () => [...central.keys()],
        has: (name) => central.has(name),
        read,
        text: (name) => {
          const b = read(name);
          return b ? b.toString("utf8") : null;
        }
      };
    }
    module2.exports = { openZip };
  }
});

// src/xml.js
var require_xml = __commonJS({
  "src/xml.js"(exports2, module2) {
    "use strict";
    var ENTITIES = {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: '"',
      apos: "'",
      nbsp: " ",
      shy: "\xAD",
      ensp: " ",
      emsp: " ",
      thinsp: " ",
      ndash: "\u2013",
      mdash: "\u2014",
      hellip: "\u2026",
      bull: "\u2022",
      middot: "\xB7",
      dagger: "\u2020",
      lsquo: "\u2018",
      rsquo: "\u2019",
      ldquo: "\u201C",
      rdquo: "\u201D",
      laquo: "\xAB",
      raquo: "\xBB",
      copy: "\xA9",
      reg: "\xAE",
      trade: "\u2122",
      sect: "\xA7",
      para: "\xB6",
      deg: "\xB0",
      larr: "\u2190",
      rarr: "\u2192",
      harr: "\u2194",
      times: "\xD7",
      minus: "\u2212",
      plusmn: "\xB1",
      ne: "\u2260",
      le: "\u2264",
      ge: "\u2265",
      euro: "\u20AC",
      pound: "\xA3",
      yen: "\xA5",
      cent: "\xA2"
    };
    function decodeEntities(s) {
      return String(s).replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (m, body) => {
        if (body[0] === "#") {
          const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
          return code >= 0 && code <= 1114111 ? String.fromCodePoint(code) : m;
        }
        const hit = ENTITIES[body.toLowerCase()];
        return hit === void 0 ? m : hit;
      });
    }
    function elements(xml, tag) {
      const out = [];
      const open = new RegExp("<" + tag + "(?=[\\s/>])", "g");
      let m;
      while (m = open.exec(xml)) {
        const end = scanElement(xml, m.index, tag);
        if (end < 0)
          break;
        out.push(xml.slice(m.index, end));
        open.lastIndex = end;
      }
      return out;
    }
    function elementsOf(xml, tags) {
      const out = [];
      const open = new RegExp("<(" + tags.join("|") + ")(?=[\\s/>])", "g");
      let m;
      while (m = open.exec(xml)) {
        const end = scanElement(xml, m.index, m[1]);
        if (end < 0)
          break;
        out.push({ tag: m[1], xml: xml.slice(m.index, end) });
        open.lastIndex = end;
      }
      return out;
    }
    function scanElement(xml, start, tag) {
      const open = "<" + tag;
      const close = "</" + tag + ">";
      let depth = 0;
      let i = start;
      while (i >= 0 && i < xml.length) {
        if (xml.startsWith(close, i)) {
          const gt = xml.indexOf(">", i);
          if (gt < 0)
            return -1;
          if (--depth === 0)
            return gt + 1;
          i = gt + 1;
        } else if (xml.startsWith(open, i)) {
          if (!/[\s/>]/.test(xml[i + open.length] || "")) {
            i += open.length;
            continue;
          }
          const gt = xml.indexOf(">", i);
          if (gt < 0)
            return -1;
          if (xml[gt - 1] === "/") {
            if (depth === 0)
              return gt + 1;
          } else
            depth++;
          i = gt + 1;
        } else {
          const a = xml.indexOf(open, i);
          const b = xml.indexOf(close, i);
          if (a < 0 && b < 0)
            return -1;
          i = a < 0 ? b : b < 0 ? a : Math.min(a, b);
        }
      }
      return -1;
    }
    function attr(source, name) {
      const m = new RegExp("\\s" + name + `\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(source);
      if (!m)
        return null;
      return decodeEntities(m[1] !== void 0 ? m[1] : m[2]);
    }
    function textIn(source, tag) {
      const re = new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag + ">", "g");
      let out = "";
      let m;
      while (m = re.exec(source))
        out += decodeEntities(m[1]);
      return out;
    }
    module2.exports = { decodeEntities, elements, elementsOf, attr, textIn };
  }
});

// src/formats/preview.js
var require_preview = __commonJS({
  "src/formats/preview.js"(exports2, module2) {
    "use strict";
    var obsidian = require("obsidian");
    var { t: t2 } = require_i18n();
    var IMAGE_BUDGET = 24 * 1024 * 1024;
    var VOID = /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i;
    var expandSelfClosing = (html) => String(html).replace(
      /<([a-z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)\s*\/>/gi,
      (all, tag, attrs) => VOID.test(tag) ? all : "<" + tag + attrs + "></" + tag + ">"
    );
    var REMOTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
    var IMAGE_MIME = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      bmp: "image/bmp",
      svg: "image/svg+xml",
      avif: "image/avif"
    };
    var mimeForImage = (name) => IMAGE_MIME[(name.split(".").pop() || "").toLowerCase()] || "application/octet-stream";
    function inlineImages(box, load) {
      const urls = [];
      if (!box || !box.querySelectorAll)
        return urls;
      let spent = 0;
      for (const img of box.querySelectorAll("img")) {
        const src = img.getAttribute && img.getAttribute("src");
        if (!src || REMOTE.test(src))
          continue;
        let buf = null;
        try {
          buf = load(src);
        } catch (e) {
          buf = null;
        }
        if (!buf || spent + buf.length > IMAGE_BUDGET) {
          if (img.removeAttribute)
            img.removeAttribute("src");
          continue;
        }
        spent += buf.length;
        const url = URL.createObjectURL(new Blob([buf], { type: mimeForImage(src) }));
        img.src = url;
        urls.push(url);
      }
      return urls;
    }
    var revoker = (urls) => urls.length ? () => {
      for (const u of urls) {
        try {
          URL.revokeObjectURL(u);
        } catch (e) {
        }
      }
    } : null;
    function inlineImagesAsData(html, load) {
      let spent = 0;
      return String(html).replace(/(<img\b[^>]*?\bsrc\s*=\s*)(["'])(.*?)\2/gi, (whole, head, q, src) => {
        if (!src || REMOTE.test(src))
          return whole;
        let buf = null;
        try {
          buf = load(src);
        } catch (e) {
          buf = null;
        }
        if (!buf || spent + buf.length > IMAGE_BUDGET)
          return head + q + q;
        spent += buf.length;
        return head + q + "data:" + mimeForImage(src) + ";base64," + buf.toString("base64") + q;
      });
    }
    var FRAME_MIN = 80;
    var FRAME_MAX = 2e3;
    var frameDoc = (html, css) => '<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>html,body{margin:0;padding:8px;overflow-x:auto}img,table,pre{max-width:100%}</style>' + (css ? "<style>" + String(css) + "</style>" : "") + "</head><body>" + html + "</body></html>";
    function renderFrame(el, { html, css, width, loadImage, onFail }) {
      if (typeof document === "undefined" || !el.createEl)
        return false;
      let frame;
      try {
        frame = el.createEl("iframe");
        if (!frame)
          return false;
        frame.setAttribute("sandbox", "allow-same-origin");
        frame.setAttribute("referrerpolicy", "no-referrer");
        frame.style.width = width + "px";
        frame.style.maxWidth = "100%";
        frame.style.height = FRAME_MIN + "px";
        frame.style.border = "0";
        frame.style.display = "block";
        frame.addEventListener("load", () => {
          let body2 = null;
          try {
            body2 = frame.contentDocument && frame.contentDocument.body;
          } catch (e) {
            body2 = null;
          }
          if (!body2 || !body2.firstChild) {
            try {
              frame.remove();
            } catch (e) {
            }
            if (onFail)
              onFail();
            return;
          }
          let height = 0;
          try {
            height = body2.getBoundingClientRect().height;
          } catch (e) {
            height = 0;
          }
          frame.style.height = Math.max(FRAME_MIN, Math.min(FRAME_MAX, (height || body2.scrollHeight) + 16)) + "px";
        });
        const body = expandSelfClosing(html);
        frame.srcdoc = frameDoc(loadImage ? inlineImagesAsData(body, loadImage) : body, css);
      } catch (e) {
        if (frame && frame.remove)
          frame.remove();
        return false;
      }
      return null;
    }
    var scopeSeq = 0;
    var CSS_LIMIT = 256 * 1024;
    function scopeSelector(sel, scope) {
      const s = sel.trim();
      if (!s || s.startsWith("@"))
        return "";
      if (/^(?:html|body|:root)$/i.test(s))
        return scope;
      const m = /^(?:html|body|:root)\b([\s\S]*)$/i.exec(s);
      if (m)
        return scope + m[1];
      if (s === "*")
        return scope + " *";
      return scope + " " + s;
    }
    var paper = (scope) => scope + "{background:#ffffff;color:#1a1a1a}";
    var containment = (scope) => [
      scope + "{max-width:100%;overflow-wrap:anywhere}",
      scope + " img," + scope + " table," + scope + " pre," + scope + " svg{max-width:100%}",
      scope + " pre{overflow-x:auto;white-space:pre-wrap}",
      scope + " table{display:block;overflow-x:auto}"
    ].join("\n");
    function scopeCss(css, scope) {
      let text = String(css).slice(0, CSS_LIMIT).replace(/\/\*[\s\S]*?\*\//g, "");
      text = text.replace(/@[\w-]+[^{;]*(?:;|\{(?:[^{}]|\{[^}]*\})*\})/g, "");
      const out = [paper(scope)];
      const rule = /([^{}]+)\{([^{}]*)\}/g;
      let m;
      while (m = rule.exec(text)) {
        const sels = m[1].split(",").map((s) => scopeSelector(s, scope)).filter(Boolean);
        if (!sels.length)
          continue;
        const decls = m[2].replace(/position\s*:\s*(?:fixed|sticky)/gi, "position: static").trim();
        if (decls)
          out.push(sels.join(",") + "{" + decls + "}");
      }
      out.push(containment(scope));
      return out.join("\n");
    }
    async function renderMarkdown(el, { markdown, width, app, component, loadImage }) {
      const R = obsidian.MarkdownRenderer;
      const render = R && (R.render || R.renderMarkdown);
      if (!render || !component)
        return false;
      const box = el.createDiv({ cls: "reference-linker-rendered markdown-rendered" });
      box.style.maxWidth = width + "px";
      try {
        if (R.render)
          await R.render(app, markdown, box, "", component);
        else
          await R.renderMarkdown(markdown, box, "", component);
      } catch (e) {
        box.remove();
        return false;
      }
      return revoker(loadImage ? inlineImages(box, loadImage) : []);
    }
    function renderHtml(el, { html, width, loadImage, css }) {
      if (typeof obsidian.sanitizeHTMLToDom !== "function")
        return false;
      const scopeCls = "reference-linker-scope-" + ++scopeSeq;
      const scoped = css && typeof document !== "undefined" ? scopeCss(css, "." + scopeCls) : "";
      const box = el.createDiv({ cls: "reference-linker-rendered " + (scoped ? "" : "markdown-rendered ") + scopeCls });
      box.style.maxWidth = width + "px";
      try {
        if (scoped) {
          const style = document.createElement("style");
          style.textContent = scoped;
          box.appendChild(style);
        }
        box.appendChild(obsidian.sanitizeHTMLToDom(expandSelfClosing(html)));
      } catch (e) {
        box.remove();
        return false;
      }
      return revoker(loadImage ? inlineImages(box, loadImage) : []);
    }
    function renderLines(el, { title, body, width }) {
      const box = el.createDiv({ cls: "reference-linker-doc" });
      box.style.maxWidth = width + "px";
      if (title)
        box.createDiv({ cls: "reference-linker-doc-title", text: title });
      for (const line of body || [])
        box.createDiv({ cls: "reference-linker-doc-line", text: line });
      if (!title && !(body || []).length) {
        box.createDiv({ cls: "reference-linker-doc-empty", text: t2("preview.empty") });
      }
      return null;
    }
    module2.exports = {
      renderLines,
      renderMarkdown,
      renderHtml,
      renderFrame,
      inlineImages,
      inlineImagesAsData,
      frameDoc,
      scopeCss,
      expandSelfClosing
    };
  }
});

// src/formats/util.js
var require_util = __commonJS({
  "src/formats/util.js"(exports2, module2) {
    "use strict";
    var clampPosition = (position, total) => Math.min(Math.max(1, position | 0), total);
    function normPath(pathStr) {
      const out = [];
      for (const seg of String(pathStr).split("/")) {
        if (!seg || seg === ".")
          continue;
        if (seg === "..")
          out.pop();
        else
          out.push(seg);
      }
      return out.join("/");
    }
    var assetSrc = (src) => decodeURIComponent(String(src).split(/[?#]/)[0]);
    function sectionEnd(headings, n, endOfDocument) {
      const level = headings[n - 1].level || 1;
      for (let i = n; i < headings.length; i++)
        if ((headings[i].level || 1) <= level)
          return headings[i].from;
      return endOfDocument;
    }
    var escHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    var escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    var MAX_ROWS = 100;
    var MAX_COLS = 20;
    var cellText = (c) => c && typeof c === "object" ? c.text || "" : c || "";
    var COVERED = { text: "", covered: true };
    var isCovered = (c) => !!(c && typeof c === "object" && c.covered);
    var spanning = (cell, cols, rows) => Object.assign(
      {},
      typeof cell === "object" && cell ? cell : { text: cell || "" },
      { cols, rows }
    );
    function usedRange(grid) {
      let top = -1;
      let bottom = -1;
      let left = -1;
      let right = -1;
      grid.forEach((cells, r) => cells.forEach((c, i) => {
        if (!cellText(c) && !isCovered(c))
          return;
        if (top < 0)
          top = r;
        bottom = r;
        if (left < 0 || i < left)
          left = i;
        if (i > right)
          right = i;
      }));
      return { top, bottom, left, right };
    }
    function gridToHtml(grid, opts = {}) {
      const { top, bottom, left, right } = usedRange(grid);
      if (top < 0)
        return null;
      const last = Math.min(right + 1, left + MAX_COLS);
      const width = last - left;
      const rows = grid.slice(top, Math.min(bottom + 1, top + MAX_ROWS)).map((cells) => Array.from({ length: width }, (_, i) => cells[left + i]));
      const header = opts.header !== false;
      const span = (n, room, name) => {
        const at = Math.min(Math.max(1, n || 1), room);
        return at > 1 ? " " + name + '="' + at + '"' : "";
      };
      const cellHtml = (c, tag, r, i) => {
        if (isCovered(c))
          return "";
        const cls = c && typeof c === "object" && c.cls ? ' class="' + c.cls + '"' : "";
        const merged = c && typeof c === "object" ? span(c.cols, width - i, "colspan") + span(c.rows, rows.length - r, "rowspan") : "";
        return "<" + tag + cls + merged + ">" + escHtml(cellText(c)) + "</" + tag + ">";
      };
      const rowHtml = (cells, tag, r) => "<tr>" + cells.map((c, i) => cellHtml(c, tag, r, i)).join("") + "</tr>";
      const cols = opts.cols || [];
      const group = cols.length ? "<colgroup>" + Array.from({ length: width }, (_, i) => {
        const col = cols[left + i] || {};
        const style = col.width ? ' style="width:' + col.width + '"' : "";
        const cls = col.cls ? ' class="' + col.cls + '"' : "";
        return "<col" + style + cls + ">";
      }).join("") + "</colgroup>" : "";
      const head = header ? rowHtml(rows[0], "th", 0) : "";
      const body = (header ? rows.slice(1) : rows).map((cs, i) => rowHtml(cs, "td", header ? i + 1 : i)).join("");
      return "<table>" + group + head + body + "</table>";
    }
    module2.exports = {
      clampPosition,
      normPath,
      assetSrc,
      escHtml,
      escAttr,
      usedRange,
      gridToHtml,
      cellText,
      spanning,
      isCovered,
      COVERED,
      sectionEnd,
      MAX_ROWS,
      MAX_COLS
    };
  }
});

// src/formats/css.js
var require_css = __commonJS({
  "src/formats/css.js"(exports2, module2) {
    "use strict";
    var TWIP = 20;
    var pt = (n) => Math.round(n * 100) / 100 + "pt";
    var twips = (v) => pt(Number(v) / TWIP);
    var halfPoints = (v) => pt(Number(v) / 2);
    var eighthPoints = (v) => pt(Number(v) / 8);
    var num = (v) => v === null || v === void 0 || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
    function colour(v) {
      const s = String(v || "").trim().replace(/^#/, "");
      return /^[0-9a-f]{6}$/i.test(s) ? "#" + s.toLowerCase() : null;
    }
    var SERIF = /times|georgia|garamond|book|minion|cambria|constantia|palatino|serif/i;
    var MONO = /courier|consolas|menlo|mono/i;
    function fontFamily(name) {
      const first = String(name || "").split(",")[0].trim().replace(/^["']|["']$/g, "");
      if (!first)
        return null;
      const generic = MONO.test(first) ? "monospace" : SERIF.test(first) ? "serif" : "sans-serif";
      return JSON.stringify(first) + ", " + generic;
    }
    var declaration = (props) => Object.keys(props).filter((k) => props[k] !== null && props[k] !== void 0 && props[k] !== "").sort().map((k) => k + ":" + props[k]).join(";");
    function sheet(prefix) {
      const byRule = /* @__PURE__ */ new Map();
      const order = [];
      return {
        // The class for this set of CSS properties, or '' when there is nothing to say. `within`
        // narrows the rule to a descendant — a table saying what its own cells look like.
        cls(props, within) {
          const rule = declaration(props || {});
          if (!rule)
            return "";
          const key = (within || "") + "{" + rule;
          let name = byRule.get(key);
          if (!name) {
            name = (prefix || "d") + byRule.size;
            byRule.set(key, name);
            order.push([name + (within ? " " + within : ""), rule]);
          }
          return name;
        },
        text() {
          return order.map(([selector, rule]) => "." + selector + "{" + rule + "}").join("\n");
        }
      };
    }
    function pageCss(page, viewWidth, view) {
      const width = page && page.width;
      if (!width)
        return { css: "", zoom: 1 };
      const whole = view === "page";
      const box = {
        width: pt(width),
        "min-height": whole && page.height ? pt(page.height) : null,
        "padding-right": page.right ? pt(page.right) : null,
        "padding-left": page.left ? pt(page.left) : null,
        "padding-top": whole && page.top ? pt(page.top) : "12pt",
        "padding-bottom": whole && page.bottom ? pt(page.bottom) : "12pt",
        "box-sizing": "border-box",
        background: "#ffffff",
        color: "#1a1a1a",
        margin: "0 auto",
        "box-shadow": whole ? "0 0 0 1pt rgba(0,0,0,.15)" : null
      };
      return { css: ".page{" + declaration(box) + "}", zoom: Math.min(1, viewWidth / (width * (96 / 72))) };
    }
    var SHEET_RULES = [
      "body{margin:0;background:transparent;color:#1a1a1a}",
      "table{border-collapse:collapse;background:#fff;font:13px system-ui,sans-serif}",
      "td,th{border:1px solid #d9d9d9;padding:2px 6px;white-space:nowrap}",
      "th{background:#f3f3f3;font-weight:600;text-align:left}"
    ].join("\n");
    module2.exports = { sheet, pt, twips, halfPoints, eighthPoints, num, colour, fontFamily, declaration, pageCss, SHEET_RULES };
  }
});

// src/formats/pptx-styles.js
var require_pptx_styles = __commonJS({
  "src/formats/pptx-styles.js"(exports2, module2) {
    "use strict";
    var { elements, attr } = require_xml();
    var { pt, colour, fontFamily } = require_css();
    var EMU = 12700;
    var finite = (v) => {
      if (v === null || v === void 0 || v === "")
        return null;
      return Number.isFinite(Number(v)) ? Number(v) : null;
    };
    var emu = (v) => finite(v) === null ? null : finite(v) / EMU;
    var hundredths = (v) => finite(v) === null ? null : finite(v) / 100;
    var ALIGN = { l: "left", ctr: "center", r: "right", just: "justify", dist: "justify" };
    var ANCHOR = { t: "flex-start", ctr: "center", b: "flex-end" };
    function readTheme(themeXml, masterXml) {
      const scheme = /* @__PURE__ */ new Map();
      const source = elements(themeXml || "", "a:clrScheme")[0] || "";
      const re = /<a:(dk1|lt1|dk2|lt2|accent[1-6]|hlink|folHlink)>([\s\S]*?)<\/a:\1>/g;
      let m;
      while (m = re.exec(source)) {
        const srgb = attr(elements(m[2], "a:srgbClr")[0] || "", "val");
        const sys = attr(elements(m[2], "a:sysClr")[0] || "", "lastClr");
        const value = colour(srgb || sys);
        if (value)
          scheme.set(m[1], value);
      }
      const map = /* @__PURE__ */ new Map();
      const clrMap = elements(masterXml || "", "p:clrMap")[0] || "";
      for (const name of [
        "bg1",
        "tx1",
        "bg2",
        "tx2",
        "accent1",
        "accent2",
        "accent3",
        "accent4",
        "accent5",
        "accent6",
        "hlink",
        "folHlink"
      ]) {
        const target = attr(clrMap, name);
        if (target)
          map.set(name, target);
      }
      const fonts = elements(themeXml || "", "a:fontScheme")[0] || "";
      const face = (which) => attr(elements(elements(fonts, which)[0] || "", "a:latin")[0] || "", "typeface") || null;
      return { scheme, map, major: face("a:majorFont"), minor: face("a:minorFont") };
    }
    var clamp01 = (n) => Math.min(1, Math.max(0, n));
    var byte = (v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
    function toHsl(hex) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      const d = max - min;
      if (!d)
        return { h: 0, s: 0, l };
      const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return { h: h / 6, s, l };
    }
    var channel = (p, q, t2) => {
      const at = t2 < 0 ? t2 + 1 : t2 > 1 ? t2 - 1 : t2;
      if (at < 1 / 6)
        return p + (q - p) * 6 * at;
      if (at < 1 / 2)
        return q;
      if (at < 2 / 3)
        return p + (q - p) * (2 / 3 - at) * 6;
      return p;
    };
    function toHex({ h, s, l }) {
      if (!s)
        return "#" + byte(l).repeat(3);
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      return "#" + byte(channel(p, q, h + 1 / 3)) + byte(channel(p, q, h)) + byte(channel(p, q, h - 1 / 3));
    }
    var mix = (hex, towards, amount) => "#" + [1, 3, 5].map((i) => {
      const from = parseInt(hex.slice(i, i + 2), 16);
      const to = parseInt(towards.slice(i, i + 2), 16);
      return byte((from + (to - from) * amount) / 255);
    }).join("");
    function modified(hex, source) {
      const pct = (tag) => {
        const v = attr(elements(source || "", tag)[0] || "", "val");
        return v === null ? null : Number(v) / 1e5;
      };
      let out = hex;
      const lumMod = pct("a:lumMod");
      const lumOff = pct("a:lumOff");
      if (lumMod !== null || lumOff !== null) {
        const hsl = toHsl(out);
        hsl.l = clamp01(hsl.l * (lumMod === null ? 1 : lumMod) + (lumOff === null ? 0 : lumOff));
        out = toHex(hsl);
      }
      const shade = pct("a:shade");
      if (shade !== null)
        out = mix(out, "#000000", 1 - shade);
      const tint = pct("a:tint");
      if (tint !== null)
        out = mix(out, "#ffffff", 1 - tint);
      return out;
    }
    function fillColour(source, theme) {
      if (!source)
        return null;
      const srgb = elements(source, "a:srgbClr")[0];
      const direct = colour(attr(srgb || "", "val"));
      if (direct)
        return modified(direct, srgb);
      const scheme = elements(source, "a:schemeClr")[0];
      const named = attr(scheme || "", "val");
      if (!named || !theme)
        return null;
      const slot = theme.map.get(named) || named;
      const value = theme.scheme.get(slot) || theme.scheme.get(named) || null;
      return value ? modified(value, scheme) : null;
    }
    var solidFill = (pr, theme) => fillColour(elements(pr || "", "a:solidFill")[0], theme);
    function groupFrame(grpSp, parent) {
      const xfrm = elements(grpSp, "a:xfrm")[0];
      if (!xfrm)
        return parent || null;
      const off = elements(xfrm, "a:off")[0];
      const ext = elements(xfrm, "a:ext")[0];
      const chOff = elements(xfrm, "a:chOff")[0];
      const chExt = elements(xfrm, "a:chExt")[0];
      if (!off || !ext || !chOff || !chExt)
        return parent || null;
      const cx = Number(attr(chExt, "cx"));
      const cy = Number(attr(chExt, "cy"));
      const own2 = {
        x: Number(attr(off, "x")),
        y: Number(attr(off, "y")),
        scaleX: cx ? Number(attr(ext, "cx")) / cx : 1,
        scaleY: cy ? Number(attr(ext, "cy")) / cy : 1,
        childX: Number(attr(chOff, "x")),
        childY: Number(attr(chOff, "y"))
      };
      if (!parent)
        return own2;
      return {
        x: parent.x + (own2.x - parent.childX) * parent.scaleX,
        y: parent.y + (own2.y - parent.childY) * parent.scaleY,
        scaleX: own2.scaleX * parent.scaleX,
        scaleY: own2.scaleY * parent.scaleY,
        childX: own2.childX,
        childY: own2.childY
      };
    }
    function shapeBox(sp, frame) {
      const xfrm = elements(sp, "a:xfrm")[0] || elements(sp, "p:xfrm")[0];
      const off = xfrm && elements(xfrm, "a:off")[0];
      const ext = xfrm && elements(xfrm, "a:ext")[0];
      if (!off || !ext)
        return null;
      let x = Number(attr(off, "x"));
      let y = Number(attr(off, "y"));
      let cx = Number(attr(ext, "cx"));
      let cy = Number(attr(ext, "cy"));
      if (frame) {
        x = frame.x + (x - frame.childX) * frame.scaleX;
        y = frame.y + (y - frame.childY) * frame.scaleY;
        cx *= frame.scaleX;
        cy *= frame.scaleY;
      }
      const box = {
        left: emu(x),
        top: emu(y),
        width: emu(cx),
        height: emu(cy),
        // Rotation is in sixtieths of a thousandth of a degree, about the shape's own centre. The
        // off/ext above is the box before it turns, so a quarter-turn shape read flat comes out as a
        // vertical bar where the deck draws a horizontal one.
        rotation: finite(attr(xfrm, "rot")) === null ? 0 : finite(attr(xfrm, "rot")) / 6e4,
        flipH: attr(xfrm, "flipH") === "1",
        flipV: attr(xfrm, "flipV") === "1"
      };
      return box.width === null || box.height === null ? null : box;
    }
    var transform = (box) => [
      box.rotation ? "rotate(" + Math.round(box.rotation * 100) / 100 + "deg)" : "",
      box.flipH ? "scaleX(-1)" : "",
      box.flipV ? "scaleY(-1)" : ""
    ].filter(Boolean).join(" ") || null;
    var boxCss = (box) => ({
      position: "absolute",
      "box-sizing": "border-box",
      left: pt(box.left),
      top: pt(box.top),
      width: pt(box.width),
      height: pt(box.height),
      transform: transform(box)
    });
    var DASH = { dash: "dashed", sysDash: "dashed", lgDash: "dashed", dashDot: "dashed", dot: "dotted", sysDot: "dotted" };
    var END = /* @__PURE__ */ new Set(["triangle", "arrow", "stealth", "diamond", "oval"]);
    var endType = (ln, tag) => {
      const type = attr(elements(ln || "", tag)[0] || "", "type");
      return END.has(type) ? type : null;
    };
    function linePen(spPr, theme, sp) {
      const ln = elements(spPr || "", "a:ln")[0];
      const ref = elements(elements(sp || "", "p:style")[0] || "", "a:lnRef")[0];
      if (!ln && !ref)
        return null;
      if (ln && elements(ln, "a:noFill")[0])
        return null;
      const stroke = ln && solidFill(ln, theme) || fillColour(ref, theme);
      if (!stroke)
        return null;
      const width = emu(attr(ln || "", "w"));
      return {
        width: width === null ? 1 : width,
        colour: stroke,
        dash: DASH[attr(elements(ln || "", "a:prstDash")[0] || "", "val")] || "solid",
        head: endType(ln, "a:headEnd"),
        tail: endType(ln, "a:tailEnd")
      };
    }
    function styleFill(sp, theme) {
      const ref = elements(elements(sp || "", "p:style")[0] || "", "a:fillRef")[0];
      if (!ref || attr(ref, "idx") === "0")
        return null;
      return fillColour(ref, theme);
    }
    function lineCss(spPr, theme, sp) {
      const pen = linePen(spPr, theme, sp);
      return pen ? pt(pen.width) + " " + pen.dash + " " + pen.colour : null;
    }
    function outlineCss(box, line) {
      if (!line)
        return {};
      if (!box.height)
        return { "border-top": line };
      if (!box.width)
        return { "border-left": line };
      return { border: line };
    }
    var ROUND = { ellipse: "50%", circle: "50%" };
    var ROUNDED_RECT = /^round\w*Rect$/;
    var BOXY = /^(?:rect|line|straightConnector\d*)$/;
    var presetOf = (spPr) => attr(elements(spPr || "", "a:prstGeom")[0] || "", "prst");
    var drawsAsBox = (spPr) => {
      const prst = presetOf(spPr);
      return !prst || !!ROUND[prst] || ROUNDED_RECT.test(prst) || BOXY.test(prst);
    };
    function geometryCss(spPr) {
      const prst = presetOf(spPr);
      if (!prst)
        return {};
      if (ROUND[prst])
        return { "border-radius": ROUND[prst] };
      return ROUNDED_RECT.test(prst) ? { "border-radius": "16.7%" } : {};
    }
    var ANGLE = 6e4;
    var adjust = (spPr, name, fallback) => {
      const gd = elements(elements(spPr || "", "a:avLst")[0] || "", "a:gd").find((g) => attr(g, "name") === name);
      const value = gd && /val\s+(-?\d+)/.exec(attr(gd, "fmla") || "");
      return value ? Number(value[1]) / ANGLE : fallback;
    };
    function arcPath(spPr, box) {
      if (presetOf(spPr) !== "arc" || !box.width || !box.height)
        return null;
      const from = adjust(spPr, "adj1", 270);
      const to = adjust(spPr, "adj2", 0);
      const rx = box.width / 2;
      const ry = box.height / 2;
      const at = (deg) => {
        const rad = deg * Math.PI / 180;
        return (rx + rx * Math.cos(rad)).toFixed(2) + "," + (ry + ry * Math.sin(rad)).toFixed(2);
      };
      const swept = ((to - from) % 360 + 360) % 360;
      return {
        width: box.width,
        height: box.height,
        paths: [{ d: "M" + at(from) + "A" + rx + "," + ry + " 0 " + (swept > 180 ? 1 : 0) + " 1 " + at(to), filled: false, stroked: true }]
      };
    }
    var VERB = /<a:(moveTo|lnTo|cubicBezTo|quadBezTo|close)\b(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/a:\1>)/g;
    var CMD = { moveTo: "M", lnTo: "L", cubicBezTo: "C", quadBezTo: "Q" };
    var POINT = /<a:pt\s[^>]*\/>/g;
    function pathD(pathXml) {
      let d = "";
      VERB.lastIndex = 0;
      let verb;
      while (verb = VERB.exec(pathXml)) {
        if (verb[1] === "close") {
          d += "Z";
          continue;
        }
        const points = [];
        POINT.lastIndex = 0;
        let p;
        while (p = POINT.exec(verb[2] || ""))
          points.push(attr(p[0], "x") + "," + attr(p[0], "y"));
        if (points.length)
          d += CMD[verb[1]] + points.join(" ");
      }
      return d;
    }
    function customPaths(spPr) {
      const geom = elements(spPr || "", "a:custGeom")[0];
      if (!geom)
        return null;
      const paths = [];
      let width = 0;
      let height = 0;
      for (const path of elements(elements(geom, "a:pathLst")[0] || "", "a:path")) {
        const d = pathD(path);
        if (!d)
          continue;
        width = width || Number(attr(path, "w")) || 0;
        height = height || Number(attr(path, "h")) || 0;
        paths.push({ d, filled: attr(path, "fill") !== "none", stroked: attr(path, "stroke") !== "0" });
      }
      return paths.length && width && height ? { paths, width, height } : null;
    }
    var EDGE = { "a:lnL": "border-left", "a:lnR": "border-right", "a:lnT": "border-top", "a:lnB": "border-bottom" };
    var CELL_ANCHOR = { t: "top", ctr: "middle", b: "bottom" };
    function cellCss(tcPr, theme) {
      const source = tcPr || "";
      let rest = source;
      const out = {};
      for (const [tag, prop] of Object.entries(EDGE)) {
        for (const ln of elements(source, tag)) {
          rest = rest.replace(ln, "");
          if (elements(ln, "a:noFill")[0])
            continue;
          const width = emu(attr(ln, "w"));
          const line = solidFill(ln, theme);
          if (!line && width === null)
            continue;
          out[prop] = pt(width === null ? 1 : width) + " solid " + (line || "#808080");
        }
      }
      const fill = solidFill(rest, theme);
      if (fill)
        out.background = fill;
      out["vertical-align"] = CELL_ANCHOR[attr(source, "anchor") || "t"] || "top";
      const inset = (name, fallback) => {
        const v = emu(attr(source, name));
        return pt(v === null ? fallback : v);
      };
      out.padding = [inset("marT", 3.6), inset("marR", 7.2), inset("marB", 3.6), inset("marL", 7.2)].join(" ");
      return out;
    }
    function bodyCss(bodyPr) {
      const out = { display: "flex", "flex-direction": "column", overflow: "hidden" };
      out["justify-content"] = ANCHOR[attr(bodyPr || "", "anchor") || "t"] || "flex-start";
      const inset = (name, fallback) => {
        const v = emu(attr(bodyPr || "", name));
        return pt(v === null ? fallback : v);
      };
      out.padding = [inset("tIns", 3.6), inset("rIns", 7.2), inset("bIns", 3.6), inset("lIns", 7.2)].join(" ");
      return out;
    }
    function autofit(bodyPr) {
      const fit = elements(bodyPr || "", "a:normAutofit")[0];
      if (!fit)
        return null;
      const font = finite(attr(fit, "fontScale"));
      const line = finite(attr(fit, "lnSpcReduction"));
      return { font: font === null ? 1 : font / 1e5, line: line === null ? 0 : line / 1e5 };
    }
    function autoNumber(type, n) {
      const alpha = /^alpha(Lc|Uc)/.exec(type || "");
      let body = String(n);
      if (alpha) {
        let out = "";
        for (let i = n; i > 0; i = Math.floor((i - 1) / 26))
          out = String.fromCharCode(64 + (i - 1) % 26 + 1) + out;
        body = alpha[1] === "Uc" ? out : out.toLowerCase();
      }
      const suffix = /ParenBoth$/.test(type) ? [")", "("] : /ParenR$/.test(type) ? [")", ""] : [".", ""];
      return suffix[1] + body + suffix[0];
    }
    function bulletOf(layers, ordinal) {
      for (let i = layers.length - 1; i >= 0; i--) {
        const src = layers[i] || "";
        if (elements(src, "a:buNone")[0])
          return null;
        const ch = elements(src, "a:buChar")[0];
        if (ch)
          return attr(ch, "char") || null;
        const num = elements(src, "a:buAutoNum")[0];
        if (num)
          return autoNumber(attr(num, "type"), (finite(attr(num, "startAt")) || 1) + ordinal);
      }
      return null;
    }
    function hangOf(layers) {
      for (let i = layers.length - 1; i >= 0; i--) {
        const v = emu(own(layers[i], "indent"));
        if (v !== null)
          return v;
      }
      return null;
    }
    function gap(pPr, tag) {
      const el = elements(pPr || "", tag)[0];
      if (!el)
        return null;
      const points = attr(elements(el, "a:spcPts")[0] || "", "val");
      if (points)
        return pt(Number(points) / 100);
      const percent = attr(elements(el, "a:spcPct")[0] || "", "val");
      return percent ? Number(percent) / 1e5 + "em" : null;
    }
    var own = (src, name) => attr(String(src || "").slice(0, String(src || "").indexOf(">") + 1 || void 0), name);
    function paraCss(pPr) {
      const out = {};
      const align = own(pPr, "algn");
      if (align && ALIGN[align])
        out["text-align"] = ALIGN[align];
      const indent = emu(own(pPr, "marL"));
      if (indent !== null)
        out["padding-left"] = pt(indent);
      const spacing = elements(pPr || "", "a:lnSpc")[0];
      const percent = spacing && attr(elements(spacing, "a:spcPct")[0] || "", "val");
      if (percent)
        out["line-height"] = String(Math.round(Number(percent) / 1e5 * 1.2 * 100) / 100);
      const exact = spacing && attr(elements(spacing, "a:spcPts")[0] || "", "val");
      if (exact && !percent)
        out["line-height"] = pt(Number(exact) / 100);
      const before = gap(pPr, "a:spcBef");
      if (before)
        out["margin-top"] = before;
      const after = gap(pPr, "a:spcAft");
      if (after)
        out["margin-bottom"] = after;
      return out;
    }
    function runCss(rPr, theme) {
      const out = {};
      if (!rPr)
        return out;
      const size = hundredths(attr(rPr, "sz"));
      if (size)
        out["font-size"] = pt(size);
      const bold = attr(rPr, "b");
      if (bold !== null)
        out["font-weight"] = bold === "1" ? "bold" : "normal";
      const italic = attr(rPr, "i");
      if (italic !== null)
        out["font-style"] = italic === "1" ? "italic" : "normal";
      const underline = attr(rPr, "u");
      if (underline && underline !== "none")
        out["text-decoration"] = "underline";
      const fg = solidFill(rPr, theme);
      if (fg)
        out.color = fg;
      const face = attr(elements(rPr, "a:latin")[0] || "", "typeface");
      const named = /^\+mj/.test(face || "") ? theme && theme.major : /^\+mn/.test(face || "") ? theme && theme.minor : face;
      const family = fontFamily(named);
      if (family)
        out["font-family"] = family;
      return out;
    }
    var LEVEL = /<a:lvl([1-9])pPr\b[^>]*>([\s\S]*?)<\/a:lvl\1pPr>/g;
    function levelStyles(lstStyle) {
      const out = [];
      if (!lstStyle)
        return out;
      LEVEL.lastIndex = 0;
      let m;
      while (m = LEVEL.exec(lstStyle)) {
        out[Number(m[1]) - 1] = { rPr: elements(m[2], "a:defRPr")[0] || "", pPr: m[0] };
      }
      return out;
    }
    var TITLE_PH = /* @__PURE__ */ new Set(["title", "ctrTitle"]);
    var BODY_PH = /* @__PURE__ */ new Set(["body", "subTitle", "obj", "outline", ""]);
    function masterTextStyles(masterXml) {
      const styles = elements(masterXml || "", "p:txStyles")[0] || "";
      return {
        title: levelStyles(elements(styles, "p:titleStyle")[0]),
        body: levelStyles(elements(styles, "p:bodyStyle")[0]),
        other: levelStyles(elements(styles, "p:otherStyle")[0])
      };
    }
    var kindOf = (phType) => TITLE_PH.has(phType) ? "title" : BODY_PH.has(phType) ? "body" : "other";
    function inherited(sources, level, kind, masterStyles, part) {
      const layers = [];
      const at = (levels) => levels && (levels[level] || levels[0]);
      const fromMaster = at(masterStyles && masterStyles[kind]);
      if (fromMaster)
        layers.push(fromMaster[part]);
      for (const source of sources) {
        const level0 = at(Array.isArray(source) ? source : levelStyles(source));
        if (level0)
          layers.push(level0[part]);
      }
      return layers;
    }
    var inheritedRun = (sources, level, kind, masterStyles) => inherited(sources, level, kind, masterStyles, "rPr");
    var inheritedPara = (sources, level, kind, masterStyles) => inherited(sources, level, kind, masterStyles, "pPr");
    function slideSize(presentationXml) {
      const size = elements(presentationXml || "", "p:sldSz")[0];
      if (!size)
        return null;
      const width = emu(attr(size, "cx"));
      const height = emu(attr(size, "cy"));
      return width && height ? { width, height } : null;
    }
    module2.exports = {
      emu,
      hundredths,
      readTheme,
      fillColour,
      solidFill,
      groupFrame,
      shapeBox,
      boxCss,
      linePen,
      lineCss,
      styleFill,
      outlineCss,
      geometryCss,
      drawsAsBox,
      customPaths,
      arcPath,
      pathD,
      bodyCss,
      cellCss,
      paraCss,
      runCss,
      slideSize,
      levelStyles,
      masterTextStyles,
      kindOf,
      inheritedRun,
      inheritedPara,
      autofit,
      autoNumber,
      bulletOf,
      hangOf
    };
  }
});

// src/formats/pptx.js
var require_pptx = __commonJS({
  "src/formats/pptx.js"(exports2, module2) {
    "use strict";
    var { openZip } = require_zip();
    var { elements, elementsOf, attr, textIn } = require_xml();
    var { renderLines, renderFrame } = require_preview();
    var { clampPosition, normPath, assetSrc, escAttr, escHtml } = require_util();
    var { sheet: cssSheet, pt } = require_css();
    var pptxStyles = require_pptx_styles();
    var SLIDE_RE = /^ppt\/slides\/slide(\d+)\.xml$/;
    var TITLE_PH = /* @__PURE__ */ new Set(["title", "ctrTitle"]);
    var resolveTarget = (target) => normPath("ppt/" + String(target).replace(/^\/+/, ""));
    function slideParts(zip) {
      const pres = zip.text("ppt/presentation.xml");
      const rels = zip.text("ppt/_rels/presentation.xml.rels");
      if (pres && rels) {
        const targets = /* @__PURE__ */ new Map();
        for (const r of elements(rels, "Relationship")) {
          const id = attr(r, "Id");
          const tgt = attr(r, "Target");
          if (id && tgt)
            targets.set(id, resolveTarget(tgt));
        }
        const lst = elements(pres, "p:sldIdLst")[0];
        if (lst) {
          const out = [];
          for (const s of elements(lst, "p:sldId")) {
            const tgt = targets.get(attr(s, "r:id"));
            if (tgt && zip.has(tgt))
              out.push(tgt);
          }
          if (out.length)
            return out;
        }
      }
      return zip.names().filter((n) => SLIDE_RE.test(n)).sort((a, b) => Number(SLIDE_RE.exec(a)[1]) - Number(SLIDE_RE.exec(b)[1]));
    }
    var BR = /<a:br(?:\s[^>]*)?\/>|<a:br(?:\s[^>]*)?>[\s\S]*?<\/a:br>/;
    var paragraphs = (source) => elements(source, "a:p").flatMap((p) => p.split(BR)).map((chunk) => textIn(chunk, "a:t").replace(/\s+/g, " ").trim()).filter(Boolean);
    function shapeIsTitle(sp) {
      const ph = elements(elements(sp, "p:nvSpPr")[0] || "", "p:ph")[0];
      return !!ph && TITLE_PH.has(attr(ph, "type") || "");
    }
    function slideTitle(xml) {
      for (const sp of elements(xml, "p:sp")) {
        if (!shapeIsTitle(sp))
          continue;
        const text = paragraphs(sp).join(" ");
        if (text)
          return text;
      }
      return paragraphs(xml)[0] || "";
    }
    function slideText(xml) {
      const title = slideTitle(xml);
      const body = [];
      for (const sp of elements(xml, "p:sp")) {
        if (shapeIsTitle(sp))
          continue;
        for (const line of paragraphs(sp))
          if (line !== title)
            body.push(line);
      }
      return { title, body };
    }
    function readSlides(absPath) {
      const zip = openZip(absPath);
      if (!zip)
        return null;
      const parts = slideParts(zip);
      if (!parts.length)
        return null;
      return { zip, parts };
    }
    async function readOutline(absPath) {
      const doc = readSlides(absPath);
      if (!doc)
        return [];
      const out = [];
      doc.parts.forEach((part, i) => {
        const xml = doc.zip.text(part);
        if (!xml)
          return;
        const title = slideTitle(xml);
        if (title)
          out.push({ title, position: i + 1 });
      });
      return out;
    }
    async function readSlide(absPath, position) {
      const doc = readSlides(absPath);
      if (!doc)
        return null;
      const n = clampPosition(position, doc.parts.length);
      const xml = doc.zip.text(doc.parts[n - 1]);
      if (!xml)
        return null;
      return { ...slideText(xml), position: n, total: doc.parts.length };
    }
    var innerXml = (src) => {
      const open = src.indexOf(">");
      const close = src.lastIndexOf("</");
      return open < 0 || close <= open ? "" : src.slice(open + 1, close);
    };
    var phKey = (sp) => {
      const ph = elements(elements(sp, "p:nvSpPr")[0] || "", "p:ph")[0];
      return ph ? (attr(ph, "type") || "body") + "#" + (attr(ph, "idx") || "0") : null;
    };
    function layoutBoxes(...sources) {
      const out = /* @__PURE__ */ new Map();
      for (const source of sources) {
        for (const sp of elements(source || "", "p:sp")) {
          const key = phKey(sp);
          if (!key)
            continue;
          const previous = out.get(key) || {};
          out.set(key, {
            box: pptxStyles.shapeBox(sp) || previous.box,
            lstStyle: elements(sp, "a:lstStyle")[0] || previous.lstStyle || ""
          });
        }
      }
      return out;
    }
    var phType = (sp) => {
      const ph = elements(elements(sp, "p:nvSpPr")[0] || "", "p:ph")[0];
      return ph ? attr(ph, "type") || "" : null;
    };
    function chainOf(sp, ctx) {
      const type = phType(sp);
      const key = phKey(sp);
      const layout = key && ctx.layout.get(key) || {};
      return {
        sources: [layout.lstStyle || "", elements(sp, "a:lstStyle")[0] || ""].filter(Boolean).map(pptxStyles.levelStyles),
        kind: type === null ? "other" : pptxStyles.kindOf(type),
        fit: pptxStyles.autofit(elements(sp, "a:bodyPr")[0])
      };
    }
    var scaled = (size, factor) => {
      const n = parseFloat(size);
      return Number.isFinite(n) ? pt(Math.round(n * factor * 100) / 100) : size;
    };
    function runStyle(chain, run, level, ctx) {
      const out = Object.assign(
        {},
        ...pptxStyles.inheritedRun(chain.sources, level, chain.kind, ctx.master).map((rPr) => pptxStyles.runCss(rPr, ctx.theme)),
        pptxStyles.runCss(elements(run, "a:rPr")[0], ctx.theme)
      );
      const { fit } = chain;
      if (fit && fit.font !== 1 && out["font-size"])
        out["font-size"] = scaled(out["font-size"], fit.font);
      return out;
    }
    var paraLayers = (chain, para, level, ctx) => pptxStyles.inheritedPara(chain.sources, level, chain.kind, ctx.master).concat(para || "");
    function paraStyle(chain, layers, hang) {
      const out = Object.assign({ "margin-top": "0", "margin-bottom": "0" }, ...layers.map(pptxStyles.paraCss));
      if (hang)
        out["text-indent"] = pt(hang);
      const { fit } = chain;
      if (fit && fit.line)
        out["line-height"] = String(Math.round((Number(out["line-height"]) || 1.2) * (1 - fit.line) * 100) / 100);
      return out;
    }
    function bulletHtml(text, hang, ctx) {
      const cls = hang && hang < 0 ? ctx.sheet.cls({ display: "inline-block", width: pt(-hang) }) : "";
      return "<span" + (cls ? ' class="' + cls + '"' : "") + ">" + escHtml(text) + (cls ? "" : "\xA0") + "</span>";
    }
    function textHtml(sp, ctx) {
      const body = elements(sp, "p:txBody")[0] || elements(sp, "a:txBody")[0];
      if (!body)
        return "";
      let html = "";
      const seen = /* @__PURE__ */ new Map();
      const chain = chainOf(sp, ctx);
      for (const p of elements(body, "a:p")) {
        const para = elements(p, "a:pPr")[0];
        const level = Number(attr(para || "", "lvl") || "0") || 0;
        const runs = elementsOf(p, ["a:br", "a:r"]).map(({ tag, xml }) => {
          if (tag === "a:br")
            return "<br>";
          const cls2 = ctx.sheet.cls(runStyle(chain, xml, level, ctx));
          const text = escHtml(textIn(xml, "a:t"));
          return cls2 ? '<span class="' + cls2 + '">' + text + "</span>" : text;
        }).join("");
        if (!runs)
          continue;
        const layers = paraLayers(chain, para, level, ctx);
        const bullet = pptxStyles.bulletOf(layers, seen.get(level) || 0);
        if (bullet !== null)
          seen.set(level, (seen.get(level) || 0) + 1);
        const hang = bullet === null ? null : pptxStyles.hangOf(layers);
        const cls = ctx.sheet.cls(paraStyle(chain, layers, hang));
        html += "<p" + (cls ? ' class="' + cls + '"' : "") + ">" + (bullet === null ? "" : bulletHtml(bullet, hang, ctx)) + runs + "</p>";
      }
      return html;
    }
    function pictureHtml(pic, ctx, frame) {
      const box = pptxStyles.shapeBox(pic, frame);
      const src = ctx.images.get(attr(elements(pic, "a:blip")[0] || "", "r:embed"));
      if (!box || !src)
        return "";
      const cls = ctx.sheet.cls(Object.assign(pptxStyles.boxCss(box), { "object-fit": "contain" }));
      return '<img class="' + cls + '" src="' + escAttr(src) + '">';
    }
    var MARKER = {
      triangle: "M0,0 L10,5 L0,10 z",
      arrow: "M0,0 L10,5 L0,10 z",
      stealth: "M0,0 L10,5 L0,10 L3,5 z",
      diamond: "M0,5 L5,0 L10,5 L5,10 z",
      oval: "M0,5 a5,5 0 1,0 10,0 a5,5 0 1,0 -10,0"
    };
    var markerSeq = 0;
    function customHtml(drawn, box, fill, pen) {
      const ends = pen && [pen.head && ["start", pen.head], pen.tail && ["end", pen.tail]].filter(Boolean);
      const ids = /* @__PURE__ */ new Map();
      const defs = !ends || !ends.length ? "" : "<defs>" + ends.map(([where, type]) => {
        const id = "m" + (markerSeq += 1);
        ids.set(where, id);
        return '<marker id="' + id + '" viewBox="0 0 10 10" refX="' + (where === "start" ? 0 : 10) + '" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="' + MARKER[type] + '" fill="' + pen.colour + '"/></marker>';
      }).join("") + "</defs>";
      const marker = (where) => ids.has(where) ? " marker-" + where + '="url(#' + ids.get(where) + ')"' : "";
      const paint = (path) => (path.filled && fill ? ' fill="' + escAttr(fill) + '"' : ' fill="none"') + (path.stroked && pen ? ' stroke="' + escAttr(pen.colour) + '" style="stroke-width:' + pt(pen.width) + '" vector-effect="non-scaling-stroke"' + marker("start") + marker("end") : "");
      return '<svg viewBox="0 0 ' + drawn.width + " " + drawn.height + '" preserveAspectRatio="none">' + defs + drawn.paths.map((p) => '<path d="' + p.d + '"' + paint(p) + "/>").join("") + "</svg>";
    }
    function shapeHtml(sp, ctx, frame) {
      const box = pptxStyles.shapeBox(sp, frame) || !frame && (ctx.layout.get(phKey(sp)) || {}).box;
      if (!box)
        return "";
      const inner = textHtml(sp, ctx);
      const spPr = elements(sp, "p:spPr")[0] || "";
      const outline = elements(spPr, "a:ln")[0];
      const pen = pptxStyles.linePen(spPr, ctx.theme, sp);
      const bare = outline ? spPr.replace(outline, "") : spPr;
      const fill = elements(bare, "a:noFill")[0] ? null : pptxStyles.solidFill(bare, ctx.theme) || pptxStyles.styleFill(sp, ctx.theme);
      const drawn = pptxStyles.customPaths(spPr) || pptxStyles.arcPath(spPr, box);
      const boxy = pptxStyles.drawsAsBox(spPr);
      if (!inner && !drawn && !(boxy && (fill || pen)))
        return "";
      const css = Object.assign(pptxStyles.boxCss(box), pptxStyles.bodyCss(elements(sp, "a:bodyPr")[0]));
      if (drawn)
        Object.assign(css, { padding: "0" });
      else if (boxy) {
        Object.assign(css, pptxStyles.geometryCss(spPr), pptxStyles.outlineCss(box, pptxStyles.lineCss(spPr, ctx.theme, sp)));
        if (fill)
          css.background = fill;
      }
      const body = drawn ? customHtml(drawn, box, fill, pen) + inner : inner;
      return '<div class="' + ctx.sheet.cls(css) + '">' + body + "</div>";
    }
    function tableHtml(graphicFrame, ctx, frame) {
      const tbl = elements(graphicFrame, "a:tbl")[0];
      const box = pptxStyles.shapeBox(graphicFrame, frame);
      if (!tbl || !box)
        return "";
      const widths = elements(elements(tbl, "a:tblGrid")[0] || "", "a:gridCol").map((col) => pptxStyles.emu(attr(col, "w")));
      const group = "<colgroup>" + widths.map((w) => "<col" + (w ? ' style="width:' + pt(w) + '"' : "") + ">").join("") + "</colgroup>";
      const rows = elements(tbl, "a:tr").map((tr) => {
        const cells = elements(tr, "a:tc").map((tc) => {
          if (attr(tc, "hMerge") === "1" || attr(tc, "vMerge") === "1")
            return "";
          const span = Number(attr(tc, "gridSpan") || "1") || 1;
          const down = Number(attr(tc, "rowSpan") || "1") || 1;
          const cls = ctx.sheet.cls(pptxStyles.cellCss(elements(tc, "a:tcPr")[0], ctx.theme));
          return "<td" + (span > 1 ? ' colspan="' + span + '"' : "") + (down > 1 ? ' rowspan="' + down + '"' : "") + ' class="' + cls + '">' + textHtml(tc, ctx) + "</td>";
        }).join("");
        const height = pptxStyles.emu(attr(tr, "h"));
        return cells ? "<tr" + (height ? ' class="' + ctx.sheet.cls({ height: pt(height) }) + '"' : "") + ">" + cells + "</tr>" : "";
      }).filter(Boolean).join("");
      if (!rows)
        return "";
      return '<div class="' + ctx.sheet.cls(pptxStyles.boxCss(box)) + '"><table>' + group + rows + "</table></div>";
    }
    function shapesHtml(source, ctx, frame) {
      const spans = [];
      for (const tag of ["p:sp", "p:cxnSp", "p:pic", "p:grpSp", "p:graphicFrame"]) {
        let at = 0;
        for (const src of elements(source, tag)) {
          const from = source.indexOf(src, at);
          if (from < 0)
            continue;
          spans.push({ from, to: from + src.length, tag, src });
          at = from + src.length;
        }
      }
      spans.sort((a, b) => a.from - b.from || b.to - a.to);
      let end = -1;
      let html = "";
      for (const s of spans) {
        if (s.from < end)
          continue;
        end = s.to;
        if (s.tag === "p:grpSp")
          html += shapesHtml(innerXml(s.src), ctx, pptxStyles.groupFrame(s.src, frame));
        else if (s.tag === "p:pic")
          html += pictureHtml(s.src, ctx, frame);
        else if (s.tag === "p:graphicFrame")
          html += tableHtml(s.src, ctx, frame);
        else
          html += shapeHtml(s.src, ctx, frame);
      }
      return html;
    }
    var SLIDE_RULES = [
      "body{margin:0;background:transparent}",
      ".slide{position:relative;overflow:hidden;background:#ffffff;color:#1a1a1a;margin:0 auto;box-shadow:0 0 0 1pt rgba(0,0,0,.15)}",
      // Only display — a picture's size is the box the slide gives it, and `.slide img` outranks
      // the class that box is written on, so anything more here overrides the placement.
      ".slide img{display:block}",
      // Nothing here that a cell's own class also states, for that same reason: `.slide td` would
      // outrank it. The table fills the box its frame was given.
      ".slide table{border-collapse:collapse;table-layout:fixed;width:100%;height:100%}",
      ".slide svg{display:block;width:100%;height:100%;overflow:visible}"
    ].join("\n");
    var decorationOnly = (source) => {
      let html = source || "";
      for (const sp of elements(html, "p:sp")) {
        if (elements(elements(sp, "p:nvSpPr")[0] || "", "p:ph")[0])
          html = html.replace(sp, "");
      }
      return html;
    };
    function backgroundCss(sources, theme) {
      for (const source of sources) {
        const bg = elements(source || "", "p:bg")[0];
        if (!bg)
          continue;
        const fill = pptxStyles.solidFill(elements(bg, "p:bgPr")[0] || "", theme) || pptxStyles.fillColour(elements(bg, "p:bgRef")[0], theme);
        if (fill)
          return fill;
      }
      return null;
    }
    function slidePage(zip, part, width) {
      const xml = zip.text(part);
      if (!xml)
        return null;
      const size = pptxStyles.slideSize(zip.text("ppt/presentation.xml"));
      if (!size)
        return null;
      const layoutPart = layoutPartOf(zip, part);
      const layoutXml = layoutPart && zip.text(layoutPart) || "";
      const masterPart = masterPartOf(zip, layoutPart);
      const masterXml = masterPart && zip.text(masterPart) || "";
      const theme = pptxStyles.readTheme(zip.text(themePartOf(zip, masterPart)), masterXml);
      const ctx = {
        theme,
        layout: layoutBoxes(masterXml, layoutXml),
        master: pptxStyles.masterTextStyles(masterXml),
        images: partImages(zip, part),
        sheet: cssSheet("s")
      };
      const under = [];
      const inherits = (source) => attr(source, "showMasterSp") !== "0";
      if (masterXml && inherits(layoutXml) && inherits(xml)) {
        under.push(shapesHtml(decorationOnly(masterXml), { ...ctx, images: partImages(zip, masterPart) }, null));
      }
      if (layoutXml && inherits(xml)) {
        under.push(shapesHtml(decorationOnly(layoutXml), { ...ctx, images: partImages(zip, layoutPart) }, null));
      }
      const background = backgroundCss([xml, layoutXml, masterXml], theme);
      const zoom = Math.min(1, width / (size.width * (96 / 72)));
      return {
        html: '<div class="slide">' + under.join("") + shapesHtml(xml, ctx, null) + "</div>",
        css: [
          SLIDE_RULES,
          ".slide{width:" + pt(size.width) + ";height:" + pt(size.height) + (background ? ";background:" + background : "") + "}",
          "html{zoom:" + zoom + "}",
          ctx.sheet.text()
        ].join("\n")
      };
    }
    function partImages(zip, part) {
      const out = /* @__PURE__ */ new Map();
      if (!part)
        return out;
      const folder = part.slice(0, part.lastIndexOf("/"));
      const rels = zip.text(folder + "/_rels/" + part.slice(part.lastIndexOf("/") + 1) + ".rels") || "";
      for (const r of elements(rels, "Relationship")) {
        const id = attr(r, "Id");
        const target = attr(r, "Target") || "";
        if (id && /media\//.test(target))
          out.set(id, normPath(folder + "/" + target));
      }
      return out;
    }
    function relatedPart(zip, part, pattern) {
      if (!part)
        return null;
      const folder = part.slice(0, part.lastIndexOf("/"));
      const rels = zip.text(folder + "/_rels/" + part.slice(part.lastIndexOf("/") + 1) + ".rels") || "";
      for (const r of elements(rels, "Relationship")) {
        const target = attr(r, "Target") || "";
        if (pattern.test(target)) {
          const resolved = normPath(folder + "/" + target);
          if (zip.has(resolved))
            return resolved;
        }
      }
      return null;
    }
    var layoutPartOf = (zip, slidePart) => relatedPart(zip, slidePart, /slideLayout\d+\.xml$/);
    var masterPartOf = (zip, layoutPart) => relatedPart(zip, layoutPart, /slideMaster\d+\.xml$/);
    var themePartOf = (zip, masterPart) => relatedPart(zip, masterPart, /theme\d+\.xml$/) || "ppt/theme/theme1.xml";
    async function render(el, req) {
      const doc = readSlides(req.abs);
      if (!req.isCurrent() || !doc)
        return false;
      const n = clampPosition(req.position, doc.parts.length);
      const page = slidePage(doc.zip, doc.parts[n - 1], req.width);
      if (page) {
        const loadImage = (src) => doc.zip.read(assetSrc(src));
        const framed = renderFrame(el, {
          html: page.html,
          css: page.css,
          width: req.width,
          loadImage,
          onFail: () => {
            const slide2 = slideText(doc.zip.text(doc.parts[n - 1]) || "");
            renderLines(el, { title: slide2.title, body: slide2.body, width: req.width });
          }
        });
        if (framed !== false)
          return framed;
      }
      const slide = await readSlide(req.abs, req.position);
      if (!req.isCurrent() || !slide)
        return false;
      return renderLines(el, { title: slide.title, body: slide.body, width: req.width });
    }
    module2.exports = {
      id: "pptx",
      exts: ["pptx", "pptm", "potx", "potm"],
      anchorKind: null,
      // PowerPoint takes a fragment as part of the file name and finds nothing
      outline: readOutline,
      render,
      readOutline,
      readSlide,
      slidePage,
      layoutBoxes,
      shapesHtml
    };
  }
});

// src/formats/html.js
var require_html = __commonJS({
  "src/formats/html.js"(exports2, module2) {
    "use strict";
    var fs2 = require("fs");
    var nodePath2 = require("path");
    var { decodeEntities } = require_xml();
    var { renderLines, renderHtml, renderFrame } = require_preview();
    var { clampPosition, assetSrc, sectionEnd } = require_util();
    function assetLoader(htmlAbs) {
      const dir = nodePath2.dirname(htmlAbs);
      return (src) => {
        const abs = nodePath2.resolve(dir, assetSrc(src));
        if (abs !== dir && !abs.startsWith(dir + nodePath2.sep))
          return null;
        return fs2.readFileSync(abs);
      };
    }
    var HEADING = /<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1\s*>/gi;
    var ID_ATTR = /\b(?:id|name)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+))/i;
    var DROP = /<(script|style|template)\b[\s\S]*?<\/\1\s*>/gi;
    var BLOCK_END = /<\/(?:p|div|li|tr|dt|dd|h[1-6]|pre|blockquote|section|article|table)\s*>/gi;
    var MAX_LINES = 40;
    var read = (absPath) => {
      try {
        return fs2.readFileSync(absPath, "utf8");
      } catch (e) {
        return null;
      }
    };
    var inlineText = (fragment) => decodeEntities(fragment.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
    function blockLines(fragment) {
      const flat = fragment.replace(DROP, "").replace(/<br\s*\/?>/gi, "\n").replace(BLOCK_END, "\n").replace(/<[^>]*>/g, "");
      return decodeEntities(flat).split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()).filter(Boolean);
    }
    function idOf(attrs, inner) {
      const own = ID_ATTR.exec(attrs);
      if (own)
        return own[1] || own[2] || own[3] || null;
      const child = /<a\b([^>]*)>/i.exec(inner);
      if (!child)
        return null;
      const m = ID_ATTR.exec(child[1]);
      return m ? m[1] || m[2] || m[3] || null : null;
    }
    function headings(html) {
      const out = [];
      let m;
      HEADING.lastIndex = 0;
      while (m = HEADING.exec(html)) {
        const title = inlineText(m[3]);
        if (title)
          out.push({ title, level: Number(m[1]), anchor: idOf(m[2], m[3]), from: m.index, to: HEADING.lastIndex });
      }
      return out;
    }
    async function readOutline(absPath) {
      const html = read(absPath);
      if (!html)
        return [];
      return headings(html).map((h, i) => ({ title: h.title, position: i + 1, anchor: h.anchor || void 0 }));
    }
    async function readSection(absPath, position) {
      const html = read(absPath);
      if (!html)
        return null;
      const hs = headings(html);
      if (!hs.length)
        return { title: "", body: blockLines(html).slice(0, MAX_LINES), position: 1, total: 1 };
      const n = clampPosition(position, hs.length);
      const here = hs[n - 1];
      const end = sectionEnd(hs, n, html.length);
      const body = blockLines(html.slice(here.to, end));
      return { title: here.title, body: body.slice(0, MAX_LINES), raw: html.slice(here.from, end), css: styleText(html), position: n, total: hs.length };
    }
    var styleText = (html) => {
      const out = [];
      const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
      let m;
      while (m = re.exec(html))
        out.push(m[1]);
      return out.join("\n");
    };
    async function render(el, req) {
      const sec = await readSection(req.abs, req.position);
      if (!req.isCurrent() || !sec)
        return false;
      if (sec.raw) {
        const body = sec.raw.replace(DROP, "");
        const load = assetLoader(req.abs);
        const themed = () => renderHtml(el, { html: body, css: sec.css, width: req.width, loadImage: load });
        if (sec.css) {
          const framed = renderFrame(el, { html: body, css: sec.css, width: req.width, loadImage: load, onFail: themed });
          if (framed !== false)
            return framed;
        }
        const done = themed();
        if (done !== false)
          return done;
      }
      return renderLines(el, { title: sec.title, body: sec.body, width: req.width });
    }
    module2.exports = {
      id: "html",
      // EPUB content is XHTML, so it reads its chapters with these rather than its own copy.
      blockLines,
      inlineText,
      decodeEntities,
      assetLoader,
      exts: ["html", "htm", "xhtml"],
      anchorKind: "id",
      anchorFor: (e) => e.kind === "section" && e.anchor ? e.anchor : null,
      outline: readOutline,
      render,
      readOutline,
      readSection
    };
  }
});

// src/formats/text.js
var require_text = __commonJS({
  "src/formats/text.js"(exports2, module2) {
    "use strict";
    var fs2 = require("fs");
    var { isFenceLine } = require_markdown();
    var { renderLines, renderMarkdown } = require_preview();
    var { assetLoader } = require_html();
    var { clampPosition } = require_util();
    var ATX = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
    var SETEXT = /^(=+|-{2,})\s*$/;
    var MAX_LINES = 60;
    function readLines(absPath) {
      try {
        return fs2.readFileSync(absPath, "utf8").replace(/^﻿/, "").split(/\r?\n/);
      } catch (e) {
        return null;
      }
    }
    function headings(lines) {
      const out = [];
      let fenced = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (isFenceLine(line)) {
          fenced = !fenced;
          continue;
        }
        if (fenced)
          continue;
        const atx = ATX.exec(line);
        if (atx) {
          out.push({ title: atx[2].trim(), position: i + 1 });
          continue;
        }
        if (SETEXT.test(line) && i > 0) {
          const above = lines[i - 1].trim();
          if (above && !ATX.test(above) && !isFenceLine(above))
            out.push({ title: above, position: i });
        }
      }
      return out;
    }
    async function readOutline(absPath) {
      const lines = readLines(absPath);
      return lines ? headings(lines) : [];
    }
    async function readSection(absPath, position) {
      const lines = readLines(absPath);
      if (!lines)
        return null;
      const hs = headings(lines);
      if (!hs.length) {
        return { title: "", body: lines.map((l) => l.trimEnd()).filter(Boolean).slice(0, MAX_LINES), position: 1, total: 1 };
      }
      const n = clampPosition(position, lines.length);
      let at = hs.findIndex((h) => h.position === n);
      if (at < 0)
        at = 0;
      const here = hs[at];
      const next = hs[at + 1];
      const slice = lines.slice(here.position, next ? next.position - 1 : lines.length).map((l) => l.trimEnd());
      const body = slice.filter(Boolean);
      return {
        title: here.title,
        body: body.slice(0, MAX_LINES),
        raw: slice.slice(0, MAX_LINES).join("\n"),
        position: here.position,
        total: hs.length
      };
    }
    var MARKDOWN = /* @__PURE__ */ new Set(["md", "markdown"]);
    async function render(el, req) {
      const sec = await readSection(req.abs, req.position);
      if (!req.isCurrent() || !sec)
        return false;
      if (MARKDOWN.has(req.ext) && sec.raw !== void 0) {
        const md = (sec.title ? "## " + sec.title + "\n\n" : "") + sec.raw;
        const done = await renderMarkdown(el, {
          markdown: md,
          width: req.width,
          app: req.app,
          component: req.component,
          loadImage: assetLoader(req.abs)
        });
        if (done !== false)
          return done;
      }
      return renderLines(el, { title: sec.title, body: sec.body, width: req.width });
    }
    module2.exports = {
      id: "text",
      exts: ["md", "markdown", "txt", "text", "log"],
      anchorKind: null,
      // no viewer honours a position in a text file
      outline: readOutline,
      render,
      readOutline,
      readSection
    };
  }
});

// src/formats/epub.js
var require_epub = __commonJS({
  "src/formats/epub.js"(exports2, module2) {
    "use strict";
    var { openZip } = require_zip();
    var { elements, attr, textIn } = require_xml();
    var { blockLines, inlineText } = require_html();
    var { renderLines, renderHtml } = require_preview();
    var { clampPosition, normPath, assetSrc } = require_util();
    var MAX_LINES = 60;
    var resolve = (base, href) => normPath((base ? base.split("/").slice(0, -1).join("/") + "/" : "") + href);
    var dropFragment = (href) => String(href).split("#")[0];
    function opfPath(zip) {
      const container = zip.text("META-INF/container.xml");
      if (!container)
        return null;
      for (const r of elements(container, "rootfile")) {
        const p = attr(r, "full-path");
        if (p && zip.has(p))
          return p;
      }
      return null;
    }
    function readSpine(zip, opf, xml) {
      const items = /* @__PURE__ */ new Map();
      const manifest = elements(xml, "manifest")[0] || "";
      for (const it of elements(manifest, "item")) {
        const id = attr(it, "id");
        const href = attr(it, "href");
        if (id && href)
          items.set(id, { path: resolve(opf, dropFragment(href)), props: attr(it, "properties") || "" });
      }
      const spine = elements(xml, "spine")[0] || "";
      const order = [];
      for (const ref of elements(spine, "itemref")) {
        const hit = items.get(attr(ref, "idref"));
        if (hit && zip.has(hit.path))
          order.push(hit.path);
      }
      return { items, order, tocId: attr(spine, "toc") };
    }
    function readToc(zip, spine) {
      const nav = [...spine.items.values()].find((i) => /\bnav\b/.test(i.props));
      if (nav) {
        const doc = zip.text(nav.path);
        const out = doc ? tocFromNav(doc, nav.path) : [];
        if (out.length)
          return out;
      }
      const ncx = spine.tocId && spine.items.get(spine.tocId);
      if (ncx) {
        const doc = zip.text(ncx.path);
        if (doc)
          return tocFromNcx(doc, ncx.path);
      }
      return [];
    }
    function tocFromNav(doc, base) {
      const toc = elements(doc, "nav").find((n) => /toc/i.test(attr(n, "epub:type") || attr(n, "type") || "")) || elements(doc, "nav")[0];
      if (!toc)
        return [];
      const out = [];
      for (const a of elements(toc, "a")) {
        const href = attr(a, "href");
        const title = inlineText(a);
        if (href && title)
          out.push({ title, path: resolve(base, dropFragment(href)) });
      }
      return out;
    }
    function tocFromNcx(doc, base) {
      const out = [];
      for (const p of elements(doc, "navPoint")) {
        const title = textIn(elements(p, "navLabel")[0] || "", "text").replace(/\s+/g, " ").trim();
        const content = elements(p, "content")[0];
        const src = content && attr(content, "src");
        if (title && src)
          out.push({ title, path: resolve(base, dropFragment(src)) });
      }
      return out;
    }
    function open(absPath) {
      const zip = openZip(absPath);
      if (!zip)
        return null;
      const opf = opfPath(zip);
      const xml = opf && zip.text(opf);
      if (!xml)
        return null;
      const spine = readSpine(zip, opf, xml);
      if (!spine.order.length)
        return null;
      return { zip, opf, spine };
    }
    async function readOutline(absPath) {
      const doc = open(absPath);
      if (!doc)
        return [];
      const at = new Map(doc.spine.order.map((p, i) => [p, i + 1]));
      const out = [];
      const seen = /* @__PURE__ */ new Set();
      for (const entry of readToc(doc.zip, doc.spine)) {
        const position = at.get(entry.path);
        if (!position || seen.has(entry.title + "|" + position))
          continue;
        seen.add(entry.title + "|" + position);
        out.push({ title: entry.title, position });
      }
      return out;
    }
    function chapterAt(doc, position) {
      const n = clampPosition(position, doc.spine.order.length);
      const path = doc.spine.order[n - 1];
      const xhtml = doc.zip.text(path);
      if (!xhtml)
        return null;
      const body = elements(xhtml, "body")[0] || xhtml;
      const lines = blockLines(body);
      return { title: lines[0] || "", body: lines.slice(1, MAX_LINES), raw: body, path, position: n, total: doc.spine.order.length };
    }
    async function readChapter(absPath, position) {
      const doc = open(absPath);
      return doc ? chapterAt(doc, position) : null;
    }
    async function render(el, req) {
      const doc = open(req.abs);
      const ch = doc && chapterAt(doc, req.position);
      if (!req.isCurrent() || !ch)
        return false;
      if (ch.raw) {
        const done = renderHtml(el, { html: ch.raw, width: req.width, loadImage: imageLoader(doc, ch.path) });
        if (done !== false)
          return done;
      }
      return renderLines(el, { title: ch.title, body: ch.body, width: req.width });
    }
    var imageLoader = (doc, chapterPath) => (src) => doc.zip.read(resolve(chapterPath, assetSrc(src)));
    module2.exports = {
      id: "epub",
      exts: ["epub"],
      anchorKind: null,
      // an e-reader takes the file and ignores the fragment
      outline: readOutline,
      render,
      readOutline,
      readChapter,
      open,
      imageLoader
    };
  }
});

// src/formats/media.js
var require_media = __commonJS({
  "src/formats/media.js"(exports2, module2) {
    "use strict";
    var fs2 = require("fs");
    var nodePath2 = require("path");
    var VIDEO = { mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mkv: "video/x-matroska", mov: "video/quicktime", ogv: "video/ogg" };
    var AUDIO = { mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", flac: "audio/flac", ogg: "audio/ogg", opus: "audio/ogg", aac: "audio/aac" };
    var BLOB_LIMIT = 96 * 1024 * 1024;
    var fileUrl = (abs) => "file:///" + encodeURI(abs.split(nodePath2.sep).join("/").replace(/^\/+/, "")).replace(/#/g, "%23").replace(/\?/g, "%3F");
    function blobFallback(el, abs, ext) {
      let size = 0;
      try {
        size = fs2.statSync(abs).size;
      } catch (e) {
        return "";
      }
      if (size > BLOB_LIMIT)
        return "";
      let buf;
      try {
        buf = fs2.readFileSync(abs);
      } catch (e) {
        return "";
      }
      const url = URL.createObjectURL(new Blob([buf], { type: VIDEO[ext] || AUDIO[ext] || "application/octet-stream" }));
      el.src = url;
      return url;
    }
    async function render(el, req) {
      if (!fs2.existsSync(req.abs))
        return false;
      const isVideo = !!VIDEO[req.ext];
      const media = el.createEl(isVideo ? "video" : "audio");
      media.controls = true;
      media.preload = "metadata";
      media.style.width = req.width + "px";
      media.style.maxWidth = "100%";
      const at = Math.max(0, (req.position | 0) - (req.position > 1 ? 0 : 1));
      const seek = () => {
        try {
          if (at > 0)
            media.currentTime = at;
        } catch (e) {
        }
      };
      media.addEventListener("loadedmetadata", seek, { once: true });
      let blobUrl = "";
      let disposed = false;
      const dispose = () => {
        disposed = true;
        if (blobUrl) {
          try {
            URL.revokeObjectURL(blobUrl);
          } catch (e) {
          }
          blobUrl = "";
        }
        try {
          media.removeAttribute("src");
        } catch (e) {
        }
      };
      media.addEventListener("error", () => {
        if (disposed || blobUrl)
          return;
        blobUrl = blobFallback(media, req.abs, req.ext);
        if (blobUrl)
          media.addEventListener("loadedmetadata", seek, { once: true });
      }, { once: true });
      media.src = fileUrl(req.abs);
      if (!req.isCurrent()) {
        dispose();
        return false;
      }
      return dispose;
    }
    function positionLabel(n) {
      const s = Math.max(0, n | 0);
      const mm = Math.floor(s / 60);
      const ss = String(s % 60).padStart(2, "0");
      return mm >= 60 ? Math.floor(mm / 60) + ":" + String(mm % 60).padStart(2, "0") + ":" + ss : mm + ":" + ss;
    }
    module2.exports = {
      id: "media",
      exts: [...Object.keys(VIDEO), ...Object.keys(AUDIO)],
      anchorKind: null,
      // no outline, so nothing writes an anchor; a hand-written #t= still previews
      positionUnit: "time",
      positionLabel,
      render
    };
  }
});

// src/formats/odf-styles.js
var require_odf_styles = __commonJS({
  "src/formats/odf-styles.js"(exports2, module2) {
    "use strict";
    var { elements, attr } = require_xml();
    var { pt, colour, fontFamily } = require_css();
    var PER_PT = { cm: 72 / 2.54, mm: 72 / 25.4, in: 72, pt: 1, pc: 12, px: 0.75 };
    function points(value) {
      const m = /^\s*(-?[\d.]+)\s*(cm|mm|in|pt|pc|px)\s*$/i.exec(String(value || ""));
      if (!m)
        return null;
      const n = Number(m[1]);
      return Number.isFinite(n) ? n * PER_PT[m[2].toLowerCase()] : null;
    }
    var length = (value) => {
      const n = points(value);
      return n === null ? null : pt(n);
    };
    var ALIGN = { start: "left", end: "right", left: "left", right: "right", center: "center", justify: "justify" };
    function textCss(props) {
      if (!props)
        return {};
      const out = {};
      const family = fontFamily(attr(props, "fo:font-family") || attr(props, "style:font-name"));
      if (family)
        out["font-family"] = family;
      const size = length(attr(props, "fo:font-size"));
      if (size)
        out["font-size"] = size;
      const weight = attr(props, "fo:font-weight");
      if (weight)
        out["font-weight"] = weight;
      const style = attr(props, "fo:font-style");
      if (style)
        out["font-style"] = style;
      const fg = colour(attr(props, "fo:color"));
      if (fg)
        out.color = fg;
      const bg = colour(attr(props, "fo:background-color"));
      if (bg)
        out.background = bg;
      const lines = [];
      const underline = attr(props, "style:text-underline-style");
      const strike = attr(props, "style:text-line-through-style");
      if (underline && !/^none$/i.test(underline))
        lines.push("underline");
      if (strike && !/^none$/i.test(strike))
        lines.push("line-through");
      if (lines.length)
        out["text-decoration"] = lines.join(" ");
      const caps = attr(props, "fo:text-transform");
      if (caps && caps !== "none")
        out["text-transform"] = caps;
      const variant = attr(props, "fo:font-variant");
      if (variant && variant !== "normal")
        out["font-variant"] = variant;
      const position = attr(props, "style:text-position");
      if (position)
        out["vertical-align"] = /^-/.test(position.trim()) ? "sub" : "super";
      return out;
    }
    function paraCss(props) {
      if (!props)
        return {};
      const out = {};
      const align = attr(props, "fo:text-align");
      if (align && ALIGN[align])
        out["text-align"] = ALIGN[align];
      for (const [from, to] of [
        ["fo:margin-top", "margin-top"],
        ["fo:margin-bottom", "margin-bottom"],
        ["fo:margin-left", "padding-left"],
        ["fo:margin-right", "padding-right"],
        ["fo:text-indent", "text-indent"]
      ]) {
        const value = length(attr(props, from));
        if (value)
          out[to] = value;
      }
      const line = attr(props, "fo:line-height");
      if (line && /%$/.test(line))
        out["line-height"] = String(parseFloat(line) / 100);
      else if (line && length(line))
        out["line-height"] = length(line);
      const bg = colour(attr(props, "fo:background-color"));
      if (bg)
        out.background = bg;
      const border = attr(props, "fo:border");
      if (border)
        out.border = border;
      return out;
    }
    function cellCss(props) {
      if (!props)
        return {};
      const out = {};
      const bg = colour(attr(props, "fo:background-color"));
      if (bg)
        out.background = bg;
      for (const [from, to] of [
        ["fo:border", "border"],
        ["fo:border-top", "border-top"],
        ["fo:border-right", "border-right"],
        ["fo:border-bottom", "border-bottom"],
        ["fo:border-left", "border-left"]
      ]) {
        const value = attr(props, from);
        if (value)
          out[to] = /^none$/i.test(value.trim()) ? "0" : value;
      }
      const align = attr(props, "style:vertical-align");
      if (align)
        out["vertical-align"] = align === "middle" ? "middle" : align;
      return out;
    }
    function columnCss(props) {
      const width = props && length(attr(props, "style:column-width"));
      return width ? { width } : {};
    }
    function readStyles(contentXml, stylesXml) {
      const table = /* @__PURE__ */ new Map();
      for (const source of [stylesXml || "", contentXml || ""]) {
        for (const style of elements(source, "style:style")) {
          const name = attr(style, "style:name");
          if (!name)
            continue;
          table.set(name, {
            parent: attr(style, "style:parent-style-name"),
            family: attr(style, "style:family") || "paragraph",
            para: elements(style, "style:paragraph-properties")[0] || "",
            text: elements(style, "style:text-properties")[0] || "",
            cell: elements(style, "style:table-cell-properties")[0] || "",
            column: elements(style, "style:table-column-properties")[0] || ""
          });
        }
      }
      return table;
    }
    function chain(table, name) {
      const out = [];
      const seen = /* @__PURE__ */ new Set();
      let at = name;
      while (at && table.has(at) && !seen.has(at)) {
        seen.add(at);
        out.unshift(table.get(at));
        at = table.get(at).parent;
      }
      return out;
    }
    var styleCss = (table, name) => Object.assign(
      {},
      ...chain(table, name).flatMap((s) => [paraCss(s.para), textCss(s.text), cellCss(s.cell), columnCss(s.column)])
    );
    function pageOf(stylesXml) {
      const master = elements(stylesXml || "", "style:master-page")[0];
      const named = master && attr(master, "style:page-layout-name");
      const layouts = elements(stylesXml || "", "style:page-layout");
      const layout = named && layouts.find((l) => attr(l, "style:name") === named) || layouts[0];
      const props = layout && elements(layout, "style:page-layout-properties")[0];
      if (!props)
        return null;
      const width = points(attr(props, "fo:page-width"));
      if (!width)
        return null;
      return {
        width,
        height: points(attr(props, "fo:page-height")),
        top: points(attr(props, "fo:margin-top")),
        right: points(attr(props, "fo:margin-right")),
        bottom: points(attr(props, "fo:margin-bottom")),
        left: points(attr(props, "fo:margin-left"))
      };
    }
    module2.exports = { points, length, textCss, paraCss, cellCss, columnCss, readStyles, chain, styleCss, pageOf };
  }
});

// src/formats/odf.js
var require_odf = __commonJS({
  "src/formats/odf.js"(exports2, module2) {
    "use strict";
    var { openZip } = require_zip();
    var { elements, elementsOf, attr, decodeEntities } = require_xml();
    var { renderLines, renderHtml, renderFrame } = require_preview();
    var { clampPosition, assetSrc, escAttr, gridToHtml, cellText: textOf, spanning, isCovered, COVERED, sectionEnd, MAX_ROWS, MAX_COLS } = require_util();
    var { sheet: cssSheet, pageCss, pt, SHEET_RULES } = require_css();
    var odfStyles = require_odf_styles();
    var MAX_LINES = 60;
    var KIND = { ott: "odt", ots: "ods", otp: "odp", odg: "odp", otg: "odp" };
    var kindOf = (ext) => KIND[String(ext || "").toLowerCase()] || ext;
    var DRAWING = /* @__PURE__ */ new Set(["odg", "otg"]);
    var named = (ext) => DRAWING.has(String(ext || "").toLowerCase());
    var without = (xml, tag) => elements(xml, tag).reduce((acc, src) => acc.replace(src, ""), xml);
    var ASIDES = ["office:annotation", "office:annotation-end", "text:tracked-changes", "text:note"];
    var readable = (xml) => xml ? ASIDES.reduce(without, xml) : xml;
    function contentOf(absPath) {
      const zip = openZip(absPath);
      return zip ? readable(zip.text("content.xml")) : null;
    }
    var TEXT_BLOCK = /<text:(?:h|p)\b[^>]*>([\s\S]*?)<\/text:(?:h|p)>/g;
    function textLines(xml) {
      const out = [];
      let m;
      while (m = TEXT_BLOCK.exec(xml)) {
        const line = decodeEntities(m[1].replace(/<text:tab\b[^>]*\/?>/g, " ").replace(/<text:s\b[^>]*\/?>/g, " ").replace(/<text:line-break\b[^>]*\/?>/g, " ").replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
        if (line)
          out.push(line);
      }
      return out;
    }
    function odtOutline(xml) {
      const out = [];
      let m;
      let n = 0;
      const re = /<text:h\b[^>]*>([\s\S]*?)<\/text:h>/g;
      while (m = re.exec(xml)) {
        n += 1;
        const title = decodeEntities(m[1].replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
        if (title)
          out.push({ title, position: n });
      }
      return out;
    }
    function slideText(slide) {
      const body = textLines(slide);
      const titled = elements(slide, "draw:frame").find((frame) => (attr(frame, "presentation:class") || "") === "title");
      const titleLines = titled ? textLines(titled) : [];
      for (const line of titleLines) {
        const at = body.indexOf(line);
        if (at >= 0)
          body.splice(at, 1);
      }
      return { title: titleLines.join(" ") || body.shift() || "", body };
    }
    function pageOutline(xml, named2) {
      const out = [];
      elements(xml, "draw:page").forEach((page, i) => {
        const title = slideText(page).title || (named2 ? attr(page, "draw:name") || "" : "");
        if (title)
          out.push({ title, position: i + 1 });
      });
      return out;
    }
    function odsOutline(xml) {
      const out = [];
      elements(xml, "table:table").forEach((table, i) => {
        const name = attr(table, "table:name");
        if (name)
          out.push({ title: name, position: i + 1 });
      });
      return out;
    }
    var cellText = (cell) => textLines(cell).join(" ").trim();
    var repeat = (source, name) => Math.max(1, parseInt(attr(source, name) || "1", 10) || 1);
    function sheetGrid(tableXml, ctx) {
      const rows = [];
      for (const row of elements(tableXml, "table:table-row")) {
        if (rows.length >= MAX_ROWS)
          break;
        const cells = [];
        for (const { tag, xml } of elementsOf(row, ["table:covered-table-cell", "table:table-cell"])) {
          const covered = tag === "table:covered-table-cell";
          const text = cellText(xml);
          const cls = ctx && ctx.sheet ? ctx.sheet.cls(odfStyles.styleCss(ctx.styles, ownAttr(xml, "table:style-name"))) : "";
          const across = repeat(xml, "table:number-columns-spanned");
          const down = repeat(xml, "table:number-rows-spanned");
          let value = cls ? { text, cls } : text;
          if (covered)
            value = COVERED;
          else if (across > 1 || down > 1)
            value = spanning(value, across, down);
          for (let i = 0; i < repeat(xml, "table:number-columns-repeated") && cells.length <= MAX_COLS; i++)
            cells.push(value);
        }
        for (let r = 0; r < repeat(row, "table:number-rows-repeated") && rows.length < MAX_ROWS; r++)
          rows.push(cells.slice());
      }
      let lastRow = -1;
      let lastCol = -1;
      rows.forEach((cs, ri) => cs.forEach((c, ci) => {
        if (textOf(c) || isCovered(c)) {
          lastRow = Math.max(lastRow, ri);
          lastCol = Math.max(lastCol, ci);
        }
      }));
      if (lastRow < 0)
        return [];
      return rows.slice(0, lastRow + 1).map((cs) => cs.slice(0, Math.min(lastCol + 1, MAX_COLS)));
    }
    function sheetColumns(tableXml, ctx) {
      const out = [];
      for (const col of elements(tableXml, "table:table-column")) {
        const width = odfStyles.styleCss(ctx.styles, ownAttr(col, "table:style-name")).width || null;
        for (let i = 0; i < repeat(col, "table:number-columns-repeated") && out.length <= MAX_COLS; i++) {
          out.push(width ? { width } : {});
        }
      }
      return out;
    }
    var sheetTable = (tableXml, ctx) => gridToHtml(sheetGrid(tableXml, ctx), {
      header: false,
      cols: ctx ? sheetColumns(tableXml, ctx) : []
    });
    var cleanTitle = (hXml) => decodeEntities(hXml.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
    var openingTag = (src) => src.slice(0, src.indexOf(">") + 1 || src.length);
    var ownAttr = (src, name) => attr(openingTag(src), name);
    var headingLevel = (src) => Math.min(6, Math.max(1, parseInt(ownAttr(src, "text:outline-level") || "1", 10) || 1));
    function odtHeadings(xml) {
      const out = [];
      const re = /<text:h\b[^>]*>[\s\S]*?<\/text:h>/g;
      let m;
      while (m = re.exec(xml)) {
        out.push({ from: m.index, to: re.lastIndex, title: cleanTitle(m[0]), level: headingLevel(m[0]) });
      }
      return out;
    }
    var inlineHtml = (s, ctx) => s.replace(/<text:line-break\b[^>]*\/?>/g, "<br>").replace(/<text:(?:tab|s)\b[^>]*\/?>/g, " ").replace(/<text:span\b([^>]*)>/g, (m, a) => {
      const cls = ctx && ctx.sheet ? ctx.sheet.cls(odfStyles.styleCss(ctx.styles, attr(m, "text:style-name"))) : "";
      return cls ? '<span class="' + cls + '">' : "<span>";
    }).replace(/<\/text:span>/g, "</span>").replace(/<(?!\/?(?:br|img|span)\b)[^>]+>/gi, "").replace(/<span>([\s\S]*?)<\/span>/g, "$1").replace(/\s+/g, " ").trim();
    var BLOCK = ["text:h", "text:p", "text:list", "table:table"];
    function blocks(xml) {
      const spans = [];
      for (const tag of BLOCK) {
        let at = 0;
        for (const src of elements(xml, tag)) {
          const from = xml.indexOf(src, at);
          if (from < 0)
            continue;
          spans.push({ from, to: from + src.length, tag, src });
          at = from + src.length;
        }
      }
      spans.sort((a, b) => a.from - b.from || b.to - a.to);
      const out = [];
      let end = -1;
      for (const s of spans)
        if (s.from >= end) {
          out.push(s);
          end = s.to;
        }
      return out;
    }
    var openTag = (tag, cls) => "<" + tag + (cls ? ' class="' + cls + '"' : "") + ">";
    function tableHtml(table, ctx) {
      const rows = elements(table, "table:table-row").map((row) => {
        const cells = elements(row, "table:table-cell").map((cell) => {
          const cls = ctx.sheet.cls(odfStyles.styleCss(ctx.styles, ownAttr(cell, "table:style-name")));
          const inner = blocks(cell).map((b) => blockHtml(b, ctx)).join("");
          const span = (name, as) => {
            const n = parseInt(ownAttr(cell, name) || "1", 10) || 1;
            return n > 1 ? " " + as + '="' + n + '"' : "";
          };
          return "<td" + span("table:number-columns-spanned", "colspan") + span("table:number-rows-spanned", "rowspan") + (cls ? ' class="' + cls + '"' : "") + ">" + inner + "</td>";
        });
        return cells.length ? "<tr>" + cells.join("") + "</tr>" : "";
      }).filter(Boolean);
      return rows.length ? "<table>" + rows.join("") + "</table>" : "";
    }
    function blockHtml(span, ctx) {
      const { tag, src } = span;
      if (tag === "table:table")
        return ctx && ctx.sheet ? tableHtml(src, ctx) : sheetTable(src) || "";
      if (tag === "text:list") {
        const items = elements(src, "text:list-item").map((item) => blocks(item).map((b) => blockHtml(b, ctx)).join("")).filter(Boolean);
        return items.length ? "<ul>" + items.map((i) => "<li>" + i + "</li>").join("") + "</ul>" : "";
      }
      const inner = inlineHtml(src.replace(/^<[^>]*>/, "").replace(/<\/[^>]*>$/, ""), ctx);
      if (!inner)
        return "";
      const cls = ctx && ctx.sheet ? ctx.sheet.cls(odfStyles.styleCss(ctx.styles, ownAttr(src, "text:style-name"))) : "";
      const name = tag === "text:h" ? "h" + headingLevel(src) : "p";
      return openTag(name, cls) + inner + "</" + name + ">";
    }
    function odtToHtml(xml, ctx) {
      const body = readable(xml).replace(/<draw:image\b[^>]*\/?>/g, (m) => {
        const href = attr(m, "xlink:href");
        return href ? '<img src="' + escAttr(href) + '">' : "";
      });
      return blocks(body).map((b) => blockHtml(b, ctx)).join("");
    }
    function odtSectionXml(xml, position) {
      const hs = odtHeadings(xml);
      if (!hs.length)
        return { title: "", xml, total: 1, n: 1 };
      const n = clampPosition(position, hs.length);
      return {
        title: hs[n - 1].title,
        xml: xml.slice(hs[n - 1].from, sectionEnd(hs, n, xml.length)),
        total: hs.length,
        n
      };
    }
    function outlineFor(ext, xml) {
      if (kindOf(ext) === "odp")
        return pageOutline(xml, named(ext));
      if (kindOf(ext) === "ods")
        return odsOutline(xml);
      return odtOutline(xml);
    }
    async function readOutline(absPath, ext) {
      const xml = contentOf(absPath);
      return xml ? outlineFor(ext, xml) : [];
    }
    async function readSection(absPath, ext, position) {
      const xml = contentOf(absPath);
      if (!xml)
        return null;
      if (kindOf(ext) === "odp") {
        const slides = elements(xml, "draw:page");
        if (!slides.length)
          return null;
        const n = clampPosition(position, slides.length);
        const { title, body } = slideText(slides[n - 1]);
        return {
          title: title || (named(ext) ? attr(slides[n - 1], "draw:name") || "" : ""),
          body: body.slice(0, MAX_LINES),
          position: n,
          total: slides.length
        };
      }
      if (kindOf(ext) === "ods") {
        const tables = elements(xml, "table:table");
        if (!tables.length)
          return null;
        const n = clampPosition(position, tables.length);
        return { title: attr(tables[n - 1], "table:name") || "", body: textLines(tables[n - 1]).slice(0, MAX_LINES), position: n, total: tables.length };
      }
      if (!odtHeadings(xml).length)
        return { title: "", body: textLines(xml).slice(0, MAX_LINES), position: 1, total: 1 };
      const sec = odtSectionXml(xml, position);
      const lines = textLines(sec.xml);
      if (lines[0] === sec.title)
        lines.shift();
      return { title: sec.title, body: lines.slice(0, MAX_LINES), position: sec.n, total: sec.total };
    }
    var imageLoader = (zip) => (src) => zip ? zip.read(assetSrc(src)) : null;
    var PAGE_RULES = [
      "body{margin:0;background:transparent}",
      ".page table{border-collapse:collapse}",
      ".page td,.page th{border:1px solid #b9b9b9;padding:2pt 4pt;vertical-align:top}",
      ".page img{max-width:100%;height:auto}",
      ".page ul{margin:0;padding-left:1.5em}"
    ].join("\n");
    var SHAPE = ["draw:frame", "draw:custom-shape", "draw:text-box", "draw:g"];
    var SLIDE_RULES = [
      "body{margin:0;background:transparent}",
      ".slide{position:relative;overflow:hidden;background:#ffffff;color:#1a1a1a;margin:0 auto;box-shadow:0 0 0 1pt rgba(0,0,0,.15)}",
      ".slide p{margin:0}",
      ".slide img{display:block;width:100%;height:100%;object-fit:contain}"
    ].join("\n");
    function shapeBox(shape) {
      const box = {
        left: odfStyles.length(ownAttr(shape, "svg:x")),
        top: odfStyles.length(ownAttr(shape, "svg:y")),
        width: odfStyles.length(ownAttr(shape, "svg:width")),
        height: odfStyles.length(ownAttr(shape, "svg:height"))
      };
      return box.left && box.top && box.width ? box : null;
    }
    function shapeHtml(shape, ctx) {
      const box = shapeBox(shape);
      if (!box)
        return "";
      const image = elements(shape, "draw:image")[0];
      const href = image && attr(openingTag(image), "xlink:href");
      const css = Object.assign({ position: "absolute", overflow: "hidden" }, {
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height || null
      }, odfStyles.styleCss(ctx.styles, ownAttr(shape, "draw:style-name")));
      const cls = ctx.sheet.cls(css);
      const inner = href ? '<img src="' + escAttr(href) + '">' : blocks(shape).map((b) => blockHtml(b, ctx)).join("");
      return inner ? '<div class="' + cls + '">' + inner + "</div>" : "";
    }
    function slidePage(zip, xml, position, width) {
      const slides = elements(xml, "draw:page");
      if (!slides.length)
        return null;
      const page = odfStyles.pageOf(zip.text("styles.xml"));
      if (!page)
        return null;
      const slide = slides[clampPosition(position, slides.length) - 1];
      const ctx = { styles: odfStyles.readStyles(zip.text("content.xml"), zip.text("styles.xml")), sheet: cssSheet("o") };
      const shapes = SHAPE.flatMap((tag) => elements(slide, tag)).map((s) => ({ at: slide.indexOf(s), html: shapeHtml(s, ctx) })).filter((s) => s.html).sort((a, b) => a.at - b.at).map((s) => s.html).join("");
      return {
        html: '<div class="slide">' + shapes + "</div>",
        css: [
          SLIDE_RULES,
          ".slide{width:" + pt(page.width) + ";height:" + pt(page.height) + "}",
          "html{zoom:" + Math.min(1, width / (page.width * (96 / 72))) + "}",
          ctx.sheet.text()
        ].join("\n")
      };
    }
    function documentPage(zip, xml, position, width, view) {
      const sec = odtSectionXml(xml, position);
      const ctx = { styles: odfStyles.readStyles(zip.text("content.xml"), zip.text("styles.xml")), sheet: cssSheet("o") };
      const body = odtToHtml(sec.xml, ctx);
      const page = pageCss(odfStyles.pageOf(zip.text("styles.xml")), width, view);
      return {
        html: '<div class="page">' + body + "</div>",
        css: [PAGE_RULES, page.css, "html{zoom:" + page.zoom + "}", ctx.sheet.text()].filter(Boolean).join("\n")
      };
    }
    async function render(el, req) {
      const kind = kindOf(req.ext);
      if (kind === "ods") {
        const zip = openZip(req.abs);
        const xml = zip ? readable(zip.text("content.xml")) : null;
        const tables = xml ? elements(xml, "table:table") : [];
        if (req.isCurrent() && tables.length) {
          const ctx = { styles: odfStyles.readStyles(zip.text("content.xml"), zip.text("styles.xml")), sheet: cssSheet("o") };
          const html = sheetTable(tables[clampPosition(req.position, tables.length) - 1], ctx);
          if (html) {
            const css = [SHEET_RULES, ctx.sheet.text()].join("\n");
            const framed = renderFrame(el, {
              html,
              css,
              width: req.width,
              onFail: () => {
                renderHtml(el, { html, width: req.width, css });
              }
            });
            if (framed !== false)
              return framed;
            const done = renderHtml(el, { html, width: req.width, css });
            if (done !== false)
              return done;
          }
        }
      }
      if (kind === "odt") {
        const zip = openZip(req.abs);
        const xml = zip ? readable(zip.text("content.xml")) : null;
        if (req.isCurrent() && xml) {
          const page = documentPage(zip, xml, req.position, req.width, req.view);
          const loadImage = imageLoader(zip);
          const framed = renderFrame(el, {
            html: page.html,
            css: page.css,
            width: req.width,
            loadImage,
            onFail: () => {
              renderHtml(el, { html: page.html, width: req.width, loadImage });
            }
          });
          if (framed !== false)
            return framed;
          const done = renderHtml(el, { html: page.html, width: req.width, loadImage });
          if (done !== false)
            return done;
        }
      }
      if (kind === "odp") {
        const zip = openZip(req.abs);
        const xml = zip ? readable(zip.text("content.xml")) : null;
        const page = xml && req.isCurrent() ? slidePage(zip, xml, req.position, req.width) : null;
        if (page) {
          const loadImage = imageLoader(zip);
          const flat = () => readSection(req.abs, req.ext, req.position).then((sec2) => sec2 && renderLines(el, { title: sec2.title, body: sec2.body, width: req.width }));
          const framed = renderFrame(el, {
            html: page.html,
            css: page.css,
            width: req.width,
            loadImage,
            onFail: flat
          });
          if (framed !== false)
            return framed;
        }
      }
      const sec = await readSection(req.abs, req.ext, req.position);
      if (!req.isCurrent() || !sec)
        return false;
      return renderLines(el, { title: sec.title, body: sec.body, width: req.width });
    }
    module2.exports = {
      id: "odf",
      exts: ["odt", "ods", "odp", "odg", "ott", "ots", "otp", "otg"],
      anchorKind: null,
      outline: (abs, ext) => readOutline(abs, ext),
      render,
      readOutline,
      readSection,
      sheetTable,
      sheetGrid,
      odtToHtml,
      odtSectionXml,
      documentPage,
      slidePage
    };
  }
});

// src/formats/docx-styles.js
var require_docx_styles = __commonJS({
  "src/formats/docx-styles.js"(exports2, module2) {
    "use strict";
    var { elements, attr } = require_xml();
    var { pt, twips, halfPoints, eighthPoints, num, colour, fontFamily } = require_css();
    function flag(pr, tag) {
      const el = elements(pr || "", tag)[0];
      if (!el)
        return null;
      const val = attr(el, "w:val");
      return val === null || !/^(0|false|off)$/i.test(val);
    }
    var ALIGN = {
      left: "left",
      start: "left",
      right: "right",
      end: "right",
      center: "center",
      both: "justify",
      distribute: "justify"
    };
    function runCss(rPr) {
      if (!rPr)
        return {};
      const out = {};
      const fonts = elements(rPr, "w:rFonts")[0];
      if (fonts) {
        const family = fontFamily(attr(fonts, "w:ascii") || attr(fonts, "w:hAnsi") || attr(fonts, "w:cs"));
        if (family)
          out["font-family"] = family;
      }
      const size = num(attr(elements(rPr, "w:sz")[0] || "", "w:val"));
      if (size !== null)
        out["font-size"] = halfPoints(size);
      const bold = flag(rPr, "w:b");
      if (bold !== null)
        out["font-weight"] = bold ? "bold" : "normal";
      const italic = flag(rPr, "w:i");
      if (italic !== null)
        out["font-style"] = italic ? "italic" : "normal";
      const underline = attr(elements(rPr, "w:u")[0] || "", "w:val");
      const struck = flag(rPr, "w:strike");
      const lines = [];
      if (underline && !/^none$/i.test(underline))
        lines.push("underline");
      if (struck)
        lines.push("line-through");
      if (lines.length)
        out["text-decoration"] = lines.join(" ");
      else if (underline || struck === false)
        out["text-decoration"] = "none";
      const fg = colour(attr(elements(rPr, "w:color")[0] || "", "w:val"));
      if (fg)
        out.color = fg;
      const shade = elements(rPr, "w:shd")[0];
      const bg = shade && colour(attr(shade, "w:fill"));
      if (bg)
        out.background = bg;
      if (flag(rPr, "w:caps"))
        out["text-transform"] = "uppercase";
      if (flag(rPr, "w:smallCaps"))
        out["font-variant"] = "small-caps";
      const spacing = num(attr(elements(rPr, "w:spacing")[0] || "", "w:val"));
      if (spacing)
        out["letter-spacing"] = twips(spacing);
      return out;
    }
    function paraCss(pPr) {
      if (!pPr)
        return {};
      const out = {};
      const jc = attr(elements(pPr, "w:jc")[0] || "", "w:val");
      if (jc && ALIGN[jc])
        out["text-align"] = ALIGN[jc];
      const spacing = elements(pPr, "w:spacing")[0];
      if (spacing) {
        const before = num(attr(spacing, "w:before"));
        const after = num(attr(spacing, "w:after"));
        if (before !== null)
          out["margin-top"] = twips(before);
        if (after !== null)
          out["margin-bottom"] = twips(after);
        const line = num(attr(spacing, "w:line"));
        if (line !== null) {
          out["line-height"] = /^(atLeast|exact)$/i.test(attr(spacing, "w:lineRule") || "auto") ? twips(line) : String(Math.round(line / 240 * 100) / 100);
        }
      }
      const ind = elements(pPr, "w:ind")[0];
      if (ind) {
        const left = num(attr(ind, "w:left") || attr(ind, "w:start"));
        const right = num(attr(ind, "w:right") || attr(ind, "w:end"));
        const first = num(attr(ind, "w:firstLine"));
        const hanging = num(attr(ind, "w:hanging"));
        if (left !== null)
          out["padding-left"] = twips(left);
        if (right !== null)
          out["padding-right"] = twips(right);
        if (hanging !== null)
          out["text-indent"] = twips(-hanging);
        else if (first !== null)
          out["text-indent"] = twips(first);
      }
      return out;
    }
    var BORDER_SIDE = { top: "border-top", left: "border-left", bottom: "border-bottom", right: "border-right" };
    function edgeValue(edge) {
      if (!edge)
        return null;
      const kind = (attr(edge, "w:val") || "").toLowerCase();
      if (!kind || kind === "nil" || kind === "none")
        return "0";
      const size = num(attr(edge, "w:sz"));
      const style = /dash/.test(kind) ? "dashed" : /dot/.test(kind) ? "dotted" : /double/.test(kind) ? "double" : "solid";
      return eighthPoints(size === null ? 4 : Math.max(2, size)) + " " + style + " " + (colour(attr(edge, "w:color")) || "#767676");
    }
    function borderCss(pr, tag) {
      const box = elements(pr || "", tag)[0];
      if (!box)
        return {};
      const out = {};
      for (const [side, prop] of Object.entries(BORDER_SIDE)) {
        const value = edgeValue(elements(box, "w:" + side)[0]);
        if (value !== null)
          out[prop] = value;
      }
      return out;
    }
    function cellCss(tcPr) {
      const out = Object.assign({}, borderCss(tcPr, "w:tcBorders"));
      const shade = elements(tcPr || "", "w:shd")[0];
      const fill = shade && colour(attr(shade, "w:fill"));
      if (fill)
        out.background = fill;
      const width = elements(tcPr || "", "w:tcW")[0];
      const w = width && num(attr(width, "w:w"));
      if (w && (attr(width, "w:type") || "dxa") === "dxa")
        out.width = twips(w);
      const valign = attr(elements(tcPr || "", "w:vAlign")[0] || "", "w:val");
      if (valign)
        out["vertical-align"] = valign === "center" ? "middle" : valign;
      return out;
    }
    function splitStyle(src) {
      const pPr = elements(src, "w:pPr")[0] || "";
      const rest = pPr ? src.replace(pPr, "") : src;
      return { pPr, rPr: elements(rest, "w:rPr")[0] || "" };
    }
    function styleTable(stylesXml) {
      const out = /* @__PURE__ */ new Map();
      for (const style of elements(stylesXml || "", "w:style")) {
        const id = attr(style, "w:styleId");
        if (!id)
          continue;
        const parts = splitStyle(style);
        out.set(id, {
          basedOn: attr(elements(style, "w:basedOn")[0] || "", "w:val"),
          pPr: parts.pPr,
          rPr: parts.rPr,
          // A table style holds the borders every cell in the table gets. Real documents lean on
          // these entirely: across a corpus not one table states its borders on the table itself.
          tblPr: elements(style, "w:tblPr")[0] || ""
        });
      }
      return out;
    }
    function tableCss(styles, tblPr) {
      const named = attr(elements(tblPr || "", "w:tblStyle")[0] || "", "w:val");
      const layers = [...chain(styles, named).map((s) => s.tblPr), tblPr || ""];
      const outer = Object.assign({}, ...layers.map((pr) => borderCss(pr, "w:tblBorders")));
      const inside = {};
      for (const pr of layers) {
        const box = elements(pr, "w:tblBorders")[0];
        if (!box)
          continue;
        const h = edgeValue(elements(box, "w:insideH")[0]);
        const v = edgeValue(elements(box, "w:insideV")[0]);
        if (h !== null) {
          inside["border-top"] = h;
          inside["border-bottom"] = h;
        }
        if (v !== null) {
          inside["border-left"] = v;
          inside["border-right"] = v;
        }
      }
      return { table: outer, cell: inside };
    }
    function docDefaults(stylesXml) {
      const defaults = elements(stylesXml || "", "w:docDefaults")[0] || "";
      return {
        rPr: elements(elements(defaults, "w:rPrDefault")[0] || "", "w:rPr")[0] || "",
        pPr: elements(elements(defaults, "w:pPrDefault")[0] || "", "w:pPr")[0] || ""
      };
    }
    function readStyles(stylesXml) {
      return { table: styleTable(stylesXml), defaults: docDefaults(stylesXml) };
    }
    function chain(styles, id) {
      const out = [];
      const seen = /* @__PURE__ */ new Set();
      let at = id;
      while (at && styles.table.has(at) && !seen.has(at)) {
        seen.add(at);
        out.unshift(styles.table.get(at));
        at = styles.table.get(at).basedOn;
      }
      return out;
    }
    function paragraphCss(styles, pPr, styleId) {
      const layers = [
        paraCss(styles.defaults.pPr),
        runCss(styles.defaults.rPr),
        ...chain(styles, styleId).flatMap((s) => [paraCss(s.pPr), runCss(s.rPr)]),
        paraCss(pPr)
      ];
      return Object.assign({}, ...layers);
    }
    var characterCss = (styles, rPr, styleId) => Object.assign(
      {},
      ...chain(styles, styleId).map((s) => runCss(s.rPr)),
      runCss(rPr)
    );
    function pageOf(body) {
      const sects = elements(body || "", "w:sectPr");
      const sect = sects[sects.length - 1] || "";
      const size = elements(sect, "w:pgSz")[0];
      if (!size)
        return null;
      const margin = elements(sect, "w:pgMar")[0] || "";
      const points = (v) => num(v) === null ? null : num(v) / 20;
      return {
        width: points(attr(size, "w:w")),
        height: points(attr(size, "w:h")),
        top: points(attr(margin, "w:top")),
        right: points(attr(margin, "w:right")),
        bottom: points(attr(margin, "w:bottom")),
        left: points(attr(margin, "w:left"))
      };
    }
    module2.exports = {
      flag,
      runCss,
      paraCss,
      borderCss,
      cellCss,
      splitStyle,
      styleTable,
      docDefaults,
      readStyles,
      chain,
      paragraphCss,
      characterCss,
      pageOf,
      pt,
      edgeValue,
      tableCss
    };
  }
});

// src/formats/docx.js
var require_docx = __commonJS({
  "src/formats/docx.js"(exports2, module2) {
    "use strict";
    var { openZip } = require_zip();
    var { elements, attr, textIn, decodeEntities } = require_xml();
    var { renderLines, renderHtml, renderFrame } = require_preview();
    var { clampPosition, normPath, assetSrc, escHtml, escAttr, sectionEnd } = require_util();
    var { sheet: cssSheet, pageCss, num } = require_css();
    var docxStyles = require_docx_styles();
    var MAX_LINES = 60;
    var para = () => /<w:p(?=[\s>])[^>]*>[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g;
    var squeeze = (s) => decodeEntities(s).replace(/\s+/g, " ");
    var clean = (s) => squeeze(s).trim();
    function relTargets(zip) {
      const out = /* @__PURE__ */ new Map();
      for (const r of elements(zip.text("word/_rels/document.xml.rels") || "", "Relationship")) {
        const id = attr(r, "Id");
        const target = attr(r, "Target");
        if (id && target)
          out.set(id, normPath("word/" + target.replace(/^\/+/, "")));
      }
      return out;
    }
    function headingStyles(stylesXml) {
      const out = /* @__PURE__ */ new Map();
      for (const style of elements(stylesXml || "", "w:style")) {
        const id = attr(style, "w:styleId");
        const level = /^heading\s*([1-9])/i.exec(attr(elements(style, "w:name")[0] || "", "w:val") || "");
        if (id && level)
          out.set(id, Number(level[1]));
      }
      return out;
    }
    function headingLevel(p, styles) {
      const pPr = elements(p, "w:pPr")[0];
      if (!pPr)
        return 0;
      const styleId = attr(elements(pPr, "w:pStyle")[0] || "", "w:val");
      if (styleId) {
        if (styles.has(styleId))
          return styles.get(styleId);
        const builtin = /^heading\s*([1-9])$/i.exec(styleId);
        if (builtin)
          return Number(builtin[1]);
      }
      const lvl = attr(elements(pPr, "w:outlineLvl")[0] || "", "w:val");
      const n = lvl === null ? NaN : parseInt(lvl, 10);
      return n >= 0 && n <= 8 ? n + 1 : 0;
    }
    function tableSpans(xml) {
      const out = [];
      let at = 0;
      for (const table of elements(xml, "w:tbl")) {
        const from = xml.indexOf(table, at);
        if (from < 0)
          continue;
        out.push({ from, to: from + table.length, xml: table });
        at = from + table.length;
      }
      return out;
    }
    function maskTables(xml) {
      let out = xml;
      for (const s of tableSpans(xml))
        out = out.slice(0, s.from) + " ".repeat(s.to - s.from) + out.slice(s.to);
      return out;
    }
    function headings(body, styles) {
      const masked = maskTables(body);
      const out = [];
      const re = para();
      let m;
      while (m = re.exec(masked)) {
        const level = headingLevel(m[0], styles);
        if (!level)
          continue;
        const title = clean(textIn(m[0], "w:t"));
        if (title)
          out.push({ from: m.index, to: re.lastIndex, title, level });
      }
      return out;
    }
    var isOn = (rPr, tag) => docxStyles.flag(rPr, tag) === true;
    var context = (parts, images) => ({
      levels: parts.styles,
      styles: parts.formatting || docxStyles.readStyles(""),
      images: images || /* @__PURE__ */ new Map(),
      sheet: cssSheet("w")
    });
    var withClass = (tag, cls, inner) => "<" + tag + (cls ? ' class="' + cls + '"' : "") + ">" + inner + "</" + tag + ">";
    function runHtml(run, ctx) {
      let html = "";
      for (const drawing of elements(run, "w:drawing")) {
        const src = ctx.images.get(attr(elements(drawing, "a:blip")[0] || "", "r:embed"));
        if (src)
          html += '<img src="' + escAttr(src) + '">';
      }
      let inner = "";
      for (const chunk of run.replace(/<w:tab\b[^>]*\/?>/g, "	").replace(/<w:br\b[^>]*\/?>/g, "\n").split(/([\n\t])/)) {
        if (chunk === "\n")
          inner += "<br>";
        else if (chunk === "	")
          inner += " ";
        else
          inner += escHtml(squeeze(textIn(chunk, "w:t")));
      }
      if (!inner.trim())
        return html;
      const rPr = elements(run, "w:rPr")[0] || "";
      const align = attr(elements(rPr, "w:vertAlign")[0] || "", "w:val");
      if (align === "superscript")
        inner = "<sup>" + inner + "</sup>";
      else if (align === "subscript")
        inner = "<sub>" + inner + "</sub>";
      if (isOn(rPr, "w:i"))
        inner = "<em>" + inner + "</em>";
      if (isOn(rPr, "w:b"))
        inner = "<strong>" + inner + "</strong>";
      const cls = ctx.sheet.cls(docxStyles.characterCss(ctx.styles, rPr, attr(elements(rPr, "w:rStyle")[0] || "", "w:val")));
      return html + (cls ? withClass("span", cls, inner) : inner);
    }
    function paraHtml(p, ctx) {
      const body = elements(p, "w:r").map((r) => runHtml(r, ctx)).join("").trim();
      if (!body)
        return "";
      const pPr = elements(p, "w:pPr")[0] || "";
      const styleId = attr(elements(pPr, "w:pStyle")[0] || "", "w:val");
      const cls = ctx.sheet.cls(docxStyles.paragraphCss(ctx.styles, pPr, styleId));
      const level = Math.min(6, headingLevel(p, ctx.levels));
      if (level)
        return withClass("h" + level, cls, body);
      return withClass(elements(pPr, "w:numPr").length ? "li" : "p", cls, body);
    }
    function cellHtml(cell, ctx, down) {
      const tcPr = elements(cell, "w:tcPr")[0] || "";
      const inner = elements(cell, "w:p").map((p) => paraHtml(p, ctx)).join("");
      const span = num(attr(elements(tcPr, "w:gridSpan")[0] || "", "w:val"));
      const attrs = (span && span > 1 ? ' colspan="' + span + '"' : "") + (down > 1 ? ' rowspan="' + down + '"' : "");
      const cls = ctx.sheet.cls(docxStyles.cellCss(tcPr));
      return "<td" + attrs + (cls ? ' class="' + cls + '"' : "") + ">" + inner + "</td>";
    }
    var gridSpan = (tcPr) => Math.max(1, num(attr(elements(tcPr, "w:gridSpan")[0] || "", "w:val")) || 1);
    function vertical(rows) {
      const grid = rows.map((row) => {
        let col = 0;
        return elements(row, "w:tc").map((xml) => {
          const tcPr = elements(xml, "w:tcPr")[0] || "";
          const merge = elements(tcPr, "w:vMerge")[0];
          const at = col;
          col += gridSpan(tcPr);
          return {
            xml,
            col: at,
            start: !merge || attr(merge, "w:val") === "restart",
            merged: !!merge,
            down: 1
          };
        });
      });
      grid.forEach((cells, r) => cells.forEach((cell) => {
        if (!cell.merged || !cell.start)
          return;
        for (let y = r + 1; y < grid.length; y++) {
          const below = grid[y].find((c) => c.col === cell.col);
          if (!below || !below.merged || below.start)
            break;
          cell.down++;
        }
      }));
      return grid;
    }
    var isHeaderRow = (row) => !!elements(elements(row, "w:trPr")[0] || "", "w:tblHeader")[0];
    function colGroup(table) {
      const cols = elements(elements(table, "w:tblGrid")[0] || "", "w:gridCol").map((c) => num(attr(c, "w:w"))).filter((w) => w !== null);
      if (!cols.length)
        return "";
      const total = cols.reduce((a, b) => a + b, 0) || 1;
      return "<colgroup>" + cols.map((w) => '<col style="width:' + Math.round(w / total * 1e3) / 10 + '%">').join("") + "</colgroup>";
    }
    function tableHtml(table, ctx) {
      const source = elements(table, "w:tr");
      const rows = vertical(source).map((cells, r) => {
        if (!cells.length)
          return "";
        const html = cells.filter((c) => c.start).map((c) => cellHtml(c.xml, ctx, c.down));
        return "<tr>" + (isHeaderRow(source[r]) ? html.map((c) => c.replace(/^<td/, "<th").replace(/<\/td>$/, "</th>")) : html).join("") + "</tr>";
      }).filter(Boolean);
      if (!rows.length)
        return "";
      const tblPr = elements(table, "w:tblPr")[0] || "";
      const look = docxStyles.tableCss(ctx.styles, tblPr);
      const classes = [
        ctx.sheet.cls(Object.assign({ "table-layout": "fixed", width: "100%" }, look.table)),
        ctx.sheet.cls(look.cell, "td"),
        ctx.sheet.cls(look.cell, "th")
      ].filter(Boolean).join(" ");
      return "<table" + (classes ? ' class="' + classes + '"' : "") + ">" + colGroup(table) + rows.join("") + "</table>";
    }
    function toHtml(xml, ctxOrLevels, images) {
      const ctx = ctxOrLevels && ctxOrLevels.sheet ? ctxOrLevels : context({ styles: ctxOrLevels || /* @__PURE__ */ new Map() }, images);
      const blocks = tableSpans(xml).map((s) => ({ at: s.from, html: tableHtml(s.xml, ctx) }));
      const re = para();
      let m;
      const masked = maskTables(xml);
      while (m = re.exec(masked))
        blocks.push({ at: m.index, html: paraHtml(m[0], ctx) });
      return blocks.sort((a, b) => a.at - b.at).map((b) => b.html).join("").replace(/(?:<li[^>]*>[\s\S]*?<\/li>)+/g, (run) => "<ul>" + run + "</ul>");
    }
    function partsOf(absPath) {
      const zip = openZip(absPath);
      const body = zip && zip.text("word/document.xml");
      if (!body)
        return null;
      const stylesXml = zip.text("word/styles.xml");
      return { zip, body, styles: headingStyles(stylesXml), formatting: docxStyles.readStyles(stylesXml) };
    }
    function altChunk(zip, body) {
      const id = attr(elements(body, "w:altChunk")[0] || "", "r:id");
      const target = id && relTargets(zip).get(id);
      const buf = target && zip.read(target);
      if (!buf)
        return null;
      const html = buf.toString("utf8");
      const inner = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html);
      return inner ? inner[1] : html;
    }
    async function readOutline(absPath) {
      const parts = partsOf(absPath);
      if (!parts)
        return [];
      return headings(parts.body, parts.styles).map((h, i) => ({ title: h.title, position: i + 1 }));
    }
    function sectionXml(body, styles, position) {
      const hs = headings(body, styles);
      if (!hs.length)
        return { title: "", xml: body, total: 1, n: 1 };
      const n = clampPosition(position, hs.length);
      return {
        title: hs[n - 1].title,
        xml: body.slice(hs[n - 1].from, sectionEnd(hs, n, body.length)),
        total: hs.length,
        n
      };
    }
    async function readSection(absPath, position) {
      const parts = partsOf(absPath);
      if (!parts)
        return null;
      const sec = sectionXml(parts.body, parts.styles, position);
      const re = para();
      const body = [];
      let m;
      while ((m = re.exec(sec.xml)) && body.length <= MAX_LINES) {
        const line = clean(textIn(m[0], "w:t"));
        if (line && line !== sec.title)
          body.push(line);
      }
      return { title: sec.title, body: body.slice(0, MAX_LINES), position: sec.n, total: sec.total };
    }
    async function render(el, req) {
      const parts = partsOf(req.abs);
      if (!req.isCurrent() || !parts)
        return false;
      const loadImage = (src) => parts.zip.read(assetSrc(src));
      const chunk = altChunk(parts.zip, parts.body);
      if (chunk) {
        const done = renderHtml(el, { html: chunk, width: req.width, loadImage });
        if (done !== false)
          return done;
      } else {
        const page = documentPage(parts, req.position, req.width, req.view);
        const framed = renderFrame(el, {
          html: page.html,
          css: page.css,
          width: req.width,
          loadImage,
          onFail: () => {
            renderHtml(el, { html: page.html, width: req.width, loadImage });
          }
        });
        if (framed !== false)
          return framed;
        const done = renderHtml(el, { html: page.html, width: req.width, loadImage });
        if (done !== false)
          return done;
      }
      const sec = await readSection(req.abs, req.position);
      if (!req.isCurrent() || !sec)
        return false;
      return renderLines(el, { title: sec.title, body: sec.body, width: req.width });
    }
    var PAGE_RULES = [
      "body{margin:0;background:transparent}",
      ".page table{border-collapse:collapse}",
      ".page td,.page th{padding:2pt 4pt;vertical-align:top}",
      ".page td>p:only-child,.page th>p:only-child{margin:0}",
      ".page img{max-width:100%;height:auto}",
      ".page ul{margin:0;padding-left:1.5em}"
    ].join("\n");
    function documentPage(parts, position, width, view) {
      const sec = sectionXml(parts.body, parts.styles, position);
      const ctx = context(parts, relTargets(parts.zip));
      const body = toHtml(sec.xml, ctx);
      const page = pageCss(docxStyles.pageOf(parts.body), width, view);
      return {
        html: '<div class="page">' + body + "</div>",
        css: [PAGE_RULES, page.css, "html{zoom:" + page.zoom + "}", ctx.sheet.text()].filter(Boolean).join("\n")
      };
    }
    module2.exports = {
      id: "docx",
      // A macro-enabled document and a template are the same package: word/document.xml, read the
      // same way. Only the .doc of old Word is a different format, and it is not one of these.
      exts: ["docx", "docm", "dotx", "dotm"],
      // Word takes the fragment as part of the file name and then opens nothing at all, exactly as
      // PowerPoint does, so a link into a .docx carries no anchor.
      anchorKind: null,
      outline: readOutline,
      render,
      readOutline,
      readSection,
      headingStyles,
      headingLevel,
      headings,
      toHtml,
      documentPage,
      sectionXml,
      altChunk,
      partsOf
    };
  }
});

// src/formats/xlsx-styles.js
var require_xlsx_styles = __commonJS({
  "src/formats/xlsx-styles.js"(exports2, module2) {
    "use strict";
    var { elements, attr } = require_xml();
    var { colour } = require_css();
    function argb(el) {
      if (!el)
        return null;
      const rgb = attr(el, "rgb");
      if (!rgb)
        return null;
      const hex = rgb.length === 8 ? rgb.slice(2) : rgb;
      return colour(hex);
    }
    var at = (list, id) => id === null || id === void 0 ? null : list[Number(id)] || null;
    function readFonts(stylesXml) {
      return elements(elements(stylesXml, "fonts")[0] || "", "font").map((font) => {
        const css = {};
        if (elements(font, "b")[0])
          css["font-weight"] = "bold";
        if (elements(font, "i")[0])
          css["font-style"] = "italic";
        if (elements(font, "u")[0])
          css["text-decoration"] = "underline";
        const fg = argb(elements(font, "color")[0]);
        if (fg)
          css.color = fg;
        const size = attr(elements(font, "sz")[0] || "", "val");
        if (size)
          css["font-size"] = Math.round(Number(size) * 100) / 100 + "pt";
        return css;
      });
    }
    function readFills(stylesXml) {
      return elements(elements(stylesXml, "fills")[0] || "", "fill").map((fill) => {
        const pattern = elements(fill, "patternFill")[0] || "";
        if (!/patternType="solid"/.test(pattern))
          return {};
        const fg = argb(elements(pattern, "fgColor")[0]);
        return fg ? { background: fg } : {};
      });
    }
    var SIDE = { left: "border-left", right: "border-right", top: "border-top", bottom: "border-bottom" };
    var edgeWidth = (style) => /thick|medium/.test(style) ? "2px" : "1px";
    var edgeStyle = (style) => /dash/.test(style) ? "dashed" : /dot|hair/.test(style) ? "dotted" : /double/.test(style) ? "double" : "solid";
    function readBorders(stylesXml) {
      return elements(elements(stylesXml, "borders")[0] || "", "border").map((border) => {
        const css = {};
        for (const [side, prop] of Object.entries(SIDE)) {
          const edge = elements(border, side)[0];
          const style = edge && attr(edge, "style");
          if (!style)
            continue;
          css[prop] = edgeWidth(style) + " " + edgeStyle(style) + " " + (argb(elements(edge, "color")[0]) || "#808080");
        }
        return css;
      });
    }
    var HALIGN = { left: "left", center: "center", right: "right", justify: "justify" };
    var VALIGN = { top: "top", center: "middle", bottom: "bottom" };
    function readCellFormats(stylesXml, parts) {
      return elements(elements(stylesXml, "cellXfs")[0] || "", "xf").map((xf) => {
        const css = Object.assign(
          {},
          at(parts.fonts, attr(xf, "fontId")),
          at(parts.fills, attr(xf, "fillId")),
          at(parts.borders, attr(xf, "borderId"))
        );
        const align = elements(xf, "alignment")[0];
        if (align) {
          const h = HALIGN[attr(align, "horizontal")];
          const v = VALIGN[attr(align, "vertical")];
          if (h)
            css["text-align"] = h;
          if (v)
            css["vertical-align"] = v;
        }
        return css;
      });
    }
    function readStyles(stylesXml) {
      const xml = stylesXml || "";
      const parts = { fonts: readFonts(xml), fills: readFills(xml), borders: readBorders(xml) };
      const formats2 = readCellFormats(xml, parts);
      return { format: (s) => s === null || s === void 0 || s === "" ? {} : formats2[Number(s)] || {} };
    }
    function columnWidths(sheetXml) {
      const out = [];
      for (const col of elements(elements(sheetXml || "", "cols")[0] || "", "col")) {
        const width = Number(attr(col, "width"));
        const min = Number(attr(col, "min"));
        const max = Number(attr(col, "max"));
        if (!width || !min)
          continue;
        for (let c = min; c <= max; c++)
          out[c - 1] = { width: Math.round(width * 7) + "px" };
      }
      return out;
    }
    module2.exports = { readStyles, columnWidths, argb, readFonts, readFills, readBorders };
  }
});

// src/formats/xlsx-format.js
var require_xlsx_format = __commonJS({
  "src/formats/xlsx-format.js"(exports2, module2) {
    "use strict";
    var BUILTIN = {
      0: "General",
      1: "0",
      2: "0.00",
      3: "#,##0",
      4: "#,##0.00",
      9: "0%",
      10: "0.00%",
      11: "0.00E+00",
      12: "# ?/?",
      13: "# ??/??",
      14: "m/d/yyyy",
      15: "d-mmm-yy",
      16: "d-mmm",
      17: "mmm-yy",
      18: "h:mm AM/PM",
      19: "h:mm:ss AM/PM",
      20: "h:mm",
      21: "h:mm:ss",
      22: "m/d/yyyy h:mm",
      37: "#,##0 ;(#,##0)",
      38: "#,##0 ;[Red](#,##0)",
      39: "#,##0.00;(#,##0.00)",
      40: "#,##0.00;[Red](#,##0.00)",
      45: "mm:ss",
      46: "[h]:mm:ss",
      47: "mmss.0",
      48: "##0.0E+0",
      49: "@"
    };
    function* tokens(code) {
      for (let i = 0; i < code.length; ) {
        const ch = code[i];
        if (ch === '"') {
          const end = code.indexOf('"', i + 1);
          const to = end < 0 ? code.length : end;
          yield { literal: true, text: code.slice(i + 1, to) };
          i = to + 1;
        } else if (ch === "\\") {
          yield { literal: true, text: code[i + 1] || "" };
          i += 2;
        } else if (ch === "_") {
          yield { literal: true, text: " " };
          i += 2;
        } else if (ch === "*") {
          i += 2;
        } else if (ch === "[") {
          const end = code.indexOf("]", i);
          const to = end < 0 ? code.length : end;
          yield { bracket: code.slice(i + 1, to) };
          i = to + 1;
        } else {
          yield { text: ch };
          i += 1;
        }
      }
    }
    function sections(code) {
      const out = [[]];
      for (const t2 of tokens(code)) {
        if (!t2.literal && !t2.bracket && t2.text === ";")
          out.push([]);
        else
          out[out.length - 1].push(t2);
      }
      return out;
    }
    var CURRENCY = /^\$([^-]*)/;
    var bracketText = (body) => {
      const m = CURRENCY.exec(body);
      return m ? m[1] : "";
    };
    var DATE_CHARS = /[ymdhs]/i;
    var isDate = (parts) => parts.some((t2) => !t2.literal && !t2.bracket && DATE_CHARS.test(t2.text));
    var pad = (n, w) => String(Math.floor(Math.abs(n))).padStart(w, "0");
    var dateOf = (serial) => new Date(Math.round((serial - 25569) * 864e5));
    var MONTHS = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December"
    ];
    var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    var LONG_AMPM = /^am\/pm$/i;
    var SHORT_AMPM = /^a\/p$/i;
    function dateParts(parts) {
      const spelled = (at, n) => parts.slice(at, at + n).map((p) => p.literal || p.bracket !== void 0 ? " " : p.text).join("");
      const out = [];
      for (let i = 0; i < parts.length; ) {
        const t2 = parts[i];
        const marker = LONG_AMPM.test(spelled(i, 5)) ? 5 : SHORT_AMPM.test(spelled(i, 3)) ? 3 : 0;
        if (marker && !t2.literal && t2.bracket === void 0) {
          out.push({ ampm: marker === 3 });
          i += marker;
        } else if (t2.literal || t2.bracket !== void 0 || !DATE_CHARS.test(t2.text)) {
          out.push(t2);
          i += 1;
        } else {
          const last = out[out.length - 1];
          if (last && last.date && last.text[0].toLowerCase() === t2.text.toLowerCase())
            last.text += t2.text;
          else
            out.push({ date: true, text: t2.text });
          i += 1;
        }
      }
      return out;
    }
    function formatDate(serial, parts) {
      const d = dateOf(serial);
      if (Number.isNaN(d.getTime()))
        return null;
      const run = dateParts(parts);
      const twelve = run.some((t2) => t2.ampm !== void 0);
      const hours = twelve ? d.getUTCHours() % 12 || 12 : d.getUTCHours();
      const near = (i, step) => {
        for (let j = i + step; j >= 0 && j < run.length; j += step) {
          if (run[j].date)
            return run[j].text[0].toLowerCase();
        }
        return "";
      };
      let out = "";
      run.forEach((t2, i) => {
        if (t2.bracket !== void 0)
          return;
        if (t2.ampm !== void 0) {
          out += (d.getUTCHours() < 12 ? "AM" : "PM").slice(0, t2.ampm ? 1 : 2);
          return;
        }
        if (!t2.date) {
          out += t2.text;
          return;
        }
        const code = t2.text.toLowerCase();
        const n = code.length;
        if (code[0] === "y")
          out += n <= 2 ? pad(d.getUTCFullYear() % 100, 2) : String(d.getUTCFullYear());
        else if (code[0] === "d") {
          if (n >= 4)
            out += DAYS[d.getUTCDay()];
          else if (n === 3)
            out += DAYS[d.getUTCDay()].slice(0, 3);
          else
            out += n === 2 ? pad(d.getUTCDate(), 2) : String(d.getUTCDate());
        } else if (code[0] === "h")
          out += n >= 2 ? pad(hours, 2) : String(hours);
        else if (code[0] === "s")
          out += n >= 2 ? pad(d.getUTCSeconds(), 2) : String(d.getUTCSeconds());
        else if (code[0] === "m" && (near(i, -1) === "h" || near(i, 1) === "s")) {
          out += n >= 2 ? pad(d.getUTCMinutes(), 2) : String(d.getUTCMinutes());
        } else if (n >= 4)
          out += MONTHS[d.getUTCMonth()];
        else if (n === 3)
          out += MONTHS[d.getUTCMonth()].slice(0, 3);
        else
          out += n === 2 ? pad(d.getUTCMonth() + 1, 2) : String(d.getUTCMonth() + 1);
      });
      return out;
    }
    var PLACEHOLDER = /[0#?]/;
    function shape(parts) {
      let digits = "";
      let percent = 0;
      const before = [];
      const after = [];
      for (const t2 of parts) {
        if (t2.bracket !== void 0) {
          (digits ? after : before).push(bracketText(t2.bracket));
          continue;
        }
        if (t2.literal) {
          (digits ? after : before).push(t2.text);
          continue;
        }
        if (t2.text === "%") {
          percent += 1;
          (digits ? after : before).push("%");
          continue;
        }
        if (PLACEHOLDER.test(t2.text) || t2.text === "." || t2.text === "," && digits) {
          digits += t2.text;
          continue;
        }
        (digits ? after : before).push(t2.text);
      }
      return { digits, percent, before: before.join(""), after: after.join("") };
    }
    function digitsOf(value, digits) {
      const dot = digits.indexOf(".");
      const whole = (dot < 0 ? digits : digits.slice(0, dot)).replace(/,/g, "");
      const fraction = dot < 0 ? "" : digits.slice(dot + 1).replace(/,/g, "");
      const decimals = (fraction.match(/[0#?]/g) || []).length;
      const grouped = /,/.test(dot < 0 ? digits : digits.slice(0, dot));
      const scale = (/[0#?](,+)$/.exec(digits.replace(/\..*$/, "")) || [, ""])[1].length;
      let n = Math.abs(value) / Math.pow(1e3, scale);
      const text = n.toFixed(decimals);
      let [int, frac] = text.split(".");
      const least = (whole.match(/0/g) || []).length;
      if (int === "0" && !least)
        int = "";
      else
        int = int.padStart(least, "0");
      if (grouped)
        int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return int + (frac ? "." + frac : "");
    }
    var UNTRANSLATED = (parts) => parts.some((t2) => !t2.literal && t2.bracket === void 0 && /[eE/]/.test(t2.text));
    function applySection(value, parts) {
      if (isDate(parts))
        return formatDate(value, parts);
      if (UNTRANSLATED(parts))
        return null;
      const { digits, percent, before, after } = shape(parts);
      if (!PLACEHOLDER.test(digits))
        return before + after || null;
      return before + digitsOf(value * Math.pow(100, percent), digits) + after;
    }
    var plain = (n) => String(Number(n.toPrecision(11)));
    function format(value, code) {
      const n = Number(value);
      if (!Number.isFinite(n))
        return null;
      if (!code || /general/i.test(code))
        return plain(n);
      const parts = sections(code);
      const negative = n < 0 && parts.length > 1;
      const zero = n === 0 && parts.length > 2;
      const out = applySection(n, parts[negative ? 1 : zero ? 2 : 0]);
      if (out === null)
        return plain(n);
      return (n < 0 && !negative ? "-" + out : out).trim();
    }
    var codeFor = (id, custom) => (custom && custom[id] !== void 0 ? custom[id] : BUILTIN[id]) || null;
    module2.exports = { format, codeFor, BUILTIN };
  }
});

// src/formats/xlsx.js
var require_xlsx = __commonJS({
  "src/formats/xlsx.js"(exports2, module2) {
    "use strict";
    var { openZip } = require_zip();
    var { elements, attr, textIn, decodeEntities } = require_xml();
    var { renderLines, renderHtml, renderFrame } = require_preview();
    var { clampPosition, normPath, gridToHtml, cellText: textOf, spanning, COVERED, MAX_ROWS, MAX_COLS } = require_util();
    var { sheet: cssSheet, SHEET_RULES } = require_css();
    var xlsxStyles = require_xlsx_styles();
    var xlsxFormat = require_xlsx_format();
    var MAX_LINES = 60;
    var SHEET_RE = /^xl\/worksheets\/sheet(\d+)\.xml$/;
    var clean = (s) => decodeEntities(s).replace(/\s+/g, " ").trim();
    function colIndex(ref) {
      let n = 0;
      for (const ch of String(ref).toUpperCase()) {
        const code = ch.charCodeAt(0);
        if (code < 65 || code > 90)
          break;
        n = n * 26 + (code - 64);
      }
      return n - 1;
    }
    function sheetParts(zip) {
      const rels = /* @__PURE__ */ new Map();
      for (const r of elements(zip.text("xl/_rels/workbook.xml.rels") || "", "Relationship")) {
        const id = attr(r, "Id");
        const target = attr(r, "Target");
        if (id && target)
          rels.set(id, normPath("xl/" + target.replace(/^\/+/, "")));
      }
      const out = [];
      for (const sheet of elements(elements(zip.text("xl/workbook.xml") || "", "sheets")[0] || "", "sheet")) {
        const name = attr(sheet, "name");
        const part = rels.get(attr(sheet, "r:id"));
        if (name && part && zip.has(part))
          out.push({ name, part });
      }
      if (out.length)
        return out;
      return zip.names().filter((n) => SHEET_RE.test(n)).sort((a, b) => Number(SHEET_RE.exec(a)[1]) - Number(SHEET_RE.exec(b)[1])).map((part, i) => ({ name: "Sheet" + (i + 1), part }));
    }
    var sharedStrings = (zip) => elements(zip.text("xl/sharedStrings.xml") || "", "si").map((si) => clean(textIn(si, "t")));
    function numberFormats(stylesXml) {
      const custom = {};
      for (const fmt of elements(stylesXml || "", "numFmt")) {
        const id = attr(fmt, "numFmtId");
        if (id)
          custom[id] = attr(fmt, "formatCode") || "";
      }
      return elements(elements(stylesXml || "", "cellXfs")[0] || "", "xf").map((xf) => xlsxFormat.codeFor(attr(xf, "numFmtId") || "0", custom));
    }
    function cellText(cell, book) {
      const type = attr(cell, "t");
      if (type === "inlineStr")
        return clean(textIn(cell, "t"));
      const raw = clean(textIn(cell, "v"));
      if (!raw)
        return "";
      if (type === "s")
        return book.strings[Number(raw)] || "";
      if (type === "b")
        return raw === "0" ? "FALSE" : "TRUE";
      if (type === "e" || type === "str")
        return raw;
      const shown = xlsxFormat.format(raw, (book.formats || [])[Number(attr(cell, "s") || "0")]);
      return shown === null ? raw : shown;
    }
    function makeCell(cell, book, ctx) {
      const text = cellText(cell, book);
      if (!ctx || !ctx.sheet)
        return text;
      const cls = ctx.sheet.cls(book.styles.format(attr(cell, "s")));
      return cls ? { text, cls } : text;
    }
    var NO_STYLES = { format: () => ({}) };
    var rowIndex = (ref) => (parseInt(String(ref).replace(/^[A-Za-z]+/, ""), 10) || 0) - 1;
    function applyMerges(grid, sheetXml, firstRow) {
      for (const m of elements(elements(sheetXml, "mergeCells")[0] || "", "mergeCell")) {
        const [from, to] = String(attr(m, "ref") || "").split(":");
        if (!to)
          continue;
        const top = rowIndex(from) - firstRow;
        const bottom = rowIndex(to) - firstRow;
        const left = colIndex(from);
        const right = Math.min(colIndex(to), left + MAX_COLS);
        if (top < 0 || left < 0 || !grid[top])
          continue;
        grid[top][left] = spanning(grid[top][left], right - left + 1, bottom - top + 1);
        for (let r = top; r <= bottom && grid[r]; r++) {
          for (let c = left; c <= right; c++)
            if (r !== top || c !== left)
              grid[r][c] = COVERED;
        }
      }
      return grid;
    }
    function sheetGrid(sheetXml, book, ctx) {
      if (!book.styles) {
        book = { strings: book.strings || [], formats: book.formats || [], styles: NO_STYLES };
      }
      const rows = /* @__PURE__ */ new Map();
      for (const row of elements(sheetXml, "row")) {
        const cells = [];
        for (const cell of elements(row, "c")) {
          const at = colIndex(attr(cell, "r") || "");
          if (at >= 0 && at < MAX_COLS * 4)
            cells[at] = makeCell(cell, book, ctx);
        }
        if (!cells.some((c) => textOf(c)))
          continue;
        rows.set(parseInt(attr(row, "r") || "0", 10) || rows.size + 1, cells);
        if (rows.size >= MAX_ROWS)
          break;
      }
      if (!rows.size)
        return [];
      const keys = [...rows.keys()];
      const first = Math.min(...keys);
      const out = [];
      for (let r = first; r <= Math.max(...keys) && out.length < MAX_ROWS; r++) {
        const cells = rows.get(r) || [];
        out.push(Array.from({ length: cells.length }, (_, i) => cells[i] || ""));
      }
      return applyMerges(out, sheetXml, first - 1);
    }
    function bookOf(absPath) {
      const zip = openZip(absPath);
      if (!zip)
        return null;
      const sheets = sheetParts(zip);
      if (!sheets.length)
        return null;
      const stylesXml = zip.text("xl/styles.xml");
      return {
        zip,
        sheets,
        strings: sharedStrings(zip),
        formats: numberFormats(stylesXml),
        styles: xlsxStyles.readStyles(stylesXml)
      };
    }
    var gridAt = (book, position, ctx) => {
      const n = clampPosition(position, book.sheets.length);
      const sheetXml = book.zip.text(book.sheets[n - 1].part) || "";
      return { n, name: book.sheets[n - 1].name, sheetXml, grid: sheetGrid(sheetXml, book, ctx) };
    };
    async function readOutline(absPath) {
      const book = bookOf(absPath);
      return book ? book.sheets.map((s, i) => ({ title: s.name, position: i + 1 })) : [];
    }
    async function readSection(absPath, position) {
      const book = bookOf(absPath);
      if (!book)
        return null;
      const { n, name, grid } = gridAt(book, position);
      const lines = grid.map((cells) => cells.map(textOf).filter(Boolean).join(" \xB7 ")).filter(Boolean);
      return { title: name, body: lines.slice(0, MAX_LINES), position: n, total: book.sheets.length };
    }
    async function render(el, req) {
      const book = bookOf(req.abs);
      if (!req.isCurrent() || !book)
        return false;
      const ctx = { sheet: cssSheet("x") };
      const { name, sheetXml, grid } = gridAt(book, req.position, ctx);
      const html = gridToHtml(grid, { header: false, cols: xlsxStyles.columnWidths(sheetXml) });
      if (html) {
        const css = [SHEET_RULES, ctx.sheet.text()].join("\n");
        const framed = renderFrame(el, {
          html,
          css,
          width: req.width,
          onFail: () => {
            renderHtml(el, { html, width: req.width, css });
          }
        });
        if (framed !== false)
          return framed;
        const done = renderHtml(el, { html, width: req.width, css });
        if (done !== false)
          return done;
      }
      const lines = grid.map((cells) => cells.map(textOf).filter(Boolean).join(" \xB7 ")).filter(Boolean);
      return renderLines(el, { title: name, body: lines.slice(0, MAX_LINES), width: req.width });
    }
    module2.exports = {
      id: "xlsx",
      exts: ["xlsx", "xlsm", "xltx", "xltm"],
      // Excel takes the fragment as part of the file name, exactly as Word and PowerPoint do.
      anchorKind: null,
      outline: readOutline,
      render,
      readOutline,
      readSection,
      sheetParts,
      sheetGrid,
      bookOf,
      gridAt,
      colIndex,
      numberFormats
    };
  }
});

// src/formats/csv.js
var require_csv = __commonJS({
  "src/formats/csv.js"(exports2, module2) {
    "use strict";
    var fs2 = require("fs");
    var { renderLines, renderHtml } = require_preview();
    var { gridToHtml, MAX_ROWS, MAX_COLS } = require_util();
    var { SHEET_RULES } = require_css();
    var MAX_LINES = 60;
    function delimiter(text, ext) {
      if (ext === "tsv")
        return "	";
      const line = text.slice(0, text.indexOf("\n") + 1 || text.length);
      const count = (ch) => line.split(ch).length - 1;
      const tabs = count("	");
      const semis = count(";");
      const commas = count(",");
      if (tabs >= semis && tabs >= commas && tabs)
        return "	";
      if (semis > commas)
        return ";";
      return ",";
    }
    function parse(text, sep) {
      const rows = [];
      let row = [];
      let field = "";
      let quoted = false;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
          if (c === '"') {
            if (text[i + 1] === '"') {
              field += '"';
              i++;
            } else
              quoted = false;
          } else
            field += c;
        } else if (c === '"') {
          quoted = true;
        } else if (c === sep) {
          row.push(field);
          field = "";
        } else if (c === "\n" || c === "\r") {
          if (c === "\r" && text[i + 1] === "\n")
            i++;
          row.push(field);
          rows.push(row);
          row = [];
          field = "";
          if (rows.length > MAX_ROWS + 1)
            break;
        } else
          field += c;
      }
      if (field !== "" || row.length) {
        row.push(field);
        rows.push(row);
      }
      return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
    }
    function grid(absPath, ext) {
      let text;
      try {
        text = fs2.readFileSync(absPath, "utf8").replace(/^﻿/, "");
      } catch (e) {
        return null;
      }
      if (!text.trim())
        return [];
      const rows = parse(text, delimiter(text, ext));
      return rows.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS).map((c) => c.trim()));
    }
    async function render(el, req) {
      const rows = grid(req.abs, req.ext);
      if (!req.isCurrent() || !rows)
        return false;
      const html = gridToHtml(rows, { header: rows.length > 1 });
      if (html) {
        const done = renderHtml(el, { html, width: req.width, css: SHEET_RULES });
        if (done !== false)
          return done;
      }
      const lines = rows.map((r) => r.filter(Boolean).join(" \xB7 ")).filter(Boolean);
      return renderLines(el, { title: "", body: lines.slice(0, MAX_LINES), width: req.width });
    }
    module2.exports = {
      id: "csv",
      exts: ["csv", "tsv"],
      // A CSV is opened in whatever the OS hands .csv to; there is no page to land on.
      anchorKind: null,
      render,
      parse,
      delimiter,
      grid
    };
  }
});

// src/formats/index.js
var require_formats = __commonJS({
  "src/formats/index.js"(exports2, module2) {
    "use strict";
    var pdf = require_pdf2();
    var image = require_image();
    var pptx = require_pptx();
    var html = require_html();
    var text = require_text();
    var epub = require_epub();
    var media = require_media();
    var odf = require_odf();
    var docx = require_docx();
    var xlsx = require_xlsx();
    var csv = require_csv();
    var HANDLERS = [pdf, image, pptx, html, text, epub, media, odf, docx, xlsx, csv];
    var byExt = /* @__PURE__ */ new Map();
    for (const h of HANDLERS)
      for (const e of h.exts)
        byExt.set(e, h);
    var handlerFor = (ext) => byExt.get(String(ext || "").toLowerCase()) || null;
    var knownExtensions = () => [...byExt.keys()].map((e) => "." + e).sort();
    var formatGroups = () => HANDLERS.map((h) => ({ id: h.id, exts: h.exts.map((e) => "." + e) }));
    var canOutline = (ext) => {
      const h = handlerFor(ext);
      return !!(h && h.outline);
    };
    var canPreview = (ext) => {
      const h = handlerFor(ext);
      return !!(h && h.render);
    };
    var anchorKind = (ext) => {
      const h = handlerFor(ext);
      return h && h.anchorKind || null;
    };
    var anchorFor = (entry) => {
      const h = handlerFor(entry && entry.lang);
      if (!h || !h.anchorFor)
        return null;
      return h.anchorFor(entry) || null;
    };
    var hasOsAnchor = (ext) => anchorKind(ext) !== null;
    var positionUnit = (ext) => {
      const h = handlerFor(ext);
      return h && h.positionUnit || "page";
    };
    var positionLabel = (ext, n, to) => {
      if (!(n > 1) && !(to > 1))
        return null;
      const h = handlerFor(ext);
      return h && h.positionLabel ? h.positionLabel(n, to) : null;
    };
    async function outline(ext, absPath) {
      const h = handlerFor(ext);
      if (!h || !h.outline)
        return [];
      try {
        return await h.outline(absPath, ext);
      } catch (e) {
        return [];
      }
    }
    async function render(el, req) {
      const h = handlerFor(req.ext);
      if (!h || !h.render)
        return false;
      try {
        return await h.render(el, req);
      } catch (e) {
        return false;
      }
    }
    async function dispose() {
      for (const h of HANDLERS) {
        if (!h.dispose)
          continue;
        try {
          await h.dispose();
        } catch (e) {
        }
      }
    }
    module2.exports = {
      handlerFor,
      knownExtensions,
      formatGroups,
      canOutline,
      canPreview,
      anchorKind,
      anchorFor,
      hasOsAnchor,
      positionUnit,
      positionLabel,
      outline,
      render,
      dispose
    };
  }
});

// src/suggest.js
var require_suggest2 = __commonJS({
  "src/suggest.js"(exports2, module2) {
    "use strict";
    var nodePath2 = require("path");
    var { createSigilSuggest } = require_suggest();
    var formats2 = require_formats();
    var baseName = (p) => nodePath2.basename(p).replace(/\.[^.]+$/, "");
    var ReferenceSuggest2 = createSigilSuggest({
      cls: "reference-linker",
      kindText: (e) => {
        if (e.kind !== "section")
          return e.lang;
        return formats2.anchorKind(e.lang) === "page" ? "p." + e.position : baseName(e.path);
      }
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
    var formats2 = require_formats();
    var { Popover } = require_popover();
    var PREVIEW_WIDTH = 420;
    var keyOf = (e) => e.path + ":" + (e.position || e.line || 1);
    var HoverPreview2 = class {
      constructor(plugin) {
        this.plugin = plugin;
        this.cleanup = null;
        this.pop = new Popover({
          cls: "reference-linker-hover",
          hiddenCls: "reference-linker-hidden",
          onHide: () => this.release(),
          onDestroy: () => this.release()
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
      // Skip types no handler can draw, so nothing schedules for them.
      previewable(entry) {
        return formats2.canPreview(entry.lang);
      }
      schedule(entry, x, y) {
        this.pop.cancelHide();
        if (!this.previewable(entry))
          return;
        this.pop.schedule(keyOf(entry), x, y, (el, ctx) => this.build(entry, el, ctx));
      }
      async build(entry, el, ctx) {
        const root = this.plugin.codeRoot();
        const abs = root ? nodePath2.join(root, entry.path) : entry.path;
        const ext = (entry.lang || "").toLowerCase();
        const position = entry.position || 1;
        const label = entry.title || entry.name;
        const pos = formats2.positionLabel(ext, position);
        el.createDiv({ cls: "reference-linker-hover-header", text: pos ? label + "  \xB7  " + pos : label });
        const body = el.createDiv({ cls: "reference-linker-hover-body" });
        this.release();
        const cleanup = await formats2.render(body, {
          abs,
          ext,
          position,
          width: PREVIEW_WIDTH,
          view: this.plugin.settings.documentView,
          app: this.plugin.app,
          component: this.plugin,
          isCurrent: () => ctx.isCurrent()
        });
        if (cleanup === false)
          return false;
        this.cleanup = cleanup || null;
        return void 0;
      }
      release() {
        if (this.cleanup) {
          try {
            this.cleanup();
          } catch (e) {
          }
          this.cleanup = null;
        }
      }
    };
    module2.exports = { HoverPreview: HoverPreview2 };
  }
});

// src/embed.js
var require_embed = __commonJS({
  "src/embed.js"(exports2, module2) {
    "use strict";
    var { MarkdownRenderChild, Menu } = require("obsidian");
    var nodePath2 = require("path");
    var formats2 = require_formats();
    var { t: t2 } = require_i18n();
    var EMBED_LANG = "reference-link";
    var DEFAULT_WIDTH = 600;
    var MAX_RANGE = 20;
    var baseName = (p) => nodePath2.basename(p).replace(/\.[^.]+$/, "");
    var looksLikePath = (s) => s.includes("/") || s.includes("\\") || /\.[a-z0-9]+$/i.test(s);
    function parseSpan(s) {
      const m = /^(\d+)\s*[-–]\s*(\d+)$/.exec(s) || /^(\d+)$/.exec(s);
      if (!m)
        return null;
      const from = parseInt(m[1], 10);
      return { from, to: Math.max(from, m[2] ? parseInt(m[2], 10) : from) };
    }
    function parseTimecode(s) {
      const t3 = String(s).trim();
      if (/^\d+$/.test(t3))
        return parseInt(t3, 10);
      const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(t3);
      if (!m)
        return null;
      return parseInt(m[1] || "0", 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
    }
    function parseSpec(source) {
      const spec = { target: "", page: "", time: "", width: "", title: "" };
      for (const raw of source.split("\n")) {
        const line = raw.trim();
        if (!line)
          continue;
        const m = /^(page|time|width|title)\s*:\s*(.*)$/i.exec(line);
        if (m)
          spec[m[1].toLowerCase()] = m[2].trim();
        else if (!spec.target)
          spec.target = line;
      }
      return spec;
    }
    function splitTarget2(target) {
      const h = target.indexOf("#");
      if (h >= 0)
        return { path: target.slice(0, h), frag: target.slice(h + 1).trim() };
      const m = /^(.+?):(\d+(?:-\d+)?)\s*$/.exec(target);
      if (m)
        return { path: m[1], frag: "at=" + m[2] };
      return { path: target, frag: "" };
    }
    function resolve(plugin, spec) {
      const target = spec.target;
      if (!target)
        return { error: t2("embed.empty") };
      const { path: rawPath, frag } = splitTarget2(target);
      let relPath, name = null, position = null, to = null, anchor = null;
      const byPath = looksLikePath(rawPath);
      if (byPath) {
        const norm = rawPath.split("\\").join("/").replace(/^\.?\//, "");
        const hit = plugin.lookup(norm)[0];
        relPath = hit ? hit.path : norm;
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
        position = e.position;
      }
      const ext = nodePath2.extname(relPath).slice(1).toLowerCase();
      const timed = formats2.positionUnit(ext) === "time";
      const wrongUnit = () => ({ error: t2(timed ? "embed.needsTime" : "embed.needsPage", { path: relPath }) });
      if (byPath && frag) {
        const pm = /^page=(\d+(?:[-–]\d+)?)$/i.exec(frag);
        const tm = /^t=(.+)$/i.exec(frag);
        const legacy = /^at=(\d+(?:-\d+)?)$/i.exec(frag);
        if (legacy) {
          const sp = parseSpan(legacy[1]);
          position = sp.from;
          to = timed ? sp.from : sp.to;
        } else if (pm) {
          if (timed)
            return wrongUnit();
          const sp = parseSpan(pm[1]);
          position = sp.from;
          to = sp.to;
        } else if (tm) {
          if (!timed)
            return wrongUnit();
          const at = parseTimecode(tm[1]);
          if (at == null)
            return wrongUnit();
          position = at;
          to = at;
        } else {
          anchor = frag;
        }
      }
      if (anchor) {
        const sec = plugin.entriesIn(relPath).find((x) => x.kind === "section" && x.anchor === anchor);
        if (!sec)
          return { error: t2("embed.notFound", { query: target }) };
        position = sec.position;
        name = sec.name;
      }
      if (spec.page) {
        if (timed)
          return wrongUnit();
        const span = parseSpan(spec.page);
        if (span) {
          position = span.from;
          to = span.to;
        }
      }
      if (spec.time) {
        if (!timed)
          return wrongUnit();
        const at = parseTimecode(spec.time);
        if (at == null)
          return wrongUnit();
        position = at;
        to = at;
      }
      position = position || 1;
      to = to && to >= position ? to : position;
      if (!formats2.canOutline(ext))
        to = position;
      to = Math.min(to, position + MAX_RANGE - 1);
      if (name === null) {
        const sec = position === to && plugin.entriesIn(relPath).find((x) => x.kind === "section" && x.position === position);
        name = sec ? sec.name : baseName(relPath);
      }
      const root = plugin.codeRoot();
      const absPath = root ? nodePath2.join(root, relPath) : relPath;
      const kind = position > 1 || to > position ? "section" : "file";
      return { absPath, relPath, ext, position, to, name, entry: { name, kind, path: relPath, line: position, position } };
    }
    var ReferenceEmbed = class extends MarkdownRenderChild {
      constructor(containerEl, plugin, spec) {
        super(containerEl);
        this.plugin = plugin;
        this.spec = spec;
        this.renderId = 0;
        this.cleanup = null;
      }
      onload() {
        this.containerEl.addEventListener("contextmenu", (evt) => this.onContextMenu(evt));
        this.render();
        this.unsub = this.plugin.onIndexChange(() => this.render());
      }
      onunload() {
        if (this.unsub)
          this.unsub();
        this.release();
      }
      // Open the embedded document where it points — the same path the open/insert commands use.
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
      release() {
        if (this.cleanup) {
          try {
            this.cleanup();
          } catch (e) {
          }
          this.cleanup = null;
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
        const sig = res.error ? "err:" + res.error : res.absPath + "|" + res.position + "-" + res.to + "|" + mtime + "|" + this.width();
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
        const pos = formats2.positionLabel(res.ext, res.position, res.to);
        header.createSpan({ text: this.spec.title || res.name + (pos ? "  \xB7  " + pos : "") });
        header.addEventListener("click", () => this.open());
        const body = el.createDiv({ cls: "reference-linker-embed-body" });
        if (!formats2.canPreview(res.ext)) {
          this.notice("reference-linker-embed-error", t2("embed.unsupported", { path: res.relPath }));
          this.lastSig = null;
          return;
        }
        this.release();
        const cleanups = [];
        let drew = false;
        for (let p = res.position; p <= res.to; p++) {
          const slot = res.to > res.position ? body.createDiv({ cls: "reference-linker-embed-slot" }) : body;
          const cleanup = await formats2.render(slot, {
            abs: res.absPath,
            ext: res.ext,
            position: p,
            width: this.width(),
            view: this.plugin.settings.documentView,
            app: this.plugin.app,
            component: this,
            isCurrent: () => token === this.renderId
          });
          if (token !== this.renderId) {
            if (typeof cleanup === "function") {
              try {
                cleanup();
              } catch (e) {
              }
            }
            cleanups.forEach((c) => {
              try {
                c();
              } catch (e) {
              }
            });
            return;
          }
          if (cleanup !== false)
            drew = true;
          if (typeof cleanup === "function")
            cleanups.push(cleanup);
        }
        if (!drew) {
          this.fail(res);
          return;
        }
        this.cleanup = cleanups.length ? () => cleanups.forEach((c) => {
          try {
            c();
          } catch (e) {
          }
        }) : null;
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
    module2.exports = { registerEmbed: registerEmbed2, resolve, splitTarget: splitTarget2, parseSpan, parseSpec, parseTimecode };
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
    var { parseBinding: parseBinding2, ownsBinding: ownsBinding2 } = require_binding();
    var shared = require_actualize();
    var preview = require_update_preview();
    var OWNER2 = "reference";
    var PREVIEW_CLASS = "reference-linker-preview";
    var POS_RE = /([#?&])(page|t)=\d+/i;
    var withFix = (plugin, url, r) => {
      const out = r.path ? plugin.retargetUrl(url, r.path) : url;
      if (out == null)
        return null;
      if (r.anchor != null)
        return out.replace(/#.*$/, "") + "#" + r.anchor;
      if (r.line == null)
        return out;
      return POS_RE.test(out) ? out.replace(POS_RE, (_, sep, key) => sep + key + "=" + r.line) : out + "#page=" + r.line;
    };
    var fileNameIn = (plugin, url) => plugin.decodeTarget(url).split(/[#?]/)[0].split("/").filter(Boolean).pop() || "\u2014";
    var movedFrom = (plugin, url, r) => {
      if (r.path)
        return fileNameIn(plugin, url);
      return r.anchor != null ? plugin.targetAnchor(url) || "\u2014" : String(plugin.targetPosition(url));
    };
    var movedTo = (r) => r.path ? r.path : r.anchor != null ? r.anchor : String(r.line);
    var rewriteUpdates = (plugin, text, selected) => {
      const collect = selected == null;
      const changes = [];
      const broken = [];
      let key = 0;
      const links = rewriteLinks(text, (name, target) => {
        const r = bindStateOf(plugin, target);
        if (r && r.state === "stale") {
          const { url, title } = splitTarget2(target);
          const fixed = withFix(plugin, url, r);
          if (fixed == null) {
            if (collect)
              broken.push(name);
            return null;
          }
          const k = key++;
          if (collect)
            changes.push({ key: k, label: name, from: movedFrom(plugin, url, r), to: movedTo(r) });
          if (!collect && !selected.has(k))
            return null;
          return "[" + name + "](" + withTitle2(fixed, title) + ")";
        }
        if (collect && r && r.state === "broken")
          broken.push(name);
        return null;
      });
      return { newText: links.text, count: links.count, changes, broken };
    };
    var pinLinksInText = (plugin, text) => rewriteLinks(text, (name, target) => {
      const { url, title } = splitTarget2(target);
      if (title && !ownsBinding2(title, OWNER2))
        return null;
      const opt = plugin.pinOptionFor(url, title);
      return opt ? "[" + name + "](" + withTitle2(url, opt.title) + ")" : null;
    });
    var { refreshStaleLinks } = shared;
    var staleLinksExtension = (plugin) => shared.staleLinksExtension(plugin, { stale: "reference-linker-stale", broken: "reference-linker-broken" });
    function bindStateOf(plugin, target) {
      const { url, title } = splitTarget2(target);
      if (!url || !/^file:\/\//i.test(url))
        return null;
      const b = ownsBinding2(title, OWNER2) ? parseBinding2(title) : null;
      return b ? plugin.urlBindState(url, b, plugin.targetPosition(url)) : null;
    }
    var methods = {
      linkState(target) {
        const r = bindStateOf(this, target);
        return r ? r.state : null;
      },
      isLinkStale(target) {
        return this.linkState(target) === "stale";
      },
      // The link with its position corrected, or null when there's nothing to fix. The binding
      // rides along.
      actualizedTarget(target) {
        const r = bindStateOf(this, target);
        if (!r || r.state !== "stale")
          return null;
        const { url, title } = splitTarget2(target);
        const fixed = withFix(this, url, r);
        return fixed == null ? null : withTitle2(fixed, title);
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
    module2.exports = { methods, staleLinksExtension, refreshStaleLinks, rewriteUpdates, pinLinksInText };
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

// src/shared/suggest-base.js
var require_suggest_base = __commonJS({
  "src/shared/suggest-base.js"(exports2, module2) {
    "use strict";
    var { AbstractInputSuggest } = require("obsidian");
    var PathSuggestBase = class extends AbstractInputSuggest {
      constructor(app, inputEl, onSelect) {
        super(app, inputEl);
        this.app = app;
        this.inputEl = inputEl;
        this.onSelect = onSelect;
      }
      // A vault completer deals in TFile/TFolder, a disk one in plain paths.
      pathOf(item) {
        return typeof item === "string" ? item : item.path;
      }
      match(items, query, limit) {
        const q = String(query == null ? "" : query).replace(/\\/g, "/").toLowerCase();
        const hit = items.filter((i) => this.pathOf(i).toLowerCase().includes(q));
        return limit ? hit.slice(0, limit) : hit;
      }
      renderSuggestion(item, el) {
        el.setText(this.pathOf(item) || "/");
      }
      // onSelect clears the box instead of keeping the pick: the folder-list editor adds it as a
      // row rather than binding the input to one value.
      selectSuggestion(item) {
        const path = this.pathOf(item);
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
    var suggestAvailable = () => typeof AbstractInputSuggest === "function";
    var SUGGEST_LIMIT = 50;
    module2.exports = { PathSuggestBase, suggestAvailable, SUGGEST_LIMIT };
  }
});

// src/shared/deeplink/disk-suggest.js
var require_disk_suggest = __commonJS({
  "src/shared/deeplink/disk-suggest.js"(exports2, module2) {
    "use strict";
    var fs2 = require("fs");
    var nodePath2 = require("path");
    var { PathSuggestBase, suggestAvailable, SUGGEST_LIMIT } = require_suggest_base();
    var DiskPathSuggest = class extends PathSuggestBase {
      constructor(app, inputEl, opts) {
        const o = opts || {};
        super(app, inputEl, o.onSelect);
        this.getRoot = o.getRoot;
        this.getSeed = o.getSeed;
        this.exts = o.exts && o.exts.length ? new Set(o.exts.map((e) => e.toLowerCase())) : null;
      }
      entries(dir) {
        try {
          return fs2.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
        } catch (e) {
          return [];
        }
      }
      // Every wanted file under `base`, root-relative. Walked once per completer and kept: the
      // filtering runs per keystroke, and a document library is too big to re-read that often.
      files(base) {
        if (this.cache && this.cacheBase === base)
          return this.cache;
        const out = [];
        const walk = (dir, rel) => {
          let items = [];
          try {
            items = fs2.readdirSync(dir, { withFileTypes: true });
          } catch (e) {
            return;
          }
          for (const e of items) {
            if (e.name[0] === ".")
              continue;
            const r = rel ? rel + "/" + e.name : e.name;
            if (e.isDirectory())
              walk(nodePath2.join(dir, e.name), r);
            else if (this.exts.has(nodePath2.extname(e.name).toLowerCase()))
              out.push(r);
          }
        };
        walk(base, "");
        this.cacheBase = base;
        this.cache = out.sort();
        return this.cache;
      }
      getSuggestions(query) {
        const base = this.getRoot ? this.getRoot() : "";
        if (this.exts)
          return this.match(this.files(base), query, SUGGEST_LIMIT);
        const q = String(query == null ? "" : query).replace(/\\/g, "/");
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
        return this.entries(scanDir).filter((name) => name.toLowerCase().includes(partial)).map((name) => stem ? stem + "/" + name : name).sort().slice(0, SUGGEST_LIMIT);
      }
    };
    module2.exports = { DiskPathSuggest, suggestAvailable };
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
    var { t: t2 } = require_i18n();
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
    function indexForPrecedence(others, self, value) {
      const hypothetical = { precedence: value, id: self.id };
      return others.filter((o) => outranks(o, hypothetical)).length;
    }
    function precedenceForIndex(app, self, index) {
      const others = rankedLinkers(app).filter((p) => p.id !== self.id);
      if (!others.length)
        return self.precedence || 0;
      const at = Math.max(0, Math.min(index, others.length));
      const values = others.map((p) => p.precedence || 0);
      const candidates = [values[0] + STEP, values[values.length - 1] - STEP];
      for (let i = 1; i < values.length; i++) {
        if (values[i - 1] !== values[i])
          candidates.push((values[i - 1] + values[i]) / 2);
      }
      for (const v of values)
        candidates.push(v);
      const from = currentIndex(app, self);
      const wanted = Math.sign(at - from);
      let best = null;
      let bestLanded = null;
      for (const v of candidates) {
        const landed = indexForPrecedence(others, self, v);
        if (landed === at)
          return v;
        if (Math.sign(landed - from) !== wanted)
          continue;
        if (best === null || Math.abs(landed - at) < Math.abs(bestLanded - at)) {
          best = v;
          bestLanded = landed;
        }
      }
      return best === null ? self.precedence || 0 : best;
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
    function renderPrecedenceSetting(containerEl, opts) {
      renderPrecedence(containerEl, {
        app: opts.app,
        provider: opts.provider,
        Setting: opts.Setting,
        cls: opts.cls,
        name: t2("set.precedence.name"),
        desc: t2("set.precedence.desc"),
        otherDesc: t2("set.precedence.other"),
        upTooltip: t2("set.precedence.up"),
        downTooltip: t2("set.precedence.down"),
        save: opts.save
      });
    }
    module2.exports = { STEP, rankedLinkers, precedenceForIndex, currentIndex, renderPrecedence, renderPrecedenceSetting };
  }
});

// src/settings-tab.js
var require_settings_tab = __commonJS({
  "src/settings-tab.js"(exports2, module2) {
    "use strict";
    var { PluginSettingTab, Setting } = require("obsidian");
    var { PRESETS: PRESETS2, BIB_EXTS, parseExtensions: parseExtensions2 } = require_constants();
    var { formatGroups, knownExtensions } = require_formats();
    var { DiskPathSuggest, suggestAvailable } = require_disk_suggest();
    var { renderFolderList } = require_folder_list();
    var { t: t2, plural: plural2 } = require_i18n();
    var { renderPrecedenceSetting: precedenceSetting } = require_precedence();
    var normFolder = (p) => p.replace(/\\/g, "/").replace(/\/+$/, "").trim();
    var normExt = (e) => {
      const x = e.trim().toLowerCase().replace(/^\.+/, "");
      return x ? "." + x : "";
    };
    var ReferenceLinkerSettingTab2 = class extends PluginSettingTab {
      constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.expandedFormats = /* @__PURE__ */ new Set();
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
      renderBibliographies(containerEl, save) {
        const s = this.plugin.settings;
        renderFolderList(containerEl, {
          cls: "reference-linker",
          name: t2("set.bibFiles.name"),
          desc: t2("set.bibFiles.desc"),
          get: () => s.bibFiles,
          set: async (v) => {
            s.bibFiles = v;
            await save(false);
            await this.plugin.loadCitations();
            this.plugin.startWatchers();
            drawStatus();
          },
          normalize: normFolder,
          // Root-relative, like every other path this plugin stores: an absolute one would break
          // the moment the vault moved to another machine.
          attachSuggest: suggestAvailable() ? (inputEl, onPick) => new DiskPathSuggest(this.app, inputEl, { getRoot: () => this.plugin.codeRoot(), onSelect: onPick, exts: BIB_EXTS }) : null,
          placeholder: t2("set.bibFiles.add"),
          removeLabel: t2("set.folderList.remove"),
          addLabel: t2("set.folderList.addAria")
        });
        const statusEl = containerEl.createDiv();
        const drawStatus = () => {
          statusEl.empty();
          const status = this.plugin.bibStatus();
          const note = (key, rows) => {
            if (rows.length)
              statusEl.createEl("div", { cls: "reference-linker-note is-error", text: t2(key, { files: rows.join(", ") }) });
          };
          note("set.bibFiles.notFound", status.filter((x) => !x.exists).map((x) => x.abs));
          note("set.bibFiles.notAFile", status.filter((x) => x.exists && !x.isFile).map((x) => x.abs));
          const { keys, matched } = this.plugin.citations;
          statusEl.createEl("div", {
            cls: "reference-linker-note",
            text: keys ? t2("set.bibFiles.stats", { keys, matched }) : t2("set.bibFiles.none")
          });
        };
        drawStatus();
      }
      // The setting stays one string — parseExtensions reads it unchanged, the list only
      // writes it, so there is nothing to migrate.
      renderExtensions(containerEl, save) {
        const s = this.plugin.settings;
        const known = new Set(knownExtensions());
        const current = [...parseExtensions2(s.extensions)];
        const on = new Set(current);
        const commit = async (next) => {
          s.extensions = [...new Set(next)].join(" ");
          await save(true);
          this.display();
        };
        if (this.showExtensions === void 0)
          this.showExtensions = !on.size;
        const heading = new Setting(containerEl).setName(t2("set.extensions.name")).setDesc(on.size ? t2("set.extensions.count", { n: current.filter((e) => known.has(e)).length, total: known.size }) : t2("set.extensions.none")).setHeading();
        this.foldButton(heading, this.showExtensions, () => {
          this.showExtensions = !this.showExtensions;
          this.display();
        });
        if (!this.showExtensions)
          return;
        for (const g of formatGroups()) {
          const enabled = g.exts.filter((e) => on.has(e));
          const open = this.expandedFormats.has(g.id);
          const partial = enabled.length > 0 && enabled.length < g.exts.length;
          const row = new Setting(containerEl).setName(t2("set.format." + g.id)).setDesc(partial ? t2("set.extensions.meta", { n: enabled.length, total: g.exts.length, exts: g.exts.join(" ") }) : g.exts.join(" "));
          if (g.exts.length > 1) {
            this.foldButton(row, open, () => {
              if (open)
                this.expandedFormats.delete(g.id);
              else
                this.expandedFormats.add(g.id);
              this.display();
            });
          }
          row.addToggle((c) => c.setValue(enabled.length > 0).onChange((v) => commit(v ? [...current, ...g.exts] : current.filter((e) => !g.exts.includes(e)))));
          if (!open)
            continue;
          for (const ext of g.exts) {
            const sub = new Setting(containerEl).setName(ext).addToggle((c) => c.setValue(on.has(ext)).onChange((v) => commit(v ? [...current, ext] : current.filter((e) => e !== ext))));
            sub.settingEl.addClass("reference-linker-kind-row");
          }
        }
        renderFolderList(containerEl, {
          cls: "reference-linker",
          name: t2("set.extensions.other.name"),
          desc: t2("set.extensions.other.desc"),
          get: () => [...parseExtensions2(s.extensions)].filter((e) => !known.has(e)).join("\n"),
          set: (v) => commit([...current.filter((e) => known.has(e)), ...parseExtensions2(v)]),
          normalize: normExt,
          placeholder: t2("set.extensions.other.add"),
          removeLabel: t2("set.folderList.remove"),
          addLabel: t2("set.folderList.addAria")
        });
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
          if (suggestAvailable())
            new DiskPathSuggest(this.app, c.inputEl, { getSeed: () => this.plugin.codeRoot() });
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
          attachSuggest: suggestAvailable() ? (inputEl, onPick) => new DiskPathSuggest(this.app, inputEl, { getRoot: () => this.plugin.codeRoot(), onSelect: onPick }) : null,
          placeholder: t2("set.folderList.add"),
          removeLabel: t2("set.folderList.remove"),
          addLabel: t2("set.folderList.addAria")
        });
        folderList(t2("set.scanFolders.name"), t2("set.scanFolders.desc"), "scanRoots");
        const missing = this.plugin.scanRootStatus().filter((x) => !x.exists).map((x) => x.rel);
        if (missing.length) {
          containerEl.createEl("div", { cls: "reference-linker-note is-error", text: t2("set.scanFolders.notFound", { folders: missing.join(", ") }) });
        }
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
        this.renderBibliographies(containerEl, save);
        const root = this.plugin.codeRoot() || t2("set.info.unknownRoot");
        containerEl.createEl("div", { cls: "reference-linker-note", text: t2("set.info", { root, entries: plural2("entry", this.plugin.index.length) }) });
        this.renderExtensions(containerEl, save);
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
        new Setting(containerEl).setName(t2("set.documentView.name")).setDesc(t2("set.documentView.desc")).addDropdown((c) => c.addOption("column", t2("set.documentView.column")).addOption("page", t2("set.documentView.page")).setValue(s.documentView === "page" ? "page" : "column").onChange(async (v) => {
          s.documentView = v;
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

// src/bib.js
var require_bib = __commonJS({
  "src/bib.js"(exports2, module2) {
    "use strict";
    var stripBraces = (s) => s.replace(/[{}]/g, "");
    var unescapeSpec = (s) => s.replace(/\\([:;\\])/g, "$1");
    function splitUnescaped(s, sep) {
      const out = [];
      let cur = "";
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === "\\" && i + 1 < s.length) {
          cur += c + s[++i];
          continue;
        }
        if (c === sep) {
          out.push(cur);
          cur = "";
          continue;
        }
        cur += c;
      }
      out.push(cur);
      return out;
    }
    function rejoinDrives(parts) {
      const out = [];
      for (let i = 0; i < parts.length; i++) {
        if (/^[A-Za-z]$/.test(parts[i]) && i + 1 < parts.length && /^[\\/]/.test(parts[i + 1])) {
          out.push(parts[i] + ":" + parts[i + 1]);
          i++;
        } else
          out.push(parts[i]);
      }
      return out;
    }
    function attachmentPaths(raw) {
      const out = [];
      for (const spec of splitUnescaped(String(raw || ""), ";")) {
        if (!spec.trim())
          continue;
        const parts = rejoinDrives(splitUnescaped(spec, ":")).map((p) => unescapeSpec(p).trim());
        const path = parts.length >= 3 ? parts.slice(1, -1).join(":") : parts[parts.length - 1];
        if (path)
          out.push(path);
      }
      return out;
    }
    var Scanner = class {
      constructor(text) {
        this.s = text;
        this.i = 0;
      }
      skipSpace() {
        while (this.i < this.s.length && /\s/.test(this.s[this.i]))
          this.i++;
      }
      balanced(open, close) {
        let depth = 0;
        const start = ++this.i;
        for (; this.i < this.s.length; this.i++) {
          const c = this.s[this.i];
          if (c === "\\") {
            this.i++;
            continue;
          }
          if (c === open)
            depth++;
          else if (c === close) {
            if (!depth)
              return this.s.slice(start, this.i++);
            depth--;
          }
        }
        return this.s.slice(start);
      }
      quoted() {
        let depth = 0;
        const start = ++this.i;
        for (; this.i < this.s.length; this.i++) {
          const c = this.s[this.i];
          if (c === "\\") {
            this.i++;
            continue;
          }
          if (c === "{")
            depth++;
          else if (c === "}")
            depth--;
          else if (c === '"' && !depth)
            return this.s.slice(start, this.i++);
        }
        return this.s.slice(start);
      }
      bare() {
        const start = this.i;
        while (this.i < this.s.length && !/[,}\s#)]/.test(this.s[this.i]))
          this.i++;
        return this.s.slice(start, this.i);
      }
      value(macros) {
        let out = "";
        for (; ; ) {
          this.skipSpace();
          const c = this.s[this.i];
          if (c === "{")
            out += stripBraces(this.balanced("{", "}"));
          else if (c === '"')
            out += stripBraces(this.quoted());
          else {
            const word = this.bare();
            if (!word)
              break;
            out += Object.prototype.hasOwnProperty.call(macros, word.toLowerCase()) ? macros[word.toLowerCase()] : word;
          }
          this.skipSpace();
          if (this.s[this.i] !== "#")
            break;
          this.i++;
        }
        return out.trim();
      }
    };
    function readFields(sc, macros, stop) {
      const fields = {};
      for (; ; ) {
        sc.skipSpace();
        if (sc.i >= sc.s.length || sc.s[sc.i] === stop) {
          sc.i++;
          break;
        }
        if (sc.s[sc.i] === ",") {
          sc.i++;
          continue;
        }
        const start = sc.i;
        while (sc.i < sc.s.length && !/[=,}\s)]/.test(sc.s[sc.i]))
          sc.i++;
        const name = sc.s.slice(start, sc.i).trim().toLowerCase();
        sc.skipSpace();
        if (sc.s[sc.i] !== "=") {
          if (!name)
            sc.i++;
          continue;
        }
        sc.i++;
        const v = sc.value(macros);
        if (name)
          fields[name] = v;
      }
      return fields;
    }
    function parseBibtex(text) {
      const sc = new Scanner(String(text || ""));
      const macros = {};
      const out = [];
      while (sc.i < sc.s.length) {
        if (sc.s[sc.i++] !== "@")
          continue;
        sc.skipSpace();
        const start = sc.i;
        while (sc.i < sc.s.length && /[A-Za-z]/.test(sc.s[sc.i]))
          sc.i++;
        const type = sc.s.slice(start, sc.i).toLowerCase();
        sc.skipSpace();
        const open = sc.s[sc.i];
        if (open !== "{" && open !== "(")
          continue;
        const close = open === "{" ? "}" : ")";
        if (type === "comment" || type === "preamble") {
          sc.balanced(open, close);
          continue;
        }
        if (type === "string") {
          const body = sc.balanced(open, close);
          const eq = body.indexOf("=");
          if (eq > 0) {
            const name = body.slice(0, eq).trim().toLowerCase();
            macros[name] = new Scanner(body.slice(eq + 1)).value(macros);
          }
          continue;
        }
        sc.i++;
        sc.skipSpace();
        const keyStart = sc.i;
        while (sc.i < sc.s.length && !/[,}\s)]/.test(sc.s[sc.i]))
          sc.i++;
        const key = sc.s.slice(keyStart, sc.i).trim();
        const fields = readFields(sc, macros, close);
        if (key)
          out.push({ key, type, fields });
      }
      return out;
    }
    var cslYear = (e) => {
      const parts = e.issued && e.issued["date-parts"];
      const y = Array.isArray(parts) && Array.isArray(parts[0]) ? parts[0][0] : null;
      return y == null ? "" : String(y);
    };
    var cslAuthor = (e) => (Array.isArray(e.author) ? e.author : []).map((a) => a.family || a.literal || "").filter(Boolean).join(" and ");
    function parseCsl(text) {
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        return [];
      }
      if (!Array.isArray(data))
        return [];
      return data.filter((e) => e && e.id != null).map((e) => ({
        key: String(e.id),
        type: String(e.type || "document"),
        fields: { title: String(e.title || ""), author: cslAuthor(e), year: cslYear(e) }
      }));
    }
    var looksLikeJson = (text) => /^\s*\[/.test(text);
    function parseBibliography2(text) {
      const raw = looksLikeJson(text) ? parseCsl(text) : parseBibtex(text);
      return raw.map((e) => ({
        key: e.key,
        type: e.type,
        title: e.fields.title || "",
        year: e.fields.year || e.fields.date || "",
        paths: attachmentPaths(e.fields.file)
      }));
    }
    module2.exports = { parseBibtex, parseCsl, parseBibliography: parseBibliography2, attachmentPaths };
  }
});

// src/citations.js
var require_citations = __commonJS({
  "src/citations.js"(exports2, module2) {
    "use strict";
    var normalize = (p) => String(p || "").split("\\").join("/").replace(/^file:\/\//i, "").replace(/^\/([A-Za-z]:)/, "$1").replace(/\/+$/, "");
    var baseOf = (p) => {
      const n = normalize(p);
      const i = n.lastIndexOf("/");
      return i < 0 ? n : n.slice(i + 1);
    };
    var stemOf = (p) => baseOf(p).replace(/\.[^.]+$/, "");
    var foldTitle = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    var push = (map, key, value) => {
      const a = map.get(key);
      if (a)
        a.push(value);
      else
        map.set(key, [value]);
    };
    var only = (a) => a && a.length === 1 ? a[0] : null;
    function indexPaths(relPaths, root) {
      const nroot = normalize(root).toLowerCase();
      const byAbs = /* @__PURE__ */ new Map();
      const byTail = /* @__PURE__ */ new Map();
      const byBase = /* @__PURE__ */ new Map();
      const byTitle = /* @__PURE__ */ new Map();
      for (const rel of relPaths) {
        const n = normalize(rel).toLowerCase();
        byAbs.set(nroot ? nroot + "/" + n : n, rel);
        push(byTail, n, rel);
        push(byBase, baseOf(n), rel);
        push(byTitle, foldTitle(stemOf(n)), rel);
      }
      return { byAbs, byTail, byBase, byTitle };
    }
    function matchEntry(entry, idx) {
      for (const p of entry.paths || []) {
        const n = normalize(p).toLowerCase();
        const abs = idx.byAbs.get(n);
        if (abs)
          return { rel: abs, how: "path" };
      }
      for (const p of entry.paths || []) {
        const segs = normalize(p).toLowerCase().split("/");
        for (let i = 0; i < segs.length - 1; i++) {
          const r = only(idx.byTail.get(segs.slice(i).join("/")));
          if (r)
            return { rel: r, how: "path" };
        }
      }
      for (const p of entry.paths || []) {
        const r = only(idx.byBase.get(baseOf(p).toLowerCase()));
        if (r)
          return { rel: r, how: "name" };
      }
      const title = foldTitle(entry.title);
      if (title) {
        const r = only(idx.byTitle.get(title));
        if (r)
          return { rel: r, how: "title" };
      }
      return null;
    }
    function buildCitations2(entries, relPaths, root) {
      const idx = indexPaths(relPaths, root);
      const byKey = /* @__PURE__ */ new Map();
      const byPath = /* @__PURE__ */ new Map();
      let matched = 0;
      for (const e of entries) {
        const lc = String(e.key).toLowerCase();
        if (byKey.has(lc))
          continue;
        const hit = matchEntry(e, idx);
        byKey.set(lc, { key: e.key, rel: hit ? hit.rel : null, how: hit ? hit.how : null, title: e.title || "", year: e.year || "" });
        if (hit) {
          matched++;
          if (!byPath.has(hit.rel))
            byPath.set(hit.rel, e.key);
        }
      }
      return { byKey, byPath, keys: byKey.size, matched };
    }
    var emptyCitations2 = () => ({ byKey: /* @__PURE__ */ new Map(), byPath: /* @__PURE__ */ new Map(), keys: 0, matched: 0 });
    module2.exports = { buildCitations: buildCitations2, emptyCitations: emptyCitations2, matchEntry, indexPaths, foldTitle, normalize };
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
    var pick = (e) => ({ name: e.name, kind: e.kind, ext: e.lang, path: e.path, position: e.position || 1 });
    module2.exports = {
      buildApi() {
        const plugin = this;
        return {
          version: this.manifest.version,
          // The absolute reference root the scan paths resolve against.
          root: () => this.codeRoot(),
          // Every indexed entry: { name, kind, ext, path, position } (kind is 'file' or 'section').
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
      "menu.pinCite": "Pin to citation key \u201C{cite}\u201D",
      "menu.unpin": "Unpin this reference link",
      // Notices
      "notice.noCodeRoot": "Reference Linker: could not determine the reference root",
      "notice.noExtensions": "Reference Linker: no file extensions configured",
      "notice.scanFailed": "Reference Linker: scan failed \u2014 {error}",
      "notice.indexed": "Reference Linker: {entries} indexed",
      "notice.missingFolders": "Reference Linker: scan folder not found \u2014 {folders}",
      "notice.copied": "Reference Linker: link copied",
      "notice.anchorCopied": "Opens at the start \u2014 \u201C{section}\u201D copied, search for it",
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
      "notice.pinnedCite": "Reference Linker: link pinned to citation key \u201C{cite}\u201D",
      "notice.unpinned": "Reference Linker: link unpinned \u2014 it is no longer tracked",
      "notice.cantPin": "Reference Linker: can't pin \u2014 no section begins on that page, and the document has no citation key",
      // Inline embeds
      "embed.empty": "Reference Linker: empty embed \u2014 give a document path",
      "embed.fmt.file": "Document (first page)",
      "embed.fmt.section": "Section \u201C{name}\u201D",
      "embed.unsupported": "Reference Linker: no inline preview for {path}",
      "embed.needsTime": "Reference Linker: {path} is a recording \u2014 position it with \u201Ctime: 1:30\u201D or \u201C#t=1:30\u201D, not a page",
      "embed.needsPage": "Reference Linker: {path} has pages, not a running time \u2014 position it with \u201Cpage: 3\u201D or \u201C#page=3\u201D",
      "preview.empty": "Nothing to show here",
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
      // Drag & drop from the OS file manager
      "drop.placeholder": "Insert the dropped document as\u2026",
      "drop.asLink": "A reference link",
      "drop.asEmbed": "An inline embed",
      "notice.dropOutsideRoot": "Reference Linker: {count} file(s) outside the reference root were skipped \u2014 no portable link",
      // Settings — headings
      "set.heading.index": "Reference index",
      // Settings — reference index
      "set.codeRoot.name": "Reference root",
      "set.scanFolders.desc": "Folders scanned for documents, relative to the reference root. Leave empty to scan the whole root.",
      "set.scanFolders.notFound": "\u26A0 Not found under the reference root \u2014 {folders}",
      "set.extensions.name": "File extensions",
      "set.extensions.count": "Which formats are indexed \u2014 {n} of {total} extensions on.",
      "set.extensions.none": "Which formats are indexed. Nothing at all until one is on.",
      "set.extensions.meta": "{n} of {total} on: {exts}",
      "set.extensions.other.name": "Other extensions",
      "set.extensions.other.desc": "Anything else to index. Found by file name only \u2014 no preview, no sections.",
      "set.extensions.other.add": "Add extension\u2026",
      "set.format.pdf": "PDF",
      "set.format.image": "Images",
      "set.format.pptx": "PowerPoint presentations",
      "set.format.html": "Web pages",
      "set.format.text": "Text and Markdown",
      "set.format.epub": "E-books",
      "set.format.media": "Audio and video",
      "set.format.odf": "OpenDocument",
      "set.format.docx": "Word documents",
      "set.format.xlsx": "Excel spreadsheets",
      "set.format.csv": "CSV and TSV tables",
      "set.skipFolders.desc": "A bare name (node_modules) is skipped at any depth; a path with a slash (archive/raw) skips only that folder, relative to the reference root.",
      "set.autoRefresh.desc": "Watch the scan folders and rebuild the index when documents change.",
      "set.bibFiles.name": "Bibliographies",
      "set.bibFiles.desc": "BibTeX (.bib) or CSL-JSON files to read citation keys from. A link inserted to a document that has a key is pinned to it, so it survives the document being renamed or re-filed.",
      "set.bibFiles.add": "Add bibliography\u2026",
      "set.bibFiles.stats": "{matched} of {keys} key(s) matched to an indexed document",
      "set.bibFiles.none": "No bibliography loaded \u2014 links are pinned to sections only.",
      "set.bibFiles.notFound": "\u26A0 Not found \u2014 {files}",
      "set.bibFiles.notAFile": "\u26A0 A folder, not a bibliography file \u2014 {files}",
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
      "set.documentView.name": "Document preview shape",
      "set.documentView.desc": "How a Word or OpenDocument preview is laid out. Either way the page size and margins come from the file itself.",
      "set.documentView.column": "Text column \u2014 height follows the content",
      "set.documentView.page": "Whole page \u2014 the sheet the document declares",
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
      "cmd.pinLinksNote": "\u0417\u0430\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u043D\u0435\u0437\u0430\u043A\u0440\u0435\u043F\u043B\u0451\u043D\u043D\u044B\u0435 \u0441\u0441\u044B\u043B\u043A\u0438 \u043D\u0430 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B \u0432 \u044D\u0442\u043E\u0439 \u0437\u0430\u043C\u0435\u0442\u043A\u0435",
      "cmd.pinLinksVault": "\u0417\u0430\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u043D\u0435\u0437\u0430\u043A\u0440\u0435\u043F\u043B\u0451\u043D\u043D\u044B\u0435 \u0441\u0441\u044B\u043B\u043A\u0438 \u043D\u0430 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B \u0432\u043E \u0432\u0441\u0451\u043C \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435",
      // Editor context menu
      "menu.convert.solo": "\u041D\u0430\u0439\u0442\u0438 \u0438 \u043F\u0440\u0435\u0432\u0440\u0430\u0442\u0438\u0442\u044C \u0432 \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442",
      "menu.convert.item": "\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442",
      "menu.open.solo": "\u041D\u0430\u0439\u0442\u0438 \u0438 \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442",
      "menu.open.item": "\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442",
      "menu.copyLink": "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442",
      "menu.fixLink": "\u0410\u043A\u0442\u0443\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u044D\u0442\u0443 \u0441\u0441\u044B\u043B\u043A\u0443",
      "menu.pin": "\u0417\u0430\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u0437\u0430 \u0440\u0430\u0437\u0434\u0435\u043B\u043E\u043C \xAB{sec}\xBB",
      "menu.pinCite": "\u0417\u0430\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u0437\u0430 \u043A\u043B\u044E\u0447\u043E\u043C \u0446\u0438\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F \xAB{cite}\xBB",
      "menu.unpin": "\u041E\u0442\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u044D\u0442\u0443 \u0441\u0441\u044B\u043B\u043A\u0443",
      // Notices
      "notice.noCodeRoot": "Reference Linker: \u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0438\u0442\u044C \u043A\u043E\u0440\u0435\u043D\u044C \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432",
      "notice.noExtensions": "Reference Linker: \u043D\u0435 \u0437\u0430\u0434\u0430\u043D\u043E \u043D\u0438 \u043E\u0434\u043D\u043E\u0433\u043E \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u044F",
      "notice.scanFailed": "Reference Linker: \u0441\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u2014 {error}",
      "notice.indexed": "Reference Linker: \u043F\u0440\u043E\u0438\u043D\u0434\u0435\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D\u043E {entries}",
      "notice.missingFolders": "Reference Linker: \u043F\u0430\u043F\u043A\u0430 \u0441\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430 \u2014 {folders}",
      "notice.copied": "Reference Linker: \u0441\u0441\u044B\u043B\u043A\u0430 \u0441\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u0430",
      "notice.anchorCopied": "\u041E\u0442\u043A\u0440\u043E\u0435\u0442\u0441\u044F \u0441 \u043D\u0430\u0447\u0430\u043B\u0430 \u2014 \xAB{section}\xBB \u0441\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u043E, \u043D\u0430\u0439\u0434\u0438\u0442\u0435 \u043F\u043E\u0438\u0441\u043A\u043E\u043C",
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
      "notice.pinnedCite": "Reference Linker: \u0441\u0441\u044B\u043B\u043A\u0430 \u0437\u0430\u043A\u0440\u0435\u043F\u043B\u0435\u043D\u0430 \u0437\u0430 \u043A\u043B\u044E\u0447\u043E\u043C \u0446\u0438\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F \xAB{cite}\xBB",
      "notice.unpinned": "Reference Linker: \u0441\u0441\u044B\u043B\u043A\u0430 \u043E\u0442\u043A\u0440\u0435\u043F\u043B\u0435\u043D\u0430 \u2014 \u0431\u043E\u043B\u044C\u0448\u0435 \u043D\u0435 \u043E\u0442\u0441\u043B\u0435\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F",
      "notice.cantPin": "Reference Linker: \u043D\u0435 \u0437\u0430 \u0447\u0442\u043E \u0437\u0430\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u2014 \u043D\u0430 \u044D\u0442\u043E\u0439 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435 \u043D\u0435 \u043D\u0430\u0447\u0438\u043D\u0430\u0435\u0442\u0441\u044F \u0440\u0430\u0437\u0434\u0435\u043B, \u0430 \u043A\u043B\u044E\u0447\u0430 \u0446\u0438\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F \u0443 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430 \u043D\u0435\u0442",
      // Inline embeds
      "embed.empty": "Reference Linker: \u043F\u0443\u0441\u0442\u043E\u0439 embed \u2014 \u0443\u043A\u0430\u0436\u0438\u0442\u0435 \u043F\u0443\u0442\u044C \u043A \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0443",
      "embed.fmt.file": "\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442 (\u043F\u0435\u0440\u0432\u0430\u044F \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0430)",
      "embed.fmt.section": "\u0420\u0430\u0437\u0434\u0435\u043B \xAB{name}\xBB",
      "embed.unsupported": "Reference Linker: \u043D\u0435\u0442 \u0438\u043D\u043B\u0430\u0439\u043D-\u043F\u0440\u0435\u0432\u044C\u044E \u0434\u043B\u044F {path}",
      "embed.needsTime": "Reference Linker: {path} \u2014 \u0437\u0430\u043F\u0438\u0441\u044C, \u043F\u043E\u0437\u0438\u0446\u0438\u044F \u0437\u0430\u0434\u0430\u0451\u0442\u0441\u044F \xABtime: 1:30\xBB \u0438\u043B\u0438 \xAB#t=1:30\xBB, \u0430 \u043D\u0435 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435\u0439",
      "embed.needsPage": "Reference Linker: \u0443 {path} \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B, \u0430 \u043D\u0435 \u0432\u0440\u0435\u043C\u044F \u2014 \u043F\u043E\u0437\u0438\u0446\u0438\u044F \u0437\u0430\u0434\u0430\u0451\u0442\u0441\u044F \xABpage: 3\xBB \u0438\u043B\u0438 \xAB#page=3\xBB",
      "preview.empty": "\u0417\u0434\u0435\u0441\u044C \u043D\u0435\u0447\u0435\u0433\u043E \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C",
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
      // Drag & drop из файлового менеджера ОС
      "drop.placeholder": "\u0412\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043F\u0435\u0440\u0435\u0442\u0430\u0449\u0435\u043D\u043D\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u043A\u0430\u043A\u2026",
      "drop.asLink": "\u0421\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442",
      "drop.asEmbed": "\u0412\u0441\u0442\u0440\u043E\u0435\u043D\u043D\u044B\u0439 embed",
      "notice.dropOutsideRoot": "Reference Linker: \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E \u0444\u0430\u0439\u043B\u043E\u0432 \u0432\u043D\u0435 \u043A\u043E\u0440\u043D\u044F \u0441\u0441\u044B\u043B\u043E\u043A \u2014 {count}; \u043F\u043E\u0440\u0442\u0438\u0440\u0443\u0435\u043C\u0443\u044E \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0435 \u0441\u0434\u0435\u043B\u0430\u0442\u044C",
      // Settings — headings
      "set.heading.index": "\u0418\u043D\u0434\u0435\u043A\u0441 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432",
      // Settings — reference index
      "set.codeRoot.name": "\u041A\u043E\u0440\u0435\u043D\u044C \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432",
      "set.scanFolders.desc": "\u041F\u0430\u043F\u043A\u0438, \u0441\u043A\u0430\u043D\u0438\u0440\u0443\u0435\u043C\u044B\u0435 \u043D\u0430 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B, \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u043A\u043E\u0440\u043D\u044F. \u041E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u0443\u0441\u0442\u044B\u043C, \u0447\u0442\u043E\u0431\u044B \u0441\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0432\u0435\u0441\u044C \u043A\u043E\u0440\u0435\u043D\u044C.",
      "set.scanFolders.notFound": "\u26A0 \u041D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E \u0432 \u043A\u043E\u0440\u043D\u0435 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432 \u2014 {folders}",
      "set.extensions.name": "\u0420\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u044F \u0444\u0430\u0439\u043B\u043E\u0432",
      "set.extensions.count": "\u041A\u0430\u043A\u0438\u0435 \u0444\u043E\u0440\u043C\u0430\u0442\u044B \u0438\u043D\u0434\u0435\u043A\u0441\u0438\u0440\u0443\u044E\u0442\u0441\u044F \u2014 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u043E \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u0439: {n} \u0438\u0437 {total}.",
      "set.extensions.none": "\u041A\u0430\u043A\u0438\u0435 \u0444\u043E\u0440\u043C\u0430\u0442\u044B \u0438\u043D\u0434\u0435\u043A\u0441\u0438\u0440\u0443\u044E\u0442\u0441\u044F. \u041F\u043E\u043A\u0430 \u043D\u0435 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u043E \u043D\u0438 \u043E\u0434\u043D\u043E\u0433\u043E \u2014 \u0438\u043D\u0434\u0435\u043A\u0441 \u043F\u0443\u0441\u0442.",
      "set.extensions.meta": "\u0412\u043A\u043B\u044E\u0447\u0435\u043D\u043E {n} \u0438\u0437 {total}: {exts}",
      "set.extensions.other.name": "\u0414\u0440\u0443\u0433\u0438\u0435 \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u044F",
      "set.extensions.other.desc": "\u0412\u0441\u0451 \u043E\u0441\u0442\u0430\u043B\u044C\u043D\u043E\u0435, \u0447\u0442\u043E \u043D\u0443\u0436\u043D\u043E \u0438\u043D\u0434\u0435\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C. \u0418\u0449\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E \u0438\u043C\u0435\u043D\u0438 \u0444\u0430\u0439\u043B\u0430 \u2014 \u0431\u0435\u0437 \u043F\u0440\u0435\u0432\u044C\u044E \u0438 \u0440\u0430\u0437\u0434\u0435\u043B\u043E\u0432.",
      "set.extensions.other.add": "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u0435\u2026",
      "set.format.pdf": "PDF",
      "set.format.image": "\u0418\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F",
      "set.format.pptx": "\u041F\u0440\u0435\u0437\u0435\u043D\u0442\u0430\u0446\u0438\u0438 PowerPoint",
      "set.format.html": "\u0412\u0435\u0431-\u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B",
      "set.format.text": "\u0422\u0435\u043A\u0441\u0442 \u0438 Markdown",
      "set.format.epub": "\u042D\u043B\u0435\u043A\u0442\u0440\u043E\u043D\u043D\u044B\u0435 \u043A\u043D\u0438\u0433\u0438",
      "set.format.media": "\u0410\u0443\u0434\u0438\u043E \u0438 \u0432\u0438\u0434\u0435\u043E",
      "set.format.odf": "OpenDocument",
      "set.format.docx": "\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B Word",
      "set.format.xlsx": "\u0422\u0430\u0431\u043B\u0438\u0446\u044B Excel",
      "set.format.csv": "\u0422\u0430\u0431\u043B\u0438\u0446\u044B CSV \u0438 TSV",
      "set.skipFolders.desc": "\u041F\u0440\u043E\u0441\u0442\u043E \u0438\u043C\u044F (node_modules) \u043F\u0440\u043E\u043F\u0443\u0441\u043A\u0430\u0435\u0442\u0441\u044F \u043D\u0430 \u043B\u044E\u0431\u043E\u0439 \u0433\u043B\u0443\u0431\u0438\u043D\u0435; \u043F\u0443\u0442\u044C \u0441\u043E \u0441\u043B\u044D\u0448\u0435\u043C (archive/raw) \u043F\u0440\u043E\u043F\u0443\u0441\u043A\u0430\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u044D\u0442\u0443 \u043F\u0430\u043F\u043A\u0443 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u043A\u043E\u0440\u043D\u044F.",
      "set.autoRefresh.desc": "\u0421\u043B\u0435\u0434\u0438\u0442\u044C \u0437\u0430 \u043F\u0430\u043F\u043A\u0430\u043C\u0438 \u0441\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F \u0438 \u043F\u0435\u0440\u0435\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u0442\u044C \u0438\u043D\u0434\u0435\u043A\u0441 \u043F\u0440\u0438 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0438 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432.",
      "set.bibFiles.name": "\u0411\u0438\u0431\u043B\u0438\u043E\u0433\u0440\u0430\u0444\u0438\u0438",
      "set.bibFiles.desc": "\u0424\u0430\u0439\u043B\u044B BibTeX (.bib) \u0438\u043B\u0438 CSL-JSON, \u043E\u0442\u043A\u0443\u0434\u0430 \u0447\u0438\u0442\u0430\u044E\u0442\u0441\u044F \u043A\u043B\u044E\u0447\u0438 \u0446\u0438\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F. \u0421\u0441\u044B\u043B\u043A\u0430 \u043D\u0430 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442, \u0443 \u043A\u043E\u0442\u043E\u0440\u043E\u0433\u043E \u0435\u0441\u0442\u044C \u043A\u043B\u044E\u0447, \u0437\u0430\u043A\u0440\u0435\u043F\u043B\u044F\u0435\u0442\u0441\u044F \u0437\u0430 \u043D\u0438\u043C \u0438 \u043F\u0435\u0440\u0435\u0436\u0438\u0432\u0430\u0435\u0442 \u043F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u043D\u0438\u0435 \u0438 \u043F\u0435\u0440\u0435\u043A\u043B\u0430\u0434\u044B\u0432\u0430\u043D\u0438\u0435 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430.",
      "set.bibFiles.add": "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0431\u0438\u0431\u043B\u0438\u043E\u0433\u0440\u0430\u0444\u0438\u044E\u2026",
      "set.bibFiles.stats": "\u0441\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E \u0441 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430\u043C\u0438 \u043A\u043B\u044E\u0447\u0435\u0439: {matched} \u0438\u0437 {keys}",
      "set.bibFiles.none": "\u0411\u0438\u0431\u043B\u0438\u043E\u0433\u0440\u0430\u0444\u0438\u044F \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u0430 \u2014 \u0441\u0441\u044B\u043B\u043A\u0438 \u0437\u0430\u043A\u0440\u0435\u043F\u043B\u044F\u044E\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0437\u0430 \u0440\u0430\u0437\u0434\u0435\u043B\u0430\u043C\u0438.",
      "set.bibFiles.notFound": "\u26A0 \u041D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E \u2014 {files}",
      "set.bibFiles.notAFile": "\u26A0 \u042D\u0442\u043E \u043F\u0430\u043F\u043A\u0430, \u0430 \u043D\u0435 \u0444\u0430\u0439\u043B \u0431\u0438\u0431\u043B\u0438\u043E\u0433\u0440\u0430\u0444\u0438\u0438 \u2014 {files}",
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
      "set.documentView.name": "\u0412\u0438\u0434 \u043F\u0440\u0435\u0432\u044C\u044E \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430",
      "set.documentView.desc": "\u041A\u0430\u043A \u0440\u0430\u0441\u043A\u043B\u0430\u0434\u044B\u0432\u0430\u0435\u0442\u0441\u044F \u043F\u0440\u0435\u0432\u044C\u044E Word \u0438\u043B\u0438 OpenDocument. \u0412 \u043E\u0431\u043E\u0438\u0445 \u0441\u043B\u0443\u0447\u0430\u044F\u0445 \u0440\u0430\u0437\u043C\u0435\u0440 \u043B\u0438\u0441\u0442\u0430 \u0438 \u043F\u043E\u043B\u044F \u0431\u0435\u0440\u0443\u0442\u0441\u044F \u0438\u0437 \u0441\u0430\u043C\u043E\u0433\u043E \u0444\u0430\u0439\u043B\u0430.",
      "set.documentView.column": "\u041A\u043E\u043B\u043E\u043D\u043A\u0430 \u0442\u0435\u043A\u0441\u0442\u0430 \u2014 \u0432\u044B\u0441\u043E\u0442\u0430 \u043F\u043E \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u043C\u0443",
      "set.documentView.page": "\u0426\u0435\u043B\u0430\u044F \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0430 \u2014 \u043B\u0438\u0441\u0442, \u043E\u0431\u044A\u044F\u0432\u043B\u0435\u043D\u043D\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u043C",
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
var { buildMenu } = require_menu_verbs();
var { ownsLink } = require_link_owner();
var { ReferenceSuggest } = require_suggest2();
var filter = require_filter();
var { HoverPreview } = require_hover();
var { registerEmbed } = require_embed();
var actualize = require_actualize2();
var { ReferenceLinkModal, PresetPickerModal } = require_modal();
var { ReferenceLinkerSettingTab } = require_settings_tab();
var formats = require_formats();
var { parseBibliography } = require_bib();
var { buildCitations, emptyCitations } = require_citations();
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
var extOf = (rel) => nodePath.extname(rel).slice(1).toLowerCase();
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
  const at = plugin.sectionAtLink(url);
  if (b && b.sec) {
    const named = at && at.name === b.sec ? at : plugin.sectionNamed(ref.entry.path, b.sec);
    return Object.assign({}, ref.entry, { position: named && named.position || ref.position, title: b.sec });
  }
  return Object.assign({}, ref.entry, { position: at && at.position || ref.position, title: at ? at.name : "" });
};
var ReferenceLinkerPlugin = class extends Plugin {
  async onload() {
    initI18n(withFamily("sigil", { en: require_en(), ru: require_ru() }));
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.setIndex([]);
    this.watchers = [];
    this.fileCache = /* @__PURE__ */ new Map();
    this.cacheSignature = "";
    this.citations = emptyCitations();
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
          auxclick: (evt, view) => this.onEditorLink(evt, view, true),
          drop: (evt, view) => this.onEditorDrop(evt, view)
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
      this.app.workspace.on("editor-menu", (nativeMenu, editor) => buildMenu(this, nativeMenu, (menu) => {
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
          const pin = this.linkPinOption(link);
          if (pin) {
            const label = pin.kind === "cite" ? t("menu.pinCite", { cite: pin.value }) : t("menu.pin", { sec: pin.value });
            menu.addItem((item) => item.setTitle(label).setIcon("pin").onClick(() => this.pinLinkAtCursor(editor, link)));
          }
          if (parseBinding(link.title)) {
            menu.addItem((item) => item.setTitle(t("menu.unpin")).setIcon("pin-off").onClick(() => this.unpinLinkAtCursor(editor, link)));
          }
        }
      }))
    );
    this.app.workspace.onLayoutReady(() => this.rebuildIndex(false));
    this.api = this.buildApi();
  }
  onunload() {
    this.stopWatchers();
    clearTimeout(this.watchTimer);
    clearTimeout(this.bibTimer);
    if (this.hover)
      this.hover.destroy();
    formats.dispose();
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
  // The position a link asks for — only ever read, never overridden. A #page fragment or a
  // {page} query both count, and #t= is the same question asked of a recording.
  targetPosition(dec) {
    const m = /[#?&](?:page|t)=(\d+)/i.exec(dec);
    return m ? parseInt(m[1], 10) : 1;
  }
  // The document a link points at, from its target alone: { entry, position }, or null for a
  // link into no indexed document. The label is never consulted.
  refForTarget(target) {
    if (!target)
      return null;
    const dec = this.decodeTarget(target);
    const cached = this.fileCache.get(this.targetIndexedFile(dec));
    const entry = cached && cached.entries[0];
    return entry ? { entry, position: this.targetPosition(dec) } : null;
  }
  entriesIn(rel) {
    return rel ? (this.fileCache.get(rel) || { entries: [] }).entries : [];
  }
  // A document's section by name — how a link that stores no position finds where it points.
  sectionNamed(rel, name) {
    return this.entriesIn(rel).find((e) => e.kind === "section" && e.name === name) || null;
  }
  // What a section binding says about the page a link stores: null when the section still
  // sits there, stale with the page it moved to, or broken when the document is indexed but
  // no such section resolves any more (renamed, or the outline changed).
  //
  // Broken is reserved for a document the index *has*, never for one it doesn't know — a
  // reference root pointed at the wrong folder, or a document not scanned yet, would
  // otherwise turn every link red at once. An unknown document gets no verdict rather than
  // a guess. Code Linker already worked this way; this is the two brought into line.
  urlBindState(url, b, storedPosition) {
    const here = this.targetIndexedFile(this.decodeTarget(url));
    const moved = this.citeMovedTo(b, here);
    if (moved === "broken")
      return { state: "broken" };
    const rel = moved || here;
    if (!rel)
      return null;
    const sec = b.sec ? this.secBindState(url, rel, b.sec, storedPosition) : null;
    if (sec && sec.state === "broken")
      return { state: "broken" };
    if (!moved)
      return sec;
    const r = { state: "stale", path: moved };
    if (sec && sec.anchor != null)
      r.anchor = sec.anchor;
    else if (sec && sec.line != null)
      r.line = sec.line;
    return r;
  }
  // A path when the document moved, 'broken' for a key the bibliography lost, else null. A key
  // it still has but cannot place is the unknown-document case sec refuses to judge — a
  // misconfigured root would otherwise redden every cite link at once.
  citeMovedTo(b, here) {
    if (!b.cite)
      return null;
    const known = this.citations.byKey.get(String(b.cite).toLowerCase());
    if (!known)
      return this.hasCitations() ? "broken" : null;
    if (!known.rel)
      return null;
    return known.rel === here ? null : known.rel;
  }
  secBindState(url, rel, sec, storedPosition) {
    const hits = this.entriesIn(rel).filter((e) => e.kind === "section" && e.name === sec);
    if (!hits.length)
      return { state: "broken" };
    const kind = formats.anchorKind(extOf(rel));
    if (!kind)
      return null;
    if (kind === "id")
      return this.idBindState(url, hits);
    return bindStateFrom(hits.map((e) => e.position), storedPosition);
  }
  // The same link pointed at another file. Null when the URL holds neither our root token nor
  // the reference root: a path we cannot locate in it cannot be rewritten, only corrupted.
  retargetUrl(url, rel) {
    const enc = rel.split("/").map(encodeURIComponent).join("/");
    const token = /(\{(?:ref-)?root\}\/)[^#?]*/;
    if (token.test(url))
      return url.replace(token, (_, head) => head + enc);
    const root = this.codeRoot().split(nodePath.sep).join("/").replace(/\/+$/, "");
    if (!root)
      return null;
    for (const base of [root, encodeURI(root)]) {
      const i = url.indexOf(base + "/");
      if (i < 0)
        continue;
      const head = url.slice(0, i + base.length + 1);
      const tail = url.slice(head.length);
      const cut = tail.search(/[#?]/);
      return head + enc + (cut < 0 ? "" : tail.slice(cut));
    }
    return null;
  }
  // An id-anchored link drifts when its heading is still there under a different id, which
  // is what regenerating a doc site does. A heading with no id anchors as the empty fragment,
  // so a link pinned to it must match by that — else a same-named heading that does have an id
  // would drag the link onto the wrong one.
  idBindState(url, hits) {
    const stored = this.targetAnchor(this.decodeTarget(url));
    const anchors = hits.map((e) => e.anchor || "");
    if (anchors.includes(stored))
      return null;
    const withId = anchors.filter(Boolean);
    return withId.length ? { state: "stale", anchor: withId[0] } : null;
  }
  // The fragment a link carries, without the '#'.
  targetAnchor(dec) {
    const i = dec.indexOf("#");
    return i < 0 ? "" : dec.slice(i + 1);
  }
  // The outline section beginning on a link's page — what it can be pinned to. Null when the
  // page is mid-section or the document has no outline.
  sectionAtLink(url) {
    const rel = url && this.targetIndexedFile(this.decodeTarget(url));
    if (!rel)
      return null;
    const kind = formats.anchorKind(extOf(rel));
    if (!kind)
      return null;
    const entries = this.entriesIn(rel);
    if (kind === "id") {
      const frag = this.targetAnchor(this.decodeTarget(url));
      return frag && entries.find((e) => e.kind === "section" && e.anchor === frag) || null;
    }
    const position = this.targetPosition(url);
    return entries.find((e) => e.kind === "section" && e.position === position) || null;
  }
  linkPinOption(link) {
    return this.pinOptionFor(link.target, link.title);
  }
  // A binding already there is topped up with the key, never re-derived: reading its section
  // off the page again would repoint a link that has drifted. A tooltip is prose, left alone.
  pinOptionFor(url, title) {
    const existing = ownsBinding(title, OWNER) ? parseBinding(title) : null;
    if (!existing && title)
      return null;
    const b = existing ? { sec: existing.sec, cite: existing.cite } : {};
    if (!existing) {
      const sec = this.sectionAtLink(url);
      if (sec)
        b.sec = sec.name;
    }
    if (!b.cite) {
      const cite = this.citeOf(this.targetIndexedFile(this.decodeTarget(url)));
      if (cite)
        b.cite = cite;
    }
    const next = formatBinding(b);
    if (!next || next === (title || ""))
      return null;
    const addedSec = b.sec && b.sec !== (existing ? existing.sec : "");
    return { title: next, value: addedSec ? b.sec : b.cite, kind: addedSec ? "sec" : "cite" };
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
    return JSON.stringify({ v: 5, exts: [...parseExtensions(this.settings.extensions)].sort() });
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
      await this.loadCitations();
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
  bibPaths() {
    const root = this.codeRoot();
    return splitLines(this.settings.bibFiles).map((line) => line.split("\\").join("/").trim()).filter(Boolean).map((p) => nodePath.isAbsolute(p) ? p : root ? nodePath.join(root, p) : p);
  }
  // Apart from the file scan, which caches per file by mtime: a re-export moves a key onto
  // another document without that document changing.
  async loadCitations() {
    const entries = [];
    for (const abs of this.bibPaths()) {
      try {
        entries.push(...parseBibliography(await fsp.readFile(abs, "utf8")));
      } catch (e) {
      }
    }
    this.citations = buildCitations(entries, [...this.fileCache.keys()], this.codeRoot());
  }
  citeOf(rel) {
    return rel && this.citations.byPath.get(rel) || null;
  }
  // With no bibliography read, no cite binding is judged at all.
  hasCitations() {
    return this.citations.keys > 0;
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
    for (const [dir, names] of this.bibFolders()) {
      try {
        if (!fs.existsSync(dir))
          continue;
        this.watchers.push(fs.watch(dir, (_evt, filename) => {
          if (!filename || names.has(nodePath.basename(String(filename)).toLowerCase()))
            this.onBibChange();
        }));
      } catch (e) {
      }
    }
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
  // Only the citation maps: no document changed, so a rescan would re-read every outline for
  // nothing.
  onBibChange() {
    clearTimeout(this.bibTimer);
    this.bibTimer = setTimeout(async () => {
      await this.loadCitations();
      this.notifyIndexChange();
    }, 1500);
  }
  // Empty the index (nothing to scan) and persist, telling whoever's listening.
  async resetIndex(noticeKey, notify) {
    this.setIndex([]);
    this.fileCache = /* @__PURE__ */ new Map();
    this.citations = emptyCitations();
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
    await this.loadCitations();
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
    const entries = [{ name: base, kind: "file", lang: ext, path: rel, line: 1, position: 1 }];
    for (const s of await formats.outline(ext, abs)) {
      const entry = { name: s.title, kind: "section", lang: ext, path: rel, line: s.position, position: s.position };
      if (s.anchor)
        entry.anchor = s.anchor;
      entries.push(entry);
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
    const page = String(e.position || 1);
    const encPath = (p) => p.split("/").map(encodeURIComponent).join("/");
    let uri = tpl.replace(/{abs}/g, encodeURI(absFwd)).replace(/{path}/g, encPath(e.path)).replace(/{page}/g, page).replace(/{name}/g, encodeURIComponent(e.name));
    const anchor = formats.anchorFor(e);
    if (anchor && /^file:/i.test(uri) && !uri.includes("#"))
      uri += "#" + anchor;
    return uri;
  }
  // The markdown link to insert. A section link is pinned to its section by a title binding
  // (see shared/binding), so it tracks without the label being read. A pipe would split a
  // table row.
  buildLink(e, inTable, template) {
    const url = this.buildUri(e, template);
    const title = formatBinding(this.bindingFor(e));
    const link = `[${e.name}](${title ? withTitle(url, title) : url})`;
    return inTable ? link.replace(/\|/g, "\\|") : link;
  }
  bindingFor(e) {
    const b = {};
    const cite = this.citeOf(e.path);
    if (cite)
      b.cite = cite;
    if (e.kind === "section")
      b.sec = e.name;
    return b;
  }
  pickEntry(onChoose, query) {
    new ReferenceLinkModal(this.app, this, { onChoose, query }).open();
  }
  insertLink(editor, e, template) {
    const inTable = inTableCell(editor.getValue(), editor.posToOffset(editor.getCursor("from")));
    editor.replaceSelection(this.buildLink(e, inTable, template));
  }
  // The ```reference-link block body offered for an entry: a section embeds by its own anchor
  // (a #id for HTML, #page= for a PDF, the ordinal page otherwise), any document by its path.
  embedFormats(e) {
    const out = [];
    if (e.kind === "section" && e.position) {
      const frag = formats.anchorFor(e) || "page=" + e.position;
      out.push({ label: t("embed.fmt.section", { name: e.name }), body: e.path + "#" + frag });
    }
    out.push({ label: t("embed.fmt.file"), body: e.path });
    return out;
  }
  insertEmbed(editor, e) {
    const formats2 = this.embedFormats(e);
    new PresetPickerModal(this.app, formats2, (f) => {
      editor.replaceSelection("```reference-link\n" + f.body + "\n```\n");
    }, t("modal.embedPlaceholder")).open();
  }
  // The index entry for a file dropped from outside the vault, or null when it sits outside
  // the reference root — a link there couldn't carry the portable {ref-root} token. An
  // indexed file reuses its own entry (its real name); an unindexed one gets a bare file entry.
  entryForAbsPath(abs) {
    const root = this.codeRoot();
    if (!root)
      return null;
    const rel = nodePath.relative(root, abs).split(nodePath.sep).join("/");
    if (!rel || rel === ".." || rel.startsWith("../") || nodePath.isAbsolute(rel))
      return null;
    const cached = this.fileCache.get(rel);
    if (cached && cached.entries && cached.entries[0])
      return cached.entries[0];
    return { name: nodePath.basename(rel).replace(/\.[^.]+$/, ""), kind: "file", lang: extOf(rel), path: rel, line: 1, position: 1 };
  }
  // Drop of OS files into the editor: turn each into a portable reference link or embed,
  // asked once for the whole drop. Only files under the reference root are ours; a drop with
  // none is left to Obsidian (so an image still imports as usual).
  onEditorDrop(evt, view) {
    const files = evt.dataTransfer && evt.dataTransfer.files || [];
    const entries = [];
    let outside = 0;
    for (const f of files) {
      if (!f || !f.path)
        continue;
      const e = this.entryForAbsPath(f.path);
      if (e)
        entries.push(e);
      else
        outside++;
    }
    if (!entries.length)
      return false;
    evt.preventDefault();
    if (outside)
      new Notice(t("notice.dropOutsideRoot", { count: outside }));
    const at = typeof view.posAtCoords === "function" ? view.posAtCoords({ x: evt.clientX, y: evt.clientY }) : null;
    const pos = at == null ? view.state.selection.main.head : at;
    new PresetPickerModal(this.app, [
      { key: "link", label: t("drop.asLink") },
      { key: "embed", label: t("drop.asEmbed") }
    ], (choice) => this.insertDropped(view, pos, entries, choice.key), t("drop.placeholder")).open();
    return true;
  }
  insertDropped(view, pos, entries, kind) {
    let text;
    if (kind === "embed") {
      text = entries.map((e) => "```reference-link\n" + e.path + "\n```\n").join("");
    } else {
      const inTable = inTableCell(view.state.doc.toString(), pos);
      text = entries.map((e) => this.buildLink(e, inTable, void 0)).join(inTable ? " " : "\n");
    }
    view.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length } });
    if (typeof view.focus === "function")
      view.focus();
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
    if (e.kind === "section" && e.name && !formats.hasOsAnchor(e.lang)) {
      navigator.clipboard.writeText(e.name);
      new Notice(t("notice.anchorCopied", { section: e.name }));
    }
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
    new Notice(opt.kind === "cite" ? t("notice.pinnedCite", { cite: opt.value }) : t("notice.pinned", { sec: opt.value }));
  }
  unpinLinkAtCursor(editor, link) {
    if (!parseBinding(link.title))
      return;
    editor.replaceRange("[" + link.name + "](" + link.target + ")", { line: link.line, ch: link.from }, { line: link.line, ch: link.to });
    new Notice(t("notice.unpinned"));
  }
  // One of the two selection verbs. The builder decides whether it ends up under the verb
  // or on its own; the wording follows, since inside the submenu the verb is already named.
  selectionItem(menu, kind, icon, run) {
    menu.tagged(kind, {}, (item, grouped) => item.setTitle(t("menu." + kind + (grouped ? ".item" : ".solo"))).setIcon(icon).onClick(run));
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
  // isFile, not just exists: reading a folder throws EISDIR into loadCitations' catch, and
  // the row would sit there looking healthy.
  bibStatus() {
    return this.bibPaths().map((abs) => {
      let stat = null;
      try {
        stat = fs.statSync(abs);
      } catch (e) {
      }
      return { abs, exists: !!stat, isFile: !!stat && stat.isFile() };
    });
  }
  // Folder -> the file names that count in it, so bibliographies side by side cost one watcher.
  bibFolders() {
    const dirs = /* @__PURE__ */ new Map();
    for (const abs of this.bibPaths()) {
      const dir = nodePath.dirname(abs);
      if (!dirs.has(dir))
        dirs.set(dir, /* @__PURE__ */ new Set());
      dirs.get(dir).add(nodePath.basename(abs).toLowerCase());
    }
    return dirs;
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
Object.assign(ReferenceLinkerPlugin.prototype, api, indexEvents);
Object.assign(ReferenceLinkerPlugin.prototype, actualize.methods);
module.exports = ReferenceLinkerPlugin;
