import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Toolbar } from './components/Toolbar';
import { PromptBar } from './components/PromptBar';
import { Canvas } from './components/Canvas';
import {
  Tool,
  CanvasImage,
  InpaintMode,
  AppMode,
  ApiProviderId,
} from './types';
import { FalQueuePanel } from './components/FalQueuePanel';
import { DebugLogPanel } from './components/DebugLogPanel';
import { clearDebugLogs, getDebugLogs, subscribeToDebugLogs } from './services/debugLog';
import type { FalQueueJob } from './types';
import {
  GEMINI_IMAGE_PREVIEW_EDIT_MODEL_ID,
  KLING_DEFAULT_NEGATIVE_PROMPT,
  KLING_IMAGE_MODEL_ID,
  REVE_TEXT_TO_IMAGE_MODEL_ID,
  getFalModelLabel,
  getMaxReferenceImages,
  isKlingO1VideoModelId,
  isSeedreamModelId,
} from './services/modelConfig';
import {
  buildPromptBarModelControls,
  getPromptBarModelOptions,
} from './services/promptBarConfig';
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
import { useGenerationGuards } from './hooks/useGenerationGuards';
import { useImageResize } from './hooks/useImageResize';
import { useDuplicateCanvasMedia } from './hooks/useDuplicateCanvasMedia';
import { useKlingReferenceHelpers } from './hooks/useKlingReferenceHelpers';
import { useKlingPromptMentions } from './hooks/useKlingPromptMentions';
import type { FalModelMode } from './services/modelConfig';

// Type guard for CanvasImage elements that are images
const isImageCanvasMedia = (img: CanvasImage | null | undefined): img is CanvasImage & { element: HTMLImageElement } => !!img && img.mediaType === 'image';
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

