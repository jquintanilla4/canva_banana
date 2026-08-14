import React, { useState, useRef, useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { type ValueStore } from './utils/valueStore';
import { Toolbar } from './components/Toolbar';
import { Canvas } from './components/Canvas';
import { MIN_STROKE_SIZE, MAX_STROKE_SIZE, KEYBOARD_STROKE_STEP } from './components/canvas/constants';
import { RecordingOverlay } from './components/RecordingOverlay';
import {
  Tool,
  AppMode,
  ApiProviderId,
  type CanvasImage,
  type CanvasVideoPromptBar,
  type GenerationPlacedPayload,
} from './types';
import { FalQueuePanel } from './components/FalQueuePanel';
import { JimengSetupPanel } from './components/JimengSetupPanel';
import { PromptChatPanel } from './components/PromptChatPanel';
import { NotesPanel } from './components/NotesPanel';
import {
  isGptImage2EditModelId,
  FLUX_3_VIDEO_MODEL_ID,
  WAN_VISION_ENHANCER_MODEL_ID,
  JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
  WAN_27_IMAGE_DEFAULT_NEGATIVE_PROMPT,
  getFalModelLabel,
} from './services/modelConfig';
import {
  buildPromptBarModelControls,
  getPromptBarModelOptions,
} from './services/promptBarConfig';
import { getModelUiCapabilities } from './services/modelCapabilities';
import { buildFooterPromptBarControlsInput } from './services/promptBarSettingsView';
import { useBlindTestMode } from './hooks/useBlindTestMode';
import { isOverlapping } from './utils/canvasGeometry';
import { FileMenu } from './components/FileMenu';
import { ViewToolbar } from './components/ViewToolbar';
import { StatusBanner } from './components/StatusBanner';
import { ImageResizeToast } from './components/ImageResizeToast';
import { GenerationCanvasNotifications } from './components/GenerationCanvasNotifications';
import { SnapshotFileName } from './components/SnapshotFileName';
import { useGeneration } from './hooks/useGeneration';
import { useCanvasReferenceLabels } from './hooks/useCanvasReferenceLabels';
import { useKrea2StyleStrengths } from './hooks/useKrea2StyleStrengths';
import { useCanvasHistory } from './hooks/useCanvasHistory';
import { useSelectionState } from './hooks/useSelectionState';
import { useFalSettings } from './hooks/useFalSettings';
import { useSnapshotIO } from './hooks/useSnapshotIO';
import { useCanvasMediaActions } from './hooks/useCanvasMediaActions';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useAudioRecordingToCanvas } from './hooks/useAudioRecordingToCanvas';
import { useNotesPanel } from './hooks/useNotesPanel';
import { buildGenerationGuardArgs, useGenerationGuards } from './hooks/useGenerationGuards';
import { useImageResize } from './hooks/useImageResize';
import { useDuplicateCanvasMedia } from './hooks/useDuplicateCanvasMedia';
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
import { AppModals } from './components/app/AppModals';
import { AppFooter } from './components/app/AppFooter';
import { useDesktopIntegration } from './hooks/useDesktopIntegration';
import { useZoomControls } from './hooks/useZoomControls';
import { useVideoPromptBars } from './hooks/useVideoPromptBars';
import { writeClipboardText } from './services/clipboardService';
import type { FalModelMode } from './services/modelConfig';
import { buildEffectiveSeedanceReferenceIds } from './utils/seedanceReferences';
import {
  buildEmbeddedVideoGenerationOverrides,
  getEmbeddedVideoPromptBarModelId,
} from './utils/videoPromptAreas';
import { buildEmbeddedFlux3PromptState } from './utils/embeddedFlux3';
import {
  buildEmbeddedVideoGenerationProviderInput,
  isJimengEmbeddedVideoModel,
} from './utils/embeddedVideoRouting';
import { markCanvasMediaStoppedByIds, stopCanvasMediaPlaybackByIds } from './utils/canvasMediaPlayback';
import { getCanvasImagePrompt } from './utils/canvasImagePrompt';
import { applyGenerationPlacementSelection } from './utils/generationPlacementSelection';
import { getGenerationTransferBlockReason } from './utils/generationPromptBarTransfer';
import { OVERLAY_LAYER_CLASS_NAMES } from './utils/overlayLayers';
import {
  EMPTY_CAMERA_SELECTION,
  buildCameraPromptPrefix,
  cloneCameraSelection,
  hasCameraSettings,
  type CameraSettingsSelection,
} from './utils/cameraSettings';
import { getRuntimeConfig, hasRuntimeConfigValue } from './services/runtimeConfig';

