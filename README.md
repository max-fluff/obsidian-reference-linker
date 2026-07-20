<p align="center">
  <img src="docs/images/banner.svg" alt="Reference Linker — autocomplete document references, jump to the exact page" width="760">
</p>

# Reference Linker

<p align="center">
  <a href="https://community.obsidian.md/plugins/reference-linker"><img src="https://img.shields.io/badge/dynamic/json?logo=obsidian&color=7c3aed&query=%24%5B%22reference-linker%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json&label=downloads" alt="Obsidian downloads"></a>
  <a href="https://github.com/max-fluff/obsidian-reference-linker/releases/latest"><img src="https://img.shields.io/github/v/release/max-fluff/obsidian-reference-linker?sort=semver&color=7c3aed&label=release" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/max-fluff/obsidian-reference-linker?color=7c3aed" alt="License: MIT"></a>
</p>

An Obsidian plugin that autocompletes links to external documents (PDFs, Office files, images) and inserts a markdown link that opens the document in your default app at the right page. For PDFs and PowerPoint decks it also indexes the outline — bookmarks, or one entry per slide — so you can link straight to a section, preview it on hover, and embed it inline.

It's the document counterpart to [Code Linker](https://github.com/max-fluff/obsidian-code-linker), which does the same for source code. Your reference material usually lives outside the vault, in project folders, download folders or a research library. This plugin makes it as linkable as a note, without copying anything in.