// Root component wires up canvas state, generation controls, and provider-specific settings.
export default function App() {
  const [appMode, setAppMode] = useState<AppMode>('CANVAS');
  const [tool, setTool] = useState<Tool>(Tool.PAN);
  const [brushSize, setBrushSize] = useState(20);
  const [eraserSize, setEraserSize] = useState(20);
  const [brushColor, setBrushColor] = useState('#ff0000');
  const [prompt, setPrompt] = useState('');
  const [inpaintMode, setInpaintMode] = useState<InpaintMode>('STRICT');

  // Canvas state/history: manages undo/redo, staged edits, and exposes current media slices
  const {
    images,                // Committed canvas images
    paths,                 // Committed drawing paths (brush/inpaint)
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
  
  // Brush/inpaint layers (paths) are the only things we clear with the eraser button.
  const hasClearablePaths = displayedPaths.some(
    path =>
      (path.tool === Tool.ANNOTATE || path.tool === Tool.INPAINT) &&
      path.points.length > 0
  );
  // State for note editing (currently edited note's ID or null if none)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  // State to track if the app is currently performing a loading operation
  const [isLoading, setIsLoading] = useState(false);

  // State for error message display (null if no error)
  const [error, setError] = useState<string | null>(null);

  // Triggers to control zoom-to-fit, zoom-in, and zoom-out actions (increment to trigger effect)
  const [zoomToFitTrigger, setZoomToFitTrigger] = useState(0);
  const [zoomInTrigger, setZoomInTrigger] = useState(0);
  const [zoomOutTrigger, setZoomOutTrigger] = useState(0);

  // State for transient toast message notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // State for currently selected API provider (e.g., 'google', 'fal')
  const [apiProvider, setApiProvider] = useState<ApiProvider>(DEFAULT_API_PROVIDER);

  // State for tracking the queue of FAL (FastAI Lab) jobs
  const [falJobs, setFalJobs] = useState<FalQueueJob[]>([]);

  // Ref to store timeouts for auto-dismissing FAL job notifications, mapped by job ID
  const falAutoDismissTimeouts = useRef<Map<string, number>>(new Map());

  // FAL model and option state/handlers (image/video mode, variants, sliders, etc.)
  const {
    falModelMode,                // Current FAL model mode ('image' | 'video')
    falModelId,                  // Selected FAL model ID
    falImageModelId,             // Selected FAL image model ID
    falVideoModelId,             // Selected FAL video model ID
    falVideoDuration,            // Video duration selection for FAL
    hailuoVariant,               // Hailuo model variant ('standard' | 'pro')
    klingVariant,                // Kling model variant ('standard' | 'pro')
    klingO1Variant,              // Kling O1 video variant selection
    klingO1KeepAudio,            // Keep audio option for Kling O1 Edit
    kling26AudioSelection,       // Audio selection for Kling 2.6
    falImageSizeSelection,       // Image size selection for FAL
    falAspectRatioSelection,     // Aspect ratio selection for FAL
    falResolutionSelection,      // Resolution selection for FAL
    falNumImages,                // Number of images to generate for FAL
    falScaleFactor,              // Scale factor for upscaling models
    falNoiseScale,               // Noise scale (SeedVR upscaler, etc.)
    falCreativity,               // Creativity slider (Crystal upscaler, etc.)
    isVideoMode,                 // True if FAL is in video mode
    isKlingVideoModel,           // True if Kling video model is selected
    isKlingO1VideoModel,         // True if Kling O1 video model is selected
    isKling26VideoModel,         // True if Kling 2.6 video model is selected
    isHailuoVideoModel,          // True if Hailuo video model is selected
    isUpscaleModel,              // True if an upscaler model is selected
    isKlingProVideoSelection,    // True if Kling Pro video is selected
    isKlingO1EditMode,           // True if Kling O1 Edit variant is selected
    handleModelModeChange: handleFalModelModeChange, // Handler for switching FAL mode
    handleFalModelChange,                    // Handler for FAL model changes
    handleFalVideoDurationChange,            // Handler for FAL video duration changes
    handleHailuoVariantChange,               // Handler for Hailuo variant changes
    handleKlingVariantChange,                // Handler for Kling variant changes
    handleKlingO1VariantChange,              // Handler for Kling O1 variant changes
    handleKlingO1KeepAudioChange,            // Handler for Kling O1 keep audio changes
    handleKling26AudioChange,                // Handler for Kling 2.6 audio changes
    handleFalImageSizeChange,                // Handler for FAL image size changes
    handleFalAspectRatioChange,              // Handler for FAL aspect ratio changes
    handleFalResolutionChange,               // Handler for FAL resolution changes
    handleFalNumImagesChange,                // Handler for number of images change
    handleFalScaleFactorChange,              // Handler for scale factor changes
    handleFalNoiseScaleChange,               // Handler for noise scale changes
    handleFalCreativityChange,               // Handler for creativity changes
    setFalModelMode,                         // Setter for FAL model mode
    setFalImageModelId,                      // Setter for FAL image model ID
    setFalVideoModelId,                      // Setter for FAL video model ID
    setFalImageSizeSelection,                // Setter for FAL image size selection
    setFalAspectRatioSelection,              // Setter for FAL aspect ratio selection
    setFalResolutionSelection,               // Setter for FAL resolution selection
    setFalNumImages,                         // Setter for FAL number of images
    setFalScaleFactor,                       // Setter for FAL scale factor
    setFalNoiseScale,                        // Setter for FAL noise scale
    setFalCreativity,                        // Setter for FAL creativity
  } = useFalSettings({ apiProvider });

  // State for Kling negative prompt (used for Kling/SDXL models)
  const [klingNegativePrompt, setKlingNegativePrompt] = useState<string>(KLING_DEFAULT_NEGATIVE_PROMPT);

  // Toggles display of metadata overlays on canvas images
  const [showMetadataOverlay, setShowMetadataOverlay] = useState(false);

  // State for toggling the file menu and debug log panels
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [isDebugLogOpen, setIsDebugLogOpen] = useState(false);

  // State for storing and updating debug log entries
  const [debugLogEntries, setDebugLogEntries] = useState(() => getDebugLogs());

  // Callbacks to programmatically trigger zoom in/out from controls
  const requestZoomIn = useCallback(() => {
    setZoomInTrigger(prev => prev + 1);
  }, []);
  const requestZoomOut = useCallback(() => {
    setZoomOutTrigger(prev => prev + 1);
  }, []);

  // Shows a toast when the reference image limit is reached for the current model.
  const showReferenceLimitToast = useCallback((maxReferenceImages: number) => {
    if (isKlingO1VideoModelId(falModelId)) {
      // Edit variant has 4 total limit, refI2V has 6
      const baseLimit = isKlingO1EditMode ? 4 : getMaxReferenceImages(falModelId);
      const totalLimit = baseLimit + 1;
      const variantLabel = isKlingO1EditMode ? 'Kling O1 Edit' : 'Kling O1 Video';
      setToastMessage(`${variantLabel} supports up to ${totalLimit} images total (source + references + elements). Slots remaining: ${Math.max(0, maxReferenceImages)} for references/elements.`);
      setTimeout(() => setToastMessage(null), 2000);
      return;
    }
    const totalLimit = maxReferenceImages + 1;
    setToastMessage(`${getFalModelLabel(falModelId)} supports up to ${maxReferenceImages} reference images (${totalLimit} total including the primary).`);
    setTimeout(() => setToastMessage(null), 2000);
  }, [falModelId, isKlingO1EditMode, setToastMessage]);

  const isKlingModel = !isVideoMode && falModelId === KLING_IMAGE_MODEL_ID;

  // Tracks which images/notes are selected and enforces model-specific selection rules (reference limits, primary frames).
  const {
    selectedImageIds,
    selectedNoteIds,
    referenceImageIds,
    elementImageIds,
    videoLastFrameImageId,
    sourceVideoId,
    primaryImageId,
    hasSingleImageSelected,
    setSelectedImageIds,
    setSelectedNoteIds,
    setReferenceImageIds,
    setElementImageIds,
    setVideoLastFrameImageId,
    setSourceVideoId,
    handleImageSelection,
    handleNoteSelection,
  } = useSelectionState({
    images,
    apiProvider,
    falModelId,
    falModelMode,
    falVideoModelId,
    klingVariant,
    isKlingProVideoSelection,
    isKlingImageModel: isKlingModel,
    isKlingO1VideoModel,
    isKlingO1EditMode,
    onError: setError,
    onReferenceLimit: showReferenceLimitToast,
  });

  // Handles snapshot import/export so canvases can be saved, loaded, or shared.
  const {
    exportSnapshot: handleExportSnapshot,
    importSnapshotFromFile: handleImportSnapshotFromFile,
    importSnapshotWithPicker,
  } = useSnapshotIO({
    appMode,
    tool,
    brushSize,
    eraserSize,
    brushColor,
    prompt,
    inpaintMode,
    apiProvider,
    falModelId,
    falImageSizeSelection,
    falAspectRatioSelection,
    falResolutionSelection,
    falNumImages,
    falScaleFactor,
    falNoiseScale,
    falCreativity,
    selectedImageIds,
    selectedNoteIds,
    referenceImageIds,
    elementImageIds,
    videoLastFrameImageId,
    displayedImages,
    displayedNotes,
    displayedPaths,
    resetHistory,
    providerAvailability,
    availableProviders: AVAILABLE_PROVIDERS,
    setAppMode,
    setTool,
    setBrushSize,
    setEraserSize,
    setBrushColor,
    setPrompt,
    setInpaintMode,
    setApiProvider,
    setFalModelMode,
    setFalImageModelId,
    setFalVideoModelId,
    setFalImageSizeSelection,
    setFalAspectRatioSelection,
    setFalResolutionSelection,
    setFalNumImages,
    setFalScaleFactor,
    setFalNoiseScale,
    setFalCreativity,
    setSelectedImageIds,
    setSelectedNoteIds,
    setReferenceImageIds,
    setElementImageIds,
    setVideoLastFrameImageId,
    setError,
    setToastMessage,
    setIsFileMenuOpen,
  });

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

  // Enforce reference image limits whenever the active model changes.
  useEffect(() => {
    // Edit variant has 4 total limit, refI2V has 6
    const maxReferenceImages = isKlingO1EditMode ? 4 : getMaxReferenceImages(falModelId);
    setReferenceImageIds(prevIds => {
      if (prevIds.length <= maxReferenceImages) {
        return prevIds;
      }
      showReferenceLimitToast(maxReferenceImages);
      return prevIds.slice(0, maxReferenceImages);
    });
    if (isKlingO1VideoModelId(falModelId)) {
      setElementImageIds(prevIds => {
        if (prevIds.length + referenceImageIds.length <= maxReferenceImages) {
          return prevIds;
        }
        const maxElements = Math.max(0, maxReferenceImages - referenceImageIds.length);
        showReferenceLimitToast(maxElements);
        return prevIds.slice(0, maxElements);
      });
    } else if (elementImageIds.length > 0) {
      setElementImageIds([]);
    }
  }, [elementImageIds.length, falModelId, isKlingO1EditMode, referenceImageIds.length, setElementImageIds, setReferenceImageIds, showReferenceLimitToast]);

  // Clear video last frame selection if not in Kling Pro Video mode
  useEffect(() => {
    if (!isKlingProVideoSelection && videoLastFrameImageId) {
      setVideoLastFrameImageId(null);
    }
  }, [isKlingProVideoSelection, videoLastFrameImageId]);

  // Memoized lookup of the currently selected primary image object
  const primaryImage = useMemo(() => {
    if (!primaryImageId) return null;
    return images.find(img => img.id === primaryImageId) || null;
  }, [images, primaryImageId]);

  // If the primary image is a valid image canvas media, expose it for use
  const activePrimaryImage = useMemo(() => {
    return isImageCanvasMedia(primaryImage) ? primaryImage : null;
  }, [primaryImage]);

  // Subscribes to debug log updates for live debug log panel
  useEffect(() => {
    const unsubscribe = subscribeToDebugLogs(setDebugLogEntries);
    return unsubscribe;
  }, []);

  const handleModelModeChange = useCallback((mode: FalModelMode) => {
    handleFalModelModeChange(mode);
    // Model mode changes can invalidate reference selections, so reset them.
    setReferenceImageIds([]);
  }, [handleFalModelModeChange, setReferenceImageIds]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const snapshotInputRef = useRef<HTMLInputElement>(null);

  const handleClear = useCallback(() => {
    setState(prevState => ({ ...prevState, paths: [] }));
  }, [setState]);

  const handleModeChange = useCallback((newMode: AppMode) => {
    if (newMode === appMode) return;

    setAppMode(newMode);
    // Switching modes discards existing brush/inpaint strokes so tools stay scoped to the active mode.
    handleClear();
    if (newMode === 'CANVAS') {
      setTool(Tool.PAN);
    } else { // ANNOTATE or INPAINT
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

  const openDebugLogPanel = useCallback(() => {
    setIsDebugLogOpen(true);
    setIsFileMenuOpen(false);
  }, []);

  const closeDebugLogPanel = useCallback(() => {
    setIsDebugLogOpen(false);
  }, []);

  const handleImportSnapshot = useCallback(() => {
    importSnapshotWithPicker(() => {
      closeFileMenu();
      snapshotInputRef.current?.click();
    });
  }, [closeFileMenu, importSnapshotWithPicker]);

  const handleDismissFalJob = useCallback((jobId: string) => {
    const timeoutId = falAutoDismissTimeouts.current.get(jobId);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      falAutoDismissTimeouts.current.delete(jobId);
    }

    setFalJobs(prev => prev.filter(job => job.id !== jobId));
  }, [setFalJobs]);

  useEffect(() => {
    const timeoutMap = falAutoDismissTimeouts.current;

    timeoutMap.forEach((timeoutId, jobId) => {
      const job = falJobs.find(j => j.id === jobId);
      if (!job || job.status !== 'COMPLETED') {
        window.clearTimeout(timeoutId);
        timeoutMap.delete(jobId);
      }
    });

    falJobs.forEach(job => {
      if (job.status !== 'COMPLETED') {
        return;
      }

      if (timeoutMap.has(job.id)) {
        return;
      }

      // Auto-dismiss completed FAL jobs after a short delay to keep the queue tidy.
      const timeoutId = window.setTimeout(() => {
        timeoutMap.delete(job.id);
        setFalJobs(prev => prev.filter(j => j.id !== job.id));
      }, 1000);

      timeoutMap.set(job.id, timeoutId);
    });
  }, [falJobs, setFalJobs]);

  useEffect(() => {
    return () => {
      falAutoDismissTimeouts.current.forEach(timeoutId => {
        window.clearTimeout(timeoutId);
      });
      falAutoDismissTimeouts.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!isDebugLogOpen) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDebugLogOpen(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isDebugLogOpen]);

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

  // Centralized generation handler that calls provider APIs and writes results back to canvas state.
  const handleGenerate = useGeneration({
    appMode,
    tool,
    prompt,
    apiProvider,
    falModelMode,
    falImageModelId,
    falVideoModelId,
    falImageSizeSelection,
    falAspectRatioSelection,
    falResolutionSelection,
    falNumImages,
    falScaleFactor,
    falNoiseScale,
    falCreativity,
    falVideoDuration,
    hailuoVariant,
    klingVariant,
    klingO1Variant,
    klingO1KeepAudio,
    klingNegativePrompt,
    kling26AudioSelection,
    images,
    paths,
    inpaintMode,
    referenceImageIds,
    elementImageIds,
    videoLastFrameImageId,
    sourceVideoId,
    primaryImageId,
    activePrimaryImage,
    setError,
    setIsLoading,
    setFalJobs,
    setState,
    setSelectedImageIds,
    setSelectedNoteIds,
    setReferenceImageIds,
    setElementImageIds,
    setVideoLastFrameImageId,
    setSourceVideoId,
    setToastMessage,
    setTool,
    setFalImageSizeSelection,
    setFalAspectRatioSelection,
  });

  useKeyboardShortcuts({
    onGenerate: handleGenerate,
    setTool,
    requestZoomIn,
    requestZoomOut,
    onDelete: handleDelete,
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

  const selectedImageIndex = primaryImageId ? images.findIndex(img => img.id === primaryImageId) : -1;
  const isImageOverlapping = primaryImageId && selectedImageIndex !== -1 ? images.some(other => other.id !== primaryImageId && isOverlapping(images[selectedImageIndex], other)) : false;
  const canMoveUp = selectedImageIndex > -1 && selectedImageIndex < images.length - 1;
  const canMoveDown = selectedImageIndex > -1 && selectedImageIndex > 0;

  const usingFal = apiProvider === 'fal';
  const isSeedreamModel = !isVideoMode && isSeedreamModelId(falModelId);
  const isGeminiModel = !isVideoMode && falModelId === GEMINI_IMAGE_PREVIEW_EDIT_MODEL_ID;
  const isReveModel = !isVideoMode && falModelId === REVE_TEXT_TO_IMAGE_MODEL_ID;
  const hasInpaintMask = paths.some(path => path.tool === Tool.INPAINT && path.points.length > 0);

  const {
    referenceOrderLabels: klingReferenceOrderLabels,
    elementOrderLabels: klingElementOrderLabels,
  } = useKlingReferenceHelpers({
    labelReferences: isKlingModel || isKlingO1VideoModel,
    primaryImageId,
    referenceImageIds,
    labelElements: isKlingO1VideoModel,
    elementImageIds,
    isEditMode: isKlingO1EditMode,
    sourceVideoId,
  });

  const primarySelectionMediaType = primaryImage?.mediaType ?? null;
  const hasSourceVideoSelected = Boolean(sourceVideoId);

  // Build prompt mention suggestions for Kling based on current reference/element selections.
  const { klingPromptMentions, klingReferenceCount } = useKlingPromptMentions({
    isKlingModel,
    isKlingO1VideoModel,
    isKlingO1EditMode,
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
    isKlingO1EditMode,
    hasSourceVideo: hasSourceVideoSelected,
    isVideoMode,
    isUpscaleModel,
    isSeedreamModel,
    isGeminiModel,
    isReveModel,
    isKlingModel,
    isKlingVideoModel,
    isKling26VideoModel,
    isHailuoVideoModel,
    falModelId,
    falNumImages,
    hasInpaintMask,
    activePrimaryImage,
  });

  // Derive UI controls for the prompt bar based on provider, model, and mode selections.
  const promptBarModelControls = buildPromptBarModelControls({
    apiProvider,
    falModelId,
    falModelMode,
    isVideoMode,
    usingFal,
    isSeedreamModel,
    isGeminiModel,
    isReveModel,
    isKlingModel,
    isUpscaleModel,
    isKlingVideoModel,
    isKlingO1VideoModel,
    isKling26VideoModel,
    isHailuoVideoModel,
    hailuoVariant,
    falVideoDuration,
    klingVariant,
    klingO1Variant,
    klingO1KeepAudio,
    kling26AudioSelection,
    falScaleFactor,
    falCreativity,
    falNoiseScale,
    falImageSizeSelection,
    falAspectRatioSelection,
    falResolutionSelection,
    falNumImages,
    isLoading,
    onHailuoVariantChange: handleHailuoVariantChange,
    onFalVideoDurationChange: handleFalVideoDurationChange,
    onKlingVariantChange: handleKlingVariantChange,
    onKlingO1VariantChange: handleKlingO1VariantChange,
    onKlingO1KeepAudioChange: handleKlingO1KeepAudioChange,
    onKling26AudioChange: handleKling26AudioChange,
    onFalScaleFactorChange: handleFalScaleFactorChange,
    onFalCreativityChange: handleFalCreativityChange,
    onFalNoiseScaleChange: handleFalNoiseScaleChange,
    onFalImageSizeChange: handleFalImageSizeChange,
    onFalAspectRatioChange: handleFalAspectRatioChange,
    onFalResolutionChange: handleFalResolutionChange,
    onFalNumImagesChange: handleFalNumImagesChange,
    shouldValidateFalOptions,
    isNumImagesInvalid,
  });
  const promptBarModelOptions = getPromptBarModelOptions(falModelMode);
  const shouldShowKlingNegativePrompt = isKlingVideoModel || isKling26VideoModel;
  const promptOutlineColor = shouldShowKlingNegativePrompt ? '#34d399' : undefined;
  const negativePromptOutlineColor = shouldShowKlingNegativePrompt ? '#f87171' : undefined;


  // TSX (React with Tailwind CSS utility classes)
  return (
    <div className="h-screen w-screen bg-gray-800 text-white flex flex-col overflow-hidden">
      {/* Hidden file input for image/video uploads */}
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,video/*" className="hidden" />
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
          inpaintMode={inpaintMode}
          onInpaintModeChange={setInpaintMode}
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
        />
      )}

      {/* Main drawing area */}
      <main className="relative flex-1 min-h-0">
        <Canvas
          images={displayedImages}
          onImagesChange={setLiveImages}
          notes={displayedNotes}
          onNotesChange={setLiveNotes}
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
          tailSelectionEnabled={isKlingProVideoSelection}
          isKlingO1EditMode={isKlingO1EditMode}
          onError={setError}
          onImageSelect={handleImageSelection}
          onNoteSelect={handleNoteSelection}
          onCommit={handleCommit}
          onFilesDrop={handleFilesDrop}
          zoomToFitTrigger={zoomToFitTrigger}
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
        />
      </main>

      {/* Error/status banners */}
      {error && (
        <StatusBanner message={error} variant="error" onClose={() => setError(null)} />
      )}
      {toastMessage && (
        <StatusBanner message={toastMessage} variant="success" />
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
      <FalQueuePanel jobs={falJobs} onDismiss={handleDismissFalJob} />

      {/* Debug log panel */}
      {isDebugLogOpen && (
        <DebugLogPanel
          entries={debugLogEntries}
          onClose={closeDebugLogPanel}
          onClear={clearDebugLogs}
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
          selectedModel={falModelId}
          onModelChange={handleFalModelChange}
          modelSelectDisabled={apiProvider !== 'fal' || isLoading}
          modelMode={falModelMode}
          onModelModeChange={handleModelModeChange}
          modelModeDisabled={apiProvider !== 'fal' || isLoading}
          modelControls={promptBarModelControls}
          promptPlaceholder={
            isKlingModel || isKlingO1VideoModel
              ? 'Describe your generation, use @ to reference images and elements(objects and characters)... (Cmd/Ctrl + Enter to generate)'
              : promptPlaceholderText
          }
          showNegativePrompt={shouldShowKlingNegativePrompt}
          negativePrompt={klingNegativePrompt}
          onNegativePromptChange={setKlingNegativePrompt}
          negativePromptPlaceholder="Describe what the video should avoid... (optional)"
          promptOutlineColor={promptOutlineColor}
          negativePromptOutlineColor={negativePromptOutlineColor}
          klingSuggestionsEnabled={isKlingModel || isKlingO1VideoModel}
          klingReferenceCount={klingReferenceCount}
          klingSuggestionOptions={klingPromptMentions}
        />
      )}
    </div>
  );
}
