import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Tool, Path, Point, CanvasImage, CanvasNote, AppMode } from '../types';
import { getNaturalSize, loadImageFromBlob } from '../services/mediaService';
import { LayerUpIcon, LayerDownIcon, CropIcon, CancelIcon, ConfirmIcon, CopyIcon, TransformIcon, RerunIcon, DuplicateIcon, PlayIcon, PauseIcon, SnapshotIcon, FontSizeDownIcon, FontSizeUpIcon } from './Icons';
import {
  DEFAULT_NOTE_FONT_SIZE,
  DOT_BASE_SIZE,
  DOT_MAX_SIZE,
  DOT_MIN_SIZE,
  GRID_BASE_SIZE,
  GRID_MAX_SIZE,
  GRID_MIN_SIZE,
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
import { useCanvasInteractions } from './canvas/hooks/useCanvasInteractions';

interface CanvasProps {
  images: CanvasImage[];
  onImagesChange: (images: CanvasImage[]) => void;
  // onCommit accepts optional state overrides so callers can snapshot freshly-updated slices immediately.
  onCommit: (overrides?: { images?: CanvasImage[]; paths?: Path[]; notes?: CanvasNote[] }) => void;
  notes: CanvasNote[];
  onNotesChange: (notes: CanvasNote[]) => void;
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
  referenceImageOrderLabels?: Record<string, string> | null;
  elementImageIds: string[];
  elementImageOrderLabels?: Record<string, string> | null;
  videoLastFrameImageId: string | null;
  sourceVideoId: string | null;
  tailSelectionEnabled: boolean;
  isKlingO1VideoInputMode: boolean;
  isKlingO1FflfMode: boolean;
  isSeedance15FflfMode: boolean;
  isKling26ControlVideoInputMode: boolean;
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
  onImagePromptCopy: (imageId: string) => void;
  onImageDuplicate: (imageId: string) => void;
  onRerunGeneration: (imageId: string) => void;
  showMetadataOverlay: boolean;
  transformMode: { imageId: string; } | null;
  onStartTransform: (imageId: string) => void;
  onExitTransform: () => void;
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
  referenceImageOrderLabels,
  elementImageIds,
  elementImageOrderLabels,
  videoLastFrameImageId,
  sourceVideoId,
  tailSelectionEnabled,
  isKlingO1VideoInputMode,
  isKlingO1FflfMode,
  isSeedance15FflfMode,
  isKling26ControlVideoInputMode,
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
  onImagePromptCopy,
  onImageDuplicate,
  onRerunGeneration,
  showMetadataOverlay,
  transformMode,
  onStartTransform,
  onExitTransform,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const noteColorPickerRef = useRef<HTMLDivElement>(null);
  const notePointerDownWhileEditingRef = useRef(false);
  const noteEditHandledRef = useRef(false);
  const [isNoteColorPickerOpen, setIsNoteColorPickerOpen] = useState(false);

  const noteColorOptions = useMemo(() => ([
    { label: 'Dark gray blue', value: '#1f2937' },
    { label: 'Black', value: '#000000' },
    { label: 'Orange', value: '#f97316' },
    { label: 'Mustard yellow', value: '#e1b927' },
    { label: 'Dark purple', value: '#4c1d95' },
    { label: 'Dark green', value: '#166534' },
    { label: 'Dark red', value: '#7f1d1d' },
  ]), []);

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
    onPathsChange,
    onCommit,
    onImageSelect,
    onNoteSelect,
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
      referenceImageOrderLabels,
      elementImageIds,
      elementImageOrderLabels,
      videoLastFrameImageId,
      sourceVideoId,
      isKlingO1VideoInputMode,
      isKlingO1FflfMode,
      isSeedance15FflfMode,
      isKling26ControlVideoInputMode,
      isWanAnimateVideoInputMode,
      isWan26I2VMode,
      showMetadataOverlay,
      cropMode,
      transformMode,
    });
  }, [cropMode, elementImageIds, elementImageOrderLabels, images, isKlingO1FflfMode, isSeedance15FflfMode, isKlingO1VideoInputMode, isKling26ControlVideoInputMode, isWanAnimateVideoInputMode, isWan26I2VMode, notes, pan, paths, primarySelectedNoteId, referenceImageIds, referenceImageOrderLabels, scale, selectedImageIds, selectedNoteIds, showMetadataOverlay, sourceVideoId, transformMode, videoLastFrameImageId]);

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
  }, [scale]);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const isFirstImage = images.length === 1 && prevImagesLength.current === 0;

    if (isFirstImage) {
      const image = images[0];
      const hRatio = canvas.width / image.width;
      const vRatio = canvas.height / image.height;
      const newScale = Math.min(hRatio, vRatio) * 0.9;
      const clampedScale = Math.max(MIN_SCALE, Math.min(newScale, MAX_SCALE));
      scaleRef.current = clampedScale;
      setScale(clampedScale);

      const newPanX = (canvas.width - image.width * clampedScale) / 2;
      const newPanY = (canvas.height - image.height * clampedScale) / 2;
      setPanSmoothly({ x: newPanX, y: newPanY });
    }

    prevImagesLength.current = images.length;
  }, [images, setPanSmoothly]);

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

  useEffect(() => {
    setIsNoteColorPickerOpen(false);
  }, [editingNoteId, selectedNote?.id]);

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
    const size = GRID_BASE_SIZE * Math.max(scale * 0.25, MIN_SCALE);
    return Math.max(GRID_MIN_SIZE, Math.min(GRID_MAX_SIZE, size));
  }, [scale]);

  const dotRadius = useMemo(() => {
    const scaled = DOT_BASE_SIZE * Math.sqrt(scale);
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

  /* eslint-disable jsx-a11y/no-noninteractive-tabindex */
  return (
    /* Canvas needs focus for keyboard shortcuts (ESC deselect) */
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-0 bg-black overflow-hidden outline-none focus:outline-none"
      tabIndex={0}
      style={{
        backgroundImage,
        backgroundSize: `${gridSpacing}px ${gridSpacing}px`,
      }}
      onMouseDownCapture={handleMouseDownCapture}
      onMouseDown={handleMouseDownWithEditGuard}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onImageSelect(null);
          onNoteSelect(null);
        }
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
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
                {noteColorOptions.map(option => {
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
