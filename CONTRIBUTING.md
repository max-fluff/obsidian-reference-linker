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
`id` and `exts` plus whatever it can do; register it in `src/formats/index.js` and every
caller — indexing, hover, embeds, the settings list — picks it up. Nothing outside that
folder should branch on an extension.

| Member | Meaning |
|---|---|
| `id` | Stable key for the format's row in the settings list. Its label is `set.format.<id>` in `src/locales/`, so a new handler needs that key in both locales or the row shows the key itself. |
| `exts` | Extensions without the dot. Two handlers must not claim the same one. List every extension the same package is saved under — a `.docm` and a `.dotx` are a `.docx` with another name, and a handler that claims only the plain one reports the rest as unreadable. |
| `outline(abs, ext)` | `[{ title, position, anchor? }]` in reading order, `[]` when there is none. Each becomes a `section` index entry. Called at index time and cached against the file's mtime, so it may be slow but must not be chatty. `ext` is passed for a handler (ODF) whose extensions share one reader — its `KIND` table folds each template and the drawing onto the three kinds that reader knows. Every entry states `position`, never `page`: the index reads `s.position`, and a handler that spells it otherwise indexes every section at `undefined`. |
| `render(el, req)` | Draw a preview into `el`. `req` is `{ abs, ext, position, width, isCurrent() }`. Return a cleanup function, `null` if there's nothing to release, or `false` if nothing was drawn. Check `isCurrent()` after every await — the reader may have moved on. |
| `anchorKind` | What a link into this format stores to say where it lands: `'page'`, `'id'`, or `null` for nothing. |
| `positionUnit` | What a position counts — `'time'` for a recording, `'page'` (the default) for pages, slides, chapters and headings. An embed accepts only its format's spelling (`time:`/`#t=` against `page:`/`#page=`) and names the right one when given the other, so the two can't be confused. |
| `anchorFor(entry)` | The fragment that entry's link carries, without the `#`, or `null`. |
| `dispose()` | Release anything held between renders, on plugin unload. |

`anchorKind` is the one that bites, and it governs three things at once: whether `buildUri`
writes a fragment, what `urlBindState` compares to judge drift, and what `sectionAtLink`
reads to pin. Get it wrong and the damage is not cosmetic — every slide past the first once
showed as stale because a pptx link stores no position and so read as position 1, and the
"update links" command would then have written a `#page=` into it that PowerPoint cannot open.

One coordinate runs through all of this and it is called **`position`**, never `page`: it is a
page in a PDF, a slide in a deck, a chapter in a book, a heading in a document and a second in
a recording. `page` survives only where it is literally the wire format — the `#page=`
fragment, the `{page}` template placeholder, the embed's `page:` key for paged formats.

Anchoring is decided **per entry**, not per format: `anchorKind` says what kind of position
this format uses, `anchorFor` says whether this particular entry has one. HTML is why — a
generated doc page anchors nearly every heading but not its title, so `'id'` with
`anchorFor` returning `null` for the id-less ones is the honest answer. Where an entry has no
anchor the position is still exact inside Obsidian; only the external open lands at the top,
and `openEntry` puts the section name on the clipboard so the viewer's own search finishes
the jump.

**A document carries its own typography, and a preview is only worth having if it shows it.**
`src/formats/css.js` builds the stylesheet — it hands out a class per distinct set of
properties, so a long document's CSS stays shorter than the document — and `docx-styles.js` and
`odf-styles.js` are the translations either side of it. Word counts font size in half-points,
spacing in twentieths of a point and borders in eighths; ODF writes real lengths but in units
CSS does not all share. Every one of those conversions is pinned by a test, because getting one
wrong renders a document at twenty times its size rather than visibly failing.

The page is drawn **at its true size and shrunk with `zoom`** to whatever width there is room
for. Laying it out small instead would change every proportion the author chose, which is the
whole of what a document's design is. `zoom` and not `transform: scale` because it reflows the
box, so the frame can still measure its own height — and that height must be read with
`getBoundingClientRect`, since `scrollHeight` reports the unscaled figure. Horizontal margins
are always kept; the vertical ones only in the *page* view (`documentView`), because a section
is an excerpt rather than a sheet.

