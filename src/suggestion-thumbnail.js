'use strict';

const nodePath = require('path');
const { normalizePath, TFile } = require('obsidian');
const formats = require('./formats');

// The index is rooted on disk and may point outside the vault. Obsidian's resource URI only
// works for a TFile in this vault, so resolve that file before adding a thumbnail.
function suggestionThumbnailSrc(plugin, entry) {
  if (entry.kind !== 'file') return null;
  const handler = formats.handlerFor(entry.lang);
  if (!handler || handler.id !== 'image') return null;

  const vault = plugin.app.vault;
  const adapter = vault && vault.adapter;
  if (!adapter || typeof adapter.getBasePath !== 'function') return null;

  try {
    const vaultBase = adapter.getBasePath();
    const absolutePath = plugin.entryPath(entry);
    if (!nodePath.isAbsolute(vaultBase) || !nodePath.isAbsolute(absolutePath)) return null;

    const relativePath = nodePath.relative(vaultBase, absolutePath);
    if (!relativePath || relativePath === '..' || relativePath.startsWith('..' + nodePath.sep)
      || nodePath.isAbsolute(relativePath)) return null;

    const file = vault.getAbstractFileByPath(normalizePath(relativePath));
    return file instanceof TFile ? vault.getResourcePath(file) : null;
  } catch {
    // An unavailable adapter or a file removed since indexing leaves the usual row intact.
    return null;
  }
}

module.exports = { suggestionThumbnailSrc };