// Type alias for API providers
type ApiProvider = ApiProviderId;
// Defines preferred order of API providers
const PROVIDER_ORDER: ReadonlyArray<ApiProviderId> = ['google', 'fal'];
const runtimeConfig = getRuntimeConfig(); // Shared Vite/Electron configuration snapshot.
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
  // Notes side panel: open/close, focus requests, pan-to-pin requests, note CRUD.
  const {
    isNotesPanelOpen,
    notesPanelFocusRequest,
    panToAnchorRequest,
    noteLabelCounterRef,
    handleNoteTextChange,
    focusNoteInPanel,
    createNote,
    handleAddPanelNote,
    handleDeleteNote,
    handleJumpToAnchor,
    toggleNotesPanel,
  } = useNotesPanel({ displayedNotes, setLiveNotes, handleCommit });

  // State to track if the app is currently performing a loading operation
  const [isLoading, setIsLoading] = useState(false);

  // State for error message display (null if no error)
  const [error, setError] = useState<string | null>(null);

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

  // On-canvas video prompt areas/bars: selection, creation, memberships, and the
  // embedded control builder.
  const {
    selectedVideoPromptAreaId,
    setSelectedVideoPromptAreaId,
    handleVideoPromptAreasChange,
    handleVideoPromptBarsChange,
    handleCreateVideoPromptBar,
    handleEmbeddedPromptBarUpdate,
    handleVideoPromptAreaBorderColorChange,
    videoPromptAreaProfiles,
    videoPromptAreaMemberships,
    videoPromptAreaLabelMap,
    ignoredVideoPromptMediaIds,
    acceptedVideoPromptImageIds,
    acceptedVideoPromptVideoIds,
    acceptedVideoPromptAudioIds,
    acceptedVideoPromptElementIds,
    embeddedVideoPromptBarModelOptions,
    getEmbeddedVideoPromptBarSubmitError,
    buildEmbeddedVideoPromptBarControls,
  } = useVideoPromptBars({
    displayedImages,
    displayedVideoPromptAreas,
    displayedVideoPromptBars,
    setLiveVideoPromptAreas,
    setLiveVideoPromptBars,
    setState,
    setError,
    fal,
    isLoading,
  });

  const {
    videoNegativePrompt,
    setVideoNegativePrompt,
    setVideoNegativePromptForModel,
  } = useVideoNegativePrompt({ isVideoMode: fal.isVideoMode, falVideoModelId: fal.falVideoModelId });

  // Negative prompt state for Wan 2.7 Pro Image model
  const [wan27ImageNegativePrompt, setWan27ImageNegativePrompt] = useState<string>(WAN_27_IMAGE_DEFAULT_NEGATIVE_PROMPT);
  const generationNegativePrompt = fal.isWan27ImageModel ? wan27ImageNegativePrompt : videoNegativePrompt; // Route active negative prompt into generation.

  // Toggles display of metadata overlays on canvas images
  const [showMetadataOverlay, setShowMetadataOverlay] = useState(false);

  // Blind test mode: anonymizes model names in dropdowns with random codenames
  const {
    blindTestEnabled,
    openSourceAliasEnabled,
    handleBlindTestClick,
    mapModelOptions,
    blindTestMapping,
  } = useBlindTestMode();

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
  // Autosave is opt-out; user can disable it in the file menu.
  const [autosaveEnabled, setAutosaveEnabled] = useState(true);
  // Increment after each successful generation to trigger autosave.
  const [generationTick, setGenerationTick] = useState(0);

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
  // Copy lives in the model capability registry; unknown models get the generic line.
  const showReferenceLimitToast = useCallback((maxReferenceImages: number) => {
    const usingFalProvider = apiProvider === 'fal'; // Fal-only messages require active Fal provider.
    if (usingFalProvider) {
      const toast = getModelUiCapabilities(fal.falModelId, {
        klingO3Variant: fal.klingO3Variant,
        miniMaxH3Variant: fal.miniMaxH3Variant,
        seedance2Variant: fal.seedance2Variant,
        seedance25Variant: fal.seedance25Variant,
      }).referenceLimitToast?.(maxReferenceImages);
      if (toast) {
        setToastMessage(toast.message);
        setTimeout(() => setToastMessage(null), toast.durationMs);
        return;
      }
    }
    const totalLimit = maxReferenceImages + 1;
    const referenceLimitLabel = usingFalProvider ? getFalModelLabel(fal.falModelId) : PROVIDER_LABELS.google; // Match label to active provider.
    setToastMessage(`${referenceLimitLabel} supports up to ${maxReferenceImages} reference images (${totalLimit} total including the primary).`);
    setTimeout(() => setToastMessage(null), 2000);
  }, [apiProvider, fal.falModelId, fal.klingO3Variant, fal.miniMaxH3Variant, fal.seedance2Variant, fal.seedance25Variant, setToastMessage]);

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

  // Model-conditional UI behavior comes from the capability registry; the ctx carries
  // the variant state that refines it. Derived locals keep their historical names.
  const modelCapabilities = useMemo(() => getModelUiCapabilities(fal.falModelId, {
    klingVariant: fal.klingVariant,
    klingO3Variant: fal.klingO3Variant,
    veo31Variant: fal.veo31Variant,
    wan27VideoVariant: fal.wan27VideoVariant,
    miniMaxH3Variant: fal.miniMaxH3Variant,
    flux3Variant: fal.flux3Variant,
    seedance2Variant: fal.seedance2Variant,
    seedance25Variant: fal.seedance25Variant,
    seedance2VolcengineModel: fal.seedance2VolcengineModel,
    hasActivePrimaryImage: Boolean(activePrimaryImage),
    hasPrimarySelection: primarySelectionMediaType !== null,
  }), [
    activePrimaryImage,
    fal.falModelId,
    fal.flux3Variant,
    fal.klingO3Variant,
    fal.klingVariant,
    fal.miniMaxH3Variant,
    fal.seedance25Variant,
    fal.seedance2Variant,
    fal.seedance2VolcengineModel,
    fal.veo31Variant,
    fal.wan27VideoVariant,
    primarySelectionMediaType,
  ]);
  const capabilitySelection = modelCapabilities.selection;
  const isKlingO3VideoInputMode = capabilitySelection.klingO3VideoInputMode;
  const isKlingO3ReferenceMode = capabilitySelection.klingO3ReferenceMode;
  const isVeo31ExtendMode = capabilitySelection.veo31ExtendMode;
  const supportsTailFrameSelection = modelCapabilities.supportsTailFrame; // End-frame capable modes.

  // Per-reference style strengths for Krea 2 Large.
  const {
    krea2StyleReferenceStrengths,
    setKrea2StyleReferenceStrengths,
    handleKrea2StyleReferenceStrengthChange,
  } = useKrea2StyleStrengths({ isActive: isActiveKrea2LargeModel, referenceImageIds });
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
  // Zoom triggers, scale store, and badge visibility.
  const {
    zoomToFitTrigger,
    zoomToSelectionTrigger,
    zoomInTrigger,
    zoomOutTrigger,
    canvasScaleStore,
    showZoomLevelBadge,
    requestZoomIn,
    requestZoomOut,
    handleZoomToFit,
    triggerZoomToSelection,
    requestZoomToSelection,
    handleToggleZoomLevelBadge,
  } = useZoomControls({ hasSelection: selectedImageIds.length > 0 });

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

  // Voice recording -> waveform card on the canvas.
  const {
    isRecording,
    recordingDuration,
    handleRecordToggle,
  } = useAudioRecordingToCanvas({
    setState,
    setSelectedImageIds,
    setReferenceImageIds,
    setTool,
    setToastMessage,
    setError,
  });

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
    triggerZoomToSelection();
  }, [
    dismissGenerationNotification,
    images,
    triggerZoomToSelection,
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

  const openBackupsModal = useCallback(() => {
    openAppOwnedBlockingOverlay('backups');
  }, [openAppOwnedBlockingOverlay]); // Backup listing/restore state lives inside AppModals.

  const handleImportSnapshot = useCallback(() => {
    closeFileMenu();
    importSnapshotWithPicker(() => {
      snapshotInputRef.current?.click();
    });
  }, [closeFileMenu, importSnapshotWithPicker]);

  // Electron-only integration: settings status, native file-menu commands, macOS chrome.
  const {
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
  } = useDesktopIntegration({
    runtimeConfig,
    setDesktopSettingsMode,
    setIsDesktopSettingsOpen,
    openAppOwnedBlockingOverlay,
    menuCommands: {
      importSnapshot: handleImportSnapshot,
      exportSnapshot: handleExportSnapshot,
      openBackups: openBackupsModal,
      toggleAutosave: handleToggleAutosave,
      toggleZoomLevelBadge: handleToggleZoomLevelBadge,
      toggleFileName,
      toggleTrackpadMode,
      openDebugLog: openDebugLogPanel,
      clearJimengCache: jimengSetup.handleClearCache,
    },
    fileMenuState: {
      autosaveEnabled,
      showZoomLevelBadge,
      showFileName,
      trackpadMode,
      isClearingJimengCache: jimengSetup.isClearingCache,
    },
  });

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

  const isCameraSettingsEnabled = modelCapabilities.supportsCameraSettings;

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


  const selectedImageIndex = primaryImageId ? images.findIndex(img => img.id === primaryImageId) : -1;
  const isImageOverlapping = primaryImageId && selectedImageIndex !== -1 ? images.some(other => other.id !== primaryImageId && isOverlapping(images[selectedImageIndex], other)) : false;
  const canMoveUp = selectedImageIndex > -1 && selectedImageIndex < images.length - 1;
  const canMoveDown = selectedImageIndex > -1 && selectedImageIndex > 0;

  const isAnnotateModeDisabled = !modelCapabilities.supportsAnnotate;

  useEffect(() => {
    if (appMode === 'ANNOTATE' && isAnnotateModeDisabled) {
      handleModeChange('CANVAS');
    }
  }, [appMode, handleModeChange, isAnnotateModeDisabled]);

  const isMultimodalReferenceMode = capabilitySelection.multimodalReferenceMode; // Modes that label the merged selected and tagged refs.
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
  // Reference/element @-labels and the merged id lists Canvas renders.
  const {
    klingReferenceOrderLabels,
    klingElementOrderLabels,
    seedance2ReferenceAssetCount,
    canvasElementImageIds,
    canvasReferenceOrderLabels,
    canvasElementOrderLabels,
    canvasReferenceImageIds,
    canvasReferenceVideoIds,
    canvasReferenceAudioIds,
  } = useCanvasReferenceLabels({
    capabilitySelection,
    klingSuggestionsEnabled: modelCapabilities.klingSuggestionsEnabled,
    isKlingO3VideoModel: fal.isKlingO3VideoModel,
    effectiveSeedanceReferenceImageIds,
    effectiveSeedanceReferenceVideoIds,
    effectiveSeedanceReferenceAudioIds,
    referenceImageIds,
    referenceVideoIds,
    referenceAudioIds,
    elementImageIds,
    primaryImageId,
    primarySelectionMediaType,
    sourceVideoId,
    videoLastFrameImageId,
    flux3CanvasLabels,
    videoPromptAreaLabelMap,
    acceptedVideoPromptImageIds,
    acceptedVideoPromptVideoIds,
    acceptedVideoPromptAudioIds,
    acceptedVideoPromptElementIds,
  });

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

  // Validation layer for prompt submission that enforces provider/model-specific rules.
  const {
    submitDisabled,
    submitDisabledReason,
    promptPlaceholderText,
    disablePromptInput,
    shouldValidateFalOptions,
    isNumImagesInvalid,
    isTextToImage,
  } = useGenerationGuards(buildGenerationGuardArgs({
    apiProvider,
    appMode,
    tool,
    prompt,
    fal,
    capabilities: modelCapabilities,
    flux3RunPlan,
    hasSourceVideo: hasSourceVideoSelected,
    hasSourceAudio: hasSourceAudioSelected,
    seedance2ReferenceAssetCount,
    seedance2ReferenceVideoCount: effectiveSeedanceReferenceVideoIds.length,
    taggedReferenceImageCount: referenceImageIds.length,
    taggedReferenceVideoCount: referenceVideoIds.length,
    activePrimaryImage,
    primarySelectionMediaType,
    hasSelectedStillImage,
    selectedMediaCount: selectedImageIds.length,
    selectedStillImageCount,
  }));

  // Derive UI controls for the prompt bar based on provider, model, and mode selections.
  const promptBarModelControls = buildPromptBarModelControls(buildFooterPromptBarControlsInput({
    apiProvider,
    fal,
    flux3: {
      keyframeError: flux3KeyframeError ?? undefined,
      onFlux3DurationChange: handleFlux3DurationChange,
      onFlux3KeyframeTimingChange: handleFlux3KeyframeTimingChange,
    },
    hasFirstFrameImage: Boolean(activePrimaryImage),
    isLoading,
    shouldValidateFalOptions,
    isNumImagesInvalid,
  }));
  const promptBarModelOptions = mapModelOptions(getPromptBarModelOptions(fal.falModelMode));
  const providerLabels = useMemo<Record<ApiProviderId, string>>(() => ({
    google: PROVIDER_LABELS.google,
    fal: modelCapabilities.provider === 'jimeng'
      ? 'JM CLI'
      : modelCapabilities.provider === 'volcengine' ? 'VOLCENGINE' : PROVIDER_LABELS.fal,
  }), [modelCapabilities.provider]);
  const shouldShowNegativePrompt = modelCapabilities.showNegativePrompt;
  const isCameraPromptAccentActive = isCameraSettingsEnabled && hasCameraSettings(cameraSettings);
  const promptOutlineColor = isCameraPromptAccentActive
    ? '#f59e0b'
    : shouldShowNegativePrompt ? '#34d399' : undefined;
  const negativePromptOutlineColor = shouldShowNegativePrompt ? '#f87171' : undefined;
  const activeNegativePrompt = generationNegativePrompt;
  const activeNegativePromptSetter = fal.isWan27ImageModel ? setWan27ImageNegativePrompt : setVideoNegativePrompt;
  const isTopToolbarSuppressed = cropMode !== null || transformMode !== null; // Keep its grid width while crop or transform controls take over.

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
          isSeedance15FflfMode={capabilitySelection.seedance15FflfMode}
          isKlingV3ControlVideoInputMode={capabilitySelection.klingV3ControlVideoInputMode}
          isVeo31ExtendMode={isVeo31ExtendMode}
          isWanAnimateVideoInputMode={capabilitySelection.wanAnimateVideoInputMode}
          isWan27VideoMode={capabilitySelection.wan27VideoMode}
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
      <AppModals
        isBackupsOpen={isBackupsOpen}
        setIsBackupsOpen={setIsBackupsOpen}
        importSnapshotFromFile={handleImportSnapshotFromFile}
        setError={setError}
        isDesktopSettingsOpen={isDesktopSettingsOpen}
        setIsDesktopSettingsOpen={setIsDesktopSettingsOpen}
        desktopSettingsStatus={desktopSettingsStatus}
        setDesktopSettingsStatus={setDesktopSettingsStatus}
        desktopSettingsMode={desktopSettingsMode}
        hasDesktopAppIconBridge={hasDesktopAppIconBridge}
        isDesktopAppIconOpen={isDesktopAppIconOpen}
        setIsDesktopAppIconOpen={setIsDesktopAppIconOpen}
        isDebugLogOpen={isDebugLogOpen}
        debugLogEntries={debugLogEntries}
        closeDebugLogPanel={closeDebugLogPanel}
        copyLastEntry={copyLastEntry}
      />
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
        blindTestMapping={blindTestMapping}
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

      {/* Provider switcher + prompt bar (hidden while cropping/transforming) */}
      <AppFooter
        hidden={Boolean(cropMode) || Boolean(transformMode)}
        providers={AVAILABLE_PROVIDERS}
        apiProvider={apiProvider}
        providerLabels={providerLabels}
        onProviderSelect={setApiProvider}
        isLoading={isLoading}
        fal={fal}
        prompt={prompt}
        onPromptChange={setPrompt}
        onSubmit={handlePromptSubmit}
        isEmbeddedPromptBarActive={isEmbeddedPromptBarActive}
        disablePromptInput={disablePromptInput}
        submitDisabled={submitDisabled}
        submitDisabledReason={submitDisabledReason}
        jimengBlocksSubmit={jimengSetup.shouldBlockSelectedSubmit}
        modelOptions={promptBarModelOptions}
        onModelModeChange={handleModelModeChange}
        modelControls={promptBarModelControls}
        promptPlaceholder={modelCapabilities.promptPlaceholder ?? promptPlaceholderText}
        showNegativePrompt={shouldShowNegativePrompt}
        negativePrompt={activeNegativePrompt}
        onNegativePromptChange={activeNegativePromptSetter}
        promptOutlineColor={promptOutlineColor}
        negativePromptOutlineColor={negativePromptOutlineColor}
        cameraThemeActive={isCameraPromptAccentActive}
        klingSuggestionsEnabled={modelCapabilities.klingSuggestionsEnabled}
        klingReferenceCount={Math.max(klingReferenceCount, flux3PromptMentions.length)}
        klingSuggestionOptions={flux3PromptMentions.length ? flux3PromptMentions : klingPromptMentions}
        showCreateVideoPromptBarButton={shouldShowVideoPromptBarAccessory}
        onCreateVideoPromptBar={handleCreateVideoPromptBar}
        focusRequestToken={promptFocusRequestToken}
      />
      </>)}
    </div>
  );
}
