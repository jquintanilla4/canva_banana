import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { getJimengSetupStatus } from '../services/jimengService';
import type { DesktopAppIconState, DesktopFileMenuCommand, DesktopSettingsKey, DesktopSettingsStatus } from '../services/runtimeConfig';
import { Tool, type CanvasImage, type GenerationPlacedPayload } from '../types';
import { FLOATING_EDGE_CONTROL_SIDE_OFFSET } from '../utils/promptBarFooterLayout';

const originalNavigatorPlatform = navigator.platform;

const desktopSettingsKeys: DesktopSettingsKey[] = [
  'GEMINI_API_KEY',
  'FAL_API_KEY',
  'MOONSHOT_API_KEY',
  'OPENROUTER_API_KEY',
  'ARK_API_KEY',
  'VOLCENGINE_ACCESS_KEY',
  'VOLCENGINE_SECRET_KEY',
  'TOS_BUCKET_NAME',
  'TOS_REGION',
  'JIMENG_CLI_PATH',
];

const buildDesktopSettingsStatus = (presentKeys: DesktopSettingsKey[] = desktopSettingsKeys): DesktopSettingsStatus => ({
  configPath: '/Users/qa/Library/Application Support/The Institute/.env.local',
  fields: Object.fromEntries(desktopSettingsKeys.map(key => [key, {
    present: presentKeys.includes(key),
    required: key !== 'JIMENG_CLI_PATH' && key !== 'OPENROUTER_API_KEY',
    secret: key.endsWith('_KEY') || key.includes('API_KEY'),
  }])) as DesktopSettingsStatus['fields'],
  missingKeys: desktopSettingsKeys.filter(key => key !== 'JIMENG_CLI_PATH' && key !== 'OPENROUTER_API_KEY' && !presentKeys.includes(key)),
  isPackaged: true,
  serviceStatus: {
    secureBackend: { state: 'ready', url: 'http://localhost:8787' },
    pythonBackend: { state: 'ready', url: 'http://localhost:8000' },
  },
}); // Keep desktop modal tests focused on bridge behavior, not missing-key startup.

const buildDesktopAppIconState = (): DesktopAppIconState => ({
  selectedIconId: 'institute',
  supportsDockIcon: true,
  options: [
    {
      id: 'institute',
      label: 'The Institute',
      description: 'Original icon',
      previewDataUrl: 'data:image/png;base64,',
    },
  ],
}); // The App test only needs enough icon state for the modal to render.

const buildCanvasMedia = (id: string, mediaType: CanvasImage['mediaType']): CanvasImage => ({
  id,
  element: document.createElement(mediaType === 'video' ? 'video' : 'img'),
  mediaType,
  x: 0,
  y: 0,
  width: 320,
  height: 180,
  rotation: 0,
  naturalWidth: 320,
  naturalHeight: 180,
  file: new File(['test'], `${id}.${mediaType === 'audio' ? 'mp3' : mediaType === 'video' ? 'mp4' : 'png'}`, {
    type: mediaType === 'audio' ? 'audio/mpeg' : mediaType === 'video' ? 'video/mp4' : 'image/png',
  }),
}); // The embedded prompt tests only need media ids/types, so minimal canvas items keep setup lean.

