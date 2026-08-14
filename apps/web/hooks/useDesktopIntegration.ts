import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
  getRuntimeConfig,
  type DesktopFileMenuCommand,
  type DesktopSettingsStatus,
} from '../services/runtimeConfig';
import { FLOATING_EDGE_CONTROL_SIDE_OFFSET } from '../utils/promptBarFooterLayout';
import type { AppBlockingOverlay } from './useBlockingOverlays';

const shouldAutoOpenDesktopOnboarding = (status: DesktopSettingsStatus): boolean =>
  status.isPackaged && status.fields.FAL_API_KEY?.present !== true; // Startup onboarding only requires the Fal key.

type DesktopMenuCommandHandlers = {
  importSnapshot: () => void;
  exportSnapshot: () => Promise<void>;
  openBackups: () => void;
  toggleAutosave: () => void;
  toggleZoomLevelBadge: () => void;
  toggleFileName: () => void;
  toggleTrackpadMode: () => void;
  openDebugLog: () => void;
  clearJimengCache: () => Promise<void> | void;
};

type DesktopFileMenuState = {
  autosaveEnabled: boolean;
  showZoomLevelBadge: boolean;
  showFileName: boolean;
  trackpadMode: boolean;
  isClearingJimengCache: boolean;
};

type UseDesktopIntegrationArgs = {
  setDesktopSettingsMode: (mode: 'onboarding' | 'manage') => void;
  setIsDesktopSettingsOpen: (open: boolean) => void;
  openAppOwnedBlockingOverlay: (overlay: AppBlockingOverlay) => void;
  menuCommands: DesktopMenuCommandHandlers;
  fileMenuState: DesktopFileMenuState;
};

