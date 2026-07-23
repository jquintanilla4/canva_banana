import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type React from 'react';
import { type AppMode, type CanvasImage, type CanvasNote, type CanvasVideoPromptArea, type Path, type Point, Tool, type VideoModelCapabilityProfile } from '../../../types';
import { getImageBounds, getImageRotation, worldToImageLocal } from '../geometry';
import {
  getCropActionForPoint,
  getImageAtPoint,
  getNoteAnchorAtPoint,
  getTransformActionForPoint,
  isPointInVideoPlayControl,
  type CropAction,
  type TransformAction,
} from '../hitTest';
import { DEFAULT_VIDEO_PROMPT_AREA_BORDER_COLOR } from '../../../utils/canvasColorOptions';
import { isCanvasInteractionBoundaryTarget, isCanvasInteractiveTarget, shouldIgnoreCanvasMouseDown } from '../../../utils/canvasInteractionBoundary';
import { buildVideoPromptAreaLabel, clampAreaRect, isPointInRect, syncVideoPromptAreaMembership } from '../../../utils/videoPromptAreas';

const MIN_DRAG_PREVIEW_PX = 3; // Match marquee selection so area previews only appear after a real drag starts.

type CropModeState = { imageId: string; rect: { x: number; y: number; width: number; height: number } } | null;
type TransformModeState = { imageId: string } | null;
type PendingMultiSelectGesture = {
  startPoint: Point;
  startClientPoint: Point;
  targetImageId: string | null;
  didStartMarquee: boolean;
} | null;

type PinDragState = {
  noteId: string;
  startClientPoint: Point;
  startAnchor: Point;
  moved: boolean;
} | null;

type UseCanvasInteractionsArgs = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  tool: Tool;
  canCreateVideoPromptAreas: boolean;
  canUpdateSelection: boolean; // Allows clicks to mutate selected refs and canvas objects.
  appMode: AppMode;
  images: CanvasImage[];
  notes: CanvasNote[];
  videoPromptAreas: CanvasVideoPromptArea[];
  videoPromptAreaProfiles?: Record<string, VideoModelCapabilityProfile>;
  paths: Path[];
  pan: Point;
  scale: number;
  brushSize: number;
  eraserSize: number;
  brushColor: string;
  selectedImageIds: string[];
  tailSelectionEnabled: boolean;
  cropMode: CropModeState;
  transformMode: TransformModeState;
  onImagesChange: (images: CanvasImage[]) => void;
  onNotesChange: (notes: CanvasNote[]) => void;
  onVideoPromptAreasChange: (areas: CanvasVideoPromptArea[]) => void;
  onPathsChange: (paths: Path[]) => void;
  onCommit: (overrides?: { images?: CanvasImage[]; paths?: Path[]; notes?: CanvasNote[]; videoPromptAreas?: CanvasVideoPromptArea[] }) => void;
  onImageSelect: (id: string | null, options?: { multi?: boolean; reference?: boolean; lastFrame?: boolean; element?: boolean }) => void;
  onSelectionReplace: (imageIds: string[]) => void;
  onMediaPlaybackToggle: (imageId: string) => void;
  onVideoPromptAreaSelect: (id: string | null) => void;
  onFilesDrop: (files: FileList, point: Point) => void;
  onAnchorNoteCreate: (point: Point) => void;
  onAnchorClick: (noteId: string) => void;
  onCropRectChange: (rect: { x: number; y: number; width: number; height: number }) => void;
  setPanSmoothly: (nextPan: Point) => Point;
};

type UseCanvasInteractionsResult = {
  currentTool: Tool;
  hoveredVideoId: string | null;
  isDrawing: boolean;
  isPanning: boolean;
  isDragging: boolean;
  isMarqueeSelecting: boolean;
  isDraggingOver: boolean;
  brushPreviewPosition: { x: number; y: number } | null;
  marqueeRect: { left: number; top: number; width: number; height: number } | null;
  videoPromptAreaDraftRect: { left: number; top: number; width: number; height: number } | null;
  handleMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleMouseUp: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleDoubleClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDrop: (e: React.DragEvent<HTMLDivElement>) => void;
};

