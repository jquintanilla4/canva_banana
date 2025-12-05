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
import { useGeneration } from './hooks/useGeneration';
import { useCanvasHistory } from './hooks/useCanvasHistory';
import { useSelectionState } from './hooks/useSelectionState';
import { useFalSettings } from './hooks/useFalSettings';
import { useSnapshotIO } from './hooks/useSnapshotIO';
import { useCanvasMediaActions } from './hooks/useCanvasMediaActions';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useGenerationGuards } from './hooks/useGenerationGuards';
import type { FalModelMode } from './services/modelConfig';

const isImageCanvasMedia = (img: CanvasImage | null | undefined): img is CanvasImage & { element: HTMLImageElement } =>
  !!img && img.mediaType === 'image';

type ApiProvider = ApiProviderId;

const PROVIDER_ORDER: ReadonlyArray<ApiProviderId> = ['google', 'fal'];

const hasEnvValue = (value: string | undefined): boolean => typeof value === 'string' && value.trim().length > 0;

// Detect which API providers are usable based on available API keys in env.
const providerAvailability: Record<ApiProvider, boolean> = {
  google: hasEnvValue(process.env.GEMINI_API_KEY ?? process.env.API_KEY),
  fal: hasEnvValue(process.env.FAL_API_KEY),
};

const AVAILABLE_PROVIDERS = PROVIDER_ORDER.filter(provider => providerAvailability[provider]) as ApiProvider[];
const PROVIDER_LABELS: Record<ApiProvider, string> = {
  google: 'Google',
  fal: 'FAL',
};
const DEFAULT_API_PROVIDER: ApiProvider = AVAILABLE_PROVIDERS[0] ?? 'google';

