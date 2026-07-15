'use strict';

// English — the source of truth. Every other locale falls back to these keys.

module.exports = {
  // Commands
  'cmd.rebuildIndex': 'Rebuild reference index',
  'cmd.insertLink': 'Insert reference link',
  'cmd.insertLinkAs': 'Insert reference link as…',
  'cmd.switchPreset': 'Switch viewer preset',
  'cmd.openFile': 'Open referenced document',
  'cmd.copyLink': 'Copy reference link',
  'cmd.convertSelection': 'Convert selection to reference link',
  'cmd.openSelection': 'Find and open document',
  'cmd.insertEmbed': 'Insert reference embed',
  'cmd.updateLinksNote': 'Update reference links in this note',
  'cmd.updateLinksVault': 'Update reference links in the whole vault',

  // Editor context menu
  'menu.convert': 'Find and convert to link',
  'menu.copyLink': 'Copy reference link',
  'menu.fixLink': 'Update this reference link',

  // Notices
  'notice.noCodeRoot': 'Reference Linker: could not determine the reference root',
  'notice.noExtensions': 'Reference Linker: no file extensions configured',
  'notice.scanFailed': 'Reference Linker: scan failed — {error}',
  'notice.indexed': 'Reference Linker: {entries} indexed',
  'notice.missingFolders': 'Reference Linker: scan folder not found — {folders}',
  'notice.copied': 'Reference Linker: link copied',
  'notice.editorSet': 'Reference Linker: links now open in {name}',
  'notice.noSelection': 'Reference Linker: select a name or path first',
  'notice.noMatch': 'Reference Linker: no document matches “{query}”',
  'notice.watchUnsupported': 'Reference Linker: auto-refresh is unavailable on this platform — rebuild manually',
  'notice.linksUpdated': 'Reference Linker: {n} link(s) updated',
  'notice.linksUpdatedVault': 'Reference Linker: {n} link(s) updated across {files} note(s)',

  // Inline embeds
  'embed.empty': 'Reference Linker: empty embed — give a document path',
  'embed.fmt.file': 'Document (by path)',
  'embed.menu.open': 'Open document',
  'embed.menu.refresh': 'Refresh embed',
  'embed.notFound': 'Reference Linker: no document matches “{query}”',
  'embed.ambiguous': 'Reference Linker: {n} documents match “{query}” — add a path to pick one',
  'embed.unreadable': 'Reference Linker: can’t read {path}',
  'embed.truncated': 'Reference Linker: showing the first {max} lines',

  // Status bar
  'status.indexing': 'Reference Linker: indexing… {n}',
  'status.editor': 'Reference: {name}',
  'status.editorTooltip': 'Reference Linker: click to switch how links open',

  // Command-palette modal
  'modal.searchPlaceholder': 'Search documents…',
  'modal.switchPlaceholder': 'Choose how links open…',
  'modal.formatPlaceholder': 'Choose a viewer format for this link…',
  'modal.embedPlaceholder': 'Choose an embed format…',

  // Settings — headings
  'set.heading.index': 'Reference index',
  'set.heading.suggestions': 'Suggestions & links',
  'set.heading.hover': 'Hover preview',
  'set.heading.links': 'Links',
  'set.heading.maintenance': 'Maintenance',

  // Settings — reference index
  'set.codeRoot.name': 'Reference root',
  'set.codeRoot.desc': 'Base folder the scan paths are relative to. Empty = the folder containing this vault.',
  'set.scanFolders.name': 'Scan folders',
  'set.scanFolders.desc': 'Folders scanned for documents, relative to the reference root. Leave empty to scan the whole root.',
  'set.scanFolders.notFound': '⚠ Not found under the reference root — {folders}',
  'set.folderList.add': 'Add folder…',
  'set.folderList.remove': 'Remove',
  'set.folderList.addAria': 'Add',
  'set.extensions.name': 'File extensions',
  'set.extensions.desc': 'Which file types to index, space- or comma-separated (e.g. .pdf .docx .png). Empty = nothing is indexed.',
  'set.skipFolders.name': 'Skip folders',
  'set.skipFolders.desc': 'A bare name (node_modules) is skipped at any depth; a path with a slash (archive/raw) skips only that folder, relative to the reference root.',
  'set.autoRefresh.name': 'Auto-refresh index',
  'set.autoRefresh.desc': 'Watch the scan folders and rebuild the index when documents change.',
  'set.autoRefresh.unsupported': 'Recursive folder watching isn’t supported on this platform (Linux); rebuild manually instead.',
  'set.info': 'Reference root: {root} · {entries} indexed',
  'set.info.unknownRoot': '(unknown)',
  'set.rebuild.name': 'Rebuild reference index',
  'set.rebuild.desc': 'Re-scan the document folders now.',
  'set.rebuild.button': 'Rebuild',

  // Settings — suggestions & links
  'set.trigger.name': 'Trigger',
  'set.trigger.desc': 'Type this to start a reference suggestion. Default @! (Code Linker uses @@).',
  'set.minChars.name': 'Min characters',
  'set.minChars.desc': 'How many characters to type before suggestions appear.',
  'set.maxResults.name': 'Max results',
  'set.maxResults.desc': 'Most suggestions to show at once.',
  'set.editorPreset.name': 'Viewer link preset',
  'set.editorPreset.desc': 'How inserted links open. file:// uses the OS default app; browser adds #page= for a page jump. Add your own under “Your viewers”.',
  'set.preset.file': 'file://',
  'set.preset.browser': 'Browser (#page=)',
  'set.preset.ask': 'Always ask',
  'set.editors.name': 'Your viewers',
  'set.editors.count': '{n} added',
  'set.editors.collapse': 'Collapse',
  'set.editors.expand': 'Expand',
  'set.editors.desc': 'Named URL/command templates for the dropdown above. Placeholders: {abs} {path} {page} {name} {root}.',
  'set.editors.namePlaceholder': 'Name',
  'set.editors.remove': 'Remove',
  'set.editors.add': '+ Add viewer',
  'set.statusBar.name': 'Show viewer in status bar',
  'set.statusBar.desc': 'Show the active viewer preset in the status bar; click it to switch without opening settings.',
  'set.contextMenu.name': 'Editor context menu',
  'set.contextMenu.desc': 'Add “Find and convert to link” and “Find and open document” to the editor right-click menu — plus “Copy reference link” when you right-click a reference link.',

  // Settings — hover preview
  'set.hoverPreview.name': 'Preview on hover',
  'set.hoverPreview.desc': 'Preview the referenced document when you hover a link. In live preview, hold Ctrl/Cmd; in reading view a plain hover is enough.',

  // Settings — links
  'set.markStaleLinks.name': 'Mark stale links',
  'set.markStaleLinks.desc': 'Underline reference links whose target document is missing or renamed.',

  // Plural noun phrases
  'plural.entry': { one: '{n} entry', other: '{n} entries' },
};