// Electron-only integration: desktop settings status, native file-menu commands,
// startup onboarding, and macOS window-chrome layout. Safe no-op in the browser.
export function useDesktopIntegration({
  setDesktopSettingsMode,
  setIsDesktopSettingsOpen,
  openAppOwnedBlockingOverlay,
  menuCommands,
  fileMenuState,
}: UseDesktopIntegrationArgs) {
  const {
    importSnapshot,
    exportSnapshot,
    openBackups,
    toggleAutosave,
    toggleZoomLevelBadge,
    toggleFileName,
    toggleTrackpadMode,
    openDebugLog,
    clearJimengCache,
  } = menuCommands;
  const { autosaveEnabled, showZoomLevelBadge, showFileName, trackpadMode, isClearingJimengCache } = fileMenuState;

  const runtimeConfig = getRuntimeConfig();
  const [desktopSettingsStatus, setDesktopSettingsStatus] = useState<DesktopSettingsStatus | null>(null);
  const hasDesktopSettingsBridge = typeof window !== 'undefined' && Boolean(window.canvaBananaDesktop?.getSettingsStatus);
  const hasDesktopAppIconBridge = typeof window !== 'undefined' && Boolean(window.canvaBananaDesktop?.appIcon?.getState);

  const refreshDesktopSettingsStatus = useCallback(async () => {
    const nextStatus = await window.canvaBananaDesktop?.getSettingsStatus?.();
    if (nextStatus) {
      setDesktopSettingsStatus(nextStatus);
    }
    return nextStatus ?? null;
  }, []);

  const openDesktopSettings = useCallback(() => {
    setDesktopSettingsMode('manage');
    openAppOwnedBlockingOverlay('desktopSettings');
    void refreshDesktopSettingsStatus();
  }, [openAppOwnedBlockingOverlay, refreshDesktopSettingsStatus, setDesktopSettingsMode]);

  const openDesktopAppIcon = useCallback(() => {
    if (hasDesktopAppIconBridge) {
      openAppOwnedBlockingOverlay('desktopAppIcon');
    }
  }, [hasDesktopAppIconBridge, openAppOwnedBlockingOverlay]);

  useEffect(() => {
    return window.canvaBananaDesktop?.onOpenManageKeys?.(openDesktopSettings);
  }, [openDesktopSettings]);

  useEffect(() => {
    if (!hasDesktopSettingsBridge) {
      return;
    }
    let cancelled = false;
    window.canvaBananaDesktop?.getSettingsStatus?.().then(status => {
      if (!status || cancelled) {
        return;
      }
      setDesktopSettingsStatus(status);
      if (shouldAutoOpenDesktopOnboarding(status)) {
        setDesktopSettingsMode('onboarding');
        setIsDesktopSettingsOpen(true);
      }
    }).catch(err => {
      console.error('Failed to load desktop settings status:', err);
    });
    return () => {
      cancelled = true;
    };
  }, [hasDesktopSettingsBridge, setDesktopSettingsMode, setIsDesktopSettingsOpen]);

  const isMacDesktop = runtimeConfig.isDesktop && typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
  const hasNativeFileMenuBridge = isMacDesktop && typeof window !== 'undefined' && typeof window.canvaBananaDesktop?.fileMenu?.onCommand === 'function';
  const shouldShowReactFileMenu = !isMacDesktop; // macOS desktop uses the native application menu.
  const leadingRailJustificationClass = isMacDesktop ? 'justify-center' : 'justify-start'; // Center the macOS filename without moving the cross-platform menu.
  const topControlRailStyle: CSSProperties = isMacDesktop
    ? { paddingLeft: '86px', paddingRight: FLOATING_EDGE_CONTROL_SIDE_OFFSET }
    : { paddingInline: FLOATING_EDGE_CONTROL_SIDE_OFFSET }; // Shift controls away from macOS traffic lights.
  const windowDragRegionStyle = { WebkitAppRegion: 'drag' } as CSSProperties; // Electron-only CSS for hidden titlebar dragging.

  useEffect(() => {
    if (!hasNativeFileMenuBridge) {
      return;
    }
    return window.canvaBananaDesktop?.fileMenu?.onCommand?.((command: DesktopFileMenuCommand) => {
      switch (command) {
        case 'importSnapshot':
          importSnapshot();
          break;
        case 'exportSnapshot':
          void exportSnapshot();
          break;
        case 'openBackups':
          openBackups();
          break;
        case 'toggleAutosave':
          toggleAutosave();
          break;
        case 'toggleZoomLevelBadge':
          toggleZoomLevelBadge();
          break;
        case 'toggleFileName':
          toggleFileName();
          break;
        case 'toggleTrackpadMode':
          toggleTrackpadMode();
          break;
        case 'openDebugLog':
          openDebugLog();
          break;
        case 'openManageKeys':
          openDesktopSettings();
          break;
        case 'openChangeIcon':
          openDesktopAppIcon();
          break;
        case 'clearJimengCache':
          void clearJimengCache();
          break;
        default: {
          const exhaustiveCommand: never = command;
          return exhaustiveCommand;
        }
      }
    });
  }, [
    exportSnapshot,
    importSnapshot,
    toggleAutosave,
    toggleZoomLevelBadge,
    hasNativeFileMenuBridge,
    clearJimengCache,
    openBackups,
    openDesktopAppIcon,
    openDebugLog,
    openDesktopSettings,
    toggleFileName,
    toggleTrackpadMode,
  ]);

  useEffect(() => {
    if (!hasNativeFileMenuBridge) {
      return;
    }
    void window.canvaBananaDesktop?.fileMenu?.setState?.({
      autosaveEnabled,
      showZoomLevelBadge,
      showFileName,
      trackpadMode,
      isClearingJimengCache,
    });
  }, [autosaveEnabled, hasNativeFileMenuBridge, isClearingJimengCache, showFileName, showZoomLevelBadge, trackpadMode]);

  return {
    desktopSettingsStatus,
    setDesktopSettingsStatus,
    hasDesktopSettingsBridge,
    hasDesktopAppIconBridge,
    openDesktopSettings,
    openDesktopAppIcon,
    isMacDesktop,
    shouldShowReactFileMenu,
    leadingRailJustificationClass,
    topControlRailStyle,
    windowDragRegionStyle,
  };
}