const mockState = vi.hoisted(() => {
  const handleGenerate = vi.fn();
  const importSnapshotWithPicker = vi.fn((callback: () => void) => callback());
  const setSelectedImageIds = vi.fn();
  const setReferenceImageIds = vi.fn();
  const setLiveVideoPromptBars = vi.fn();
  const baseVideoPromptArea = {
    id: 'area-1',
    sequence: 1,
    label: 'Video prompt area 01',
    x: 0,
    y: 0,
    width: 320,
    height: 180,
    promptBarId: 'bar-1',
    orderedMediaIds: [],
  };
  const baseVideoPromptBar = {
    id: 'bar-1',
    assignedAreaId: 'area-1',
    x: 0,
    y: 0,
    width: 320,
    height: 72,
    prompt: 'Existing area prompt',
    negativePrompt: '',
    modelId: undefined as string | undefined,
    seedance2Variant: 'reference',
    seedance2JimengModelVersion: 'seedance2.0fast',
    seedance2AspectRatio: '16:9',
    seedance2Resolution: '720p',
    seedance2Duration: '5',
    seedance2GenerateAudio: false,
    seedance2CameraFixed: false,
    klingV3MultiPrompt: '',
    klingV3Duration: '5',
    klingV3GenerateAudio: true,
    klingV3CfgScale: '0.5',
    klingV3MultiPromptEnabled: false,
    klingV3Shot1Duration: '5',
    klingV3Shot2Duration: '5',
  };
  const falState: any = {
    falModelMode: 'video',
    falModelId: 'volcengine/seedance-2',
    falImageModelId: 'fal-ai/flux/dev',
    falVideoModelId: 'volcengine/seedance-2',
    isVideoMode: true,
    isKlingVideoModel: false,
    isKlingV3VideoModel: false,
    isKlingO3VideoModel: false,
    isKlingV3ControlVideoModel: false,
    isWanAnimateVideoModel: false,
    isLipsyncVideoModel: false,
    isHeygenV3LipsyncVideoModel: false,
    isInfinitalkVideoModel: false,
    isGrokImagineVideoModel: false,
    isWan27VideoModel: false,
    isSeedance15VideoModel: false,
    isSeedance2VideoModel: true,
    isFalSeedance2VideoModel: false,
    isVolcengineSeedance2VideoModel: true,
    isJimengSeedance2VideoModel: false,
    isVeo31VideoModel: false,
    isFlux2MaxModel: false,
    isWan27ImageModel: false,
    isUpscaleModel: false,
    isKlingProVideoSelection: false,
    isKlingO3EditMode: false,
        falImageSizeSelection: 'default',
    falAspectRatioSelection: 'default',
    falResolutionSelection: '720p',
    falNumImages: 1,
    falScaleFactor: 2,
    falNoiseScale: 0.5,
    falCreativity: 0.5,
    falVideoDuration: '5',
    klingVariant: 'standard',
    klingV3Duration: '5',
    klingV3GenerateAudio: true,
    klingV3CfgScale: '0.5',
    klingV3MultiPromptEnabled: false,
    klingV3MultiPrompt: '',
    klingV3Shot1Duration: '5',
    klingV3Shot2Duration: '5',
    klingO3Variant: 'reference',
    klingO3KeepAudio: true,
    klingV3ControlKeepSound: false,
    klingV3ControlOrientation: 'video',
    wanTargetResolution: '720p',
    wanCreativity: 0,
    wanAnimateVariant: 'replace',
    wanAnimateSteps: '10',
    wanAnimateResolution: '480p',
    wanAnimateShift: '5.0',
    wanAnimateQuality: 'high',
    wanAnimateUseTurbo: false,
    lipsyncSyncMode: 'cut_off',
    heygenEnableCaption: false,
    heygenEnableDynamicDuration: true,
    heygenDisableMusicTrack: false,
    heygenEnableSpeechEnhancement: false,
    infinitalkResolution: '480p',
    infinitalkSeed: '42',
    infinitalkAcceleration: 'none',
    infinitalkDuration: '5s',
    grokImagineVideoDuration: '5',
    grokImagineVideoResolution: '720p',
    grokImagineVideoAspectRatio: '16:9',
    veo31Variant: 'i2v-fflf',
    veo31Duration: '4s',
    veo31Resolution: '720p',
    veo31AspectRatio: 'auto',
    veo31GenerateAudio: false,
    wan27VideoResolution: '720p',
    wan27VideoDuration: '5',
    wan27VideoAspectRatio: '16:9',
    wan27VideoPromptExpansion: false,
    wan27VideoVariant: 'smart',
    seedance15AspectRatio: '16:9',
    seedance15Resolution: '720p',
    seedance15Duration: '5',
    seedance15CameraFixed: false,
    seedance15Audio: false,
    seedance2Variant: 'reference',
    seedance2JimengModelVersion: 'seedance2.0fast',
    seedance2AspectRatio: '16:9',
    seedance2Resolution: '720p',
    seedance2Duration: '5',
    seedance2GenerateAudio: false,
    seedance2CameraFixed: false,
    flux2MaxImageSize: 'landscape_16_9',
    wan27ImageAspectRatio: 'landscape_16_9',
    wan27ImageMaxImages: '1',
  };

  falState.handleModelModeChange = vi.fn((mode: 'image' | 'video') => {
    falState.falModelMode = mode;
    falState.isVideoMode = mode === 'video';
    falState.falModelId = mode === 'video' ? 'volcengine/seedance-2' : 'fal-ai/flux/dev';
    falState.isSeedance2VideoModel = mode === 'video';
    falState.isFalSeedance2VideoModel = false;
    falState.isVolcengineSeedance2VideoModel = mode === 'video';
  });
  falState.handleFalModelChange = vi.fn();
  falState.handleFalVideoDurationChange = vi.fn();
  falState.handleKlingVariantChange = vi.fn();
  falState.handleKlingV3DurationChange = vi.fn();
  falState.handleKlingV3GenerateAudioChange = vi.fn();
  falState.handleKlingV3CfgScaleChange = vi.fn();
  falState.handleKlingV3MultiPromptEnabledChange = vi.fn();
  falState.handleKlingV3MultiPromptChange = vi.fn();
  falState.handleKlingV3Shot1DurationChange = vi.fn();
  falState.handleKlingV3Shot2DurationChange = vi.fn();
  falState.handleKlingO3VariantChange = vi.fn();
  falState.handleKlingO3KeepAudioChange = vi.fn();
  falState.handleKlingV3ControlKeepSoundChange = vi.fn();
  falState.handleKlingV3ControlOrientationChange = vi.fn();
  falState.handleWanTargetResolutionChange = vi.fn();
  falState.handleWanCreativityChange = vi.fn();
  falState.handleWanAnimateVariantChange = vi.fn();
  falState.handleWanAnimateStepsChange = vi.fn();
  falState.handleWanAnimateResolutionChange = vi.fn();
  falState.handleWanAnimateShiftChange = vi.fn();
  falState.handleWanAnimateQualityChange = vi.fn();
  falState.handleWanAnimateTurboChange = vi.fn();
  falState.handleLipsyncSyncModeChange = vi.fn();
  falState.handleHeygenEnableCaptionChange = vi.fn();
  falState.handleHeygenEnableDynamicDurationChange = vi.fn();
  falState.handleHeygenDisableMusicTrackChange = vi.fn();
  falState.handleHeygenEnableSpeechEnhancementChange = vi.fn();
  falState.handleInfinitalkResolutionChange = vi.fn();
  falState.handleInfinitalkSeedChange = vi.fn();
  falState.handleInfinitalkAccelerationChange = vi.fn();
  falState.handleInfinitalkDurationChange = vi.fn();
  falState.handleGrokImagineVideoDurationChange = vi.fn();
  falState.handleGrokImagineVideoResolutionChange = vi.fn();
  falState.handleGrokImagineVideoAspectRatioChange = vi.fn();
  falState.handleVeo31VariantChange = vi.fn();
  falState.handleVeo31DurationChange = vi.fn();
  falState.handleVeo31ResolutionChange = vi.fn();
  falState.handleVeo31AspectRatioChange = vi.fn();
  falState.handleVeo31GenerateAudioChange = vi.fn();
  falState.handleWan27VideoResolutionChange = vi.fn();
  falState.handleWan27VideoDurationChange = vi.fn();
  falState.handleWan27VideoPromptExpansionChange = vi.fn();
  falState.handleWan27VideoVariantChange = vi.fn();
  falState.handleWan27VideoAspectRatioChange = vi.fn();
  falState.handleSeedance15AspectRatioChange = vi.fn();
  falState.handleSeedance15ResolutionChange = vi.fn();
  falState.handleSeedance15DurationChange = vi.fn();
  falState.handleSeedance15CameraFixedChange = vi.fn();
  falState.handleSeedance15AudioChange = vi.fn();
  falState.handleSeedance2VariantChange = vi.fn();
  falState.handleSeedance2JimengModelVersionChange = vi.fn();
  falState.handleSeedance2AspectRatioChange = vi.fn();
  falState.handleSeedance2ResolutionChange = vi.fn();
  falState.handleSeedance2DurationChange = vi.fn();
  falState.handleSeedance2GenerateAudioChange = vi.fn();
  falState.handleSeedance2CameraFixedChange = vi.fn();
  falState.handleFlux2MaxImageSizeChange = vi.fn();
  falState.handleWan27ImageAspectRatioChange = vi.fn();
  falState.handleWan27ImageMaxImagesChange = vi.fn();
  falState.handleFalImageSizeChange = vi.fn();
  falState.handleFalAspectRatioChange = vi.fn();
  falState.handleFalResolutionChange = vi.fn();
  falState.handleFalNumImagesChange = vi.fn();
  falState.handleFalScaleFactorChange = vi.fn();
  falState.handleFalNoiseScaleChange = vi.fn();
  falState.handleFalCreativityChange = vi.fn();

  return {
    handleGenerate,
    importSnapshotWithPicker,
    activeSnapshotFileName: null as string | null,
    onGenerationPlaced: null as ((payload: GenerationPlacedPayload) => void) | null,
    selectedImageIds: [] as string[],
    setSelectedImageIds,
    setReferenceImageIds,
    setLiveVideoPromptBars,
    falState,
    images: [] as CanvasImage[],
    displayedImages: [] as CanvasImage[],
    lastCanvasProps: null as Record<string, unknown> | null,
    keyboardShortcuts: null as { onGenerate: () => void; onTogglePresentationMode?: () => void; isPresentationMode?: boolean } | null,
    cropMode: null as { imageId: string; rect: { x: number; y: number; width: number; height: number } } | null,
    transformMode: null as { imageId: string } | null,
    baseVideoPromptArea,
    baseVideoPromptBar,
    videoPromptAreas: [{ ...baseVideoPromptArea }],
    videoPromptBars: [{ ...baseVideoPromptBar }],
    displayedVideoPromptAreas: [{ ...baseVideoPromptArea }],
    displayedVideoPromptBars: [{ ...baseVideoPromptBar }],
    runtimeConfig: { isDesktop: false },
  };
});

vi.mock('../services/runtimeConfig', async () => {
  const actual = await vi.importActual<typeof import('../services/runtimeConfig')>('../services/runtimeConfig');
  return {
    ...actual,
    getRuntimeConfig: () => mockState.runtimeConfig,
  };
});

vi.mock('../components/Toolbar', () => ({
  Toolbar: ({ activeTool, onToolChange, isVideoPromptAreaToolEnabled }: { activeTool: Tool; onToolChange: (tool: Tool) => void; isVideoPromptAreaToolEnabled: boolean }) => (
    <div>
      <span data-testid="active-tool">{activeTool}</span>
      <span data-testid="video-tool-enabled">{String(isVideoPromptAreaToolEnabled)}</span>
      <button type="button" onClick={() => onToolChange(Tool.VIDEO_PROMPT_AREA)}>
        Activate Video Prompt Area
      </button>
    </div>
  ),
}));

vi.mock('../components/PromptBar', () => ({
  PromptBar: ({ onSubmit, onModelModeChange, submitDisabled, leadingAccessory }: { onSubmit: () => void; onModelModeChange: (mode: 'image' | 'video') => void; submitDisabled?: boolean; leadingAccessory?: ReactNode }) => (
    <div>
      <button type="button" onClick={onSubmit} disabled={submitDisabled}>
        Generate
      </button>
      <button type="button" onClick={() => onModelModeChange('image')}>
        Switch To Image
      </button>
      {leadingAccessory}
    </div>
  ),
}));

