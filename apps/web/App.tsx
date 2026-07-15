import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Toolbar } from './components/Toolbar';
import { PromptBar } from './components/PromptBar';
import { Canvas } from './components/Canvas';
import { DEFAULT_NOTE_FONT_SIZE, MIN_NOTE_FONT_SIZE, MAX_NOTE_FONT_SIZE, MIN_STROKE_SIZE, MAX_STROKE_SIZE, KEYBOARD_STROKE_STEP } from './components/canvas/constants';
import { RecordingOverlay } from './components/RecordingOverlay';
import { BackupsModal } from './components/BackupsModal';
import {
  Tool,
  AppMode,
  ApiProviderId,
  type CanvasNote,
  type CanvasImage,
  type CanvasVideoPromptArea,
  type CanvasVideoPromptBar,
  type GenerationPlacedPayload,
  type VideoPromptAreaMembership,
} from './types';
import { FalQueuePanel } from './components/FalQueuePanel';
import { DebugLogPanel } from './components/DebugLogPanel';
import { clearDebugLogs } from './services/debugLog';
import { JimengSetupPanel } from './components/JimengSetupPanel';
import { DesktopSettingsModal } from './components/DesktopSettingsModal';
import { DesktopAppIconModal } from './components/DesktopAppIconModal';
import { PromptChatPanel } from './components/PromptChatPanel';
import {
  GROK_IMAGINE_IMAGE_MODEL_ID, // Grok Imagine model id.
  GROK_IMAGINE_VIDEO_MODEL_ID,
  isGptImage2EditModelId,
  isNanoBananaEditModelId,
  ONE_TO_ALL_ANIMATE_MODEL_ID,
  SCAIL_VIDEO_MODEL_ID,
  KLING_V3_VIDEO_MODEL_ID,
  KLING_VIDEO_MODEL_ID,
  KLING_V3_CONTROL_VIDEO_MODEL_ID,
  HAILUO_IMAGE_TO_VIDEO_MODEL_ID,
  HEYGEN_V3_LIPSYNC_MODEL_ID,
  SYNC_LIPSYNC_MODEL_ID,
  INFINITALK_VIDEO_MODEL_ID,
  VEO_31_IMAGE_TO_VIDEO_MODEL_ID,
  WAN_27_VIDEO_MODEL_ID,
  WAN_ANIMATE_MODEL_ID,
  WAN_VISION_ENHANCER_MODEL_ID,
  SEEDANCE_15_VIDEO_MODEL_ID,
  SEEDREAM_V45_MODEL_ID,
  SEEDANCE_2_VIDEO_MODEL_ID,
  FAL_SEEDANCE_2_VIDEO_MODEL_ID,
  JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
  FAL_VIDEO_MODEL_OPTIONS,
  WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID,
  WAN_27_IMAGE_DEFAULT_NEGATIVE_PROMPT,
  getFalModelLabel,
  isKlingO3VideoModelId,
  KREA_2_MAX_STYLE_REFERENCES,
  isSeedreamModelId,
} from './services/modelConfig';
import {
  buildPromptBarModelControls,
  getPromptBarModelOptions,
} from './services/promptBarConfig';
import { applyBlindTestMode, applyOpenSourceAliasMode, type BlindTestMapping } from './services/blindTestService';
import { isOverlapping } from './utils/canvasGeometry';
import { FileMenu } from './components/FileMenu';
import { ViewToolbar } from './components/ViewToolbar';
import { ProviderSwitcher } from './components/ProviderSwitcher';
import { Tooltip } from './components/Tooltip';
import { StatusBanner } from './components/StatusBanner';
import { ImageResizeToast } from './components/ImageResizeToast';
import { GenerationCanvasNotifications } from './components/GenerationCanvasNotifications';
import { useGeneration } from './hooks/useGeneration';
import { useCanvasHistory } from './hooks/useCanvasHistory';
import { useSelectionState } from './hooks/useSelectionState';
import { useFalSettings } from './hooks/useFalSettings';
import { useSnapshotIO } from './hooks/useSnapshotIO';
import { useCanvasMediaActions } from './hooks/useCanvasMediaActions';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useAudioRecording } from './hooks/useAudioRecording';
import { convertAudioBlobToWav, generateWaveformImage, loadAudioFromBlob } from './services/audioService';
import { useGenerationGuards } from './hooks/useGenerationGuards';
import { useImageResize } from './hooks/useImageResize';
import { useDuplicateCanvasMedia } from './hooks/useDuplicateCanvasMedia';
import { useKlingReferenceHelpers } from './hooks/useKlingReferenceHelpers';
import { useKlingPromptMentions } from './hooks/useKlingPromptMentions';
import { useVideoNegativePrompt } from './hooks/useVideoNegativePrompt';
import { useFalQueueJobs } from './hooks/useFalQueueJobs';
import { useDebugLogState } from './hooks/useDebugLogState';
import { useJimengSetup } from './hooks/useJimengSetup';
import { useGenerationCanvasNotifications, type GenerationCanvasNotification } from './hooks/useGenerationCanvasNotifications';
import { getBackupSession, listBackupSessions, type BackupSessionSummary } from './services/backupService';
import { createDesktopSnapshotSource } from './services/desktopSnapshotSource';
import { writeClipboardText } from './services/clipboardService';
import type { FalModelMode } from './services/modelConfig';
import {
  buildEffectiveSeedanceReferenceIds,
  SEEDANCE_REFERENCE_AUDIO_LIMIT,
  SEEDANCE_REFERENCE_IMAGE_LIMIT,
  SEEDANCE_REFERENCE_VIDEO_LIMIT,
} from './utils/seedanceReferences';
import {
  buildEmbeddedVideoGenerationOverrides,
  buildVideoPromptAreaMembership,
  getEmbeddedVideoPromptBarModelId,
  getVideoPromptAreaCapabilityProfile,
  isUsableVideoPromptAreaModel,
  getAreaPromptBarRect,
} from './utils/videoPromptAreas';
import {
  buildEmbeddedVideoGenerationProviderInput,
  getEmbeddedBarFalOptions,
  isJimengEmbeddedVideoModel,
} from './utils/embeddedVideoRouting';
import { markCanvasMediaStoppedByIds, stopCanvasMediaPlaybackByIds } from './utils/canvasMediaPlayback';
import { getCanvasImagePrompt } from './utils/canvasImagePrompt';
import { applyGenerationPlacementSelection } from './utils/generationPlacementSelection';
import { FLOATING_EDGE_CONTROL_SIDE_OFFSET } from './utils/promptBarFooterLayout';
import { OVERLAY_LAYER_CLASS_NAMES } from './utils/overlayLayers';
import { PlusIcon } from './components/Icons';
import {
  EMPTY_CAMERA_SELECTION,
  buildCameraPromptPrefix,
  cloneCameraSelection,
  hasCameraSettings,
  type CameraSettingsSelection,
} from './utils/cameraSettings';
import { getRuntimeConfig, hasRuntimeConfigValue, type DesktopFileMenuCommand, type DesktopSettingsStatus } from './services/runtimeConfig';

// Type alias for API providers
type ApiProvider = ApiProviderId;
// Defines preferred order of API providers
const PROVIDER_ORDER: ReadonlyArray<ApiProviderId> = ['google', 'fal'];
const runtimeConfig = getRuntimeConfig(); // Shared Vite/Electron configuration snapshot.
const shouldAutoOpenDesktopOnboarding = (status: DesktopSettingsStatus): boolean =>
  status.isPackaged && status.fields.FAL_API_KEY?.present !== true; // Startup onboarding only requires the Fal key.
// Detect which API providers are usable based on available API keys in env.
const providerAvailability: Record<ApiProvider, boolean> = {
  google: hasRuntimeConfigValue(runtimeConfig.geminiApiKey ?? runtimeConfig.apiKey),
  fal: true,
};

// Determine available API providers based on environment, assign user-friendly labels, and set default provider.
const AVAILABLE_PROVIDERS = PROVIDER_ORDER.filter(provider => providerAvailability[provider]) as ApiProvider[]; // List of enabled providers
const PROVIDER_LABELS: Record<ApiProvider, string> = { google: 'Google', fal: 'FAL' }; // Mapping of provider IDs to display names
const DEFAULT_API_PROVIDER: ApiProvider = AVAILABLE_PROVIDERS[0] ?? 'google'; // Default provider (first available or fallback)
const clampStrokeSize = (value: number) => Math.min(MAX_STROKE_SIZE, Math.max(MIN_STROKE_SIZE, value));
const normalizeKrea2StyleStrength = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  const rounded = Number.isFinite(parsed) ? Math.round(parsed * 10) / 10 : 1; // Krea sliders move by tenths.
  return Math.min(2, Math.max(-2, rounded));
};
const areKrea2StrengthMapsEqual = (left: Record<string, number>, right: Record<string, number>): boolean => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every(key => left[key] === right[key]);
};
const formatZoomPercentage = (scale: number): string => {
  const percentage = scale * 100;
  if (percentage < 10) {
    return `${percentage.toFixed(1).replace(/\.0$/, '')}%`;
  }
  return `${Math.round(percentage)}%`;
}; // Lower zoom levels keep one decimal so tiny changes stay legible in the badge.

