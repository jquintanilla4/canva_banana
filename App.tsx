import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Toolbar } from './components/Toolbar';
import { PromptBar } from './components/PromptBar';
import { Canvas } from './components/Canvas';
import {
  Tool,
  Path,
  CanvasImage,
  InpaintMode,
  Point,
  CanvasNote,
  AppMode,
  CanvasMediaType,
  FalVideoDuration,
  ApiProviderId,
} from './types';
import { generateImageEdit as generateGoogleImageEdit, generateImage as generateGoogleImage } from './services/geminiService';
import {
  generateImageEdit as generateFalImageEdit,
  generateImage as generateFalImage,
  generateImageToVideo as generateFalImageToVideo,
  removeBackground as removeFalBackground,
  upscaleCrystalImage as upscaleFalCrystalImage,
  upscaleSeedvrImage as upscaleFalSeedvrImage,
  type FalQueueUpdate,
} from './services/falService';
import { FalQueuePanel } from './components/FalQueuePanel';
import { DebugLogPanel } from './components/DebugLogPanel';
import { addDebugLog, clearDebugLogs, getDebugLogs, subscribeToDebugLogs } from './services/debugLog';
import { buildFalDisplayError, FAL_PROVIDER_DOWN_MESSAGE, formatFalLogMessage } from './services/falConstants';
import type { FalQueueJob } from './types';
import {
  CRYSTAL_UPSCALER_MODEL_ID,
  DEFAULT_FAL_IMAGE_MODEL_ID,
  DEFAULT_FAL_VIDEO_MODEL_ID,
  FAL_GEMINI_ASPECT_RATIO_OPTIONS,
  FAL_KLING_ASPECT_RATIO_OPTIONS,
  FAL_REVE_ASPECT_RATIO_OPTIONS,
  GEMINI_IMAGE_PREVIEW_EDIT_MODEL_ID,
  GEMINI_IMAGE_PREVIEW_TEXT_TO_IMAGE_MODEL_ID,
  HAILUO_IMAGE_TO_VIDEO_MODEL_ID,
  KLING_26_VIDEO_MODEL_ID,
  KLING_DEFAULT_NEGATIVE_PROMPT,
  KLING_IMAGE_MODEL_ID,
  KLING_VIDEO_MODEL_ID,
  REVE_TEXT_TO_IMAGE_MODEL_ID,
  SEEDVR_UPSCALER_MODEL_ID,
  SEEDREAM_MODEL_ID,
  SEEDREAM_TEXT_TO_IMAGE_MODEL_ID,
  SEEDREAM_V45_MODEL_ID,
  SEEDREAM_V45_TEXT_TO_IMAGE_MODEL_ID,
  getFalModelLabel,
  getHailuoActualModelId,
  getKlingActualModelId,
  getMaxReferenceImages,
  getSeedreamTextToImageModelId,
  isApiProvider,
  isFalAspectRatioSelectionValue,
  isFalImageModelId,
  isFalResolutionSelectionValue,
  isFalVideoModelId,
  isFalImageSizeSelectionValue,
  isSeedreamModelId,
  normalizeFalModelId,
} from './services/modelConfig';
import type {
  FalAspectRatioSelectionValue,
  FalImageModelId,
  FalImageSizeSelectionValue,
  FalModelId,
  FalModelMode,
  FalResolutionSelectionValue,
  FalVideoModelId,
  HailuoVariant,
  Kling26AudioSelectionValue,
  KlingVariant,
  SeedreamModelId,
} from './services/modelConfig';
import { getNaturalSize, loadMediaFromBlob, rasterizeImages } from './services/mediaService';
import {
  snapshotBinaryToBlob,
  writeSnapshotBinary,
  type SnapshotBinary,
  type SnapshotMetaState,
  buildSnapshotBinaryFromState,
  restoreSnapshotFromFile,
} from './services/snapshotService';
import {
  buildPromptBarModelControls,
  getPromptBarModelOptions,
  type PromptBarModelControl,
} from './services/promptBarConfig';
import {
  applyFalQueueUpdateToJob,
} from './services/falQueueUtils';
import { getImageBounds, getImageRotation, isOverlapping } from './utils/canvasGeometry';
import { FileMenu } from './components/FileMenu';
import { ViewToolbar } from './components/ViewToolbar';
import { ProviderSwitcher } from './components/ProviderSwitcher';
import { StatusBanner } from './components/StatusBanner';
import { useGeneration } from './hooks/useGeneration';

const MIN_STROKE_SIZE = 1;
const MAX_STROKE_SIZE = 100;
const clampStrokeSize = (value: number) =>
  Math.min(MAX_STROKE_SIZE, Math.max(MIN_STROKE_SIZE, value));

const isImageCanvasMedia = (img: CanvasImage | null | undefined): img is CanvasImage & { element: HTMLImageElement } =>
  !!img && img.mediaType === 'image';
const isVideoCanvasMedia = (img: CanvasImage | null | undefined): img is CanvasImage & { element: HTMLVideoElement } =>
  !!img && img.mediaType === 'video';

type ApiProvider = ApiProviderId;

const PROVIDER_ORDER: ReadonlyArray<ApiProviderId> = ['google', 'fal'];

const hasEnvValue = (value: string | undefined): boolean => typeof value === 'string' && value.trim().length > 0;

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

const MAX_HISTORY_SIZE = 30;

type SerializedCanvasImageV1 = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  fileName: string;
  fileType: string;
  dataUrl: string;
  metadata?: CanvasImage['metadata'];
  mediaType?: CanvasMediaType;
  isPlaying?: boolean;
  hasAudio?: boolean;
};