vi.mock('../components/Canvas', () => ({
  Canvas: (props: { onVideoPromptBarSubmit: (barId: string) => void } & Record<string, unknown>) => {
    mockState.lastCanvasProps = props;
    return (
      <button type="button" onClick={() => props.onVideoPromptBarSubmit('bar-1')}>
        Submit Embedded Prompt
      </button>
    );
  },
}));

vi.mock('../components/RecordingOverlay', () => ({ RecordingOverlay: () => null }));
vi.mock('../components/BackupsModal', () => ({
  BackupsModal: ({ isOpen }: { isOpen: boolean }) => (
    isOpen ? <div role="dialog" aria-label="Autosave Backups" /> : null
  ),
}));
vi.mock('../components/FalQueuePanel', () => ({ FalQueuePanel: () => null }));
vi.mock('../components/DebugLogPanel', () => ({ DebugLogPanel: () => null }));
vi.mock('../components/FileMenu', () => ({
  FileMenu: ({ isOpen, onToggle, onImportSnapshot }: { isOpen: boolean; onToggle: () => void; onImportSnapshot: () => void }) => (
    <div>
      <button type="button" aria-label="Snapshot menu" onClick={onToggle}>
        Menu
      </button>
      {isOpen && (
        <div role="menu">
          <span>Snapshot actions</span>
          <button type="button" onClick={onImportSnapshot}>
            Import Snapshot
          </button>
        </div>
      )}
    </div>
  ),
}));
vi.mock('../components/ViewToolbar', () => ({ ViewToolbar: () => null }));
vi.mock('../components/ProviderSwitcher', () => ({
  ProviderSwitcher: ({ onSelect }: { onSelect: (provider: 'fal') => void }) => (
    <button type="button" onClick={() => onSelect('fal')}>
      Switch To Fal
    </button>
  ),
}));
vi.mock('../components/StatusBanner', () => ({ StatusBanner: () => null }));
vi.mock('../components/ImageResizeToast', () => ({ ImageResizeToast: () => null }));

vi.mock('../hooks/useCanvasHistory', () => ({
  useCanvasHistory: () => ({
    images: mockState.images,
    paths: [],
    notes: [],
    videoPromptAreas: mockState.videoPromptAreas,
    videoPromptBars: mockState.videoPromptBars,
    displayedImages: mockState.displayedImages,
    displayedPaths: [],
    displayedNotes: [],
    displayedVideoPromptAreas: mockState.displayedVideoPromptAreas,
    displayedVideoPromptBars: mockState.displayedVideoPromptBars,
    setState: vi.fn(),
    setLiveImages: vi.fn(),
    setLivePaths: vi.fn(),
    setLiveNotes: vi.fn(),
    setLiveVideoPromptAreas: vi.fn(),
    setLiveVideoPromptBars: mockState.setLiveVideoPromptBars,
    commit: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: false,
    canRedo: false,
    resetHistory: vi.fn(),
  }),
}));

vi.mock('../hooks/useSelectionState', () => ({
  useSelectionState: () => ({
    selectedImageIds: mockState.selectedImageIds,
    referenceImageIds: [],
    referenceVideoIds: [],
    referenceAudioIds: [],
    seedanceReferenceOrderIds: [],
    elementImageIds: [],
    videoLastFrameImageId: null,
    sourceVideoId: null,
    sourceAudioId: null,
    primaryImageId: null,
    primarySelectionMediaType: null,
    activePrimaryImage: null,
    hasSingleImageSelected: false,
    setSelectedImageIds: mockState.setSelectedImageIds,
    setReferenceImageIds: mockState.setReferenceImageIds,
    setReferenceVideoIds: vi.fn(),
    setReferenceAudioIds: vi.fn(),
    setElementImageIds: vi.fn(),
    setVideoLastFrameImageId: vi.fn(),
    setSourceVideoId: vi.fn(),
    setSourceAudioId: vi.fn(),
    handleImageSelection: vi.fn(),
    replaceCanvasSelection: vi.fn(),
  }),
}));

vi.mock('../hooks/useFalSettings', () => ({
  useFalSettings: () => mockState.falState,
}));

vi.mock('../hooks/useGeneration', () => ({
  useGeneration: (options: { onGenerationPlaced?: (payload: GenerationPlacedPayload) => void }) => {
    mockState.onGenerationPlaced = options.onGenerationPlaced ?? null; // Expose completion so App selection behavior can be tested.
    return { handleGenerate: mockState.handleGenerate };
  },
}));

vi.mock('../hooks/useSnapshotIO', () => ({
  useSnapshotIO: () => ({
    activeSnapshotFileName: mockState.activeSnapshotFileName,
    exportSnapshot: vi.fn(),
    importSnapshotFromFile: vi.fn(),
    importSnapshotWithPicker: mockState.importSnapshotWithPicker,
    autosaveSnapshot: vi.fn(),
  }),
}));

vi.mock('../hooks/useCanvasMediaActions', () => ({
  useCanvasMediaActions: () => ({
    cropMode: mockState.cropMode,
    transformMode: mockState.transformMode,
    isRemovingBackground: false,
    handleFilesDrop: vi.fn(),
    handleFileChange: vi.fn(),
    handleDownload: vi.fn(),
    handleBackgroundRemoval: vi.fn(),
    handleStartCrop: vi.fn(),
    handleCropRectChange: vi.fn(),
    handleConfirmCrop: vi.fn(),
    handleCancelCrop: vi.fn(),
    handleStartTransform: vi.fn(),
    handleExitTransform: vi.fn(),
  }),
}));

vi.mock('../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: (args: { onGenerate: () => void; onTogglePresentationMode?: () => void; isPresentationMode?: boolean }) => {
    mockState.keyboardShortcuts = args;
  },
}));

vi.mock('../hooks/useAudioRecording', () => ({
  useAudioRecording: () => ({
    isRecording: false,
    recordingDuration: 0,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    error: null,
  }),
}));

vi.mock('../hooks/useGenerationGuards', () => ({
  useGenerationGuards: () => ({
    submitDisabled: false,
    promptPlaceholderText: 'Describe your generation',
    disablePromptInput: false,
    shouldValidateFalOptions: false,
    isNumImagesInvalid: false,
    isTextToImage: false,
  }),
}));

vi.mock('../hooks/useImageResize', () => ({
  useImageResize: () => ({
    isOpen: false,
    width: 0,
    height: 0,
    keepAspect: true,
    isProcessing: false,
    canResize: false,
    open: vi.fn(),
    cancel: vi.fn(),
    setWidth: vi.fn(),
    setHeight: vi.fn(),
    setKeepAspect: vi.fn(),
    confirm: vi.fn(),
  }),
}));

vi.mock('../hooks/useDuplicateCanvasMedia', () => ({
  useDuplicateCanvasMedia: () => ({
    duplicateNote: vi.fn(),
    duplicateImage: vi.fn(),
  }),
}));

vi.mock('../hooks/useKlingReferenceHelpers', () => ({
  useKlingReferenceHelpers: () => ({
    referenceOrderLabels: {},
    elementOrderLabels: {},
  }),
}));

vi.mock('../hooks/useKlingPromptMentions', () => ({
  useKlingPromptMentions: () => ({
    klingPromptMentions: [],
    klingReferenceCount: 0,
  }),
}));

vi.mock('../hooks/useVideoNegativePrompt', () => ({
  useVideoNegativePrompt: () => ({
    videoNegativePrompt: '',
    setVideoNegativePrompt: vi.fn(),
    shouldShowVideoNegativePrompt: false,
  }),
}));

vi.mock('../hooks/useFalQueueJobs', () => ({
  useFalQueueJobs: () => ({
    falJobs: [],
    setFalJobs: vi.fn(),
    dismissFalJob: vi.fn(),
  }),
}));

