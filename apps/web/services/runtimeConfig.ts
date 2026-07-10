export type RuntimeConfig = {
  isDesktop: boolean;
  apiKey?: string;
  geminiApiKey?: string;
  secureBackendApiBaseUrl?: string;
  secureBackendMode?: SecureBackendMode;
  secureBackendAuthToken?: string;
  pythonBackendAuthToken?: string;
  pythonBackendAuthOrigin?: string;
  falApiUrl?: string;
  falModelId?: string;
  volcengineApiBaseUrl?: string;
  jimengApiBaseUrl?: string;
};

export type SecureBackendMode = 'managed' | 'external' | 'devExternal';

export type DesktopServiceState = 'stopped' | 'starting' | 'stopping' | 'ready' | 'external' | 'unavailable';

export type DesktopServiceStatus = {
  secureBackend: {
    state: DesktopServiceState;
    url?: string;
    mode?: SecureBackendMode;
    urlSource?: 'managed' | 'env' | 'default' | 'ignoredEnv';
    authTokenActive?: boolean;
    error?: string;
    updatedAt?: string;
  };
  pythonBackend: {
    state: DesktopServiceState;
    url?: string;
    error?: string;
    updatedAt?: string;
  };
};

export type DesktopSettingsKey =
  | 'GEMINI_API_KEY'
  | 'FAL_API_KEY'
  | 'MOONSHOT_API_KEY'
  | 'OPENROUTER_API_KEY'
  | 'ARK_API_KEY'
  | 'VOLCENGINE_ACCESS_KEY'
  | 'VOLCENGINE_SECRET_KEY'
  | 'TOS_BUCKET_NAME'
  | 'TOS_REGION'
  | 'JIMENG_CLI_PATH';

export type DesktopSettingsFieldStatus = {
  present: boolean;
  required: boolean;
  secret: boolean;
};

export type DesktopSettingsStatus = {
  configPath: string;
  fields: Record<DesktopSettingsKey, DesktopSettingsFieldStatus>;
  missingKeys: DesktopSettingsKey[];
  isPackaged: boolean;
  serviceStatus: DesktopServiceStatus;
};

export type DesktopSettingsPayload = Partial<Record<DesktopSettingsKey, string>>;

export type DesktopFileMenuCommand =
  | 'importSnapshot'
  | 'exportSnapshot'
  | 'openBackups'
  | 'toggleAutosave'
  | 'toggleZoomLevelBadge'
  | 'openDebugLog'
  | 'openManageKeys'
  | 'openChangeIcon'
  | 'clearJimengCache';

export type DesktopAppIconOption = {
  id: string;
  label: string;
  description: string;
  previewDataUrl: string;
};

export type DesktopAppIconState = {
  selectedIconId: string;
  options: DesktopAppIconOption[];
  supportsDockIcon: boolean;
};

export type DesktopFileMenuState = {
  autosaveEnabled: boolean;
  showZoomLevelBadge: boolean;
  isClearingJimengCache: boolean;
};

export type DesktopOpenSnapshotResult =
  | { canceled: true }
  | { canceled: false; sourceId: string; fileName: string; size: number; type: string; mediaUrlBase?: string };

export type DesktopBeginSaveSnapshotPayload = {
  suggestedName: string;
};

export type DesktopBeginSnapshotWriteResult =
  | { canceled: true }
  | { canceled: false; writeId: string; fileName: string; autosaveId?: string };

export type DesktopSnapshotWriteSession = {
  writeId: string;
  fileName: string;
  autosaveId?: string;
};

export type DesktopBeginAutosaveSnapshotPayload = {
  autosaveId: string;
};

export type DesktopBeginBackupSnapshotPayload = {
  id: string;
  createdAt: number;
  updatedAt: number;
  fileName: string;
  size: number;
};

export type DesktopSnapshotWritePayload = {
  writeId: string;
  data: ArrayBuffer;
};

export type DesktopSnapshotWriteIdPayload = {
  writeId: string;
};

export type DesktopSnapshotReadRangePayload = {
  sourceId: string;
  offset: number;
  length: number;
};

export type DesktopSnapshotReadSource = {
  sourceId: string;
  fileName: string;
  size: number;
  type: string;
  mediaUrlBase?: string; // New desktop sources build lazy media URLs without per-item IPC.
};

export type DesktopSnapshotMediaUrlPayload = {
  sourceId: string;
  offset: number;
  length: number;
  type: string;
  fileName: string;
};

export type DesktopSnapshotBackupSummary = {
  id: string;
  createdAt: number;
  updatedAt: number;
  fileName: string;
  size: number;
};

