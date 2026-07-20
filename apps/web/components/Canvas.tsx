import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Tool, Path, Point, CanvasImage, CanvasNote, AppMode, CanvasVideoPromptArea, CanvasVideoPromptBar, VideoPromptAreaMembership, VideoModelCapabilityProfile } from '../types';
import { getNaturalSize, loadImageFromBlob } from '../services/mediaService';
import { JIMENG_SEEDANCE_2_VIDEO_MODEL_ID, KLING_V3_VIDEO_MODEL_ID, SEEDANCE_2_VIDEO_MODEL_ID } from '../services/modelConfig';
import { LayerUpIcon, LayerDownIcon, CropIcon, CancelIcon, ConfirmIcon, CopyIcon, TransformIcon, RerunIcon, DuplicateIcon, PlayIcon, PauseIcon, SnapshotIcon, MinusIcon, StarIcon } from './Icons';
import {
  DOT_BASE_SIZE,
  DOT_MAX_SIZE,
  DOT_MIN_SIZE,
  GRID_BASE_SIZE,
  GRID_MAX_SIZE,
  GRID_MIN_SIZE,
  GRID_VISUAL_SCALE,
  KEYBOARD_ZOOM_MULTIPLIER,
  KEYBOARD_ZOOM_OUT_MULTIPLIER,
  MAX_SCALE,
  MIN_SCALE,
  WHEEL_ZOOM_MULTIPLIER,
} from './canvas/constants';
import { getImageBounds } from './canvas/geometry';
import { isAudioImage, isVideoImage } from './canvas/mediaGuards';
import { createCanvasRenderCache, drawCanvas } from './canvas/render/drawCanvas';
import { DEFAULT_VIDEO_PROMPT_AREA_BORDER_COLOR, VIDEO_PROMPT_AREA_BORDER_COLOR_OPTIONS } from '../utils/canvasColorOptions';
import { useCanvasInteractions } from './canvas/hooks/useCanvasInteractions';
import { useCanvasPlaybackLoop } from './canvas/hooks/useCanvasPlaybackLoop';
import { PromptBar, type PromptBarControlConfig } from './PromptBar';
import { Tooltip } from './Tooltip';
import {
  DEFAULT_VIDEO_PROMPT_BAR_DRAG_HANDLE_HEIGHT,
  EMBEDDED_VIDEO_PROMPT_BAR_SCREEN_BOTTOM_PADDING,
  getAreaPromptBarRect,
  getEmbeddedVideoPromptBarRenderWidth,
  getEmbeddedVideoPromptBarSizeMode,
  getMentionOptionsFromMembership,
  getVideoPromptBarVisualScale,
  syncVideoPromptAreaMembership,
} from '../utils/videoPromptAreas';
import { stopCanvasMediaPlayback, syncCanvasMediaElementPlayback } from '../utils/canvasMediaPlayback';
import { getCanvasImagePrompt } from '../utils/canvasImagePrompt';
import { KEYBOARD_SHORTCUT_LABELS } from '../utils/keyboardShortcutLabels';
import { createCanvasInteractionGuard, isCanvasInteractiveTarget } from '../utils/canvasInteractionBoundary';

// One-shot request to center a world point; a new token marks a fresh request.
export type PanToAnchorRequest = Point & { token: number };

interface CanvasProps {
  images: CanvasImage[];
  onImagesChange: (images: CanvasImage[]) => void;
  // onCommit accepts optional state overrides so callers can snapshot freshly-updated slices immediately.
  onCommit: (overrides?: { images?: CanvasImage[]; paths?: Path[]; notes?: CanvasNote[]; videoPromptAreas?: CanvasVideoPromptArea[]; videoPromptBars?: CanvasVideoPromptBar[] }) => void;
  notes: CanvasNote[];
  onNotesChange: (notes: CanvasNote[]) => void;
  videoPromptAreas: CanvasVideoPromptArea[];
  onVideoPromptAreasChange: (areas: CanvasVideoPromptArea[]) => void;
  videoPromptBars: CanvasVideoPromptBar[];
  onVideoPromptBarsChange: (bars: CanvasVideoPromptBar[]) => void;
  selectedVideoPromptAreaId: string | null;
  onVideoPromptAreaSelect: (id: string | null) => void;
  videoPromptAreaMemberships: Record<string, VideoPromptAreaMembership>;
  videoPromptAreaProfiles?: Record<string, VideoModelCapabilityProfile>;
  tool: Tool;
  canCreateVideoPromptAreas?: boolean;
  appMode: AppMode;
  paths: Path[];
  onPathsChange: (paths: Path[]) => void;
  brushSize: number;
  eraserSize: number;
  brushColor: string;
  selectedImageIds: string[];
  referenceImageIds: string[];
  referenceVideoIds: string[];
  referenceAudioIds: string[];
  referenceImageOrderLabels?: Record<string, string> | null;
  isKrea2StyleReferenceMode?: boolean;
  krea2StyleReferenceImageIds?: string[];
  krea2StyleReferenceStrengths?: Record<string, number>;
  onKrea2StyleReferenceStrengthChange?: (imageId: string, value: number) => void;
  disabledMediaIds?: string[];
  elementImageIds: string[];
  elementImageOrderLabels?: Record<string, string> | null;
  videoLastFrameImageId: string | null;
  sourceVideoId: string | null;
  tailSelectionEnabled: boolean;
  isKlingO3VideoInputMode: boolean;
  isKlingO3ReferenceMode: boolean;
  isSeedance15FflfMode: boolean;
  isKlingV3ControlVideoInputMode: boolean;
  isVeo31ExtendMode: boolean;
  isWanAnimateVideoInputMode: boolean;
  isWan27VideoMode: boolean;
  onError?: (message: string) => void;
  onMediaPlaybackRejected?: (imageId: string) => void;
  onImageSelect: (id: string | null, options?: { multi?: boolean; reference?: boolean; lastFrame?: boolean; element?: boolean }) => void;
  onSelectionReplace: (imageIds: string[]) => void;
  zoomToFitTrigger: number;
  zoomToSelectionTrigger: number;
  zoomInTrigger: number;
  zoomOutTrigger: number;
  panToAnchorRequest: PanToAnchorRequest | null;
  onFilesDrop: (files: FileList, point: Point) => void;
  onAnchorNoteCreate: (point: Point) => void;
  onAnchorClick: (noteId: string) => void;
  onImageOrderChange: (id: string, direction: 'up' | 'down') => void;
  isImageOverlapping: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  cropMode: { imageId: string; rect: { x: number; y: number; width: number; height: number; }; } | null;
  onCropRectChange: (rect: { x: number; y: number; width: number; height: number; }) => void;
  onStartCrop: (imageId: string) => void;
  onConfirmCrop: () => void;
  onCancelCrop: () => void;
  onVideoPromptAreaBorderColorChange?: (areaId: string, color: string) => void;
  onImagePromptCopy: (imageId: string) => void;
  onImageDuplicate: (imageId: string) => void;
  onRerunGeneration: (imageId: string) => void;
  showMetadataOverlay: boolean;
  transformMode: { imageId: string; } | null;
  onStartTransform: (imageId: string) => void;
  onExitTransform: () => void;
  isLoading: boolean;
  onVideoPromptBarFocus: (barId: string) => void;
  onVideoPromptBarBlur: (barId: string) => void;
  onVideoPromptBarUpdate: (barId: string, updater: (bar: CanvasVideoPromptBar) => CanvasVideoPromptBar) => void;
  onVideoPromptBarSubmit: (barId: string) => void;
  buildVideoPromptBarControls: (bar: CanvasVideoPromptBar) => ReadonlyArray<PromptBarControlConfig>;
  embeddedVideoPromptBarModelOptions: ReadonlyArray<{ value: string; label: string }>;
  onScaleChange?: (scale: number) => void;
  isPresentationMode?: boolean;
}

const normalizeEmbeddedPromptBarForModel = (bar: CanvasVideoPromptBar, modelId: string): CanvasVideoPromptBar => {
  if (modelId !== JIMENG_SEEDANCE_2_VIDEO_MODEL_ID) {
    return { ...bar, modelId };
  }
  const modelVersion = bar.seedance2JimengModelVersion ?? bar.falOptions?.seedance2JimengModelVersion ?? 'seedance2.0fast'; // Default JM CLI channel is 720p-only.
  const seedance2AspectRatio = bar.seedance2AspectRatio === 'adaptive' ? '16:9' : bar.seedance2AspectRatio; // Jimeng rejects adaptive AR.
  const seedance2Resolution = modelVersion === 'seedance2.0_vip' || bar.seedance2Resolution !== '1080p' ? bar.seedance2Resolution : '720p'; // 1080p requires VIP.
  return {
    ...bar,
    modelId,
    seedance2JimengModelVersion: modelVersion,
    seedance2AspectRatio,
    seedance2Resolution,
    falOptions: bar.falOptions
      ? { ...bar.falOptions, seedance2JimengModelVersion: modelVersion, seedance2AspectRatio, seedance2Resolution }
      : bar.falOptions,
  };
};

const ActionButton: React.FC<{
  onClick: () => void;
  disabled: boolean;
  title: string;
  children: React.ReactNode;
}> = ({ onClick, disabled, title, children }) => (
  <Tooltip label={title}>
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={title}
      className="p-2.5 rounded-md transition-colors duration-200 bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
    >
      {children}
    </button>
  </Tooltip>
);

