import React, { useState, useRef, useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { createValueStore, type ValueStore } from './utils/valueStore';
import { Toolbar } from './components/Toolbar';
import { PromptBar } from './components/PromptBar';
import { Canvas, type PanToAnchorRequest } from './components/Canvas';
import { MIN_STROKE_SIZE, MAX_STROKE_SIZE, KEYBOARD_STROKE_STEP } from './components/canvas/constants';
import { RecordingOverlay } from './components/RecordingOverlay';
import { BackupsModal } from './components/BackupsModal';
import {
  Tool,
  AppMode,
  ApiProviderId,
  type CanvasNote,
  type CanvasImage,
  type Point,
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
import { NotesPanel, type NotesPanelFocusRequest } from './components/NotesPanel';
import {
  GROK_IMAGINE_IMAGE_MODEL_ID, // Grok Imagine model id.
  GROK_IMAGINE_VIDEO_MODEL_ID,
  isGptImage2EditModelId,
  isNanoBananaEditModelId,
  SCAIL_VIDEO_MODEL_ID,
  KLING_V3_VIDEO_MODEL_ID,
  KLING_VIDEO_MODEL_ID,
  KLING_V3_CONTROL_VIDEO_MODEL_ID,
  HEYGEN_V3_LIPSYNC_MODEL_ID,
  SYNC_LIPSYNC_MODEL_ID,
  INFINITALK_VIDEO_MODEL_ID,
  VEO_31_IMAGE_TO_VIDEO_MODEL_ID,
  WAN_27_VIDEO_MODEL_ID,
  MINIMAX_H3_VIDEO_MODEL_ID,
  FLUX_3_VIDEO_MODEL_ID,
  WAN_ANIMATE_MODEL_ID,
  WAN_VISION_ENHANCER_MODEL_ID,
  SEEDANCE_15_VIDEO_MODEL_ID,
  SEEDREAM_V45_MODEL_ID,
  SEEDANCE_2_VIDEO_MODEL_ID,
  FAL_SEEDANCE_2_VIDEO_MODEL_ID,
  FAL_SEEDANCE_25_VIDEO_MODEL_ID,
  JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
  JIMENG_SEEDANCE_25_VIDEO_MODEL_ID,
  JIMENG_MULTIFRAME_MAX_IMAGES,
  JIMENG_MULTIFRAME_MIN_IMAGES,
  JIMENG_MULTIFRAME_VIDEO_MODEL_ID,
  FAL_VIDEO_MODEL_OPTIONS,
  WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID,
  WAN_27_IMAGE_DEFAULT_NEGATIVE_PROMPT,
  getFalModelLabel,
  isKlingO3VideoModelId,
  KREA_2_MAX_STYLE_REFERENCES,
  isSeedreamModelId,
  getVolcengineSafeSeedance2Settings,
  isSeedance2VolcengineModel,
  isSeedance2OutputFormatSelectionValue,
  normalizeMiniMaxH3AspectRatioForVariant,
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
import { SnapshotFileName } from './components/SnapshotFileName';
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
import { useFlux3PromptState } from './hooks/useFlux3PromptState';
import { useVideoNegativePrompt } from './hooks/useVideoNegativePrompt';
import { useFalQueueJobs } from './hooks/useFalQueueJobs';
import { useBlockingOverlays } from './hooks/useBlockingOverlays';
import { useJimengSetup } from './hooks/useJimengSetup';
import { useGenerationCanvasNotifications, type GenerationCanvasNotification } from './hooks/useGenerationCanvasNotifications';
import { useGenerationPromptBarTransfer } from './hooks/useGenerationPromptBarTransfer';
import { useFileNameVisibility } from './hooks/useFileNameVisibility';
import { useTrackpadMode } from './hooks/useTrackpadMode';
import { useCanvasStressHarness } from './hooks/useCanvasStressHarness';
import { useBackupsManager } from './hooks/useBackupsManager';
import { writeClipboardText } from './services/clipboardService';
import type { FalModelMode } from './services/modelConfig';
import {
  buildEffectiveSeedanceReferenceIds,
  SEEDANCE_REFERENCE_AUDIO_LIMIT,
  SEEDANCE_REFERENCE_IMAGE_LIMIT,
  SEEDANCE_REFERENCE_VIDEO_LIMIT,
  getSeedance2VolcengineReferenceLimits,
} from './utils/seedanceReferences';
import { SEEDANCE25_REFERENCE_AUDIO_LIMIT, SEEDANCE25_REFERENCE_IMAGE_LIMIT, SEEDANCE25_REFERENCE_VIDEO_LIMIT } from './utils/seedance25References';
import {
  buildEmbeddedVideoGenerationOverrides,
  buildVideoPromptAreaMembership,
  getEmbeddedVideoPromptBarModelId,
  getVideoPromptAreaCapabilityProfile,
  isUsableVideoPromptAreaModel,
  getAreaPromptBarRect,
} from './utils/videoPromptAreas';
import {
  buildEmbeddedFlux3PromptState,
  updateEmbeddedFlux3Duration,
  updateEmbeddedFlux3KeyframeTiming,
  updateEmbeddedFlux3Variant,
} from './utils/embeddedFlux3';
import {
  buildEmbeddedVideoGenerationProviderInput,
  getEmbeddedBarFalOptions,
  getJimengSafeSeedance2Resolution,
  isJimengEmbeddedVideoModel,
} from './utils/embeddedVideoRouting';
import { markCanvasMediaStoppedByIds, stopCanvasMediaPlaybackByIds } from './utils/canvasMediaPlayback';
import { getCanvasImagePrompt } from './utils/canvasImagePrompt';
import { applyGenerationPlacementSelection } from './utils/generationPlacementSelection';
import { getGenerationTransferBlockReason } from './utils/generationPromptBarTransfer';
import { FLOATING_EDGE_CONTROL_SIDE_OFFSET } from './utils/promptBarFooterLayout';
import { OVERLAY_LAYER_CLASS_NAMES } from './utils/overlayLayers';
import { normalizeKrea2StyleStrength } from './utils/krea2StyleStrength';
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

// Reads the zoom level from an external store so wheel-zoom updates re-render only this
// badge instead of the whole App tree.
function ZoomLevelBadge({ store, trackpadMode }: { store: ValueStore<number>; trackpadMode: boolean }) {
  const canvasScale = useSyncExternalStore(store.subscribe, store.get);
  return (
    <div
      className="pointer-events-none flex shrink-0 items-center rounded-full border border-white/10 bg-gray-900/78 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-gray-100 shadow-lg backdrop-blur-sm"
      aria-label={`Canvas zoom ${formatZoomPercentage(canvasScale)}${trackpadMode ? ', Trackpad mode on' : ''}`}
    >
      <span>Zoom {formatZoomPercentage(canvasScale)}</span>
      {trackpadMode && (
        <span className="ml-2 border-l border-cyan-300/30 pl-2 text-[10px] tracking-[0.12em] text-cyan-200">
          Trackpad
        </span>
      )}
    </div>
  );
}

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
  const hasCanvasVisualContent = displayedImages.length > 0 || displayedNotes.some(note => note.anchor); // Panel-only notes leave the canvas empty.

  // Brush/annotate layers (paths) are the only things we clear with the eraser button.
  const hasClearablePaths = displayedPaths.some(
    path =>
      path.tool === Tool.ANNOTATE &&
      path.points.length > 0
  );
  // Notes side panel state: open/close, focus-a-note requests, canvas pan-to-pin requests, and the pin label counter.
  const [isNotesPanelOpen, setIsNotesPanelOpen] = useState(false);
  const [notesPanelFocusRequest, setNotesPanelFocusRequest] = useState<NotesPanelFocusRequest | null>(null);
  const [panToAnchorRequest, setPanToAnchorRequest] = useState<PanToAnchorRequest | null>(null);
  const noteLabelCounterRef = useRef(1); // Monotonic — labels are never reused after deletion.

  // State to track if the app is currently performing a loading operation
  const [isLoading, setIsLoading] = useState(false);

  // State for error message display (null if no error)
  const [error, setError] = useState<string | null>(null);

  // Triggers to control zoom-to-fit, zoom-to-selection, zoom-in, and zoom-out actions (increment to trigger effect)
  const [zoomToFitTrigger, setZoomToFitTrigger] = useState(0);
  const [zoomToSelectionTrigger, setZoomToSelectionTrigger] = useState(0);
  const [zoomInTrigger, setZoomInTrigger] = useState(0);
  const [zoomOutTrigger, setZoomOutTrigger] = useState(0);
  const canvasScaleStore = useMemo(() => createValueStore(1), []);
  const [showZoomLevelBadge, setShowZoomLevelBadge] = useState(true);
  const { showFileName, toggleFileName } = useFileNameVisibility(); // The user's View-menu choice survives desktop relaunches.
  const { trackpadMode, toggleTrackpadMode } = useTrackpadMode(); // Trackpad zoom remains an explicit persisted opt-in.
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
  const { falJobs, setFalJobs, dismissFalJob: handleDismissFalJob, invalidateJobOutputs } = useFalQueueJobs();

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
    onCacheCleared: invalidateJobOutputs,
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
    setVideoNegativePromptForModel,
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

  // App-owned blocking overlays (file menu, backups, desktop settings, app icon, debug log).
  const {
    isFileMenuOpen,
    closeFileMenu,
    toggleFileMenu,
    setIsFileMenuOpen,
    isBackupsOpen,
    setIsBackupsOpen,
    isDesktopSettingsOpen,
    setIsDesktopSettingsOpen,
    isDesktopAppIconOpen,
    setIsDesktopAppIconOpen,
    desktopSettingsMode,
    setDesktopSettingsMode,
    openAppOwnedBlockingOverlay,
    hasBlockingOverlay,
    isDebugLogOpen,
    debugLogEntries,
    openDebugLogPanel,
    closeDebugLogPanel,
    copyLastEntry,
  } = useBlockingOverlays();
  const [desktopSettingsStatus, setDesktopSettingsStatus] = useState<DesktopSettingsStatus | null>(null);
  const hasDesktopSettingsBridge = typeof window !== 'undefined' && Boolean(window.canvaBananaDesktop?.getSettingsStatus);
  const hasDesktopAppIconBridge = typeof window !== 'undefined' && Boolean(window.canvaBananaDesktop?.appIcon?.getState);
  // Autosave is opt-out; user can disable it in the file menu.
  const [autosaveEnabled, setAutosaveEnabled] = useState(true);
  // Increment after each successful generation to trigger autosave.
  const [generationTick, setGenerationTick] = useState(0);

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
    if (usingFalProvider && fal.isMiniMaxH3VideoModel && fal.miniMaxH3Variant === 'reference') {
      setToastMessage(`MiniMax H3 Reference supports up to ${SEEDANCE_REFERENCE_IMAGE_LIMIT} image references.`);
      setTimeout(() => setToastMessage(null), 4000);
      return;
    }
    if (usingFalProvider && fal.isMiniMaxH3VideoModel) {
      setToastMessage('MiniMax H3 Standard does not use references. Tagged references were cleared.'); // Standard runs drop them at submit, so say so up front.
      setTimeout(() => setToastMessage(null), 4000);
      return;
    }
    if (usingFalProvider && fal.isSeedance25VideoModel && fal.seedance25Variant === 'reference') {
      setToastMessage(`Seedance 2.5 Reference supports up to ${SEEDANCE25_REFERENCE_IMAGE_LIMIT} image references.`);
      setTimeout(() => setToastMessage(null), 4000);
      return;
    }
    if (usingFalProvider && fal.isSeedance25VideoModel) {
      setToastMessage('Seedance 2.5 Smart doesn\'t use references — tagged references were removed. Switch to Reference mode to use them.'); // Smart runs drop them at submit, so say so up front.
      setTimeout(() => setToastMessage(null), 4000);
      return;
    }
    if (usingFalProvider && fal.falModelId === FAL_SEEDANCE_2_VIDEO_MODEL_ID && fal.seedance2Variant === 'smart') {
      setToastMessage('Seedance 2 Smart doesn\'t use references — tagged references were removed. Switch to Reference mode to use them.'); // FAL Smart runs drop them at submit, so say so up front.
      setTimeout(() => setToastMessage(null), 4000);
      return;
    }
    const totalLimit = maxReferenceImages + 1;
    const referenceLimitLabel = usingFalProvider ? getFalModelLabel(fal.falModelId) : PROVIDER_LABELS.google; // Match label to active provider.
    setToastMessage(`${referenceLimitLabel} supports up to ${maxReferenceImages} reference images (${totalLimit} total including the primary).`);
    setTimeout(() => setToastMessage(null), 2000);
  }, [apiProvider, fal.falModelId, fal.isKlingO3EditMode, fal.isKrea2LargeModel, fal.isMiniMaxH3VideoModel, fal.isSeedance25VideoModel, fal.miniMaxH3Variant, fal.seedance2Variant, fal.seedance25Variant, setToastMessage]);

  const isKlingO3ReferenceMode = fal.isKlingO3VideoModel && fal.klingO3Variant === 'reference';
  const isVeo31TailCapable = fal.isVeo31VideoModel && fal.veo31Variant === 'i2v-fflf';
  const isVeo31ExtendMode = fal.isVeo31VideoModel && fal.veo31Variant === 'extend';
  const isScailVideoModel = fal.isVideoMode && fal.falVideoModelId === SCAIL_VIDEO_MODEL_ID;
  const isWan27ReferenceMode = fal.isWan27VideoModel && fal.wan27VideoVariant === 'reference'; // Wan Reference labels tagged image/video refs.
  const isWan27EditMode = fal.isWan27VideoModel && fal.wan27VideoVariant === 'edit'; // Wan Edit uses a source video instead of an end frame.
  const isMiniMaxH3ReferenceMode = fal.isMiniMaxH3VideoModel && fal.miniMaxH3Variant === 'reference';
  const isMiniMaxH3StandardMode = fal.isMiniMaxH3VideoModel && fal.miniMaxH3Variant === 'standard';
  const isFlux3KeyframesMode = fal.isFlux3VideoModel && fal.flux3Variant === 'keyframes';
  const isFlux3FflfMode = fal.isFlux3VideoModel && fal.flux3Variant === 'first-last-frame';
  const supportsTailFrameSelection = fal.isKlingProVideoSelection
    || fal.isKlingV3VideoModel
    || isKlingO3ReferenceMode
    || isVeo31TailCapable
    || (fal.isWan27VideoModel && !isWan27ReferenceMode && !isWan27EditMode)
    || fal.isSeedance15VideoModel
    || isMiniMaxH3StandardMode
    || isFlux3FflfMode
    || (fal.isSeedance25VideoModel && fal.seedance25Variant === 'smart')
    || (fal.isSeedance2VideoModel && fal.seedance2Variant === 'smart'); // End-frame capable modes.
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
    setReferenceImageIds,
    setReferenceVideoIds,
    setReferenceAudioIds,
    setSeedanceReferenceOrderIds,
    setElementImageIds,
    setVideoLastFrameImageId,
    setSourceVideoId,
    setSourceAudioId,
    handleImageSelection,
    replaceCanvasSelection,
  } = selection;

  const [krea2StyleReferenceStrengths, setKrea2StyleReferenceStrengths] = useState<Record<string, number>>({});
  const resetMetadataEditContext = useCallback(() => {
    setAppMode('CANVAS'); // Loaded edits use the normal canvas workflow.
    setTool(Tool.SELECTION); // A neutral selection avoids reusing the current brush tool.
  }, []); // Existing strokes belong to the user, so loading metadata never erases them.
  const { handleMetadataToPromptBar, promptFocusRequestToken } = useGenerationPromptBarTransfer({
    displayedImages,
    providerAvailability,
    applyGenerationSettings: fal.applyGenerationSettings,
    selection,
    setApiProvider,
    setPrompt,
    setCameraSettings,
    setActiveEmbeddedPromptBarId,
    setSelectedVideoPromptAreaId,
    setVideoNegativePromptForModel,
    setWan27ImageNegativePrompt,
    setKrea2StyleReferenceStrengths,
    setToastMessage,
    resetEditContext: resetMetadataEditContext,
  }); // Transfer state and compatibility policy stay outside the root component.
  const getMetadataTransferBlockReason = useCallback((imageId: string): string | null => (
    getGenerationTransferBlockReason(displayedImages.find(image => image.id === imageId)?.metadata?.generation, providerAvailability)
  ), [displayedImages]); // The toolbar disables the action instead of letting it replace the prompt and fail.
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
    if (selectedImageIds.length === 0) {
      return;
    }
    setZoomToSelectionTrigger(prev => prev + 1);
  }, [selectedImageIds.length]);

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
      modelId: fal.isSeedance2VideoModel || fal.isSeedance25VideoModel || fal.falVideoModelId === JIMENG_MULTIFRAME_VIDEO_MODEL_ID ? fal.falVideoModelId : SEEDANCE_2_VIDEO_MODEL_ID,
      ...(fal.falVideoModelId === JIMENG_MULTIFRAME_VIDEO_MODEL_ID ? { falOptions: {
        multiframeDuration: fal.jimengMultiframeDuration,
        multiframeResolution: fal.jimengMultiframeResolution,
      } } : fal.isSeedance25VideoModel ? { falOptions: {
        seedance25Variant: fal.seedance25Variant,
        seedance25AspectRatio: fal.seedance25AspectRatio,
        seedance25Resolution: fal.seedance25Resolution,
        seedance25Duration: fal.seedance25Duration,
        seedance25GenerateAudio: fal.seedance25GenerateAudio,
      } } : {}),
      seedance2Variant: 'reference',
      seedance2JimengModelVersion: fal.seedance2JimengModelVersion,
      seedance2VolcengineModel: fal.seedance2VolcengineModel,
      seedance2AspectRatio: '16:9',
      seedance2Resolution: '720p',
      seedance2Duration: '5',
      seedance2GenerateAudio: false,
      seedance2CameraFixed: false,
      seedance2OutputFormat: fal.seedance2OutputFormat,
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
  }, [displayedVideoPromptAreas, fal.falVideoModelId, fal.isSeedance2VideoModel, fal.isSeedance25VideoModel, fal.jimengMultiframeDuration, fal.jimengMultiframeResolution, fal.seedance25AspectRatio, fal.seedance25Duration, fal.seedance25GenerateAudio, fal.seedance25Resolution, fal.seedance25Variant, fal.seedance2JimengModelVersion, fal.seedance2OutputFormat, fal.seedance2VolcengineModel, selectedVideoPromptAreaId, setError, setState]);

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

  const selectedStillImageCount = useMemo(
    () => selectedImageIds.filter(id => images.find(img => img.id === id)?.mediaType === 'image').length,
    [images, selectedImageIds],
  );
  const hasSelectedStillImage = selectedStillImageCount > 0;
  // Handles snapshot import/export so canvases can be saved, loaded, or shared.
  const {
    activeSnapshotFileName,
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
    noteLabelCounterRef,
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
    setReferenceImageIds,
    setTool,
    setError,
    setToastMessage,
    setLiveImages,
    handleCommit,
  });

  useCanvasStressHarness(handleCommit); // Dev-only synthetic media command lives outside App wiring.

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
    duplicateImage: handleDuplicateImage,
  } = useDuplicateCanvasMedia({
    displayedImages,
    setState,
    setSelectedImageIds,
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
    if (selectedImageIds.length === 0) {
      return;
    }

    stopCanvasMediaPlaybackByIds(images, selectedImageIds); // Stop videos/audio before their canvas nodes disappear.

    // Remove selected images while keeping other canvas content untouched.
    setState(prevState => ({
      ...prevState,
      images: prevState.images.filter(img => !selectedImageIds.includes(img.id)),
      videoPromptAreas: prevState.videoPromptAreas.map(area => ({
        ...area,
        orderedMediaIds: area.orderedMediaIds.filter(mediaId => !selectedImageIds.includes(mediaId)),
      })),
    }));

    setSelectedImageIds([]);
    setReferenceImageIds([]);
    setElementImageIds([]);
    setVideoLastFrameImageId(null);
  }, [images, selectedImageIds, setState]);

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
    setSelectedVideoPromptAreaId,
    setSourceAudioId,
    setSourceVideoId,
    setTool,
    setVideoLastFrameImageId,
  ]);

  const handleGenerationPlaced = useCallback((payload: GenerationPlacedPayload) => {
    notifyGenerationPlaced(payload); // Arrival only announces the media; selection changes after an explicit user action.
  }, [notifyGenerationPlaced]);

  // Backup listing/restore state lives behind the backups modal.
  const {
    backupSessions,
    isBackupsLoading,
    openBackupsModal,
    closeBackupsModal,
    handleRestoreBackup,
  } = useBackupsManager({
    isBackupsOpen,
    setIsBackupsOpen,
    openAppOwnedBlockingOverlay,
    importSnapshotFromFile: handleImportSnapshotFromFile,
    setError,
  });

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
    // Changing tools finalizes any in-progress crop sessions to keep state consistent.
    setTool(newTool);
    if (cropMode) {
      handleCancelCrop();
    }
  }, [canCreateVideoPromptAreas, cropMode, handleCancelCrop]);

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

  const focusNoteInPanel = useCallback((noteId: string) => {
    setIsNotesPanelOpen(true);
    setNotesPanelFocusRequest(prev => ({ noteId, token: (prev?.token ?? 0) + 1 }));
  }, []);

  // Creates a note and opens it in the panel. With an anchor (NOTE-tool canvas click) it
  // becomes a numbered pin; without one ("+" in the panel) it lives only in the panel.
  // Both mutations commit on top of displayedNotes so un-blurred textarea edits staged in
  // liveNotes land in the same history entry instead of overwriting the mutation later.
  const createNote = useCallback((anchor?: Point) => {
    const newNote: CanvasNote = {
      id: crypto.randomUUID(),
      text: '',
      ...(anchor ? { label: noteLabelCounterRef.current++, anchor: { ...anchor } } : {}),
    };
    handleCommit({ notes: [...displayedNotes, newNote] });
    focusNoteInPanel(newNote.id);
  }, [displayedNotes, focusNoteInPanel, handleCommit]);

  const handleAddPanelNote = useCallback(() => {
    createNote();
  }, [createNote]);

  const handleDeleteNote = useCallback((noteId: string) => {
    // Undoable; removes the canvas pin along with the note.
    handleCommit({ notes: displayedNotes.filter(note => note.id !== noteId) });
  }, [displayedNotes, handleCommit]);

  // Clicking a note's pin badge in the panel pans the canvas to its anchor.
  const handleJumpToAnchor = useCallback((anchor: Point) => {
    setPanToAnchorRequest(prev => ({ x: anchor.x, y: anchor.y, token: (prev?.token ?? 0) + 1 }));
  }, []);

  const toggleNotesPanel = useCallback(() => {
    setIsNotesPanelOpen(prev => !prev);
  }, []);

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
  const isAnnotateModeDisabled = fal.isVideoMode || fal.isFlux2MaxModel || fal.isUpscaleModel;

  useEffect(() => {
    if (appMode === 'ANNOTATE' && isAnnotateModeDisabled) {
      handleModeChange('CANVAS');
    }
  }, [appMode, handleModeChange, isAnnotateModeDisabled]);

  const isSeedance2ReferenceMode = fal.isSeedance2VideoModel && (
    fal.seedance2Variant === 'reference'
    || (fal.falVideoModelId === SEEDANCE_2_VIDEO_MODEL_ID && (fal.seedance2Variant === 'edit' || fal.seedance2Variant === 'extend'))
  ); // Seedance multimodal modes label the merged selected and tagged refs; Edit/Extend stay Volcengine-only.
  const seedance2ReferenceLimits = getSeedance2VolcengineReferenceLimits(
    fal.falVideoModelId === SEEDANCE_2_VIDEO_MODEL_ID ? fal.seedance2VolcengineModel : 'standard',
  ); // Only the Volcengine selector can opt into the larger Seedance 2.5 reference envelope.
  const seedance2ReferenceModelLabel = fal.falVideoModelId === SEEDANCE_2_VIDEO_MODEL_ID && fal.seedance2VolcengineModel === 'seedance25'
    ? 'Seedance 2.5'
    : 'Seedance 2';
  const isSeedance25ReferenceMode = fal.isSeedance25VideoModel && fal.seedance25Variant === 'reference';
  const isMultimodalReferenceMode = isSeedance2ReferenceMode || isSeedance25ReferenceMode || isMiniMaxH3ReferenceMode || isFlux3KeyframesMode;
  const {
    referenceImageIds: effectiveSeedanceReferenceImageIds,
    referenceVideoIds: effectiveSeedanceReferenceVideoIds,
    referenceAudioIds: effectiveSeedanceReferenceAudioIds,
  } = useMemo(() => buildEffectiveSeedanceReferenceIds({
    enabled: isMultimodalReferenceMode,
    images,
    selectedImageIds,
    referenceImageIds,
    referenceVideoIds,
    referenceAudioIds,
    orderedReferenceIds: seedanceReferenceOrderIds,
  }), [images, isMultimodalReferenceMode, referenceAudioIds, referenceImageIds, referenceVideoIds, seedanceReferenceOrderIds, selectedImageIds]);
  const {
    modePolicy: flux3ModePolicy,
    runPlan: flux3RunPlan,
    keyframeError: flux3KeyframeError,
    canvasLabels: flux3CanvasLabels,
    promptMentions: flux3PromptMentions,
    handleDurationChange: handleFlux3DurationChange,
    handleKeyframeTimingChange: handleFlux3KeyframeTimingChange,
  } = useFlux3PromptState({
    settings: fal,
    prompt,
    primaryImageId: activePrimaryImage?.id ?? null,
    lastFrameImageId: videoLastFrameImageId,
    referenceImageIds: effectiveSeedanceReferenceImageIds,
    sourceVideoId,
    selectedMediaIds: selectedImageIds,
  });
  const {
    referenceOrderLabels: klingReferenceOrderLabels,
    elementOrderLabels: klingElementOrderLabels,
  } = useKlingReferenceHelpers({
    labelReferences: fal.isKlingO3VideoModel || isMultimodalReferenceMode || isWan27ReferenceMode || fal.isFlux2MaxModel || fal.isWan27ImageModel || fal.isFlux3VideoModel,
    primaryImageId,
    primaryImageMediaType: primarySelectionMediaType,
    includePrimaryImageAsReference: !isKlingO3ReferenceMode && !isMultimodalReferenceMode && !isWan27ReferenceMode, // Only API prompt references get @Image labels.
    referenceImageIds: isMultimodalReferenceMode ? effectiveSeedanceReferenceImageIds : referenceImageIds,
    referenceVideoIds: isMultimodalReferenceMode ? effectiveSeedanceReferenceVideoIds : referenceVideoIds,
    referenceAudioIds: isMultimodalReferenceMode ? effectiveSeedanceReferenceAudioIds : referenceAudioIds,
    labelElements: fal.isKlingO3VideoModel,
    elementImageIds,
    isEditMode: isKlingO3VideoInputMode,
    sourceVideoId,
    includeTailFrame: isFlux3FflfMode,
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
  // Stable identity matters: this feeds Canvas's draw callback, and a fresh array every
  // App render would force a full canvas repaint on unrelated state changes.
  const canvasElementImageIds = useMemo(() => (
    Array.from(new Set([...elementImageIds, ...acceptedVideoPromptElementIds]))
  ), [elementImageIds, acceptedVideoPromptElementIds]);
  const seedance2ReferenceAssetCount = effectiveSeedanceReferenceImageIds.length + effectiveSeedanceReferenceVideoIds.length + effectiveSeedanceReferenceAudioIds.length; // Seedance reference mode treats selected media as effective refs too.
  const canvasReferenceOrderLabels = useMemo(() => ({
    ...(klingReferenceOrderLabels ?? {}),
    ...flux3CanvasLabels,
    ...videoPromptAreaLabelMap,
  }), [flux3CanvasLabels, klingReferenceOrderLabels, videoPromptAreaLabelMap]); // Area labels should render on canvas without replacing the legacy reference flow.
  const canvasElementOrderLabels = useMemo(() => ({
    ...(klingElementOrderLabels ?? {}),
    ...videoPromptAreaLabelMap,
  }), [klingElementOrderLabels, videoPromptAreaLabelMap]); // Element labels share the same area role labels.
  const canvasReferenceImageIds = useMemo(() => (
    Array.from(new Set([
      ...(isMultimodalReferenceMode ? effectiveSeedanceReferenceImageIds : referenceImageIds),
      ...acceptedVideoPromptImageIds,
    ]))
  ), [acceptedVideoPromptImageIds, effectiveSeedanceReferenceImageIds, isMultimodalReferenceMode, referenceImageIds]);
  const canvasReferenceVideoIds = useMemo(() => (
    Array.from(new Set([
      ...(isMultimodalReferenceMode ? effectiveSeedanceReferenceVideoIds : referenceVideoIds),
      ...acceptedVideoPromptVideoIds,
    ]))
  ), [acceptedVideoPromptVideoIds, effectiveSeedanceReferenceVideoIds, isMultimodalReferenceMode, referenceVideoIds]);
  const canvasReferenceAudioIds = useMemo(() => (
    Array.from(new Set([
      ...(isMultimodalReferenceMode ? effectiveSeedanceReferenceAudioIds : referenceAudioIds),
      ...acceptedVideoPromptAudioIds,
    ]))
  ), [acceptedVideoPromptAudioIds, effectiveSeedanceReferenceAudioIds, isMultimodalReferenceMode, referenceAudioIds]);

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
    const embeddedFlux3State = buildEmbeddedFlux3PromptState(targetBar, membership);
    if (targetModelId === FLUX_3_VIDEO_MODEL_ID && embeddedFlux3State.runPlan.error) {
      return;
    }
    const generationOverrides = targetModelId === FLUX_3_VIDEO_MODEL_ID
      ? embeddedFlux3State.generationOverrides
      : buildEmbeddedVideoGenerationOverrides(membership);
    const baseProviderInput = buildEmbeddedVideoGenerationProviderInput(
      targetBar,
      targetModelId,
      fal.jimengSessionId,
      Boolean(generationOverrides.primaryImageId),
    );
    const providerInput = targetModelId === FLUX_3_VIDEO_MODEL_ID && baseProviderInput.falOptions
      ? {
        ...baseProviderInput,
        falOptions: {
          ...baseProviderInput.falOptions,
          flux3KeyframeTimings: embeddedFlux3State.runPlan.keyframeTimings,
        },
      }
      : baseProviderInput;
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
  }, [displayedVideoPromptBars, fal.jimengSessionId, handleGenerate, jimengSetup, videoPromptAreaMemberships]);

  const hasSourceVideoSelected = Boolean(sourceVideoId);
  const hasSourceAudioSelected = Boolean(sourceAudioId);

  // Build prompt mention suggestions for Kling/Wan based on current reference/element selections.
  const { klingPromptMentions, klingReferenceCount } = useKlingPromptMentions({
    isKlingO3VideoModel: fal.isKlingO3VideoModel,
    isKlingO3EditMode: fal.isKlingO3EditMode,
    isMultimodalReferenceMode,
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
  const getEmbeddedVideoPromptBarSubmitError = useCallback((bar: CanvasVideoPromptBar): string | null => {
    if (getEmbeddedVideoPromptBarModelId(bar.modelId) !== FLUX_3_VIDEO_MODEL_ID) {
      return null;
    }
    const membership = bar.assignedAreaId ? videoPromptAreaMemberships[bar.assignedAreaId] : undefined;
    return buildEmbeddedFlux3PromptState(bar, membership).runPlan.error;
  }, [videoPromptAreaMemberships]);
  const buildEmbeddedVideoPromptBarControls = useCallback((bar: CanvasVideoPromptBar) => {
    const modelId = getEmbeddedVideoPromptBarModelId(bar.modelId);
    const options = bar.falOptions ?? {};
    const barMembership = bar.assignedAreaId ? videoPromptAreaMemberships[bar.assignedAreaId] : undefined;
    const embeddedFlux3State = buildEmbeddedFlux3PromptState(bar, barMembership);
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
      controlIdPrefix: bar.id, // Scope control ids to this embedded bar.
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
      isWanAnimateVideoModel: modelId === WAN_ANIMATE_MODEL_ID,
      isLipsyncVideoModel: modelId === SYNC_LIPSYNC_MODEL_ID,
      isHeygenV3LipsyncVideoModel: modelId === HEYGEN_V3_LIPSYNC_MODEL_ID,
      isInfinitalkVideoModel: modelId === INFINITALK_VIDEO_MODEL_ID,
      isGrokImagineVideoModel: modelId === GROK_IMAGINE_VIDEO_MODEL_ID,
      isVeo31VideoModel: modelId === VEO_31_IMAGE_TO_VIDEO_MODEL_ID,
      isWan27VideoModel: modelId === WAN_27_VIDEO_MODEL_ID,
      isMiniMaxH3VideoModel: modelId === MINIMAX_H3_VIDEO_MODEL_ID,
      isFlux3VideoModel: modelId === FLUX_3_VIDEO_MODEL_ID,
      isSeedance15VideoModel: modelId === SEEDANCE_15_VIDEO_MODEL_ID,
      isSeedance2VideoModel: modelId === SEEDANCE_2_VIDEO_MODEL_ID || modelId === FAL_SEEDANCE_2_VIDEO_MODEL_ID || modelId === JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
      isFalSeedance2VideoModel: modelId === FAL_SEEDANCE_2_VIDEO_MODEL_ID,
      isSeedance25VideoModel: modelId === FAL_SEEDANCE_25_VIDEO_MODEL_ID || modelId === JIMENG_SEEDANCE_25_VIDEO_MODEL_ID,
      isJimengSeedance2VideoModel: modelId === JIMENG_SEEDANCE_2_VIDEO_MODEL_ID || modelId === JIMENG_SEEDANCE_25_VIDEO_MODEL_ID || modelId === JIMENG_MULTIFRAME_VIDEO_MODEL_ID,
      isJimengSeedance25VideoModel: modelId === JIMENG_SEEDANCE_25_VIDEO_MODEL_ID,
      isJimengMultiframeVideoModel: modelId === JIMENG_MULTIFRAME_VIDEO_MODEL_ID,
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
      miniMaxH3Variant: options.miniMaxH3Variant ?? 'reference',
      miniMaxH3AspectRatio: options.miniMaxH3AspectRatio ?? 'adaptive',
      miniMaxH3Duration: options.miniMaxH3Duration ?? '5',
      miniMaxH3UsesSourceAspectRatio: modelId === MINIMAX_H3_VIDEO_MODEL_ID
        && (options.miniMaxH3Variant ?? 'reference') === 'standard'
        && Boolean(barMembership?.primaryImageId),
      flux3Variant: embeddedFlux3State.settings.flux3Variant,
      flux3AspectRatio: embeddedFlux3State.settings.flux3AspectRatio,
      flux3Resolution: embeddedFlux3State.settings.flux3Resolution,
      flux3Duration: embeddedFlux3State.settings.flux3Duration,
      flux3GenerateAudio: embeddedFlux3State.settings.flux3GenerateAudio,
      flux3KeyframeTimings: embeddedFlux3State.runPlan.keyframeTimings,
      flux3KeyframeError: embeddedFlux3State.runPlan.keyframeError ?? undefined,
      seedance15AspectRatio: options.seedance15AspectRatio ?? fal.seedance15AspectRatio,
      seedance15Resolution: options.seedance15Resolution ?? fal.seedance15Resolution,
      seedance15Duration: options.seedance15Duration ?? fal.seedance15Duration,
      seedance15CameraFixed: options.seedance15CameraFixed ?? fal.seedance15CameraFixed,
      seedance15Audio: options.seedance15Audio ?? fal.seedance15Audio,
      seedance2Variant: bar.seedance2Variant,
      seedance2JimengModelVersion: bar.seedance2JimengModelVersion ?? options.seedance2JimengModelVersion ?? fal.seedance2JimengModelVersion,
      seedance2VolcengineModel: bar.seedance2VolcengineModel ?? options.seedance2VolcengineModel ?? fal.seedance2VolcengineModel,
      seedance2AspectRatio: bar.seedance2AspectRatio ?? '16:9',
      seedance2Resolution: bar.seedance2Resolution ?? '720p',
      seedance2Duration: bar.seedance2Duration ?? '5',
      jimengMultiframeDuration: options.multiframeDuration ?? fal.jimengMultiframeDuration,
      jimengMultiframeResolution: options.multiframeResolution ?? fal.jimengMultiframeResolution,
      seedance2GenerateAudio: bar.seedance2GenerateAudio,
      seedance2CameraFixed: bar.seedance2CameraFixed,
      seedance2OutputFormat: bar.seedance2OutputFormat ?? fal.seedance2OutputFormat,
      seedance2HasFirstFrame: modelId === SEEDANCE_2_VIDEO_MODEL_ID
        && bar.seedance2Variant === 'smart'
        && Boolean(barMembership?.primaryImageId),
      seedance25Variant: options.seedance25Variant ?? 'reference',
      seedance25AspectRatio: options.seedance25AspectRatio ?? 'adaptive',
      seedance25Resolution: options.seedance25Resolution ?? '720p',
      seedance25Duration: options.seedance25Duration ?? 'auto',
      seedance25GenerateAudio: options.seedance25GenerateAudio ?? true,
      seedance25UsesSourceAspectRatio: (modelId === FAL_SEEDANCE_25_VIDEO_MODEL_ID || modelId === JIMENG_SEEDANCE_25_VIDEO_MODEL_ID)
        && (options.seedance25Variant ?? 'reference') === 'smart'
        && Boolean(barMembership?.primaryImageId), // Jimeng image2video omits --ratio, so first-frame Smart uses the source ratio.
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
      onMiniMaxH3VariantChange: value => {
        handleEmbeddedPromptBarUpdate(bar.id, currentBar => {
          const nextVariant = value === 'standard' ? 'standard' : 'reference';
          return {
            ...currentBar,
            falOptions: {
              ...(currentBar.falOptions ?? {}),
              miniMaxH3Variant: nextVariant,
              miniMaxH3AspectRatio: normalizeMiniMaxH3AspectRatioForVariant(nextVariant, currentBar.falOptions?.miniMaxH3AspectRatio),
            },
          };
        });
      },
      onMiniMaxH3AspectRatioChange: value => updateFalOption('miniMaxH3AspectRatio', value),
      onMiniMaxH3DurationChange: value => updateFalOption('miniMaxH3Duration', value),
      onFlux3VariantChange: value => handleEmbeddedPromptBarUpdate(
        bar.id,
        currentBar => updateEmbeddedFlux3Variant(currentBar, value),
      ),
      onFlux3AspectRatioChange: value => updateFalOption('flux3AspectRatio', value),
      onFlux3ResolutionChange: value => updateFalOption('flux3Resolution', value),
      onFlux3DurationChange: value => handleEmbeddedPromptBarUpdate(
        bar.id,
        currentBar => updateEmbeddedFlux3Duration(currentBar, value),
      ),
      onFlux3GenerateAudioChange: value => updateFalOption('flux3GenerateAudio', value),
      onFlux3KeyframeTimingChange: (imageId, timestampSeconds) => handleEmbeddedPromptBarUpdate(
        bar.id,
        currentBar => updateEmbeddedFlux3KeyframeTiming(currentBar, barMembership, imageId, timestampSeconds),
      ),
      onSeedance15AspectRatioChange: value => updateFalOption('seedance15AspectRatio', value),
      onSeedance15ResolutionChange: value => updateFalOption('seedance15Resolution', value),
      onSeedance15DurationChange: value => updateFalOption('seedance15Duration', value),
      onSeedance15CameraFixedChange: value => updateFalOption('seedance15CameraFixed', value),
      onSeedance15AudioChange: value => updateFalOption('seedance15Audio', value),
      onSeedance2VariantChange: value => updateLegacyAndFal({ seedance2Variant: value as CanvasVideoPromptBar['seedance2Variant'] }, 'seedance2Variant', value),
      onSeedance2JimengModelVersionChange: value => {
        handleEmbeddedPromptBarUpdate(bar.id, currentBar => {
          const nextModelVersion = value as CanvasVideoPromptBar['seedance2JimengModelVersion'];
          const savedFalResolution = currentBar.falOptions?.seedance2Resolution;
          return {
            ...currentBar,
            seedance2JimengModelVersion: nextModelVersion,
            seedance2Resolution: getJimengSafeSeedance2Resolution(currentBar.seedance2Resolution, nextModelVersion),
            falOptions: {
              ...(currentBar.falOptions ?? {}),
              seedance2JimengModelVersion: nextModelVersion,
              seedance2Resolution: savedFalResolution
                ? getJimengSafeSeedance2Resolution(savedFalResolution, nextModelVersion)
                : savedFalResolution,
            },
          };
        }); // Keep the channel and its compatible resolution in one history update.
      },
      onSeedance2VolcengineModelChange: value => {
        handleEmbeddedPromptBarUpdate(bar.id, currentBar => {
          const nextModel = isSeedance2VolcengineModel(value) ? value : 'standard';
          const safe = getVolcengineSafeSeedance2Settings(nextModel, currentBar); // Shared clamp keeps embedded bars in step with the global hook.
          return {
            ...currentBar,
            seedance2VolcengineModel: nextModel,
            seedance2AspectRatio: safe.seedance2AspectRatio,
            seedance2Resolution: safe.seedance2Resolution,
            seedance2Duration: safe.seedance2Duration,
            seedance2CameraFixed: safe.seedance2CameraFixed,
            falOptions: {
              ...(currentBar.falOptions ?? {}),
              seedance2VolcengineModel: nextModel,
              seedance2AspectRatio: safe.seedance2AspectRatio,
              seedance2Resolution: safe.seedance2Resolution,
              seedance2Duration: safe.seedance2Duration,
              seedance2CameraFixed: safe.seedance2CameraFixed,
            },
          };
        }); // Keep the Volcengine model and its compatible settings in one history update.
      },
      onSeedance2AspectRatioChange: value => updateLegacyAndFal({ seedance2AspectRatio: value as CanvasVideoPromptBar['seedance2AspectRatio'] }, 'seedance2AspectRatio', value),
      onSeedance2ResolutionChange: value => updateLegacyAndFal({ seedance2Resolution: value as CanvasVideoPromptBar['seedance2Resolution'] }, 'seedance2Resolution', value),
      onSeedance2DurationChange: value => updateLegacyAndFal({ seedance2Duration: value as CanvasVideoPromptBar['seedance2Duration'] }, 'seedance2Duration', value),
      onJimengMultiframeDurationChange: value => updateFalOption('multiframeDuration', value),
      onJimengMultiframeResolutionChange: value => updateFalOption('multiframeResolution', value),
      onSeedance2GenerateAudioChange: value => updateLegacyAndFal({ seedance2GenerateAudio: value }, 'seedance2GenerateAudio', value),
      onSeedance2CameraFixedChange: value => handleEmbeddedPromptBarUpdate(bar.id, currentBar => ({ ...currentBar, seedance2CameraFixed: value })),
      onSeedance2OutputFormatChange: value => handleEmbeddedPromptBarUpdate(bar.id, currentBar => ({
        ...currentBar,
        seedance2OutputFormat: isSeedance2OutputFormatSelectionValue(value) ? value : 'mp4',
      })),
      onSeedance25VariantChange: value => updateFalOption('seedance25Variant', value),
      onSeedance25AspectRatioChange: value => updateFalOption('seedance25AspectRatio', value),
      onSeedance25ResolutionChange: value => updateFalOption('seedance25Resolution', value),
      onSeedance25DurationChange: value => updateFalOption('seedance25Duration', value),
      onSeedance25GenerateAudioChange: value => updateFalOption('seedance25GenerateAudio', value),
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
  }, [fal, handleEmbeddedPromptBarUpdate, isLoading, videoPromptAreaMemberships]);

  // Validation layer for prompt submission that enforces provider/model-specific rules.
  const {
    submitDisabled,
    submitDisabledReason,
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
    isVeo31VideoModel: fal.isVeo31VideoModel,
    isMiniMaxH3VideoModel: fal.isMiniMaxH3VideoModel,
    isFlux3VideoModel: fal.isFlux3VideoModel,
    flux3InputKind: flux3RunPlan.policy.inputKind,
    flux3ValidationError: flux3RunPlan.error,
    miniMaxH3Variant: fal.miniMaxH3Variant,
    miniMaxH3ReferenceAssetCount: isMiniMaxH3ReferenceMode ? seedance2ReferenceAssetCount : 0,
    isSeedance2VideoModel: fal.isSeedance2VideoModel,
    seedance2Variant: fal.seedance2Variant,
    seedance2ReferenceAssetCount,
    seedance2ReferenceVideoCount: effectiveSeedanceReferenceVideoIds.length,
    seedance2VolcengineModel: fal.seedance2VolcengineModel,
    isSeedance25VideoModel: fal.isSeedance25VideoModel,
    seedance25Variant: fal.seedance25Variant,
    seedance25ReferenceAssetCount: isSeedance25ReferenceMode ? seedance2ReferenceAssetCount : 0,
    wan27VideoVariant: fal.wan27VideoVariant,
    wan27ReferenceAssetCount: isWan27ReferenceMode ? referenceImageIds.length + referenceVideoIds.length : 0,
    veo31Variant: fal.veo31Variant,
    falModelId: fal.falModelId,
    falNumImages: fal.falNumImages,
    activePrimaryImage,
    primarySelectionMediaType,
    hasSelectedStillImage,
    selectedMediaCount: selectedImageIds.length,
    selectedStillImageCount,
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
    isWanAnimateVideoModel: fal.isWanAnimateVideoModel,
    isLipsyncVideoModel: fal.isLipsyncVideoModel,
    isHeygenV3LipsyncVideoModel: fal.isHeygenV3LipsyncVideoModel,
    isInfinitalkVideoModel: fal.isInfinitalkVideoModel,
    isGrokImagineVideoModel: fal.isGrokImagineVideoModel,
    isVeo31VideoModel: fal.isVeo31VideoModel,
    isWan27VideoModel: fal.isWan27VideoModel,
    isMiniMaxH3VideoModel: fal.isMiniMaxH3VideoModel,
    isFlux3VideoModel: fal.isFlux3VideoModel,
    isSeedance15VideoModel: fal.isSeedance15VideoModel,
    isSeedance2VideoModel: fal.isSeedance2VideoModel,
    isFalSeedance2VideoModel: fal.isFalSeedance2VideoModel,
    isSeedance25VideoModel: fal.isSeedance25VideoModel,
    isJimengSeedance2VideoModel: fal.isJimengSeedance2VideoModel,
    isJimengSeedance25VideoModel: fal.falVideoModelId === JIMENG_SEEDANCE_25_VIDEO_MODEL_ID,
    isJimengMultiframeVideoModel: fal.falVideoModelId === JIMENG_MULTIFRAME_VIDEO_MODEL_ID,
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
    miniMaxH3Variant: fal.miniMaxH3Variant,
    miniMaxH3AspectRatio: fal.miniMaxH3AspectRatio,
    miniMaxH3Duration: fal.miniMaxH3Duration,
    miniMaxH3UsesSourceAspectRatio: isMiniMaxH3StandardMode && Boolean(activePrimaryImage),
    flux3Variant: fal.flux3Variant,
    flux3AspectRatio: fal.flux3AspectRatio,
    flux3Resolution: fal.flux3Resolution,
    flux3Duration: fal.flux3Duration,
    flux3GenerateAudio: fal.flux3GenerateAudio,
    flux3KeyframeTimings: fal.flux3KeyframeTimings,
    flux3KeyframeError: flux3KeyframeError ?? undefined,
    seedance15AspectRatio: fal.seedance15AspectRatio,
    seedance15Resolution: fal.seedance15Resolution,
    seedance15Duration: fal.seedance15Duration,
    seedance15CameraFixed: fal.seedance15CameraFixed,
    seedance15Audio: fal.seedance15Audio,
    seedance2Variant: fal.seedance2Variant,
    seedance2JimengModelVersion: fal.seedance2JimengModelVersion,
    seedance2VolcengineModel: fal.seedance2VolcengineModel,
    seedance2AspectRatio: fal.seedance2AspectRatio,
    seedance2Resolution: fal.seedance2Resolution,
    seedance2Duration: fal.seedance2Duration,
    jimengMultiframeDuration: fal.jimengMultiframeDuration,
    jimengMultiframeResolution: fal.jimengMultiframeResolution,
    seedance2GenerateAudio: fal.seedance2GenerateAudio,
    seedance2CameraFixed: fal.seedance2CameraFixed,
    seedance2OutputFormat: fal.seedance2OutputFormat,
    seedance2HasFirstFrame: fal.falVideoModelId === SEEDANCE_2_VIDEO_MODEL_ID
      && fal.seedance2VolcengineModel === 'seedance25'
      && fal.seedance2Variant === 'smart'
      && Boolean(activePrimaryImage),
    seedance25Variant: fal.seedance25Variant,
    seedance25AspectRatio: fal.seedance25AspectRatio,
    seedance25Resolution: fal.seedance25Resolution,
    seedance25Duration: fal.seedance25Duration,
    seedance25GenerateAudio: fal.seedance25GenerateAudio,
    seedance25UsesSourceAspectRatio: fal.isSeedance25VideoModel && fal.seedance25Variant === 'smart' && Boolean(activePrimaryImage), // Jimeng image2video omits --ratio, so first-frame Smart uses the source ratio.
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
    onMiniMaxH3VariantChange: fal.handleMiniMaxH3VariantChange,
    onMiniMaxH3AspectRatioChange: fal.handleMiniMaxH3AspectRatioChange,
    onMiniMaxH3DurationChange: fal.handleMiniMaxH3DurationChange,
    onFlux3VariantChange: fal.handleFlux3VariantChange,
    onFlux3AspectRatioChange: fal.handleFlux3AspectRatioChange,
    onFlux3ResolutionChange: fal.handleFlux3ResolutionChange,
    onFlux3DurationChange: handleFlux3DurationChange,
    onFlux3GenerateAudioChange: fal.handleFlux3GenerateAudioChange,
    onFlux3KeyframeTimingChange: handleFlux3KeyframeTimingChange,
    onSeedance15AspectRatioChange: fal.handleSeedance15AspectRatioChange,
    onSeedance15ResolutionChange: fal.handleSeedance15ResolutionChange,
    onSeedance15DurationChange: fal.handleSeedance15DurationChange,
    onSeedance15CameraFixedChange: fal.handleSeedance15CameraFixedChange,
    onSeedance15AudioChange: fal.handleSeedance15AudioChange,
    onSeedance2VariantChange: fal.handleSeedance2VariantChange,
    onSeedance2JimengModelVersionChange: fal.handleSeedance2JimengModelVersionChange,
    onSeedance2VolcengineModelChange: fal.handleSeedance2VolcengineModelChange,
    onSeedance2AspectRatioChange: fal.handleSeedance2AspectRatioChange,
    onSeedance2ResolutionChange: fal.handleSeedance2ResolutionChange,
    onSeedance2DurationChange: fal.handleSeedance2DurationChange,
    onJimengMultiframeDurationChange: fal.setJimengMultiframeDuration,
    onJimengMultiframeResolutionChange: fal.setJimengMultiframeResolution,
    onSeedance2GenerateAudioChange: fal.handleSeedance2GenerateAudioChange,
    onSeedance2CameraFixedChange: fal.handleSeedance2CameraFixedChange,
    onSeedance2OutputFormatChange: fal.handleSeedance2OutputFormatChange,
    onSeedance25VariantChange: fal.handleSeedance25VariantChange,
    onSeedance25AspectRatioChange: fal.handleSeedance25AspectRatioChange,
    onSeedance25ResolutionChange: fal.handleSeedance25ResolutionChange,
    onSeedance25DurationChange: fal.handleSeedance25DurationChange,
    onSeedance25GenerateAudioChange: fal.handleSeedance25GenerateAudioChange,
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
  const leadingRailJustificationClass = isMacDesktop ? 'justify-center' : 'justify-start'; // Center the macOS filename without moving the cross-platform menu.
  const isTopToolbarSuppressed = cropMode !== null || transformMode !== null; // Keep its grid width while crop or transform controls take over.
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
        case 'toggleFileName':
          toggleFileName();
          break;
        case 'toggleTrackpadMode':
          toggleTrackpadMode();
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
      isClearingJimengCache: jimengSetup.isClearingCache,
    });
  }, [autosaveEnabled, hasNativeFileMenuBridge, jimengSetup.isClearingCache, showFileName, showZoomLevelBadge, trackpadMode]);

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
          className="pointer-events-none absolute inset-x-0 top-4 z-30 grid h-12 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center"
          style={topControlRailStyle}
        >
          <div
            className={`flex min-w-0 items-center ${leadingRailJustificationClass}`}
            data-testid="top-control-rail-leading"
          >
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
                trackpadMode={trackpadMode}
                onToggleTrackpadMode={toggleTrackpadMode}
                onOpenDebugLog={openDebugLogPanel}
                onOpenDesktopSettings={hasDesktopSettingsBridge ? openDesktopSettings : undefined}
                onClearJimengCache={jimengSetup.handleClearCache}
                isClearingJimengCache={jimengSetup.isClearingCache}
              />
            )}
            {isMacDesktop && showFileName && activeSnapshotFileName && (
              <SnapshotFileName fileName={activeSnapshotFileName} />
            )}
          </div>
          <div
            aria-hidden={isTopToolbarSuppressed || undefined}
            className={`flex items-center justify-center ${isTopToolbarSuppressed ? 'invisible' : ''}`}
            data-testid="top-control-rail-toolbar"
            inert={isTopToolbarSuppressed || undefined}
          >
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
              isObjectSelected={selectedImageIds.length > 0}
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
          </div>
          <div className="flex items-center justify-end">
            {showZoomLevelBadge && (
              <ZoomLevelBadge store={canvasScaleStore} trackpadMode={trackpadMode} />
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
          onNotesChange={setLiveNotes}
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
          referenceImageIds={canvasReferenceImageIds}
          referenceVideoIds={canvasReferenceVideoIds}
          referenceAudioIds={canvasReferenceAudioIds}
          referenceImageOrderLabels={canvasReferenceOrderLabels}
          isKrea2StyleReferenceMode={isActiveKrea2LargeModel}
          krea2StyleReferenceImageIds={referenceImageIds}
          krea2StyleReferenceStrengths={krea2StyleReferenceStrengths}
          onKrea2StyleReferenceStrengthChange={handleKrea2StyleReferenceStrengthChange}
          disabledMediaIds={ignoredVideoPromptMediaIds}
          elementImageIds={canvasElementImageIds}
          elementImageOrderLabels={canvasElementOrderLabels}
          videoLastFrameImageId={videoLastFrameImageId}
          sourceVideoId={sourceVideoId}
          tailSelectionEnabled={supportsTailFrameSelection}
          isKlingO3VideoInputMode={isKlingO3VideoInputMode}
          isKlingO3ReferenceMode={isKlingO3ReferenceMode}
          isSeedance15FflfMode={fal.isSeedance15VideoModel}
          isKlingV3ControlVideoInputMode={fal.isKlingV3ControlVideoModel}
          isVeo31ExtendMode={isVeo31ExtendMode}
          isWanAnimateVideoInputMode={fal.isWanAnimateVideoModel || isScailVideoModel}
          isWan27VideoMode={fal.isWan27VideoModel}
          onError={setError}
          onMediaPlaybackRejected={handleMediaPlaybackRejected}
          onImageSelect={handleImageSelection}
          onSelectionReplace={replaceCanvasSelection}
          onCommit={handleCommit}
          onFilesDrop={handleFilesDrop}
          zoomToFitTrigger={zoomToFitTrigger}
          zoomToSelectionTrigger={zoomToSelectionTrigger}
          zoomInTrigger={zoomInTrigger}
          zoomOutTrigger={zoomOutTrigger}
          trackpadMode={trackpadMode}
          panToAnchorRequest={panToAnchorRequest}
          onScaleChange={canvasScaleStore.set}
          onAnchorNoteCreate={createNote}
          onAnchorClick={focusNoteInPanel}
          onImageOrderChange={handleImageOrderChange}
          isImageOverlapping={isImageOverlapping}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          cropMode={cropMode}
          onStartCrop={handleStartCrop}
          onCropRectChange={handleCropRectChange}
          onConfirmCrop={handleConfirmCrop}
          onCancelCrop={handleCancelCrop}
          onVideoPromptAreaBorderColorChange={handleVideoPromptAreaBorderColorChange}
          onImagePromptCopy={handleImagePromptCopy}
          onMetadataToPromptBar={handleMetadataToPromptBar}
          getMetadataTransferBlockReason={getMetadataTransferBlockReason}
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
          getVideoPromptBarSubmitError={getEmbeddedVideoPromptBarSubmitError}
          embeddedVideoPromptBarModelOptions={embeddedVideoPromptBarModelOptions}
          isPresentationMode={isPresentationMode}
        />
        {!isPresentationMode && (
          <ViewToolbar
            onZoomToFit={handleZoomToFit}
            disabled={!hasCanvasVisualContent}
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
        <NotesPanel
          isOpen={isNotesPanelOpen}
          isSuppressed={hasBlockingOverlay}
          notes={displayedNotes}
          focusRequest={notesPanelFocusRequest}
          onToggle={toggleNotesPanel}
          onTextChange={handleNoteTextChange}
          onTextCommit={handleCommit}
          onAddNote={handleAddPanelNote}
          onDeleteNote={handleDeleteNote}
          onJumpToAnchor={handleJumpToAnchor}
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
          sessionId={fal.jimengSessionId}
          onInstall={jimengSetup.handleInstall}
          onLogin={jimengSetup.handleLogin}
          onCheckLogin={jimengSetup.handleCheckLogin}
          onSessionIdChange={fal.setJimengSessionId}
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
          submitDisabledReason={isEmbeddedPromptBarActive ? null : submitDisabledReason}
          modelOptions={promptBarModelOptions}
          selectedModel={fal.falModelId}
          onModelChange={fal.handleFalModelChange}
          modelSelectDisabled={apiProvider !== 'fal' || isLoading}
          modelMode={fal.falModelMode}
          onModelModeChange={handleModelModeChange}
          modelModeDisabled={apiProvider !== 'fal' || isLoading}
          modelControls={promptBarModelControls}
          promptPlaceholder={
            fal.isFlux3VideoModel
              ? flux3ModePolicy.inputKind === 'optional-start-image' && primarySelectionMediaType !== null && !activePrimaryImage
                ? promptPlaceholderText
                : flux3ModePolicy.inputKind === 'source-video'
                ? 'Flux 3 Extend: select one video as @Video1 and describe how it should continue... (Cmd/Ctrl + Enter to generate)'
                : flux3ModePolicy.inputKind === 'keyframe-images'
                  ? `Flux 3 Keyframes: select or shift-click up to ${flux3ModePolicy.maxImages} still images as @Image1, @Image2, and so on, set their timing, then describe the shot... (Cmd/Ctrl + Enter to generate)`
                  : flux3ModePolicy.inputKind === 'first-last-images'
                    ? 'Flux 3 First & Last Frame: select a first image and shift-click a last image, then describe the transition... (Cmd/Ctrl + Enter to generate)'
                    : activePrimaryImage
                      ? 'Flux 3 Smart Mode: describe how @Image1 should move... (Cmd/Ctrl + Enter to generate)'
                      : 'Flux 3 Smart Mode: describe a video, or select one still image for image-to-video... (Cmd/Ctrl + Enter to generate)'
              : fal.isMiniMaxH3VideoModel
              ? (fal.miniMaxH3Variant === 'reference'
                ? `MiniMax H3 Reference: select or shift-click up to ${SEEDANCE_REFERENCE_IMAGE_LIMIT} images, ${SEEDANCE_REFERENCE_VIDEO_LIMIT} videos, and ${SEEDANCE_REFERENCE_AUDIO_LIMIT} audio clips to label them as @Image1, @Video1, or @Audio1, then describe the scene... (Cmd/Ctrl + Enter to generate)`
                : activePrimaryImage
                  ? 'MiniMax H3 Standard: describe the motion, or shift-click another still image to set the end frame... (Cmd/Ctrl + Enter to generate)'
                  : 'MiniMax H3 Standard: describe the video, or select an image for image-to-video... (Cmd/Ctrl + Enter to generate)')
              : fal.falVideoModelId === JIMENG_MULTIFRAME_VIDEO_MODEL_ID
              ? `Jimeng Multi-frame: select ${JIMENG_MULTIFRAME_MIN_IMAGES}–${JIMENG_MULTIFRAME_MAX_IMAGES} still images in story order. For 2 images, describe the transition; for 3+, separate each transition prompt with ||. (Cmd/Ctrl + Enter to generate)`
              : fal.isSeedance25VideoModel
              ? (fal.seedance25Variant === 'reference'
                ? `Seedance 2.5 Reference: select or shift-click up to ${SEEDANCE25_REFERENCE_IMAGE_LIMIT} images, ${SEEDANCE25_REFERENCE_VIDEO_LIMIT} videos, and ${SEEDANCE25_REFERENCE_AUDIO_LIMIT} audio clips to label them as @Image1, @Video1, or @Audio1, then describe the scene... (Cmd/Ctrl + Enter to generate)`
                : 'Seedance 2.5 Smart: write a prompt for text-to-video, or select an image to use as the first frame. Shift-click another still image to mark an end frame... (Cmd/Ctrl + Enter to generate)')
              : fal.isSeedance2VideoModel
              ? (fal.isJimengSeedance2VideoModel
                ? (fal.seedance2Variant === 'reference'
                  ? `Seedance 2 (JM CLI) Reference: select or shift-click up to ${SEEDANCE_REFERENCE_IMAGE_LIMIT} images, ${SEEDANCE_REFERENCE_VIDEO_LIMIT} videos, and ${SEEDANCE_REFERENCE_AUDIO_LIMIT} audio clips to label them as @Image1, @Video1, or @Audio1, then describe the scene... (Cmd/Ctrl + Enter to generate)`
                  : 'Seedance 2 (JM CLI) Smart: write a prompt for text-to-video, select a first frame, or Shift-click a second still image for the ending frame... (Cmd/Ctrl + Enter to generate)')
                : fal.seedance2Variant === 'edit'
                ? 'Seedance 2 Edit: select a video to edit (@Video1), optionally tag @Image/@Audio replacement clips, then describe the changes... (Cmd/Ctrl + Enter to generate)'
                : fal.seedance2Variant === 'extend'
                ? `${seedance2ReferenceModelLabel} Extend: select up to ${seedance2ReferenceLimits.videos} video clips and describe how to chain them, e.g. "@Video1 followed by @Video2", or extend @Video1 forward or backward... (Cmd/Ctrl + Enter to generate)`
                : fal.seedance2Variant === 'reference'
                ? `${seedance2ReferenceModelLabel} Reference: select or shift-click up to ${seedance2ReferenceLimits.images} images, ${seedance2ReferenceLimits.videos} videos, and ${seedance2ReferenceLimits.audios} audio clips to label them as @Image1, @Video1, or @Audio1, then describe the scene... (Cmd/Ctrl + Enter to generate)`
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
          klingSuggestionsEnabled={fal.isKlingO3VideoModel || isMultimodalReferenceMode || fal.isFlux2MaxModel || fal.isWan27ImageModel || fal.isFlux3VideoModel}
          klingReferenceCount={Math.max(klingReferenceCount, flux3PromptMentions.length)}
          klingSuggestionOptions={flux3PromptMentions.length ? flux3PromptMentions : klingPromptMentions}
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
          focusRequestToken={promptFocusRequestToken}
        />
      )}
      </>)}
    </div>
  );
}
