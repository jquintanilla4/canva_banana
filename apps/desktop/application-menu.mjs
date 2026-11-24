export const FILE_MENU_COMMANDS = Object.freeze({
  IMPORT_SNAPSHOT: 'importSnapshot',
  EXPORT_SNAPSHOT: 'exportSnapshot',
  OPEN_BACKUPS: 'openBackups',
  TOGGLE_AUTOSAVE: 'toggleAutosave',
  TOGGLE_ZOOM_LEVEL_BADGE: 'toggleZoomLevelBadge',
  TOGGLE_FILE_NAME: 'toggleFileName',
  TOGGLE_TRACKPAD_MODE: 'toggleTrackpadMode',
  OPEN_DEBUG_LOG: 'openDebugLog',
  OPEN_MANAGE_KEYS: 'openManageKeys',
  OPEN_CHANGE_ICON: 'openChangeIcon',
  OPEN_JIMENG_CANVAS_SETUP: 'openJimengCanvasSetup',
});

export const APPLICATION_MENU_ITEM_IDS = Object.freeze({
  AUTOSAVE: 'canva-banana-file-autosave',
  ZOOM_LEVEL_BADGE: 'canva-banana-file-zoom-level-badge',
  FILE_NAME: 'canva-banana-view-file-name',
  TRACKPAD_MODE: 'canva-banana-view-trackpad-mode',
});

export const buildApplicationMenuTemplate = ({
  appName,
  fileMenuState,
  handlers,
}) => [
  {
    label: appName,
    submenu: [
      { label: 'Manage Keys...', click: handlers.openManageKeys },
      { label: 'Change Icon...', click: handlers.openChangeIcon },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  },
  {
    label: 'File',
    submenu: [
      { label: 'Import Snapshot...', click: handlers.importSnapshot },
      { label: 'Export Snapshot...', click: handlers.exportSnapshot },
      { label: 'Backups...', click: handlers.openBackups },
      { type: 'separator' },
      {
        id: APPLICATION_MENU_ITEM_IDS.AUTOSAVE,
        label: 'Autosave',
        type: 'checkbox',
        checked: fileMenuState.autosaveEnabled,
        click: handlers.toggleAutosave,
      },
      { type: 'separator' },
      { label: 'Debug Log', click: handlers.openDebugLog },
      { label: 'Jimeng Canvas Setup...', click: handlers.openJimengCanvasSetup },
    ],
  },
  { role: 'editMenu' },
  {
    label: 'View',
    submenu: [
      {
        id: APPLICATION_MENU_ITEM_IDS.FILE_NAME,
        label: 'Show File Name',
        type: 'checkbox',
        checked: fileMenuState.showFileName,
        click: handlers.toggleFileName,
      },
      {
        id: APPLICATION_MENU_ITEM_IDS.ZOOM_LEVEL_BADGE,
        label: 'Display Zoom Level',
        type: 'checkbox',
        checked: fileMenuState.showZoomLevelBadge,
        click: handlers.toggleZoomLevelBadge,
      },
      {
        id: APPLICATION_MENU_ITEM_IDS.TRACKPAD_MODE,
        label: 'Trackpad Mode',
        type: 'checkbox',
        checked: fileMenuState.trackpadMode,
        click: handlers.toggleTrackpadMode,
      },
      { type: 'separator' },
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  },
  {
    label: 'History',
    submenu: [
      { label: 'Clear Chat History...', click: handlers.clearChatHistory },
    ],
  },
  { role: 'windowMenu' },
];
