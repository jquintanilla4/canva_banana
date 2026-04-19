import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Tool, Path, Point, CanvasImage, CanvasNote, AppMode, CanvasVideoPromptArea, CanvasVideoPromptBar, VideoPromptAreaMembership } from '../types';
import { getNaturalSize, loadImageFromBlob } from '../services/mediaService';
import { LayerUpIcon, LayerDownIcon, CropIcon, CancelIcon, ConfirmIcon, CopyIcon, TransformIcon, RerunIcon, DuplicateIcon, PlayIcon, PauseIcon, SnapshotIcon, FontSizeDownIcon, FontSizeUpIcon, MinusIcon } from './Icons';
import {
  DEFAULT_NOTE_FONT_SIZE,
  DOT_BASE_SIZE,
  DOT_MAX_SIZE,
  DOT_MIN_SIZE,
  GRID_BASE_SIZE,
  GRID_MAX_SIZE,
  GRID_MIN_SIZE,
  GRID_VISUAL_SCALE,
  KEYBOARD_ZOOM_MULTIPLIER,
  KEYBOARD_ZOOM_OUT_MULTIPLIER,
  MAX_NOTE_FONT_SIZE,
  MAX_SCALE,
  MIN_NOTE_FONT_SIZE,
  MIN_NOTE_HEIGHT,
  MIN_NOTE_WIDTH,
  MIN_SCALE,
  RESIZE_HANDLE_SIZE,
  WHEEL_ZOOM_MULTIPLIER,
} from './canvas/constants';
import { getImageBounds } from './canvas/geometry';
import { isAudioImage, isVideoImage } from './canvas/mediaGuards';
import { drawCanvas } from './canvas/render/drawCanvas';
import { getNoteTextColor } from './canvas/noteColors';
import { DEFAULT_VIDEO_PROMPT_AREA_BORDER_COLOR, NOTE_COLOR_OPTIONS, VIDEO_PROMPT_AREA_BORDER_COLOR_OPTIONS } from '../utils/canvasColorOptions';
import { useCanvasInteractions } from './canvas/hooks/useCanvasInteractions';
import { PromptBar, type PromptBarControlConfig } from './PromptBar';
import {
  DEFAULT_VIDEO_PROMPT_BAR_BOTTOM_INSET,
  DEFAULT_VIDEO_PROMPT_BAR_DRAG_HANDLE_HEIGHT,
  getAreaPromptBarRect,
  getEmbeddedVideoPromptBarRenderWidth,
  getEmbeddedVideoPromptBarSizeMode,
  getMentionOptionsFromMembership,
  getVideoPromptBarVisualScale,
  MINI_VIDEO_PROMPT_BAR_SIZE,
  syncVideoPromptAreaMembership,
} from '../utils/videoPromptAreas';

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
  tool: Tool;
  appMode: AppMode;
  paths: Path[];
  onPathsChange: (paths: Path[]) => void;
  brushSize: number;
  eraserSize: number;
  brushColor: string;
  selectedImageIds: string[];
  selectedNoteIds: string[];
  referenceImageIds: string[];
  referenceVideoIds: string[];
  referenceAudioIds: string[];
  referenceImageOrderLabels?: Record<string, string> | null;
  disabledMediaIds?: string[];
  elementImageIds: string[];
  elementImageOrderLabels?: Record<string, string> | null;
  videoLastFrameImageId: string | null;
  sourceVideoId: string | null;
  tailSelectionEnabled: boolean;
  isKlingO1VideoInputMode: boolean;
  isKlingO1FflfMode: boolean;
  isSeedance15FflfMode: boolean;
  isKling26ControlVideoInputMode: boolean;
  isVeo31ExtendMode: boolean;
  isWanAnimateVideoInputMode: boolean;
  isWan26I2VMode: boolean;
  onError?: (message: string) => void;
  onImageSelect: (id: string | null, options?: { multi?: boolean; reference?: boolean; lastFrame?: boolean; element?: boolean }) => void;
  onNoteSelect: (id: string | null, options?: { multi?: boolean }) => void;
  zoomToFitTrigger: number;
  zoomToSelectionTrigger: number;
  zoomInTrigger: number;
  zoomOutTrigger: number;
  onFilesDrop: (files: FileList, point: Point) => void;
  editingNoteId: string | null;
  onNoteDoubleClick: (id: string) => void;
  onNoteTextChange: (id: string, text: string) => void;
  onNoteEditEnd: () => void;
  onImageOrderChange: (id: string, direction: 'up' | 'down') => void;
  isImageOverlapping: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  cropMode: { imageId: string; rect: { x: number; y: number; width: number; height: number; }; } | null;
  onCropRectChange: (rect: { x: number; y: number; width: number; height: number; }) => void;
  onStartCrop: (imageId: string) => void;
  onConfirmCrop: () => void;
  onCancelCrop: () => void;
  onNoteCopy: (noteId: string) => void;
  onNoteDuplicate: (noteId: string) => void;
  onNoteFontSizeChange: (noteId: string, delta: number) => void;
  onNoteColorChange: (noteId: string, color: string) => void;
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
}

