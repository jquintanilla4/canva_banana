import { describe, expect, it, vi } from 'vitest';
import { APPLICATION_MENU_ITEM_IDS, buildApplicationMenuTemplate } from './application-menu.mjs';

const buildHandlers = () => ({
  importSnapshot: vi.fn(),
  exportSnapshot: vi.fn(),
  openBackups: vi.fn(),
  toggleAutosave: vi.fn(),
  toggleZoomLevelBadge: vi.fn(),
  openDebugLog: vi.fn(),
  openManageKeys: vi.fn(),
  openChangeIcon: vi.fn(),
  clearJimengCache: vi.fn(),
  clearChatHistory: vi.fn(),
});

describe('application menu template', () => {
  it('orders History after View and before Window', () => {
    const template = buildApplicationMenuTemplate({
      appName: 'The Institute',
      fileMenuState: {
        autosaveEnabled: true,
        showZoomLevelBadge: true,
        isClearingJimengCache: false,
      },
      handlers: buildHandlers(),
    });

    expect(template.map(item => item.label ?? item.role)).toEqual([
      'The Institute',
      'File',
      'editMenu',
      'viewMenu',
      'History',
      'windowMenu',
    ]);
  });

  it('adds file and display actions under File', () => {
    const template = buildApplicationMenuTemplate({
      appName: 'The Institute',
      fileMenuState: {
        autosaveEnabled: true,
        showZoomLevelBadge: true,
        isClearingJimengCache: false,
      },
      handlers: buildHandlers(),
    });

    const fileMenu = template.find(item => item.label === 'File');
    const labels = fileMenu.submenu.filter(item => item.label).map(item => item.label);

    expect(labels).toEqual([
      'Import Snapshot...',
      'Export Snapshot...',
      'Backups...',
      'Autosave',
      'Display Zoom Level',
      'Debug Log',
    ]);
  });

  it('places Manage Keys under the app menu', () => {
    const template = buildApplicationMenuTemplate({
      appName: 'The Institute',
      fileMenuState: {
        autosaveEnabled: true,
        showZoomLevelBadge: true,
        isClearingJimengCache: false,
      },
      handlers: buildHandlers(),
    });

    const appMenu = template.find(item => item.label === 'The Institute');
    const labels = appMenu.submenu.filter(item => item.label).map(item => item.label);

    expect(labels).toContain('Manage Keys...');
    expect(labels).toContain('Change Icon...');
    expect(labels).not.toContain('Clear Chat History...');
  });

  it('wires Change Icon to its app menu handler', () => {
    const handlers = buildHandlers();
    const template = buildApplicationMenuTemplate({
      appName: 'The Institute',
      fileMenuState: {
        autosaveEnabled: true,
        showZoomLevelBadge: true,
        isClearingJimengCache: false,
      },
      handlers,
    });

    const appMenu = template.find(item => item.label === 'The Institute');
    const changeIconItem = appMenu.submenu.find(item => item.label === 'Change Icon...');

    changeIconItem.click();

    expect(handlers.openChangeIcon).toHaveBeenCalledTimes(1);
  });

  it('places clearing actions under History', () => {
    const template = buildApplicationMenuTemplate({
      appName: 'The Institute',
      fileMenuState: {
        autosaveEnabled: true,
        showZoomLevelBadge: true,
        isClearingJimengCache: false,
      },
      handlers: buildHandlers(),
    });

    const historyMenu = template.find(item => item.label === 'History');
    const labels = historyMenu.submenu.filter(item => item.label).map(item => item.label);

    expect(labels).toEqual([
      'Clear Chat History...',
      'Clear Jimeng Cache',
    ]);
  });

  it('reflects checkbox and clearing state in native menu items', () => {
    const template = buildApplicationMenuTemplate({
      appName: 'The Institute',
      fileMenuState: {
        autosaveEnabled: false,
        showZoomLevelBadge: true,
        isClearingJimengCache: true,
      },
      handlers: buildHandlers(),
    });

    const fileMenu = template.find(item => item.label === 'File');
    const historyMenu = template.find(item => item.label === 'History');
    const autosaveItem = fileMenu.submenu.find(item => item.id === APPLICATION_MENU_ITEM_IDS.AUTOSAVE);
    const zoomItem = fileMenu.submenu.find(item => item.id === APPLICATION_MENU_ITEM_IDS.ZOOM_LEVEL_BADGE);
    const cacheItem = historyMenu.submenu.find(item => item.id === APPLICATION_MENU_ITEM_IDS.CLEAR_JIMENG_CACHE);

    expect(autosaveItem.checked).toBe(false);
    expect(zoomItem.checked).toBe(true);
    expect(cacheItem.enabled).toBe(false);
    expect(cacheItem.label).toBe('Clearing Jimeng Cache...');
  });
});
