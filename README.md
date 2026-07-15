# Reference Linker

An Obsidian plugin that autocompletes links to your **external documents** — PDFs, Office files, images — and inserts a markdown link whose URL opens the document in an external viewer, at the right page.

> **Status: early development.** This is the third plugin in a family (after [Code Linker](https://github.com/max-fluff/obsidian-code-linker) and [Glossary Linker](https://github.com/max-fluff/obsidian-glossary-linker)), forked from Code Linker's scaffolding. It is being built in phases — see [`ROADMAP.md`](ROADMAP.md). This README grows as the phases land.

Type a trigger (default `@!`) followed by a document name, pick a match, and get a link like:

```markdown
[paper-with-outline](file:///{root}/paper-with-outline.pdf)
```

The note keeps the literal `{root}` and a relative path, so it stays portable; `{root}` is filled with your **Reference root** when the link is opened. The plugin scans the folders you configure (using Node's filesystem API) and keeps the index in memory — there is no index file to commit.

## How it opens documents

- **file://** (default) — `file:///{root}/{path}`, opens in the OS default app.
- **Browser** — `file:///{root}/{path}#page={page}`, so a browser's PDF viewer jumps to the page.
- **Your viewers** — named URL/command templates you add, with placeholders `{abs}` `{path}` `{page}` `{name}` `{root}`.

## Roadmap

The plan and acceptance criteria for each phase live in [`ROADMAP.md`](ROADMAP.md). In short: file index + autocomplete + `file://` (MVP), then PDF-outline sections, hover preview, inline embeds, and stale-link detection + a public API.

## Development

The plugin is written as small CommonJS modules in `src/` and bundled into `main.js` by esbuild. `main.js` is generated — edit `src/` and rebuild.

Generic code shared with the sibling linker plugins lives in `src/shared/`, a git submodule of [obsidian-linker-shared](https://github.com/max-fluff/obsidian-linker-shared). Clone with `--recurse-submodules`:

```sh
git clone --recurse-submodules https://github.com/max-fluff/obsidian-reference-linker
npm install      # once, installs esbuild
npm run build    # bundle src/ -> main.js
```

In an existing clone without the submodule, run `git submodule update --init` first.

To deploy into a test vault on each build, create `esbuild.local.mjs` exporting `deployTargets` (a list of plugin folders to copy the build into). `node_modules/`, `test-vault/` and `esbuild.local.mjs` are git-ignored.

## Installation

This plugin is desktop-only (it reads the filesystem). It is not in the community catalog yet; install a build manually into `<vault>/.obsidian/plugins/reference-linker/` (`main.js`, `manifest.json`, `styles.css`) or via [BRAT](https://github.com/TfTHacker/obsidian42-brat) from `max-fluff/obsidian-reference-linker`.

## Compatibility

Requires Obsidian 1.4.0 or newer. Desktop-only. Interface in English and Russian, following Obsidian's language.

## Related plugins

Also by the author — part of the same linker family:

- **[Code Linker](https://github.com/max-fluff/obsidian-code-linker)** — autocomplete links to your source code, opening the file at the right line in your editor.
- **[Glossary Linker](https://github.com/max-fluff/obsidian-glossary-linker)** — highlight glossary terms in any word form and turn them into links.

## License

MIT — see [`LICENSE`](LICENSE).
