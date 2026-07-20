'use strict';

// Russian.

module.exports = {
  // Commands
  'cmd.rebuildIndex': 'Перестроить индекс ссылок',
  'cmd.insertLink': 'Вставить ссылку на документ',
  'cmd.insertLinkAs': 'Вставить ссылку на документ как…',
  'cmd.openFile': 'Открыть документ',
  'cmd.copyLink': 'Скопировать ссылку на документ',
  'cmd.convertSelection': 'Превратить выделение в ссылку на документ',
  'cmd.openSelection': 'Найти и открыть документ',
  'cmd.insertEmbed': 'Вставить embed документа',
  'cmd.updateLinksNote': 'Актуализировать ссылки в этой заметке',
  'cmd.updateLinksVault': 'Актуализировать ссылки во всём хранилище',
  'cmd.pinLinksNote': 'Закрепить незакреплённые ссылки на документы в этой заметке',
  'cmd.pinLinksVault': 'Закрепить незакреплённые ссылки на документы во всём хранилище',

  // Editor context menu
  'menu.convert.solo': 'Найти и превратить в ссылку на документ',
  'menu.convert.item': 'Документ',
  'menu.open.solo': 'Найти и открыть документ',
  'menu.open.item': 'Документ',
  'menu.copyLink': 'Скопировать ссылку на документ',
  'menu.fixLink': 'Актуализировать эту ссылку',
  'menu.pin': 'Закрепить за разделом «{sec}»',
  'menu.unpin': 'Открепить эту ссылку',

  // Notices
  'notice.noCodeRoot': 'Reference Linker: не удалось определить корень документов',
  'notice.noExtensions': 'Reference Linker: не задано ни одного расширения',
  'notice.scanFailed': 'Reference Linker: сканирование не удалось — {error}',
  'notice.indexed': 'Reference Linker: проиндексировано {entries}',
  'notice.missingFolders': 'Reference Linker: папка сканирования не найдена — {folders}',
  'notice.copied': 'Reference Linker: ссылка скопирована',
  'notice.anchorCopied': 'Откроется с начала — «{section}» скопировано, найдите поиском',
  'notice.noSelection': 'Reference Linker: сначала выделите имя или путь',
  'notice.noMatch': 'Reference Linker: нет документа для «{query}»',
  'notice.watchUnsupported': 'Reference Linker: автообновление недоступно на этой платформе — перестраивайте вручную',
  'notice.linksUpdated': 'Reference Linker: обновлено ссылок — {n}',
  'notice.linksUpdatedVault': 'Reference Linker: обновлено ссылок — {n} в заметках: {files}',
  'modal.update.title': 'Актуализировать ссылки на документы',
  'modal.update.attention': 'Требуют внимания — {n}: их раздел пропал (переименован, или изменилось оглавление), поэтому чинить нечего.',
  'modal.update.brokenRow': '{label} — не починить (раздел переименован или удалён)',
  'notice.linksPinned': 'Reference Linker: закреплено ссылок — {n}',
  'notice.linksPinnedVault': 'Reference Linker: закреплено ссылок — {n} в заметках: {files}',
  'notice.pinned': 'Reference Linker: ссылка закреплена за разделом «{sec}»',
  'notice.unpinned': 'Reference Linker: ссылка откреплена — больше не отслеживается',
  'notice.cantPin': 'Reference Linker: не за что закрепить — на этой странице не начинается раздел',

  // Inline embeds
  'embed.empty': 'Reference Linker: пустой embed — укажите путь к документу',
  'embed.fmt.file': 'Документ (первая страница)',
  'embed.fmt.section': 'Раздел «{name}»',
  'embed.unsupported': 'Reference Linker: нет инлайн-превью для {path}',
  'preview.empty': 'Здесь нечего показать',
  'embed.menu.open': 'Открыть документ',
  'embed.notFound': 'Reference Linker: нет документа для «{query}»',
  'embed.ambiguous': 'Reference Linker: под «{query}» подходит документов: {n} — уточните путём',
  'embed.unreadable': 'Reference Linker: не удалось прочитать {path}',
  'embed.truncated': 'Reference Linker: показаны первые {max} строк',

  // Status bar
  'status.indexing': 'Reference Linker: индексирование… {n}',

  // Command-palette modal
  'modal.searchPlaceholder': 'Поиск документов…',
  'modal.formatPlaceholder': 'Выберите формат просмотрщика для этой ссылки…',

  // Settings — headings
  'set.heading.index': 'Индекс документов',

  // Settings — reference index
  'set.codeRoot.name': 'Корень документов',
  'set.scanFolders.desc': 'Папки, сканируемые на документы, относительно корня. Оставьте пустым, чтобы сканировать весь корень.',
  'set.scanFolders.notFound': '⚠ Не найдено в корне документов — {folders}',
  'set.extensions.name': 'Расширения файлов',
  'set.extensions.desc': 'Какие типы файлов индексировать, через пробел или запятую (напр. .pdf .pptx .png). Пусто = ничего не индексируется.',
  'set.extensions.known': 'Превью и индексация разделов: {exts}. Остальные расширения индексируются только по имени файла.',
  'set.extensions.addAll': 'Добавить все поддерживаемые расширения',
  'set.skipFolders.desc': 'Просто имя (node_modules) пропускается на любой глубине; путь со слэшем (archive/raw) пропускает только эту папку относительно корня.',
  'set.autoRefresh.desc': 'Следить за папками сканирования и перестраивать индекс при изменении документов.',
  'set.info': 'Корень документов: {root} · проиндексировано {entries}',
  'set.rebuild.name': 'Перестроить индекс документов',
  'set.rebuild.desc': 'Пересканировать папки с документами сейчас.',

  // Settings — suggestions & links
  'set.trigger.desc': 'Введите это, чтобы начать подсказку. По умолчанию @! (Code Linker занимает @@).',
  'set.editorPreset.name': 'Пресет открытия',
  'set.editorPreset.desc': 'Как открываются вставленные ссылки. file:// — приложение ОС по умолчанию. Свои — в «Ваши просмотрщики».',
  'set.editors.name': 'Ваши просмотрщики',
  'set.editors.desc': 'Именованные шаблоны URL/команд для списка выше. Плейсхолдеры: {abs} {path} {page} {name} {root}.',
  'set.editors.add': '+ Добавить просмотрщик',
  'set.contextMenu.desc': 'Добавлять «Найти и превратить в ссылку» и «Найти и открыть документ» в меню по правому клику — плюс «Скопировать ссылку на документ» при клике по ссылке.',

  // Settings — hover preview
  'set.hoverPreview.name': 'Превью при наведении',
  'set.hoverPreview.desc': 'Показывать документ при наведении на ссылку. В режиме live preview удерживайте Ctrl/Cmd; в режиме чтения достаточно простого наведения.',

  // Settings — links
  'set.markStaleLinks.desc': 'Подчёркивать ссылку, если её документ переехал (цвет предупреждения, чинится командой «Актуализировать ссылки») или пропал с диска (цвет ошибки). Ссылку, поправленную руками, плагин не трогает: страница и текст — твои.',
};