type SerializedSnapshotV1 = {
  version: 1;
  createdAt: string;
  state: {
    images: SerializedCanvasImageV1[];
    notes: CanvasNote[];
    paths: Path[];
    meta?: {
      appMode: AppMode;
      tool: Tool;
      brushSize: number;
      eraserSize: number;
      brushColor: string;
      prompt: string;
      inpaintMode: InpaintMode;
      apiProvider: ApiProvider;
      falModelId: FalModelId;
      falImageSizeSelection: FalImageSizeSelectionValue;
      falAspectRatioSelection: FalAspectRatioSelectionValue;
      falResolutionSelection: FalResolutionSelectionValue;
      falNumImages: number;
      falScaleFactor: number;
      falNoiseScale: number;
      falCreativity: number;
      selectedImageIds: string[];
      selectedNoteIds: string[];
      referenceImageIds: string[];
      videoLastFrameImageId?: string | null;
    };
  };
};

type AppState = { images: CanvasImage[], paths: Path[], notes: CanvasNote[] };
type CropModeState = { imageId: string; rect: { x: number; y: number; width: number; height: number; }; };
type TransformModeState = { imageId: string; };

const getStateSignature = (state: AppState): string => {
  const imageSignature = state.images
    .map(img => `${img.id},${img.x.toFixed(2)},${img.y.toFixed(2)},${img.width},${img.height},${(img.rotation ?? 0).toFixed(3)}`)
    .join(';');
  const pathSignature = state.paths.map(p => `${p.points.length},${p.tool}`).join(',');
  const noteSignature = state.notes.map(n => `${n.id},${n.x.toFixed(2)},${n.y.toFixed(2)},${n.width.toFixed(0)},${n.height.toFixed(0)},${n.text.length}`).join(';');
  return `${imageSignature}|${pathSignature}|${noteSignature}`;
};

