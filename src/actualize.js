'use strict';

// Keeping reference links current. Only a pinned link is tracked: its title says which
// section it holds on to (see shared/binding). An unpinned link is left alone, and the
// display text is never read. Nothing is rewritten automatically.

const { splitTarget, withTitle, rewriteLinks } = require('./shared/markdown');
const { parseBinding, formatBinding, ownsBinding } = require('./shared/binding');
const shared = require('./shared/actualize');
const preview = require('./shared/update-preview');

// Which bindings are this plugin's, as the shared module names them.
const OWNER = 'reference';

// Prefix for the preview modal's own classes, kept per plugin so two installed linkers
// never style each other's dialog.
const PREVIEW_CLASS = 'reference-linker-preview';

// Where a page lives in a link — the same shapes targetPage reads, a hash OR a query, since a
// custom viewer template can carry {page} in the query. Replacing only a #page= fragment left
// a query-page link with a dead #page= appended and its real ?page= untouched, so targetPage
// kept reading the old number: the link stayed stale forever and every update rewrote the note.
const POS_RE = /([#?&])(page|t)=\d+/i;

// Repoint a link at where its section moved to. `r` is a stale verdict: `anchor` for a named
// fragment, `line` for a page (bindStateFrom's name for the moved-to position).
const withAnchor = (url, r) => {
  if (r.anchor != null) return url.replace(/#.*$/, '') + '#' + r.anchor;
  return POS_RE.test(url)
    ? url.replace(POS_RE, (_, sep, key) => sep + key + '=' + r.line)
    : url + '#page=' + r.line;
};

// What the update preview shows as the change. An id-anchored link that had no fragment at
// all reads as a dash rather than an empty cell.
const movedFrom = (plugin, url, r) => (r.anchor != null
  ? plugin.targetAnchor(url) || '—'
  : String(plugin.targetPage(url)));
const movedTo = (r) => (r.anchor != null ? r.anchor : String(r.line));

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
      if (collect) changes.push({ key: k, label: name, from: movedFrom(plugin, url, r), to: movedTo(r) });
      if (!collect && !selected.has(k)) return null;
      return '[' + name + '](' + withTitle(withAnchor(url, r), title) + ')';
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

  // The link with its position corrected, or null when there's nothing to fix. The binding
  // rides along.
  actualizedTarget(target) {
    const r = bindStateOf(this, target);
    if (!r || r.state !== 'stale') return null;
    const { url, title } = splitTarget(target);
    return withTitle(withAnchor(url, r), title);
  },

  rewriteActiveNote(transform, noticeKey) { return shared.rewriteActiveNote(this, transform, noticeKey); },
  rewriteVault(transform, noticeKey) { return shared.rewriteVault(this, transform, noticeKey); },

  updateLinksInActiveNote() { return preview.updateInActiveNote(this, rewriteUpdates, PREVIEW_CLASS); },
  updateLinksInVault() { return preview.updateInVault(this, rewriteUpdates, PREVIEW_CLASS); },
  pinLinksInActiveNote() { return this.rewriteActiveNote(pinLinksInText, 'notice.linksPinned'); },
  pinLinksInVault() { return this.rewriteVault(pinLinksInText, 'notice.linksPinnedVault'); },
};

module.exports = { methods, staleLinksExtension, refreshStaleLinks };