export default function App() {
  // Root component wires up canvas state, generation controls, and provider-specific settings.
  const [appMode, setAppMode] = useState<AppMode>('CANVAS');
  const [tool, setTool] = useState<Tool>(Tool.PAN);
  const [brushSize, setBrushSize] = useState(20);
  const [eraserSize, setEraserSize] = useState(20);
  const [brushColor, setBrushColor] = useState('#ff0000');
  const [prompt, setPrompt] = useState('');
  const [inpaintMode, setInpaintMode] = useState<InpaintMode>('STRICT');

  const {
    images,
    paths,
    notes,
    displayedImages,
    displayedPaths,
    displayedNotes,
    setState,
    setLiveImages,
    setLivePaths,
    setLiveNotes,
    commit: handleCommit,
    undo,
    redo,
    canUndo,
    canRedo,
    resetHistory,
  } = useCanvasHistory({ images: [], paths: [], notes: [] });
  // Brush/inpaint layers (paths) are the only things we clear with the eraser button.
  const hasClearablePaths = displayedPaths.some(
    path =>
      (path.tool === Tool.ANNOTATE || path.tool === Tool.INPAINT) &&
      path.points.length > 0
  );

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomToFitTrigger, setZoomToFitTrigger] = useState(0);
  const [zoomInTrigger, setZoomInTrigger] = useState(0);
  const [zoomOutTrigger, setZoomOutTrigger] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [apiProvider, setApiProvider] = useState<ApiProvider>(DEFAULT_API_PROVIDER);
  const [falJobs, setFalJobs] = useState<FalQueueJob[]>([]);
  const falAutoDismissTimeouts = useRef<Map<string, number>>(new Map());
  const {
    falModelMode,
    falModelId,
    falImageModelId,
    falVideoModelId,
    falVideoDuration,
    hailuoVariant,
    klingVariant,
    kling26AudioSelection,
    falImageSizeSelection,
    falAspectRatioSelection,
    falResolutionSelection,
    falNumImages,
    falScaleFactor,
    falNoiseScale,
    falCreativity,
    isVideoMode,
    isKlingVideoModel,
    isKling26VideoModel,
    isHailuoVideoModel,
    isUpscaleModel,
    isKlingProVideoSelection,
    handleModelModeChange: handleFalModelModeChange,
    handleFalModelChange,
    handleFalVideoDurationChange,
    handleHailuoVariantChange,
    handleKlingVariantChange,
    handleKling26AudioChange,
    handleFalImageSizeChange,
    handleFalAspectRatioChange,
    handleFalResolutionChange,
    handleFalNumImagesChange,
    handleFalScaleFactorChange,
    handleFalNoiseScaleChange,
    handleFalCreativityChange,
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
  } = useFalSettings({ apiProvider });
  const [klingNegativePrompt, setKlingNegativePrompt] = useState<string>(KLING_DEFAULT_NEGATIVE_PROMPT);
  const [showMetadataOverlay, setShowMetadataOverlay] = useState(false);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [isDebugLogOpen, setIsDebugLogOpen] = useState(false);
  const [debugLogEntries, setDebugLogEntries] = useState(() => getDebugLogs());
  const requestZoomIn = useCallback(() => {
    setZoomInTrigger(prev => prev + 1);
  }, []);
  const requestZoomOut = useCallback(() => {
    setZoomOutTrigger(prev => prev + 1);
  }, []);

  const showReferenceLimitToast = useCallback((maxReferenceImages: number) => {
    const totalLimit = maxReferenceImages + 1;
    setToastMessage(`${getFalModelLabel(falModelId)} supports up to ${maxReferenceImages} reference images (${totalLimit} total including the primary).`);
    setTimeout(() => setToastMessage(null), 2000);
  }, [falModelId, setToastMessage]);

  // Tracks which images/notes are selected and enforces model-specific selection rules (reference limits, primary frames).
  const {
    selectedImageIds,
    selectedNoteIds,
    referenceImageIds,
    videoLastFrameImageId,
    primaryImageId,
    hasSingleImageSelected,
    setSelectedImageIds,
    setSelectedNoteIds,
    setReferenceImageIds,
    setVideoLastFrameImageId,
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

  useEffect(() => {
    // Enforce reference image limits whenever the active model changes.
    const maxReferenceImages = getMaxReferenceImages(falModelId);
    setReferenceImageIds(prevIds => {
      if (prevIds.length <= maxReferenceImages) {
        return prevIds;
      }
      showReferenceLimitToast(maxReferenceImages);
      return prevIds.slice(0, maxReferenceImages);
    });
  }, [falModelId, showReferenceLimitToast]);

  useEffect(() => {
    if (!isKlingProVideoSelection && videoLastFrameImageId) {
      setVideoLastFrameImageId(null);
    }
  }, [isKlingProVideoSelection, videoLastFrameImageId]);

  const primaryImage = useMemo(() => {
    if (!primaryImageId) return null;
    return images.find(img => img.id === primaryImageId) || null;
  }, [images, primaryImageId]);

  const activePrimaryImage = useMemo(() => {
    return isImageCanvasMedia(primaryImage) ? primaryImage : null;
  }, [primaryImage]);

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
    klingNegativePrompt,
    kling26AudioSelection,
    images,
    paths,
    inpaintMode,
    referenceImageIds,
    videoLastFrameImageId,
    primaryImageId,
    activePrimaryImage,
    setError,
    setIsLoading,
    setFalJobs,
    setState,
    setSelectedImageIds,
    setSelectedNoteIds,
    setReferenceImageIds,
    setVideoLastFrameImageId,
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
  const isKlingModel = !isVideoMode && falModelId === KLING_IMAGE_MODEL_ID;
  const hasInpaintMask = paths.some(path => path.tool === Tool.INPAINT && path.points.length > 0);

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
    isKling26VideoModel,
    isHailuoVideoModel,
    hailuoVariant,
    falVideoDuration,
    klingVariant,
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
      {/* Hidden file input for image uploads */}
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
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
          videoLastFrameImageId={videoLastFrameImageId}
          tailSelectionEnabled={isKlingProVideoSelection}
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
          onImagePromptCopy={handleImagePromptCopy}
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
          promptPlaceholder={promptPlaceholderText}
          showNegativePrompt={shouldShowKlingNegativePrompt}
          negativePrompt={klingNegativePrompt}
          onNegativePromptChange={setKlingNegativePrompt}
          negativePromptPlaceholder="Describe what the video should avoid... (optional)"
          promptOutlineColor={promptOutlineColor}
          negativePromptOutlineColor={negativePromptOutlineColor}
        />
      )}
    </div>
  );
}