vi.mock('../hooks/useDebugLogState', () => ({
  useDebugLogState: () => ({
    isDebugLogOpen: false,
    debugLogEntries: [],
    openDebugLogPanel: vi.fn(),
    closeDebugLogPanel: vi.fn(),
    copyLastEntry: vi.fn(),
  }),
}));

vi.mock('../services/backupService', () => ({
  pruneBackupSessions: vi.fn(),
  saveBackupSessionBinary: vi.fn(),
  listBackupSessions: vi.fn(),
  getBackupSession: vi.fn(),
}));

vi.mock('../services/audioService', () => ({
  convertAudioBlobToWav: vi.fn(),
  generateWaveformImage: vi.fn(),
  loadAudioFromBlob: vi.fn(),
}));

vi.mock('../services/debugLog', () => ({
  clearDebugLogs: vi.fn(),
}));

vi.mock('../services/jimengService', () => ({
  clearJimengCache: vi.fn(async () => ({ status: 'ok', deletedFiles: 0, bytesFreed: 0, errors: [] })),
  getJimengSetupStatus: vi.fn(async () => ({
    ready: false,
    backendReachable: true,
    cliAvailable: false,
    authenticated: false,
    message: 'Jimeng setup is required.',
  })),
  installJimengCli: vi.fn(),
  startJimengLogin: vi.fn(async () => ({ message: 'Login started.' })),
}));

afterEach(() => {
  cleanup();
  delete window.canvaBananaDesktop;
  Object.defineProperty(navigator, 'platform', {
    configurable: true,
    value: originalNavigatorPlatform,
  });
  mockState.runtimeConfig.isDesktop = false;
  mockState.handleGenerate.mockClear();
  mockState.onGenerationPlaced = null;
  mockState.selectedImageIds = [];
  mockState.setSelectedImageIds.mockClear();
  mockState.importSnapshotWithPicker.mockReset();
  mockState.importSnapshotWithPicker.mockImplementation((callback: () => void) => callback()); // Default tests use the hidden-input fallback path.
  mockState.activeSnapshotFileName = null;
  mockState.setReferenceImageIds.mockClear();
  mockState.setLiveVideoPromptBars.mockClear();
  mockState.images = [];
  mockState.displayedImages = [];
  mockState.lastCanvasProps = null;
  mockState.keyboardShortcuts = null;
  mockState.cropMode = null;
  mockState.transformMode = null;
  mockState.videoPromptAreas = [{ ...mockState.baseVideoPromptArea }];
  mockState.videoPromptBars = [{ ...mockState.baseVideoPromptBar }];
  mockState.displayedVideoPromptAreas = [{ ...mockState.baseVideoPromptArea }];
  mockState.displayedVideoPromptBars = [{ ...mockState.baseVideoPromptBar }];
  window.localStorage.clear();
  vi.mocked(getJimengSetupStatus).mockResolvedValue({
    ready: false,
    backendReachable: true,
    cliAvailable: false,
    authenticated: false,
    message: 'Jimeng setup is required.',
  });
  Object.assign(mockState.falState, {
    falModelMode: 'video',
    falModelId: 'volcengine/seedance-2',
    falVideoModelId: 'volcengine/seedance-2',
    isVideoMode: true,
    isSeedance2VideoModel: true,
    isFalSeedance2VideoModel: false,
    isVolcengineSeedance2VideoModel: true,
    isJimengSeedance2VideoModel: false,
    isWan27VideoModel: false,
    wan27VideoVariant: 'smart',
    seedance2JimengModelVersion: 'seedance2.0fast',
  });
  mockState.falState.handleModelModeChange.mockClear();
});

