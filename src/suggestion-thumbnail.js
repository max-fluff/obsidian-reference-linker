'use strict';

const nodePath = require('path');
const { Platform } = require('obsidian');
const formats = require('./formats');
const { urlPath } = require('./formats/util');

function suggestionThumbnailSrc(plugin, entry) {
  if (entry.kind !== 'file' || !Platform.resourcePathPrefix) return null;
  const handler = formats.handlerFor(entry.lang);
  if (!handler || handler.id !== 'image') return null;
  const abs = plugin.entryPath(entry);
  if (!nodePath.isAbsolute(abs)) return null;
  // Chromium caches app:// responses; Obsidian's own getResourcePath busts that with the mtime.
  const cached = plugin.fileCache && plugin.fileCache.get(entry.path);
  return Platform.resourcePathPrefix + urlPath(abs) + (cached ? '?' + Math.trunc(cached.mtimeMs) : '');
}

module.exports = { suggestionThumbnailSrc };