// Root component wires up canvas state, generation controls, and provider-specific settings.
export default function App() {
  const [appMode, setAppMode] = useState<AppMode>('CANVAS');
  const [tool, setTool] = useState<Tool>(Tool.PAN);
  const [brushSize, setBrushSize] = useState(20);
  const [eraserSize, setEraserSize] = useState(20);
  const [brushColor, setBrushColor] = useState('#ff0000');
  const [prompt, setPrompt] = useState('');
  const [activeEmbeddedPromptBarId, setActiveEmbeddedPromptBarId] = useState<string | null>(null);
  const [selectedVideoPromptAreaId, setSelectedVideoPromptAreaId] = useState<string | null>(null);
  const [cameraSettings, setCameraSettings] = useState<CameraSettingsSelection>(
    () => cloneCameraSelection(EMPTY_CAMERA_SELECTION),
  );

  // Canvas state/history: manages undo/redo, staged edits, and exposes current media slices
  const {
    images,                // Committed canvas images
    paths,                 // Committed drawing paths (brush/annotate)
    notes,                 // Committed notes
    videoPromptAreas,      // Committed video prompt areas
    videoPromptBars,       // Committed video prompt bars
    displayedImages,       // Images currently displayed (may include live edits)
    displayedPaths,        // Paths currently displayed (may include live edits)
    displayedNotes,        // Notes currently displayed (may include live edits)
    displayedVideoPromptAreas, // Areas currently displayed (may include live edits)
    displayedVideoPromptBars, // Bars currently displayed (may include live edits)
    setState,              // Update state with undo/redo support
    setLiveImages,         // Stage in-progress edits to images
    setLivePaths,          // Stage in-progress edits to paths
    setLiveNotes,          // Stage in-progress edits to notes
    setLiveVideoPromptAreas, // Stage in-progress area edits
    setLiveVideoPromptBars, // Stage in-progress prompt bar edits
    commit: handleCommit,  // Commit staged (live) edits as a new history entry
    replaceState,          // Replace current snapshot without adding undo depth
    undo,                  // Undo last committed action
    redo,                  // Redo last undone action
    canUndo,               // Whether undo is currently possible
    canRedo,               // Whether redo is currently possible
    resetHistory,          // Reset canvas state and undo/redo stack
  } = useCanvasHistory({ images: [], paths: [], notes: [], videoPromptAreas: [], videoPromptBars: [] });

  // Brush/annotate layers (paths) are the only things we clear with the eraser button.
  const hasClearablePaths = displayedPaths.some(
    path =>
      path.tool === Tool.ANNOTATE &&
      path.points.length > 0
  );
  // State for note editing (currently edited note's ID or null if none)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const pendingNoteEditIdRef = useRef<string | null>(null);

  // State to track if the app is currently performing a loading operation
  const [isLoading, setIsLoading] = useState(false);

  // State for error message display (null if no error)
  const [error, setError] = useState<string | null>(null);

  // Triggers to control zoom-to-fit, zoom-to-selection, zoom-in, and zoom-out actions (increment to trigger effect)
  const [zoomToFitTrigger, setZoomToFitTrigger] = useState(0);
  const [zoomToSelectionTrigger, setZoomToSelectionTrigger] = useState(0);
  const [zoomInTrigger, setZoomInTrigger] = useState(0);
  const [zoomOutTrigger, setZoomOutTrigger] = useState(0);
  const [canvasScale, setCanvasScale] = useState(1);
  const [showZoomLevelBadge, setShowZoomLevelBadge] = useState(true);
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const retryingFalJobIdsRef = useRef(new Set<string>());

  // State for transient toast message notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isPromptChatOpen, setIsPromptChatOpen] = useState(false);
  const {
    notifications: generationCanvasNotifications,
    notifyGenerationPlaced,
    dismissGenerationNotification,
  } = useGenerationCanvasNotifications();

  // State for currently selected API provider (e.g., 'google', 'fal')
  const [apiProvider, setApiProvider] = useState<ApiProvider>(DEFAULT_API_PROVIDER);

  // FAL job queue state + auto-dismiss handling.
  const { falJobs, setFalJobs, dismissFalJob: handleDismissFalJob } = useFalQueueJobs();

  // FAL model and option state/handlers (image/video mode, variants, sliders, etc.)
  const fal = useFalSettings({ apiProvider });
  const isEmbeddedJimengSeedanceModelActive = displayedVideoPromptBars.some(bar => (
    isJimengEmbeddedVideoModel(getEmbeddedVideoPromptBarModelId(bar.modelId))
  )); // Embedded bars can use JM CLI even when the footer model does not.
  const isJimengSeedanceModelSelected = apiProvider === 'fal' && fal.isJimengSeedance2VideoModel;
  const jimengSetup = useJimengSetup({
    isSetupRequired: isJimengSeedanceModelSelected || isEmbeddedJimengSeedanceModelActive,
    isSelectedModelActive: isJimengSeedanceModelSelected,
    onBeforeClearCache: () => setIsFileMenuOpen(false),
    setError,
    setToastMessage,
  });

  // Audio recording state
  const {
    isRecording,
    recordingDuration,
    startRecording,
    stopRecording,
    error: recordingError,
  } = useAudioRecording();

  const {
    videoNegativePrompt,
    setVideoNegativePrompt,
    shouldShowVideoNegativePrompt,
  } = useVideoNegativePrompt({ isVideoMode: fal.isVideoMode, falVideoModelId: fal.falVideoModelId });

  // Negative prompt state for Wan 2.7 Pro Image model
  const [wan27ImageNegativePrompt, setWan27ImageNegativePrompt] = useState<string>(WAN_27_IMAGE_DEFAULT_NEGATIVE_PROMPT);
  const generationNegativePrompt = fal.isWan27ImageModel ? wan27ImageNegativePrompt : videoNegativePrompt; // Route active negative prompt into generation.

  // Toggles display of metadata overlays on canvas images
  const [showMetadataOverlay, setShowMetadataOverlay] = useState(false);

  // Blind test mode: anonymizes model names in dropdowns with random codenames
  const [blindTestEnabled, setBlindTestEnabled] = useState(false);
  const [openSourceAliasEnabled, setOpenSourceAliasEnabled] = useState(false);
  const blindTestMappingRef = useRef<BlindTestMapping>(new Map());
  const handleBlindTestClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.altKey) {
      setOpenSourceAliasEnabled(prev => {
        const next = !prev;
        if (next) {
          setBlindTestEnabled(false);
        }
        return next;
      });
      return;
    }
    setBlindTestEnabled(prev => {
      const next = !prev;
      if (next) {
        setOpenSourceAliasEnabled(false);
      }
      return next;
    });
  }, []);

  // State for toggling the file menu and debug log panels
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [isDesktopSettingsOpen, setIsDesktopSettingsOpen] = useState(false);
  const [isDesktopAppIconOpen, setIsDesktopAppIconOpen] = useState(false);
  const [desktopSettingsMode, setDesktopSettingsMode] = useState<'onboarding' | 'manage'>('manage'); // Auto-open hides advanced setup fields.
  const [desktopSettingsStatus, setDesktopSettingsStatus] = useState<DesktopSettingsStatus | null>(null);
  const hasDesktopSettingsBridge = typeof window !== 'undefined' && Boolean(window.canvaBananaDesktop?.getSettingsStatus);
  const hasDesktopAppIconBridge = typeof window !== 'undefined' && Boolean(window.canvaBananaDesktop?.appIcon?.getState);
  // Autosave is opt-out; user can disable it in the file menu.
  const [autosaveEnabled, setAutosaveEnabled] = useState(true);
  // Increment after each successful generation to trigger autosave.
  const [generationTick, setGenerationTick] = useState(0);
  const [isBackupsOpen, setIsBackupsOpen] = useState(false);
  const [backupSessions, setBackupSessions] = useState<BackupSessionSummary[]>([]);
  const [isBackupsLoading, setIsBackupsLoading] = useState(false);
  const closeAppOwnedBlockingOverlays = useCallback(() => {
    setIsFileMenuOpen(false);
    setIsBackupsOpen(false);
    setIsDesktopSettingsOpen(false);
    setIsDesktopAppIconOpen(false);
  }, []); // Keep native menu modal switches single-dialog.
  const {
    isDebugLogOpen,
    debugLogEntries,
    openDebugLogPanel,
    closeDebugLogPanel,
    copyLastEntry,
  } = useDebugLogState({
    onOpen: closeAppOwnedBlockingOverlays,
  });
  const openAppOwnedBlockingOverlay = useCallback((overlay: 'backups' | 'desktopSettings' | 'desktopAppIcon') => {
    closeDebugLogPanel();
    closeAppOwnedBlockingOverlays();
    if (overlay === 'backups') {
      setIsBackupsOpen(true);
    } else if (overlay === 'desktopSettings') {
      setIsDesktopSettingsOpen(true);
    } else {
      setIsDesktopAppIconOpen(true);
    }
  }, [closeAppOwnedBlockingOverlays, closeDebugLogPanel]); // Open one blocking modal at a time.
  const hasBlockingOverlay = isFileMenuOpen || isBackupsOpen || isDesktopSettingsOpen || isDesktopAppIconOpen || isDebugLogOpen; // Overlays own focus and pointer input.

  // Callbacks to programmatically trigger zoom in/out from controls
  const requestZoomIn = useCallback(() => {
    setZoomInTrigger(prev => prev + 1);
  }, []);
  const requestZoomOut = useCallback(() => {
    setZoomOutTrigger(prev => prev + 1);
  }, []);

  const handleAdjustStrokeSize = useCallback((delta: number) => {
    const adjustedDelta = delta * KEYBOARD_STROKE_STEP;
    if (tool === Tool.BRUSH) {
      setBrushSize(prev => clampStrokeSize(prev + adjustedDelta));
      return;
    }
    if (tool === Tool.ERASE) {
      setEraserSize(prev => clampStrokeSize(prev + adjustedDelta));
    }
  }, [tool]);

  // Shows a toast when the reference image limit is reached for the current model.
  const isKlingO3VideoInputMode = fal.isKlingO3EditMode;
  const showReferenceLimitToast = useCallback((maxReferenceImages: number) => {
    const usingFalProvider = apiProvider === 'fal'; // Fal-only messages require active Fal provider.
    if (usingFalProvider && isKlingO3VideoModelId(fal.falModelId)) {
      const variantLabel = fal.isKlingO3EditMode ? 'Kling O3 Edit' : 'Kling O3 Reference';
      setToastMessage(`${variantLabel} supports up to 5 images total (source + references + elements). Slots remaining: ${Math.max(0, maxReferenceImages)} for references/elements.`);
      setTimeout(() => setToastMessage(null), 2000);
      return;
    }
    if (usingFalProvider && fal.falModelId === GROK_IMAGINE_IMAGE_MODEL_ID) {
      setToastMessage('Grok Imagine supports only 1 image total. Shift-click reference images aren\'t supported.');
      setTimeout(() => setToastMessage(null), 4000);
      return;
    }
    if (usingFalProvider && fal.falModelId === ONE_TO_ALL_ANIMATE_MODEL_ID && maxReferenceImages === 0) {
      setToastMessage('Tip: Shift-click toggles reference selection. For One-to-All Animation, click the pose video, then click the image to animate (Cmd/Ctrl+click for multi-select).');
      setTimeout(() => setToastMessage(null), 2000);
      return;
    }
    if (usingFalProvider && fal.falModelId === SEEDREAM_V45_MODEL_ID && maxReferenceImages >= 10) {
      setToastMessage('Seedream 4.5 only accepts up to 10 reference images.');
      setTimeout(() => setToastMessage(null), 2000);
      return;
    }
    if (usingFalProvider && fal.falModelId === WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID) {
      setToastMessage('Wan 2.7 Pro Image supports up to 4 images total (1 primary + 3 references). Use @Image1, @Image2, etc. in your prompt to reference them.');
      setTimeout(() => setToastMessage(null), 4000);
      return;
    }
    if (usingFalProvider && isGptImage2EditModelId(fal.falModelId)) {
      const message = maxReferenceImages <= 8
        ? 'GPT Image 2 annotate supports up to 8 references because the annotation canvas counts as an input.'
        : 'GPT Image 2 supports up to 10 images total (1 primary + 9 references).';
      setToastMessage(message);
      setTimeout(() => setToastMessage(null), 4000);
      return;
    }
    if (usingFalProvider && fal.isKrea2LargeModel) {
      setToastMessage(`Krea 2 Large supports up to ${KREA_2_MAX_STYLE_REFERENCES} style references.`);
      setTimeout(() => setToastMessage(null), 4000);
      return;
    }
    const totalLimit = maxReferenceImages + 1;
    const referenceLimitLabel = usingFalProvider ? getFalModelLabel(fal.falModelId) : PROVIDER_LABELS.google; // Match label to active provider.
    setToastMessage(`${referenceLimitLabel} supports up to ${maxReferenceImages} reference images (${totalLimit} total including the primary).`);
    setTimeout(() => setToastMessage(null), 2000);
  }, [apiProvider, fal.falModelId, fal.isKlingO3EditMode, fal.isKrea2LargeModel, setToastMessage]);

  const isKlingO3ReferenceMode = fal.isKlingO3VideoModel && fal.klingO3Variant === 'reference';
  const isVeo31TailCapable = fal.isVeo31VideoModel && fal.veo31Variant === 'i2v-fflf';
  const isVeo31ExtendMode = fal.isVeo31VideoModel && fal.veo31Variant === 'extend';
  const isScailVideoModel = fal.isVideoMode && fal.falVideoModelId === SCAIL_VIDEO_MODEL_ID;
  const isWan27ReferenceMode = fal.isWan27VideoModel && fal.wan27VideoVariant === 'reference'; // Wan Reference labels tagged image/video refs.
  const isWan27EditMode = fal.isWan27VideoModel && fal.wan27VideoVariant === 'edit'; // Wan Edit uses a source video instead of an end frame.
  const supportsTailFrameSelection = fal.isKlingProVideoSelection
    || fal.isKlingV3VideoModel
    || isKlingO3ReferenceMode
    || isVeo31TailCapable
    || (fal.isWan27VideoModel && !isWan27ReferenceMode && !isWan27EditMode)
    || fal.isSeedance15VideoModel
    || (fal.isSeedance2VideoModel && !fal.isJimengSeedance2VideoModel && fal.seedance2Variant === 'smart'); // End-frame capable modes.
  const referenceImageSlotOffset = isGptImage2EditModelId(fal.falModelId) && tool === Tool.ANNOTATE ? 1 : 0; // Annotate uploads one extra input image.
  const isActiveKrea2LargeModel = apiProvider === 'fal' && fal.isKrea2LargeModel; // Krea behavior only applies while Fal is active.

  // Tracks which images/notes are selected and enforces model-specific selection rules (reference limits, primary frames).
  const selection = useSelectionState({
    images,
    apiProvider,
    fal,
    referenceImageSlotOffset,
    onError: setError,
    onReferenceLimit: showReferenceLimitToast,
  });

  const {
    selectedImageIds,
    selectedNoteIds,
    referenceImageIds,
    referenceVideoIds,
    referenceAudioIds,
    seedanceReferenceOrderIds,
    elementImageIds,
    videoLastFrameImageId,
    sourceVideoId,
    sourceAudioId,
    primaryImageId,
    primarySelectionMediaType,
    activePrimaryImage,
    hasSingleImageSelected,
    setSelectedImageIds,
    setSelectedNoteIds,
    setReferenceImageIds,
    setReferenceVideoIds,
    setReferenceAudioIds,
    setElementImageIds,
    setVideoLastFrameImageId,
    setSourceVideoId,
    setSourceAudioId,
    handleImageSelection,
    handleNoteSelection,
    replaceCanvasSelection,
  } = selection;

  const [krea2StyleReferenceStrengths, setKrea2StyleReferenceStrengths] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!isActiveKrea2LargeModel) {
      setKrea2StyleReferenceStrengths(prev => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    const activeReferenceIds = referenceImageIds.slice(0, KREA_2_MAX_STYLE_REFERENCES);
    setKrea2StyleReferenceStrengths(prev => {
      const next = Object.fromEntries(activeReferenceIds.map(id => [id, normalizeKrea2StyleStrength(prev[id] ?? 1)]));
      return areKrea2StrengthMapsEqual(prev, next) ? prev : next;
    });
  }, [isActiveKrea2LargeModel, referenceImageIds]);
  const handleKrea2StyleReferenceStrengthChange = useCallback((imageId: string, value: number) => {
    setKrea2StyleReferenceStrengths(prev => ({ ...prev, [imageId]: normalizeKrea2StyleStrength(value) }));
  }, []);

  const requestZoomToSelection = useCallback(() => {
    if (selectedImageIds.length === 0 && selectedNoteIds.length === 0) {
      return;
    }
    setZoomToSelectionTrigger(prev => prev + 1);
  }, [selectedImageIds.length, selectedNoteIds.length]);

  const handleVideoPromptAreasChange = useCallback((nextAreas: CanvasVideoPromptArea[]) => {
    setLiveVideoPromptAreas(nextAreas);
  }, [setLiveVideoPromptAreas]);

  const handleVideoPromptBarsChange = useCallback((nextBars: CanvasVideoPromptBar[]) => {
    setLiveVideoPromptBars(nextBars);
  }, [setLiveVideoPromptBars]);

  const handleCreateVideoPromptBar = useCallback(() => {
    if (displayedVideoPromptAreas.length === 0) {
      return;
    }
    const selectedArea = selectedVideoPromptAreaId
      ? displayedVideoPromptAreas.find(area => area.id === selectedVideoPromptAreaId) ?? null
      : null;
    const targetArea = selectedArea && !selectedArea.promptBarId
      ? selectedArea
      : [...displayedVideoPromptAreas].reverse().find(area => !area.promptBarId) ?? null;
    if (!targetArea) {
      setError('Each video prompt area already has a prompt bar.');
      return;
    }
    const snappedRect = getAreaPromptBarRect(targetArea);
    const newBar: CanvasVideoPromptBar = {
      id: crypto.randomUUID(),
      assignedAreaId: targetArea.id,
      prompt: '',
      negativePrompt: '',
      modelId: fal.isSeedance2VideoModel ? fal.falVideoModelId : SEEDANCE_2_VIDEO_MODEL_ID,
      seedance2Variant: 'reference',
      seedance2JimengModelVersion: fal.seedance2JimengModelVersion,
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
      ...snappedRect,
    };
    setState(prevState => ({
      ...prevState,
      videoPromptAreas: prevState.videoPromptAreas.map(area => (
        area.id === targetArea.id ? { ...area, promptBarId: newBar.id } : area
      )),
      videoPromptBars: [...prevState.videoPromptBars, newBar],
    }));
  }, [displayedVideoPromptAreas, fal.falVideoModelId, fal.isSeedance2VideoModel, fal.seedance2JimengModelVersion, selectedVideoPromptAreaId, setError, setState]);

  const handleEmbeddedPromptBarUpdate = useCallback((barId: string, updater: (bar: CanvasVideoPromptBar) => CanvasVideoPromptBar) => {
    setLiveVideoPromptBars(displayedVideoPromptBars.map(bar => (
      bar.id === barId ? updater(bar) : bar
    )));
  }, [displayedVideoPromptBars, setLiveVideoPromptBars]);

  useEffect(() => {
    if (!selectedVideoPromptAreaId) {
      return;
    }
    const hasSelectedArea = displayedVideoPromptAreas.some(area => area.id === selectedVideoPromptAreaId);
    if (!hasSelectedArea) {
      setSelectedVideoPromptAreaId(null);
    }
  }, [displayedVideoPromptAreas, selectedVideoPromptAreaId]);

  const hasSelectedStillImage = useMemo(
    () => selectedImageIds.some(id => images.find(img => img.id === id)?.mediaType === 'image'),
    [images, selectedImageIds],
  );
  // Handles snapshot import/export so canvases can be saved, loaded, or shared.
  const {
    exportSnapshot: handleExportSnapshot,
    importSnapshotFromFile: handleImportSnapshotFromFile,
    importSnapshotWithPicker,
    autosaveSnapshot,
  } = useSnapshotIO({
    ui: {
      appMode,
      tool,
      brushSize,
      eraserSize,
      brushColor,
      prompt,
      apiProvider,
      setAppMode,
      setTool,
      setBrushSize,
      setEraserSize,
      setBrushColor,
      setPrompt,
      setApiProvider,
      setError,
      setToastMessage,
      setIsFileMenuOpen,
    },
    fal,
    selection,
    displayedImages,
    displayedNotes,
    displayedPaths,
    displayedVideoPromptAreas,
    displayedVideoPromptBars,
    resetHistory,
    providerAvailability,
    availableProviders: AVAILABLE_PROVIDERS,
    autosaveEnabled,
  });
  // Keep latest autosave function in a ref to avoid effect churn.
  const autosaveSnapshotRef = useRef(autosaveSnapshot);

  // Canvas media utilities: uploads, cropping, transforms, downloads, and background removal.
  const {
    cropMode,
    transformMode,
    isRemovingBackground,
    handleFilesDrop,
    handleFileChange,
    handleDownload,
    handleBackgroundRemoval,
    handleStartCrop,
    handleCropRectChange,
    handleConfirmCrop,
    handleCancelCrop,
    handleStartTransform,
    handleExitTransform,
  } = useCanvasMediaActions({
    images,
    displayedImages,
    hasSingleImageSelected,
    primaryImageId,
    setState,
    setSelectedImageIds,
    setSelectedNoteIds,
    setReferenceImageIds,
    setTool,
    setError,
    setToastMessage,
    setLiveImages,
    handleCommit,
  });

  const {
    isOpen: isResizeToastOpen,
    width: resizeWidth,
    height: resizeHeight,
    keepAspect: resizeKeepAspect,
    isProcessing: isResizing,
    canResize,
    open: openResizeToast,
    cancel: cancelResizeToast,
    setWidth: setResizeWidth,
    setHeight: setResizeHeight,
    setKeepAspect: setResizeKeepAspect,
    confirm: confirmResize,
  } = useImageResize({
    images,
    selectedImageIds,
    setState,
    handleCommit,
    setToastMessage,
    setError,
  });

  const {
    duplicateNote: handleDuplicateNote,
    duplicateImage: handleDuplicateImage,
  } = useDuplicateCanvasMedia({
    displayedImages,
    displayedNotes,
    setState,
    setSelectedImageIds,
    setSelectedNoteIds,
    setReferenceImageIds,
    setVideoLastFrameImageId,
  });

  // Clear video last frame selection if not in a first/last-frame capable mode
  useEffect(() => {
    if (!supportsTailFrameSelection && videoLastFrameImageId) { // Drop last-frame selection when not supported.
      setVideoLastFrameImageId(null);
    }
  }, [supportsTailFrameSelection, videoLastFrameImageId]); // Sync end-frame selection with capabilities.

  const handleModelModeChange = useCallback((mode: FalModelMode) => {
    fal.handleModelModeChange(mode);
    // Model mode changes can invalidate reference selections, so reset them.
    setReferenceImageIds([]);
  }, [fal.handleModelModeChange, setReferenceImageIds]);
  const canCreateVideoPromptAreas = fal.isVideoMode && fal.falVideoModelId !== WAN_VISION_ENHANCER_MODEL_ID;
  const shouldShowVideoPromptBarAccessory = fal.isVideoMode && displayedVideoPromptAreas.length > 0;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const snapshotInputRef = useRef<HTMLInputElement>(null);

  const handleClear = useCallback(() => {
    setState(prevState => ({ ...prevState, paths: [] }));
  }, [setState]);

  const handleModeChange = useCallback((newMode: AppMode) => {
    if (newMode === appMode) return;

    setAppMode(newMode);
    // Switching modes discards existing brush/annotate strokes so tools stay scoped to the active mode.
    handleClear();
    if (newMode === 'CANVAS') {
      setTool(Tool.PAN);
    } else { // ANNOTATE
      setTool(Tool.BRUSH);
    }
  }, [appMode, handleClear]);

  const handleDelete = useCallback(() => {
    if (selectedImageIds.length === 0 && selectedNoteIds.length === 0) {
      return;
    }

    stopCanvasMediaPlaybackByIds(images, selectedImageIds); // Stop videos/audio before their canvas nodes disappear.

    // Remove selected images/notes while keeping other canvas content untouched.
    setState(prevState => ({
      ...prevState,
      images: selectedImageIds.length
        ? prevState.images.filter(img => !selectedImageIds.includes(img.id))
        : prevState.images,
      notes: selectedNoteIds.length
        ? prevState.notes.filter(note => !selectedNoteIds.includes(note.id))
        : prevState.notes,
      videoPromptAreas: prevState.videoPromptAreas.map(area => ({
        ...area,
        orderedMediaIds: area.orderedMediaIds.filter(mediaId => !selectedImageIds.includes(mediaId)),
      })),
    }));

    if (selectedImageIds.length) {
      setSelectedImageIds([]);
      setReferenceImageIds([]);
      setElementImageIds([]);
      setVideoLastFrameImageId(null);
    }
    if (selectedNoteIds.length) {
      setSelectedNoteIds([]);
    }
  }, [images, selectedImageIds, selectedNoteIds, setState]);

  const handleMediaPlaybackRejected = useCallback((imageId: string) => {
    setLiveImages((currentImages: CanvasImage[] | null) =>
      currentImages ? markCanvasMediaStoppedByIds(currentImages, [imageId]) : currentImages
    ); // Keep any staged image slice consistent with the paused DOM element.
    replaceState(prevState => ({
      ...prevState,
      images: markCanvasMediaStoppedByIds(prevState.images, [imageId]),
    })); // Repair the active history snapshot without creating an undo step.
  }, [replaceState, setLiveImages]);

  const handleZoomToFit = useCallback(() => {
    setZoomToFitTrigger(c => c + 1);
  }, []);

  // Handle audio recording toggle
  const handleRecordToggle = useCallback(async () => {
    if (isRecording) {
      const audioBlob = await stopRecording();
      if (audioBlob) {
        try {
          const wavBlob = await convertAudioBlobToWav(audioBlob);
          // Generate waveform from the recording
          const displayWidth = 400;
          const displayHeight = 80;
          const audioElement = await loadAudioFromBlob(wavBlob);
          const { dataUrl: waveformImageData, duration } = await generateWaveformImage(
            wavBlob,
            displayWidth,
            displayHeight
          );

          // Create waveform image element
          const waveformImg = new Image();
          await new Promise<void>((resolve, reject) => {
            waveformImg.onload = () => resolve();
            waveformImg.onerror = () => reject(new Error('Failed to load waveform image'));
            waveformImg.src = waveformImageData;
          });

          // Create the audio file
          const file = new File([wavBlob], `recording-${Date.now()}.wav`, { type: wavBlob.type });

          // Add to canvas at center
          const newCanvasAudio = {
            id: crypto.randomUUID(),
            element: waveformImg,
            mediaType: 'audio' as const,
            x: (window.innerWidth / 2) - (displayWidth / 2),
            y: (window.innerHeight / 2) - (displayHeight / 2),
            width: displayWidth,
            height: displayHeight,
            rotation: 0,
            naturalWidth: displayWidth,
            naturalHeight: displayHeight,
            file,
            isPlaying: false,
            hasAudio: true,
            audioElement,
            waveformImageData,
            audioDuration: duration,
            currentPlaybackTime: 0,
            metadata: { source: 'imported' as const },
          };

          setState(prevState => ({
            ...prevState,
            images: [...prevState.images, newCanvasAudio],
          }));
          setSelectedImageIds([newCanvasAudio.id]);
          setSelectedNoteIds([]);
          setReferenceImageIds([]);
          setTool(Tool.SELECTION);
          setToastMessage('Recording saved');
          setTimeout(() => setToastMessage(null), 2000);
        } catch (err) {
          console.error('Failed to process recording:', err);
          setError('Failed to process recording.');
        }
      }
    } else {
      await startRecording();
    }
  }, [isRecording, stopRecording, startRecording, setState, setTool]);

  // Propagate recording errors to main error state
  useEffect(() => {
    if (recordingError) {
      setError(recordingError);
    }
  }, [recordingError]);

  // Allow stacking order tweaks without re-rendering everything else.
  const handleImageOrderChange = useCallback((imageId: string, direction: 'up' | 'down') => {
    setState(prevState => {
      const newImages = [...prevState.images];
      const index = newImages.findIndex(img => img.id === imageId);

      if (direction === 'up' && index < newImages.length - 1) {
        [newImages[index], newImages[index + 1]] = [newImages[index + 1], newImages[index]];
      } else if (direction === 'down' && index > 0) {
        [newImages[index], newImages[index - 1]] = [newImages[index - 1], newImages[index]];
      }

      return { ...prevState, images: newImages };
    });
  }, [setState]);

  const handleNoteCopy = useCallback((noteId: string) => {
    const note = displayedNotes.find(n => n.id === noteId);
    if (note && note.text) {
      writeClipboardText(note.text)
        .then(() => {
          setToastMessage("Copied to clipboard!");
          setTimeout(() => setToastMessage(null), 2000);
        })
        .catch(err => {
          console.error('Failed to copy text: ', err);
          setToastMessage("Failed to copy text.");
          setTimeout(() => setToastMessage(null), 2000);
        });
    }
  }, [displayedNotes]);

  const handleImagePromptCopy = useCallback((imageId: string) => {
    const image = displayedImages.find(img => img.id === imageId);
    const promptText = getCanvasImagePrompt(image);

    if (!promptText) {
      setToastMessage('No prompt found for this media.');
      setTimeout(() => setToastMessage(null), 2000);
      return;
    }

    writeClipboardText(promptText)
      .then(() => {
        setToastMessage('Prompt copied to clipboard!');
        setTimeout(() => setToastMessage(null), 2000);
      })
      .catch(err => {
        console.error('Failed to copy prompt: ', err);
        setToastMessage('Failed to copy prompt.');
        setTimeout(() => setToastMessage(null), 2000);
      });
  }, [displayedImages]);

  const handleSnapshotFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImportSnapshotFromFile(file).catch(err => {
        console.error(err);
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Failed to import snapshot.');
        }
      });
    }
    e.target.value = '';
  }, [handleImportSnapshotFromFile, setError]);

  const closeFileMenu = useCallback(() => {
    setIsFileMenuOpen(false);
  }, []);

  const toggleFileMenu = useCallback(() => {
    setIsFileMenuOpen(prev => !prev);
  }, []);

  // Toggle autosave setting from the hamburger menu.
  const handleToggleAutosave = useCallback(() => {
    setAutosaveEnabled(prev => !prev);
  }, []);

  const handleToggleZoomLevelBadge = useCallback(() => {
    setShowZoomLevelBadge(prev => !prev);
  }, []);
  const handleTogglePresentationMode = useCallback(() => {
    setIsPresentationMode(prev => !prev);
  }, []);

  const handleGenerationComplete = useCallback(() => {
    setGenerationTick(prev => prev + 1);
  }, []);

  const handleGenerationNotificationActivate = useCallback((notification: GenerationCanvasNotification) => {
    const targetIds = new Set(notification.mediaIds);
    const existingTargetIds = images.filter(image => targetIds.has(image.id)).map(image => image.id);
    dismissGenerationNotification(notification.id);
    if (existingTargetIds.length === 0) {
      setToastMessage('Generation is no longer on the canvas.');
      setTimeout(() => setToastMessage(null), 2000);
      return;
    }
    applyGenerationPlacementSelection(notification, {
      setSelectedImageIds,
      setSelectedNoteIds,
      setReferenceImageIds,
      setReferenceVideoIds,
      setReferenceAudioIds,
      setElementImageIds,
      setVideoLastFrameImageId,
      setSourceVideoId,
      setSourceAudioId,
      setSelectedVideoPromptAreaId,
      setTool, // Click-to-view returns the canvas to direct selection.
    }, { mediaIds: existingTargetIds, preserveVideoSourceState: notification.mediaType === 'video' });
    setZoomToSelectionTrigger(prev => prev + 1);
  }, [
    dismissGenerationNotification,
    images,
    setElementImageIds,
    setReferenceAudioIds,
    setReferenceImageIds,
    setReferenceVideoIds,
    setSelectedImageIds,
    setSelectedNoteIds,
    setSelectedVideoPromptAreaId,
    setSourceAudioId,
    setSourceVideoId,
    setTool,
    setVideoLastFrameImageId,
  ]);

  const handleGenerationPlaced = useCallback((payload: GenerationPlacedPayload) => {
    notifyGenerationPlaced(payload); // Arrival only announces the media; selection changes after an explicit user action.
  }, [notifyGenerationPlaced]);

  const openBackupsModal = useCallback(() => {
    openAppOwnedBlockingOverlay('backups');
  }, [openAppOwnedBlockingOverlay]);

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
  }, [openAppOwnedBlockingOverlay, refreshDesktopSettingsStatus]);

  const openDesktopAppIcon = useCallback(() => {
    if (hasDesktopAppIconBridge) {
      openAppOwnedBlockingOverlay('desktopAppIcon');
    }
  }, [hasDesktopAppIconBridge, openAppOwnedBlockingOverlay]);

  useEffect(() => {
    return window.canvaBananaDesktop?.onOpenManageKeys?.(openDesktopSettings);
  }, [openDesktopSettings]);

  const closeBackupsModal = useCallback(() => {
    setIsBackupsOpen(false);
  }, []);

  const refreshBackups = useCallback(async () => {
    setIsBackupsLoading(true);
    try {
      const sessions = await listBackupSessions();
      setBackupSessions(sessions);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to load backups.';
      setError(message);
    } finally {
      setIsBackupsLoading(false);
    }
  }, [setError]);

  const handleRestoreBackup = useCallback(async (sessionId: string) => {
    try {
      const session = await getBackupSession(sessionId);
      if (!session) {
        setError('Backup not found.');
        return;
      }
      if (session.source) {
        await handleImportSnapshotFromFile(createDesktopSnapshotSource(session.source));
      } else if (session.blob) {
        const backupFile = new File([session.blob], session.fileName, {
          type: session.blob.type || 'application/octet-stream',
        });
        await handleImportSnapshotFromFile(backupFile);
      }
      setIsBackupsOpen(false);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to restore backup.';
      setError(message);
    }
  }, [handleImportSnapshotFromFile, setError]);

  const handleImportSnapshot = useCallback(() => {
    closeFileMenu();
    importSnapshotWithPicker(() => {
      snapshotInputRef.current?.click();
    });
  }, [closeFileMenu, importSnapshotWithPicker]);

  useEffect(() => {
    if (!isResizeToastOpen) return;
    if (cropMode || transformMode) {
      cancelResizeToast();
    }
  }, [cancelResizeToast, cropMode, isResizeToastOpen, transformMode]);

  const handleToolChange = useCallback((newTool: Tool) => {
    if (newTool === Tool.VIDEO_PROMPT_AREA && !canCreateVideoPromptAreas) {
      return;
    }
    // Changing tools finalizes any in-progress note edits or crop sessions to keep state consistent.
    setTool(newTool);
    if (editingNoteId) {
      setEditingNoteId(null);
      handleCommit();
    }
    if (cropMode) {
      handleCancelCrop();
    }
  }, [canCreateVideoPromptAreas, editingNoteId, handleCommit, cropMode, handleCancelCrop]);

  useEffect(() => {
    if (!canCreateVideoPromptAreas && tool === Tool.VIDEO_PROMPT_AREA) {
      handleToolChange(Tool.SELECTION);
    }
  }, [canCreateVideoPromptAreas, handleToolChange, tool]);

  const isCameraSettingsEnabled = !fal.isVideoMode && (
    isSeedreamModelId(fal.falModelId)
    || isNanoBananaEditModelId(fal.falModelId)
  );

  const cameraPromptPrefix = useMemo(() => (
    isCameraSettingsEnabled ? buildCameraPromptPrefix(cameraSettings) : ''
  ), [cameraSettings, isCameraSettingsEnabled]);

  // Centralized generation handler that calls provider APIs and writes results back to canvas state.
  const {
    handleGenerate,
  } = useGeneration({
    appMode,
    tool,
    prompt,
    promptPrefix: cameraPromptPrefix,
    apiProvider,
    fal,
    selection,
    images,
    paths,
    krea2StyleReferenceStrengths,
    videoNegativePrompt: generationNegativePrompt,
    setError,
    setIsLoading,
    setFalJobs,
    setState,
    setToastMessage,
    setTool,
    onGenerationComplete: handleGenerationComplete,
    onGenerationPlaced: handleGenerationPlaced,
  });

  const isEmbeddedPromptBarActive = activeEmbeddedPromptBarId !== null;
  const handlePromptSubmit = useCallback(async () => {
    if (isJimengSeedanceModelSelected && !(await jimengSetup.ensureReady())) {
      return;
    }
    void handleGenerate();
  }, [handleGenerate, isJimengSeedanceModelSelected, jimengSetup]);

  useEffect(() => {
    autosaveSnapshotRef.current = autosaveSnapshot;
  }, [autosaveSnapshot]);

  useEffect(() => {
    if (!activeEmbeddedPromptBarId) {
      return;
    }
    const activeBar = displayedVideoPromptBars.find(bar => bar.id === activeEmbeddedPromptBarId);
    if (!activeBar?.assignedAreaId) {
      setActiveEmbeddedPromptBarId(null);
    }
  }, [activeEmbeddedPromptBarId, displayedVideoPromptBars]);

  useEffect(() => {
    if (generationTick === 0) {
      return;
    }
    // Autosave after the generation is committed to state.
    autosaveSnapshotRef.current();
  }, [generationTick]);

  useEffect(() => {
    if (!isBackupsOpen) {
      return;
    }
    refreshBackups();
  }, [isBackupsOpen, refreshBackups]);

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
  }, [hasDesktopSettingsBridge]);

  useKeyboardShortcuts({
    onGenerate: handlePromptSubmit,
    appMode,
    onToolChange: handleToolChange,
    requestZoomIn,
    requestZoomOut,
    onZoomToFit: handleZoomToFit,
    onZoomToSelection: requestZoomToSelection,
    onDelete: handleDelete,
    onRecordToggle: handleRecordToggle,
    onAdjustStrokeSize: handleAdjustStrokeSize,
    onUndo: undo,
    onRedo: redo,
    onTogglePresentationMode: handleTogglePresentationMode,
    isPresentationMode,
  });

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Re-run a past generation using the saved metadata on the selected image.
  const handleRerunGeneration = useCallback(async (imageId: string) => {
    const targetImage = images.find(img => img.id === imageId);
    const generation = targetImage?.metadata?.generation;
    if (!generation) {
      setToastMessage('No generation data to rerun.');
      setTimeout(() => setToastMessage(null), 2000);
      return;
    }
    const isJimengRerun = generation.provider === 'jimeng'
      || generation.modelId === JIMENG_SEEDANCE_2_VIDEO_MODEL_ID
      || Boolean(generation.jimengOptions); // Saved snapshots may identify JM CLI by provider, model, or options.
    if (isJimengRerun && !(await jimengSetup.ensureReady())) {
      return;
    }
    void handleGenerate(generation);
  }, [handleGenerate, images, jimengSetup, setToastMessage]);

  const handleRetryFalJob = useCallback(async (jobId: string) => {
    if (retryingFalJobIdsRef.current.has(jobId)) {
      return true;
    }
    const job = falJobs.find(candidate => candidate.id === jobId);
    if (!job?.retryInputs || job.status !== 'FAILED') {
      setToastMessage('No queue retry data available.');
      setTimeout(() => setToastMessage(null), 2000);
      return false;
    }
    if (job.retryInputs.provider === 'jimeng' && !(await jimengSetup.ensureReady())) {
      return false;
    }
    retryingFalJobIdsRef.current.add(jobId); // Blocks duplicate retries while this attempt runs.
    try {
      await handleGenerate(job.retryInputs, { retryJobId: job.id });
      return true;
    } finally {
      retryingFalJobIdsRef.current.delete(jobId);
    }
  }, [falJobs, handleGenerate, jimengSetup, setToastMessage]);

  const handleNoteTextChange = useCallback((noteId: string, text: string) => {
    const targetNotes = displayedNotes;
    const noteIndex = targetNotes.findIndex(n => n.id === noteId);
    if (noteIndex === -1) return;

    const newNotes = [...targetNotes];
    newNotes[noteIndex] = { ...newNotes[noteIndex], text };
    setLiveNotes(newNotes);
  }, [displayedNotes, setLiveNotes]);

  const handleNotesChange = useCallback((nextNotes: CanvasNote[]) => {
    setLiveNotes(nextNotes);
    if (tool !== Tool.NOTE || editingNoteId) {
      return;
    }
    const prevIds = new Set(displayedNotes.map(note => note.id));
    const addedNote = nextNotes.find(note => !prevIds.has(note.id));
    if (addedNote && addedNote.text === '') {
      pendingNoteEditIdRef.current = addedNote.id;
    }
  }, [displayedNotes, editingNoteId, setLiveNotes, tool]);

  useEffect(() => {
    const pendingId = pendingNoteEditIdRef.current;
    if (!pendingId || editingNoteId || tool !== Tool.NOTE) {
      return;
    }
    if (!displayedNotes.some(note => note.id === pendingId)) {
      return;
    }
    setEditingNoteId(pendingId);
    pendingNoteEditIdRef.current = null;
  }, [displayedNotes, editingNoteId, tool]);

  useEffect(() => {
    if (tool !== Tool.NOTE && pendingNoteEditIdRef.current) {
      pendingNoteEditIdRef.current = null;
    }
  }, [tool]);


  const handleNoteFontSizeChange = useCallback((noteId: string, delta: number) => {
    const noteIndex = notes.findIndex(n => n.id === noteId);
    if (noteIndex === -1) return;
    const currentFontSize = notes[noteIndex].fontSize ?? DEFAULT_NOTE_FONT_SIZE;
    const newFontSize = Math.max(MIN_NOTE_FONT_SIZE, Math.min(MAX_NOTE_FONT_SIZE, currentFontSize + delta));
    if (newFontSize === currentFontSize) return;
    setState(prevState => {
      const newNotes = [...prevState.notes];
      newNotes[noteIndex] = { ...newNotes[noteIndex], fontSize: newFontSize };
      return { ...prevState, notes: newNotes };
    });
  }, [notes, setState]);

  const handleNoteColorChange = useCallback((noteId: string, color: string) => {
    setState(prevState => {
      const noteIndex = prevState.notes.findIndex(note => note.id === noteId);
      if (noteIndex === -1) {
        return prevState;
      }
      const newNotes = [...prevState.notes];
      newNotes[noteIndex] = { ...newNotes[noteIndex], backgroundColor: color };
      return { ...prevState, notes: newNotes };
    });
  }, [setState]);

  const handleVideoPromptAreaBorderColorChange = useCallback((areaId: string, color: string) => {
    setState(prevState => {
      const areaIndex = prevState.videoPromptAreas.findIndex(area => area.id === areaId);
      if (areaIndex === -1) {
        return prevState;
      }
      const nextAreas = [...prevState.videoPromptAreas];
      nextAreas[areaIndex] = { ...nextAreas[areaIndex], borderColor: color };
      return { ...prevState, videoPromptAreas: nextAreas };
    });
  }, [setState]);

  const selectedImageIndex = primaryImageId ? images.findIndex(img => img.id === primaryImageId) : -1;
  const isImageOverlapping = primaryImageId && selectedImageIndex !== -1 ? images.some(other => other.id !== primaryImageId && isOverlapping(images[selectedImageIndex], other)) : false;
  const canMoveUp = selectedImageIndex > -1 && selectedImageIndex < images.length - 1;
  const canMoveDown = selectedImageIndex > -1 && selectedImageIndex > 0;

  const usingFal = apiProvider === 'fal';
  const isSeedreamModel = !fal.isVideoMode && isSeedreamModelId(fal.falModelId);
  const isNanoBananaModel = !fal.isVideoMode && isNanoBananaEditModelId(fal.falModelId);
  const isGptImage2Model = !fal.isVideoMode && isGptImage2EditModelId(fal.falModelId);
  const isKrea2LargeModel = isActiveKrea2LargeModel;
  const isGrokModel = !fal.isVideoMode && fal.falModelId === GROK_IMAGINE_IMAGE_MODEL_ID; // Grok text-to-image.
  const isAnnotateModeDisabled = (fal.isVideoMode && !fal.isHailuoVideoModel) || fal.isFlux2MaxModel || fal.isUpscaleModel;

  useEffect(() => {
    if (appMode === 'ANNOTATE' && isAnnotateModeDisabled) {
      handleModeChange('CANVAS');
    }
  }, [appMode, handleModeChange, isAnnotateModeDisabled]);

  const isSeedance2ReferenceMode = fal.isSeedance2VideoModel && fal.seedance2Variant === 'reference'; // Seedance reference mode labels the merged selected and tagged refs.
  const {
    referenceImageIds: effectiveSeedanceReferenceImageIds,
    referenceVideoIds: effectiveSeedanceReferenceVideoIds,
    referenceAudioIds: effectiveSeedanceReferenceAudioIds,
  } = useMemo(() => buildEffectiveSeedanceReferenceIds({
    enabled: isSeedance2ReferenceMode,
    images,
    selectedImageIds,
    referenceImageIds,
    referenceVideoIds,
    referenceAudioIds,
    orderedReferenceIds: seedanceReferenceOrderIds,
  }), [images, isSeedance2ReferenceMode, referenceAudioIds, referenceImageIds, referenceVideoIds, seedanceReferenceOrderIds, selectedImageIds]);
  const {
    referenceOrderLabels: klingReferenceOrderLabels,
    elementOrderLabels: klingElementOrderLabels,
  } = useKlingReferenceHelpers({
    labelReferences: fal.isKlingO3VideoModel || isSeedance2ReferenceMode || isWan27ReferenceMode || fal.isFlux2MaxModel || fal.isWan27ImageModel,
    primaryImageId,
    primaryImageMediaType: primarySelectionMediaType,
    includePrimaryImageAsReference: !isKlingO3ReferenceMode && !isSeedance2ReferenceMode && !isWan27ReferenceMode, // Only API prompt references get @Image labels.
    referenceImageIds: isSeedance2ReferenceMode ? effectiveSeedanceReferenceImageIds : referenceImageIds,
    referenceVideoIds: isSeedance2ReferenceMode ? effectiveSeedanceReferenceVideoIds : referenceVideoIds,
    referenceAudioIds: isSeedance2ReferenceMode ? effectiveSeedanceReferenceAudioIds : referenceAudioIds,
    labelElements: fal.isKlingO3VideoModel,
    elementImageIds,
    isEditMode: isKlingO3VideoInputMode,
    sourceVideoId,
    includeTailFrame: false,
    tailImageId: videoLastFrameImageId,
  });
  const videoPromptAreaBarById = useMemo(() => (
    displayedVideoPromptBars.reduce<Record<string, CanvasVideoPromptBar>>((acc, bar) => {
      if (bar.assignedAreaId) {
        acc[bar.assignedAreaId] = bar;
      }
      return acc;
    }, {})
  ), [displayedVideoPromptBars]);
  const videoPromptAreaProfiles = useMemo(() => (
    displayedVideoPromptAreas.reduce<Record<string, ReturnType<typeof getVideoPromptAreaCapabilityProfile>>>((acc, area) => {
      const bar = videoPromptAreaBarById[area.id];
      acc[area.id] = getVideoPromptAreaCapabilityProfile(bar?.modelId, bar?.seedance2Variant, bar ? getEmbeddedBarFalOptions(bar) : undefined);
      return acc;
    }, {})
  ), [displayedVideoPromptAreas, videoPromptAreaBarById]);
  const videoPromptAreaMemberships = useMemo(() => (
    displayedVideoPromptAreas.reduce<Record<string, VideoPromptAreaMembership>>((acc, area) => {
      acc[area.id] = buildVideoPromptAreaMembership(area, displayedImages, videoPromptAreaProfiles[area.id]);
      return acc;
    }, {})
  ), [displayedImages, displayedVideoPromptAreas, videoPromptAreaProfiles]);
  const videoPromptAreaMembershipList = useMemo(() => (
    Object.values(videoPromptAreaMemberships) as VideoPromptAreaMembership[]
  ), [videoPromptAreaMemberships]);
  const videoPromptAreaLabelMap = useMemo(() => (
    videoPromptAreaMembershipList.reduce<Record<string, string>>((acc, membership) => {
      Object.entries(membership.orderLabels).forEach(([mediaId, label]) => {
        acc[mediaId] = label;
      });
      return acc;
    }, {})
  ), [videoPromptAreaMembershipList]);
  const ignoredVideoPromptMediaIds = useMemo(() => (
    videoPromptAreaMembershipList.flatMap(membership => membership.ignoredMediaIds)
  ), [videoPromptAreaMembershipList]);
  const acceptedVideoPromptImageIds = useMemo(() => (
    videoPromptAreaMembershipList.flatMap(membership => [
      ...(membership.primaryImageId ? [membership.primaryImageId] : []),
      ...membership.acceptedImageIds,
      ...(membership.tailImageId ? [membership.tailImageId] : []),
    ])
  ), [videoPromptAreaMembershipList]);
  const acceptedVideoPromptVideoIds = useMemo(() => (
    videoPromptAreaMembershipList.flatMap(membership => membership.acceptedVideoIds)
  ), [videoPromptAreaMembershipList]);
  const acceptedVideoPromptAudioIds = useMemo(() => (
    videoPromptAreaMembershipList.flatMap(membership => membership.acceptedAudioIds)
  ), [videoPromptAreaMembershipList]);
  const acceptedVideoPromptElementIds = useMemo(() => (
    videoPromptAreaMembershipList.flatMap(membership => membership.elementImageIds)
  ), [videoPromptAreaMembershipList]);
  const seedance2ReferenceAssetCount = effectiveSeedanceReferenceImageIds.length + effectiveSeedanceReferenceVideoIds.length + effectiveSeedanceReferenceAudioIds.length; // Seedance reference mode treats selected media as effective refs too.
  const canvasReferenceOrderLabels = useMemo(() => ({
    ...(klingReferenceOrderLabels ?? {}),
    ...videoPromptAreaLabelMap,
  }), [klingReferenceOrderLabels, videoPromptAreaLabelMap]); // Area labels should render on canvas without replacing the legacy reference flow.
  const canvasElementOrderLabels = useMemo(() => ({
    ...(klingElementOrderLabels ?? {}),
    ...videoPromptAreaLabelMap,
  }), [klingElementOrderLabels, videoPromptAreaLabelMap]); // Element labels share the same area role labels.
  const canvasReferenceImageIds = useMemo(() => (
    Array.from(new Set([
      ...(isSeedance2ReferenceMode ? effectiveSeedanceReferenceImageIds : referenceImageIds),
      ...acceptedVideoPromptImageIds,
    ]))
  ), [acceptedVideoPromptImageIds, effectiveSeedanceReferenceImageIds, isSeedance2ReferenceMode, referenceImageIds]);
  const canvasReferenceVideoIds = useMemo(() => (
    Array.from(new Set([
      ...(isSeedance2ReferenceMode ? effectiveSeedanceReferenceVideoIds : referenceVideoIds),
      ...acceptedVideoPromptVideoIds,
    ]))
  ), [acceptedVideoPromptVideoIds, effectiveSeedanceReferenceVideoIds, isSeedance2ReferenceMode, referenceVideoIds]);
  const canvasReferenceAudioIds = useMemo(() => (
    Array.from(new Set([
      ...(isSeedance2ReferenceMode ? effectiveSeedanceReferenceAudioIds : referenceAudioIds),
      ...acceptedVideoPromptAudioIds,
    ]))
  ), [acceptedVideoPromptAudioIds, effectiveSeedanceReferenceAudioIds, isSeedance2ReferenceMode, referenceAudioIds]);

  const handleEmbeddedVideoPromptSubmit = useCallback(async (barId: string) => {
    const targetBar = displayedVideoPromptBars.find(bar => bar.id === barId);
    if (!targetBar || !targetBar.assignedAreaId) {
      return;
    }
    const membership = videoPromptAreaMemberships[targetBar.assignedAreaId];
    if (!membership) {
      return;
    }
    const targetModelId = getEmbeddedVideoPromptBarModelId(targetBar.modelId);
    const generationOverrides = buildEmbeddedVideoGenerationOverrides(membership);
    const providerInput = buildEmbeddedVideoGenerationProviderInput(targetBar, targetModelId);
    if (isJimengEmbeddedVideoModel(targetModelId) && !(await jimengSetup.ensureReady())) {
      return;
    }
    void handleGenerate({
      kind: 'video',
      prompt: targetBar.prompt,
      ...providerInput,
      modelId: targetModelId,
      modelMode: 'video',
      ...generationOverrides,
    });
  }, [displayedVideoPromptBars, handleGenerate, jimengSetup, videoPromptAreaMemberships]);

  const hasSourceVideoSelected = Boolean(sourceVideoId);
  const hasSourceAudioSelected = Boolean(sourceAudioId);

  // Build prompt mention suggestions for Kling/Wan based on current reference/element selections.
  const { klingPromptMentions, klingReferenceCount } = useKlingPromptMentions({
    isKlingO3VideoModel: fal.isKlingO3VideoModel,
    isKlingO3EditMode: fal.isKlingO3EditMode,
    isSeedance2ReferenceMode,
    isFlux2MaxModel: fal.isFlux2MaxModel,
    isWan27ImageModel: fal.isWan27ImageModel,
    referenceOrderLabels: klingReferenceOrderLabels,
    elementOrderLabels: klingElementOrderLabels,
    referenceImageIds: effectiveSeedanceReferenceImageIds,
    hasSingleImageSelected,
    primarySelectionMediaType,
  });
  const embeddedVideoPromptBarModelOptions = useMemo(() => (
    FAL_VIDEO_MODEL_OPTIONS
      .filter(option => isUsableVideoPromptAreaModel(option.value))
      .map(option => ({ value: option.value, label: option.label }))
  ), []);
  const buildEmbeddedVideoPromptBarControls = useCallback((bar: CanvasVideoPromptBar) => {
    const modelId = getEmbeddedVideoPromptBarModelId(bar.modelId);
    const options = bar.falOptions ?? {};
    const updateFalOption = (key: keyof NonNullable<CanvasVideoPromptBar['falOptions']>, value: unknown) => {
      handleEmbeddedPromptBarUpdate(bar.id, currentBar => ({
        ...currentBar,
        falOptions: { ...(currentBar.falOptions ?? {}), [key]: value },
      }));
    }; // Store embedded control edits with the bar.
    const updateLegacyAndFal = (patch: Partial<CanvasVideoPromptBar>, key: keyof NonNullable<CanvasVideoPromptBar['falOptions']>, value: unknown) => {
      handleEmbeddedPromptBarUpdate(bar.id, currentBar => ({
        ...currentBar,
        ...patch,
        falOptions: { ...(currentBar.falOptions ?? {}), [key]: value },
      }));
    }; // Seedance/Kling legacy fields still drive existing snapshots/tests.

    return buildPromptBarModelControls({
      apiProvider: 'fal',
      falModelId: modelId,
      falModelMode: 'video',
      isVideoMode: true,
      usingFal: true,
      isSeedreamModel: false,
      isNanoBananaModel: false,
      isFlux2MaxModel: false,
      isWan27ImageModel: false,
      isUpscaleModel: false,
      isKlingVideoModel: modelId === KLING_VIDEO_MODEL_ID,
      isKlingV3VideoModel: modelId === KLING_V3_VIDEO_MODEL_ID,
      isKlingO3VideoModel: isKlingO3VideoModelId(modelId),
      isKlingV3ControlVideoModel: modelId === KLING_V3_CONTROL_VIDEO_MODEL_ID,
      isHailuoVideoModel: modelId === HAILUO_IMAGE_TO_VIDEO_MODEL_ID,
      isWanAnimateVideoModel: modelId === WAN_ANIMATE_MODEL_ID,
      isLipsyncVideoModel: modelId === SYNC_LIPSYNC_MODEL_ID,
      isHeygenV3LipsyncVideoModel: modelId === HEYGEN_V3_LIPSYNC_MODEL_ID,
      isInfinitalkVideoModel: modelId === INFINITALK_VIDEO_MODEL_ID,
      isGrokImagineVideoModel: modelId === GROK_IMAGINE_VIDEO_MODEL_ID,
      isVeo31VideoModel: modelId === VEO_31_IMAGE_TO_VIDEO_MODEL_ID,
      isWan27VideoModel: modelId === WAN_27_VIDEO_MODEL_ID,
      isSeedance15VideoModel: modelId === SEEDANCE_15_VIDEO_MODEL_ID,
      isSeedance2VideoModel: modelId === SEEDANCE_2_VIDEO_MODEL_ID || modelId === FAL_SEEDANCE_2_VIDEO_MODEL_ID || modelId === JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
      isFalSeedance2VideoModel: modelId === FAL_SEEDANCE_2_VIDEO_MODEL_ID,
      isJimengSeedance2VideoModel: modelId === JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
      hailuoVariant: options.hailuoVariant ?? fal.hailuoVariant,
      falVideoDuration: options.videoDuration ?? fal.falVideoDuration,
      klingVariant: options.klingVariant ?? fal.klingVariant,
      klingV3Duration: bar.klingV3Duration ?? options.klingV3Duration ?? '5',
      klingV3GenerateAudio: bar.klingV3GenerateAudio ?? options.klingV3GenerateAudio ?? true,
      klingV3CfgScale: bar.klingV3CfgScale ?? options.klingV3CfgScale ?? '0.5',
      klingV3MultiPromptEnabled: bar.klingV3MultiPromptEnabled ?? options.klingV3MultiPromptEnabled ?? false,
      klingV3Shot1Duration: bar.klingV3Shot1Duration ?? options.klingV3Shot1Duration ?? '5',
      klingV3Shot2Duration: bar.klingV3Shot2Duration ?? options.klingV3Shot2Duration ?? '5',
      klingO3Variant: options.klingO3Variant ?? fal.klingO3Variant,
      klingO3Duration: options.klingO3Duration ?? fal.klingO3Duration,
      klingO3GenerateAudio: options.klingO3GenerateAudio ?? fal.klingO3GenerateAudio,
      klingO3KeepAudio: options.klingO3KeepAudio ?? fal.klingO3KeepAudio,
      klingV3ControlKeepSound: options.klingV3ControlKeepSound ?? fal.klingV3ControlKeepSound,
      klingV3ControlOrientation: options.klingV3ControlOrientation ?? fal.klingV3ControlOrientation,
      wanTargetResolution: options.wanTargetResolution ?? fal.wanTargetResolution,
      wanCreativity: options.wanCreativity ?? fal.wanCreativity,
      wanAnimateVariant: options.wanAnimateVariant ?? fal.wanAnimateVariant,
      wanAnimateSteps: options.wanAnimateSteps ?? fal.wanAnimateSteps,
      wanAnimateResolution: options.wanAnimateResolution ?? fal.wanAnimateResolution,
      oneToAllAnimateResolution: options.oneToAllAnimateResolution ?? fal.oneToAllAnimateResolution,
      wanAnimateShift: options.wanAnimateShift ?? fal.wanAnimateShift,
      wanAnimateQuality: options.wanAnimateQuality ?? fal.wanAnimateQuality,
      wanAnimateUseTurbo: options.wanAnimateUseTurbo ?? fal.wanAnimateUseTurbo,
      lipsyncSyncMode: options.lipsyncSyncMode ?? fal.lipsyncSyncMode,
      heygenEnableCaption: options.heygenEnableCaption ?? fal.heygenEnableCaption,
      heygenEnableDynamicDuration: options.heygenEnableDynamicDuration ?? fal.heygenEnableDynamicDuration,
      heygenDisableMusicTrack: options.heygenDisableMusicTrack ?? fal.heygenDisableMusicTrack,
      heygenEnableSpeechEnhancement: options.heygenEnableSpeechEnhancement ?? fal.heygenEnableSpeechEnhancement,
      infinitalkResolution: options.infinitalkResolution ?? fal.infinitalkResolution,
      infinitalkSeed: options.infinitalkSeed ?? fal.infinitalkSeed,
      infinitalkAcceleration: options.infinitalkAcceleration ?? fal.infinitalkAcceleration,
      infinitalkDuration: options.infinitalkDuration ?? fal.infinitalkDuration,
      grokImagineVideoDuration: options.grokImagineVideoDuration ?? fal.grokImagineVideoDuration,
      grokImagineVideoResolution: options.grokImagineVideoResolution ?? fal.grokImagineVideoResolution,
      grokImagineVideoAspectRatio: options.grokImagineVideoAspectRatio ?? fal.grokImagineVideoAspectRatio,
      veo31Variant: options.veo31Variant ?? fal.veo31Variant,
      veo31Duration: options.veo31Duration ?? fal.veo31Duration,
      veo31Resolution: options.veo31Resolution ?? fal.veo31Resolution,
      veo31AspectRatio: options.veo31AspectRatio ?? fal.veo31AspectRatio,
      veo31GenerateAudio: options.veo31GenerateAudio ?? fal.veo31GenerateAudio,
      wan27VideoResolution: options.wan27VideoResolution ?? fal.wan27VideoResolution,
      wan27VideoDuration: options.wan27VideoDuration ?? fal.wan27VideoDuration,
      wan27VideoAspectRatio: options.wan27VideoAspectRatio ?? fal.wan27VideoAspectRatio,
      wan27VideoPromptExpansion: options.wan27VideoPromptExpansion ?? fal.wan27VideoPromptExpansion,
      wan27VideoVariant: options.wan27VideoVariant ?? fal.wan27VideoVariant,
      wan27VideoAudioSetting: options.wan27VideoAudioSetting ?? fal.wan27VideoAudioSetting,
      seedance15AspectRatio: options.seedance15AspectRatio ?? fal.seedance15AspectRatio,
      seedance15Resolution: options.seedance15Resolution ?? fal.seedance15Resolution,
      seedance15Duration: options.seedance15Duration ?? fal.seedance15Duration,
      seedance15CameraFixed: options.seedance15CameraFixed ?? fal.seedance15CameraFixed,
      seedance15Audio: options.seedance15Audio ?? fal.seedance15Audio,
      seedance2Variant: bar.seedance2Variant,
      seedance2JimengModelVersion: bar.seedance2JimengModelVersion ?? options.seedance2JimengModelVersion ?? fal.seedance2JimengModelVersion,
      seedance2AspectRatio: bar.seedance2AspectRatio ?? '16:9',
      seedance2Resolution: bar.seedance2Resolution ?? '720p',
      seedance2Duration: bar.seedance2Duration ?? '5',
      seedance2GenerateAudio: bar.seedance2GenerateAudio,
      seedance2CameraFixed: bar.seedance2CameraFixed,
      flux2MaxImageSize: fal.flux2MaxImageSize,
      wan27ImageAspectRatio: fal.wan27ImageAspectRatio,
      wan27ImageMaxImages: fal.wan27ImageMaxImages,
      recraftImageSize: fal.recraftImageSize,
      recraftBackgroundColor: fal.recraftBackgroundColor,
      recraftColors: fal.recraftColors,
      falScaleFactor: fal.falScaleFactor,
      falCreativity: fal.falCreativity,
      falNoiseScale: fal.falNoiseScale,
      falImageSizeSelection: fal.falImageSizeSelection,
      falAspectRatioSelection: fal.falAspectRatioSelection,
      falResolutionSelection: fal.falResolutionSelection,
      falNumImages: fal.falNumImages,
      isLoading,
      onHailuoVariantChange: value => updateFalOption('hailuoVariant', value),
      onFalVideoDurationChange: value => updateFalOption('videoDuration', value),
      onKlingVariantChange: value => updateFalOption('klingVariant', value),
      onKlingV3DurationChange: value => updateLegacyAndFal({ klingV3Duration: value as CanvasVideoPromptBar['klingV3Duration'] }, 'klingV3Duration', value),
      onKlingV3GenerateAudioChange: value => updateLegacyAndFal({ klingV3GenerateAudio: value }, 'klingV3GenerateAudio', value),
      onKlingV3CfgScaleChange: value => updateLegacyAndFal({ klingV3CfgScale: value as CanvasVideoPromptBar['klingV3CfgScale'] }, 'klingV3CfgScale', value),
      onKlingV3MultiPromptEnabledChange: value => updateLegacyAndFal({ klingV3MultiPromptEnabled: value }, 'klingV3MultiPromptEnabled', value),
      onKlingV3Shot1DurationChange: value => updateLegacyAndFal({ klingV3Shot1Duration: value as CanvasVideoPromptBar['klingV3Shot1Duration'] }, 'klingV3Shot1Duration', value),
      onKlingV3Shot2DurationChange: value => updateLegacyAndFal({ klingV3Shot2Duration: value as CanvasVideoPromptBar['klingV3Shot2Duration'] }, 'klingV3Shot2Duration', value),
      onKlingO3VariantChange: value => updateFalOption('klingO3Variant', value),
      onKlingO3DurationChange: value => updateFalOption('klingO3Duration', value),
      onKlingO3GenerateAudioChange: value => updateFalOption('klingO3GenerateAudio', value),
      onKlingO3KeepAudioChange: value => updateFalOption('klingO3KeepAudio', value),
      onKlingV3ControlKeepSoundChange: value => updateFalOption('klingV3ControlKeepSound', value),
      onKlingV3ControlOrientationChange: value => updateFalOption('klingV3ControlOrientation', value),
      onWanTargetResolutionChange: value => updateFalOption('wanTargetResolution', value),
      onWanCreativityChange: value => updateFalOption('wanCreativity', Number(value)),
      onWanAnimateVariantChange: value => updateFalOption('wanAnimateVariant', value),
      onWanAnimateStepsChange: value => updateFalOption('wanAnimateSteps', value),
      onWanAnimateResolutionChange: value => updateFalOption('wanAnimateResolution', value),
      onOneToAllAnimateResolutionChange: value => updateFalOption('oneToAllAnimateResolution', value),
      onWanAnimateShiftChange: value => updateFalOption('wanAnimateShift', value),
      onWanAnimateQualityChange: value => updateFalOption('wanAnimateQuality', value),
      onWanAnimateTurboChange: value => updateFalOption('wanAnimateUseTurbo', value),
      onLipsyncSyncModeChange: value => updateFalOption('lipsyncSyncMode', value),
      onHeygenEnableCaptionChange: value => updateFalOption('heygenEnableCaption', value),
      onHeygenEnableDynamicDurationChange: value => updateFalOption('heygenEnableDynamicDuration', value),
      onHeygenDisableMusicTrackChange: value => updateFalOption('heygenDisableMusicTrack', value),
      onHeygenEnableSpeechEnhancementChange: value => updateFalOption('heygenEnableSpeechEnhancement', value),
      onInfinitalkResolutionChange: value => updateFalOption('infinitalkResolution', value),
      onInfinitalkSeedChange: value => updateFalOption('infinitalkSeed', value),
      onInfinitalkAccelerationChange: value => updateFalOption('infinitalkAcceleration', value),
      onInfinitalkDurationChange: value => updateFalOption('infinitalkDuration', value),
      onGrokImagineVideoDurationChange: value => updateFalOption('grokImagineVideoDuration', value),
      onGrokImagineVideoResolutionChange: value => updateFalOption('grokImagineVideoResolution', value),
      onGrokImagineVideoAspectRatioChange: value => updateFalOption('grokImagineVideoAspectRatio', value),
      onVeo31VariantChange: value => updateFalOption('veo31Variant', value),
      onVeo31DurationChange: value => updateFalOption('veo31Duration', value),
      onVeo31ResolutionChange: value => updateFalOption('veo31Resolution', value),
      onVeo31AspectRatioChange: value => updateFalOption('veo31AspectRatio', value),
      onVeo31GenerateAudioChange: value => updateFalOption('veo31GenerateAudio', value),
      onWan27VideoResolutionChange: value => updateFalOption('wan27VideoResolution', value),
      onWan27VideoDurationChange: value => updateFalOption('wan27VideoDuration', value),
      onWan27VideoAspectRatioChange: value => updateFalOption('wan27VideoAspectRatio', value),
      onWan27VideoPromptExpansionChange: value => updateFalOption('wan27VideoPromptExpansion', value),
      onWan27VideoVariantChange: value => updateFalOption('wan27VideoVariant', value),
      onWan27VideoAudioSettingChange: value => updateFalOption('wan27VideoAudioSetting', value),
      onSeedance15AspectRatioChange: value => updateFalOption('seedance15AspectRatio', value),
      onSeedance15ResolutionChange: value => updateFalOption('seedance15Resolution', value),
      onSeedance15DurationChange: value => updateFalOption('seedance15Duration', value),
      onSeedance15CameraFixedChange: value => updateFalOption('seedance15CameraFixed', value),
      onSeedance15AudioChange: value => updateFalOption('seedance15Audio', value),
      onSeedance2VariantChange: value => updateLegacyAndFal({ seedance2Variant: value as CanvasVideoPromptBar['seedance2Variant'] }, 'seedance2Variant', value),
      onSeedance2JimengModelVersionChange: value => {
        handleEmbeddedPromptBarUpdate(bar.id, currentBar => ({
          ...currentBar,
          seedance2JimengModelVersion: value as CanvasVideoPromptBar['seedance2JimengModelVersion'],
          seedance2Resolution: value === 'seedance2.0_vip' ? currentBar.seedance2Resolution : (currentBar.seedance2Resolution === '1080p' ? '720p' : currentBar.seedance2Resolution),
          falOptions: {
            ...(currentBar.falOptions ?? {}),
            seedance2JimengModelVersion: value as CanvasVideoPromptBar['seedance2JimengModelVersion'],
            seedance2Resolution: value === 'seedance2.0_vip' ? currentBar.falOptions?.seedance2Resolution : (currentBar.falOptions?.seedance2Resolution === '1080p' ? '720p' : currentBar.falOptions?.seedance2Resolution),
          },
        }));
      },
      onSeedance2AspectRatioChange: value => updateLegacyAndFal({ seedance2AspectRatio: value as CanvasVideoPromptBar['seedance2AspectRatio'] }, 'seedance2AspectRatio', value),
      onSeedance2ResolutionChange: value => updateLegacyAndFal({ seedance2Resolution: value as CanvasVideoPromptBar['seedance2Resolution'] }, 'seedance2Resolution', value),
      onSeedance2DurationChange: value => updateLegacyAndFal({ seedance2Duration: value as CanvasVideoPromptBar['seedance2Duration'] }, 'seedance2Duration', value),
      onSeedance2GenerateAudioChange: value => updateLegacyAndFal({ seedance2GenerateAudio: value }, 'seedance2GenerateAudio', value),
      onSeedance2CameraFixedChange: value => handleEmbeddedPromptBarUpdate(bar.id, currentBar => ({ ...currentBar, seedance2CameraFixed: value })),
      onFlux2MaxImageSizeChange: () => {},
      onWan27ImageAspectRatioChange: () => {},
      onWan27ImageMaxImagesChange: () => {},
      onRecraftImageSizeChange: () => {},
      onRecraftBackgroundColorChange: () => {},
      onRecraftColorChange: () => {},
      onRecraftAddColor: () => {},
      onRecraftRemoveColor: () => {},
      onFalScaleFactorChange: () => {},
      onFalCreativityChange: () => {},
      onFalNoiseScaleChange: () => {},
      onFalImageSizeChange: () => {},
      onFalAspectRatioChange: value => updateFalOption('aspectRatioSelection', value),
      onFalResolutionChange: () => {},
      onFalNumImagesChange: () => {},
      shouldValidateFalOptions: false,
      isNumImagesInvalid: false,
    }) ?? [];
  }, [fal, handleEmbeddedPromptBarUpdate, isLoading]);

  // Validation layer for prompt submission that enforces provider/model-specific rules.
  const {
    submitDisabled,
    promptPlaceholderText,
    disablePromptInput,
    shouldValidateFalOptions,
    isNumImagesInvalid,
    isTextToImage,
  } = useGenerationGuards({
    apiProvider,
    appMode,
    tool,
    prompt,
    isKlingO3EditMode: fal.isKlingO3EditMode,
    hasSourceVideo: hasSourceVideoSelected,
    hasSourceAudio: hasSourceAudioSelected,
    isVideoMode: fal.isVideoMode,
    isUpscaleModel: fal.isUpscaleModel,
    isSeedreamModel,
    isNanoBananaModel,
    isGptImage2Model,
    isKrea2LargeModel,
    isGrokModel, // Grok validation flag.
    isGrokImagineVideoModel: fal.isGrokImagineVideoModel,
    isKlingVideoModel: fal.isKlingVideoModel,
    isKlingV3VideoModel: fal.isKlingV3VideoModel,
    isKlingO3VideoModel: fal.isKlingO3VideoModel,
    isKlingV3ControlVideoModel: fal.isKlingV3ControlVideoModel,
    isHailuoVideoModel: fal.isHailuoVideoModel,
    isVeo31VideoModel: fal.isVeo31VideoModel,
    isSeedance2VideoModel: fal.isSeedance2VideoModel,
    seedance2Variant: fal.seedance2Variant,
    seedance2ReferenceAssetCount,
    wan27VideoVariant: fal.wan27VideoVariant,
    wan27ReferenceAssetCount: isWan27ReferenceMode ? referenceImageIds.length + referenceVideoIds.length : 0,
    veo31Variant: fal.veo31Variant,
    falModelId: fal.falModelId,
    falNumImages: fal.falNumImages,
    activePrimaryImage,
    primarySelectionMediaType,
    hasSelectedStillImage,
  });

  // Derive UI controls for the prompt bar based on provider, model, and mode selections.
  const promptBarModelControls = buildPromptBarModelControls({
    apiProvider,
    falModelId: fal.falModelId,
    falModelMode: fal.falModelMode,
    isVideoMode: fal.isVideoMode,
    usingFal,
    isSeedreamModel,
    isNanoBananaModel,
    isGptImage2Model,
    isKrea2LargeModel,
    isFlux2MaxModel: fal.isFlux2MaxModel,
    isUpscaleModel: fal.isUpscaleModel,
    isKlingVideoModel: fal.isKlingVideoModel,
    isKlingV3VideoModel: fal.isKlingV3VideoModel,
    isKlingO3VideoModel: fal.isKlingO3VideoModel,
    isKlingV3ControlVideoModel: fal.isKlingV3ControlVideoModel,
    isHailuoVideoModel: fal.isHailuoVideoModel,
    isWanAnimateVideoModel: fal.isWanAnimateVideoModel,
    isLipsyncVideoModel: fal.isLipsyncVideoModel,
    isHeygenV3LipsyncVideoModel: fal.isHeygenV3LipsyncVideoModel,
    isInfinitalkVideoModel: fal.isInfinitalkVideoModel,
    isGrokImagineVideoModel: fal.isGrokImagineVideoModel,
    isVeo31VideoModel: fal.isVeo31VideoModel,
    isWan27VideoModel: fal.isWan27VideoModel,
    isSeedance15VideoModel: fal.isSeedance15VideoModel,
    isSeedance2VideoModel: fal.isSeedance2VideoModel,
    isFalSeedance2VideoModel: fal.isFalSeedance2VideoModel,
    isJimengSeedance2VideoModel: fal.isJimengSeedance2VideoModel,
    hailuoVariant: fal.hailuoVariant,
    falVideoDuration: fal.falVideoDuration,
    klingVariant: fal.klingVariant,
    klingV3Duration: fal.klingV3Duration,
    klingV3GenerateAudio: fal.klingV3GenerateAudio,
    klingV3CfgScale: fal.klingV3CfgScale,
    klingV3MultiPromptEnabled: fal.klingV3MultiPromptEnabled,
    klingV3Shot1Duration: fal.klingV3Shot1Duration,
    klingV3Shot2Duration: fal.klingV3Shot2Duration,
    klingO3Variant: fal.klingO3Variant,
    klingO3Duration: fal.klingO3Duration,
    klingO3GenerateAudio: fal.klingO3GenerateAudio,
    klingO3KeepAudio: fal.klingO3KeepAudio,
    klingV3ControlKeepSound: fal.klingV3ControlKeepSound,
    klingV3ControlOrientation: fal.klingV3ControlOrientation,
    wanTargetResolution: fal.wanTargetResolution,
    wanCreativity: fal.wanCreativity,
    wanAnimateVariant: fal.wanAnimateVariant,
    wanAnimateSteps: fal.wanAnimateSteps,
    wanAnimateResolution: fal.wanAnimateResolution,
    oneToAllAnimateResolution: fal.oneToAllAnimateResolution,
    wanAnimateShift: fal.wanAnimateShift,
    wanAnimateQuality: fal.wanAnimateQuality,
    wanAnimateUseTurbo: fal.wanAnimateUseTurbo,
    lipsyncSyncMode: fal.lipsyncSyncMode,
    heygenEnableCaption: fal.heygenEnableCaption,
    heygenEnableDynamicDuration: fal.heygenEnableDynamicDuration,
    heygenDisableMusicTrack: fal.heygenDisableMusicTrack,
    heygenEnableSpeechEnhancement: fal.heygenEnableSpeechEnhancement,
    infinitalkResolution: fal.infinitalkResolution,
    infinitalkSeed: fal.infinitalkSeed,
    infinitalkAcceleration: fal.infinitalkAcceleration,
    infinitalkDuration: fal.infinitalkDuration,
    grokImagineVideoDuration: fal.grokImagineVideoDuration,
    grokImagineVideoResolution: fal.grokImagineVideoResolution,
    grokImagineVideoAspectRatio: fal.grokImagineVideoAspectRatio,
    veo31Variant: fal.veo31Variant,
    veo31Duration: fal.veo31Duration,
    veo31Resolution: fal.veo31Resolution,
    veo31AspectRatio: fal.veo31AspectRatio,
    veo31GenerateAudio: fal.veo31GenerateAudio,
    wan27VideoResolution: fal.wan27VideoResolution,
    wan27VideoDuration: fal.wan27VideoDuration,
    wan27VideoAspectRatio: fal.wan27VideoAspectRatio,
    wan27VideoPromptExpansion: fal.wan27VideoPromptExpansion,
    wan27VideoVariant: fal.wan27VideoVariant,
    wan27VideoAudioSetting: fal.wan27VideoAudioSetting,
    seedance15AspectRatio: fal.seedance15AspectRatio,
    seedance15Resolution: fal.seedance15Resolution,
    seedance15Duration: fal.seedance15Duration,
    seedance15CameraFixed: fal.seedance15CameraFixed,
    seedance15Audio: fal.seedance15Audio,
    seedance2Variant: fal.seedance2Variant,
    seedance2JimengModelVersion: fal.seedance2JimengModelVersion,
    seedance2AspectRatio: fal.seedance2AspectRatio,
    seedance2Resolution: fal.seedance2Resolution,
    seedance2Duration: fal.seedance2Duration,
    seedance2GenerateAudio: fal.seedance2GenerateAudio,
    seedance2CameraFixed: fal.seedance2CameraFixed,
    flux2MaxImageSize: fal.flux2MaxImageSize,
    isWan27ImageModel: fal.isWan27ImageModel,
    wan27ImageAspectRatio: fal.wan27ImageAspectRatio,
    wan27ImageMaxImages: fal.wan27ImageMaxImages,
    recraftImageSize: fal.recraftImageSize,
    recraftBackgroundColor: fal.recraftBackgroundColor,
    recraftColors: fal.recraftColors,
    gptImage2Quality: fal.gptImage2Quality,
    krea2AspectRatio: fal.krea2AspectRatio,
    krea2Creativity: fal.krea2Creativity,
    falScaleFactor: fal.falScaleFactor,
    falCreativity: fal.falCreativity,
    falNoiseScale: fal.falNoiseScale,
    falImageSizeSelection: fal.falImageSizeSelection,
    falAspectRatioSelection: fal.falAspectRatioSelection,
    falResolutionSelection: fal.falResolutionSelection,
    falNumImages: fal.falNumImages,
    isLoading,
    onHailuoVariantChange: fal.handleHailuoVariantChange,
    onFalVideoDurationChange: fal.handleFalVideoDurationChange,
    onKlingVariantChange: fal.handleKlingVariantChange,
    onKlingV3DurationChange: fal.handleKlingV3DurationChange,
    onKlingV3GenerateAudioChange: fal.handleKlingV3GenerateAudioChange,
    onKlingV3CfgScaleChange: fal.handleKlingV3CfgScaleChange,
    onKlingV3MultiPromptEnabledChange: fal.handleKlingV3MultiPromptEnabledChange,
    onKlingV3Shot1DurationChange: fal.handleKlingV3Shot1DurationChange,
    onKlingV3Shot2DurationChange: fal.handleKlingV3Shot2DurationChange,
    onKlingO3VariantChange: fal.handleKlingO3VariantChange,
    onKlingO3DurationChange: fal.handleKlingO3DurationChange,
    onKlingO3GenerateAudioChange: fal.handleKlingO3GenerateAudioChange,
    onKlingO3KeepAudioChange: fal.handleKlingO3KeepAudioChange,
    onKlingV3ControlKeepSoundChange: fal.handleKlingV3ControlKeepSoundChange,
    onKlingV3ControlOrientationChange: fal.handleKlingV3ControlOrientationChange,
    onWanTargetResolutionChange: fal.handleWanTargetResolutionChange,
    onWanCreativityChange: fal.handleWanCreativityChange,
    onWanAnimateVariantChange: fal.handleWanAnimateVariantChange,
    onWanAnimateStepsChange: fal.handleWanAnimateStepsChange,
    onWanAnimateResolutionChange: fal.handleWanAnimateResolutionChange,
    onOneToAllAnimateResolutionChange: fal.handleOneToAllAnimateResolutionChange,
    onWanAnimateShiftChange: fal.handleWanAnimateShiftChange,
    onWanAnimateQualityChange: fal.handleWanAnimateQualityChange,
    onWanAnimateTurboChange: fal.handleWanAnimateTurboChange,
    onLipsyncSyncModeChange: fal.handleLipsyncSyncModeChange,
    onHeygenEnableCaptionChange: fal.handleHeygenEnableCaptionChange,
    onHeygenEnableDynamicDurationChange: fal.handleHeygenEnableDynamicDurationChange,
    onHeygenDisableMusicTrackChange: fal.handleHeygenDisableMusicTrackChange,
    onHeygenEnableSpeechEnhancementChange: fal.handleHeygenEnableSpeechEnhancementChange,
    onInfinitalkResolutionChange: fal.handleInfinitalkResolutionChange,
    onInfinitalkSeedChange: fal.handleInfinitalkSeedChange,
    onInfinitalkAccelerationChange: fal.handleInfinitalkAccelerationChange,
    onInfinitalkDurationChange: fal.handleInfinitalkDurationChange,
    onGrokImagineVideoDurationChange: fal.handleGrokImagineVideoDurationChange,
    onGrokImagineVideoResolutionChange: fal.handleGrokImagineVideoResolutionChange,
    onGrokImagineVideoAspectRatioChange: fal.handleGrokImagineVideoAspectRatioChange,
    onVeo31VariantChange: fal.handleVeo31VariantChange,
    onVeo31DurationChange: fal.handleVeo31DurationChange,
    onVeo31ResolutionChange: fal.handleVeo31ResolutionChange,
    onVeo31AspectRatioChange: fal.handleVeo31AspectRatioChange,
    onVeo31GenerateAudioChange: fal.handleVeo31GenerateAudioChange,
    onWan27VideoResolutionChange: fal.handleWan27VideoResolutionChange,
    onWan27VideoDurationChange: fal.handleWan27VideoDurationChange,
    onWan27VideoAspectRatioChange: fal.handleWan27VideoAspectRatioChange,
    onWan27VideoPromptExpansionChange: fal.handleWan27VideoPromptExpansionChange,
    onWan27VideoVariantChange: fal.handleWan27VideoVariantChange,
    onWan27VideoAudioSettingChange: fal.handleWan27VideoAudioSettingChange,
    onSeedance15AspectRatioChange: fal.handleSeedance15AspectRatioChange,
    onSeedance15ResolutionChange: fal.handleSeedance15ResolutionChange,
    onSeedance15DurationChange: fal.handleSeedance15DurationChange,
    onSeedance15CameraFixedChange: fal.handleSeedance15CameraFixedChange,
    onSeedance15AudioChange: fal.handleSeedance15AudioChange,
    onSeedance2VariantChange: fal.handleSeedance2VariantChange,
    onSeedance2JimengModelVersionChange: fal.handleSeedance2JimengModelVersionChange,
    onSeedance2AspectRatioChange: fal.handleSeedance2AspectRatioChange,
    onSeedance2ResolutionChange: fal.handleSeedance2ResolutionChange,
    onSeedance2DurationChange: fal.handleSeedance2DurationChange,
    onSeedance2GenerateAudioChange: fal.handleSeedance2GenerateAudioChange,
    onSeedance2CameraFixedChange: fal.handleSeedance2CameraFixedChange,
    onFlux2MaxImageSizeChange: fal.handleFlux2MaxImageSizeChange,
    onWan27ImageAspectRatioChange: fal.handleWan27ImageAspectRatioChange,
    onWan27ImageMaxImagesChange: fal.handleWan27ImageMaxImagesChange,
    onRecraftImageSizeChange: fal.handleRecraftImageSizeChange,
    onRecraftBackgroundColorChange: fal.handleRecraftBackgroundColorChange,
    onRecraftColorChange: fal.handleRecraftColorChange,
    onRecraftAddColor: fal.handleRecraftAddColor,
    onRecraftRemoveColor: fal.handleRecraftRemoveColor,
    onGptImage2QualityChange: fal.handleGptImage2QualityChange,
    onKrea2AspectRatioChange: fal.handleKrea2AspectRatioChange,
    onKrea2CreativityChange: fal.handleKrea2CreativityChange,
    onFalScaleFactorChange: fal.handleFalScaleFactorChange,
    onFalCreativityChange: fal.handleFalCreativityChange,
    onFalNoiseScaleChange: fal.handleFalNoiseScaleChange,
    onFalImageSizeChange: fal.handleFalImageSizeChange,
    onFalAspectRatioChange: fal.handleFalAspectRatioChange,
    onFalResolutionChange: fal.handleFalResolutionChange,
    onFalNumImagesChange: fal.handleFalNumImagesChange,
    shouldValidateFalOptions,
    isNumImagesInvalid,
  });
  const rawModelOptions = getPromptBarModelOptions(fal.falModelMode);
  const promptBarModelOptions = applyBlindTestMode(
    applyOpenSourceAliasMode(rawModelOptions, openSourceAliasEnabled),
    blindTestMappingRef.current,
    blindTestEnabled,
  );
  const providerLabels = useMemo<Record<ApiProviderId, string>>(() => ({
    google: PROVIDER_LABELS.google,
    fal: fal.isJimengSeedance2VideoModel
      ? 'JM CLI'
      : fal.isVolcengineSeedance2VideoModel ? 'VOLCENGINE' : PROVIDER_LABELS.fal,
  }), [fal.isJimengSeedance2VideoModel, fal.isVolcengineSeedance2VideoModel]);
  const shouldShowNegativePrompt = shouldShowVideoNegativePrompt || fal.isWan27ImageModel;
  const isCameraPromptAccentActive = isCameraSettingsEnabled && hasCameraSettings(cameraSettings);
  const promptOutlineColor = isCameraPromptAccentActive
    ? '#f59e0b'
    : shouldShowNegativePrompt ? '#34d399' : undefined;
  const negativePromptOutlineColor = shouldShowNegativePrompt ? '#f87171' : undefined;
  const activeNegativePrompt = generationNegativePrompt;
  const activeNegativePromptSetter = fal.isWan27ImageModel ? setWan27ImageNegativePrompt : setVideoNegativePrompt;
  const isMacDesktop = runtimeConfig.isDesktop && typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
  const hasNativeFileMenuBridge = isMacDesktop && typeof window !== 'undefined' && typeof window.canvaBananaDesktop?.fileMenu?.onCommand === 'function';
  const shouldShowReactFileMenu = !isMacDesktop; // macOS desktop uses the native application menu.
  const topControlRailStyle: React.CSSProperties = isMacDesktop
    ? { paddingLeft: '86px', paddingRight: FLOATING_EDGE_CONTROL_SIDE_OFFSET }
    : { paddingInline: FLOATING_EDGE_CONTROL_SIDE_OFFSET }; // Shift controls away from macOS traffic lights.
  const windowDragRegionStyle = { WebkitAppRegion: 'drag' } as React.CSSProperties; // Electron-only CSS for hidden titlebar dragging.

  useEffect(() => {
    if (!hasNativeFileMenuBridge) {
      return;
    }
    return window.canvaBananaDesktop?.fileMenu?.onCommand?.((command: DesktopFileMenuCommand) => {
      switch (command) {
        case 'importSnapshot':
          handleImportSnapshot();
          break;
        case 'exportSnapshot':
          void handleExportSnapshot();
          break;
        case 'openBackups':
          openBackupsModal();
          break;
        case 'toggleAutosave':
          handleToggleAutosave();
          break;
        case 'toggleZoomLevelBadge':
          handleToggleZoomLevelBadge();
          break;
        case 'openDebugLog':
          openDebugLogPanel();
          break;
        case 'openManageKeys':
          openDesktopSettings();
          break;
        case 'openChangeIcon':
          openDesktopAppIcon();
          break;
        case 'clearJimengCache':
          void jimengSetup.handleClearCache();
          break;
        default: {
          const exhaustiveCommand: never = command;
          return exhaustiveCommand;
        }
      }
    });
  }, [
    handleExportSnapshot,
    handleImportSnapshot,
    handleToggleAutosave,
    handleToggleZoomLevelBadge,
    hasNativeFileMenuBridge,
    jimengSetup.handleClearCache,
    openBackupsModal,
    openDesktopAppIcon,
    openDebugLogPanel,
    openDesktopSettings,
  ]);

  useEffect(() => {
    if (!hasNativeFileMenuBridge) {
      return;
    }
    void window.canvaBananaDesktop?.fileMenu?.setState?.({
      autosaveEnabled,
      showZoomLevelBadge,
      isClearingJimengCache: jimengSetup.isClearingCache,
    });
  }, [autosaveEnabled, hasNativeFileMenuBridge, jimengSetup.isClearingCache, showZoomLevelBadge]);

  // TSX (React with Tailwind CSS utility classes)
  return (
    <div className="h-screen w-screen bg-gray-800 text-white flex flex-col overflow-hidden">
      {/* Hidden file input for image/video/audio uploads */}
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,video/*,audio/*" className="hidden" />
      {/* Hidden file input for snapshot imports */}
      <input
        type="file"
        ref={snapshotInputRef}
        onChange={handleSnapshotFileChange}
        accept=".bcsnap,application/octet-stream,application/json,.json"
        className="hidden"
      />
      {isMacDesktop && (
        <div
          aria-hidden="true"
          className={`fixed inset-x-0 top-0 ${OVERLAY_LAYER_CLASS_NAMES.appBar} h-10`}
          data-testid="window-drag-region"
          style={windowDragRegionStyle}
        />
      )}
      {!isPresentationMode && (
        <div
          data-testid="top-control-rail"
          className="pointer-events-none absolute inset-x-0 top-4 z-30 grid h-12 grid-cols-[1fr_auto_1fr] items-center"
          style={topControlRailStyle}
        >
          <div className="flex items-center justify-start">
            {shouldShowReactFileMenu && (
              <FileMenu
                isOpen={isFileMenuOpen}
                onToggle={toggleFileMenu}
                onClose={closeFileMenu}
                onImportSnapshot={handleImportSnapshot}
                onExportSnapshot={handleExportSnapshot}
                onOpenBackups={openBackupsModal}
                autosaveEnabled={autosaveEnabled}
                onToggleAutosave={handleToggleAutosave}
                showZoomLevelBadge={showZoomLevelBadge}
                onToggleZoomLevelBadge={handleToggleZoomLevelBadge}
                onOpenDebugLog={openDebugLogPanel}
                onOpenDesktopSettings={hasDesktopSettingsBridge ? openDesktopSettings : undefined}
                onClearJimengCache={jimengSetup.handleClearCache}
                isClearingJimengCache={jimengSetup.isClearingCache}
              />
            )}
          </div>
          <div className="flex items-center justify-center">
            {/* Main toolbar, hidden during crop/transform */}
            {!cropMode && !transformMode && (
              <Toolbar
                activeTool={tool}
                onToolChange={handleToolChange}
                isVideoPromptAreaToolEnabled={canCreateVideoPromptAreas}
                appMode={appMode}
                onModeChange={handleModeChange}
                brushSize={brushSize}
                eraserSize={eraserSize}
                onBrushSizeChange={setBrushSize}
                onEraserSizeChange={setEraserSize}
                brushColor={brushColor}
                onBrushColorChange={setBrushColor}
                onClear={handleClear}
                hasClearablePaths={hasClearablePaths}
                onUploadClick={handleUploadClick}
                onUndo={undo}
                onRedo={redo}
                canUndo={canUndo}
                canRedo={canRedo}
                onDownload={handleDownload}
                isImageSelected={hasSingleImageSelected}
                isObjectSelected={selectedImageIds.length > 0 || selectedNoteIds.length > 0}
                onDelete={handleDelete}
                onResize={openResizeToast}
                isResizeDisabled={!canResize || isRemovingBackground || isResizing || isLoading}
                onRemoveBackground={handleBackgroundRemoval}
                isBackgroundRemovalDisabled={!hasSingleImageSelected || isRemovingBackground || isLoading}
                isBackgroundRemovalLoading={isRemovingBackground}
                isAnnotateModeDisabled={isAnnotateModeDisabled}
                isRecording={isRecording}
                onRecordToggle={handleRecordToggle}
                cameraSettings={cameraSettings}
                onCameraSettingsChange={setCameraSettings}
                cameraSettingsEnabled={isCameraSettingsEnabled}
              />
            )}
          </div>
          <div className="flex items-center justify-end">
            {showZoomLevelBadge && (
              <div
                className="pointer-events-none shrink-0 rounded-full border border-white/10 bg-gray-900/78 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-gray-100 shadow-lg backdrop-blur-sm"
                aria-label={`Canvas zoom ${formatZoomPercentage(canvasScale)}`}
              >
                Zoom {formatZoomPercentage(canvasScale)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recording overlay */}
      <RecordingOverlay duration={recordingDuration} visible={isRecording} />

      {/* Main drawing area */}
      <main className="relative z-0 flex-1 min-h-0">
        <Canvas
          images={displayedImages}
          onImagesChange={setLiveImages}
          notes={displayedNotes}
          onNotesChange={handleNotesChange}
          videoPromptAreas={displayedVideoPromptAreas}
          onVideoPromptAreasChange={handleVideoPromptAreasChange}
          videoPromptBars={displayedVideoPromptBars}
          onVideoPromptBarsChange={handleVideoPromptBarsChange}
          selectedVideoPromptAreaId={selectedVideoPromptAreaId}
          onVideoPromptAreaSelect={setSelectedVideoPromptAreaId}
          videoPromptAreaMemberships={videoPromptAreaMemberships}
          videoPromptAreaProfiles={videoPromptAreaProfiles}
          tool={tool}
          canCreateVideoPromptAreas={canCreateVideoPromptAreas}
          appMode={appMode}
          paths={displayedPaths}
          onPathsChange={setLivePaths}
          brushSize={brushSize}
          eraserSize={eraserSize}
          brushColor={brushColor}
          selectedImageIds={selectedImageIds}
          selectedNoteIds={selectedNoteIds}
          referenceImageIds={canvasReferenceImageIds}
          referenceVideoIds={canvasReferenceVideoIds}
          referenceAudioIds={canvasReferenceAudioIds}
          referenceImageOrderLabels={canvasReferenceOrderLabels}
          isKrea2StyleReferenceMode={isActiveKrea2LargeModel}
          krea2StyleReferenceImageIds={referenceImageIds}
          krea2StyleReferenceStrengths={krea2StyleReferenceStrengths}
          onKrea2StyleReferenceStrengthChange={handleKrea2StyleReferenceStrengthChange}
          disabledMediaIds={ignoredVideoPromptMediaIds}
          elementImageIds={Array.from(new Set([...elementImageIds, ...acceptedVideoPromptElementIds]))}
          elementImageOrderLabels={canvasElementOrderLabels}
          videoLastFrameImageId={videoLastFrameImageId}
          sourceVideoId={sourceVideoId}
          tailSelectionEnabled={supportsTailFrameSelection}
          isKlingO3VideoInputMode={isKlingO3VideoInputMode}
          isKlingO3ReferenceMode={isKlingO3ReferenceMode}
          isSeedance15FflfMode={fal.isSeedance15VideoModel}
          isKlingV3ControlVideoInputMode={fal.isKlingV3ControlVideoModel}
          isVeo31ExtendMode={isVeo31ExtendMode}
          isWanAnimateVideoInputMode={fal.isWanAnimateVideoModel || fal.isOneToAllAnimateVideoModel || isScailVideoModel}
          isWan27VideoMode={fal.isWan27VideoModel}
          onError={setError}
          onMediaPlaybackRejected={handleMediaPlaybackRejected}
          onImageSelect={handleImageSelection}
          onNoteSelect={handleNoteSelection}
          onSelectionReplace={replaceCanvasSelection}
          onCommit={handleCommit}
          onFilesDrop={handleFilesDrop}
          zoomToFitTrigger={zoomToFitTrigger}
          zoomToSelectionTrigger={zoomToSelectionTrigger}
          zoomInTrigger={zoomInTrigger}
          zoomOutTrigger={zoomOutTrigger}
          onScaleChange={setCanvasScale}
          editingNoteId={editingNoteId}
          onNoteDoubleClick={setEditingNoteId}
          onNoteTextChange={handleNoteTextChange}
          onNoteEditEnd={() => setEditingNoteId(null)}
          onImageOrderChange={handleImageOrderChange}
          isImageOverlapping={isImageOverlapping}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          cropMode={cropMode}
          onStartCrop={handleStartCrop}
          onCropRectChange={handleCropRectChange}
          onConfirmCrop={handleConfirmCrop}
          onCancelCrop={handleCancelCrop}
          onNoteCopy={handleNoteCopy}
          onNoteDuplicate={handleDuplicateNote}
          onNoteFontSizeChange={handleNoteFontSizeChange}
          onNoteColorChange={handleNoteColorChange}
          onVideoPromptAreaBorderColorChange={handleVideoPromptAreaBorderColorChange}
          onImagePromptCopy={handleImagePromptCopy}
          onImageDuplicate={handleDuplicateImage}
          onRerunGeneration={handleRerunGeneration}
          showMetadataOverlay={showMetadataOverlay}
          transformMode={transformMode}
          onStartTransform={handleStartTransform}
          onExitTransform={handleExitTransform}
          isLoading={isLoading}
          onVideoPromptBarFocus={setActiveEmbeddedPromptBarId}
          onVideoPromptBarBlur={(barId) => {
            setActiveEmbeddedPromptBarId(currentId => (currentId === barId ? null : currentId));
          }}
          onVideoPromptBarUpdate={handleEmbeddedPromptBarUpdate}
          onVideoPromptBarSubmit={handleEmbeddedVideoPromptSubmit}
          buildVideoPromptBarControls={buildEmbeddedVideoPromptBarControls}
          embeddedVideoPromptBarModelOptions={embeddedVideoPromptBarModelOptions}
          isPresentationMode={isPresentationMode}
        />
        {!isPresentationMode && (
          <ViewToolbar
            onZoomToFit={handleZoomToFit}
            disabled={images.length === 0 && notes.length === 0}
            metadataVisible={showMetadataOverlay}
            onToggleMetadata={() => setShowMetadataOverlay(prev => !prev)}
            blindTestEnabled={blindTestEnabled}
            openSourceAliasEnabled={openSourceAliasEnabled}
            onToggleBlindTest={handleBlindTestClick}
          />
        )}
      </main>

      {/* App chrome: every overlay below hides in presentation mode. RecordingOverlay (above)
          deliberately stays visible so presentations can be recorded. */}
      {!isPresentationMode && (<>
        <PromptChatPanel
          isOpen={isPromptChatOpen}
          isSuppressed={hasBlockingOverlay}
          currentPrompt={prompt}
          onToggle={() => setIsPromptChatOpen(prev => !prev)}
        />

      {/* Error/status banners */}
      {error && (
        <StatusBanner message={error} variant="error" onClose={() => setError(null)} />
      )}
      {toastMessage && (
        <StatusBanner message={toastMessage} variant="success" />
      )}
      <GenerationCanvasNotifications
        notifications={generationCanvasNotifications}
        onActivate={handleGenerationNotificationActivate}
        onDismiss={dismissGenerationNotification}
      />
      <BackupsModal
        isOpen={isBackupsOpen}
        isLoading={isBackupsLoading}
        sessions={backupSessions}
        onClose={closeBackupsModal}
        onRestore={handleRestoreBackup}
      />
      <DesktopSettingsModal
        isOpen={isDesktopSettingsOpen}
        onClose={() => setIsDesktopSettingsOpen(false)}
        initialStatus={desktopSettingsStatus}
        onStatusChange={setDesktopSettingsStatus}
        mode={desktopSettingsMode}
      />
      {hasDesktopAppIconBridge && (
        <DesktopAppIconModal
          isOpen={isDesktopAppIconOpen}
          onClose={() => setIsDesktopAppIconOpen(false)}
        />
      )}
      {isResizeToastOpen && (
        <ImageResizeToast
          width={resizeWidth}
          height={resizeHeight}
          onWidthChange={setResizeWidth}
          onHeightChange={setResizeHeight}
          keepAspect={resizeKeepAspect}
          onToggleKeepAspect={setResizeKeepAspect}
          isProcessing={isResizing}
          onCancel={cancelResizeToast}
          onConfirm={confirmResize}
        />
      )}

      {/* FAL job queue panel */}
      <FalQueuePanel
        jobs={falJobs}
        onDismiss={handleDismissFalJob}
        onRetry={handleRetryFalJob}
        blindTestEnabled={blindTestEnabled}
        openSourceAliasEnabled={openSourceAliasEnabled}
        blindTestMapping={blindTestMappingRef.current}
      />

      {jimengSetup.shouldShowPanel && (
        <JimengSetupPanel
          status={jimengSetup.status}
          isChecking={jimengSetup.isChecking}
          isInstalling={jimengSetup.isInstalling}
          isStartingLogin={jimengSetup.isStartingLogin}
          onInstall={jimengSetup.handleInstall}
          onLogin={() => jimengSetup.handleLogin(false)}
          onDebugLogin={() => jimengSetup.handleLogin(true)}
          onRefresh={jimengSetup.refreshStatus}
          onDismiss={jimengSetup.dismiss}
        />
      )}

      {jimengSetup.shouldShowReopen && (
        <button
          type="button"
          onClick={jimengSetup.reopen}
          className={`fixed right-4 top-20 ${OVERLAY_LAYER_CLASS_NAMES.floatingPanel} rounded-md border border-cyan-300/25 bg-gray-950/92 px-3 py-2 text-xs font-semibold text-cyan-100 shadow-2xl shadow-black/40 backdrop-blur-md transition-colors hover:bg-cyan-300/12`}
          aria-label="Reopen Jimeng setup"
        >
          Jimeng Setup
        </button>
      )}

      {/* Debug log panel */}
      {isDebugLogOpen && (
        <DebugLogPanel
          entries={debugLogEntries}
          onClose={closeDebugLogPanel}
          onClear={clearDebugLogs}
          onCopy={copyLastEntry}
        />
      )}

      {/* Provider switcher (if available and not cropping/transforming) */}
      {!cropMode && !transformMode && AVAILABLE_PROVIDERS.length > 0 && (
        <ProviderSwitcher
          providers={AVAILABLE_PROVIDERS}
          activeProvider={apiProvider}
          labels={providerLabels}
          disabled={isLoading}
          onSelect={setApiProvider}
        />
      )}

      {/* Prompt bar (if not cropping/transforming) */}
      {!cropMode && !transformMode && (
        <PromptBar
          prompt={prompt}
          onPromptChange={setPrompt}
          onSubmit={handlePromptSubmit}
          isLoading={isLoading}
          inputDisabled={disablePromptInput || isEmbeddedPromptBarActive}
          submitDisabled={submitDisabled || isEmbeddedPromptBarActive || jimengSetup.shouldBlockSelectedSubmit}
          modelOptions={promptBarModelOptions}
          selectedModel={fal.falModelId}
          onModelChange={fal.handleFalModelChange}
          modelSelectDisabled={apiProvider !== 'fal' || isLoading}
          modelMode={fal.falModelMode}
          onModelModeChange={handleModelModeChange}
          modelModeDisabled={apiProvider !== 'fal' || isLoading}
          modelControls={promptBarModelControls}
          promptPlaceholder={
            fal.isSeedance2VideoModel
              ? (fal.isJimengSeedance2VideoModel
                ? (fal.seedance2Variant === 'reference'
                  ? `Seedance 2 (JM CLI) Reference: select or shift-click up to ${SEEDANCE_REFERENCE_IMAGE_LIMIT} images, ${SEEDANCE_REFERENCE_VIDEO_LIMIT} videos, and ${SEEDANCE_REFERENCE_AUDIO_LIMIT} audio clips to label them as @Image1, @Video1, or @Audio1, then describe the scene... (Cmd/Ctrl + Enter to generate)`
                  : 'Seedance 2 (JM CLI) Smart: write a prompt for text-to-video, or select one image to use as the first frame... (Cmd/Ctrl + Enter to generate)')
                : fal.seedance2Variant === 'reference'
                ? `Seedance 2 Reference: select or shift-click up to ${SEEDANCE_REFERENCE_IMAGE_LIMIT} images, ${SEEDANCE_REFERENCE_VIDEO_LIMIT} videos, and ${SEEDANCE_REFERENCE_AUDIO_LIMIT} audio clips to label them as @Image1, @Video1, or @Audio1, then describe the scene... (Cmd/Ctrl + Enter to generate)`
                : 'Seedance 2 Smart: write a prompt for text-to-video, or select an image to use as the first frame. Shift-click another still image to mark an end frame... (Cmd/Ctrl + Enter to generate)')
              : fal.isWan27ImageModel
              ? 'Describe your generation, or your edit, or use @ to reference images (4 images in total)... (Cmd/Ctrl + Enter to generate)'
              : fal.isKlingO3VideoModel
                ? (isKlingO3ReferenceMode
                  ? 'Kling O3 Reference: click a start image, Shift-click an end image, Option/Alt-click elements (@Element1), Option/Alt+Shift-click reference images (@Image1)...'
                  : 'Kling O3 Edit: click a source video, Option/Alt-click elements, Shift-click reference images, then describe the edit... (Cmd/Ctrl + Enter to generate)')
              : fal.isFlux2MaxModel
                ? 'Describe your generation, use @ to reference images and elements(objects and characters)... (Cmd/Ctrl + Enter to generate)'
                : promptPlaceholderText
          }
          showNegativePrompt={shouldShowNegativePrompt}
          showMultiPrompt={fal.isKlingV3VideoModel && fal.klingV3MultiPromptEnabled}
          multiPrompt={fal.klingV3MultiPrompt}
          onMultiPromptChange={fal.handleKlingV3MultiPromptChange}
          multiPromptPlaceholder="Describe the second Kling 3.0 Pro shot... (Cmd/Ctrl + Enter to generate)"
          multiPromptOutlineColor={fal.isKlingV3VideoModel && fal.klingV3MultiPromptEnabled ? '#38bdf8' : undefined}
          negativePrompt={activeNegativePrompt}
          onNegativePromptChange={activeNegativePromptSetter}
          negativePromptPlaceholder={fal.isWan27ImageModel ? 'Describe what the image should avoid... (optional)' : 'Describe what the video should avoid... (optional)'}
          promptOutlineColor={promptOutlineColor}
          negativePromptOutlineColor={negativePromptOutlineColor}
          cameraThemeActive={isCameraPromptAccentActive}
          klingSuggestionsEnabled={fal.isKlingO3VideoModel || isSeedance2ReferenceMode || fal.isFlux2MaxModel || fal.isWan27ImageModel}
          klingReferenceCount={klingReferenceCount}
          klingSuggestionOptions={klingPromptMentions}
          sizeMode={isEmbeddedPromptBarActive ? 'mini' : 'full'}
          leadingAccessory={shouldShowVideoPromptBarAccessory ? (
            <Tooltip label="Create video prompt bar">
              <button
                type="button"
                onClick={handleCreateVideoPromptBar}
                disabled={isLoading}
                className={`flex shrink-0 self-start items-center justify-center rounded-2xl bg-gray-900/70 text-white shadow-xl transition-all duration-300 ease-out hover:bg-gray-800/80 disabled:cursor-not-allowed disabled:opacity-45 ${isEmbeddedPromptBarActive ? 'h-[2.28rem] w-[2.28rem]' : 'h-[3.2rem] w-[3.2rem]'}`}
                aria-label="Create video prompt bar"
              >
                <PlusIcon className="h-4 w-4" />
              </button>
            </Tooltip>
          ) : undefined}
        />
      )}
      </>)}
    </div>
  );
}