export default function App() {
  const [appMode, setAppMode] = useState<AppMode>('CANVAS');
  const [tool, setTool] = useState<Tool>(Tool.PAN);
  const [brushSize, setBrushSize] = useState(20);
  const [eraserSize, setEraserSize] = useState(20);
  const [brushColor, setBrushColor] = useState('#ff0000');
  const [prompt, setPrompt] = useState('');
  const [inpaintMode, setInpaintMode] = useState<InpaintMode>('STRICT');

  const adjustBrushSize = useCallback(
    (delta: number) => {
      setBrushSize(prev => clampStrokeSize(prev + delta));
    },
    [setBrushSize],
  );

  const adjustEraserSize = useCallback(
    (delta: number) => {
      setEraserSize(prev => clampStrokeSize(prev + delta));
    },
    [setEraserSize],
  );

  const [historyState, setHistoryState] = useState<{
    history: AppState[],
    index: number,
  }>({
    history: [{ images: [], paths: [], notes: [] }],
    index: 0,
  });

  const { history, index: historyIndex } = historyState;
  const { images, paths, notes } = history[historyIndex];

  const [liveImages, setLiveImages] = useState<CanvasImage[] | null>(null);
  const [livePaths, setLivePaths] = useState<Path[] | null>(null);
  const [liveNotes, setLiveNotes] = useState<CanvasNote[] | null>(null);

  const displayedImages = liveImages ?? images;
  const displayedPaths = livePaths ?? paths;
  const displayedNotes = liveNotes ?? notes;
  const hasClearablePaths = displayedPaths.some(
    path =>
      (path.tool === Tool.ANNOTATE || path.tool === Tool.INPAINT) &&
      path.points.length > 0
  );

  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const primaryImageId = selectedImageIds[0] ?? null;
  const primaryNoteId = selectedNoteIds[0] ?? null;
  const hasSingleImageSelected = selectedImageIds.length === 1;
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [referenceImageIds, setReferenceImageIds] = useState<string[]>([]);
  const [videoLastFrameImageId, setVideoLastFrameImageId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRemovingBackground, setIsRemovingBackground] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomToFitTrigger, setZoomToFitTrigger] = useState(0);
  const [zoomInTrigger, setZoomInTrigger] = useState(0);
  const [zoomOutTrigger, setZoomOutTrigger] = useState(0);
  const [cropMode, setCropMode] = useState<CropModeState | null>(null);
  const [transformMode, setTransformMode] = useState<TransformModeState | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [apiProvider, setApiProvider] = useState<ApiProvider>(DEFAULT_API_PROVIDER);
  const [falJobs, setFalJobs] = useState<FalQueueJob[]>([]);
  const falAutoDismissTimeouts = useRef<Map<string, number>>(new Map());
  const [falModelMode, setFalModelMode] = useState<FalModelMode>('image');
  const [falImageModelId, setFalImageModelId] = useState<FalImageModelId>(DEFAULT_FAL_IMAGE_MODEL_ID);
  const [falVideoModelId, setFalVideoModelId] = useState<FalVideoModelId>(DEFAULT_FAL_VIDEO_MODEL_ID);
  const [falVideoDuration, setFalVideoDuration] = useState<FalVideoDuration>('6');
  const [hailuoVariant, setHailuoVariant] = useState<HailuoVariant>('standard');
  const [klingVariant, setKlingVariant] = useState<KlingVariant>('standard');
  const [klingNegativePrompt, setKlingNegativePrompt] = useState<string>(KLING_DEFAULT_NEGATIVE_PROMPT);
  const [kling26AudioSelection, setKling26AudioSelection] = useState<Kling26AudioSelectionValue>('placeholder');
  const [falImageSizeSelection, setFalImageSizeSelection] = useState<FalImageSizeSelectionValue>('placeholder');
  const [falAspectRatioSelection, setFalAspectRatioSelection] = useState<FalAspectRatioSelectionValue>('placeholder');
  const [falResolutionSelection, setFalResolutionSelection] = useState<FalResolutionSelectionValue>('1K');
  const [falNumImages, setFalNumImages] = useState(1);
  const [falScaleFactor, setFalScaleFactor] = useState(2);
  const [falNoiseScale, setFalNoiseScale] = useState(0.1);
  const [falCreativity, setFalCreativity] = useState(0);
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

  const falModelId: FalModelId = falModelMode === 'video' ? falVideoModelId : falImageModelId;
  const isKlingProVideoSelection =
    apiProvider === 'fal' &&
    falModelMode === 'video' &&
    falVideoModelId === KLING_VIDEO_MODEL_ID &&
    klingVariant === 'pro';

  const showReferenceLimitToast = useCallback((maxReferenceImages: number) => {
    const totalLimit = maxReferenceImages + 1;
    setToastMessage(`${getFalModelLabel(falModelId)} supports up to ${maxReferenceImages} reference images (${totalLimit} total including the primary).`);
    setTimeout(() => setToastMessage(null), 2000);
  }, [falModelId, setToastMessage]);

  useEffect(() => {
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
    if (apiProvider !== 'fal' && falModelMode !== 'image') {
      setFalModelMode('image');
    }
  }, [apiProvider, falModelMode]);

  useEffect(() => {
    if (falModelId === KLING_IMAGE_MODEL_ID && falResolutionSelection === '4K') {
      setFalResolutionSelection('2K');
    }
  }, [falModelId, falResolutionSelection]);

  useEffect(() => {
    if (falVideoModelId === HAILUO_IMAGE_TO_VIDEO_MODEL_ID) {
      setFalVideoDuration(prev => (prev === '10' ? '10' : '6'));
      return;
    }
    if (falVideoModelId === KLING_VIDEO_MODEL_ID || falVideoModelId === KLING_26_VIDEO_MODEL_ID) {
      setFalVideoDuration(prev => (prev === '10' ? '10' : '5'));
    }
  }, [falVideoModelId]);

  useEffect(() => {
    if (falVideoModelId === HAILUO_IMAGE_TO_VIDEO_MODEL_ID && hailuoVariant === 'pro' && falVideoDuration !== '6') {
      setFalVideoDuration('6');
    }
  }, [falVideoModelId, hailuoVariant, falVideoDuration]);

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
    if (selectedImageIds.length === 0 && referenceImageIds.length === 0 && !videoLastFrameImageId) {
      return;
    }
    const imageIdSet = new Set(images.map(img => img.id));
    setSelectedImageIds(prevIds => {
      const validIds = prevIds.filter(id => imageIdSet.has(id));
      return validIds.length === prevIds.length ? prevIds : validIds;
    });
    setReferenceImageIds(prevIds => {
      const validIds = prevIds.filter(id => imageIdSet.has(id));
      return validIds.length === prevIds.length ? prevIds : validIds;
    });
    setVideoLastFrameImageId(prevId => (prevId && imageIdSet.has(prevId) ? prevId : null));
  }, [images, referenceImageIds, selectedImageIds, videoLastFrameImageId]);

  const handleModelModeChange = useCallback((mode: FalModelMode) => {
    setFalModelMode(mode);
    setReferenceImageIds([]);
  }, []);

  const handleFalVideoDurationChange = useCallback((value: string) => {
    if (value === '10') {
      setFalVideoDuration('10');
      return;
    }
    if (value === '5') {
      setFalVideoDuration('5');
      return;
    }
    setFalVideoDuration('6');
  }, []);

  const handleHailuoVariantChange = useCallback((value: string) => {
    const variant = value === 'pro' ? 'pro' : 'standard';
    setHailuoVariant(variant);
    // Pro only supports 6 seconds, so reset duration when switching to Pro
    if (variant === 'pro') {
      setFalVideoDuration('6');
    }
  }, []);

  const handleKlingVariantChange = useCallback((value: string) => {
    const variant = value === 'pro' ? 'pro' : 'standard';
    setKlingVariant(variant);
  }, []);

  const handleKling26AudioChange = useCallback((value: string) => {
    if (value === 'on') {
      setKling26AudioSelection('on');
      return;
    }
    if (value === 'off') {
      setKling26AudioSelection('off');
      return;
    }
    setKling26AudioSelection('placeholder');
  }, []);

  const handleFalImageSizeChange = useCallback((value: string) => {
    setFalImageSizeSelection(value as FalImageSizeSelectionValue);
  }, []);

  const handleFalAspectRatioChange = useCallback((value: string) => {
    setFalAspectRatioSelection(value as FalAspectRatioSelectionValue);
  }, []);
  const handleFalResolutionChange = useCallback((value: string) => {
    const nextValue = value === '4K' && falModelId === KLING_IMAGE_MODEL_ID ? '2K' : value;
    setFalResolutionSelection(nextValue as FalResolutionSelectionValue);
  }, [falModelId]);

  const handleFalNumImagesChange = useCallback((value: number) => {
    if (!Number.isFinite(value)) {
      setFalNumImages(1);
      return;
    }
    const clamped = Math.min(4, Math.max(1, Math.floor(value)));
    setFalNumImages(clamped);
  }, []);

  const handleFalScaleFactorChange = useCallback((value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      setFalScaleFactor(2);
      return;
    }
    const clamped = Math.min(10, Math.max(1, Math.round(parsed)));
    setFalScaleFactor(clamped);
  }, []);

  const handleFalNoiseScaleChange = useCallback((value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      setFalNoiseScale(0.1);
      return;
    }
    const rounded = Math.round(parsed * 10) / 10;
    const clamped = Math.min(1, Math.max(0.1, rounded));
    setFalNoiseScale(clamped);
  }, []);

  const handleFalCreativityChange = useCallback((value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      setFalCreativity(0);
      return;
    }
    const rounded = Math.round(parsed * 2) / 2;
    const clamped = Math.min(10, Math.max(0, rounded));
    setFalCreativity(clamped);
  }, []);

  useEffect(() => {
    setFalScaleFactor(prev => {
      const normalizedPrev = Number.isFinite(prev) ? Math.round(prev) : 2;
      const clamped = Math.min(10, Math.max(1, normalizedPrev));
      return clamped === prev ? prev : clamped;
    });
  }, [falModelId]);

  useEffect(() => {
    setFalNoiseScale(prev => {
      const normalizedPrev = Number.isFinite(prev) ? prev : 0.1;
      const rounded = Math.round(normalizedPrev * 10) / 10;
      const clamped = Math.min(1, Math.max(0.1, rounded));
      return clamped === prev ? prev : clamped;
    });
  }, [falModelId]);

  useEffect(() => {
    const unsubscribe = subscribeToDebugLogs(setDebugLogEntries);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (falModelMode === 'video') {
      return;
    }
    const aspectRatioOptions = falModelId === REVE_TEXT_TO_IMAGE_MODEL_ID
      ? FAL_REVE_ASPECT_RATIO_OPTIONS
      : falModelId === KLING_IMAGE_MODEL_ID
        ? FAL_KLING_ASPECT_RATIO_OPTIONS
        : FAL_GEMINI_ASPECT_RATIO_OPTIONS;
    const validOptions = aspectRatioOptions.map(option => option.value);
    if (!validOptions.includes(falAspectRatioSelection)) {
      setFalAspectRatioSelection('default');
    }
  }, [falModelId, falModelMode, falAspectRatioSelection, setFalAspectRatioSelection]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const snapshotInputRef = useRef<HTMLInputElement>(null);
  const prevDisplayedNotesLength = useRef(displayedNotes.length);

  const setState = useCallback((updater: (prevState: AppState) => AppState) => {
    setHistoryState(currentState => {
      const { history: prevHistory, index: prevIndex } = currentState;
      const prevState = prevHistory[prevIndex];
      const newState = updater(prevState);

      if (getStateSignature(newState) === getStateSignature(prevState)) {
        return currentState;
      }

      const newHistory = prevHistory.slice(0, prevIndex + 1);
      newHistory.push(newState);

      if (newHistory.length > MAX_HISTORY_SIZE) {
        newHistory.shift();
      }

      return {
        history: newHistory,
        index: newHistory.length - 1,
      };
    });
  }, []);

  const handleClear = useCallback(() => {
    setState(prevState => ({ ...prevState, paths: [] }));
  }, [setState]);

  const handleModeChange = useCallback((newMode: AppMode) => {
    if (newMode === appMode) return;

    setAppMode(newMode);
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

  const buildSnapshotBinary = useCallback(async (): Promise<SnapshotBinary> => {
    const meta: SnapshotMetaState = {
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
      selectedImageIds: [...selectedImageIds],
      selectedNoteIds: [...selectedNoteIds],
      referenceImageIds: [...referenceImageIds],
      ...(videoLastFrameImageId ? { videoLastFrameImageId } : {}),
    };

    return buildSnapshotBinaryFromState({
      images: displayedImages,
      notes: displayedNotes,
      paths: displayedPaths,
      meta,
    });
  }, [
    appMode,
    apiProvider,
    brushColor,
    brushSize,
    displayedImages,
    displayedNotes,
    displayedPaths,
    eraserSize,
    falAspectRatioSelection,
    falCreativity,
    falImageSizeSelection,
    falModelId,
    falNoiseScale,
    falNumImages,
    falResolutionSelection,
    falScaleFactor,
    inpaintMode,
    prompt,
    referenceImageIds,
    selectedImageIds,
    selectedNoteIds,
    tool,
    videoLastFrameImageId,
  ]);

  const handleExportSnapshot = useCallback(async () => {
    try {
      const snapshotBinary = await buildSnapshotBinary();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const suggestedName = `banana-canvas-snapshot-${timestamp}.bcsnap`;

      const win = window as unknown as { showSaveFilePicker?: (options?: unknown) => Promise<any> };
      if (typeof win.showSaveFilePicker === 'function') {
        const saveHandle = await win.showSaveFilePicker({
          suggestedName,
          types: [
            {
              description: 'Canvas Snapshot',
              accept: { 'application/octet-stream': ['.bcsnap'] },
            },
          ],
        });
        const writable = await saveHandle.createWritable();
        await writeSnapshotBinary(snapshotBinary, writable);
        await writable.close();
      } else {
        const blob = snapshotBinaryToBlob(snapshotBinary);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = suggestedName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }

      setError(null);
      setToastMessage('Snapshot exported');
      setTimeout(() => setToastMessage(null), 2000);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to export snapshot.';
      setError(message);
    } finally {
      setIsFileMenuOpen(false);
    }
  }, [buildSnapshotBinary]);

  const handleImportSnapshotFromFile = useCallback(async (file: File) => {
    try {
      const restored = await restoreSnapshotFromFile(file, {
        brushSize,
        eraserSize,
        brushColor,
      });

      const nextState: AppState = {
        images: restored.images,
        paths: restored.paths,
        notes: restored.notes,
      };

      setLiveImages(null);
      setLivePaths(null);
      setLiveNotes(null);
      setHistoryState({ history: [nextState], index: 0 });

      const meta = restored.meta;
      if (meta) {
        const validAppMode: AppMode =
          meta.appMode === 'CANVAS' || meta.appMode === 'ANNOTATE' || meta.appMode === 'INPAINT'
            ? meta.appMode
            : 'CANVAS';
        setAppMode(validAppMode);

        const validTool = Object.values(Tool).includes(meta.tool) ? meta.tool : Tool.PAN;
        setTool(validTool);

        if (typeof meta.brushSize === 'number' && Number.isFinite(meta.brushSize) && meta.brushSize > 0) {
          setBrushSize(meta.brushSize);
        }
        if (typeof meta.eraserSize === 'number' && Number.isFinite(meta.eraserSize) && meta.eraserSize > 0) {
          setEraserSize(meta.eraserSize);
        }
        if (typeof meta.brushColor === 'string' && meta.brushColor.length > 0) {
          setBrushColor(meta.brushColor);
        }
        if (typeof meta.prompt === 'string') {
          setPrompt(meta.prompt);
        }
        if (meta.inpaintMode === 'STRICT' || meta.inpaintMode === 'CREATIVE') {
          setInpaintMode(meta.inpaintMode);
        }
        if (meta.apiProvider === 'google' || meta.apiProvider === 'fal') {
          if (providerAvailability[meta.apiProvider]) {
            setApiProvider(meta.apiProvider);
          } else if (AVAILABLE_PROVIDERS.length > 0) {
            setApiProvider(AVAILABLE_PROVIDERS[0]);
          }
        }
        const normalizedFalModelId = normalizeFalModelId(meta.falModelId);
        if (normalizedFalModelId) {
          if (isFalVideoModelId(normalizedFalModelId)) {
            setFalModelMode('video');
            setFalVideoModelId(normalizedFalModelId);
          } else if (isFalImageModelId(normalizedFalModelId)) {
            setFalModelMode('image');
            setFalImageModelId(normalizedFalModelId);
          }
        }
        if (isFalImageSizeSelectionValue(meta.falImageSizeSelection)) {
          setFalImageSizeSelection(meta.falImageSizeSelection);
        }
        if (isFalAspectRatioSelectionValue(meta.falAspectRatioSelection)) {
          setFalAspectRatioSelection(meta.falAspectRatioSelection);
        }
        if (isFalResolutionSelectionValue(meta.falResolutionSelection)) {
          setFalResolutionSelection(meta.falResolutionSelection);
        }
        if (typeof meta.falNumImages === 'number') {
          setFalNumImages(Math.min(4, Math.max(1, Math.floor(meta.falNumImages))));
        }
        if (typeof meta.falScaleFactor === 'number') {
          setFalScaleFactor(Math.min(10, Math.max(1, Math.round(meta.falScaleFactor))));
        }
        if (typeof meta.falNoiseScale === 'number') {
          const normalizedNoise = Number.isFinite(meta.falNoiseScale) ? meta.falNoiseScale : 0.1;
          const roundedNoise = Math.round(normalizedNoise * 10) / 10;
          setFalNoiseScale(Math.min(1, Math.max(0.1, roundedNoise)));
        }
        if (typeof meta.falCreativity === 'number') {
          const normalizedCreativity = Number.isFinite(meta.falCreativity)
            ? Math.round(meta.falCreativity * 2) / 2
            : 0;
          setFalCreativity(Math.min(10, Math.max(0, normalizedCreativity)));
        }
        setSelectedImageIds(Array.isArray(meta.selectedImageIds) ? [...meta.selectedImageIds] : []);
        setSelectedNoteIds(Array.isArray(meta.selectedNoteIds) ? [...meta.selectedNoteIds] : []);
        setReferenceImageIds(Array.isArray(meta.referenceImageIds) ? [...meta.referenceImageIds] : []);
        if (typeof meta.videoLastFrameImageId === 'string' && meta.videoLastFrameImageId.length > 0) {
          setVideoLastFrameImageId(meta.videoLastFrameImageId);
        } else {
          setVideoLastFrameImageId(null);
        }
      } else {
        setSelectedImageIds([]);
        setSelectedNoteIds([]);
        setReferenceImageIds([]);
        setVideoLastFrameImageId(null);
      }

      setError(null);
      setToastMessage('Snapshot imported');
      setTimeout(() => setToastMessage(null), 2000);
    } catch (err) {
      console.error(err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to import snapshot.');
      }
    } finally {
      setIsFileMenuOpen(false);
    }
  }, [
    brushColor,
    brushSize,
    eraserSize,
    setLiveImages,
    setLivePaths,
    setLiveNotes,
    setHistoryState,
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
  ]);

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

  const handleImportSnapshot = useCallback(async () => {
    const win = window as unknown as { showOpenFilePicker?: (options?: unknown) => Promise<any[]> };
    if (typeof win.showOpenFilePicker === 'function') {
      try {
        const [fileHandle] = await win.showOpenFilePicker({
          multiple: false,
          types: [
            {
              description: 'Canvas Snapshot',
              accept: {
                'application/octet-stream': ['.bcsnap'],
                'application/json': ['.json'],
              },
            },
          ],
        });
        if (fileHandle) {
          const file = await fileHandle.getFile();
          await handleImportSnapshotFromFile(file);
        }
      } catch (err) {
        if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
          return;
        }
        console.error(err);
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Failed to import snapshot.');
        }
      }
    } else {
      closeFileMenu();
      snapshotInputRef.current?.click();
    }
  }, [closeFileMenu, handleImportSnapshotFromFile, setError]);

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

  const handleCommit = useCallback(() => {
    if (liveImages !== null || livePaths !== null || liveNotes !== null) {
      setState(prevState => ({
        images: liveImages ?? prevState.images,
        paths: livePaths ?? prevState.paths,
        notes: liveNotes ?? prevState.notes,
      }));
      setLiveImages(null);
      setLivePaths(null);
      setLiveNotes(null);
    }
  }, [liveImages, livePaths, liveNotes, setState]);

  const undo = useCallback(() => {
    handleCommit();
    setHistoryState(prev => {
      if (prev.index === 0) {
        return prev;
      }
      return { ...prev, index: prev.index - 1 };
    });
  }, [handleCommit, setHistoryState]);

  const redo = useCallback(() => {
    handleCommit();
    setHistoryState(prev => {
      if (prev.index >= prev.history.length - 1) {
        return prev;
      }
      return { ...prev, index: prev.index + 1 };
    });
  }, [handleCommit, setHistoryState]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const handleToolChange = useCallback((newTool: Tool) => {
    setTool(newTool);
    if (editingNoteId) {
      setEditingNoteId(null);
      handleCommit();
    }
    if (cropMode) {
      setCropMode(null);
    }
  }, [editingNoteId, handleCommit, cropMode]);

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

  useEffect(() => {
    const isTextInput = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null;
      if (!el || !(el instanceof HTMLElement)) {
        return false;
      }
      const tagName = el.tagName;
      return tagName === 'INPUT' || tagName === 'TEXTAREA' || el.isContentEditable || !!el.closest('input, textarea, [contenteditable="true"]');
    };

    const handleKeyboardShortcuts = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        handleGenerate();
        return;
      }

      if (isTextInput(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 'v') {
        setTool(Tool.SELECTION);
        return;
      }
      if (key === 'f') {
        setTool(Tool.FREE_SELECTION);
        return;
      }
      if (key === 'h') {
        setTool(Tool.PAN);
        return;
      }
      if (key === 'n') {
        setTool(Tool.NOTE);
        return;
      }
      if (key === 'b') {
        setTool(Tool.BRUSH);
        return;
      }
      if (key === 'e') {
        setTool(Tool.ERASE);
        return;
      }
      if (!event.metaKey && !event.ctrlKey && (key === '-' || key === '_')) {
        event.preventDefault();
        requestZoomOut();
        return;
      }
      if (!event.metaKey && !event.ctrlKey && (key === '=' || key === '+')) {
        event.preventDefault();
        requestZoomIn();
      }
    };

    window.addEventListener('keydown', handleKeyboardShortcuts);
    return () => {
      window.removeEventListener('keydown', handleKeyboardShortcuts);
    };
  }, [handleGenerate, requestZoomIn, requestZoomOut, setTool]);

  const handleFilesDrop = useCallback((files: FileList, point: Point) => {
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    let lastAddedImageId: string | null = null;
    const newImages: CanvasImage[] = [];
    let imagesProcessed = 0;

    imageFiles.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const { naturalWidth, naturalHeight } = getNaturalSize(img);
          const displayWidth = img.width || naturalWidth;
          const displayHeight = img.height || naturalHeight;
          const newCanvasImage: CanvasImage = {
            id: crypto.randomUUID(),
            element: img,
            mediaType: 'image',
            x: point.x - (displayWidth / 2) + (index * 20),
            y: point.y - (displayHeight / 2) + (index * 20),
            width: displayWidth,
            height: displayHeight,
            rotation: 0,
            naturalWidth,
            naturalHeight,
            file: file,
            isPlaying: false,
            hasAudio: false,
            metadata: { source: 'imported' },
          };
          newImages.push(newCanvasImage);
          lastAddedImageId = newCanvasImage.id;
          imagesProcessed++;

          if (imagesProcessed === imageFiles.length) {
            setState(prevState => ({
              ...prevState,
              images: [...prevState.images, ...newImages],
              paths: [],
            }));
            setSelectedImageIds(lastAddedImageId ? [lastAddedImageId] : []);
            setSelectedNoteIds([]);
            setReferenceImageIds([]);
            setTool(Tool.SELECTION);
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  }, [setState]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const centerPoint: Point = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      handleFilesDrop(files, centerPoint);
    }
    e.target.value = '';
  }, [handleFilesDrop]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleDownload = useCallback(() => {
    if (!hasSingleImageSelected || !primaryImageId) return;
    const imageToDownload = images.find(img => img.id === primaryImageId);
    if (!imageToDownload) return;

    const mediaElement = imageToDownload.element;
    const href = mediaElement instanceof HTMLVideoElement
      ? (mediaElement.currentSrc || mediaElement.src)
      : mediaElement.src;
    if (!href) {
      setError('No downloadable source found for this item.');
      return;
    }

    const link = document.createElement('a');
    link.href = href;
    link.download = imageToDownload.file.name || (imageToDownload.mediaType === 'video' ? 'video.mp4' : 'download.png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [hasSingleImageSelected, images, primaryImageId, setError]);

  const handleBackgroundRemoval = useCallback(async () => {
    if (!hasSingleImageSelected || !primaryImageId) {
      setError('Select an image to remove its background.');
      return;
    }
    const targetImage = images.find(img => img.id === primaryImageId);
    if (!targetImage || !isImageCanvasMedia(targetImage)) {
      setError('Background removal is only available for images.');
      return;
    }

    try {
      setIsRemovingBackground(true);
      const { imageBase64 } = await removeFalBackground(targetImage.element);
      const dataUrl = `data:image/png;base64,${imageBase64}`;
      const blob = await (await fetch(dataUrl)).blob();
      const element = await loadMediaFromBlob(blob, 'image');
      const { naturalWidth, naturalHeight } = getNaturalSize(element);
      const fileNameBase = targetImage.file?.name?.replace(/\.[^.]+$/, '') || 'image';
      const updatedFile = new File([blob], `${fileNameBase}-nobg.png`, { type: blob.type || targetImage.file.type || 'image/png' });
      const width = element.width || naturalWidth;
      const height = element.height || naturalHeight;

      setState(prev => ({
        ...prev,
        images: prev.images.map(img => img.id === targetImage.id
          ? {
              ...img,
              element,
              width,
              height,
              naturalWidth,
              naturalHeight,
              file: updatedFile,
              metadata: { ...img.metadata, source: img.metadata?.source ?? 'derived' },
            }
          : img),
      }));
      setError(null);
      setToastMessage('Background removed');
      setTimeout(() => setToastMessage(null), 2000);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to remove background.';
      setError(message);
    } finally {
      setIsRemovingBackground(false);
    }
  }, [hasSingleImageSelected, primaryImageId, images, setState, setError, setToastMessage]);

  const handleStartCrop = useCallback((imageId: string) => {
    handleCommit();
    const targetImage = (liveImages ?? images).find(img => img.id === imageId);
    if (!targetImage) {
      return;
    }
    if (!isImageCanvasMedia(targetImage)) {
      setError('Cropping is only available for images.');
      return;
    }
    setTransformMode(null);
    setCropMode({
      imageId,
      rect: { x: 0, y: 0, width: targetImage.width, height: targetImage.height },
    });
    setSelectedImageIds([imageId]);
  }, [handleCommit, liveImages, images, setError]);

  const handleCropRectChange = useCallback((rect: { x: number; y: number; width: number; height: number; }) => {
    setCropMode(prev => (prev ? { ...prev, rect } : prev));
  }, []);

  const handleConfirmCrop = useCallback(async () => {
    if (!cropMode) return;
    const targetImage = images.find(img => img.id === cropMode.imageId);
    if (!targetImage || !isImageCanvasMedia(targetImage)) {
      setCropMode(null);
      return;
    }

    try {
      const { x, y, width, height } = cropMode.rect;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(height));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Unable to crop image.');
      }

      ctx.drawImage(targetImage.element, x, y, width, height, 0, 0, width, height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(result => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error('Failed to create cropped image.'));
          }
        }, targetImage.file.type || 'image/png');
      });

      const element = await loadMediaFromBlob(blob, 'image');
      const { naturalWidth, naturalHeight } = getNaturalSize(element);
      const fileNameBase = targetImage.file?.name?.replace(/\.[^.]+$/, '') || 'image';
      const croppedFile = new File([blob], `${fileNameBase}-cropped.png`, { type: blob.type || targetImage.file.type || 'image/png' });
      const displayWidth = element.width || naturalWidth;
      const displayHeight = element.height || naturalHeight;

      setState(prev => ({
        ...prev,
        images: prev.images.map(img => img.id === targetImage.id
          ? {
              ...img,
              element,
              x: img.x + x,
              y: img.y + y,
              width: displayWidth,
              height: displayHeight,
              naturalWidth,
              naturalHeight,
              rotation: 0,
              file: croppedFile,
              metadata: { ...img.metadata, source: img.metadata?.source ?? 'derived' },
            }
          : img),
      }));
      setSelectedImageIds([targetImage.id]);
      setToastMessage('Cropped image saved');
      setTimeout(() => setToastMessage(null), 2000);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to crop image.';
      setError(message);
    } finally {
      setCropMode(null);
      setLiveImages(null);
    }
  }, [cropMode, images, setError, setLiveImages, setSelectedImageIds, setState, setToastMessage]);

  const handleCancelCrop = useCallback(() => {
    setCropMode(null);
  }, []);

  const handleStartTransform = useCallback((imageId: string) => {
    handleCommit();
    setCropMode(null);
    setTransformMode({ imageId });
    setSelectedImageIds([imageId]);
  }, [handleCommit]);

  const handleExitTransform = useCallback(() => {
    handleCommit();
    setTransformMode(null);
  }, [handleCommit]);

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

  const handleImageSelection = useCallback((
    imageId: string | null,
    options: { multi?: boolean; reference?: boolean; lastFrame?: boolean } = {},
  ) => {
    const { multi = false, reference = false, lastFrame = false } = options;
    const targetImage = imageId ? images.find(img => img.id === imageId) : null;
    const isKlingVideoSelection = apiProvider === 'fal'
      && falModelMode === 'video'
      && falVideoModelId === KLING_VIDEO_MODEL_ID;

    if (reference && targetImage?.mediaType === 'video') {
      setError('Reference images must be still images.');
      return;
    }

    if (lastFrame) {
      if (!isKlingProVideoSelection) {
        return;
      }
      if (!imageId) {
        setVideoLastFrameImageId(null);
        return;
      }
      if (!isImageCanvasMedia(targetImage)) {
        setError('Ending frame must be a still image.');
        return;
      }
      if (primaryImageId && imageId === primaryImageId) {
        setVideoLastFrameImageId(null);
        return;
      }
      setVideoLastFrameImageId(prevId => (prevId === imageId ? null : imageId));
      return;
    }

    if (reference && isKlingVideoSelection) {
      if (klingVariant === 'pro') {
        if (!isImageCanvasMedia(targetImage)) {
          setError('Ending frame must be a still image.');
          return;
        }
        if (primaryImageId && imageId === primaryImageId) {
          setVideoLastFrameImageId(null);
          return;
        }
        setVideoLastFrameImageId(prevId => (prevId === imageId ? null : imageId ?? null));
      }
      return;
    }

    if (reference) {
      if (primaryImageId && imageId === primaryImageId) {
        return;
      }
      if (!imageId) {
        setReferenceImageIds([]);
        return;
      }
      const maxReferenceImages = getMaxReferenceImages(falModelId);
      setReferenceImageIds(prevIds => {
        if (prevIds.includes(imageId)) {
          return prevIds.filter(id => id !== imageId);
        }
        if (prevIds.length < maxReferenceImages) {
          return [...prevIds, imageId];
        }
        showReferenceLimitToast(maxReferenceImages);
        return prevIds;
      });
      return;
    }

    if (!imageId) {
      if (!multi) {
        setSelectedImageIds([]);
        setSelectedNoteIds([]);
        setReferenceImageIds([]);
        setVideoLastFrameImageId(null);
      }
      return;
    }

    if (multi) {
      setReferenceImageIds([]);
      setVideoLastFrameImageId(null);
      setSelectedImageIds(prevIds => {
        if (prevIds.includes(imageId)) {
          return prevIds.filter(id => id !== imageId);
        }
        return [...prevIds, imageId];
      });
      return;
    }

    if (primaryImageId === imageId && selectedImageIds.length === 1) {
      setSelectedNoteIds([]);
      setReferenceImageIds([]);
      setVideoLastFrameImageId(null);
      return;
    }

    setSelectedImageIds([imageId]);
    setSelectedNoteIds([]);
    setReferenceImageIds([]);
    if (videoLastFrameImageId && videoLastFrameImageId === imageId) {
      setVideoLastFrameImageId(null);
    }
  }, [
    apiProvider,
    falModelId,
    falModelMode,
    falVideoModelId,
    images,
    isKlingProVideoSelection,
    klingVariant,
    primaryImageId,
    selectedImageIds.length,
    setError,
    showReferenceLimitToast,
    videoLastFrameImageId,
  ]);

  const handleNoteSelection = useCallback((
    noteId: string | null,
    options: { multi?: boolean } = {},
  ) => {
    const { multi = false } = options;

    if (!noteId) {
      if (!multi) {
        setSelectedNoteIds([]);
        setSelectedImageIds([]);
        setReferenceImageIds([]);
        setVideoLastFrameImageId(null);
      }
      return;
    }

    if (multi) {
      setSelectedNoteIds(prevIds => {
        if (prevIds.includes(noteId)) {
          return prevIds.filter(id => id !== noteId);
        }
        return [...prevIds, noteId];
      });
      return;
    }

    if (primaryNoteId === noteId && selectedNoteIds.length === 1) {
      setSelectedImageIds([]);
      setReferenceImageIds([]);
      setVideoLastFrameImageId(null);
      return;
    }

    setSelectedNoteIds([noteId]);
    setSelectedImageIds([]);
    setReferenceImageIds([]);
    setVideoLastFrameImageId(null);
  }, [primaryNoteId, selectedNoteIds.length]);

  const handleNoteTextChange = useCallback((noteId: string, text: string) => {
    const targetNotes = liveNotes ?? displayedNotes;
    const noteIndex = targetNotes.findIndex(n => n.id === noteId);
    if (noteIndex === -1) return;

    const newNotes = [...targetNotes];
    newNotes[noteIndex] = { ...newNotes[noteIndex], text };
    setLiveNotes(newNotes);
  }, [liveNotes, displayedNotes]);

  const selectedImageIndex = primaryImageId ? images.findIndex(img => img.id === primaryImageId) : -1;
  const isImageOverlapping = primaryImageId && selectedImageIndex !== -1 ? images.some(other => other.id !== primaryImageId && isOverlapping(images[selectedImageIndex], other)) : false;
  const canMoveUp = selectedImageIndex > -1 && selectedImageIndex < images.length - 1;
  const canMoveDown = selectedImageIndex > -1 && selectedImageIndex > 0;

  const usingFal = apiProvider === 'fal';
  const isVideoMode = falModelMode === 'video';
  const isKlingVideoModel = isVideoMode && falVideoModelId === KLING_VIDEO_MODEL_ID;
  const isKling26VideoModel = isVideoMode && falVideoModelId === KLING_26_VIDEO_MODEL_ID;
  const isHailuoVideoModel = isVideoMode && falVideoModelId === HAILUO_IMAGE_TO_VIDEO_MODEL_ID;
  const isCanvasGenerationTool = tool === Tool.SELECTION || tool === Tool.FREE_SELECTION;
  const isTextToImage = !activePrimaryImage;
  const promptEmpty = prompt.trim().length === 0;
  const isSeedreamModel = !isVideoMode && isSeedreamModelId(falModelId);
  const isGeminiModel = !isVideoMode && falModelId === GEMINI_IMAGE_PREVIEW_EDIT_MODEL_ID;
  const isReveModel = !isVideoMode && falModelId === REVE_TEXT_TO_IMAGE_MODEL_ID;
  const isKlingModel = !isVideoMode && falModelId === KLING_IMAGE_MODEL_ID;
  const isCrystalUpscaleModel = !isVideoMode && falModelId === CRYSTAL_UPSCALER_MODEL_ID;
  const isSeedvrUpscaleModel = !isVideoMode && falModelId === SEEDVR_UPSCALER_MODEL_ID;
  const isUpscaleModel = isCrystalUpscaleModel || isSeedvrUpscaleModel;
  const shouldValidateFalOptions = usingFal && !isVideoMode && (isSeedreamModel || isGeminiModel || isReveModel || isKlingModel);
  const isNumImagesInvalid =
    !Number.isFinite(falNumImages) ||
    falNumImages < 1 ||
    falNumImages > 4;
  const hasInpaintMask = paths.some(path => path.tool === Tool.INPAINT && path.points.length > 0);
  const requiresPrompt = !(usingFal && isUpscaleModel);
  const isPromptMissing = requiresPrompt && promptEmpty;
  const requiresSelectedImageForUpscale = usingFal && isUpscaleModel && isTextToImage;
  const requiresSelectedImageForVideo = usingFal && isVideoMode && isTextToImage;
  const editConstraintsActive = !isVideoMode && !isTextToImage && !isUpscaleModel && (
    (usingFal && isReveModel) ||
    (appMode === 'CANVAS' && !isCanvasGenerationTool) ||
    (appMode === 'INPAINT' && !hasInpaintMask)
  );

  const submitDisabled = isPromptMissing ||
    (shouldValidateFalOptions && isNumImagesInvalid) ||
    requiresSelectedImageForUpscale ||
    requiresSelectedImageForVideo ||
    editConstraintsActive;

  const promptPlaceholderText = isVideoMode
    ? (activePrimaryImage
      ? 'Describe the motion or scene you want this image to turn into...'
      : 'Select an image and describe the video you want to create...')
    : usingFal && isUpscaleModel
      ? `Prompt disabled for ${getFalModelLabel(falModelId)}. Select an image and scale factor.`
      : isTextToImage
        ? 'Describe the image you want to create... (Cmd/Ctrl + Enter to generate)'
        : 'Describe your edit... (Cmd/Ctrl + Enter to generate)';
  const disablePromptInput = usingFal && isUpscaleModel;

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

  return (
    <div className="h-screen w-screen bg-gray-800 text-white flex flex-col overflow-hidden">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
      <input
        type="file"
        ref={snapshotInputRef}
        onChange={handleSnapshotFileChange}
        accept=".bcsnap,application/octet-stream,application/json,.json"
        className="hidden"
      />
      <FileMenu
        isOpen={isFileMenuOpen}
        onToggle={toggleFileMenu}
        onClose={closeFileMenu}
        onImportSnapshot={handleImportSnapshot}
        onExportSnapshot={handleExportSnapshot}
        onOpenDebugLog={openDebugLogPanel}
      />

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

      {error && (
        <StatusBanner message={error} variant="error" onClose={() => setError(null)} />
      )}

      {toastMessage && (
        <StatusBanner message={toastMessage} variant="success" />
      )}

      <FalQueuePanel jobs={falJobs} onDismiss={handleDismissFalJob} />

      {isDebugLogOpen && (
        <DebugLogPanel
          entries={debugLogEntries}
          onClose={closeDebugLogPanel}
          onClear={clearDebugLogs}
        />
      )}

      {!cropMode && !transformMode && AVAILABLE_PROVIDERS.length > 0 && (
        <ProviderSwitcher
          providers={AVAILABLE_PROVIDERS}
          activeProvider={apiProvider}
          labels={PROVIDER_LABELS}
          disabled={isLoading}
          onSelect={setApiProvider}
        />
      )}

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
          onModelChange={(modelId) => {
            const normalizedModelId = normalizeFalModelId(modelId);
            if (normalizedModelId) {
              if (isFalVideoModelId(normalizedModelId)) {
                setFalModelMode('video');
                setFalVideoModelId(normalizedModelId);
              } else if (isFalImageModelId(normalizedModelId)) {
                setFalModelMode('image');
                setFalImageModelId(normalizedModelId);
              }
            }
          }}
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
