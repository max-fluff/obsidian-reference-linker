'use strict';

const nodePath = require('path');
const { createSigilSuggest } = require('./shared/deeplink/suggest');
const formats = require('./formats');
const { suggestionThumbnailSrc } = require('./suggestion-thumbnail');

const baseName = (p) => nodePath.basename(p).replace(/\.[^.]+$/, '');

// Inline autocomplete after the trigger. The behaviour is shared with the code linker; what
// is ours is the middle column: a page for a paged document, otherwise the file — because a
// doc corpus repeats the same headings (NAME, OPTIONS) in every file, and only the file name
// tells those rows apart. A plain "p.5" there means the 5th heading, which reads as a page
// that isn't one.
const BaseReferenceSuggest = createSigilSuggest({
  cls: 'reference-linker',
  kindText: (e) => {
    if (e.kind !== 'section') return e.lang;
    return formats.anchorKind(e.lang) === 'page' ? 'p.' + e.position : baseName(e.path);
  },
});

class ReferenceSuggest extends BaseReferenceSuggest {
  renderSuggestion(entry, el) {
    if (this.plugin.settings.showSuggestionThumbnails) {
      const src = suggestionThumbnailSrc(this.plugin, entry);
      if (src) {
        el.addClass('reference-linker-suggestion-with-thumbnail');
        const img = el.createEl('img', {
          cls: 'reference-linker-thumb',
          attr: { src, alt: '' },
        });
        img.loading = 'lazy';
        img.addEventListener('error', () => img.remove(), { once: true });
      }
    }

    super.renderSuggestion(entry, el);
  }
}

module.exports = { ReferenceSuggest };
