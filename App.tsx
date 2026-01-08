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
} from './types';
import { FalQueuePanel } from './components/FalQueuePanel';
import { DebugLogPanel } from './components/DebugLogPanel';
import { clearDebugLogs } from './services/debugLog';
import {
  KLING_IMAGE_MODEL_ID,
  NANO_BANANA_PRO_EDIT_MODEL_ID,
  NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID,
  ONE_TO_ALL_ANIMATE_MODEL_ID,
  SCAIL_VIDEO_MODEL_ID,
  REVE_TEXT_TO_IMAGE_MODEL_ID,
  SEEDREAM_MODEL_ID,
  SEEDREAM_V45_MODEL_ID,
  SEEDREAM_TEXT_TO_IMAGE_MODEL_ID,
  SEEDREAM_V45_TEXT_TO_IMAGE_MODEL_ID,
  WAN_26_IMAGE_TEXT_TO_IMAGE_MODEL_ID,
  WAN_26_IMAGE_DEFAULT_NEGATIVE_PROMPT,
  getFalModelLabel,
  getMaxReferenceImages,
  isKlingO1VideoModelId,
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
import { StatusBanner } from './components/StatusBanner';
import { ImageResizeToast } from './components/ImageResizeToast';
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
import { getBackupSession, listBackupSessions, type BackupSessionSummary } from './services/backupService';
import type { FalModelMode } from './services/modelConfig';
import {
  EMPTY_CAMERA_SELECTION,
  buildCameraPromptPrefix,
  cloneCameraSelection,
  hasCameraSettings,
  type CameraSettingsSelection,
} from './utils/cameraSettings';

// Type alias for API providers
type ApiProvider = ApiProviderId;
// Defines preferred order of API providers
const PROVIDER_ORDER: ReadonlyArray<ApiProviderId> = ['google', 'fal'];
// Checks if an environment variable is a non-empty string
const hasEnvValue = (value: string | undefined): boolean => typeof value === 'string' && value.trim().length > 0;

// Detect which API providers are usable based on available API keys in env.
const providerAvailability: Record<ApiProvider, boolean> = {
  google: hasEnvValue(process.env.GEMINI_API_KEY ?? process.env.API_KEY),
  fal: hasEnvValue(process.env.FAL_API_KEY),
};

// Determine available API providers based on environment, assign user-friendly labels, and set default provider.
const AVAILABLE_PROVIDERS = PROVIDER_ORDER.filter(provider => providerAvailability[provider]) as ApiProvider[]; // List of enabled providers
const PROVIDER_LABELS: Record<ApiProvider, string> = { google: 'Google', fal: 'FAL' }; // Mapping of provider IDs to display names
const DEFAULT_API_PROVIDER: ApiProvider = AVAILABLE_PROVIDERS[0] ?? 'google'; // Default provider (first available or fallback)
const clampStrokeSize = (value: number) => Math.min(MAX_STROKE_SIZE, Math.max(MIN_STROKE_SIZE, value));

// Root component wires up canvas state, generation controls, and provider-specific settings.
export default function App() {
  const [appMode, setAppMode] = useState<AppMode>('CANVAS');
  const [tool, setTool] = useState<Tool>(Tool.PAN);
  const [brushSize, setBrushSize] = useState(20);
  const [eraserSize, setEraserSize] = useState(20);
  const [brushColor, setBrushColor] = useState('#ff0000');
  const [prompt, setPrompt] = useState('');
  const [cameraSettings, setCameraSettings] = useState<CameraSettingsSelection>(
    () => cloneCameraSelection(EMPTY_CAMERA_SELECTION),
  );

  // Canvas state/history: manages undo/redo, staged edits, and exposes current media slices
  const {
    images,                // Committed canvas images
    paths,                 // Committed drawing paths (brush/annotate)
    notes,                 // Committed notes
    displayedImages,       // Images currently displayed (may include live edits)
    displayedPaths,        // Paths currently displayed (may include live edits)
    displayedNotes,        // Notes currently displayed (may include live edits)
    setState,              // Update state with undo/redo support
    setLiveImages,         // Stage in-progress edits to images
    setLivePaths,          // Stage in-progress edits to paths
    setLiveNotes,          // Stage in-progress edits to notes
    commit: handleCommit,  // Commit staged (live) edits as a new history entry
    undo,                  // Undo last committed action
    redo,                  // Redo last undone action
    canUndo,               // Whether undo is currently possible
    canRedo,               // Whether redo is currently possible
    resetHistory,          // Reset canvas state and undo/redo stack
  } = useCanvasHistory({ images: [], paths: [], notes: [] });
  
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

  // State for transient toast message notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // State for currently selected API provider (e.g., 'google', 'fal')
  const [apiProvider, setApiProvider] = useState<ApiProvider>(DEFAULT_API_PROVIDER);

  // FAL job queue state + auto-dismiss handling.
  const { falJobs, setFalJobs, dismissFalJob: handleDismissFalJob } = useFalQueueJobs();

  // FAL model and option state/handlers (image/video mode, variants, sliders, etc.)
  const fal = useFalSettings({ apiProvider });

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

  // Negative prompt state for Wan 2.6 Image model
  const [wan26ImageNegativePrompt, setWan26ImageNegativePrompt] = useState<string>(WAN_26_IMAGE_DEFAULT_NEGATIVE_PROMPT);

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
  // Autosave is opt-out; user can disable it in the file menu.
  const [autosaveEnabled, setAutosaveEnabled] = useState(true);
  // Increment after each successful generation to trigger autosave.
  const [generationTick, setGenerationTick] = useState(0);
  const [isBackupsOpen, setIsBackupsOpen] = useState(false);
  const [backupSessions, setBackupSessions] = useState<BackupSessionSummary[]>([]);
  const [isBackupsLoading, setIsBackupsLoading] = useState(false);
  const {
    isDebugLogOpen,
    debugLogEntries,
    openDebugLogPanel,
    closeDebugLogPanel,
    copyLastEntry,
  } = useDebugLogState({
    onOpen: () => setIsFileMenuOpen(false),
  });

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
  const isKlingO1VideoInputMode = fal.isKlingO1EditMode || fal.isKlingO1RefV2VMode;
  const showReferenceLimitToast = useCallback((maxReferenceImages: number) => {
    if (isKlingO1VideoModelId(fal.falModelId)) {
      // Edit/refV2V variants have 4 total limit, refI2V has 6
      const baseLimit = isKlingO1VideoInputMode ? 4 : getMaxReferenceImages(fal.falModelId);
      const totalLimit = baseLimit + 1;
      const variantLabel = fal.isKlingO1EditMode ? 'Kling O1 Edit' : fal.isKlingO1RefV2VMode ? 'Kling O1 Ref-v2v' : 'Kling O1 Video';
      setToastMessage(`${variantLabel} supports up to ${totalLimit} images total (source + references + elements). Slots remaining: ${Math.max(0, maxReferenceImages)} for references/elements.`);
      setTimeout(() => setToastMessage(null), 2000);
      return;
    }
    if (fal.falModelId === ONE_TO_ALL_ANIMATE_MODEL_ID && maxReferenceImages === 0) {
      setToastMessage('Tip: Shift-click toggles reference selection. For One-to-All Animation, click the pose video, then click the image to animate (Cmd/Ctrl+click for multi-select).');
      setTimeout(() => setToastMessage(null), 2000);
      return;
    }
    if (fal.falModelId === SEEDREAM_V45_MODEL_ID && maxReferenceImages >= 10) {
      setToastMessage('Seedream v4.5 only accepts up to 10 reference images.');
      setTimeout(() => setToastMessage(null), 2000);
      return;
    }
    if (fal.falModelId === REVE_TEXT_TO_IMAGE_MODEL_ID) {
      setToastMessage('Reve remix supports up to 6 images total (1 primary + 5 references). Use @Image1, @Image2, etc. in your prompt to reference them.');
      setTimeout(() => setToastMessage(null), 4000);
      return;
    }
    if (fal.falModelId === WAN_26_IMAGE_TEXT_TO_IMAGE_MODEL_ID) {
      setToastMessage('Wan 2.6 Image supports up to 4 images total (1 primary + 3 references). Use @Image1, @Image2, etc. in your prompt to reference them.');
      setTimeout(() => setToastMessage(null), 4000);
      return;
    }
    const totalLimit = maxReferenceImages + 1;
    setToastMessage(`${getFalModelLabel(fal.falModelId)} supports up to ${maxReferenceImages} reference images (${totalLimit} total including the primary).`);
    setTimeout(() => setToastMessage(null), 2000);
  }, [fal.falModelId, fal.isKlingO1EditMode, fal.isKlingO1RefV2VMode, isKlingO1VideoInputMode, setToastMessage]);

  const isKlingModel = !fal.isVideoMode && fal.falModelId === KLING_IMAGE_MODEL_ID;
  const isKlingO1FflfMode = fal.isKlingO1VideoModel && fal.klingO1Variant === 'fflf';
  const isScailVideoModel = fal.isVideoMode && fal.falVideoModelId === SCAIL_VIDEO_MODEL_ID;

  // Tracks which images/notes are selected and enforces model-specific selection rules (reference limits, primary frames).
  const selection = useSelectionState({
    images,
    apiProvider,
    fal,
    onError: setError,
    onReferenceLimit: showReferenceLimitToast,
  });

  const {
    selectedImageIds,
    selectedNoteIds,
    referenceImageIds,
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
    setElementImageIds,
    setVideoLastFrameImageId,
    setSourceVideoId,
    setSourceAudioId,
    handleImageSelection,
    handleNoteSelection,
  } = selection;

  const requestZoomToSelection = useCallback(() => {
    if (selectedImageIds.length === 0 && selectedNoteIds.length === 0) {
      return;
    }
    setZoomToSelectionTrigger(prev => prev + 1);
  }, [selectedImageIds.length, selectedNoteIds.length]);

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
    if (!fal.isKlingProVideoSelection && !isKlingO1FflfMode && videoLastFrameImageId) {
      setVideoLastFrameImageId(null);
    }
  }, [isKlingO1FflfMode, fal.isKlingProVideoSelection, videoLastFrameImageId]);

  const handleModelModeChange = useCallback((mode: FalModelMode) => {
    fal.handleModelModeChange(mode);
    // Model mode changes can invalidate reference selections, so reset them.
    setReferenceImageIds([]);
  }, [fal.handleModelModeChange, setReferenceImageIds]);

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

    // Remove selected images/notes while keeping other canvas content untouched.
    setState(prevState => ({
      ...prevState,
      images: selectedImageIds.length
        ? prevState.images.filter(img => !selectedImageIds.includes(img.id))
        : prevState.images,
      notes: selectedNoteIds.length
        ? prevState.notes.filter(note => !selectedNoteIds.includes(note.id))
        : prevState.notes,
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
  }, [selectedImageIds, selectedNoteIds, setState]);

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
      navigator.clipboard.writeText(note.text)
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
    const promptText = image?.metadata?.prompt?.trim();

    if (!promptText) {
      setToastMessage('No prompt found for this media.');
      setTimeout(() => setToastMessage(null), 2000);
      return;
    }

    navigator.clipboard.writeText(promptText)
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

  const handleGenerationComplete = useCallback(() => {
    setGenerationTick(prev => prev + 1);
  }, []);

  const openBackupsModal = useCallback(() => {
    setIsFileMenuOpen(false);
    setIsBackupsOpen(true);
  }, []);

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
      const backupFile = new File([session.blob], session.fileName, {
        type: session.blob.type || 'application/octet-stream',
      });
      await handleImportSnapshotFromFile(backupFile);
      setIsBackupsOpen(false);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to restore backup.';
      setError(message);
    }
  }, [handleImportSnapshotFromFile, setError]);

  const handleImportSnapshot = useCallback(() => {
    importSnapshotWithPicker(() => {
      closeFileMenu();
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
    // Changing tools finalizes any in-progress note edits or crop sessions to keep state consistent.
    setTool(newTool);
    if (editingNoteId) {
      setEditingNoteId(null);
      handleCommit();
    }
    if (cropMode) {
      handleCancelCrop();
    }
  }, [editingNoteId, handleCommit, cropMode, handleCancelCrop]);

  const isCameraSettingsEnabled = !fal.isVideoMode && (
    fal.falModelId === SEEDREAM_MODEL_ID
    || fal.falModelId === SEEDREAM_V45_MODEL_ID
    || fal.falModelId === SEEDREAM_TEXT_TO_IMAGE_MODEL_ID
    || fal.falModelId === SEEDREAM_V45_TEXT_TO_IMAGE_MODEL_ID
    || fal.falModelId === NANO_BANANA_PRO_EDIT_MODEL_ID
    || fal.falModelId === NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID
  );

  const cameraPromptPrefix = useMemo(() => (
    isCameraSettingsEnabled ? buildCameraPromptPrefix(cameraSettings) : ''
  ), [cameraSettings, isCameraSettingsEnabled]);

  // Centralized generation handler that calls provider APIs and writes results back to canvas state.
  const handleGenerate = useGeneration({
    appMode,
    tool,
    prompt,
    promptPrefix: cameraPromptPrefix,
    apiProvider,
    fal,
    selection,
    images,
    paths,
    videoNegativePrompt,
    setError,
    setIsLoading,
    setFalJobs,
    setState,
    setToastMessage,
    setTool,
    onGenerationComplete: handleGenerationComplete,
  });

  useEffect(() => {
    autosaveSnapshotRef.current = autosaveSnapshot;
  }, [autosaveSnapshot]);

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

  useKeyboardShortcuts({
    onGenerate: handleGenerate,
    appMode,
    setTool,
    requestZoomIn,
    requestZoomOut,
    onZoomToFit: handleZoomToFit,
    onZoomToSelection: requestZoomToSelection,
    onDelete: handleDelete,
    onRecordToggle: handleRecordToggle,
    onAdjustStrokeSize: handleAdjustStrokeSize,
    onUndo: undo,
    onRedo: redo,
  });

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Re-run a past generation using the saved metadata on the selected image.
  const handleRerunGeneration = useCallback((imageId: string) => {
    const targetImage = images.find(img => img.id === imageId);
    const generation = targetImage?.metadata?.generation;
    if (!generation) {
      setToastMessage('No generation data to rerun.');
      setTimeout(() => setToastMessage(null), 2000);
      return;
    }
    void handleGenerate(generation);
  }, [handleGenerate, images, setToastMessage]);

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

  const selectedImageIndex = primaryImageId ? images.findIndex(img => img.id === primaryImageId) : -1;
  const isImageOverlapping = primaryImageId && selectedImageIndex !== -1 ? images.some(other => other.id !== primaryImageId && isOverlapping(images[selectedImageIndex], other)) : false;
  const canMoveUp = selectedImageIndex > -1 && selectedImageIndex < images.length - 1;
  const canMoveDown = selectedImageIndex > -1 && selectedImageIndex > 0;

  const usingFal = apiProvider === 'fal';
  const isSeedreamModel = !fal.isVideoMode && isSeedreamModelId(fal.falModelId);
  const isNanoBananaModel = !fal.isVideoMode && fal.falModelId === NANO_BANANA_PRO_EDIT_MODEL_ID;
  const isReveModel = !fal.isVideoMode && fal.falModelId === REVE_TEXT_TO_IMAGE_MODEL_ID;
  const isAnnotateModeDisabled = (fal.isVideoMode && !fal.isHailuoVideoModel) || isReveModel || fal.isFlux2MaxModel || fal.isUpscaleModel;

  useEffect(() => {
    if (appMode === 'ANNOTATE' && isAnnotateModeDisabled) {
      handleModeChange('CANVAS');
    }
  }, [appMode, handleModeChange, isAnnotateModeDisabled]);

  const {
    referenceOrderLabels: klingReferenceOrderLabels,
    elementOrderLabels: klingElementOrderLabels,
  } = useKlingReferenceHelpers({
    labelReferences: isKlingModel || fal.isKlingO1VideoModel || isReveModel || fal.isFlux2MaxModel || fal.isWan26ImageModel,
    primaryImageId,
    primaryImageMediaType: primarySelectionMediaType,
    referenceImageIds,
    labelElements: fal.isKlingO1VideoModel,
    elementImageIds,
    isEditMode: isKlingO1VideoInputMode,
    sourceVideoId,
    includeTailFrame: isKlingO1FflfMode,
    tailImageId: videoLastFrameImageId,
  });

  const hasSourceVideoSelected = Boolean(sourceVideoId);
  const hasSourceAudioSelected = Boolean(sourceAudioId);

  // Show warning when video or audio exceeds 15 seconds in lip sync mode
  useEffect(() => {
    if (!fal.isLipsyncVideoModel) {
      return;
    }

    // Check video duration
    if (sourceVideoId) {
      const sourceVideo = images.find(img => img.id === sourceVideoId);
      if (sourceVideo?.mediaType === 'video') {
        const videoElement = sourceVideo.element as HTMLVideoElement | undefined;
        const durationSeconds = videoElement?.duration;
        if (typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds > 15) {
          setToastMessage('Lip Sync requires videos 15 seconds or shorter');
          setTimeout(() => setToastMessage(null), 4000);
        }
      }
    }

    // Check audio duration
    if (sourceAudioId) {
      const sourceAudio = images.find(img => img.id === sourceAudioId);
      if (sourceAudio?.mediaType === 'audio') {
        const audioDuration = sourceAudio.audioDuration;
        if (typeof audioDuration === 'number' && Number.isFinite(audioDuration) && audioDuration > 15) {
          setToastMessage('Lip Sync requires audio 15 seconds or shorter');
          setTimeout(() => setToastMessage(null), 4000);
        }
      }
    }
  }, [fal.isLipsyncVideoModel, sourceVideoId, sourceAudioId, images]);

  // Build prompt mention suggestions for Kling/Wan based on current reference/element selections.
  const { klingPromptMentions, klingReferenceCount } = useKlingPromptMentions({
    isKlingModel,
    isKlingO1VideoModel: fal.isKlingO1VideoModel,
    isKlingO1EditMode: fal.isKlingO1EditMode,
    isKlingO1RefV2VMode: fal.isKlingO1RefV2VMode,
    isReveModel,
    isFlux2MaxModel: fal.isFlux2MaxModel,
    isWan26ImageModel: fal.isWan26ImageModel,
    referenceOrderLabels: klingReferenceOrderLabels,
    elementOrderLabels: klingElementOrderLabels,
    referenceImageIds,
    hasSingleImageSelected,
    primarySelectionMediaType,
  });

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
    isKlingO1EditMode: fal.isKlingO1EditMode,
    isKlingO1RefV2VMode: fal.isKlingO1RefV2VMode,
    hasSourceVideo: hasSourceVideoSelected,
    hasSourceAudio: hasSourceAudioSelected,
    isVideoMode: fal.isVideoMode,
    isUpscaleModel: fal.isUpscaleModel,
    isSeedreamModel,
    isNanoBananaModel,
    isReveModel,
	    isKlingModel,
		    isKlingVideoModel: fal.isKlingVideoModel,
		    isKling26VideoModel: fal.isKling26VideoModel,
        isKling26ControlVideoModel: fal.isKling26ControlVideoModel,
		    isHailuoVideoModel: fal.isHailuoVideoModel,
    falModelId: fal.falModelId,
    falNumImages: fal.falNumImages,
    activePrimaryImage,
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
    isReveModel,
    isKlingModel,
    isFlux2MaxModel: fal.isFlux2MaxModel,
    isUpscaleModel: fal.isUpscaleModel,
	    isKlingVideoModel: fal.isKlingVideoModel,
	    isKlingO1VideoModel: fal.isKlingO1VideoModel,
		    isKling26VideoModel: fal.isKling26VideoModel,
        isKling26ControlVideoModel: fal.isKling26ControlVideoModel,
		    isHailuoVideoModel: fal.isHailuoVideoModel,
		    isWanAnimateVideoModel: fal.isWanAnimateVideoModel,
		    isLipsyncVideoModel: fal.isLipsyncVideoModel,
        isInfinitalkVideoModel: fal.isInfinitalkVideoModel,
        isWan26I2VVideoModel: fal.isWan26I2VVideoModel,
        isSeedance15VideoModel: fal.isSeedance15VideoModel,
		    hailuoVariant: fal.hailuoVariant,
		    falVideoDuration: fal.falVideoDuration,
		    klingVariant: fal.klingVariant,
	    klingO1Variant: fal.klingO1Variant,
	    klingO1KeepAudio: fal.klingO1KeepAudio,
	    kling26AudioSelection: fal.kling26AudioSelection,
        kling26ControlVariant: fal.kling26ControlVariant,
        kling26ControlKeepSound: fal.kling26ControlKeepSound,
        kling26ControlDriver: fal.kling26ControlDriver,
	    wanTargetResolution: fal.wanTargetResolution,
	    wanCreativity: fal.wanCreativity,
	    wanAnimateVariant: fal.wanAnimateVariant,
	    wanAnimateSteps: fal.wanAnimateSteps,
	    wanAnimateResolution: fal.wanAnimateResolution,
        oneToAllAnimateResolution: fal.oneToAllAnimateResolution,
	    wanAnimateShift: fal.wanAnimateShift,
	    wanAnimateQuality: fal.wanAnimateQuality,
	    wanAnimateUseTurbo: fal.wanAnimateUseTurbo,
	    lipsyncEmotion: fal.lipsyncEmotion,
	    lipsyncModelMode: fal.lipsyncModelMode,
	    lipsyncAudioMode: fal.lipsyncAudioMode,
        infinitalkResolution: fal.infinitalkResolution,
        infinitalkSeed: fal.infinitalkSeed,
        infinitalkAcceleration: fal.infinitalkAcceleration,
        infinitalkDuration: fal.infinitalkDuration,
        wan26Resolution: fal.wan26Resolution,
        wan26Duration: fal.wan26Duration,
        wan26PromptExpansion: fal.wan26PromptExpansion,
        wan26MultiShots: fal.wan26MultiShots,
        seedance15AspectRatio: fal.seedance15AspectRatio,
        seedance15Resolution: fal.seedance15Resolution,
        seedance15Duration: fal.seedance15Duration,
        seedance15CameraFixed: fal.seedance15CameraFixed,
        seedance15Audio: fal.seedance15Audio,
        flux2MaxImageSize: fal.flux2MaxImageSize,
        isWan26ImageModel: fal.isWan26ImageModel,
        wan26ImageAspectRatio: fal.wan26ImageAspectRatio,
        wan26ImageMaxImages: fal.wan26ImageMaxImages,
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
	    onKlingO1VariantChange: fal.handleKlingO1VariantChange,
	    onKlingO1KeepAudioChange: fal.handleKlingO1KeepAudioChange,
	    onKling26AudioChange: fal.handleKling26AudioChange,
        onKling26ControlVariantChange: fal.handleKling26ControlVariantChange,
        onKling26ControlKeepSoundChange: fal.handleKling26ControlKeepSoundChange,
        onKling26ControlDriverChange: fal.handleKling26ControlDriverChange,
	    onWanTargetResolutionChange: fal.handleWanTargetResolutionChange,
	    onWanCreativityChange: fal.handleWanCreativityChange,
	    onWanAnimateVariantChange: fal.handleWanAnimateVariantChange,
	    onWanAnimateStepsChange: fal.handleWanAnimateStepsChange,
	    onWanAnimateResolutionChange: fal.handleWanAnimateResolutionChange,
        onOneToAllAnimateResolutionChange: fal.handleOneToAllAnimateResolutionChange,
	    onWanAnimateShiftChange: fal.handleWanAnimateShiftChange,
	    onWanAnimateQualityChange: fal.handleWanAnimateQualityChange,
	    onWanAnimateTurboChange: fal.handleWanAnimateTurboChange,
	    onLipsyncEmotionChange: fal.handleLipsyncEmotionChange,
	    onLipsyncModelModeChange: fal.handleLipsyncModelModeChange,
	    onLipsyncAudioModeChange: fal.handleLipsyncAudioModeChange,
        onInfinitalkResolutionChange: fal.handleInfinitalkResolutionChange,
        onInfinitalkSeedChange: fal.handleInfinitalkSeedChange,
        onInfinitalkAccelerationChange: fal.handleInfinitalkAccelerationChange,
        onInfinitalkDurationChange: fal.handleInfinitalkDurationChange,
        onWan26ResolutionChange: fal.handleWan26ResolutionChange,
        onWan26DurationChange: fal.handleWan26DurationChange,
        onWan26PromptExpansionChange: fal.handleWan26PromptExpansionChange,
        onWan26MultiShotsChange: fal.handleWan26MultiShotsChange,
        onSeedance15AspectRatioChange: fal.handleSeedance15AspectRatioChange,
        onSeedance15ResolutionChange: fal.handleSeedance15ResolutionChange,
        onSeedance15DurationChange: fal.handleSeedance15DurationChange,
        onSeedance15CameraFixedChange: fal.handleSeedance15CameraFixedChange,
        onSeedance15AudioChange: fal.handleSeedance15AudioChange,
        onFlux2MaxImageSizeChange: fal.handleFlux2MaxImageSizeChange,
        onWan26ImageAspectRatioChange: fal.handleWan26ImageAspectRatioChange,
        onWan26ImageMaxImagesChange: fal.handleWan26ImageMaxImagesChange,
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
  const shouldShowNegativePrompt = shouldShowVideoNegativePrompt || fal.isWan26ImageModel;
  const isCameraPromptAccentActive = isCameraSettingsEnabled && hasCameraSettings(cameraSettings);
  const promptOutlineColor = isCameraPromptAccentActive
    ? '#f59e0b'
    : shouldShowNegativePrompt ? '#34d399' : undefined;
  const negativePromptOutlineColor = shouldShowNegativePrompt ? '#f87171' : undefined;
  const activeNegativePrompt = fal.isWan26ImageModel ? wan26ImageNegativePrompt : videoNegativePrompt;
  const activeNegativePromptSetter = fal.isWan26ImageModel ? setWan26ImageNegativePrompt : setVideoNegativePrompt;


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
      {/* File menu button and dropdown */}
      <FileMenu
        isOpen={isFileMenuOpen}
        onToggle={toggleFileMenu}
        onClose={closeFileMenu}
        onImportSnapshot={handleImportSnapshot}
        onExportSnapshot={handleExportSnapshot}
        onOpenBackups={openBackupsModal}
        autosaveEnabled={autosaveEnabled}
        onToggleAutosave={handleToggleAutosave}
        onOpenDebugLog={openDebugLogPanel}
      />

      {/* Main toolbar, hidden during crop/transform */}
      {!cropMode && !transformMode && (
      <Toolbar
        activeTool={tool}
        onToolChange={handleToolChange}
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

      {/* Recording overlay */}
      <RecordingOverlay duration={recordingDuration} visible={isRecording} />

      {/* Main drawing area */}
      <main className="relative flex-1 min-h-0">
        <Canvas
          images={displayedImages}
          onImagesChange={setLiveImages}
          notes={displayedNotes}
          onNotesChange={handleNotesChange}
          tool={tool}
          appMode={appMode}
          paths={displayedPaths}
          onPathsChange={setLivePaths}
          brushSize={brushSize}
          eraserSize={eraserSize}
          brushColor={brushColor}
          selectedImageIds={selectedImageIds}
          selectedNoteIds={selectedNoteIds}
          referenceImageIds={referenceImageIds}
          referenceImageOrderLabels={klingReferenceOrderLabels}
          elementImageIds={elementImageIds}
          elementImageOrderLabels={klingElementOrderLabels}
          videoLastFrameImageId={videoLastFrameImageId}
          sourceVideoId={sourceVideoId}
          tailSelectionEnabled={fal.isKlingProVideoSelection || isKlingO1FflfMode || fal.isSeedance15VideoModel}
          isKlingO1VideoInputMode={isKlingO1VideoInputMode}
          isKlingO1FflfMode={isKlingO1FflfMode}
          isSeedance15FflfMode={fal.isSeedance15VideoModel}
          isKling26ControlVideoInputMode={fal.isKling26ControlVideoModel}
          isWanAnimateVideoInputMode={fal.isWanAnimateVideoModel || fal.isOneToAllAnimateVideoModel || isScailVideoModel}
          isWan26I2VMode={fal.isWan26I2VVideoModel}
          onError={setError}
          onImageSelect={handleImageSelection}
          onNoteSelect={handleNoteSelection}
          onCommit={handleCommit}
          onFilesDrop={handleFilesDrop}
          zoomToFitTrigger={zoomToFitTrigger}
          zoomToSelectionTrigger={zoomToSelectionTrigger}
          zoomInTrigger={zoomInTrigger}
          zoomOutTrigger={zoomOutTrigger}
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
          onImagePromptCopy={handleImagePromptCopy}
          onImageDuplicate={handleDuplicateImage}
          onRerunGeneration={handleRerunGeneration}
          showMetadataOverlay={showMetadataOverlay}
          transformMode={transformMode}
          onStartTransform={handleStartTransform}
          onExitTransform={handleExitTransform}
        />
        <ViewToolbar
          onZoomToFit={handleZoomToFit}
          disabled={images.length === 0 && notes.length === 0}
          metadataVisible={showMetadataOverlay}
          onToggleMetadata={() => setShowMetadataOverlay(prev => !prev)}
          blindTestEnabled={blindTestEnabled}
          openSourceAliasEnabled={openSourceAliasEnabled}
          onToggleBlindTest={handleBlindTestClick}
        />
      </main>

      {/* Error/status banners */}
      {error && (
        <StatusBanner message={error} variant="error" onClose={() => setError(null)} />
      )}
      {toastMessage && (
        <StatusBanner message={toastMessage} variant="success" />
      )}
      <BackupsModal
        isOpen={isBackupsOpen}
        isLoading={isBackupsLoading}
        sessions={backupSessions}
        onClose={closeBackupsModal}
        onRestore={handleRestoreBackup}
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
        blindTestEnabled={blindTestEnabled}
        openSourceAliasEnabled={openSourceAliasEnabled}
        blindTestMapping={blindTestMappingRef.current}
      />

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
          labels={PROVIDER_LABELS}
          disabled={isLoading}
          onSelect={setApiProvider}
        />
      )}

      {/* Prompt bar (if not cropping/transforming) */}
      {!cropMode && !transformMode && (
        <PromptBar
          prompt={prompt}
          onPromptChange={setPrompt}
          onSubmit={handleGenerate}
          isLoading={isLoading}
          inputDisabled={disablePromptInput}
          submitDisabled={submitDisabled}
          modelOptions={promptBarModelOptions}
          selectedModel={fal.falModelId}
          onModelChange={fal.handleFalModelChange}
          modelSelectDisabled={apiProvider !== 'fal' || isLoading}
          modelMode={fal.falModelMode}
          onModelModeChange={handleModelModeChange}
          modelModeDisabled={apiProvider !== 'fal' || isLoading}
          modelControls={promptBarModelControls}
          promptPlaceholder={
            fal.isWan26ImageModel
              ? 'Describe your generation, or your edit, or use @ to reference images (4 images in total)... (Cmd/Ctrl + Enter to generate)'
              : isKlingModel || fal.isKlingO1VideoModel || fal.isFlux2MaxModel
                ? 'Describe your generation, use @ to reference images and elements(objects and characters)... (Cmd/Ctrl + Enter to generate)'
                : promptPlaceholderText
          }
          showNegativePrompt={shouldShowNegativePrompt}
          negativePrompt={activeNegativePrompt}
          onNegativePromptChange={activeNegativePromptSetter}
          negativePromptPlaceholder={fal.isWan26ImageModel ? 'Describe what the image should avoid... (optional)' : 'Describe what the video should avoid... (optional)'}
          promptOutlineColor={promptOutlineColor}
          negativePromptOutlineColor={negativePromptOutlineColor}
          cameraThemeActive={isCameraPromptAccentActive}
          klingSuggestionsEnabled={isKlingModel || fal.isKlingO1VideoModel || isReveModel || fal.isFlux2MaxModel || fal.isWan26ImageModel}
          klingReferenceCount={klingReferenceCount}
          klingSuggestionOptions={klingPromptMentions}
        />
      )}
    </div>
  );
}
