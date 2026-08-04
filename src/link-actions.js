'use strict';

const { t } = require('./shared/i18n');
const { withTitle } = require('./shared/markdown');
const { parseBinding } = require('./shared/binding');

// The right-click items on the reference link under the cursor, declared once for both
// surfaces (shared/actions.js). Ownership is part of resolving: a link the code linker
// recognises too gets one set of actions, not two.
const linkAt = (plugin, editor) => {
  const link = editor && plugin.linkAtCursor(editor);
  return link && plugin.ownsLinkAtCursor(link) ? { editor, link } : null;
};

const linkAction = ({ id, name, can, run, icon }) => ({
  id,
  name,
  surface: 'editor',
  icon,
  title: () => t(name),
  resolve: (plugin, editor) => {
    const ctx = linkAt(plugin, editor);
    return ctx && (!can || can(plugin, ctx.link)) ? ctx : null;
  },
  run,
});

const LINK_ACTIONS = [
  linkAction({
    id: 'copy-reference-link-at-cursor', name: 'menu.copyLink', icon: 'copy',
    run: (plugin, ctx) => plugin.copyLinkAtCursor(ctx.link),
  }),
  linkAction({
    id: 'fix-reference-link', name: 'menu.fixLink', icon: 'wrench',
    can: (plugin, link) => plugin.isLinkStale(withTitle(link.target, link.title)),
    run: (plugin, ctx) => plugin.fixLinkAtCursor(ctx.editor, ctx.link),
  }),
  {
    // One item, worded for what it would pin to — a section or a citation key.
    id: 'pin-reference-link', name: 'cmd.pinLink', surface: 'editor', icon: 'pin',
    title: (ctx) => (ctx.option.kind === 'cite'
      ? t('menu.pinCite', { cite: ctx.option.value })
      : t('menu.pin', { sec: ctx.option.value })),
    resolve: (plugin, editor) => {
      const ctx = linkAt(plugin, editor);
      const option = ctx && plugin.linkPinOption(ctx.link);
      return option ? Object.assign(ctx, { option }) : null;
    },
    run: (plugin, ctx) => plugin.pinLinkAtCursor(ctx.editor, ctx.link),
  },
  linkAction({
    id: 'unpin-reference-link', name: 'menu.unpin', icon: 'pin-off',
    can: (plugin, link) => !!parseBinding(link.title),
    run: (plugin, ctx) => plugin.unpinLinkAtCursor(ctx.editor, ctx.link),
  }),
];

module.exports = { LINK_ACTIONS };
