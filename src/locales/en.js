'use strict';

// English — the source of truth. Every other locale falls back to these keys.

module.exports = {
  // Commands
  'cmd.rebuildIndex': 'Rebuild reference index',
  'cmd.insertLink': 'Insert reference link',
  'cmd.insertLinkAs': 'Insert reference link as…',
  'cmd.openFile': 'Open referenced document',
  'cmd.copyLink': 'Copy reference link',
  'cmd.convertSelection': 'Convert selection to reference link',
  'cmd.openSelection': 'Find and open document',
  'cmd.insertEmbed': 'Insert reference embed',
  'cmd.updateLinksNote': 'Update reference links in this note',
  'cmd.updateLinksVault': 'Update reference links in the whole vault',
  'cmd.pinLinksNote': 'Pin unpinned reference links in this note',
  'cmd.pinLinksVault': 'Pin unpinned reference links in the whole vault',

  // Editor context menu
  'menu.convert': 'Find and convert to link',
  // Selection actions. `.solo` is the flat wording used when no sibling linker offers the
  // same verb; `.group` labels the shared submenu when one does, and `.item` names our
  // destination inside it. The `.group` wording must match the sibling's word for word —
  // whichever plugin is called first creates the group and its label is the one shown.
  'menu.convert.solo': 'Find and convert to reference link',
  'menu.convert.group': 'Find and convert to link',
  'menu.convert.item': 'Document',
  'menu.open.solo': 'Find and open document',
  'menu.open.group': 'Find and open',
  'menu.open.item': 'Document',
  'menu.copyLink': 'Copy reference link',
  'menu.fixLink': 'Update this reference link',
  'menu.pin': 'Pin to section “{sec}”',
  'menu.unpin': 'Unpin this reference link',

  // Notices
  'notice.noCodeRoot': 'Reference Linker: could not determine the reference root',
  'notice.noExtensions': 'Reference Linker: no file extensions configured',
  'notice.scanFailed': 'Reference Linker: scan failed — {error}',
  'notice.indexed': 'Reference Linker: {entries} indexed',
  'notice.missingFolders': 'Reference Linker: scan folder not found — {folders}',
  'notice.copied': 'Reference Linker: link copied',
  'notice.noSelection': 'Reference Linker: select a name or path first',
  'notice.noMatch': 'Reference Linker: no document matches “{query}”',
  'notice.watchUnsupported': 'Reference Linker: auto-refresh is unavailable on this platform — rebuild manually',
  'notice.linksUpdated': 'Reference Linker: {n} link(s) updated',
  'notice.linksUpdatedVault': 'Reference Linker: {n} link(s) updated across {files} note(s)',
  'notice.updateSkipped': '({n} note(s) skipped — changed since the preview)',
  'label.thisNote': 'This note',
  'modal.update.title': 'Update reference links',
  'modal.update.summary': '{links} change(s) across {files} note(s). Uncheck any change to skip it, or a note to skip all of its changes.',
  'modal.update.upToDate': 'Everything is up to date — nothing to update.',
  'modal.update.attention': '{n} link(s) need attention: their section is gone (renamed, or the outline changed), so there’s no page to fix.',
  'modal.update.brokenRow': '{label} — no fix (section renamed or removed)',
  'modal.andMore': '…and {n} more',
  'btn.apply': 'Apply',
  'btn.cancel': 'Cancel',
  'btn.close': 'Close',
  'notice.linksPinned': 'Reference Linker: {n} link(s) pinned',
  'notice.linksPinnedVault': 'Reference Linker: {n} link(s) pinned across {files} note(s)',
  'notice.pinned': 'Reference Linker: link pinned to section “{sec}”',
  'notice.unpinned': 'Reference Linker: link unpinned — it is no longer tracked',
  'notice.cantPin': "Reference Linker: can't pin — no section begins on that page",

  // Inline embeds
  'embed.empty': 'Reference Linker: empty embed — give a document path',
  'embed.fmt.file': 'Document (first page)',
  'embed.fmt.section': 'Section page ({page})',
  'embed.unsupported': 'Reference Linker: no inline preview for {path}',
  'embed.menu.open': 'Open document',
  'embed.menu.refresh': 'Refresh embed',
  'embed.notFound': 'Reference Linker: no document matches “{query}”',
  'embed.ambiguous': 'Reference Linker: {n} documents match “{query}” — add a path to pick one',
  'embed.unreadable': 'Reference Linker: can’t read {path}',
  'embed.truncated': 'Reference Linker: showing the first {max} lines',

  // Status bar
  'status.indexing': 'Reference Linker: indexing… {n}',

  // Command-palette modal
  'modal.searchPlaceholder': 'Search documents…',
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
  'set.editorPreset.desc': 'How inserted links open. file:// uses the OS default app. Add your own under “Your viewers”.',
  'set.preset.file': 'file://',
  'set.preset.ask': 'Always ask',
  'set.editors.name': 'Your viewers',
  'set.editors.count': '{n} added',
  'set.editors.collapse': 'Collapse',
  'set.editors.expand': 'Expand',
  'set.editors.desc': 'Named URL/command templates for the dropdown above. Placeholders: {abs} {path} {page} {name} {root}.',
  'set.editors.namePlaceholder': 'Name',
  'set.editors.remove': 'Remove',
  'set.editors.add': '+ Add viewer',
  'set.contextMenu.name': 'Editor context menu',
  'set.contextMenu.desc': 'Add “Find and convert to link” and “Find and open document” to the editor right-click menu — plus “Copy reference link” when you right-click a reference link.',

  // Settings — hover preview
  'set.hoverPreview.name': 'Preview on hover',
  'set.hoverPreview.desc': 'Preview the referenced document when you hover a link. In live preview, hold Ctrl/Cmd; in reading view a plain hover is enough.',

  // Settings — links
  'set.markStaleLinks.name': 'Mark stale links',
  'set.markStaleLinks.desc': 'Underline a reference link when its document moved (warning colour, fixable with “Update reference links”) or is gone from disk (error colour). A link you edited by hand is left alone: the page you typed and the text you wrote are yours.',

  // Plural noun phrases
  'plural.entry': { one: '{n} entry', other: '{n} entries' },
  'set.precedence.name': 'Priority among linker plugins',
  'set.precedence.desc': 'When two linkers claim the same word or the same link, the one higher in this list wins and the other steps aside. Only this plugin’s own position can be moved from here — move the others from their own settings.',
  'set.precedence.other': 'Move from that plugin’s own settings',
  'set.precedence.up': 'Move up',
  'set.precedence.down': 'Move down',
};
