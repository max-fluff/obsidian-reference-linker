# Contributing

Thanks for taking an interest. Bug reports, viewer presets, and pull requests are all welcome.

## Reporting bugs and ideas

Open an [issue](https://github.com/max-fluff/obsidian-reference-linker/issues). For a bug, say which Obsidian version you're on, what you did, and what you expected. A small note or screenshot that reproduces it helps a lot.

## Building

```
npm install      # once, installs esbuild
npm run build    # bundle src/ -> main.js
```

`main.js` is generated. Edit the modules in `src/` and rebuild; don't edit `main.js` by hand.

`npm test` runs everything. CI runs `npm run test:core`, which is deliberately almost nothing: that the plugin loads at all, and that a sibling built from a different commit of the submodule degrades instead of crashing. Those are the two things a push must not break and the two you cannot check for yourself. Everything else is logic — changing it is what most commits are for — and it should not have to argue with CI before you can push. The [Development](README.md#development) section explains how `src/` is laid out.

## Adding a viewer preset

Built-in viewer presets live in `src/constants.js` (`PRESETS`) with their labels in `src/locales/`. A preset is a URL template built from the placeholders `{root}` `{path}` `{abs}` `{page}` `{name}`. Links are opened by handing that URL to the OS (`shell.openExternal`), which is what keeps a PDF's `#page=` fragment intact. The plugin deliberately doesn't spawn viewer processes. If you need a specific app, add a named template under *Your viewers* with a URL scheme it registers.

## Adding a document format

Format knowledge lives in `src/formats/` and nowhere else. A handler is a module exporting
`exts` plus whatever it can do; register it in `src/formats/index.js` and every caller —
indexing, hover, embeds, the settings hint — picks it up. Nothing outside that folder should
branch on an extension.

| Member | Meaning |
|---|---|
| `exts` | Extensions without the dot. Two handlers must not claim the same one. |
| `outline(abs, ext)` | `[{ title, page, anchor? }]` in reading order, `[]` when there is none. Each becomes a `section` index entry. Called at index time and cached against the file's mtime, so it may be slow but must not be chatty. `ext` is passed for a handler (ODF) whose extensions — odt/ods/odp — share one reader. |
| `render(el, req)` | Draw a preview into `el`. `req` is `{ abs, ext, page, width, isCurrent() }`. Return a cleanup function, `null` if there's nothing to release, or `false` if nothing was drawn. Check `isCurrent()` after every await — the reader may have moved on. |
| `anchorKind` | What a link into this format stores to say where it lands: `'page'`, `'id'`, or `null` for nothing. |
| `anchorFor(entry)` | The fragment that entry's link carries, without the `#`, or `null`. |
| `dispose()` | Release anything held between renders, on plugin unload. |

`anchorKind` is the one that bites, and it governs three things at once: whether `buildUri`
writes a fragment, what `urlBindState` compares to judge drift, and what `sectionAtLinkPage`
reads to pin. Get it wrong and the damage is not cosmetic — every slide past the first once
showed as stale because a pptx link stores no page and so read as page 1, and the "update
links" command would then have written a `#page=` into it that PowerPoint cannot open.

Anchoring is decided **per entry**, not per format: `anchorKind` says what kind of position
this format uses, `anchorFor` says whether this particular entry has one. HTML is why — a
generated doc page anchors nearly every heading but not its title, so `'id'` with
`anchorFor` returning `null` for the id-less ones is the honest answer. Where an entry has no
anchor the position is still exact inside Obsidian; only the external open lands at the top,
and `openEntry` puts the section name on the clipboard so the viewer's own search finishes
the jump.

The OOXML/ODF/EPUB family is all ZIP + XML, read through `src/zip.js` (`node:zlib`, no
dependency) and `src/xml.js`. Neither is a general-purpose implementation: the zip reader
takes member sizes from the central directory rather than the local header, because writers
that can't seek leave the local one zeroed, and `src/xml.js` assumes the well-formed XML that
these producers emit. `test/helpers/ooxml.js` builds real archives — including that streaming
case — so the format tests read bytes rather than a hand-shaped object.

A rendered preview (markdown, HTML, EPUB) shows the document's own images by reading each
referenced file's bytes and handing them to `inlineImages` as a blob URL — a blob is the one
resource kind Obsidian's CSP lets rendered content load, and it is how the plain image preview
already works. A handler supplies a `loadImage(src)` that resolves the src its own way: off
disk for HTML and markdown, out of the zip for EPUB. Two things are deliberate and must stay:
the disk loader refuses a src that climbs out of the document's folder, and CSS is never
applied — a page's stylesheet uses global selectors that would restyle Obsidian itself, which
the review guidelines forbid.

## The shared submodule

`src/shared/` is a git submodule shared with the three sibling linkers, and most of the interesting code lives there. Read [`src/shared/CONTRIBUTING.md`](src/shared/CONTRIBUTING.md) before changing anything under it: it has the architecture, the `api.linker` contract that lets the plugins coexist, the rules for menus, CSS and locales, and the order commits have to go in.

## Pull requests

- Keep changes focused and rebuild before committing so `main.js` matches `src/`.
- Match the surrounding style: small CommonJS modules, comments only where the reason isn't obvious from the code.
- Describe what changed and why in the PR.
