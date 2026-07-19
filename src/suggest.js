'use strict';

const { createSigilSuggest } = require('./shared/deeplink/suggest');

// Inline autocomplete after the trigger. The behaviour is shared with the code linker; what
// is ours is showing a section by the page it starts on, and a file by its extension.
const ReferenceSuggest = createSigilSuggest({
  cls: 'reference-linker',
  kindText: (e) => (e.kind === 'section' ? 'p.' + e.page : e.lang),
});

module.exports = { ReferenceSuggest };