Available in the Obsidian community catalog: **[community.obsidian.md/plugins/reference-linker](https://community.obsidian.md/plugins/reference-linker)**.

> Desktop only. It reads files from disk through Node's filesystem API, which isn't available on mobile.

<p align="center">
  <img src="docs/images/hero.png" alt="A note linking to sections of a PDF that lives outside the vault, with one page embedded inline" width="700">
</p>

The plugin ships as `main.js`, `manifest.json` and `styles.css`. It scans the folders you configure and keeps the index in memory, so there's no index file to commit and nothing to generate: the index is rebuilt on startup and on demand. PDF outlines and page previews use the pdf.js that Obsidian already ships, so no second copy is bundled. `main.js` is built from `src/` with esbuild (see [Development](#development)).

## Contents

- [What it does](#what-it-does)
  - [Autocomplete as you type](#autocomplete-as-you-type)
  - [Document sections](#document-sections)
  - [Portable `{ref-root}` links](#portable-ref-root-links)
  - [Opening at a page](#opening-at-a-page)
  - [Hover preview](#hover-preview)
  - [Inline embeds](#inline-embeds)
  - [Keeping links current](#keeping-links-current)
- [Commands](#commands-command-palette-ctrlp)
- [Settings](#settings)
- [Skipped contexts](#skipped-contexts)
- [Public API](#public-api)
- [How it works](#how-it-works)
- [Development](#development)
- [Installation](#installation)
- [Compatibility](#compatibility)
- [Related plugins](#related-plugins)

## What it does

### Autocomplete as you type

Type a trigger (default `@!`) followed by a document name and pick a match. The plugin indexes the files under your **Reference root** by name, with fuzzy matching. Suggestions are suppressed inside code blocks, inline code, frontmatter and existing links (see [Skipped contexts](#skipped-contexts)).

<p align="center">
  <img src="docs/images/suggest.png" alt="The autocomplete dropdown after typing the trigger and a document name" width="560">
</p>

The inserted link looks like:

```markdown
[paper-with-outline](file:///{ref-root}/papers/paper-with-outline.pdf)
```

Filter a common name by an inline prefix: an extension (`pdf:`, `pptx:`, `png:`) or `sec:` to match only sections.

### Document sections

Where a format has an outline, the plugin reads it and indexes each section with its page number. It's the same idea as Code Linker indexing a symbol on its line, with a section on its page instead. So `@!intro` finds the *Introduction* section of a paper, and the inserted link carries that page, plus a `sec:` binding in the title that pins it to the section (see [Keeping links current](#keeping-links-current)):

```markdown
[Introduction](file:///{ref-root}/papers/paper-with-outline.pdf#page=1 "sec:Introduction")
```

<p align="center">
  <img src="docs/images/sections.png" alt="Suggestions filtered to sections only: the same section name in two documents, told apart by its path" width="560">
</p>

What each format gives you:

| Format | Sections | Preview | Opens at the position |
|---|---|---|---|
| PDF | outline (bookmarks) | page rendered by pdf.js | yes — `#page=`, when the default app is a browser |
| HTML, XHTML | every heading that carries an `id` | the section's text | yes — `#id`, and the browser is the default app |
| Markdown, txt, log | headings, on their line | the text itself | no — see below |
| EPUB | table of contents (EPUB 2 and 3) | the chapter's text | no |
| PPTX | one per slide | the slide's text | no |
| ODT, ODP, ODS | headings / slides / sheets | the text | no |
| Audio, video | — | the file, seeked to `#t=` seconds | no |
| Images | — | the image | — |
| Anything else | — | — | — |

HTML is the one worth setting up: generated documentation (AsciiDoc, Sphinx, Doxygen,
javadoc) puts an `id` on nearly every heading, so a link lands on the exact section in your
browser. A heading with no `id` — usually just the page title — is still indexed by name, it
simply opens the file at the top.

Markdown, HTML and EPUB previews render as documents — headings, lists, code and the images
they reference (read straight off disk or out of the book), not a page's stylesheet.

A document with no outline — a PDF without bookmarks, a `.docx`, an `.epub` — is still indexed by file name, and its link still opens it. Only the section entries and the preview are missing.

### Portable `{ref-root}` links

`{ref-root}` is not expanded when the link is inserted. The note keeps the literal text `{ref-root}` and a relative path, and the absolute base is filled in only when the link is opened or rendered. That keeps notes portable across machines: the file on disk holds a relative path, and each machine supplies its own **Reference root**.

The token is namespaced so a link says which plugin owns it — Code Linker writes `{code-root}` into its own links. Notes written before the namespacing carry a bare `{root}`, which still resolves: it is read as this plugin's when a `sec:` binding or the path itself shows the link is ours, and left alone otherwise.

### Opening at a page

Click a link and the document opens in your OS default app. When that app is a browser, which is the common default for PDFs, a `#page=` link jumps straight to the page.

The link is handed to the OS through the shell, so the `#page=` fragment survives intact. Obsidian's own external-link opener mangles it, so the plugin routes clicks on PDF-page links itself. The commands and the hover/embed headers open the same way.

Not every viewer honours a fragment. PowerPoint, Word and most e-book readers are handed it as part of the path and then find no file at all, so the plugin doesn't write one for those formats — a `.pptx` section link opens the deck at the first slide. The section name goes to the clipboard when you open one, so the viewer's own search box takes you the rest of the way. Inside Obsidian the anchor is exact either way: hover and embeds open at the section the link names.

Which fragment a link carries is the format's business: `#page=` for a PDF, `#id` for HTML, `#t=` seconds for a recording, none where the viewer would choke on one.

### Hover preview

<p align="center">
  <img src="docs/images/hover.png" alt="The hover popover over a reference link, showing the target PDF page rendered" width="560">
</p>

Hover a reference link to preview it without leaving your notes: for a PDF, the target page rendered to a canvas; for a slide, its text; for an image, the image itself. PDF rendering uses the pdf.js that Obsidian already ships, so no second copy is bundled. In live preview, hold Ctrl/Cmd to show it, the way a note preview works; in reading view a plain hover is enough. Toggle it with **Preview on hover** in settings.

### Inline embeds

A fenced ` ```reference-link ` block renders a document page or image inline in the note, so the reference sits next to your writing without being copied in:

````markdown
```reference-link
papers/paper-with-outline.pdf#page=3
```
````

- A path (`papers/report.pdf`) shows the first page; add `#page=N` (or `:N`) for a specific page.
- A name or section (`Introduction`) is resolved through the index to its file and page.
- An image path shows the image; a `.pptx` path shows the slide's text.
- Optional `key: value` lines after the target tune it: `page: N`, `width: N`, `title: …`.

<p align="center">
  <img src="docs/images/embed.png" alt="Two rendered reference-link embeds: a PDF page with a title, and an image" width="640">
</p>

The header is clickable and opens the document at that page; right-click an embed for **Open** / **Refresh**. Embeds re-render when the index rebuilds, so an open embed follows changes on disk. The command **Insert reference embed** picks an entry and inserts the block.

### Keeping links current

A note is text first. In `[label](url "title")` the address is the url and the label is your prose, so the plugin reads neither for tracking: rename the label or retarget the link and nothing is second-guessed. Tracking is opt-in and lives in the title, as a binding.

A section link is inserted already pinned to its section:

```markdown
[whatever you like](file:///{ref-root}/papers/paper-with-outline.pdf#page=2 "sec:Methods")
```

The `sec:` binding is what the plugin follows. If the PDF is reissued and *Methods* moves to another page, the link gets a warning-coloured underline and can be fixed to the new page. If the section is gone from the outline, or the document isn't indexed, the underline is error-coloured. A link with no binding, or a title that names no section (a plain tooltip), is left alone. **Mark stale links** (on by default) toggles the underlines; they show in reading view and live preview.

<p align="center">
  <img src="docs/images/stale.png" alt="Two marked links: a drifted one underlined in the warning colour, a link to a missing section in the error colour" width="560">
</p>

To fix drift:

- **Update reference links in this note** / **… in the whole vault** rewrite each drifted link's page, keeping its binding.
- Right-click a link for **Update this reference link** (when drifted), **Pin to section** (an unpinned link whose page begins a section), or **Unpin**.
- **Pin unpinned reference links in this note** / **… in the whole vault** retrofit notes written before pinning.

<p align="center">
  <img src="docs/images/update-preview.png" alt="The update preview: each drifted link with its page-to-page change, checkable before anything is written" width="540">
</p>

Because the section is named in the title, not read from the label, the label stays yours to write however you like. A multi-word or non-ASCII section name is escaped in the binding (`sec:Chapter%201`) and shown in full again on hover.

## Commands (command palette, Ctrl+P)

- **Insert reference link** — insert a link at the cursor.
- **Insert reference link as…** — insert one link with a one-off viewer choice, leaving the default alone.
- **Open referenced document** — open the picked document without inserting.
- **Copy reference link** — copy the link with `{ref-root}` resolved to the absolute path (a copied link is usually pasted outside the vault, where the portable token wouldn't resolve).
- **Insert reference embed** — insert a ` ```reference-link ` block.
- **Convert selection to reference link** / **Find and open document** — resolve the selection against the index, then convert it or open the document (one match acts directly, several open the picker).
- **Update reference links in this note** / **… in the whole vault**.
- **Pin unpinned reference links in this note** / **… in the whole vault** — attach a `sec:` binding to links whose page begins a section.
- **Rebuild reference index**.

<p align="center">
  <img src="docs/images/commands.png" alt="The command palette filtered to the Reference Linker commands" width="560">
</p>

### Priority among linker plugins

Install more than one linker and they will sometimes claim the same word or the same link. It goes to whichever sits highest in **Settings → Maintenance → Priority among linker plugins**, and the loser stands aside — no double highlight, one entry in the right-click menu, one merged list of suggestions while you type.

The list appears only when another linker is installed. Each plugin moves itself, so reordering may take a move from more than one settings tab; every arrangement is reachable that way.

The selection commands are also in the editor's right-click menu. Right-clicking an existing reference link adds link-specific items: **Copy reference link**, **Pin to section** / **Unpin**, and **Update this reference link** when its section has drifted.

<p align="center">
  <img src="docs/images/context-menu.png" alt="The right-click menu on a reference link, showing the link-specific items" width="420">
</p>

## Settings

**Reference index**
| Setting | Default | What it does |
| --- | --- | --- |
| **Reference root** | vault's parent folder | Base folder the scan paths resolve against. Empty = the folder containing the vault. |
| **Scan folders** | whole root | One path per line, relative to the reference root. Empty scans the whole root. |
| **File extensions** | none | Which file types to index, space- or comma-separated (`.pdf .pptx .png`). Empty means nothing is indexed, so set this first. |
| **Skip folders** | `.git`, `node_modules`, `.obsidian` | A bare name is skipped at any depth; a path with a slash skips only that folder. |
| **Auto-refresh index** | on | Watch the scan folders and rebuild when documents change. Not available on Linux, which lacks recursive watching; rebuild manually there. |

**Suggestions & links**
| Setting | Default | What it does |
| --- | --- | --- |
| **Trigger** | `@!` | Text that starts a suggestion. (`@@` is Code Linker's default; `@!` avoids a clash when both are installed.) |
| **Min characters / Max results** | `1` / `12` | When suggestions appear, and how many. |
| **Viewer link preset** | file:// | The link format. With **ask-on-insert** you pick per link; add your own named URL templates under **Your viewers**. |
| **Editor context menu** | on | Add the convert/open items to the editor right-click menu. |

**Hover preview**: **Preview on hover** (on).
**Links**: **Mark stale links** (on).

### Styling

The stale/broken underline colours and style are exposed to the [Style Settings](https://github.com/mgmeyers/obsidian-style-settings) plugin under a *Reference Linker* section. They're plain CSS variables (`--reference-linker-stale-color`, `--reference-linker-broken-color`) you can override in a snippet.

## Skipped contexts

Suggestions never fire inside code blocks (` ``` ` and `~~~`), inline code, frontmatter, or existing `[[...]]` and `[..](..)` links. When a link is written into a Markdown table cell, the pipe is escaped so the table isn't broken. Stale/broken marks and the **Update reference links** commands skip links inside code too, where they're example text rather than live links.

## Public API

The in-memory index is exposed at `app.plugins.plugins['reference-linker'].api`:

| Method | Returns |
| --- | --- |
| `getEntries()` | every entry: `{ name, kind, ext, path, page }` (`kind` is `file` or `section`) |
| `getFiles()` | one row per file: `{ name, path, ext, entries }` |
| `getStats()` | `{ files, entries, byExt, byKind }` |
| `find(text)` | entries matching a name or path tail |
| `linkFor(entry)` | the portable `[name](uri)` markdown link |
| `uriFor(entry)` | a ready-to-open absolute URI (`{ref-root}` resolved) |
| `onChange(cb)` | subscribe to rebuilds; returns an unsubscribe function |
| `version`, `root()` | plugin version; the resolved reference root |

A DataviewJS example that counts indexed documents per type:

````md
```dataviewjs
const api = app.plugins.plugins['reference-linker']?.api;
if (!api) { dv.paragraph('Reference Linker is not enabled.'); }
else {
  const { byExt } = api.getStats();
  dv.table(['Type', 'Count'], Object.entries(byExt));
}
```
````

## How it works

A rebuild re-reads only files whose modification time changed, so a large library re-indexes quickly and a PDF's outline is parsed only when that file actually changes. The per-keystroke check that suppresses suggestions in code, links and frontmatter tests just the cursor position, not the whole document.

The plugin reads documents from arbitrary paths on disk through Node's filesystem API, since the whole point is that they live outside your vault. That's why it's desktop-only (`isDesktopOnly`) and why it asks for a **Reference root** rather than using the vault.

## Development

The plugin is written as small CommonJS modules in `src/` and bundled into `main.js` by esbuild. `main.js` is generated: edit `src/` and rebuild.

Generic code shared with the sibling linker plugins lives in `src/shared/`, a git submodule of [obsidian-linker-shared](https://github.com/max-fluff/obsidian-linker-shared). Clone with `--recurse-submodules`:

```sh
git clone --recurse-submodules https://github.com/max-fluff/obsidian-reference-linker
npm install      # once, installs esbuild
npm run build    # bundle src/ -> main.js
```

In an existing clone without the submodule, run `git submodule update --init` first.

`src/` layout:

- `main.js` — the `Plugin` class: lifecycle, settings, folder scan, link building; applies the mixins below.
- `constants.js` — default settings and the `file://` preset.
- `suggest.js` — the `EditorSuggest` that drives autocomplete.
- `filter.js` — the inline `pdf:` / `sec:` query filter.
- `pdf.js` — Obsidian's pdf.js via `loadPdfJs()`: outline reading and page rendering.
- `hover.js` — the page/image popover.
- `embed.js` — the inline ` ```reference-link ` block renderer.
- `actualize.js` — stale/broken detection and the "Update reference links" actions.
- `api.js` — the public API mixin (`app.plugins.plugins['reference-linker'].api`).
- `modal.js` — the fuzzy pickers (index entries, viewer formats).
- `settings-tab.js` — the settings UI.
- `folder-suggest.js` — filesystem folder autocomplete for the root/scan/skip fields (feature-detected).
- `shared/` — git submodule shared with the sibling linker plugins: markdown helpers, the link-binding grammar, the i18n engine, the folder-list settings editor, and the family's branding generators (dev-only, nothing under `shared/branding/` is bundled).
- `locales/` — interface strings (English and Russian), fed to the shared i18n engine.

The header images are generated rather than hand-drawn. `docs/branding.config.mjs` holds this plugin's mark, motif and copy, and the shared generators turn it into the assets:

```sh
npm run banner   # docs/images/banner.svg + social-preview.svg
npm run plates   # store screenshot backdrops -> docs/images/store/
```

`icon.svg` and `icon-mono.svg` are hand-written, and the config reuses their paths verbatim, so the mark on the icon, the banner and the store plates is one drawing. See [`BRANDING.md`](src/shared/branding/BRANDING.md) for the conventions.

To deploy into a test vault on each build, create `esbuild.local.mjs` exporting `deployTargets` (a list of plugin folders to copy the build into). `node_modules/`, `test-vault/` and `esbuild.local.mjs` are git-ignored.

## Installation

This plugin is desktop-only, since it reads the filesystem.

**From Obsidian (recommended).** Open *Settings → Community plugins → Browse*, search for **Reference Linker**, then *Install* and *Enable*. You can also open its catalog page directly: [community.obsidian.md/plugins/reference-linker](https://community.obsidian.md/plugins/reference-linker).

**Manually.** Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/max-fluff/obsidian-reference-linker/releases/latest) into `<vault>/.obsidian/plugins/reference-linker/`, then enable the plugin in *Settings → Community plugins*.

**Beta builds via [BRAT](https://github.com/TfTHacker/obsidian42-brat).** Add the repository `max-fluff/obsidian-reference-linker` to test unreleased changes before they reach the catalog.

After enabling, set **Reference root** and **File extensions** in settings. The index stays empty until extensions are set.

## Compatibility

Requires Obsidian 1.4.0 or newer. Desktop-only: the index is built by reading the filesystem through Node's API, which isn't available on mobile. On Linux, **Auto-refresh index** isn't available because it relies on recursive `fs.watch`; rebuild manually there, everything else works. Interface in English and Russian, following Obsidian's language.

None of these are required, the plugin runs on its own, but it cooperates with them if you have them installed:

- **[Style Settings](https://github.com/mgmeyers/obsidian-style-settings)** — a UI for the stale/broken underline colours and style.
- **[Dataview](https://github.com/blacksmithgu/obsidian-dataview)** — query the index from DataviewJS through the [public API](#public-api).

## Related plugins

The rest of the linker family, also by the author. Two of them autocomplete a name into a deep-link that lands on the exact spot, and two highlight words already in your notes and link them.

**[Code Linker](https://community.obsidian.md/plugins/code-linker)** — autocompletes references to your source code and inserts a deep-link that opens the file at the exact line in your editor (VS Code, JetBrains, …). Desktop-only. This plugin is its document counterpart, with a section on its page instead of a symbol on its line.

<p align="center">
  <a href="https://community.obsidian.md/plugins/code-linker">
    <img src="docs/images/code-linker-banner.svg" alt="Code Linker — autocomplete code references, jump to the exact line" width="480">
  </a>
</p>

**[Glossary Linker](https://community.obsidian.md/plugins/glossary-linker)** — highlights glossary terms in any word form, turns them into real links, and learns new aliases from links you've already made. Works on desktop and mobile.

<p align="center">
  <a href="https://community.obsidian.md/plugins/glossary-linker">
    <img src="docs/images/glossary-linker-banner.svg" alt="Glossary Linker — highlight terms in any word form, then link them" width="480">
  </a>
</p>

**[Heading Linker](https://community.obsidian.md/plugins/heading-linker)** — the file-based sibling of Glossary Linker: each heading inside a chosen file is a term, matched in any word form and turned into a link. Works on desktop and mobile.

<p align="center">
  <a href="https://community.obsidian.md/plugins/heading-linker">
    <img src="docs/images/heading-linker-banner.svg" alt="Heading Linker — highlight words in any form, link them to headings" width="480">
  </a>
</p>

## License

MIT, see [`LICENSE`](LICENSE).