export type DesktopSnapshotWriteResult = {
  saved: boolean;
};

export type DesktopChatHistoryClearedPayload = {
  revision?: number;
};

declare global {
  interface Window {
    canvaBananaDesktop?: {
      getRuntimeConfig?: () => Partial<RuntimeConfig>;
      getServiceStatus?: () => Promise<DesktopServiceStatus>;
      getSettingsStatus?: () => Promise<DesktopSettingsStatus>;
      saveSettings?: (payload: DesktopSettingsPayload) => Promise<DesktopSettingsStatus>;
      clearSettings?: (keys: DesktopSettingsKey[]) => Promise<DesktopSettingsStatus>;
      restartServices?: () => Promise<DesktopSettingsStatus>;
      onOpenManageKeys?: (callback: () => void) => () => void;
      clipboard?: {
        writeText?: (text: string) => Promise<unknown>;
      };
      appIcon?: {
        getState?: () => Promise<DesktopAppIconState>;
        setSelected?: (iconId: string) => Promise<DesktopAppIconState>;
      };
      fileMenu?: {
        onCommand?: (callback: (command: DesktopFileMenuCommand) => void) => () => void;
        setState?: (state: DesktopFileMenuState) => Promise<unknown>;
        openSnapshotFile?: () => Promise<DesktopOpenSnapshotResult>;
        beginSaveSnapshot?: (payload: DesktopBeginSaveSnapshotPayload) => Promise<DesktopBeginSnapshotWriteResult>;
        beginAutosaveSnapshot?: (payload: DesktopBeginAutosaveSnapshotPayload) => Promise<DesktopSnapshotWriteSession>;
        beginBackupSnapshot?: (payload: DesktopBeginBackupSnapshotPayload) => Promise<DesktopSnapshotWriteSession>;
        writeSnapshotChunk?: (payload: DesktopSnapshotWritePayload) => Promise<{ written: number }>;
        finishSnapshotWrite?: (payload: DesktopSnapshotWriteIdPayload) => Promise<DesktopSnapshotWriteResult>;
        abortSnapshotWrite?: (payload: DesktopSnapshotWriteIdPayload) => Promise<{ aborted: boolean }>;
        readSnapshotRange?: (payload: DesktopSnapshotReadRangePayload) => Promise<ArrayBuffer>;
        getSnapshotMediaUrl?: (payload: DesktopSnapshotMediaUrlPayload) => Promise<string>;
        retainSnapshotRead?: (payload: { sourceId: string }) => Promise<{ retained: boolean }>;
        closeSnapshotRead?: (payload: { sourceId: string }) => Promise<{ closed: boolean }>;
        listSnapshotBackups?: () => Promise<DesktopSnapshotBackupSummary[]>;
        openBackupSnapshot?: (payload: { id: string }) => Promise<DesktopSnapshotReadSource>;
        deleteBackupSnapshot?: (payload: { id: string }) => Promise<{ deleted: boolean }>;
      };
      chatHistory?: {
        load?: () => Promise<unknown>;
        save?: (snapshot: unknown) => Promise<unknown>;
        onCleared?: (callback: (payload?: DesktopChatHistoryClearedPayload) => void) => () => void;
      };
    };
  }
}

const getDesktopRuntimeConfig = (): Partial<RuntimeConfig> => {
  if (typeof window === 'undefined') {
    return {};
  }
  return window.canvaBananaDesktop?.getRuntimeConfig?.() ?? {}; // Preload supplies desktop-only runtime values.
};

const getViteRuntimeConfig = (): Partial<RuntimeConfig> => ({
  apiKey: process.env.API_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
  secureBackendApiBaseUrl: process.env.SECURE_BACKEND_API_BASE_URL,
  secureBackendAuthToken: undefined,
  pythonBackendAuthToken: undefined,
  pythonBackendAuthOrigin: undefined,
  falApiUrl: process.env.FAL_API_URL,
  falModelId: process.env.FAL_MODEL_ID,
  volcengineApiBaseUrl: process.env.VOLCENGINE_API_BASE_URL,
  jimengApiBaseUrl: process.env.JIMENG_API_BASE_URL,
}); // Vite replaces these literals during browser builds.

export const getRuntimeConfig = (): RuntimeConfig => ({
  isDesktop: false,
  ...getViteRuntimeConfig(),
  ...getDesktopRuntimeConfig(),
}); // Desktop overrides build-time defaults without forking renderer code.

export const hasRuntimeConfigValue = (value: string | undefined): boolean =>
  typeof value === 'string' && value.trim().length > 0; // Treat whitespace env values as missing.
