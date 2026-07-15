'use strict';

// Russian.

module.exports = {
  // Commands
  'cmd.rebuildIndex': 'Перестроить индекс ссылок',
  'cmd.insertLink': 'Вставить ссылку на документ',
  'cmd.insertLinkAs': 'Вставить ссылку на документ как…',
  'cmd.switchPreset': 'Сменить пресет просмотрщика',
  'cmd.openFile': 'Открыть документ',
  'cmd.copyLink': 'Скопировать ссылку на документ',
  'cmd.convertSelection': 'Превратить выделение в ссылку на документ',
  'cmd.openSelection': 'Найти и открыть документ',
  'cmd.insertEmbed': 'Вставить embed документа',
  'cmd.updateLinksNote': 'Актуализировать ссылки в этой заметке',
  'cmd.updateLinksVault': 'Актуализировать ссылки во всём хранилище',

  // Editor context menu
  'menu.convert': 'Найти и превратить в ссылку',
  'menu.copyLink': 'Скопировать ссылку на документ',
  'menu.fixLink': 'Актуализировать эту ссылку',

  // Notices
  'notice.noCodeRoot': 'Reference Linker: не удалось определить корень документов',
  'notice.noExtensions': 'Reference Linker: не задано ни одного расширения',
  'notice.scanFailed': 'Reference Linker: сканирование не удалось — {error}',
  'notice.indexed': 'Reference Linker: проиндексировано {entries}',
  'notice.missingFolders': 'Reference Linker: папка сканирования не найдена — {folders}',
  'notice.copied': 'Reference Linker: ссылка скопирована',
  'notice.editorSet': 'Reference Linker: ссылки теперь открываются в {name}',
  'notice.noSelection': 'Reference Linker: сначала выделите имя или путь',
  'notice.noMatch': 'Reference Linker: нет документа для «{query}»',
  'notice.watchUnsupported': 'Reference Linker: автообновление недоступно на этой платформе — перестраивайте вручную',
  'notice.linksUpdated': 'Reference Linker: обновлено ссылок — {n}',
  'notice.linksUpdatedVault': 'Reference Linker: обновлено ссылок — {n} в заметках: {files}',

  // Inline embeds
  'embed.empty': 'Reference Linker: пустой embed — укажите путь к документу',
  'embed.fmt.file': 'Документ (по пути)',
  'embed.menu.open': 'Открыть документ',
  'embed.menu.refresh': 'Обновить embed',
  'embed.notFound': 'Reference Linker: нет документа для «{query}»',
  'embed.ambiguous': 'Reference Linker: под «{query}» подходит документов: {n} — уточните путём',
  'embed.unreadable': 'Reference Linker: не удалось прочитать {path}',
  'embed.truncated': 'Reference Linker: показаны первые {max} строк',

  // Status bar
  'status.indexing': 'Reference Linker: индексирование… {n}',
  'status.editor': 'Документ: {name}',
  'status.editorTooltip': 'Reference Linker: клик — сменить способ открытия ссылок',

  // Command-palette modal
  'modal.searchPlaceholder': 'Поиск документов…',
  'modal.switchPlaceholder': 'Выберите способ открытия ссылок…',
  'modal.formatPlaceholder': 'Выберите формат просмотрщика для этой ссылки…',
  'modal.embedPlaceholder': 'Выберите формат embed…',

  // Settings — headings
  'set.heading.index': 'Индекс документов',
  'set.heading.suggestions': 'Подсказки и ссылки',
  'set.heading.hover': 'Превью при наведении',
  'set.heading.links': 'Ссылки',
  'set.heading.maintenance': 'Обслуживание',

  // Settings — reference index
  'set.codeRoot.name': 'Корень документов',
  'set.codeRoot.desc': 'Базовая папка, относительно которой задаются пути сканирования. Пусто = папка, содержащая это хранилище.',
  'set.scanFolders.name': 'Папки сканирования',
  'set.scanFolders.desc': 'Папки, сканируемые на документы, относительно корня. Оставьте пустым, чтобы сканировать весь корень.',
  'set.scanFolders.notFound': '⚠ Не найдено в корне документов — {folders}',
  'set.folderList.add': 'Добавить папку…',
  'set.folderList.remove': 'Удалить',
  'set.folderList.addAria': 'Добавить',
  'set.extensions.name': 'Расширения файлов',
  'set.extensions.desc': 'Какие типы файлов индексировать, через пробел или запятую (напр. .pdf .docx .png). Пусто = ничего не индексируется.',
  'set.skipFolders.name': 'Пропускаемые папки',
  'set.skipFolders.desc': 'Просто имя (node_modules) пропускается на любой глубине; путь со слэшем (archive/raw) пропускает только эту папку относительно корня.',
  'set.autoRefresh.name': 'Автообновление индекса',
  'set.autoRefresh.desc': 'Следить за папками сканирования и перестраивать индекс при изменении документов.',
  'set.autoRefresh.unsupported': 'Рекурсивное слежение за папками не поддерживается на этой платформе (Linux); перестраивайте вручную.',
  'set.info': 'Корень документов: {root} · проиндексировано {entries}',
  'set.info.unknownRoot': '(неизвестно)',
  'set.rebuild.name': 'Перестроить индекс документов',
  'set.rebuild.desc': 'Пересканировать папки с документами сейчас.',
  'set.rebuild.button': 'Перестроить',

  // Settings — suggestions & links
  'set.trigger.name': 'Триггер',
  'set.trigger.desc': 'Введите это, чтобы начать подсказку. По умолчанию @! (Code Linker занимает @@).',
  'set.minChars.name': 'Минимум символов',
  'set.minChars.desc': 'Сколько символов ввести, прежде чем появятся подсказки.',
  'set.maxResults.name': 'Максимум результатов',
  'set.maxResults.desc': 'Сколько подсказок показывать одновременно.',
  'set.editorPreset.name': 'Пресет открытия',
  'set.editorPreset.desc': 'Как открываются вставленные ссылки. file:// — приложение ОС по умолчанию; browser добавляет #page= для перехода на страницу. Свои — в «Ваши просмотрщики».',
  'set.preset.file': 'file://',
  'set.preset.browser': 'Браузер (#page=)',
  'set.preset.ask': 'Всегда спрашивать',
  'set.editors.name': 'Ваши просмотрщики',
  'set.editors.count': 'добавлено: {n}',
  'set.editors.collapse': 'Свернуть',
  'set.editors.expand': 'Развернуть',
  'set.editors.desc': 'Именованные шаблоны URL/команд для списка выше. Плейсхолдеры: {abs} {path} {page} {name} {root}.',
  'set.editors.namePlaceholder': 'Название',
  'set.editors.remove': 'Удалить',
  'set.editors.add': '+ Добавить просмотрщик',
  'set.statusBar.name': 'Показывать просмотрщик в статус-баре',
  'set.statusBar.desc': 'Показывать активный пресет в статус-баре; клик по нему меняет способ открытия без входа в настройки.',
  'set.contextMenu.name': 'Контекстное меню редактора',
  'set.contextMenu.desc': 'Добавлять «Найти и превратить в ссылку» и «Найти и открыть документ» в меню по правому клику — плюс «Скопировать ссылку на документ» при клике по ссылке.',

  // Settings — hover preview
  'set.hoverPreview.name': 'Превью при наведении',
  'set.hoverPreview.desc': 'Показывать документ при наведении на ссылку. В режиме live preview удерживайте Ctrl/Cmd; в режиме чтения достаточно простого наведения.',

  // Settings — links
  'set.markStaleLinks.name': 'Отмечать устаревшие ссылки',
  'set.markStaleLinks.desc': 'Подчёркивать ссылки, у которых целевой документ пропал или переименован.',

  // Plural noun phrases
  'plural.entry': { one: '{n} запись', few: '{n} записи', many: '{n} записей', other: '{n} записей' },
};
