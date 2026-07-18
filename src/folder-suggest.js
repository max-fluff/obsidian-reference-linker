'use strict';

// Filesystem folder autocomplete for the settings inputs, shared with the code linker.
// The scan roots point outside the vault, so this walks the real tree rather than the
// vault's — the prose linkers use shared/prose/folder-suggest.js for vault folders.
module.exports = require('./shared/deeplink/folder-suggest');