// Core canvas surface: renders images/notes, handles drawing tools, selection, transforms, and emits updates to parents.
export const Canvas: React.FC<CanvasProps> = ({
  images,
  onImagesChange,
  notes,
  onNotesChange,
  videoPromptAreas,
  onVideoPromptAreasChange,
  videoPromptBars,
  onVideoPromptBarsChange,
  selectedVideoPromptAreaId,
  onVideoPromptAreaSelect,
  videoPromptAreaMemberships,
  videoPromptAreaProfiles,
  tool,
  canCreateVideoPromptAreas = true,
  appMode,
  paths,
  onPathsChange,
  brushSize,
  eraserSize,
  brushColor,
  selectedImageIds,
  referenceImageIds,
  referenceVideoIds,
  referenceAudioIds,
  referenceImageOrderLabels,
  isKrea2StyleReferenceMode = false,
  krea2StyleReferenceImageIds,
  krea2StyleReferenceStrengths = {},
  onKrea2StyleReferenceStrengthChange,
  disabledMediaIds = [],
  elementImageIds,
  elementImageOrderLabels,
  videoLastFrameImageId,
  sourceVideoId,
  tailSelectionEnabled,
  isKlingO3VideoInputMode,
  isKlingO3ReferenceMode,
  isSeedance15FflfMode,
  isKlingV3ControlVideoInputMode,
  isVeo31ExtendMode,
  isWanAnimateVideoInputMode,
  isWan27VideoMode,
  onError,
  onMediaPlaybackRejected,
  onImageSelect,
  onSelectionReplace,
  onCommit,
  zoomToFitTrigger,
  zoomToSelectionTrigger,
  zoomInTrigger,
  zoomOutTrigger,
  panToAnchorRequest,
  onFilesDrop,
  onAnchorNoteCreate,
  onAnchorClick,
  onImageOrderChange,
  isImageOverlapping,
  canMoveUp,
  canMoveDown,
  cropMode,
  onCropRectChange,
  onStartCrop,
  onConfirmCrop,
  onCancelCrop,
  onVideoPromptAreaBorderColorChange,
  onImagePromptCopy,
  onImageDuplicate,
  onRerunGeneration,
  showMetadataOverlay,
  transformMode,
  onStartTransform,
  onExitTransform,
  isLoading,
  onVideoPromptBarFocus,
  onVideoPromptBarBlur,
  onVideoPromptBarUpdate,
  onVideoPromptBarSubmit,
  buildVideoPromptBarControls,
  embeddedVideoPromptBarModelOptions,
  onScaleChange,
  isPresentationMode = false,
}) => {
  type VideoPromptAreaDragMode = 'move' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br'; // Area resizing should track which corner the user grabbed.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoPromptAreaColorPickerRef = useRef<HTMLDivElement>(null);
  const canvasInteractionGuardRef = useRef<ReturnType<typeof createCanvasInteractionGuard> | null>(null);
  const renderCacheRef = useRef(createCanvasRenderCache());
  const audioPlaybackTimesRef = useRef<Record<string, number>>({});
  const [isVideoPromptAreaColorPickerOpen, setIsVideoPromptAreaColorPickerOpen] = useState(false);
  const [videoPromptAreaDragState, setVideoPromptAreaDragState] = useState<{
    areaId: string;
    mode: VideoPromptAreaDragMode;
    startPoint: Point;
    startRect: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const [videoPromptBarDragState, setVideoPromptBarDragState] = useState<{
    barId: string;
    pointerOffset: Point;
  } | null>(null);

  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);

  const prevZoomToFitTrigger = useRef(zoomToFitTrigger);
  const prevZoomToSelectionTrigger = useRef(zoomToSelectionTrigger);
  const prevZoomInTrigger = useRef(zoomInTrigger);
  const prevZoomOutTrigger = useRef(zoomOutTrigger);
  const prevImagesLength = useRef(images.length);
  const previousMediaImagesRef = useRef<CanvasImage[]>([]);
  const playbackAttemptIdsRef = useRef<Record<string, number>>({});
  const scaleRef = useRef(scale);
  const panRef = useRef(pan);

  if (canvasInteractionGuardRef.current === null) {
    canvasInteractionGuardRef.current = createCanvasInteractionGuard(); // Keeps click-through state stable across Canvas renders.
  }

  const primarySelectedImageId = selectedImageIds[0] ?? null;
  const isAreaSelectionTool = tool === Tool.SELECTION || tool === Tool.FREE_SELECTION;
  const areaLabelFontSize = Math.max(11, Math.min(16, 11 / Math.max(scale, 0.7))); // Keep area titles readable even when the canvas is zoomed far out.
  const effectiveTool = isPresentationMode ? Tool.PAN : tool; // Presentation mode keeps the canvas navigable only.
  const effectiveCropMode = isPresentationMode ? null : cropMode; // Hidden crop handles should not remain interactive.
  const effectiveTransformMode = isPresentationMode ? null : transformMode; // Hidden transform handles should not remain interactive.
  const hasCanvasVisualContent = images.length > 0 || notes.some(note => note.anchor); // Panel-only notes have no canvas footprint.

  const getCanvasContext = () => canvasRef.current?.getContext('2d');

  const getNextPlaybackAttemptId = useCallback((mediaId: string) => {
    const nextAttemptId = (playbackAttemptIdsRef.current[mediaId] ?? 0) + 1; // Make older play failures harmless.
    playbackAttemptIdsRef.current[mediaId] = nextAttemptId;
    return nextAttemptId;
  }, []);

  const toggleMediaPlayback = useCallback((mediaId: string) => {
    const target = images.find(img => img.id === mediaId);
    if (!target) return;

    // Handle video playback
    if (isVideoImage(target)) {
      const videoElement = target.element;
      const nextIsPlaying = !target.isPlaying;
      videoElement.loop = true;
      videoElement.playsInline = true;

      if (nextIsPlaying) {
        const attemptId = getNextPlaybackAttemptId(mediaId);
        const playPromise = videoElement.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(err => {
            console.error('Failed to play video', err);
            if (playbackAttemptIdsRef.current[mediaId] === attemptId) {
              onMediaPlaybackRejected?.(mediaId); // Repair optimistic state if the browser blocks playback.
            }
          });
        }
      } else {
        getNextPlaybackAttemptId(mediaId);
        videoElement.pause();
      }

      const updatedImages = images.map(img => {
        if (img.id !== mediaId) return img;
        return { ...img, isPlaying: nextIsPlaying };
      });
      onImagesChange(updatedImages);
      onCommit({ images: updatedImages });
      return;
    }

    // Handle audio playback
    if (isAudioImage(target)) {
      const audioElement = target.audioElement;
      const nextIsPlaying = !target.isPlaying;
      audioElement.loop = true;

      if (nextIsPlaying) {
        const attemptId = getNextPlaybackAttemptId(mediaId);
        audioElement.play().catch(err => {
          console.error('Failed to play audio', err);
          if (playbackAttemptIdsRef.current[mediaId] === attemptId) {
            onMediaPlaybackRejected?.(mediaId); // Repair optimistic state if the browser blocks playback.
          }
        });
      } else {
        getNextPlaybackAttemptId(mediaId);
        audioElement.pause();
      }

      audioPlaybackTimesRef.current[mediaId] = audioElement.currentTime; // Persist the clicked playhead position once.
      const updatedImages = images.map(img => {
        if (img.id !== mediaId) return img;
        return { ...img, isPlaying: nextIsPlaying, currentPlaybackTime: audioElement.currentTime };
      });
      onImagesChange(updatedImages);
      onCommit({ images: updatedImages });
    }
  }, [getNextPlaybackAttemptId, images, isVideoImage, isAudioImage, onCommit, onImagesChange, onMediaPlaybackRejected]);

  const toggleImageFavorite = useCallback((imageId: string) => {
    const updatedImages = images.map(image => (
      image.id === imageId ? { ...image, isFavorite: image.isFavorite !== true } : image
    ));
    onImagesChange(updatedImages);
    onCommit({ images: updatedImages });
  }, [images, onCommit, onImagesChange]);

  const setPanSmoothly = useCallback((nextPan: Point) => {
    panRef.current = nextPan;
    setPan(nextPan);
    return nextPan;
  }, []);

  const {
    currentTool,
    hoveredVideoId,
    isPanning,
    isDragging,
    isMarqueeSelecting,
    isDraggingOver,
    brushPreviewPosition,
    marqueeRect,
    videoPromptAreaDraftRect,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleDoubleClick,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useCanvasInteractions({
    canvasRef,
    containerRef,
    tool: effectiveTool,
    canCreateVideoPromptAreas: !isPresentationMode && canCreateVideoPromptAreas,
    canUpdateSelection: !isPresentationMode,
    appMode,
    images,
    notes,
    videoPromptAreas,
    videoPromptAreaProfiles,
    paths,
    pan,
    scale,
    brushSize,
    eraserSize,
    brushColor,
    selectedImageIds,
    tailSelectionEnabled,
    cropMode: effectiveCropMode,
    transformMode: effectiveTransformMode,
    onImagesChange,
    onNotesChange,
    onVideoPromptAreasChange,
    onPathsChange,
    onCommit,
    onImageSelect,
    onSelectionReplace,
    onVideoPromptAreaSelect,
    onFilesDrop: isPresentationMode ? () => {} : onFilesDrop,
    onAnchorNoteCreate: isPresentationMode ? () => {} : onAnchorNoteCreate,
    onAnchorClick: isPresentationMode ? () => {} : onAnchorClick,
    onCropRectChange,
    setPanSmoothly,
  });

  const applyZoom = useCallback((multiplier: number, anchor?: { x: number; y: number }) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const currentScale = scaleRef.current;
    const currentPan = panRef.current;
    const nextScale = currentScale * multiplier;
    const clampedScale = Math.max(MIN_SCALE, Math.min(nextScale, MAX_SCALE));
    const scaleRatio = currentScale === 0 ? 1 : clampedScale / currentScale;
    const anchorX = anchor?.x ?? container.clientWidth / 2;
    const anchorY = anchor?.y ?? container.clientHeight / 2;

    const updatedPan = {
      x: anchorX - (anchorX - currentPan.x) * scaleRatio,
      y: anchorY - (anchorY - currentPan.y) * scaleRatio,
    };

    scaleRef.current = clampedScale;
    setScale(clampedScale);
    setPanSmoothly(updatedPan);
  }, [setPanSmoothly]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = getCanvasContext();
    if (!canvas || !ctx) return;

    drawCanvas({
      canvas,
      ctx,
      pan,
      scale,
      images,
      notes,
      paths,
      selectedImageIds,
      referenceImageIds,
      krea2StyleReferenceImageIds,
      referenceVideoIds,
      referenceAudioIds,
      referenceImageOrderLabels,
      disabledMediaIds,
      elementImageIds,
      elementImageOrderLabels,
      videoLastFrameImageId,
      tailSelectionEnabled,
      sourceVideoId,
      isKlingO3VideoInputMode,
      isKlingO3ReferenceMode,
      isSeedance15FflfMode,
      isKlingV3ControlVideoInputMode,
      isVeo31ExtendMode,
      isWanAnimateVideoInputMode,
      isWan27VideoMode,
      isKrea2StyleReferenceMode,
      showMetadataOverlay,
      cropMode: effectiveCropMode,
      transformMode: effectiveTransformMode,
      renderCache: renderCacheRef.current,
      audioPlaybackTimes: audioPlaybackTimesRef.current,
      isPresentationMode,
    });
  }, [disabledMediaIds, effectiveCropMode, effectiveTransformMode, elementImageIds, elementImageOrderLabels, images, isKlingO3ReferenceMode, isPresentationMode, isSeedance15FflfMode, isKlingO3VideoInputMode, isKlingV3ControlVideoInputMode, isVeo31ExtendMode, isWanAnimateVideoInputMode, isWan27VideoMode, isKrea2StyleReferenceMode, krea2StyleReferenceImageIds, notes, pan, paths, referenceAudioIds, referenceImageIds, referenceImageOrderLabels, referenceVideoIds, scale, selectedImageIds, showMetadataOverlay, sourceVideoId, tailSelectionEnabled, videoLastFrameImageId]);

  const getBoundsForItems = useCallback((targetImages: CanvasImage[], targetNotes: CanvasNote[]) => {
    if (targetImages.length === 0 && targetNotes.length === 0) {
      return null;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    targetImages.forEach(img => {
      const bounds = getImageBounds(img);
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    });

    // Pins are screen-constant, so their world footprint depends on the (yet unknown)
    // final zoom; treat them as anchor points and let zoomToBounds' padding frame them.
    targetNotes.forEach(note => {
      if (!note.anchor) return; // Panel-only notes have no canvas footprint.
      minX = Math.min(minX, note.anchor.x);
      minY = Math.min(minY, note.anchor.y);
      maxX = Math.max(maxX, note.anchor.x);
      maxY = Math.max(maxY, note.anchor.y);
    });

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return null;
    }

    return { minX, minY, maxX, maxY };
  }, [getImageBounds]);

  const zoomToBounds = useCallback((bounds: { minX: number; minY: number; maxX: number; maxY: number; }) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const bboxWidth = bounds.maxX - bounds.minX;
    const bboxHeight = bounds.maxY - bounds.minY;

    const canvasWidth = canvas.clientWidth;
    const canvasHeight = canvas.clientHeight;

    if (canvasWidth === 0 || canvasHeight === 0) {
      return;
    }

    if (bboxWidth === 0 || bboxHeight === 0) {
      // Degenerate bounds (a single pin, or collinear pins): center them at the current
      // zoom instead of fitting a zero-area box.
      setPanSmoothly({
        x: canvasWidth / 2 - (bounds.minX + bboxWidth / 2) * scaleRef.current,
        y: canvasHeight / 2 - (bounds.minY + bboxHeight / 2) * scaleRef.current,
      });
      return;
    }

    const padding = 0.9; // 10% padding
    const scaleX = canvasWidth / bboxWidth;
    const scaleY = canvasHeight / bboxHeight;
    const newScale = Math.min(scaleX, scaleY) * padding;
    const clampedScale = Math.max(MIN_SCALE, Math.min(newScale, MAX_SCALE));

    const bboxCenterX = bounds.minX + bboxWidth / 2;
    const bboxCenterY = bounds.minY + bboxHeight / 2;

    const newPanX = canvasWidth / 2 - bboxCenterX * clampedScale;
    const newPanY = canvasHeight / 2 - bboxCenterY * clampedScale;

    scaleRef.current = clampedScale;
    setScale(clampedScale);
    setPanSmoothly({ x: newPanX, y: newPanY });
  }, [setPanSmoothly]);

  const zoomToFit = useCallback(() => {
    const bounds = getBoundsForItems(images, notes);
    if (!bounds) {
      return;
    }
    zoomToBounds(bounds);
  }, [getBoundsForItems, images, notes, zoomToBounds]);

  const zoomToSelection = useCallback(() => {
    if (selectedImageIds.length === 0) {
      return;
    }

    const selectedImageSet = new Set(selectedImageIds);
    const selectedImages = images.filter(img => selectedImageSet.has(img.id));
    const bounds = getBoundsForItems(selectedImages, []);
    if (!bounds) {
      return;
    }
    zoomToBounds(bounds);
  }, [getBoundsForItems, images, selectedImageIds, zoomToBounds]);

  useEffect(() => {
    if (zoomToFitTrigger > prevZoomToFitTrigger.current) {
      zoomToFit();
    }
    prevZoomToFitTrigger.current = zoomToFitTrigger;
  }, [zoomToFitTrigger, zoomToFit]);

  useEffect(() => {
    if (zoomToSelectionTrigger > prevZoomToSelectionTrigger.current) {
      zoomToSelection();
    }
    prevZoomToSelectionTrigger.current = zoomToSelectionTrigger;
  }, [zoomToSelectionTrigger, zoomToSelection]);

  useEffect(() => {
    if (zoomInTrigger > prevZoomInTrigger.current) {
      applyZoom(KEYBOARD_ZOOM_MULTIPLIER);
    }
    prevZoomInTrigger.current = zoomInTrigger;
  }, [zoomInTrigger, applyZoom]);

  useEffect(() => {
    if (zoomOutTrigger > prevZoomOutTrigger.current) {
      applyZoom(KEYBOARD_ZOOM_OUT_MULTIPLIER);
    }
    prevZoomOutTrigger.current = zoomOutTrigger;
  }, [zoomOutTrigger, applyZoom]);

  const prevPanToAnchorToken = useRef(0);
  useEffect(() => {
    if (!panToAnchorRequest || panToAnchorRequest.token === prevPanToAnchorToken.current) {
      return;
    }
    prevPanToAnchorToken.current = panToAnchorRequest.token;
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const currentScale = scaleRef.current; // Center the anchor without changing zoom.
    setPanSmoothly({
      x: canvas.clientWidth / 2 - panToAnchorRequest.x * currentScale,
      y: canvas.clientHeight / 2 - panToAnchorRequest.y * currentScale,
    });
  }, [panToAnchorRequest, setPanSmoothly]);

  useEffect(() => {
    scaleRef.current = scale;
    onScaleChange?.(scale);
  }, [onScaleChange, scale]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      const rect = container.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      const multiplier = event.deltaY < 0 ? WHEEL_ZOOM_MULTIPLIER : 1 / WHEEL_ZOOM_MULTIPLIER;
      applyZoom(multiplier, { x: mouseX, y: mouseY });
    };

    // Attach a non-passive wheel listener so we can prevent the browser's default scroll.
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [applyZoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeCanvas = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      canvas.width = width;
      canvas.height = height;
      draw();
    };

    resizeCanvas();

    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(resizeCanvas)
      : null;
    observer?.observe(container);

    window.addEventListener('resize', resizeCanvas);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [draw]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const currentImageIds = new Set(images.map(img => img.id)); // Track media that still exists on the canvas.
    previousMediaImagesRef.current.forEach(img => {
      if (!currentImageIds.has(img.id)) {
        stopCanvasMediaPlayback(img); // Stop detached media even when removal bypasses delete.
      }
    });
    previousMediaImagesRef.current = images.filter(img => img.mediaType === 'video' || img.mediaType === 'audio');
  }, [images]);

  useEffect(() => () => {
    previousMediaImagesRef.current.forEach(stopCanvasMediaPlayback); // Stop playback when the canvas unmounts.
  }, []);

  useEffect(() => {
    let isCurrentSync = true; // Ignore stale autoplay failures after history moves again.
    images.forEach(image => {
      syncCanvasMediaElementPlayback(image, failedImage => {
        if (isCurrentSync) {
          onMediaPlaybackRejected?.(failedImage.id); // Keep restored history state honest when autoplay fails.
        }
      });
    }); // Reconcile restored history state with paused DOM media.
    return () => {
      isCurrentSync = false;
    };
  }, [images, onMediaPlaybackRejected]);

  useCanvasPlaybackLoop({ images, draw, audioPlaybackTimesRef });

  useEffect(() => {
    images.forEach(img => {
      if (!isVideoImage(img)) {
        return;
      }
      const video = img.element;
      const shouldUnmute = hoveredVideoId === img.id && img.isPlaying && img.hasAudio !== false;
      video.muted = !shouldUnmute;
      video.volume = shouldUnmute ? 1 : 0;
    });
  }, [hoveredVideoId, images, isVideoImage]);

  // Auto-fit and center images when first dropped onto an empty canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Detect when images are first added to an empty canvas (works for single or multiple images)
    const isFirstDrop = images.length > 0 && prevImagesLength.current === 0;

    // Cap at 80% so users can see the full image with breathing room.
    if (isFirstDrop) {
      const MAX_INITIAL_ZOOM = 0.8;
      const bounds = getBoundsForItems(images, []);

      if (bounds) {
        const bboxWidth = bounds.maxX - bounds.minX;
        const bboxHeight = bounds.maxY - bounds.minY;
        const canvasWidth = canvas.clientWidth;
        const canvasHeight = canvas.clientHeight;

        // Calculate scale to fit all images in view, with 10% padding around edges
        if (bboxWidth > 0 && bboxHeight > 0 && canvasWidth > 0 && canvasHeight > 0) {
          const padding = 0.9;
          const scaleX = canvasWidth / bboxWidth;
          const scaleY = canvasHeight / bboxHeight;
          const fitScale = Math.min(scaleX, scaleY) * padding; // Apply the 80% max zoom cap
          const newScale = Math.min(fitScale, MAX_INITIAL_ZOOM);
          const clampedScale = Math.max(MIN_SCALE, Math.min(newScale, MAX_SCALE));

          // Center the bounding box of all images on the canvas
          const bboxCenterX = bounds.minX + bboxWidth / 2;
          const bboxCenterY = bounds.minY + bboxHeight / 2;
          const newPanX = canvasWidth / 2 - bboxCenterX * clampedScale;
          const newPanY = canvasHeight / 2 - bboxCenterY * clampedScale;

          scaleRef.current = clampedScale;
          setScale(clampedScale);
          setPanSmoothly({ x: newPanX, y: newPanY });
        }
      }
    }

    prevImagesLength.current = images.length;
  }, [images, getBoundsForItems, setPanSmoothly]);

  useEffect(() => {
    if (containerRef.current) {
      let cursor;
      if (effectiveCropMode) {
        cursor = 'crosshair'; // Default for crop mode
      } else if (effectiveTransformMode) {
        cursor = 'default'; // Default for transform mode, will be updated on mouse move
      } else if (isMarqueeSelecting) {
        cursor = 'crosshair';
      } else {
        switch (currentTool) {
          case Tool.PAN: cursor = isPanning ? 'grabbing' : 'grab'; break;
          case Tool.FREE_SELECTION: cursor = isPanning || isDragging ? 'grabbing' : 'grab'; break;
          case Tool.NOTE: cursor = 'cell'; break;
          case Tool.BRUSH:
          case Tool.ERASE:
          case Tool.VIDEO_PROMPT_AREA:
            cursor = 'crosshair'; break;
          case Tool.SELECTION: cursor = isDragging ? 'grabbing' : 'default'; break;
          default: cursor = 'default';
        }
      }
      containerRef.current.style.cursor = cursor;
    }
  }, [currentTool, effectiveCropMode, effectiveTransformMode, isPanning, isDragging, isMarqueeSelecting]);

  const handleMouseDownCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    canvasInteractionGuardRef.current?.shouldIgnoreMouseDown(e.nativeEvent); // Record the capture decision for the same native event.
  }, []);

  const handleMouseDownWithInteractionGuard = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (canvasInteractionGuardRef.current?.shouldIgnoreMouseDown(e.nativeEvent)) { // Reuses the capture decision for the same native event.
      return;
    }
    handleMouseDown(e);
  }, [handleMouseDown]);

  const handleDoubleClickWithInteractionGuard = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (canvasInteractionGuardRef.current?.shouldIgnoreDoubleClick(e.nativeEvent)) {
      return; // Completes suppression of a picker click retargeted onto Canvas.
    }
    handleDoubleClick(e);
  }, [handleDoubleClick]);

  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (currentTool !== Tool.FREE_SELECTION) {
      return;
    }
    if (isCanvasInteractiveTarget(event.target)) {
      return;
    }
    event.preventDefault(); // Keep free-select right-click deselect from opening the browser menu.
  }, [currentTool]);

  const selectedVideoPromptArea = useMemo(() => {
    if (!selectedVideoPromptAreaId || selectedImageIds.length > 0) {
      return null;
    }
    return videoPromptAreas.find(area => area.id === selectedVideoPromptAreaId) ?? null;
  }, [selectedImageIds.length, selectedVideoPromptAreaId, videoPromptAreas]);

  useEffect(() => {
    setIsVideoPromptAreaColorPickerOpen(false);
  }, [selectedVideoPromptArea?.id]);

  useEffect(() => {
    if (!isVideoPromptAreaColorPickerOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const container = videoPromptAreaColorPickerRef.current;
      const target = event.target as Node | null;
      if (!container || !target) {
        return;
      }
      if (!container.contains(target)) {
        setIsVideoPromptAreaColorPickerOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isVideoPromptAreaColorPickerOpen]);
  const selectedImage = useMemo(() => {
    if (selectedImageIds.length !== 1) return null;
    const targetId = primarySelectedImageId;
    if (!targetId) return null;
    return images.find(img => img.id === targetId) || null;
  }, [images, primarySelectedImageId, selectedImageIds.length]);
  const selectedImageIsVideo = selectedImage?.mediaType === 'video';
  const selectedImageIsAudio = selectedImage?.mediaType === 'audio';
  const selectedVideoIsPlaying = selectedImageIsVideo && selectedImage?.isPlaying;
  const selectedAudioIsPlaying = selectedImageIsAudio && selectedImage?.isPlaying;
  const selectedMediaIsPlaying = selectedVideoIsPlaying || selectedAudioIsPlaying;
  const selectedImagePrompt = getCanvasImagePrompt(selectedImage);
  const selectedImageHasGeneration = Boolean(selectedImage?.metadata?.generation);
  const imageBeingCropped = useMemo(() => cropMode ? images.find(img => img.id === cropMode.imageId) : null, [images, cropMode]);
  const imageBeingTransformed = useMemo(() => transformMode ? images.find(img => img.id === transformMode.imageId) : null, [images, transformMode]);
  const selectedImageBounds = useMemo(() => selectedImage ? getImageBounds(selectedImage) : null, [getImageBounds, selectedImage]);
  const krea2StyleReferenceControls = useMemo(() => {
    if (!isKrea2StyleReferenceMode) {
      return [];
    }
    const styleReferenceIds = krea2StyleReferenceImageIds ?? referenceImageIds; // Use submitted Krea refs when provided.
    return styleReferenceIds
      .slice(0, 10)
      .map(id => {
        const image = images.find(img => img.id === id && img.mediaType === 'image');
        if (!image) {
          return null;
        }
        return { id, bounds: getImageBounds(image), value: krea2StyleReferenceStrengths[id] ?? 1 };
      })
      .filter((control): control is { id: string; bounds: ReturnType<typeof getImageBounds>; value: number } => Boolean(control));
  }, [getImageBounds, images, isKrea2StyleReferenceMode, krea2StyleReferenceImageIds, krea2StyleReferenceStrengths, referenceImageIds]);
  const croppingBounds = useMemo(() => imageBeingCropped ? getImageBounds(imageBeingCropped) : null, [getImageBounds, imageBeingCropped]);
  const transformingBounds = useMemo(() => imageBeingTransformed ? getImageBounds(imageBeingTransformed) : null, [getImageBounds, imageBeingTransformed]);

  const gridSpacing = useMemo(() => {
    const size = GRID_BASE_SIZE * GRID_VISUAL_SCALE * Math.max(scale * 0.25, MIN_SCALE); // Shrink the grid layer without touching canvas coordinates.
    return Math.max(GRID_MIN_SIZE, Math.min(GRID_MAX_SIZE, size));
  }, [scale]);

  const dotRadius = useMemo(() => {
    const scaled = DOT_BASE_SIZE * GRID_VISUAL_SCALE * Math.sqrt(scale); // Keep dot size in step with the tighter grid spacing.
    return Math.max(DOT_MIN_SIZE, Math.min(DOT_MAX_SIZE, scaled));
  }, [scale]);

  const brushPreviewDiameter = currentTool === Tool.ERASE ? eraserSize : brushSize;
  const shouldRenderBrushPreview = !isPresentationMode && brushPreviewPosition && (currentTool === Tool.BRUSH || currentTool === Tool.ERASE) && brushPreviewDiameter > 0;

  const backgroundImage = useMemo(
    () => `radial-gradient(circle, rgba(255,255,255,0.2) ${dotRadius}px, transparent ${dotRadius}px)`,
    [dotRadius],
  );

  const [isCapturingFrame, setIsCapturingFrame] = useState(false);

  const captureVideoFrame = useCallback(async (videoId: string) => {
    const target = images.find(img => img.id === videoId && isVideoImage(img));
    if (!target) {
      return;
    }

    const videoElement = target.element as HTMLVideoElement;
    const captureWidth = videoElement.videoWidth || target.naturalWidth || target.width || 1;
    const captureHeight = videoElement.videoHeight || target.naturalHeight || target.height || 1;

    const canvas = document.createElement('canvas');
    canvas.width = captureWidth;
    canvas.height = captureHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      onError?.('Could not capture frame: no canvas context available.');
      return;
    }
    ctx.drawImage(videoElement, 0, 0, captureWidth, captureHeight);

    setIsCapturingFrame(true);
    try {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) {
        throw new Error('Failed to capture frame.');
      }
      const capturedImage = await loadImageFromBlob(blob);
      const { naturalWidth, naturalHeight } = getNaturalSize(capturedImage);
      const fileName = `video-frame-${Date.now()}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      const displayWidth = target.width;
      const displayHeight = target.height;
      const margin = 20;
      const newImage: CanvasImage = {
        id: crypto.randomUUID(),
        element: capturedImage,
        mediaType: 'image',
        x: target.x + target.width + margin,
        y: target.y,
        width: displayWidth,
        height: displayHeight,
        rotation: 0,
        naturalWidth: naturalWidth || displayWidth,
        naturalHeight: naturalHeight || displayHeight,
        file,
        isPlaying: false,
        hasAudio: false,
        metadata: {
          source: 'derived',
          prompt: target.metadata?.prompt,
          generation: target.metadata?.generation,
        },
      };

      onImagesChange([...images, newImage]);
      onImageSelect(newImage.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to capture video frame.';
      onError?.(message);
    } finally {
      setIsCapturingFrame(false);
    }
  }, [images, onError, onImageSelect, onImagesChange]);

  const clampVideoPromptAreaRect = useCallback((rect: { x: number; y: number; width: number; height: number }) => ({
    x: rect.x,
    y: rect.y,
    width: Math.max(280, rect.width),
    height: Math.max(220, rect.height),
  }), []);

  const getWorldPointFromClientPoint = useCallback((clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - pan.x) / scale,
      y: (clientY - rect.top - pan.y) / scale,
    };
  }, [pan.x, pan.y, scale]);

  const handleVideoPromptAreaPointerDown = useCallback((areaId: string, mode: VideoPromptAreaDragMode) => (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isAreaSelectionTool) {
      return;
    }
    const targetArea = videoPromptAreas.find(area => area.id === areaId);
    if (!targetArea) {
      return;
    }
    onVideoPromptAreaSelect(areaId);
    setVideoPromptAreaDragState({
      areaId,
      mode,
      startPoint: getWorldPointFromClientPoint(event.clientX, event.clientY),
      startRect: { x: targetArea.x, y: targetArea.y, width: targetArea.width, height: targetArea.height },
    });
  }, [getWorldPointFromClientPoint, isAreaSelectionTool, onVideoPromptAreaSelect, videoPromptAreas]);

  const getDraggedVideoPromptAreaRect = useCallback((dragState: NonNullable<typeof videoPromptAreaDragState>, dx: number, dy: number) => {
    if (dragState.mode === 'move') {
      return {
        x: dragState.startRect.x + dx,
        y: dragState.startRect.y + dy,
        width: dragState.startRect.width,
        height: dragState.startRect.height,
      };
    }

    if (dragState.mode === 'resize-tl') {
      return clampVideoPromptAreaRect({
        x: dragState.startRect.x + dx,
        y: dragState.startRect.y + dy,
        width: dragState.startRect.width - dx,
        height: dragState.startRect.height - dy,
      });
    }

    if (dragState.mode === 'resize-tr') {
      return clampVideoPromptAreaRect({
        x: dragState.startRect.x,
        y: dragState.startRect.y + dy,
        width: dragState.startRect.width + dx,
        height: dragState.startRect.height - dy,
      });
    }

    if (dragState.mode === 'resize-bl') {
      return clampVideoPromptAreaRect({
        x: dragState.startRect.x + dx,
        y: dragState.startRect.y,
        width: dragState.startRect.width - dx,
        height: dragState.startRect.height + dy,
      });
    }

    return clampVideoPromptAreaRect({
      x: dragState.startRect.x,
      y: dragState.startRect.y,
      width: dragState.startRect.width + dx,
      height: dragState.startRect.height + dy,
    });
  }, [clampVideoPromptAreaRect]);

  const handleVideoPromptBarPointerDown = useCallback((barId: string) => (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const targetBar = videoPromptBars.find(bar => bar.id === barId);
    if (!targetBar) {
      return;
    }
    const pointerPoint = getWorldPointFromClientPoint(event.clientX, event.clientY);
    const dragOriginRect = event.currentTarget.parentElement?.getBoundingClientRect();
    const dragOriginPoint = dragOriginRect
      ? getWorldPointFromClientPoint(dragOriginRect.left, dragOriginRect.top)
      : { x: targetBar.x, y: targetBar.y }; // Fall back to the stored rect when the DOM shell bounds are unavailable.
    setVideoPromptBarDragState({
      barId,
      pointerOffset: {
        x: pointerPoint.x - dragOriginPoint.x,
        y: pointerPoint.y - dragOriginPoint.y,
      },
    });
  }, [getWorldPointFromClientPoint, videoPromptBars]);

  const handleDeleteVideoPromptBar = useCallback((barId: string) => {
    const nextAreas = videoPromptAreas.map(area => (
      area.promptBarId === barId ? { ...area, promptBarId: null } : area
    ));
    const nextBars = videoPromptBars.filter(bar => bar.id !== barId);
    onVideoPromptAreasChange(nextAreas);
    onVideoPromptBarsChange(nextBars);
    onCommit({ videoPromptAreas: nextAreas, videoPromptBars: nextBars });
  }, [onCommit, onVideoPromptAreasChange, onVideoPromptBarsChange, videoPromptAreas, videoPromptBars]);

  const finishVideoPromptBarDrag = useCallback((barId: string, nextBars: CanvasVideoPromptBar[]) => {
    const draggedBar = nextBars.find(bar => bar.id === barId);
    if (!draggedBar) {
      return;
    }
    const barCenter = { x: draggedBar.x + draggedBar.width / 2, y: draggedBar.y + draggedBar.height / 2 };
    const targetArea = [...videoPromptAreas].reverse().find(area => (
      barCenter.x >= area.x
      && barCenter.x <= area.x + area.width
      && barCenter.y >= area.y
      && barCenter.y <= area.y + area.height
    ));

    let nextVideoPromptAreas = videoPromptAreas.map(area => (
      area.promptBarId === barId ? { ...area, promptBarId: null } : area
    ));
    let committedBars = nextBars;

    if (targetArea) {
      const occupiedArea = nextVideoPromptAreas.find(area => area.id === targetArea.id);
      if (occupiedArea?.promptBarId && occupiedArea.promptBarId !== barId) {
        onError?.('Only one video prompt bar is allowed in each video prompt area.');
      } else {
        const snappedRect = getAreaPromptBarRect(targetArea);
        committedBars = nextBars.map(bar => (
          bar.id === barId
            ? { ...bar, assignedAreaId: targetArea.id, ...snappedRect }
            : bar
        ));
        nextVideoPromptAreas = nextVideoPromptAreas.map(area => (
          area.id === targetArea.id ? { ...area, promptBarId: barId } : area
        ));
      }
    } else {
      committedBars = nextBars.map(bar => (
        bar.id === barId ? { ...bar, assignedAreaId: null } : bar
      ));
    }

    onVideoPromptAreasChange(nextVideoPromptAreas);
    onVideoPromptBarsChange(committedBars);
    onCommit({ videoPromptAreas: nextVideoPromptAreas, videoPromptBars: committedBars });
  }, [onCommit, onError, onVideoPromptAreasChange, onVideoPromptBarsChange, videoPromptAreas]);

  const handleMouseMoveWithOverlays = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (videoPromptAreaDragState) {
      const point = getWorldPointFromClientPoint(event.clientX, event.clientY);
      const dx = point.x - videoPromptAreaDragState.startPoint.x;
      const dy = point.y - videoPromptAreaDragState.startPoint.y;
      const nextAreas = videoPromptAreas.map(area => {
        if (area.id !== videoPromptAreaDragState.areaId) {
          return area;
        }
        return { ...area, ...getDraggedVideoPromptAreaRect(videoPromptAreaDragState, dx, dy) };
      });
      const nextBars = videoPromptBars.map(bar => {
        const owningArea = nextAreas.find(area => area.id === bar.assignedAreaId);
        return owningArea ? { ...bar, ...getAreaPromptBarRect(owningArea) } : bar;
      });
      onVideoPromptAreasChange(nextAreas);
      onVideoPromptBarsChange(nextBars);
      return;
    }

    if (videoPromptBarDragState) {
      const pointerPoint = getWorldPointFromClientPoint(event.clientX, event.clientY);
      const nextBars = videoPromptBars.map(bar => (
        bar.id === videoPromptBarDragState.barId
          ? {
            ...bar,
            assignedAreaId: null,
            x: pointerPoint.x - videoPromptBarDragState.pointerOffset.x,
            y: pointerPoint.y - videoPromptBarDragState.pointerOffset.y,
          }
          : bar
      ));
      onVideoPromptBarsChange(nextBars);
      return;
    }

    handleMouseMove(event);
  }, [getDraggedVideoPromptAreaRect, getWorldPointFromClientPoint, handleMouseMove, onVideoPromptAreasChange, onVideoPromptBarsChange, videoPromptAreaDragState, videoPromptAreas, videoPromptBarDragState, videoPromptBars]);

  const handleMouseUpWithOverlays = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (videoPromptAreaDragState) {
      const wasAreaRectChanged = videoPromptAreas.some(area => (
        area.id === videoPromptAreaDragState.areaId
        && (
          area.x !== videoPromptAreaDragState.startRect.x
          || area.y !== videoPromptAreaDragState.startRect.y
          || area.width !== videoPromptAreaDragState.startRect.width
          || area.height !== videoPromptAreaDragState.startRect.height
        )
      ));
      if (!wasAreaRectChanged) {
        setVideoPromptAreaDragState(null);
        return;
      }
      const resizedAreas = videoPromptAreas.map(area => (
        area.id === videoPromptAreaDragState.areaId ? { ...area, ...clampVideoPromptAreaRect(area) } : area
      ));
      const nextAreas = syncVideoPromptAreaMembership(resizedAreas, images);
      const nextBars = videoPromptBars.map(bar => {
        const owningArea = nextAreas.find(area => area.id === bar.assignedAreaId);
        return owningArea ? { ...bar, ...getAreaPromptBarRect(owningArea) } : bar;
      });
      onVideoPromptAreasChange(nextAreas);
      onVideoPromptBarsChange(nextBars);
      onCommit({ videoPromptAreas: nextAreas, videoPromptBars: nextBars });
      setVideoPromptAreaDragState(null);
      return;
    }

    if (videoPromptBarDragState) {
      finishVideoPromptBarDrag(videoPromptBarDragState.barId, videoPromptBars);
      setVideoPromptBarDragState(null);
      return;
    }

    handleMouseUp(event);
  }, [clampVideoPromptAreaRect, finishVideoPromptBarDrag, handleMouseUp, onCommit, onVideoPromptAreasChange, onVideoPromptBarsChange, videoPromptAreaDragState, videoPromptAreas, videoPromptBarDragState, videoPromptBars]);

  const embeddedPromptBars = useMemo(() => (
    videoPromptBars.map(bar => {
      const assignedArea = bar.assignedAreaId
        ? videoPromptAreas.find(area => area.id === bar.assignedAreaId) ?? null
        : null;
      return { bar, assignedArea };
    })
  ), [videoPromptAreas, videoPromptBars]);

  /* eslint-disable jsx-a11y/no-noninteractive-tabindex */
  return (
    /* Canvas needs focus for keyboard shortcuts (ESC deselect) */
    <div
      ref={containerRef}
      className="relative z-0 w-full h-full min-h-0 bg-black overflow-hidden outline-none focus:outline-none"
      tabIndex={0}
      data-canvas-root="true"
      style={{
        backgroundImage,
        backgroundSize: `${gridSpacing}px ${gridSpacing}px`,
        // Sync the dot grid background position with the canvas pan offset.
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
      onMouseDownCapture={handleMouseDownCapture}
      onMouseDown={handleMouseDownWithInteractionGuard}
      onMouseMove={handleMouseMoveWithOverlays}
      onMouseUp={handleMouseUpWithOverlays}
      onMouseLeave={handleMouseUpWithOverlays}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClickWithInteractionGuard}
      onKeyDown={(e) => {
        if (!isPresentationMode && e.key === 'Escape') {
          onImageSelect(null);
          onVideoPromptAreaSelect(null);
        }
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {!isPresentationMode && videoPromptAreas.map(area => (
        <div
          key={area.id}
          className="pointer-events-none absolute rounded-2xl border-[3px] bg-[#030303] shadow-[0_18px_50px_rgba(0,0,0,0.3)]"
          style={{
            left: `${area.x * scale + pan.x}px`,
            top: `${area.y * scale + pan.y}px`,
            width: `${area.width * scale}px`,
            height: `${area.height * scale}px`,
            borderColor: area.borderColor ?? DEFAULT_VIDEO_PROMPT_AREA_BORDER_COLOR,
            zIndex: 1,
          }}
        >
          <div
            className={`pointer-events-none absolute inset-[-6px] rounded-[1.35rem] border transition-colors ${!isPresentationMode && selectedVideoPromptAreaId === area.id ? 'border-sky-300/70' : 'border-transparent'}`}
          />
          <div className={`pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ${!isPresentationMode && selectedVideoPromptAreaId === area.id ? 'ring-sky-300/45' : 'ring-white/8'}`} />
          {!isPresentationMode && !area.promptBarId && area.orderedMediaIds.length === 0 && (
            <div className="pointer-events-none absolute inset-x-6 top-20 rounded-xl border border-dashed border-white/15 bg-black/10 px-4 py-5 text-sm text-gray-400">
              Drag a video prompt bar here to activate this area.
            </div>
          )}
        </div>
      ))}
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full z-10" />
      {!isPresentationMode && videoPromptAreas.map(area => {
        const screenLeft = area.x * scale + pan.x;
        const screenTop = area.y * scale + pan.y;
        const screenWidth = area.width * scale;
        const screenHeight = area.height * scale;

        return (
          <div
            key={`${area.id}-overlay`}
            className="pointer-events-none absolute"
            style={{
              left: `${screenLeft}px`,
              top: `${screenTop}px`,
              width: `${screenWidth}px`,
              height: `${screenHeight}px`,
              zIndex: 22,
            }}
          >
            <div className="absolute left-3 top-3 flex items-center gap-2">
              <button
                type="button"
                onMouseDown={handleVideoPromptAreaPointerDown(area.id, 'move')}
                className={`pointer-events-auto rounded-md px-3 py-1 font-semibold uppercase tracking-[0.12em] ${selectedVideoPromptAreaId === area.id ? 'bg-sky-500/25 text-sky-100' : 'bg-black/55 text-gray-200'}`}
                style={{ fontSize: `${areaLabelFontSize}px` }}
              >
                {area.label}
              </button>
            </div>
            {selectedVideoPromptAreaId === area.id && isAreaSelectionTool && (
              <>
                <button
                  type="button"
                  onMouseDown={handleVideoPromptAreaPointerDown(area.id, 'resize-tl')}
                  className="pointer-events-auto absolute -left-2 -top-2 h-4 w-4 rounded-sm border border-sky-300/80 bg-sky-400/25"
                  aria-label={`Resize top left of ${area.label}`}
                />
                <button
                  type="button"
                  onMouseDown={handleVideoPromptAreaPointerDown(area.id, 'resize-tr')}
                  className="pointer-events-auto absolute -right-2 -top-2 h-4 w-4 rounded-sm border border-sky-300/80 bg-sky-400/25"
                  aria-label={`Resize top right of ${area.label}`}
                />
                <button
                  type="button"
                  onMouseDown={handleVideoPromptAreaPointerDown(area.id, 'resize-bl')}
                  className="pointer-events-auto absolute -bottom-2 -left-2 h-4 w-4 rounded-sm border border-sky-300/80 bg-sky-400/25"
                  aria-label={`Resize bottom left of ${area.label}`}
                />
                <button
                  type="button"
                  onMouseDown={handleVideoPromptAreaPointerDown(area.id, 'resize-br')}
                  className="pointer-events-auto absolute -bottom-2 -right-2 h-4 w-4 rounded-sm border border-sky-300/80 bg-sky-400/25"
                  aria-label={`Resize bottom right of ${area.label}`}
                />
              </>
            )}
          </div>
        );
      })}
      {!isPresentationMode && embeddedPromptBars.map(({ bar, assignedArea }) => {
        const barMembership = bar.assignedAreaId ? videoPromptAreaMemberships[bar.assignedAreaId] : null;
        const isAssigned = Boolean(assignedArea);
        const assignedAreaScreenWidth = assignedArea ? assignedArea.width * scale : undefined;
        const embeddedPromptBarSizeMode = isAssigned ? getEmbeddedVideoPromptBarSizeMode(scale, assignedAreaScreenWidth) : 'full';
        const renderedBarWidth = isAssigned && embeddedPromptBarSizeMode === 'mini'
          ? getEmbeddedVideoPromptBarRenderWidth(embeddedPromptBarSizeMode, assignedAreaScreenWidth)
          : bar.width;
        const embeddedPromptBarAreaInset = embeddedPromptBarSizeMode === 'mini' ? 24 : 48; // Mini shells use a tighter inset so the compact affordance stays readable.
        const maxInlineWidthPx = isAssigned && typeof assignedAreaScreenWidth === 'number'
          ? Math.max(renderedBarWidth, Math.max(0, assignedAreaScreenWidth - embeddedPromptBarAreaInset))
          : undefined; // Wide areas can widen the shell, but narrow areas should keep the legacy readable width.
        const barVisualScale = isAssigned && embeddedPromptBarSizeMode === 'full'
          ? getVideoPromptBarVisualScale(scale, bar.width)
          : getVideoPromptBarVisualScale(scale, renderedBarWidth, assignedAreaScreenWidth);
        const screenRect = isAssigned && assignedArea
          ? {
            centerX: assignedArea.x * scale + pan.x + (assignedArea.width * scale) / 2,
            bottomAnchorY: assignedArea.y * scale + pan.y + assignedArea.height * scale - EMBEDDED_VIDEO_PROMPT_BAR_SCREEN_BOTTOM_PADDING, // The visual shell should sit inside the area instead of riding its border.
          }
          : {
            left: bar.x * scale + pan.x,
            top: bar.y * scale + pan.y,
            width: bar.width,
            height: bar.height,
          };
        const selectedEmbeddedModelId = bar.modelId ?? SEEDANCE_2_VIDEO_MODEL_ID; // Legacy bars default to Volcengine Seedance 2.
        const selectedEmbeddedModelLabel = embeddedVideoPromptBarModelOptions.find(option => option.value === selectedEmbeddedModelId)?.label ?? 'Seedance 2';
        const embeddedMediaCount = barMembership
          ? Number(Boolean(barMembership.primaryImageId))
            + barMembership.acceptedImageIds.length
            + barMembership.acceptedVideoIds.length
            + barMembership.acceptedAudioIds.length
            + (barMembership.elementImageIds?.length ?? 0)
            + Number(Boolean(barMembership.tailImageId))
            + Number(Boolean(barMembership.sourceVideoId))
            + Number(Boolean(barMembership.sourceAudioId))
          : 0; // Counts all usable staged media roles.
        const isKlingV3EmbeddedModel = selectedEmbeddedModelId === KLING_V3_VIDEO_MODEL_ID;
        const showEmbeddedNegativePrompt = isKlingV3EmbeddedModel
          || selectedEmbeddedModelId.includes('/wan/v2.7')
          || selectedEmbeddedModelId.includes('/veo3.1')
          || selectedEmbeddedModelId.includes('/kling-video/v2.5-turbo');

        if (!isAssigned) {
          return (
            <div
              key={bar.id}
              className="absolute rounded-2xl border border-white/15 bg-gray-900/92 p-3 shadow-2xl"
              style={{
                left: `${screenRect.left}px`,
                top: `${screenRect.top}px`,
                width: `${Math.max(screenRect.width, 280)}px`,
                transform: `scale(${barVisualScale})`,
                transformOrigin: 'top left',
                zIndex: 35,
              }}
            >
              <button
                type="button"
                onMouseDown={handleVideoPromptBarPointerDown(bar.id)}
                className="mb-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.18em] text-gray-300"
              >
                Seedance 2 video prompt bar
              </button>
              <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-5 text-sm text-gray-400">
                Drag this into a video prompt area to make it editable.
              </div>
            </div>
          );
        }

        return (
          <div
            key={bar.id}
            className="absolute"
            data-embedded-prompt-size-mode={embeddedPromptBarSizeMode}
            style={{
              left: `${screenRect.centerX}px`,
              top: `${screenRect.bottomAnchorY}px`,
              transform: 'translate(-50%, -100%)', // Bottom-align the wrapper to the area anchor before the inner shell scales.
              zIndex: 18,
            }}
          >
            <div
              className="relative inline-block align-top transition-transform duration-200 ease-out"
              style={{
                transform: `scale(${barVisualScale})`,
                transformOrigin: 'bottom center', // Assigned bars should scale around the bottom anchor so zoom changes do not drift upward.
              }}
            >
              <button
                type="button"
                onMouseDown={handleVideoPromptBarPointerDown(bar.id)}
                className="absolute left-0 top-[0.2rem] rounded-lg border border-white/10 bg-black/35 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-gray-200"
              >
                {selectedEmbeddedModelLabel}
              </button>
              <Tooltip label="Delete video prompt bar" wrapperClassName="absolute left-[-2.6rem] bottom-[0.2rem] inline-flex">
                <button
                  type="button"
                  onClick={() => handleDeleteVideoPromptBar(bar.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/55 text-gray-200 transition-colors duration-200 hover:bg-red-500/25 hover:text-red-100"
                  aria-label={`Delete ${assignedArea?.label ?? 'video prompt bar'}`}
                >
                  <MinusIcon className="h-3 w-3" />
                </button>
              </Tooltip>
              <div style={{ paddingTop: `${DEFAULT_VIDEO_PROMPT_BAR_DRAG_HANDLE_HEIGHT}px` }}>
                <PromptBar
                  layout="inline"
                  sizeMode={embeddedPromptBarSizeMode}
                  maxInlineWidthPx={maxInlineWidthPx}
                  prompt={bar.prompt}
                  onPromptChange={(nextPrompt) => onVideoPromptBarUpdate(bar.id, currentBar => ({ ...currentBar, prompt: nextPrompt }))}
                  onSubmit={() => onVideoPromptBarSubmit(bar.id)}
                  isLoading={isLoading}
                  inputDisabled={false}
                  submitDisabled={!barMembership || (
                    selectedEmbeddedModelId.includes('seedance-2')
                      && bar.seedance2Variant === 'reference'
                      && embeddedMediaCount === 0
                  ) || (
                    isKlingV3EmbeddedModel
                      && Boolean(bar.klingV3MultiPromptEnabled)
                      && (!bar.prompt.trim() || !bar.klingV3MultiPrompt?.trim())
                  )}
                  modelOptions={embeddedVideoPromptBarModelOptions}
                  selectedModel={selectedEmbeddedModelId}
                  onModelChange={(modelId) => onVideoPromptBarUpdate(bar.id, currentBar => normalizeEmbeddedPromptBarForModel(currentBar, modelId))}
                  modelSelectDisabled={isLoading}
                  modelMode="video"
                  onModelModeChange={() => {}}
                  modelModeDisabled
                  showModeSwitch={false}
                  modelControls={buildVideoPromptBarControls(bar)}
                  promptPlaceholder={isKlingV3EmbeddedModel ? 'Describe the first Kling 3.0 Pro shot using staged media... (Cmd/Ctrl + Enter to generate)' : `Describe the ${selectedEmbeddedModelLabel} video using staged media... (Cmd/Ctrl + Enter to generate)`}
                  showMultiPrompt={isKlingV3EmbeddedModel && Boolean(bar.klingV3MultiPromptEnabled)}
                  multiPrompt={bar.klingV3MultiPrompt ?? ''}
                  onMultiPromptChange={(nextPrompt) => onVideoPromptBarUpdate(bar.id, currentBar => ({ ...currentBar, klingV3MultiPrompt: nextPrompt }))}
                  multiPromptPlaceholder="Describe the second Kling 3.0 Pro shot..."
                  multiPromptOutlineColor={isKlingV3EmbeddedModel && bar.klingV3MultiPromptEnabled ? '#38bdf8' : undefined}
                  showNegativePrompt={showEmbeddedNegativePrompt}
                  negativePrompt={bar.negativePrompt}
                  onNegativePromptChange={(nextPrompt) => onVideoPromptBarUpdate(bar.id, currentBar => ({ ...currentBar, negativePrompt: nextPrompt }))}
                  negativePromptPlaceholder="Describe what the video should avoid... (optional)"
                  negativePromptOutlineColor={showEmbeddedNegativePrompt ? '#f87171' : undefined}
                  klingSuggestionsEnabled
                  klingReferenceCount={barMembership ? Object.keys(barMembership.orderLabels).length : 0}
                  klingSuggestionOptions={barMembership ? getMentionOptionsFromMembership(barMembership) : []}
                  onPromptFocus={() => onVideoPromptBarFocus(bar.id)}
                  onPromptBlur={() => onVideoPromptBarBlur(bar.id)}
                />
              </div>
            </div>
          </div>
        );
      })}
      {shouldRenderBrushPreview && (
        <div
          className="pointer-events-none absolute rounded-full border border-white/80"
          style={{
            left: `${brushPreviewPosition.x - brushPreviewDiameter / 2}px`,
            top: `${brushPreviewPosition.y - brushPreviewDiameter / 2}px`,
            width: `${brushPreviewDiameter}px`,
            height: `${brushPreviewDiameter}px`,
            zIndex: 60,
            boxShadow: '0 0 0 1px rgba(0,0,0,0.45), 0 0 8px rgba(255,255,255,0.35)',
          }}
        />
      )}
      {marqueeRect && (
        <div
          className="absolute border border-sky-500/80 bg-sky-500/10 pointer-events-none"
          style={{
            left: `${marqueeRect.left}px`,
            top: `${marqueeRect.top}px`,
            width: `${marqueeRect.width}px`,
            height: `${marqueeRect.height}px`,
            zIndex: 40,
          }}
        />
      )}
      {videoPromptAreaDraftRect && (
        <div
          className="absolute rounded-2xl border border-white/35 bg-[#25272c]/40 pointer-events-none"
          style={{
            left: `${videoPromptAreaDraftRect.left}px`,
            top: `${videoPromptAreaDraftRect.top}px`,
            width: `${videoPromptAreaDraftRect.width}px`,
            height: `${videoPromptAreaDraftRect.height}px`,
            zIndex: 30,
          }}
        />
      )}
      {!isPresentationMode && selectedVideoPromptArea && (
        <div
          className="flex items-center space-x-2"
          style={{
            position: 'absolute',
            left: `${(selectedVideoPromptArea.x + selectedVideoPromptArea.width / 2) * scale + pan.x}px`,
            top: `${(selectedVideoPromptArea.y + selectedVideoPromptArea.height) * scale + pan.y + 14}px`,
            transform: 'translateX(-50%)',
            zIndex: 100,
          }}
        >
          <div className="relative" ref={videoPromptAreaColorPickerRef}>
            <ActionButton
              onClick={() => setIsVideoPromptAreaColorPickerOpen(prev => !prev)}
              disabled={false}
              title="Video Prompt Area Border Color"
            >
              <span
                className="block h-4 w-4 rounded-sm border border-white/70"
                style={{ backgroundColor: selectedVideoPromptArea.borderColor ?? DEFAULT_VIDEO_PROMPT_AREA_BORDER_COLOR }}
              />
            </ActionButton>
            {isVideoPromptAreaColorPickerOpen && (
              <div className="absolute left-1/2 mt-2 flex -translate-x-1/2 items-center gap-2 rounded-md border border-gray-600 bg-gray-900/95 p-2 shadow-xl">
                {VIDEO_PROMPT_AREA_BORDER_COLOR_OPTIONS.map(option => {
                  const isActive = option.value === (selectedVideoPromptArea.borderColor ?? DEFAULT_VIDEO_PROMPT_AREA_BORDER_COLOR);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      title={option.label}
                      onClick={() => {
                        onVideoPromptAreaBorderColorChange?.(selectedVideoPromptArea.id, option.value);
                        setIsVideoPromptAreaColorPickerOpen(false);
                      }}
                      className={`h-6 w-6 rounded-sm border ${isActive ? 'border-white' : 'border-gray-500'} shadow`}
                      style={{ backgroundColor: option.value }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      {!isPresentationMode && krea2StyleReferenceControls.map(control => (
        <div
          key={control.id}
          className="flex items-center gap-2 rounded-md border border-emerald-400/50 bg-gray-950/90 px-3 py-2 text-xs text-emerald-50 shadow-xl"
          data-testid={`krea-style-reference-slider-${control.id}`}
          onMouseDown={event => event.stopPropagation()}
          onPointerDown={event => event.stopPropagation()}
          onClick={event => event.stopPropagation()}
          onKeyDown={event => event.stopPropagation()}
          style={{
            position: 'absolute',
            left: `${((control.bounds.minX + control.bounds.maxX) / 2) * scale + pan.x}px`,
            top: `${control.bounds.maxY * scale + pan.y + 14}px`,
            transform: 'translateX(-50%)',
            zIndex: 105,
          }}
        >
          <span className="font-medium tabular-nums">{control.value.toFixed(1)}</span>
          <input
            aria-label="Krea style reference strength"
            className="h-2 w-36 accent-emerald-400"
            type="range"
            min="-2"
            max="2"
            step="0.1"
            value={control.value}
            onChange={event => onKrea2StyleReferenceStrengthChange?.(control.id, Number(event.target.value))}
          />
        </div>
      ))}
      {!isPresentationMode && selectedImage && !cropMode && !transformMode && (
        <div
          className="flex items-center space-x-2"
          style={{
            position: 'absolute',
            left: `${((selectedImageBounds ? (selectedImageBounds.minX + selectedImageBounds.maxX) / 2 : selectedImage.x + selectedImage.width / 2) * scale) + pan.x}px`,
            top: `${((selectedImageBounds ? selectedImageBounds.maxY : (selectedImage.y + selectedImage.height)) * scale) + pan.y + 14}px`,
            transform: 'translateX(-50%)',
            zIndex: 100,
          }}
        >
          {isImageOverlapping && (
            <>
              <ActionButton onClick={() => onImageOrderChange(selectedImage.id, 'down')} disabled={!canMoveDown} title="Move Down (Layer Back)">
                <LayerDownIcon className="w-4 h-4" />
              </ActionButton>
              <ActionButton onClick={() => onImageOrderChange(selectedImage.id, 'up')} disabled={!canMoveUp} title="Move Up (Layer Forward)">
                <LayerUpIcon className="w-4 h-4" />
              </ActionButton>
            </>
          )}
          {(selectedImageIsVideo || selectedImageIsAudio) && (
            <ActionButton
              onClick={() => toggleMediaPlayback(selectedImage.id)}
              disabled={false}
              title={selectedMediaIsPlaying ? 'Pause' : 'Play'}
            >
              {selectedMediaIsPlaying ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
            </ActionButton>
          )}
          {selectedImageIsVideo && (
            <ActionButton
              onClick={() => captureVideoFrame(selectedImage.id)}
              disabled={isCapturingFrame}
              title={isCapturingFrame ? 'Capturing frame...' : 'Capture current frame as image'}
            >
              <SnapshotIcon className="w-4 h-4" />
            </ActionButton>
          )}
          <ActionButton
            onClick={() => onStartTransform(selectedImage.id)}
            disabled={selectedImageIsAudio}
            title={selectedImageIsAudio ? 'Transform is not available for audio' : 'Transform Image (Shift for free transform)'}
          >
            <TransformIcon className="w-4 h-4" />
          </ActionButton>
          <ActionButton
            onClick={() => onStartCrop(selectedImage.id)}
            disabled={selectedImageIsVideo || selectedImageIsAudio}
            title={selectedImageIsVideo || selectedImageIsAudio ? 'Cropping is not available for this media type' : 'Crop Image'}
          >
            <CropIcon className="w-4 h-4" />
          </ActionButton>
          <ActionButton
            onClick={() => onRerunGeneration(selectedImage.id)}
            disabled={!selectedImageHasGeneration}
            title={selectedImageHasGeneration ? 'Re-run this generation' : 'No saved generation data'}
          >
            <RerunIcon className="w-4 h-4" />
          </ActionButton>
          <ActionButton
            onClick={() => onImagePromptCopy(selectedImage.id)}
            disabled={!selectedImagePrompt}
            title={selectedImagePrompt ? 'Copy Generation Prompt' : 'No prompt available to copy'}
          >
            <CopyIcon className="w-4 h-4" />
          </ActionButton>
          <ActionButton
            onClick={() => onImageDuplicate(selectedImage.id)}
            disabled={false}
            title="Duplicate Media"
          >
            <DuplicateIcon className="w-4 h-4" />
          </ActionButton>
          <ActionButton
            onClick={() => toggleImageFavorite(selectedImage.id)}
            disabled={false}
            title={selectedImage.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
          >
            <StarIcon className={`w-4 h-4${selectedImage.isFavorite ? ' text-yellow-400' : ''}`} />
          </ActionButton>
        </div>
      )}
      {!isPresentationMode && imageBeingCropped && (
        <div
          className="flex items-center space-x-2"
          style={{
            position: 'absolute',
            left: `${((croppingBounds ? (croppingBounds.minX + croppingBounds.maxX) / 2 : imageBeingCropped.x + imageBeingCropped.width / 2) * scale) + pan.x}px`,
            top: `${((croppingBounds ? croppingBounds.maxY : imageBeingCropped.y + imageBeingCropped.height) * scale) + pan.y + 14}px`,
            transform: 'translateX(-50%)',
            zIndex: 100,
          }}
        >
          <Tooltip label="Cancel Crop" shortcut={KEYBOARD_SHORTCUT_LABELS.cancel}>
            <button
              onClick={onCancelCrop}
              aria-label="Cancel Crop (Esc)"
              className="p-2.5 rounded-md transition-colors duration-200 bg-red-600 hover:bg-red-500 text-white shadow-lg"
            >
              <CancelIcon className="w-4 h-4" />
            </button>
          </Tooltip>
          <Tooltip label="Confirm Crop" shortcut={KEYBOARD_SHORTCUT_LABELS.confirm}>
            <button
              onClick={onConfirmCrop}
              aria-label="Confirm Crop (Enter)"
              className="p-2.5 rounded-md transition-colors duration-200 bg-green-600 hover:bg-green-500 text-white shadow-lg"
            >
              <ConfirmIcon className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>
      )}
      {!isPresentationMode && imageBeingTransformed && (
        <div
          className="flex items-center space-x-2"
          style={{
            position: 'absolute',
            left: `${((transformingBounds ? (transformingBounds.minX + transformingBounds.maxX) / 2 : imageBeingTransformed.x + imageBeingTransformed.width / 2) * scale) + pan.x}px`,
            top: `${((transformingBounds ? transformingBounds.maxY : imageBeingTransformed.y + imageBeingTransformed.height) * scale) + pan.y + 14}px`,
            transform: 'translateX(-50%)',
            zIndex: 100,
          }}
        >
          <Tooltip label="Exit Transform" shortcut={KEYBOARD_SHORTCUT_LABELS.confirm} detail="Hold Shift for free transform">
            <button
              onClick={onExitTransform}
              aria-label="Exit Transform (Enter) • Hold Shift for free transform"
              className="p-2.5 rounded-md transition-colors duration-200 bg-orange-500 hover:bg-orange-400 text-white shadow-lg"
            >
              <TransformIcon className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>
      )}
      {!isPresentationMode && !hasCanvasVisualContent && !isDraggingOver && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center px-4 sm:px-6">
          <div className="w-full max-w-xl text-center p-6 sm:p-8 bg-black/30 rounded-lg backdrop-blur-sm">
            <h2 className="text-xl sm:text-2xl font-bold text-white">Welcome to the Infinite Canvas</h2>
            <p className="text-sm sm:text-base text-gray-300 mt-2">Click "Upload Image", drop a note pin, or drag &amp; drop to start.</p>
          </div>
        </div>
      )}
      {!isPresentationMode && isDraggingOver && (
        <div className="absolute inset-0 bg-sky-500/30 border-4 border-dashed border-sky-300 rounded-2xl flex items-center justify-center pointer-events-none z-20 m-4">
          <div className="text-center p-8 bg-black/50 rounded-lg">
            <h2 className="text-3xl font-bold text-white">Drop to Upload</h2>
            <p className="text-gray-200 mt-2">Release your images to add them to the canvas.</p>
          </div>
        </div>
      )}
    </div>
  );
};

/* eslint-enable jsx-a11y/no-noninteractive-tabindex */