const ActionButton: React.FC<{
  onClick: () => void;
  disabled: boolean;
  title: string;
  children: React.ReactNode;
}> = ({ onClick, disabled, title, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className="p-2.5 rounded-md transition-colors duration-200 bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
  >
    {children}
  </button>
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
  tool,
  appMode,
  paths,
  onPathsChange,
  brushSize,
  eraserSize,
  brushColor,
  selectedImageIds,
  selectedNoteIds,
  referenceImageIds,
  referenceVideoIds,
  referenceAudioIds,
  referenceImageOrderLabels,
  disabledMediaIds = [],
  elementImageIds,
  elementImageOrderLabels,
  videoLastFrameImageId,
  sourceVideoId,
  tailSelectionEnabled,
  isKlingO1VideoInputMode,
  isKlingO1FflfMode,
  isSeedance15FflfMode,
  isKling26ControlVideoInputMode,
  isVeo31ExtendMode,
  isWanAnimateVideoInputMode,
  isWan26I2VMode,
  onError,
  onImageSelect,
  onNoteSelect,
  onCommit,
  zoomToFitTrigger,
  zoomToSelectionTrigger,
  zoomInTrigger,
  zoomOutTrigger,
  onFilesDrop,
  editingNoteId,
  onNoteDoubleClick,
  onNoteTextChange,
  onNoteEditEnd,
  onImageOrderChange,
  isImageOverlapping,
  canMoveUp,
  canMoveDown,
  cropMode,
  onCropRectChange,
  onStartCrop,
  onConfirmCrop,
  onCancelCrop,
  onNoteCopy,
  onNoteDuplicate,
  onNoteFontSizeChange,
  onNoteColorChange,
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
}) => {
  type VideoPromptAreaDragMode = 'move' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br'; // Area resizing should track which corner the user grabbed.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const noteColorPickerRef = useRef<HTMLDivElement>(null);
  const videoPromptAreaColorPickerRef = useRef<HTMLDivElement>(null);
  const notePointerDownWhileEditingRef = useRef(false);
  const noteEditHandledRef = useRef(false);
  const [isNoteColorPickerOpen, setIsNoteColorPickerOpen] = useState(false);
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
  const scaleRef = useRef(scale);
  const panRef = useRef(pan);

  const primarySelectedImageId = selectedImageIds[0] ?? null;
  const primarySelectedNoteId = selectedNoteIds[0] ?? null;
  const isAreaSelectionTool = tool === Tool.SELECTION || tool === Tool.FREE_SELECTION;
  const areaLabelFontSize = Math.max(11, Math.min(16, 11 / Math.max(scale, 0.7))); // Keep area titles readable even when the canvas is zoomed far out.

  const getCanvasContext = () => canvasRef.current?.getContext('2d');

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
        const playPromise = videoElement.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(err => console.error('Failed to play video', err));
        }
      } else {
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
        audioElement.play().catch(err => console.error('Failed to play audio', err));
      } else {
        audioElement.pause();
      }

      const updatedImages = images.map(img => {
        if (img.id !== mediaId) return img;
        return { ...img, isPlaying: nextIsPlaying };
      });
      onImagesChange(updatedImages);
      onCommit({ images: updatedImages });
    }
  }, [images, isVideoImage, isAudioImage, onCommit, onImagesChange]);


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
    isResizing,
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
    tool,
    appMode,
    images,
    notes,
    videoPromptAreas,
    paths,
    isNoteEditing: Boolean(editingNoteId),
    pan,
    scale,
    brushSize,
    eraserSize,
    brushColor,
    selectedImageIds,
    selectedNoteIds,
    primarySelectedNoteId,
    tailSelectionEnabled,
    cropMode,
    transformMode,
    onImagesChange,
    onNotesChange,
    onVideoPromptAreasChange,
    onPathsChange,
    onCommit,
    onImageSelect,
    onNoteSelect,
    onVideoPromptAreaSelect,
    onFilesDrop,
    onNoteDoubleClick,
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
      selectedNoteIds,
      primarySelectedNoteId,
      referenceImageIds,
      referenceVideoIds,
      referenceAudioIds,
      referenceImageOrderLabels,
      disabledMediaIds,
      elementImageIds,
      elementImageOrderLabels,
      videoLastFrameImageId,
      sourceVideoId,
      isKlingO1VideoInputMode,
      isKlingO1FflfMode,
      isSeedance15FflfMode,
      isKling26ControlVideoInputMode,
      isVeo31ExtendMode,
      isWanAnimateVideoInputMode,
      isWan26I2VMode,
      showMetadataOverlay,
      cropMode,
      transformMode,
    });
  }, [cropMode, disabledMediaIds, elementImageIds, elementImageOrderLabels, images, isKlingO1FflfMode, isSeedance15FflfMode, isKlingO1VideoInputMode, isKling26ControlVideoInputMode, isVeo31ExtendMode, isWanAnimateVideoInputMode, isWan26I2VMode, notes, pan, paths, primarySelectedNoteId, referenceAudioIds, referenceImageIds, referenceImageOrderLabels, referenceVideoIds, scale, selectedImageIds, selectedNoteIds, showMetadataOverlay, sourceVideoId, transformMode, videoLastFrameImageId]);

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

    targetNotes.forEach(note => {
      minX = Math.min(minX, note.x);
      minY = Math.min(minY, note.y);
      maxX = Math.max(maxX, note.x + note.width);
      maxY = Math.max(maxY, note.y + note.height);
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

    if (bboxWidth === 0 || bboxHeight === 0) {
      return;
    }

    const canvasWidth = canvas.clientWidth;
    const canvasHeight = canvas.clientHeight;

    if (canvasWidth === 0 || canvasHeight === 0) {
      return;
    }

    const padding = 0.9; // 10% padding
    const scaleX = canvasWidth / bboxWidth;
    const scaleY = canvasHeight / bboxHeight;
    const newScale = Math.min(scaleX, scaleY) * padding;

    const bboxCenterX = bounds.minX + bboxWidth / 2;
    const bboxCenterY = bounds.minY + bboxHeight / 2;

    const newPanX = canvasWidth / 2 - bboxCenterX * newScale;
    const newPanY = canvasHeight / 2 - bboxCenterY * newScale;

    const clampedScale = Math.max(MIN_SCALE, Math.min(newScale, MAX_SCALE));
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
    if (selectedImageIds.length === 0 && selectedNoteIds.length === 0) {
      return;
    }

    const selectedImageSet = new Set(selectedImageIds);
    const selectedNoteSet = new Set(selectedNoteIds);
    const selectedImages = images.filter(img => selectedImageSet.has(img.id));
    const selectedNotes = notes.filter(note => selectedNoteSet.has(note.id));
    const bounds = getBoundsForItems(selectedImages, selectedNotes);
    if (!bounds) {
      return;
    }
    zoomToBounds(bounds);
  }, [getBoundsForItems, images, notes, selectedImageIds, selectedNoteIds, zoomToBounds]);

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
    const hasPlayingMedia = images.some(img =>
      (img.mediaType === 'video' || img.mediaType === 'audio') && img.isPlaying
    );
    if (!hasPlayingMedia) {
      return;
    }

    let rafId = requestAnimationFrame(() => {});

    const tick = () => {
      // Update currentPlaybackTime for playing audio items
      const needsUpdate = images.some(img => img.mediaType === 'audio' && img.isPlaying && img.audioElement);
      if (needsUpdate) {
        const updatedImages = images.map(img => {
          if (img.mediaType === 'audio' && img.isPlaying && img.audioElement) {
            return { ...img, currentPlaybackTime: img.audioElement.currentTime };
          }
          return img;
        });
        onImagesChange(updatedImages);
      }
      draw();
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [draw, images, onImagesChange]);

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
      if (cropMode) {
        cursor = 'crosshair'; // Default for crop mode
      } else if (transformMode) {
        cursor = 'default'; // Default for transform mode, will be updated on mouse move
      } else if (isResizing) {
        cursor = 'nwse-resize';
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
  }, [currentTool, isPanning, isDragging, isResizing, cropMode, transformMode, isMarqueeSelecting]);

  useEffect(() => {
    if (!editingNoteId) return;
    if (!notes.some(note => note.id === editingNoteId)) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (document.activeElement !== textarea) {
      textarea.focus();
    }
  }, [editingNoteId, notes]);

  useEffect(() => {
    if (editingNoteId) {
      noteEditHandledRef.current = false;
    }
  }, [editingNoteId]);

  const handleNoteBlur = useCallback(() => {
    if (noteEditHandledRef.current) {
      return;
    }
    noteEditHandledRef.current = true;
    onCommit();
    onNoteEditEnd();
  }, [onCommit, onNoteEditEnd]);

  const handleMouseDownCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!editingNoteId) {
      notePointerDownWhileEditingRef.current = false;
      return;
    }
    const target = e.target as HTMLElement;
    notePointerDownWhileEditingRef.current = target.tagName !== 'TEXTAREA';
  }, [editingNoteId]);

  const handleMouseDownWithEditGuard = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const suppressNoteCreation = notePointerDownWhileEditingRef.current && tool === Tool.NOTE;
    notePointerDownWhileEditingRef.current = false;

    if (editingNoteId) {
      const target = e.target as HTMLElement;
      if (target.tagName !== 'TEXTAREA') {
        handleNoteBlur();
        if (tool === Tool.NOTE) {
          return;
        }
      }
    }
    if (suppressNoteCreation) {
      return;
    }
    handleMouseDown(e);
  }, [editingNoteId, handleNoteBlur, handleMouseDown, tool]);

  const editingNote = useMemo(() => editingNoteId ? notes.find(n => n.id === editingNoteId) : null, [notes, editingNoteId]);
  const selectedNote = useMemo(() => {
    if (editingNoteId) return null;
    if (selectedNoteIds.length !== 1) return null;
    const targetId = primarySelectedNoteId;
    if (!targetId) return null;
    return notes.find(n => n.id === targetId) || null;
  }, [notes, primarySelectedNoteId, editingNoteId, selectedNoteIds.length]);
  const selectedVideoPromptArea = useMemo(() => {
    if (!selectedVideoPromptAreaId || selectedNote || selectedImageIds.length > 0) {
      return null;
    }
    return videoPromptAreas.find(area => area.id === selectedVideoPromptAreaId) ?? null;
  }, [selectedImageIds.length, selectedNote, selectedVideoPromptAreaId, videoPromptAreas]);

  useEffect(() => {
    setIsNoteColorPickerOpen(false);
  }, [editingNoteId, selectedNote?.id]);

  useEffect(() => {
    setIsVideoPromptAreaColorPickerOpen(false);
  }, [selectedVideoPromptArea?.id]);

  useEffect(() => {
    if (!isNoteColorPickerOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const container = noteColorPickerRef.current;
      const target = event.target as Node | null;
      if (!container || !target) {
        return;
      }
      if (!container.contains(target)) {
        setIsNoteColorPickerOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isNoteColorPickerOpen]);

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
  const selectedImagePrompt = selectedImage?.metadata?.prompt?.trim() ?? '';
  const selectedImageHasGeneration = Boolean(selectedImage?.metadata?.generation);
  const imageBeingCropped = useMemo(() => cropMode ? images.find(img => img.id === cropMode.imageId) : null, [images, cropMode]);
  const imageBeingTransformed = useMemo(() => transformMode ? images.find(img => img.id === transformMode.imageId) : null, [images, transformMode]);
  const selectedImageBounds = useMemo(() => selectedImage ? getImageBounds(selectedImage) : null, [getImageBounds, selectedImage]);
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
  const shouldRenderBrushPreview = brushPreviewPosition && (currentTool === Tool.BRUSH || currentTool === Tool.ERASE) && brushPreviewDiameter > 0;

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

    const videoElement = target.element;
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
    setVideoPromptBarDragState({
      barId,
      pointerOffset: {
        x: pointerPoint.x - targetBar.x,
        y: pointerPoint.y - targetBar.y,
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
      onMouseDown={handleMouseDownWithEditGuard}
      onMouseMove={handleMouseMoveWithOverlays}
      onMouseUp={handleMouseUpWithOverlays}
      onMouseLeave={handleMouseUpWithOverlays}
      onDoubleClick={handleDoubleClick}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onImageSelect(null);
          onNoteSelect(null);
          onVideoPromptAreaSelect(null);
        }
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {videoPromptAreas.map(area => (
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
            className={`pointer-events-none absolute inset-[-6px] rounded-[1.35rem] border transition-colors ${selectedVideoPromptAreaId === area.id ? 'border-sky-300/70' : 'border-transparent'}`}
          />
          <div className={`pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ${selectedVideoPromptAreaId === area.id ? 'ring-sky-300/45' : 'ring-white/8'}`} />
          {!area.promptBarId && area.orderedMediaIds.length === 0 && (
            <div className="pointer-events-none absolute inset-x-6 top-20 rounded-xl border border-dashed border-white/15 bg-black/10 px-4 py-5 text-sm text-gray-400">
              Drag a video prompt bar here to activate this area.
            </div>
          )}
        </div>
      ))}
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full z-10" />
      {videoPromptAreas.map(area => {
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
      {embeddedPromptBars.map(({ bar, assignedArea }) => {
        const barMembership = bar.assignedAreaId ? videoPromptAreaMemberships[bar.assignedAreaId] : null;
        const isAssigned = Boolean(assignedArea);
        const assignedAreaScreenWidth = assignedArea ? assignedArea.width * scale : undefined;
        const embeddedPromptBarSizeMode = isAssigned ? getEmbeddedVideoPromptBarSizeMode(scale, assignedAreaScreenWidth) : 'full';
        const renderedBarWidth = isAssigned
          ? getEmbeddedVideoPromptBarRenderWidth(embeddedPromptBarSizeMode, assignedAreaScreenWidth)
          : bar.width;
        const renderedBarHeight = embeddedPromptBarSizeMode === 'mini' ? MINI_VIDEO_PROMPT_BAR_SIZE.height : bar.height;
        const barVisualScale = getVideoPromptBarVisualScale(scale, renderedBarWidth, assignedAreaScreenWidth);
        const dragHandleHeight = isAssigned ? DEFAULT_VIDEO_PROMPT_BAR_DRAG_HANDLE_HEIGHT : 0;
        const screenRect = isAssigned && assignedArea
          ? {
            left: assignedArea.x * scale + pan.x + (assignedArea.width * scale - renderedBarWidth * barVisualScale) / 2,
            top: assignedArea.y * scale + pan.y + (assignedArea.height - DEFAULT_VIDEO_PROMPT_BAR_BOTTOM_INSET) * scale - (renderedBarHeight + dragHandleHeight) * barVisualScale,
            width: renderedBarWidth,
            height: renderedBarHeight,
          }
          : {
            left: bar.x * scale + pan.x,
            top: bar.y * scale + pan.y,
            width: bar.width,
            height: bar.height,
          };

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
              left: `${screenRect.left}px`,
              top: `${screenRect.top}px`,
              width: `${screenRect.width}px`,
              transform: `scale(${barVisualScale})`,
              transformOrigin: 'top left',
              zIndex: 18,
            }}
          >
            <div className="relative" style={{ width: `${screenRect.width}px` }}>
              <button
                type="button"
                onMouseDown={handleVideoPromptBarPointerDown(bar.id)}
                className="absolute left-0 top-[0.2rem] rounded-lg border border-white/10 bg-black/35 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-gray-200"
              >
                Seedance 2
              </button>
              <button
                type="button"
                onClick={() => handleDeleteVideoPromptBar(bar.id)}
                className="absolute left-[-2.6rem] bottom-[0.2rem] flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/55 text-gray-200 transition-colors duration-200 hover:bg-red-500/25 hover:text-red-100"
                aria-label={`Delete ${assignedArea?.label ?? 'video prompt bar'}`}
                title="Delete video prompt bar"
              >
                <MinusIcon className="h-3 w-3" />
              </button>
              <div style={{ paddingTop: `${dragHandleHeight}px` }}>
                <PromptBar
                  layout="inline"
                  sizeMode={embeddedPromptBarSizeMode}
                  prompt={bar.prompt}
                  onPromptChange={(nextPrompt) => onVideoPromptBarUpdate(bar.id, currentBar => ({ ...currentBar, prompt: nextPrompt }))}
                  onSubmit={() => onVideoPromptBarSubmit(bar.id)}
                  isLoading={isLoading}
                  inputDisabled={false}
                  submitDisabled={!barMembership || (barMembership.acceptedImageIds.length + barMembership.acceptedVideoIds.length + barMembership.acceptedAudioIds.length) === 0}
                  modelOptions={embeddedVideoPromptBarModelOptions}
                  selectedModel={embeddedVideoPromptBarModelOptions[0]?.value ?? 'volcengine/seedance-2'}
                  onModelChange={() => {}}
                  modelSelectDisabled
                  modelMode="video"
                  onModelModeChange={() => {}}
                  modelModeDisabled
                  showModeSwitch={false}
                  modelControls={buildVideoPromptBarControls(bar)}
                  promptPlaceholder="Describe the Seedance 2 video using the ordered media in this area... (Cmd/Ctrl + Enter to generate)"
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
      {editingNote && (
        <textarea
          ref={textareaRef}
          value={editingNote.text}
          onChange={(e) => onNoteTextChange(editingNote.id, e.target.value)}
          onBlur={handleNoteBlur}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
          style={{
            position: 'absolute',
            left: `${editingNote.x * scale + pan.x}px`,
            top: `${editingNote.y * scale + pan.y}px`,
            width: `${editingNote.width * scale}px`,
            height: `${editingNote.height * scale}px`,
            backgroundColor: editingNote.backgroundColor,
            color: getNoteTextColor(editingNote.backgroundColor),
            border: `2px solid #0ea5e9`,
            borderRadius: '4px',
            padding: `${10 * scale}px`,
            fontSize: `${(editingNote.fontSize ?? DEFAULT_NOTE_FONT_SIZE) * scale}px`,
            fontFamily: 'sans-serif',
            resize: 'none',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      )}
      {selectedNote && (
        <div
          className="flex items-center space-x-2"
          style={{
            position: 'absolute',
            left: `${(selectedNote.x + selectedNote.width / 2) * scale + pan.x}px`,
            top: `${(selectedNote.y + selectedNote.height) * scale + pan.y + 14}px`,
            transform: 'translateX(-50%)',
            zIndex: 100,
          }}
        >
          {selectedNote.text && (
            <>
              <ActionButton
                onClick={() => onNoteFontSizeChange(selectedNote.id, -2)}
                disabled={(selectedNote.fontSize ?? DEFAULT_NOTE_FONT_SIZE) <= MIN_NOTE_FONT_SIZE}
                title="Decrease Font Size"
              >
                <FontSizeDownIcon className="w-4 h-4" />
              </ActionButton>
              <ActionButton
                onClick={() => onNoteFontSizeChange(selectedNote.id, 2)}
                disabled={(selectedNote.fontSize ?? DEFAULT_NOTE_FONT_SIZE) >= MAX_NOTE_FONT_SIZE}
                title="Increase Font Size"
              >
                <FontSizeUpIcon className="w-4 h-4" />
              </ActionButton>
            </>
          )}
          <div className="relative" ref={noteColorPickerRef}>
            <ActionButton
              onClick={() => setIsNoteColorPickerOpen(prev => !prev)}
              disabled={false}
              title="Note Color"
            >
              <span
                className="block h-4 w-4 rounded-sm border border-white/70"
                style={{ backgroundColor: selectedNote.backgroundColor }}
              />
            </ActionButton>
            {isNoteColorPickerOpen && (
              <div className="absolute left-1/2 -translate-x-1/2 mt-2 flex items-center gap-2 rounded-md border border-gray-600 bg-gray-900/95 p-2 shadow-xl">
                {NOTE_COLOR_OPTIONS.map(option => {
                  const isActive = option.value === selectedNote.backgroundColor;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      title={option.label}
                      onClick={() => {
                        onNoteColorChange(selectedNote.id, option.value);
                        setIsNoteColorPickerOpen(false);
                      }}
                      className={`h-6 w-6 rounded-sm border ${isActive ? 'border-white' : 'border-gray-500'} shadow`}
                      style={{ backgroundColor: option.value }}
                    />
                  );
                })}
              </div>
            )}
          </div>
          <ActionButton
            onClick={() => onNoteCopy(selectedNote.id)}
            disabled={!selectedNote.text}
            title="Copy Text"
          >
            <CopyIcon className="w-4 h-4" />
          </ActionButton>
          <ActionButton
            onClick={() => onNoteDuplicate(selectedNote.id)}
            disabled={false}
            title="Duplicate Note"
          >
            <DuplicateIcon className="w-4 h-4" />
          </ActionButton>
        </div>
      )}
      {selectedVideoPromptArea && (
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
      {selectedImage && !cropMode && !transformMode && (
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
        </div>
      )}
      {imageBeingCropped && (
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
          <button
            onClick={onCancelCrop}
            title="Cancel Crop (Esc)"
            className="p-2.5 rounded-md transition-colors duration-200 bg-red-600 hover:bg-red-500 text-white shadow-lg"
          >
            <CancelIcon className="w-4 h-4" />
          </button>
          <button
            onClick={onConfirmCrop}
            title="Confirm Crop (Enter)"
            className="p-2.5 rounded-md transition-colors duration-200 bg-green-600 hover:bg-green-500 text-white shadow-lg"
          >
            <ConfirmIcon className="w-4 h-4" />
          </button>
        </div>
      )}
      {imageBeingTransformed && (
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
          <button
            onClick={onExitTransform}
            title="Exit Transform (Enter) • Hold Shift for free transform"
            className="p-2.5 rounded-md transition-colors duration-200 bg-orange-500 hover:bg-orange-400 text-white shadow-lg"
          >
            <TransformIcon className="w-4 h-4" />
          </button>
        </div>
      )}
      {images.length === 0 && notes.length === 0 && !isDraggingOver && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center px-4 sm:px-6">
          <div className="w-full max-w-xl text-center p-6 sm:p-8 bg-black/30 rounded-lg backdrop-blur-sm">
            <h2 className="text-xl sm:text-2xl font-bold text-white">Welcome to the Infinite Canvas</h2>
            <p className="text-sm sm:text-base text-gray-300 mt-2">Click "Upload Image", create a Note, or drag &amp; drop to start.</p>
          </div>
        </div>
      )}
      {isDraggingOver && (
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