Three things about resolving a style are load-bearing. A style-level `w:rPr` is not the one
inside `w:pPr` — that one formats the paragraph mark, and taking it gives every paragraph the
look of its own pilcrow. Bold has three states, not two: a style can switch it explicitly off
to override the one it is based on. And an attribute must be read off an element's *opening
tag*: `xml.attr` scans whatever it is handed, so a whole paragraph takes the style name of the
first span inside it.

Three output shapes cover every office format, and adding one is picking a shape rather than
writing a renderer: a text document (odt, docx) becomes structured HTML, a spreadsheet (ods,
xlsx) becomes a grid through the shared `util.gridToHtml`, and a deck (odp, pptx) becomes an
absolutely-positioned layout. **A slide is a layout**, and every shape in one states where it
sits — 115 of the 126 in the reference deck do, the rest inheriting from the slide layout — so
reading those places is what turns a deck from a list of lines into something recognisable.
`pptx-styles.js` is that translation. Three traps in it: position is in EMU and font size in
hundredths of a point, neither of which matches Word's units; a group gives its children their
own coordinate space, so a child read at face value lands elsewhere; and most colours are named
(`accent1`, `tx1`) and only resolve through the master's colour map into the theme. Charts,
SmartArt, gradients, effects and animations are out — a shape with neither text nor fill draws
nothing.

**Most of a slide is not on the slide.** Its design — the coloured banner, the logo, the
background — lives on the layout it is built from and the master behind that; drawn from the
slide part alone a deck is a few words on a blank white sheet, which is exactly how the first
attempt looked. So the layout's and master's shapes go underneath, **minus their placeholders**:
those hold the prompt text ("Click to edit Master title style") that would otherwise sit beneath
the slide's own words. A layout saying `showMasterSp="0"` means it replaces the master's
decoration rather than sitting on top of it. Font size inherits the same way — nine tenths of
the runs in a real deck state none, taking it from the shape's list style, then the layout's,
then the master's `p:txStyles`.

Nothing in `SLIDE_RULES` may set a width or height on `img`: `.slide img` outranks the class a
picture's placement is written on, so one such declaration silently sizes every picture in the
deck to the whole slide.

**A paragraph is not a line.** A real deck writes `a:br` between the runs of one paragraph, so
runs and breaks are walked together through `xml.elementsOf` — taking the runs alone puts a
whole block of instructions on one line. The bullet resolves down the same chain as everything
else, with `a:buNone` counting as a statement; it is drawn as an inline box one hanging indent
wide, which is where PowerPoint's tab stop would put the text after it. That indent is applied
only with a bullet, or it pulls the first line out on its own. `a:normAutofit` records the
scale PowerPoint applied to make the text fit, and it multiplies whatever size the chain
settled on, so it can only be applied last.

**Word's outline is a bonus, not the feature.** Across a corpus of real `.docx` files most
carry no heading style whatever, so an empty outline is the normal result and the body preview
is what the format is worth. Three shapes cost more than they look: a heading style resolves
through `styles.xml`'s English `w:name` because a localized Word translates the styleId; a
heading marked only by a direct `w:outlineLvl` is the only marking some documents have; and a
table cell or a picture-only paragraph carrying a heading style is not a section. Run text is
never trimmed per run — Word splits a sentence across runs on every edit, and trimming welds
the words together, the same defect that once joined two pptx lines.

The OOXML/ODF/EPUB family is all ZIP + XML, read through `src/zip.js` (`node:zlib`, no
dependency) and `src/xml.js`. Neither is a general-purpose implementation: the zip reader
takes member sizes from the central directory rather than the local header, because writers
that can't seek leave the local one zeroed, and `src/xml.js` assumes the well-formed XML that
these producers emit. `test/helpers/ooxml.js` builds real archives — including that streaming
case — so the format tests read bytes rather than a hand-shaped object. ODF and EPUB both
require `mimetype` to be the archive's first member and stored uncompressed; this reader
doesn't care, so a fixture that breaks the rule passes every test here and is reported as a
damaged file by the application that owns it.