export function useCanvasInteractions({
  canvasRef,
  containerRef,
  tool,
  canCreateVideoPromptAreas,
  canUpdateSelection,
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
  cropMode,
  transformMode,
  onImagesChange,
  onNotesChange,
  onVideoPromptAreasChange,
  onPathsChange,
  onCommit,
  onImageSelect,
  onSelectionReplace,
  onMediaPlaybackToggle,
  onVideoPromptAreaSelect,
  onFilesDrop,
  onAnchorNoteCreate,
  onAnchorClick,
  onCropRectChange,
  setPanSmoothly,
}: UseCanvasInteractionsArgs): UseCanvasInteractionsResult {
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef<Point>({ x: 0, y: 0 });
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [pointerTemporaryTool, setPointerTemporaryTool] = useState<Tool | null>(null);
  const [keyboardTemporaryTool, setKeyboardTemporaryTool] = useState<Tool | null>(null);
  const keyboardTemporaryToolRef = useRef<Tool | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [draggedImageIds, setDraggedImageIds] = useState<string[]>([]);
  const [dragStartPoint, setDragStartPoint] = useState<Point | null>(null);
  const [dragStartImagePositions, setDragStartImagePositions] = useState<Record<string, Point> | null>(null);
  const pinDragRef = useRef<PinDragState>(null);

  const [isMarqueeSelecting, setIsMarqueeSelecting] = useState(false);
  const [marqueeStart, setMarqueeStart] = useState<Point | null>(null);
  const [marqueeCurrent, setMarqueeCurrent] = useState<Point | null>(null);
  const pendingMultiSelectGestureRef = useRef<PendingMultiSelectGesture>(null);
  const [brushPreviewPosition, setBrushPreviewPosition] = useState<{ x: number; y: number } | null>(null);
  const [videoPromptAreaStart, setVideoPromptAreaStart] = useState<Point | null>(null);
  const [videoPromptAreaCurrent, setVideoPromptAreaCurrent] = useState<Point | null>(null);

  const [cropAction, setCropAction] = useState<CropAction | null>(null);
  const [cropDragStart, setCropDragStart] = useState<{ point: Point; rect: { x: number; y: number; width: number; height: number } } | null>(null);

  const [transformAction, setTransformAction] = useState<TransformAction | null>(null);
  const [transformDragStart, setTransformDragStart] = useState<{
    point: Point;
    imageWidth: number;
    imageHeight: number;
    imageX: number;
    imageY: number;
    initialAngle: number;
    imageRotation: number;
  } | null>(null);
  const [hoveredVideoId, setHoveredVideoId] = useState<string | null>(null);

  const setKeyboardTemporaryToolOverride = useCallback((nextTool: Tool | null) => {
    keyboardTemporaryToolRef.current = nextTool; // Keep blur and keyup cleanup in sync.
    setKeyboardTemporaryTool(nextTool);
  }, []);

  const clearKeyboardTemporaryToolOverride = useCallback(() => {
    if (keyboardTemporaryToolRef.current === null) {
      return;
    }
    keyboardTemporaryToolRef.current = null; // Drop the keyboard override before the next pointer event.
    setKeyboardTemporaryTool(null);
    if (!pointerTemporaryTool && tool !== Tool.PAN && isPanningRef.current) {
      isPanningRef.current = false; // Releasing space should stop temporary pan immediately.
      setIsPanning(false);
    }
  }, [pointerTemporaryTool, tool]);

  const currentTool = pointerTemporaryTool ?? keyboardTemporaryTool ?? tool;

  const getTransformedPoint = (clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - pan.x) / scale,
      y: (clientY - rect.top - pan.y) / scale,
    };
  };

  useEffect(() => {
    if (currentTool !== Tool.BRUSH && currentTool !== Tool.ERASE) {
      setBrushPreviewPosition(null);
    }
  }, [currentTool]);

  useEffect(() => {
    if (tool === Tool.SELECTION) {
      return;
    }
    clearKeyboardTemporaryToolOverride(); // Non-selection tools should never keep the spacebar pan override.
  }, [clearKeyboardTemporaryToolOverride, tool]);

  useEffect(() => {
    const isSpaceKey = (event: KeyboardEvent): boolean => event.code === 'Space' || event.key === ' '; // Match both browser key shapes.

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isSpaceKey(event) || event.repeat) {
        return;
      }
      if (tool !== Tool.SELECTION) {
        return;
      }
      if (document.activeElement !== containerRef.current) {
        return;
      }
      event.preventDefault();
      setKeyboardTemporaryToolOverride(Tool.PAN);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!isSpaceKey(event) || keyboardTemporaryToolRef.current !== Tool.PAN) {
        return;
      }
      event.preventDefault();
      clearKeyboardTemporaryToolOverride();
    };

    const handleWindowBlur = () => {
      clearKeyboardTemporaryToolOverride(); // Browser focus changes can swallow keyup events.
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [clearKeyboardTemporaryToolOverride, containerRef, setKeyboardTemporaryToolOverride, tool]);

  useEffect(() => {
    if (!canCreateVideoPromptAreas) {
      setVideoPromptAreaStart(null);
      setVideoPromptAreaCurrent(null);
    }
  }, [canCreateVideoPromptAreas]);

  const marqueeRect = useMemo(() => {
    if ((!isMarqueeSelecting && !marqueeStart) || !marqueeStart || !marqueeCurrent) return null;
    const current = marqueeCurrent;
    const minX = Math.min(marqueeStart.x, current.x);
    const minY = Math.min(marqueeStart.y, current.y);
    const width = Math.abs(current.x - marqueeStart.x);
    const height = Math.abs(current.y - marqueeStart.y);
    return {
      left: minX * scale + pan.x,
      top: minY * scale + pan.y,
      width: width * scale,
      height: height * scale,
    };
  }, [isMarqueeSelecting, marqueeStart, marqueeCurrent, scale, pan]);

  const videoPromptAreaDraftRect = useMemo(() => {
    if (!videoPromptAreaStart || !videoPromptAreaCurrent) {
      return null;
    }
    const widthPx = Math.abs(videoPromptAreaCurrent.x - videoPromptAreaStart.x) * scale;
    const heightPx = Math.abs(videoPromptAreaCurrent.y - videoPromptAreaStart.y) * scale;
    if (Math.max(widthPx, heightPx) <= MIN_DRAG_PREVIEW_PX) {
      return null; // Clicking without dragging should not preview a minimum-sized area.
    }
    const minX = Math.min(videoPromptAreaStart.x, videoPromptAreaCurrent.x);
    const minY = Math.min(videoPromptAreaStart.y, videoPromptAreaCurrent.y);
    const width = Math.abs(videoPromptAreaCurrent.x - videoPromptAreaStart.x);
    const height = Math.abs(videoPromptAreaCurrent.y - videoPromptAreaStart.y);
    return {
      left: minX * scale + pan.x,
      top: minY * scale + pan.y,
      width: width * scale,
      height: height * scale,
    };
  }, [pan, scale, videoPromptAreaCurrent, videoPromptAreaStart]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (shouldIgnoreCanvasMouseDown(e.nativeEvent)) return; // Interactive UI cannot start Canvas gestures.
    containerRef.current?.focus({ preventScroll: true });

    if (cropMode) {
      const point = getTransformedPoint(e.clientX, e.clientY);
      const imageToCrop = images.find(img => img.id === cropMode.imageId);
      if (!imageToCrop) return;

      const action = getCropActionForPoint(point, imageToCrop, cropMode.rect, scale);
      if (action) {
        setCropAction(action);
        setCropDragStart({ point, rect: cropMode.rect });
      }
      return;
    }

    if (transformMode) {
      const point = getTransformedPoint(e.clientX, e.clientY);
      const imageToTransform = images.find(img => img.id === transformMode.imageId);
      if (!imageToTransform) return;

      const action = getTransformActionForPoint(point, imageToTransform, scale);
      if (action) {
        const centerX = imageToTransform.x + imageToTransform.width / 2;
        const centerY = imageToTransform.y + imageToTransform.height / 2;
        const initialAngle = Math.atan2(point.y - centerY, point.x - centerX);

        setTransformAction(action);
        setTransformDragStart({
          point,
          imageWidth: imageToTransform.width,
          imageHeight: imageToTransform.height,
          imageX: imageToTransform.x,
          imageY: imageToTransform.y,
          initialAngle,
          imageRotation: getImageRotation(imageToTransform),
        });
      }
      return;
    }

    let activeTool = currentTool; // Mouse handling should respect the active temporary override.
    if (e.button === 1) {
      e.preventDefault();
      activeTool = Tool.FREE_SELECTION;
      setPointerTemporaryTool(Tool.FREE_SELECTION);
    }

    const point = getTransformedPoint(e.clientX, e.clientY);

    if (canUpdateSelection && activeTool === Tool.FREE_SELECTION && e.button === 2) {
      e.preventDefault();
      onVideoPromptAreaSelect(null); // Right-click is the explicit free-select deselect gesture.
      onImageSelect(null);
      return;
    }

    if (activeTool === Tool.NOTE) {
      if (e.button !== 0) {
        return; // Only left-click places or opens pins; right/middle clicks keep their defaults.
      }
      const existingPin = getNoteAnchorAtPoint(point, notes, scale);
      if (existingPin) {
        onAnchorClick(existingPin.id);
        return;
      }
      onAnchorNoteCreate(point);
      return;
    }

    if (activeTool === Tool.VIDEO_PROMPT_AREA) {
      if (!canCreateVideoPromptAreas) {
        return;
      }
      if (canUpdateSelection) {
        onVideoPromptAreaSelect(null);
      }
      setVideoPromptAreaStart(point);
      setVideoPromptAreaCurrent(point);
      return;
    }

    const isMultiSelectKey = canUpdateSelection && (e.metaKey || e.ctrlKey);
    const wantsTailSelection = canUpdateSelection && tailSelectionEnabled && !isMultiSelectKey && e.shiftKey && !e.altKey;
    const isElementToggle = canUpdateSelection && e.altKey && !e.shiftKey && !isMultiSelectKey;
    const isReferenceToggle = canUpdateSelection && !wantsTailSelection && !isMultiSelectKey && e.shiftKey;
    const isDirectPlayImage = (image: CanvasImage | null): boolean => Boolean(
      e.button === 0
      && !isMultiSelectKey
      && !wantsTailSelection
      && !isElementToggle
      && !isReferenceToggle
      && image?.mediaType === 'video'
      && image.element instanceof HTMLVideoElement
      && image.element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      && isPointInVideoPlayControl(point, image, scale)
    ); // Keep the painted Play control available to selection and pan gestures.

    const beginDrag = (imageIdsToDrag: string[]) => {
      const imagePositions: Record<string, Point> = {};
      imageIdsToDrag.forEach(id => {
        const img = images.find(image => image.id === id);
        if (img) {
          imagePositions[id] = { x: img.x, y: img.y };
        }
      });

      setIsDragging(true);
      setDragStartPoint({ x: e.clientX, y: e.clientY });
      setDraggedImageIds(imageIdsToDrag);
      setDragStartImagePositions(Object.keys(imagePositions).length ? imagePositions : null);
    };

    if (activeTool === Tool.SELECTION || activeTool === Tool.FREE_SELECTION) {
      if (!canUpdateSelection) {
        if (activeTool === Tool.FREE_SELECTION) {
          const start = { x: e.clientX - pan.x, y: e.clientY - pan.y }; // Free-select can still act as a navigation hand.
          panStartRef.current = start;
          setPanStart(start);
          isPanningRef.current = true;
          setIsPanning(true);
        }
        return;
      }

      // Note anchor pins sit above images: click opens the note, drag repositions the pin.
      const pin = getNoteAnchorAtPoint(point, notes, scale);
      if (pin?.anchor && e.button === 0) {
        pinDragRef.current = {
          noteId: pin.id,
          startClientPoint: { x: e.clientX, y: e.clientY },
          startAnchor: { ...pin.anchor },
          moved: false,
        };
        return;
      }

      if (isMultiSelectKey && e.button === 0) {
        const image = getImageAtPoint(point, images);
        if (image) {
          onVideoPromptAreaSelect(null);
          pendingMultiSelectGestureRef.current = {
            startPoint: point,
            startClientPoint: { x: e.clientX, y: e.clientY },
            targetImageId: image.id,
            didStartMarquee: false,
          }; // Defer Cmd/Ctrl toggles until we know this was not a drag.
          return;
        }
      }

      const image = getImageAtPoint(point, images);
      if (image) {
        if (isDirectPlayImage(image)) {
          onVideoPromptAreaSelect(null);
          if (!selectedImageIds.includes(image.id)) {
            onImageSelect(image.id);
          }
          onMediaPlaybackToggle(image.id);
          return;
        } // The painted center Play affordance must work even when the lower action bar is obscured.
        if (wantsTailSelection) {
          onVideoPromptAreaSelect(null);
          onImageSelect(image.id, { lastFrame: true });
          return;
        }
        if (isElementToggle) {
          onVideoPromptAreaSelect(null);
          onImageSelect(image.id, { element: true });
          return;
        }
        if (isReferenceToggle) {
          onVideoPromptAreaSelect(null);
          onImageSelect(image.id, { reference: true });
          return;
        }
        if (isMultiSelectKey) {
          onVideoPromptAreaSelect(null);
          onImageSelect(image.id, { multi: true });
          return;
        }

        const imageAlreadySelected = selectedImageIds.includes(image.id);
        if (!imageAlreadySelected) {
          onVideoPromptAreaSelect(null);
          onImageSelect(image.id);
        }

        const imageIdsToDrag = imageAlreadySelected ? selectedImageIds : [image.id];

        onVideoPromptAreaSelect(null);
        beginDrag(imageIdsToDrag);
        return;
      }

      const area = [...videoPromptAreas].reverse().find(currentArea => isPointInRect(point, currentArea));
      if (area && !isMultiSelectKey) {
        onImageSelect(null);
        onVideoPromptAreaSelect(area.id);
        return;
      }

      if (!isMultiSelectKey && activeTool === Tool.SELECTION) {
        onVideoPromptAreaSelect(null);
        onImageSelect(null);
      }
      if (isMultiSelectKey) {
        setIsMarqueeSelecting(true);
        setMarqueeStart(point);
        setMarqueeCurrent(point);
        return;
      }

      if (activeTool === Tool.FREE_SELECTION) {
        const start = { x: e.clientX - pan.x, y: e.clientY - pan.y }; // Left-click pans only; right-click clears selection.
        panStartRef.current = start;
        setPanStart(start);
        isPanningRef.current = true;
        setIsPanning(true);
      }
      return;
    }

    if (activeTool === Tool.PAN) {
      if (canUpdateSelection && (isElementToggle || isReferenceToggle || wantsTailSelection)) {
        const image = getImageAtPoint(point, images);
        if (image) {
          if (wantsTailSelection) {
            onVideoPromptAreaSelect(null);
            onImageSelect(image.id, { lastFrame: true });
            return;
          }
          if (isElementToggle) {
            onVideoPromptAreaSelect(null);
            onImageSelect(image.id, { element: true });
            return;
          }
          if (isReferenceToggle) {
            onVideoPromptAreaSelect(null);
            onImageSelect(image.id, { reference: true });
            return;
          }
        }
      }
      const image = getImageAtPoint(point, images);
      if (image && isDirectPlayImage(image)) {
        onMediaPlaybackToggle(image.id);
        return;
      } // Pan and presentation modes hide or bypass the selected-item playback bar.
      setIsPanning(true);
      const start = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      panStartRef.current = start;
      setPanStart(start);
      isPanningRef.current = true;
    } else if (activeTool === Tool.BRUSH || activeTool === Tool.ERASE) {
      if (appMode === 'CANVAS') {
        return;
      }
      setIsDrawing(true);

      let pathTool: Tool = activeTool;
      if (activeTool === Tool.BRUSH) {
        if (appMode === 'ANNOTATE') {
          pathTool = Tool.ANNOTATE;
        } else {
          return;
        }
      }

      const baseStrokeSize = activeTool === Tool.ERASE ? eraserSize : brushSize;
      const newPath: Path = {
        points: [point],
        color: brushColor,
        size: baseStrokeSize / scale,
        tool: pathTool,
      };
      onPathsChange([...paths, newPath]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    const isBrushLikeTool = currentTool === Tool.BRUSH || currentTool === Tool.ERASE;
    if (container && isBrushLikeTool) {
      const rect = container.getBoundingClientRect();
      const nextPosition = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setBrushPreviewPosition(nextPosition);
    } else if (brushPreviewPosition !== null) {
      setBrushPreviewPosition(null);
    }

    const hoverPoint = getTransformedPoint(e.clientX, e.clientY);
    const hoveredImage = getImageAtPoint(hoverPoint, images);
    if (hoveredImage?.mediaType === 'video') {
      if (hoveredVideoId !== hoveredImage.id) {
        setHoveredVideoId(hoveredImage.id);
      }
    } else if (hoveredVideoId !== null) {
      setHoveredVideoId(null);
    }

    const pinDrag = pinDragRef.current;
    if (pinDrag) {
      const dx = e.clientX - pinDrag.startClientPoint.x;
      const dy = e.clientY - pinDrag.startClientPoint.y;
      if (!pinDrag.moved && Math.max(Math.abs(dx), Math.abs(dy)) <= MIN_DRAG_PREVIEW_PX) {
        return; // Still a click candidate.
      }
      pinDrag.moved = true;
      const nextAnchor = {
        x: pinDrag.startAnchor.x + dx / scale,
        y: pinDrag.startAnchor.y + dy / scale,
      };
      onNotesChange(notes.map(note => (note.id === pinDrag.noteId ? { ...note, anchor: nextAnchor } : note)));
      return;
    }

    const pendingMultiSelectGesture = pendingMultiSelectGestureRef.current;
    if (pendingMultiSelectGesture) {
      const dx = Math.abs(e.clientX - pendingMultiSelectGesture.startClientPoint.x);
      const dy = Math.abs(e.clientY - pendingMultiSelectGesture.startClientPoint.y);
      if (!pendingMultiSelectGesture.didStartMarquee && Math.max(dx, dy) > MIN_DRAG_PREVIEW_PX) {
        pendingMultiSelectGesture.didStartMarquee = true; // Promote the click candidate into a drag marquee.
        setIsMarqueeSelecting(true);
        setMarqueeStart(pendingMultiSelectGesture.startPoint);
      }
      if (pendingMultiSelectGesture.didStartMarquee) {
        setMarqueeCurrent(hoverPoint);
        return;
      }
    }

    if (isMarqueeSelecting) {
      setMarqueeCurrent(hoverPoint);
      return;
    }

    if (videoPromptAreaStart) {
      setVideoPromptAreaCurrent(hoverPoint);
      return;
    }

    if (cropMode && cropAction && cropDragStart) {
      const point = hoverPoint;
      const imageToCrop = images.find(img => img.id === cropMode.imageId);
      if (!imageToCrop) return;

      const dx = point.x - cropDragStart.point.x;
      const dy = point.y - cropDragStart.point.y;
      const startRect = cropDragStart.rect;
      let newRect = { ...startRect };

      switch (cropAction) {
        case 'move':
          newRect.x += dx;
          newRect.y += dy;
          break;
        case 'resize-tl':
          newRect.x += dx; newRect.y += dy; newRect.width -= dx; newRect.height -= dy;
          break;
        case 'resize-t':
          newRect.y += dy; newRect.height -= dy;
          break;
        case 'resize-tr':
          newRect.y += dy; newRect.width += dx; newRect.height -= dy;
          break;
        case 'resize-r':
          newRect.width += dx;
          break;
        case 'resize-br':
          newRect.width += dx; newRect.height += dy;
          break;
        case 'resize-b':
          newRect.height += dy;
          break;
        case 'resize-bl':
          newRect.x += dx; newRect.width -= dx; newRect.height += dy;
          break;
        case 'resize-l':
          newRect.x += dx; newRect.width -= dx;
          break;
      }

      if (newRect.width < 0) { newRect.x += newRect.width; newRect.width *= -1; }
      if (newRect.height < 0) { newRect.y += newRect.height; newRect.height *= -1; }

      newRect.x = Math.max(0, newRect.x);
      newRect.y = Math.max(0, newRect.y);
      if (newRect.x + newRect.width > imageToCrop.width) { newRect.width = imageToCrop.width - newRect.x; }
      if (newRect.y + newRect.height > imageToCrop.height) { newRect.height = imageToCrop.height - newRect.y; }

      onCropRectChange(newRect);
      return;
    }

    if (transformMode && transformAction && transformDragStart) {
      const point = hoverPoint;
      const imageToTransform = images.find(img => img.id === transformMode.imageId);
      if (!imageToTransform) return;

      const startWidth = transformDragStart.imageWidth;
      const startHeight = transformDragStart.imageHeight;
      const startX = transformDragStart.imageX;
      const startY = transformDragStart.imageY;
      const startRotation = transformDragStart.imageRotation;
      const aspectRatio = startWidth / startHeight;

      const uniformScale = !e.shiftKey;

      let newWidth = startWidth;
      let newHeight = startHeight;
      let newX = startX;
      let newY = startY;

      const MIN_IMAGE_SIZE = 20;

      if (transformAction === 'rotate') {
        const centerX = startX + startWidth / 2;
        const centerY = startY + startHeight / 2;
        const currentAngle = Math.atan2(point.y - centerY, point.x - centerX);
        const deltaAngle = currentAngle - transformDragStart.initialAngle;
        let newRotation = startRotation + deltaAngle;
        if (!Number.isFinite(newRotation)) {
          newRotation = startRotation;
        }

        const updatedImages = images.map(img => {
          if (img.id !== transformMode.imageId) return img;
          return { ...img, rotation: newRotation };
        });
        onImagesChange(updatedImages);
        return;
      } else {
        const currentLocalPoint = worldToImageLocal(point, { ...imageToTransform, rotation: startRotation });
        const startLocalPoint = worldToImageLocal(transformDragStart.point, { ...imageToTransform, rotation: startRotation });
        const dx = currentLocalPoint.x - startLocalPoint.x;
        const dy = currentLocalPoint.y - startLocalPoint.y;

        switch (transformAction) {
          case 'scale-br':
            newWidth = Math.max(MIN_IMAGE_SIZE, startWidth + dx);
            if (uniformScale) {
              newHeight = newWidth / aspectRatio;
            } else {
              newHeight = Math.max(MIN_IMAGE_SIZE, startHeight + dy);
            }
            break;
          case 'scale-bl':
            newWidth = Math.max(MIN_IMAGE_SIZE, startWidth - dx);
            if (uniformScale) {
              newHeight = newWidth / aspectRatio;
            } else {
              newHeight = Math.max(MIN_IMAGE_SIZE, startHeight + dy);
            }
            newX = startX + startWidth - newWidth;
            break;
          case 'scale-tr':
            newWidth = Math.max(MIN_IMAGE_SIZE, startWidth + dx);
            if (uniformScale) {
              newHeight = newWidth / aspectRatio;
            } else {
              newHeight = Math.max(MIN_IMAGE_SIZE, startHeight - dy);
            }
            newY = startY + startHeight - newHeight;
            break;
          case 'scale-tl':
            newWidth = Math.max(MIN_IMAGE_SIZE, startWidth - dx);
            if (uniformScale) {
              newHeight = newWidth / aspectRatio;
            } else {
              newHeight = Math.max(MIN_IMAGE_SIZE, startHeight - dy);
            }
            newX = startX + startWidth - newWidth;
            newY = startY + startHeight - newHeight;
            break;
          case 'scale-r':
            newWidth = Math.max(MIN_IMAGE_SIZE, startWidth + dx);
            if (uniformScale) {
              newHeight = newWidth / aspectRatio;
              newY = startY + (startHeight - newHeight) / 2;
            }
            break;
          case 'scale-l':
            newWidth = Math.max(MIN_IMAGE_SIZE, startWidth - dx);
            newX = startX + startWidth - newWidth;
            if (uniformScale) {
              newHeight = newWidth / aspectRatio;
              newY = startY + (startHeight - newHeight) / 2;
            }
            break;
          case 'scale-b':
            newHeight = Math.max(MIN_IMAGE_SIZE, startHeight + dy);
            if (uniformScale) {
              newWidth = newHeight * aspectRatio;
              newX = startX + (startWidth - newWidth) / 2;
            }
            break;
          case 'scale-t':
            newHeight = Math.max(MIN_IMAGE_SIZE, startHeight - dy);
            newY = startY + startHeight - newHeight;
            if (uniformScale) {
              newWidth = newHeight * aspectRatio;
              newX = startX + (startWidth - newWidth) / 2;
            }
            break;
        }
      }

      const updatedImages = images.map(img => {
        if (img.id !== transformMode.imageId) return img;
        return { ...img, x: newX, y: newY, width: newWidth, height: newHeight };
      });
      onImagesChange(updatedImages);
      return;
    }

    if (isPanningRef.current) {
      const start = panStartRef.current;
      setPanSmoothly({ x: e.clientX - start.x, y: e.clientY - start.y });
      return;
    }

    if (canUpdateSelection && isDragging && (currentTool === Tool.SELECTION || currentTool === Tool.FREE_SELECTION) && dragStartPoint) {
      const dx = (e.clientX - dragStartPoint.x) / scale;
      const dy = (e.clientY - dragStartPoint.y) / scale;

      if (draggedImageIds.length && dragStartImagePositions) {
        const updatedImages = images.map(image => {
          if (!draggedImageIds.includes(image.id)) return image;
          const startPosition = dragStartImagePositions[image.id];
          if (!startPosition) return image;
          const nextX = startPosition.x + dx;
          const nextY = startPosition.y + dy;
          return { ...image, x: nextX, y: nextY };
        });
        onImagesChange(updatedImages);
      }
      return;
    }

    if (containerRef.current) {
      const point = getTransformedPoint(e.clientX, e.clientY);
      let cursor = containerRef.current.style.cursor;

      if (cropMode) {
        const imageToCrop = images.find(img => img.id === cropMode.imageId);
        const action = imageToCrop ? getCropActionForPoint(point, imageToCrop, cropMode.rect, scale) : null;
        switch (action) {
          case 'move': cursor = 'move'; break;
          case 'resize-tl': case 'resize-br': cursor = 'nwse-resize'; break;
          case 'resize-tr': case 'resize-bl': cursor = 'nesw-resize'; break;
          case 'resize-t': case 'resize-b': cursor = 'ns-resize'; break;
          case 'resize-r': case 'resize-l': cursor = 'ew-resize'; break;
          default: cursor = 'default';
        }
      } else if (transformMode) {
        const imageToTransform = images.find(img => img.id === transformMode.imageId);
        const action = imageToTransform ? getTransformActionForPoint(point, imageToTransform, scale) : null;
        switch (action) {
          case 'rotate': cursor = 'grab'; break;
          case 'scale-tl': case 'scale-br': cursor = 'nwse-resize'; break;
          case 'scale-tr': case 'scale-bl': cursor = 'nesw-resize'; break;
          case 'scale-t': case 'scale-b': cursor = 'ns-resize'; break;
          case 'scale-r': case 'scale-l': cursor = 'ew-resize'; break;
          default: cursor = 'default';
        }
      } else if (canUpdateSelection && (currentTool === Tool.SELECTION || currentTool === Tool.FREE_SELECTION) && !isDragging && !isPanning) {
        const objectOnPoint = getNoteAnchorAtPoint(point, notes, scale) || getImageAtPoint(point, images);
        const baseCursor = currentTool === Tool.SELECTION ? 'default' : 'grab';
        cursor = objectOnPoint ? 'pointer' : baseCursor;
      }
      containerRef.current.style.cursor = cursor;
    }

    if (!isDrawing) return;

    const point = getTransformedPoint(e.clientX, e.clientY);
    const newPaths = [...paths];
    newPaths[newPaths.length - 1].points.push(point);
    onPathsChange(newPaths);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.type === 'mouseleave') {
      setBrushPreviewPosition(null);
      setHoveredVideoId(null);
    }

    if (cropMode && cropAction) {
      setCropAction(null);
      setCropDragStart(null);
      return;
    }

    if (transformMode && transformAction) {
      setTransformAction(null);
      setTransformDragStart(null);
      onCommit();
      return;
    }

    const pinDrag = pinDragRef.current;
    if (pinDrag) {
      pinDragRef.current = null;
      if (pinDrag.moved) {
        onCommit(); // Merge the live anchor position into history.
      } else if (e.type !== 'mouseleave') {
        onAnchorClick(pinDrag.noteId); // A stationary press-release opens the note.
      }
      return;
    }

    const pendingMultiSelectGesture = pendingMultiSelectGestureRef.current;

    if (canUpdateSelection && (isMarqueeSelecting || pendingMultiSelectGesture?.didStartMarquee) && marqueeStart) {
      const finalPoint = getTransformedPoint(e.clientX, e.clientY);
      const currentPoint = marqueeCurrent ?? finalPoint;

      const bounds = {
        minX: Math.min(marqueeStart.x, currentPoint.x),
        maxX: Math.max(marqueeStart.x, currentPoint.x),
        minY: Math.min(marqueeStart.y, currentPoint.y),
        maxY: Math.max(marqueeStart.y, currentPoint.y),
      };

      const pixelWidth = Math.abs(currentPoint.x - marqueeStart.x) * scale;
      const pixelHeight = Math.abs(currentPoint.y - marqueeStart.y) * scale;
      const isSignificant = Math.max(pixelWidth, pixelHeight) > 3;

      if (isSignificant) {
        const imageIdsInBounds = images
          .filter(img => {
            const b = getImageBounds(img);
            return b.minX < bounds.maxX &&
              b.maxX > bounds.minX &&
              b.minY < bounds.maxY &&
              b.maxY > bounds.minY;
          })
          .map(img => img.id);
        onVideoPromptAreaSelect(null);
        onSelectionReplace(imageIdsInBounds); // Replace image selection without clearing source media.
      }
    }

    if (videoPromptAreaStart && videoPromptAreaCurrent) {
      if (!canCreateVideoPromptAreas) {
        setVideoPromptAreaStart(null);
        setVideoPromptAreaCurrent(null);
        return;
      }
      const pixelWidth = Math.abs(videoPromptAreaCurrent.x - videoPromptAreaStart.x) * scale;
      const pixelHeight = Math.abs(videoPromptAreaCurrent.y - videoPromptAreaStart.y) * scale;
      if (Math.max(pixelWidth, pixelHeight) <= MIN_DRAG_PREVIEW_PX) {
        setVideoPromptAreaStart(null);
        setVideoPromptAreaCurrent(null);
        return;
      }
      const normalizedRect = clampAreaRect({
        x: videoPromptAreaStart.x,
        y: videoPromptAreaStart.y,
        width: videoPromptAreaCurrent.x - videoPromptAreaStart.x,
        height: videoPromptAreaCurrent.y - videoPromptAreaStart.y,
      });
      const nextSequence = videoPromptAreas.reduce((maxSequence, area) => Math.max(maxSequence, area.sequence), 0) + 1;
      const nextAreaId = crypto.randomUUID();
      const nextAreas = syncVideoPromptAreaMembership([
        ...videoPromptAreas,
        {
          id: nextAreaId,
          sequence: nextSequence,
          label: buildVideoPromptAreaLabel(nextSequence),
          borderColor: DEFAULT_VIDEO_PROMPT_AREA_BORDER_COLOR,
          promptBarId: null,
          orderedMediaIds: [],
          ...normalizedRect,
        },
      ], images);
      onVideoPromptAreasChange(nextAreas);
      onCommit({ videoPromptAreas: nextAreas });
      if (canUpdateSelection) {
        onVideoPromptAreaSelect(nextAreaId);
      }
      setVideoPromptAreaStart(null);
      setVideoPromptAreaCurrent(null);
      return;
    }

    if (isMarqueeSelecting) {
      setIsMarqueeSelecting(false);
      setMarqueeStart(null);
      setMarqueeCurrent(null);
    }

    pendingMultiSelectGestureRef.current = null; // Every mouseup ends a pending Cmd/Ctrl click-drag.
    if (canUpdateSelection && pendingMultiSelectGesture && !pendingMultiSelectGesture.didStartMarquee) {
      if (e.type === 'mouseleave') {
        return;
      }
      onVideoPromptAreaSelect(null);
      if (pendingMultiSelectGesture.targetImageId) {
        onImageSelect(pendingMultiSelectGesture.targetImageId, { multi: true });
      }
      return;
    }

    if (e.button === 1) {
      if (pointerTemporaryTool) {
        setPointerTemporaryTool(null);
      }
      if (isPanning) {
        isPanningRef.current = false;
        setIsPanning(false);
      }
      if (isDragging) {
        onCommit();
        setIsDragging(false);
        setDragStartPoint(null);
        setDragStartImagePositions(null);
        setDraggedImageIds([]);
      }
      return;
    }

    if (pointerTemporaryTool && e.type === 'mouseleave') {
      setPointerTemporaryTool(null);
    }

    const wasActive = isDrawing || isDragging;

    setIsDrawing(false);
    isPanningRef.current = false;
    setIsPanning(false);
    setIsDragging(false);

    setDragStartPoint(null);
    setDragStartImagePositions(null);
    setDraggedImageIds([]);

    if (wasActive) {
      if (draggedImageIds.length > 0) {
        const nextAreas = syncVideoPromptAreaMembership(videoPromptAreas, images, {
          profileByAreaId: videoPromptAreaProfiles,
          modifiers: { shiftKey: e.shiftKey, altKey: e.altKey },
        });
        onVideoPromptAreasChange(nextAreas);
        onCommit({ images, videoPromptAreas: nextAreas });
        return;
      }
      onCommit();
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isCanvasInteractiveTarget(e.target)) return; // Portaled controls must not act on the canvas underneath them.
    if (!canUpdateSelection) return;
    if (cropMode) return;
    const point = getTransformedPoint(e.clientX, e.clientY);
    const pin = getNoteAnchorAtPoint(point, notes, scale);
    if (pin) {
      onAnchorClick(pin.id);
    }
  };

  const stopBoundaryDragEvent = (e: React.DragEvent<HTMLDivElement>): boolean => {
    if (!isCanvasInteractionBoundaryTarget(e.target)) {
      return false;
    }
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    return true;
  }; // Keeps detached controls from becoming logical Canvas drop targets through React portals.

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (stopBoundaryDragEvent(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (stopBoundaryDragEvent(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (stopBoundaryDragEvent(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const point = getTransformedPoint(e.clientX, e.clientY);
      onFilesDrop(e.dataTransfer.files, point);
    }
  };

  return {
    currentTool,
    hoveredVideoId,
    isDrawing,
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
  };
}
