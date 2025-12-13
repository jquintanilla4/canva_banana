import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Toolbar } from './components/Toolbar';
import { PromptBar } from './components/PromptBar';
import { Canvas } from './components/Canvas';
import { RecordingOverlay } from './components/RecordingOverlay';
import {
  Tool,
  InpaintMode,
  AppMode,
  ApiProviderId,
} from './types';
import { FalQueuePanel } from './components/FalQueuePanel';
import { DebugLogPanel } from './components/DebugLogPanel';
import { clearDebugLogs } from './services/debugLog';
import {
  GEMINI_IMAGE_PREVIEW_EDIT_MODEL_ID,
  KLING_IMAGE_MODEL_ID,
  ONE_TO_ALL_ANIMATE_MODEL_ID,
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
import { useAudioRecording } from './hooks/useAudioRecording';
import { generateWaveformImage, loadAudioFromBlob } from './services/audioService';
import { useGenerationGuards } from './hooks/useGenerationGuards';
import { useImageResize } from './hooks/useImageResize';
import { useDuplicateCanvasMedia } from './hooks/useDuplicateCanvasMedia';
import { useKlingReferenceHelpers } from './hooks/useKlingReferenceHelpers';
import { useKlingPromptMentions } from './hooks/useKlingPromptMentions';
import { useVideoNegativePrompt } from './hooks/useVideoNegativePrompt';
import { useFalQueueJobs } from './hooks/useFalQueueJobs';
import { useDebugLogState } from './hooks/useDebugLogState';
import type { FalModelMode } from './services/modelConfig';

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

  // Toggles display of metadata overlays on canvas images
  const [showMetadataOverlay, setShowMetadataOverlay] = useState(false);

  // State for toggling the file menu and debug log panels
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const {
    isDebugLogOpen,
    debugLogEntries,
    openDebugLogPanel,
    closeDebugLogPanel,
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
    const totalLimit = maxReferenceImages + 1;
    setToastMessage(`${getFalModelLabel(fal.falModelId)} supports up to ${maxReferenceImages} reference images (${totalLimit} total including the primary).`);
    setTimeout(() => setToastMessage(null), 2000);
  }, [fal.falModelId, fal.isKlingO1EditMode, fal.isKlingO1RefV2VMode, isKlingO1VideoInputMode, setToastMessage]);

  const isKlingModel = !fal.isVideoMode && fal.falModelId === KLING_IMAGE_MODEL_ID;
  const isKlingO1FflfMode = fal.isKlingO1VideoModel && fal.klingO1Variant === 'fflf';

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
    handleImageSelection,
    handleNoteSelection,
  } = selection;

  // Handles snapshot import/export so canvases can be saved, loaded, or shared.
  const {
    exportSnapshot: handleExportSnapshot,
    importSnapshotFromFile: handleImportSnapshotFromFile,
    importSnapshotWithPicker,
  } = useSnapshotIO({
    ui: {
      appMode,
      tool,
      brushSize,
      eraserSize,
      brushColor,
      prompt,
      inpaintMode,
      apiProvider,
      setAppMode,
      setTool,
      setBrushSize,
      setEraserSize,
      setBrushColor,
      setPrompt,
      setInpaintMode,
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

  // Handle audio recording toggle
  const handleRecordToggle = useCallback(async () => {
    if (isRecording) {
      const audioBlob = await stopRecording();
      if (audioBlob) {
        try {
          // Generate waveform from the recording
          const displayWidth = 400;
          const displayHeight = 80;
          const audioElement = await loadAudioFromBlob(audioBlob);
          const { dataUrl: waveformImageData, duration } = await generateWaveformImage(
            audioBlob,
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
          const file = new File([audioBlob], `recording-${Date.now()}.webm`, { type: audioBlob.type });

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

  // Centralized generation handler that calls provider APIs and writes results back to canvas state.
  const handleGenerate = useGeneration({
    appMode,
    tool,
    prompt,
    inpaintMode,
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
  });

  useKeyboardShortcuts({
    onGenerate: handleGenerate,
    setTool,
    requestZoomIn,
    requestZoomOut,
    onDelete: handleDelete,
    onRecordToggle: handleRecordToggle,
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
  const isSeedreamModel = !fal.isVideoMode && isSeedreamModelId(fal.falModelId);
  const isGeminiModel = !fal.isVideoMode && fal.falModelId === GEMINI_IMAGE_PREVIEW_EDIT_MODEL_ID;
  const isReveModel = !fal.isVideoMode && fal.falModelId === REVE_TEXT_TO_IMAGE_MODEL_ID;
  const hasInpaintMask = paths.some(path => path.tool === Tool.INPAINT && path.points.length > 0);
  const isAnnotateModeDisabled = (fal.isVideoMode && !fal.isHailuoVideoModel) || isReveModel || fal.isUpscaleModel;
  const isInpaintModeDisabled = fal.isVideoMode || isReveModel || fal.isUpscaleModel;

  useEffect(() => {
    if (appMode === 'INPAINT' && isInpaintModeDisabled) {
      const fallbackMode: AppMode = isAnnotateModeDisabled ? 'CANVAS' : 'ANNOTATE';
      handleModeChange(fallbackMode);
      return;
    }
    if (appMode === 'ANNOTATE' && isAnnotateModeDisabled) {
      handleModeChange('CANVAS');
    }
  }, [appMode, handleModeChange, isAnnotateModeDisabled, isInpaintModeDisabled]);

  const {
    referenceOrderLabels: klingReferenceOrderLabels,
    elementOrderLabels: klingElementOrderLabels,
  } = useKlingReferenceHelpers({
    labelReferences: isKlingModel || fal.isKlingO1VideoModel,
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

  // Build prompt mention suggestions for Kling based on current reference/element selections.
  const { klingPromptMentions, klingReferenceCount } = useKlingPromptMentions({
    isKlingModel,
    isKlingO1VideoModel: fal.isKlingO1VideoModel,
    isKlingO1EditMode: fal.isKlingO1EditMode,
    isKlingO1RefV2VMode: fal.isKlingO1RefV2VMode,
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
    isVideoMode: fal.isVideoMode,
    isUpscaleModel: fal.isUpscaleModel,
    isSeedreamModel,
    isGeminiModel,
    isReveModel,
	    isKlingModel,
		    isKlingVideoModel: fal.isKlingVideoModel,
		    isKling26VideoModel: fal.isKling26VideoModel,
		    isHailuoVideoModel: fal.isHailuoVideoModel,
		    falModelId: fal.falModelId,
	    falNumImages: fal.falNumImages,
	    hasInpaintMask,
    activePrimaryImage,
  });

  // Derive UI controls for the prompt bar based on provider, model, and mode selections.
  const promptBarModelControls = buildPromptBarModelControls({
    apiProvider,
    falModelId: fal.falModelId,
    falModelMode: fal.falModelMode,
    isVideoMode: fal.isVideoMode,
    usingFal,
    isSeedreamModel,
    isGeminiModel,
    isReveModel,
    isKlingModel,
    isUpscaleModel: fal.isUpscaleModel,
	    isKlingVideoModel: fal.isKlingVideoModel,
	    isKlingO1VideoModel: fal.isKlingO1VideoModel,
		    isKling26VideoModel: fal.isKling26VideoModel,
		    isHailuoVideoModel: fal.isHailuoVideoModel,
		    isWanAnimateVideoModel: fal.isWanAnimateVideoModel,
		    hailuoVariant: fal.hailuoVariant,
		    falVideoDuration: fal.falVideoDuration,
		    klingVariant: fal.klingVariant,
	    klingO1Variant: fal.klingO1Variant,
	    klingO1KeepAudio: fal.klingO1KeepAudio,
	    kling26AudioSelection: fal.kling26AudioSelection,
	    wanTargetResolution: fal.wanTargetResolution,
	    wanCreativity: fal.wanCreativity,
	    wanAnimateVariant: fal.wanAnimateVariant,
	    wanAnimateSteps: fal.wanAnimateSteps,
	    wanAnimateResolution: fal.wanAnimateResolution,
        oneToAllAnimateResolution: fal.oneToAllAnimateResolution,
	    wanAnimateShift: fal.wanAnimateShift,
	    wanAnimateQuality: fal.wanAnimateQuality,
	    wanAnimateUseTurbo: fal.wanAnimateUseTurbo,
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
	    onWanTargetResolutionChange: fal.handleWanTargetResolutionChange,
	    onWanCreativityChange: fal.handleWanCreativityChange,
	    onWanAnimateVariantChange: fal.handleWanAnimateVariantChange,
	    onWanAnimateStepsChange: fal.handleWanAnimateStepsChange,
	    onWanAnimateResolutionChange: fal.handleWanAnimateResolutionChange,
        onOneToAllAnimateResolutionChange: fal.handleOneToAllAnimateResolutionChange,
	    onWanAnimateShiftChange: fal.handleWanAnimateShiftChange,
	    onWanAnimateQualityChange: fal.handleWanAnimateQualityChange,
	    onWanAnimateTurboChange: fal.handleWanAnimateTurboChange,
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
  const promptBarModelOptions = getPromptBarModelOptions(fal.falModelMode);
  const promptOutlineColor = shouldShowVideoNegativePrompt ? '#34d399' : undefined;
  const negativePromptOutlineColor = shouldShowVideoNegativePrompt ? '#f87171' : undefined;


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
          isAnnotateModeDisabled={isAnnotateModeDisabled}
          isInpaintModeDisabled={isInpaintModeDisabled}
          isRecording={isRecording}
          onRecordToggle={handleRecordToggle}
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
          tailSelectionEnabled={fal.isKlingProVideoSelection || isKlingO1FflfMode}
          isKlingO1VideoInputMode={isKlingO1VideoInputMode}
          isKlingO1FflfMode={isKlingO1FflfMode}
          isWanAnimateVideoInputMode={fal.isWanAnimateVideoModel || fal.isOneToAllAnimateVideoModel}
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
          selectedModel={fal.falModelId}
          onModelChange={fal.handleFalModelChange}
          modelSelectDisabled={apiProvider !== 'fal' || isLoading}
          modelMode={fal.falModelMode}
          onModelModeChange={handleModelModeChange}
          modelModeDisabled={apiProvider !== 'fal' || isLoading}
          modelControls={promptBarModelControls}
          promptPlaceholder={
            isKlingModel || fal.isKlingO1VideoModel
              ? 'Describe your generation, use @ to reference images and elements(objects and characters)... (Cmd/Ctrl + Enter to generate)'
              : promptPlaceholderText
          }
          showNegativePrompt={shouldShowVideoNegativePrompt}
          negativePrompt={videoNegativePrompt}
          onNegativePromptChange={setVideoNegativePrompt}
          negativePromptPlaceholder="Describe what the video should avoid... (optional)"
          promptOutlineColor={promptOutlineColor}
          negativePromptOutlineColor={negativePromptOutlineColor}
          klingSuggestionsEnabled={isKlingModel || fal.isKlingO1VideoModel}
          klingReferenceCount={klingReferenceCount}
          klingSuggestionOptions={klingPromptMentions}
        />
      )}
    </div>
  );
}