**The check fixtures in `test-vault/` are files the real applications wrote**, and it is worth
keeping them that way. Hand-built ones only encode what was already thought of: they said pptx
worked until a real deck welded two lines together, and said ODF worked until real LibreOffice
files showed a style preamble rendered as blank lines, a comment's author printed mid-sentence,
and slide text invisible because it sat in `draw:custom-shape`.

A rendered preview (markdown, HTML, EPUB, ODT) shows the document's own images by reading each
referenced file's bytes and handing them to `inlineImages` as a blob URL — a blob is the one
resource kind Obsidian's CSP lets rendered content load, and it is how the plain image preview
already works. A handler supplies a `loadImage(src)` that resolves the src its own way: off
disk for HTML and markdown, out of the zip for EPUB. Two things are deliberate and must stay:
the disk loader refuses a src that climbs out of the document's folder. An HTML page's own
`<style>` is applied, but only after `preview.scopeCss` rewrites every selector to a per-render
class and drops `@media`/`@font-face`/`@import` and fixed/sticky positioning — a page's global
`body{…}` left unscoped would restyle Obsidian itself, which the review guidelines forbid. That
scoping is the one thing to never loosen; its safety is pinned in `test/scopecss.test.js`.

**A page that brought its own stylesheet is rendered in an `iframe` (`preview.renderFrame`),
not inlined.** That is the only real style isolation there is, and inlining loses twice over:
the HTML sanitizer strips the `class` attributes the page's CSS is written against, and theme
rules like `.theme-dark .markdown-rendered pre` — matching through the note's own ancestor
container — outrank anything scoped and repaint the page's light code blocks dark. The frame
has no `allow-scripts`; `allow-same-origin` is there only to measure the laid-out height, and
images travel inside the document as `data:` URIs because a frame can reach neither the
parent's blob URLs nor `file://`. Whether the CSP permits a `srcdoc` frame can't be known
outside the app, so an empty frame removes itself and calls back to the inline path — which is
why the scoped-CSS route above is kept rather than deleted. A document with no stylesheet of
its own stays on the inline path deliberately, so it picks up Obsidian's styling and reads
like the rest of the vault.
A cell's text comes from `xlsx-format.format(value, code)`, which is the sheet's own number
format applied to the double it stores — a currency column is otherwise bare integers, and a
date the day count it is kept as. That module owns the fallback too: General, a fraction and
scientific notation are not translated and come back as the plain number, so there is one date
renderer rather than a second one behind it. ODF needs none of this, because it writes the
formatted text into the file alongside the value.

A merged cell reaches the grid as `util.spanning(cell, cols, rows)` with `util.COVERED` in every
place it takes; `gridToHtml` draws the span and skips the covered ones, clamping to what is
actually drawn. The four formats state it four ways — xlsx keeps a separate `mergeCells` list,
ods writes a `table:covered-table-cell` per place, docx writes `w:gridSpan` across and a run of
`w:vMerge` cells down, pptx `gridSpan`/`rowSpan` with `hMerge`/`vMerge`.

ODS renders as an HTML table and ODT is converted to HTML (`odf.odtToHtml`) rather than shown
as flat lines.

**Every grid — xlsx, ods, csv — goes through `util.gridToHtml` onto the one paper
(`css.SHEET_RULES`), and none of them promotes a row to a header.** A sheet says which of its
rows is a header by formatting it, so guessing turns a leading row of values into a heading;
CSV is the exception, because the format has nowhere else to name its columns. The workbook and
the ODF sheet both render in the frame for the reason above: a cell's formatting is a class, and
the inline path would keep the grid and lose the look.

## The shared submodule

`src/shared/` is a git submodule shared with the three sibling linkers, and most of the interesting code lives there. Read [`src/shared/CONTRIBUTING.md`](src/shared/CONTRIBUTING.md) before changing anything under it: it has the architecture, the `api.linker` contract that lets the plugins coexist, the rules for menus, CSS and locales, and the order commits have to go in.

## Pull requests

- Keep changes focused and rebuild before committing so `main.js` matches `src/`.
- Match the surrounding style: small CommonJS modules, comments only where the reason isn't obvious from the code.
- Describe what changed and why in the PR.