describe('App video prompt area gating', () => {
  it.each([
    { label: 'an existing multi-item selection', selectedImageIds: ['existing-image-1', 'existing-image-2'] },
    { label: 'no existing selection', selectedImageIds: [] },
  ])('keeps $label and the active tool until Click to view selects the generation', ({ selectedImageIds }) => {
    mockState.selectedImageIds = selectedImageIds;
    mockState.images = [
      buildCanvasMedia('existing-image-1', 'image'),
      buildCanvasMedia('existing-image-2', 'image'),
      buildCanvasMedia('generated-image', 'image'),
    ];
    mockState.displayedImages = mockState.images;

    render(<App />);

    act(() => {
      mockState.onGenerationPlaced?.({
        mediaIds: ['generated-image'],
        mediaType: 'image',
        modelLabel: 'Test Model',
      });
    });

    expect(mockState.setSelectedImageIds).not.toHaveBeenCalled();
    expect(screen.getByTestId('active-tool').textContent).toBe(Tool.PAN);

    fireEvent.click(screen.getByRole('button', { name: /image added to canvas.*test model.*click to view/i }));

    expect(mockState.setSelectedImageIds).toHaveBeenCalledWith(['generated-image']);
    expect(screen.getByTestId('active-tool').textContent).toBe(Tool.FREE_SELECTION);
  });

  it('opens the Manage Keys modal from the native menu command', async () => {
    let fileMenuCommand: ((command: DesktopFileMenuCommand) => void) | null = null;
    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    });
    mockState.runtimeConfig.isDesktop = true;
    const getSettingsStatus = vi.fn(async () => buildDesktopSettingsStatus());
    const onCommand = vi.fn((callback: (command: DesktopFileMenuCommand) => void) => {
      fileMenuCommand = callback; // Store the main-process File menu callback for the test.
      return vi.fn();
    });
    window.canvaBananaDesktop = {
      getSettingsStatus,
      fileMenu: {
        onCommand,
        setState: vi.fn(),
      },
    };

    render(<App />);

    await waitFor(() => expect(onCommand).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Open prompt chat' })).toBeTruthy();

    await act(async () => {
      fileMenuCommand?.('openManageKeys');
    });

    expect(await screen.findByRole('dialog', { name: /manage keys/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open prompt chat' })).toBeNull();
    await waitFor(() => expect(getSettingsStatus).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Jimeng CLI Path', { selector: 'input' })).toBeTruthy();
  });

  it('opens the Change Icon modal from the native menu command', async () => {
    let fileMenuCommand: ((command: DesktopFileMenuCommand) => void) | null = null;
    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    });
    mockState.runtimeConfig.isDesktop = true;
    const getState = vi.fn(async () => buildDesktopAppIconState());
    const onCommand = vi.fn((callback: (command: DesktopFileMenuCommand) => void) => {
      fileMenuCommand = callback; // Store the main-process File menu callback for the test.
      return vi.fn();
    });
    window.canvaBananaDesktop = {
      appIcon: {
        getState,
        setSelected: vi.fn(),
      },
      fileMenu: {
        onCommand,
        setState: vi.fn(),
      },
    };

    render(<App />);

    await waitFor(() => expect(onCommand).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Open prompt chat' })).toBeTruthy();

    await act(async () => {
      fileMenuCommand?.('openChangeIcon');
    });

    expect(await screen.findByRole('dialog', { name: /change icon/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open prompt chat' })).toBeNull();
    expect(screen.getByRole('radio', { name: /the institute/i })).toBeTruthy();
    await waitFor(() => expect(getState).toHaveBeenCalledTimes(1));
  });

  it('replaces the active blocking modal when native menu commands switch dialogs', async () => {
    let fileMenuCommand: ((command: DesktopFileMenuCommand) => void) | null = null;
    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    });
    mockState.runtimeConfig.isDesktop = true;
    const getSettingsStatus = vi.fn(async () => buildDesktopSettingsStatus());
    const getState = vi.fn(async () => buildDesktopAppIconState());
    const onCommand = vi.fn((callback: (command: DesktopFileMenuCommand) => void) => {
      fileMenuCommand = callback; // Store the main-process File menu callback for the test.
      return vi.fn();
    });
    window.canvaBananaDesktop = {
      getSettingsStatus,
      appIcon: {
        getState,
        setSelected: vi.fn(),
      },
      fileMenu: {
        onCommand,
        setState: vi.fn(),
      },
    };

    render(<App />);

    await waitFor(() => expect(onCommand).toHaveBeenCalledTimes(1));

    await act(async () => {
      fileMenuCommand?.('openChangeIcon');
    });

    expect(await screen.findByRole('dialog', { name: /change icon/i })).toBeTruthy();

    await act(async () => {
      fileMenuCommand?.('openManageKeys');
    });

    expect(await screen.findByRole('dialog', { name: /manage keys/i })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: /change icon/i })).toBeNull();

    await act(async () => {
      fileMenuCommand?.('openChangeIcon');
    });

    expect(await screen.findByRole('dialog', { name: /change icon/i })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: /manage keys/i })).toBeNull();
  });

  it('hides the Jimeng CLI path during automatic desktop onboarding when the Fal key is missing', async () => {
    const missingFalStatus = buildDesktopSettingsStatus(desktopSettingsKeys.filter(key => key !== 'FAL_API_KEY'));
    const getSettingsStatus = vi.fn(async () => missingFalStatus);
    window.canvaBananaDesktop = { getSettingsStatus };

    render(<App />);

    expect(await screen.findByRole('dialog', { name: /manage keys/i })).toBeTruthy();
    expect(screen.getByLabelText('FAL API Key', { selector: 'input' })).toBeTruthy();
    expect(screen.queryByLabelText('Jimeng CLI Path', { selector: 'input' })).toBeNull();
  });

  it('does not auto-open desktop onboarding when the Fal key is saved', async () => {
    const missingNonFalStatus = buildDesktopSettingsStatus(desktopSettingsKeys.filter(key => key !== 'GEMINI_API_KEY'));
    const getSettingsStatus = vi.fn(async () => missingNonFalStatus);
    window.canvaBananaDesktop = { getSettingsStatus };

    render(<App />);

    await waitFor(() => expect(getSettingsStatus).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog', { name: /manage keys/i })).toBeNull();
  });

  it('renders the top control rail that centers the menu button and zoom badge with the toolbar row', () => {
    render(<App />);

    const rail = screen.getByTestId('top-control-rail');

    expect(rail.classList.contains('top-4')).toBe(true);
    expect(rail.classList.contains('z-30')).toBe(true);
    expect(rail.classList.contains('h-12')).toBe(true);
    expect(rail.classList.contains('items-center')).toBe(true);
    expect(rail.style.paddingInline).toBe(FLOATING_EDGE_CONTROL_SIDE_OFFSET);
    expect(screen.getByLabelText('Snapshot menu').closest('[data-testid="top-control-rail"]')).toBe(rail);
    expect(screen.getByTestId('top-control-rail-leading').classList.contains('justify-start')).toBe(true);
    expect(screen.getByTestId('top-control-rail-leading').classList.contains('justify-center')).toBe(false);
    expect(screen.getByLabelText('Canvas zoom 100%').closest('[data-testid="top-control-rail"]')).toBe(rail);
  });

  it('retains the toolbar grid track while crop and transform modes suppress its controls', () => {
    const { rerender } = render(<App />);

    let toolbarSlot = screen.getByTestId('top-control-rail-toolbar');
    expect(toolbarSlot.classList.contains('invisible')).toBe(false);
    expect(toolbarSlot.hasAttribute('inert')).toBe(false);

    mockState.cropMode = { imageId: 'image-1', rect: { x: 0, y: 0, width: 100, height: 100 } };
    rerender(<App />);

    toolbarSlot = screen.getByTestId('top-control-rail-toolbar');
    expect(toolbarSlot.classList.contains('invisible')).toBe(true);
    expect(toolbarSlot.getAttribute('aria-hidden')).toBe('true');
    expect(toolbarSlot.hasAttribute('inert')).toBe(true);
    expect(screen.getByTestId('active-tool').closest('[data-testid="top-control-rail-toolbar"]')).toBe(toolbarSlot);

    mockState.cropMode = null;
    mockState.transformMode = { imageId: 'image-1' };
    rerender(<App />);

    toolbarSlot = screen.getByTestId('top-control-rail-toolbar');
    expect(toolbarSlot.classList.contains('invisible')).toBe(true);
    expect(toolbarSlot.hasAttribute('inert')).toBe(true);

    mockState.transformMode = null;
    rerender(<App />);

    toolbarSlot = screen.getByTestId('top-control-rail-toolbar');
    expect(toolbarSlot.classList.contains('invisible')).toBe(false);
    expect(toolbarSlot.hasAttribute('inert')).toBe(false);
  });

  it('handles persisted View menu toggles and shows the active trackpad status beside zoom', async () => {
    let fileMenuCommand: ((command: DesktopFileMenuCommand) => void) | null = null;
    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    });
    mockState.runtimeConfig.isDesktop = true;
    mockState.activeSnapshotFileName = 'client-concept-v12.bcsnap';
    const setState = vi.fn();
    window.canvaBananaDesktop = {
      fileMenu: {
        onCommand: vi.fn((callback: (command: DesktopFileMenuCommand) => void) => {
          fileMenuCommand = callback; // Capture the native command so the checkbox behavior can be exercised.
          return vi.fn();
        }),
        setState,
      },
    };

    render(<App />);

    const fileName = screen.getByLabelText('Current snapshot file: client-concept-v12.bcsnap');
    expect(fileName.getAttribute('title')).toBe('client-concept-v12.bcsnap');
    expect(screen.getByTestId('top-control-rail-leading').classList.contains('justify-center')).toBe(true);
    expect(screen.getByTestId('top-control-rail-leading').classList.contains('justify-start')).toBe(false);
    expect(fileName.classList.contains('text-[15px]')).toBe(true);
    expect(fileName.classList.contains('border')).toBe(false);
    expect([...fileName.classList].some(className => className.startsWith('bg-'))).toBe(false);
    const fileNameText = fileName.querySelector('span');
    expect(fileNameText?.classList.contains('truncate')).toBe(true);
    expect(fileNameText?.style.webkitTextStroke).toBe('2px rgba(3, 7, 18, 0.92)');
    expect(fileNameText?.style.paintOrder).toBe('stroke fill');
    expect(fileNameText?.style.textShadow).toContain('rgba(0, 0, 0, 0.95)');
    await waitFor(() => expect(setState).toHaveBeenCalledWith(expect.objectContaining({ showFileName: true })));
    expect(mockState.lastCanvasProps?.trackpadMode).toBe(false);

    act(() => {
      fileMenuCommand?.('toggleFileName');
    });

    expect(screen.queryByTestId('snapshot-file-name')).toBeNull();
    await waitFor(() => expect(setState).toHaveBeenCalledWith(expect.objectContaining({ showFileName: false })));

    act(() => {
      fileMenuCommand?.('toggleTrackpadMode');
    });

    expect(screen.getByLabelText('Canvas zoom 100%, Trackpad mode on')).toBeTruthy();
    expect(screen.getByText('Trackpad')).toBeTruthy();
    expect(mockState.lastCanvasProps?.trackpadMode).toBe(true);
    await waitFor(() => expect(setState).toHaveBeenCalledWith(expect.objectContaining({ trackpadMode: true })));

    act(() => {
      fileMenuCommand?.('toggleZoomLevelBadge');
    });

    expect(screen.queryByLabelText('Canvas zoom 100%, Trackpad mode on')).toBeNull();
    expect(screen.queryByText('Trackpad')).toBeNull();
  });

  it('toggles presentation mode from the shortcut handler and hides app chrome', () => {
    render(<App />);

    expect(screen.getByTestId('top-control-rail')).toBeTruthy();
    expect(screen.getByTestId('active-tool')).toBeTruthy();
    expect(screen.getByText('Generate')).toBeTruthy();
    expect(screen.getByText('Switch To Fal')).toBeTruthy();
    expect(mockState.lastCanvasProps?.isPresentationMode).toBe(false);

    act(() => {
      mockState.keyboardShortcuts?.onTogglePresentationMode?.();
    });

    expect(screen.queryByTestId('top-control-rail')).toBeNull();
    expect(screen.queryByTestId('active-tool')).toBeNull();
    expect(screen.queryByText('Generate')).toBeNull();
    expect(screen.queryByText('Switch To Fal')).toBeNull();
    expect(mockState.lastCanvasProps?.isPresentationMode).toBe(true);
    expect(mockState.keyboardShortcuts?.isPresentationMode).toBe(true);
  });

  it('hides the hamburger menu on macOS desktop', () => {
    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    });
    mockState.runtimeConfig.isDesktop = true;
    window.canvaBananaDesktop = {
      fileMenu: {
        onCommand: vi.fn(() => vi.fn()),
        setState: vi.fn(),
      },
    };

    render(<App />);

    expect(screen.queryByLabelText('Snapshot menu')).toBeNull();
    expect(screen.getByLabelText('Canvas zoom 100%').closest('[data-testid="top-control-rail"]')).toBe(screen.getByTestId('top-control-rail'));
  });

  it('hides the hamburger menu on macOS desktop when the native file menu bridge is missing', () => {
    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    });
    mockState.runtimeConfig.isDesktop = true;
    window.canvaBananaDesktop = {};

    render(<App />);

    expect(screen.queryByLabelText('Snapshot menu')).toBeNull();
  });

  it('suppresses prompt chat while the snapshot menu is open', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open prompt chat' }));
    expect(screen.getByRole('button', { name: 'Close prompt chat' })).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Snapshot menu'));

    expect(screen.queryByRole('button', { name: 'Close prompt chat' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open prompt chat' })).toBeNull();

    fireEvent.click(screen.getByLabelText('Snapshot menu'));

    expect(screen.getByRole('button', { name: 'Close prompt chat' })).toBeTruthy();
  });

  it('closes the snapshot menu before opening the import picker', () => {
    mockState.importSnapshotWithPicker.mockImplementation(() => undefined);

    render(<App />);

    fireEvent.click(screen.getByLabelText('Snapshot menu'));
    expect(screen.getByRole('menu')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Import Snapshot' }));

    expect(mockState.importSnapshotWithPicker).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('hides the footer add button when video mode has no video prompt areas', () => {
    mockState.videoPromptAreas = [];
    mockState.videoPromptBars = [];
    mockState.displayedVideoPromptAreas = [];
    mockState.displayedVideoPromptBars = [];

    render(<App />);

    expect(screen.queryByRole('button', { name: 'Create video prompt bar' })).toBeNull();
  });

  it('shows the footer add button when video mode has at least one video prompt area', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: 'Create video prompt bar' })).toBeTruthy();
  });

  it('disables tail-frame selection for Wan 2.7 Reference mode', () => {
    Object.assign(mockState.falState, {
      falModelId: 'fal-ai/wan/v2.7',
      falVideoModelId: 'fal-ai/wan/v2.7',
      isSeedance2VideoModel: false,
      isVolcengineSeedance2VideoModel: false,
      isWan27VideoModel: true,
      wan27VideoVariant: 'reference',
    });

    render(<App />);

    expect(mockState.lastCanvasProps?.tailSelectionEnabled).toBe(false);
  });

  it('keeps tail-frame selection enabled for Wan 2.7 Smart mode', () => {
    Object.assign(mockState.falState, {
      falModelId: 'fal-ai/wan/v2.7',
      falVideoModelId: 'fal-ai/wan/v2.7',
      isSeedance2VideoModel: false,
      isVolcengineSeedance2VideoModel: false,
      isWan27VideoModel: true,
      wan27VideoVariant: 'smart',
    });

    render(<App />);

    expect(mockState.lastCanvasProps?.tailSelectionEnabled).toBe(true);
  });

  it('disables tail-frame selection for Wan 2.7 Edit mode', () => {
    Object.assign(mockState.falState, {
      falModelId: 'fal-ai/wan/v2.7',
      falVideoModelId: 'fal-ai/wan/v2.7',
      isSeedance2VideoModel: false,
      isVolcengineSeedance2VideoModel: false,
      isWan27VideoModel: true,
      wan27VideoVariant: 'edit',
    });

    render(<App />);

    expect(mockState.lastCanvasProps?.tailSelectionEnabled).toBe(false);
  });

  it('keeps Jimeng setup recoverable after dismissing the panel', async () => {
    Object.assign(mockState.falState, {
      falModelId: 'jimeng-cli/seedance-2',
      falVideoModelId: 'jimeng-cli/seedance-2',
      isFalSeedance2VideoModel: false,
      isJimengSeedance2VideoModel: true,
      isVolcengineSeedance2VideoModel: false,
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Switch To Fal' }));

    expect(await screen.findByRole('region', { name: 'Jimeng setup' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByRole('region', { name: 'Jimeng setup' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Reopen Jimeng setup' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Reopen Jimeng setup' }));

    expect(screen.getByRole('region', { name: 'Jimeng setup' })).toBeTruthy();
  });

  it('blocks global Jimeng submit and shortcut until setup is ready', async () => {
    Object.assign(mockState.falState, {
      falModelId: 'jimeng-cli/seedance-2',
      falVideoModelId: 'jimeng-cli/seedance-2',
      isFalSeedance2VideoModel: false,
      isJimengSeedance2VideoModel: true,
      isVolcengineSeedance2VideoModel: false,
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Switch To Fal' }));

    expect(await screen.findByRole('region', { name: 'Jimeng setup' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Generate' }) as HTMLButtonElement).disabled).toBe(true);

    mockState.keyboardShortcuts?.onGenerate();

    expect(mockState.handleGenerate).not.toHaveBeenCalled();
  });

  it('blocks embedded Jimeng prompt bars until setup is ready', async () => {
    mockState.videoPromptBars = [{
      ...mockState.baseVideoPromptBar,
      modelId: 'jimeng-cli/seedance-2',
      seedance2JimengModelVersion: 'seedance2.0_vip',
      seedance2Resolution: '1080p',
    }];
    mockState.displayedVideoPromptBars = [...mockState.videoPromptBars];

    render(<App />);

    expect(await screen.findByRole('region', { name: 'Jimeng setup' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Submit Embedded Prompt' }));

    expect(mockState.handleGenerate).not.toHaveBeenCalled();
  });

  it('keeps footer generation available when only an embedded Jimeng bar needs setup', async () => {
    mockState.videoPromptBars = [{
      ...mockState.baseVideoPromptBar,
      modelId: 'jimeng-cli/seedance-2',
    }];
    mockState.displayedVideoPromptBars = [...mockState.videoPromptBars];

    render(<App />);

    expect(await screen.findByRole('region', { name: 'Jimeng setup' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Generate' }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(mockState.handleGenerate).toHaveBeenCalledWith();
  });

  it('submits ready embedded Jimeng prompt bars through Jimeng options', async () => {
    vi.mocked(getJimengSetupStatus).mockResolvedValue({
      ready: true,
      backendReachable: true,
      cliAvailable: true,
      authenticated: true,
      message: 'Jimeng setup is ready.',
    });
    mockState.videoPromptBars = [{
      ...mockState.baseVideoPromptBar,
      modelId: 'jimeng-cli/seedance-2',
      seedance2JimengModelVersion: 'seedance2.0fast',
      seedance2Resolution: '1080p',
      seedance2GenerateAudio: true,
    }];
    mockState.displayedVideoPromptBars = [...mockState.videoPromptBars];

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Jimeng setup' })).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Submit Embedded Prompt' }));

    await waitFor(() => {
      expect(mockState.handleGenerate).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'video',
        provider: 'jimeng',
        modelId: 'jimeng-cli/seedance-2',
        modelMode: 'video',
        jimengOptions: expect.objectContaining({
          seedance2JimengModelVersion: 'seedance2.0fast',
          seedance2Resolution: '720p',
          seedance2GenerateAudio: true,
        }),
      }));
    });
    expect(mockState.handleGenerate).toHaveBeenCalledWith(expect.not.objectContaining({
      falOptions: expect.anything(),
    }));
  });

  it('opens Jimeng setup instead of rerunning saved Jimeng generations before setup is ready', async () => {
    mockState.images = [{
      ...buildCanvasMedia('jimeng-output', 'video'),
      metadata: {
        source: 'generated',
        generation: {
          kind: 'video',
          prompt: 'Rerun the saved Jimeng job',
          provider: 'jimeng',
          modelId: 'jimeng-cli/seedance-2',
          modelMode: 'video',
          jimengOptions: { seedance2JimengModelVersion: 'seedance2.0fast' },
        },
      },
    }];
    mockState.displayedImages = [...mockState.images];

    render(<App />);

    await act(async () => {
      (mockState.lastCanvasProps?.onRerunGeneration as ((imageId: string) => void) | undefined)?.('jimeng-output');
    });

    expect(await screen.findByRole('region', { name: 'Jimeng setup' })).toBeTruthy();
    expect(mockState.handleGenerate).not.toHaveBeenCalled();
  });

  it('hides the footer add button after switching away from video mode even when areas still exist', async () => {
    const { rerender } = render(<App />);

    expect(screen.getByRole('button', { name: 'Create video prompt bar' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Switch To Image' }));
    rerender(<App />);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Create video prompt bar' })).toBeNull();
    });
  });

  it('falls back to selection after switching to image mode and still submits existing embedded video prompt bars', async () => {
    const { rerender } = render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Activate Video Prompt Area' }));

    expect(screen.getByTestId('active-tool').textContent).toBe(Tool.VIDEO_PROMPT_AREA);
    expect(screen.getByTestId('video-tool-enabled').textContent).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Switch To Image' }));
    rerender(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('active-tool').textContent).toBe(Tool.SELECTION);
    });

    expect(screen.getByTestId('video-tool-enabled').textContent).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Submit Embedded Prompt' }));

    expect(mockState.handleGenerate).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'video',
      prompt: 'Existing area prompt',
      provider: 'volcengine',
      modelId: 'volcengine/seedance-2',
      modelMode: 'video',
      primaryImageId: undefined,
      videoLastFrameImageId: undefined,
      referenceImageIds: [],
      referenceVideoIds: [],
      referenceAudioIds: [],
    }));
  });

  it('submits Seedance 2 (FAL) embedded video prompt bars through Fal options', () => {
    mockState.videoPromptBars = [{
      ...mockState.baseVideoPromptBar,
      modelId: 'bytedance/seedance-2.0',
      seedance2Variant: 'reference',
      seedance2GenerateAudio: true,
    }];
    mockState.displayedVideoPromptBars = [{
      ...mockState.baseVideoPromptBar,
      modelId: 'bytedance/seedance-2.0',
      seedance2Variant: 'reference',
      seedance2GenerateAudio: true,
    }];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Submit Embedded Prompt' }));

    expect(mockState.lastCanvasProps?.embeddedVideoPromptBarModelOptions).toEqual(expect.arrayContaining([
      { value: 'volcengine/seedance-2', label: 'Seedance 2 (VE)' },
      { value: 'bytedance/seedance-2.0', label: 'Seedance 2 (FAL)' },
      { value: 'fal-ai/kling-video/v3/pro', label: 'Kling 3.0 Pro' },
      { value: 'xai/grok-imagine-video/image-to-video', label: 'Grok Imagine' },
    ]));
    expect(mockState.lastCanvasProps?.embeddedVideoPromptBarModelOptions).not.toContainEqual({
      value: 'fal-ai/wan-vision-enhancer',
      label: 'Wan Vision Enhancer',
    });
    expect(mockState.handleGenerate).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'video',
      provider: 'fal',
      modelId: 'bytedance/seedance-2.0',
      falOptions: expect.objectContaining({
        seedance2Variant: 'reference',
        seedance2GenerateAudio: true,
      }),
    }));
    expect(mockState.handleGenerate).toHaveBeenCalledWith(expect.not.objectContaining({
      volcengineOptions: expect.anything(),
    }));
  });

  it('normalizes a new embedded MiniMax H3 bar to 16:9 when Standard is selected', () => {
    const h3Bar = {
      ...mockState.baseVideoPromptBar,
      modelId: 'minimax/h3',
    };
    mockState.videoPromptBars = [h3Bar];
    mockState.displayedVideoPromptBars = [h3Bar];

    render(<App />);

    const buildControls = mockState.lastCanvasProps?.buildVideoPromptBarControls as
      | ((bar: typeof h3Bar) => Array<{ id: string; onChange?: (value: string) => void }>)
      | undefined;
    const controls = buildControls?.(h3Bar) ?? [];
    const variantControl = controls.find(control => control.id.endsWith('minimax-h3-variant-select'));
    variantControl?.onChange?.('standard');

    expect(controls.map(control => control.id)).toEqual([
      `${h3Bar.id}-minimax-h3-variant-select`,
      `${h3Bar.id}-minimax-h3-aspect-ratio-select`,
      `${h3Bar.id}-minimax-h3-duration-select`,
    ]);
    expect(mockState.setLiveVideoPromptBars).toHaveBeenCalledWith([
      expect.objectContaining({
        falOptions: expect.objectContaining({
          miniMaxH3Variant: 'standard',
          miniMaxH3AspectRatio: '16:9',
        }),
      }),
    ]);
  });

  it('submits Kling v3 embedded prompt bars through smart first and last frame overrides', () => {
    mockState.videoPromptAreas = [{ ...mockState.baseVideoPromptArea, orderedMediaIds: ['image-1', 'image-2', 'video-1'] }];
    mockState.displayedVideoPromptAreas = [{ ...mockState.baseVideoPromptArea, orderedMediaIds: ['image-1', 'image-2', 'video-1'] }];
    mockState.images = [buildCanvasMedia('image-1', 'image'), buildCanvasMedia('image-2', 'image'), buildCanvasMedia('video-1', 'video')];
    mockState.displayedImages = mockState.images;
    mockState.videoPromptBars = [{
      ...mockState.baseVideoPromptBar,
      modelId: 'fal-ai/kling-video/v3/pro',
      negativePrompt: 'avoid blur',
      klingV3MultiPrompt: 'Second embedded shot',
      klingV3Duration: '12',
      klingV3GenerateAudio: true,
      klingV3CfgScale: '0.75',
      klingV3MultiPromptEnabled: true,
      klingV3Shot1Duration: '4',
      klingV3Shot2Duration: '6',
    }];
    mockState.displayedVideoPromptBars = [...mockState.videoPromptBars];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Submit Embedded Prompt' }));

    expect(mockState.handleGenerate).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'video',
      provider: 'fal',
      modelId: 'fal-ai/kling-video/v3/pro',
      primaryImageId: 'image-1',
      videoLastFrameImageId: 'image-2',
      referenceImageIds: [],
      referenceVideoIds: [],
      referenceAudioIds: [],
      falOptions: expect.objectContaining({
        negativePrompt: 'avoid blur',
        klingV3MultiPrompt: 'Second embedded shot',
        klingV3Duration: '12',
        klingV3GenerateAudio: true,
        klingV3CfgScale: '0.75',
        klingV3MultiPromptEnabled: true,
        klingV3Shot1Duration: '4',
        klingV3Shot2Duration: '6',
      }),
    }));
  });

  it('maps the first area image into Seedance Smart primaryImageId without canvas selection', () => {
    const image1 = buildCanvasMedia('image-1', 'image');
    mockState.images = [image1];
    mockState.displayedImages = [image1];
    mockState.videoPromptAreas = [{ ...mockState.baseVideoPromptArea, orderedMediaIds: [image1.id] }];
    mockState.displayedVideoPromptAreas = [{ ...mockState.baseVideoPromptArea, orderedMediaIds: [image1.id] }];
    mockState.videoPromptBars = [{ ...mockState.baseVideoPromptBar, seedance2Variant: 'smart' }];
    mockState.displayedVideoPromptBars = [{ ...mockState.baseVideoPromptBar, seedance2Variant: 'smart' }];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Submit Embedded Prompt' }));

    expect(mockState.handleGenerate).toHaveBeenCalledWith(expect.objectContaining({
      primaryImageId: image1.id,
      videoLastFrameImageId: undefined,
      referenceImageIds: [],
      referenceVideoIds: [],
      referenceAudioIds: [],
    }));
  });

  it('maps the first two area images into Seedance Smart first and last frames', () => {
    const image1 = buildCanvasMedia('image-1', 'image');
    const image2 = buildCanvasMedia('image-2', 'image');
    mockState.images = [image1, image2];
    mockState.displayedImages = [image1, image2];
    mockState.videoPromptAreas = [{ ...mockState.baseVideoPromptArea, orderedMediaIds: [image1.id, image2.id] }];
    mockState.displayedVideoPromptAreas = [{ ...mockState.baseVideoPromptArea, orderedMediaIds: [image1.id, image2.id] }];
    mockState.videoPromptBars = [{ ...mockState.baseVideoPromptBar, seedance2Variant: 'smart' }];
    mockState.displayedVideoPromptBars = [{ ...mockState.baseVideoPromptBar, seedance2Variant: 'smart' }];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Submit Embedded Prompt' }));

    expect(mockState.handleGenerate).toHaveBeenCalledWith(expect.objectContaining({
      primaryImageId: image1.id,
      videoLastFrameImageId: image2.id,
      referenceImageIds: [],
      referenceVideoIds: [],
      referenceAudioIds: [],
    }));
  });

  it('ignores extra images and non-image assets in Seedance Smart area submissions', () => {
    const image1 = buildCanvasMedia('image-1', 'image');
    const video1 = buildCanvasMedia('video-1', 'video');
    const image2 = buildCanvasMedia('image-2', 'image');
    const audio1 = buildCanvasMedia('audio-1', 'audio');
    const image3 = buildCanvasMedia('image-3', 'image');
    mockState.images = [image1, video1, image2, audio1, image3];
    mockState.displayedImages = [image1, video1, image2, audio1, image3];
    mockState.videoPromptAreas = [{
      ...mockState.baseVideoPromptArea,
      orderedMediaIds: [image1.id, video1.id, image2.id, audio1.id, image3.id],
    }];
    mockState.displayedVideoPromptAreas = [{
      ...mockState.baseVideoPromptArea,
      orderedMediaIds: [image1.id, video1.id, image2.id, audio1.id, image3.id],
    }];
    mockState.videoPromptBars = [{ ...mockState.baseVideoPromptBar, seedance2Variant: 'smart' }];
    mockState.displayedVideoPromptBars = [{ ...mockState.baseVideoPromptBar, seedance2Variant: 'smart' }];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Submit Embedded Prompt' }));

    expect(mockState.handleGenerate).toHaveBeenCalledWith(expect.objectContaining({
      primaryImageId: image1.id,
      videoLastFrameImageId: image2.id,
      referenceImageIds: [],
      referenceVideoIds: [],
      referenceAudioIds: [],
    }));
  });

  it('limits Smart embedded canvas labels and tagged refs to the first two still images', () => {
    const image1 = buildCanvasMedia('image-1', 'image');
    const video1 = buildCanvasMedia('video-1', 'video');
    const image2 = buildCanvasMedia('image-2', 'image');
    const audio1 = buildCanvasMedia('audio-1', 'audio');
    const image3 = buildCanvasMedia('image-3', 'image');
    mockState.images = [image1, video1, image2, audio1, image3];
    mockState.displayedImages = [image1, video1, image2, audio1, image3];
    mockState.videoPromptAreas = [{
      ...mockState.baseVideoPromptArea,
      orderedMediaIds: [image1.id, video1.id, image2.id, audio1.id, image3.id],
    }];
    mockState.displayedVideoPromptAreas = [{
      ...mockState.baseVideoPromptArea,
      orderedMediaIds: [image1.id, video1.id, image2.id, audio1.id, image3.id],
    }];
    mockState.videoPromptBars = [{ ...mockState.baseVideoPromptBar, seedance2Variant: 'smart' }];
    mockState.displayedVideoPromptBars = [{ ...mockState.baseVideoPromptBar, seedance2Variant: 'smart' }];

    render(<App />);

    expect(mockState.lastCanvasProps).toEqual(expect.objectContaining({
      referenceImageIds: [image1.id, image2.id],
      referenceVideoIds: [],
      referenceAudioIds: [],
      referenceImageOrderLabels: {
        [image1.id]: '@Image1',
        [image2.id]: '@LastFrame',
      },
      disabledMediaIds: [video1.id, audio1.id, image3.id],
      videoPromptAreaMemberships: {
        'area-1': expect.objectContaining({
          primaryImageId: image1.id,
          acceptedImageIds: [],
          tailImageId: image2.id,
          acceptedVideoIds: [],
          acceptedAudioIds: [],
          ignoredMediaIds: [video1.id, audio1.id, image3.id],
          orderLabels: {
            [image1.id]: '@Image1',
            [image2.id]: '@LastFrame',
          },
        }),
      },
    }));
  });

  it('allows Seedance Smart embedded submissions with no usable area images as text-to-video', () => {
    const video1 = buildCanvasMedia('video-1', 'video');
    const audio1 = buildCanvasMedia('audio-1', 'audio');
    mockState.images = [video1, audio1];
    mockState.displayedImages = [video1, audio1];
    mockState.videoPromptAreas = [{ ...mockState.baseVideoPromptArea, orderedMediaIds: [video1.id, audio1.id] }];
    mockState.displayedVideoPromptAreas = [{ ...mockState.baseVideoPromptArea, orderedMediaIds: [video1.id, audio1.id] }];
    mockState.videoPromptBars = [{ ...mockState.baseVideoPromptBar, seedance2Variant: 'smart' }];
    mockState.displayedVideoPromptBars = [{ ...mockState.baseVideoPromptBar, seedance2Variant: 'smart' }];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Submit Embedded Prompt' }));

    expect(mockState.handleGenerate).toHaveBeenCalledWith(expect.objectContaining({
      primaryImageId: undefined,
      videoLastFrameImageId: undefined,
      referenceImageIds: [],
      referenceVideoIds: [],
      referenceAudioIds: [],
    }));
  });

  it('uses area assets as the full Seedance Reference payload without active selection', () => {
    const image1 = buildCanvasMedia('image-1', 'image');
    const video1 = buildCanvasMedia('video-1', 'video');
    const audio1 = buildCanvasMedia('audio-1', 'audio');
    mockState.images = [image1, video1, audio1];
    mockState.displayedImages = [image1, video1, audio1];
    mockState.videoPromptAreas = [{ ...mockState.baseVideoPromptArea, orderedMediaIds: [image1.id, video1.id, audio1.id] }];
    mockState.displayedVideoPromptAreas = [{ ...mockState.baseVideoPromptArea, orderedMediaIds: [image1.id, video1.id, audio1.id] }];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Submit Embedded Prompt' }));

    expect(mockState.handleGenerate).toHaveBeenCalledWith(expect.objectContaining({
      primaryImageId: undefined,
      videoLastFrameImageId: undefined,
      referenceImageIds: [image1.id],
      referenceVideoIds: [video1.id],
      referenceAudioIds: [audio1.id],
    }));
  });
});
