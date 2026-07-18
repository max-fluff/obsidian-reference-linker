'use strict';

// Keeping reference links current. Only a pinned link is tracked: its title says which
// section it holds on to (see shared/binding). An unpinned link is left alone, and the
// display text is never read. Nothing is rewritten automatically.

const { splitTarget, withTitle, rewriteLinks } = require('./shared/markdown');
const { PAGE_RE, parseBinding, formatBinding, ownsBinding } = require('./shared/binding');
const shared = require('./shared/actualize');
const preview = require('./shared/update-preview');

// Which bindings are this plugin's, as the shared module names them.
const OWNER = 'reference';

// Prefix for the preview modal's own classes, kept per plugin so two installed linkers
// never style each other's dialog.
const PREVIEW_CLASS = 'reference-linker-preview';

const withPage = (url, page) => (PAGE_RE.test(url) ? url.replace(PAGE_RE, '#page=' + page) : url + '#page=' + page);

// One pass over a note's links. `selected` null is a dry run: apply every fix to build the
// preview and record each change under a key (its order of appearance). A set of keys
// applies only those — same walk, same order, so keys line up as long as the note is
// unchanged (the write guard ensures it). Broken links are collected in the dry run only,
// since there is no fix to offer for them.
const rewriteUpdates = (plugin, text, selected) => {
  const collect = selected == null;
  const changes = [];
  const broken = [];
  let key = 0;
  const links = rewriteLinks(text, (name, target) => {
    const r = bindStateOf(plugin, target);
    if (r && r.state === 'stale') {
      const k = key++;
      const { url, title } = splitTarget(target);
      // bindStateFrom names the moved-to position `line`; for a document it is a page.
      if (collect) changes.push({ key: k, label: name, from: String(plugin.targetPage(url)), to: String(r.line) });
      if (!collect && !selected.has(k)) return null;
      return '[' + name + '](' + withTitle(withPage(url, r.line), title) + ')';
    }
    if (collect && r && r.state === 'broken') broken.push(name);
    return null;
  });
  return { newText: links.text, count: links.count, changes, broken };
};

// Pin every unpinned link to the section on its page — retrofits notes written before
// pinning. A link with any title is left alone: pinned, or a tooltip that isn't ours.
const pinLinksInText = (plugin, text) => rewriteLinks(text, (name, target) => {
  const { url, title } = splitTarget(target);
  if (title) return null;
  const sec = plugin.sectionAtLinkPage(url);
  return sec ? '[' + name + '](' + withTitle(url, formatBinding({ sec: sec.name })) + ')' : null;
});

const { refreshStaleLinks } = shared;
const staleLinksExtension = (plugin) => shared.staleLinksExtension(plugin, { stale: 'reference-linker-stale', broken: 'reference-linker-broken' });

// A link's binding against the live index, or null when there's nothing to judge: not a
// file link, or no binding of ours.
//
// The ownership check is explicit rather than left to the sec lookup downstream. Code
// links are file:// links too, so without it a code binding reaches urlBindState and only
// the absence of a sec anchor keeps it from being judged here.
function bindStateOf(plugin, target) {
  const { url, title } = splitTarget(target);
  if (!url || !/^file:\/\//i.test(url)) return null;
  const b = ownsBinding(title, OWNER) ? parseBinding(title) : null;
  return b ? plugin.urlBindState(url, b, plugin.targetPage(url)) : null;
}

// Mixed into the plugin prototype; `this` is the plugin. `target` is the whole markdown
// destination (url plus any title); reading view hands the two apart and recombines them.
const methods = {
  linkState(target) {
    const r = bindStateOf(this, target);
    return r ? r.state : null;
  },

  isLinkStale(target) {
    return this.linkState(target) === 'stale';
  },

  // The link with its page corrected, or null when there's nothing to fix. The binding
  // rides along. bindStateFrom names the moved-to position `line`; here it's a page.
  actualizedTarget(target) {
    const r = bindStateOf(this, target);
    if (!r || r.state !== 'stale') return null;
    const { url, title } = splitTarget(target);
    return withTitle(withPage(url, r.line), title);
  },

  rewriteActiveNote(transform, noticeKey) { return shared.rewriteActiveNote(this, transform, noticeKey); },
  rewriteVault(transform, noticeKey) { return shared.rewriteVault(this, transform, noticeKey); },

  updateLinksInActiveNote() { return preview.updateInActiveNote(this, rewriteUpdates, PREVIEW_CLASS); },
  updateLinksInVault() { return preview.updateInVault(this, rewriteUpdates, PREVIEW_CLASS); },
  pinLinksInActiveNote() { return this.rewriteActiveNote(pinLinksInText, 'notice.linksPinned'); },
  pinLinksInVault() { return this.rewriteVault(pinLinksInText, 'notice.linksPinnedVault'); },
};

module.exports = { methods, staleLinksExtension, refreshStaleLinks };
