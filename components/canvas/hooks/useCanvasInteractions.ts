import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type React from 'react';
import { type AppMode, type CanvasImage, type CanvasNote, type CanvasVideoPromptArea, type Path, type Point, Tool } from '../../../types';
import { MIN_NOTE_HEIGHT, MIN_NOTE_WIDTH, RESIZE_HANDLE_SIZE } from '../constants';
import { getImageBounds, getImageRotation, worldToImageLocal } from '../geometry';
import {
  getCropActionForPoint,
  getImageAtPoint,
  getNoteAtPoint,
  getTransformActionForPoint,
  type CropAction,
  type TransformAction,
} from '../hitTest';
import { DEFAULT_NOTE_BACKGROUND, DEFAULT_VIDEO_PROMPT_AREA_BORDER_COLOR } from '../../../utils/canvasColorOptions';
import { buildVideoPromptAreaLabel, clampAreaRect, isPointInRect, syncVideoPromptAreaMembership } from '../../../utils/videoPromptAreas';

const MIN_DRAG_PREVIEW_PX = 3; // Match marquee selection so area previews only appear after a real drag starts.

type CropModeState = { imageId: string; rect: { x: number; y: number; width: number; height: number } } | null;
type TransformModeState = { imageId: string } | null;

type UseCanvasInteractionsArgs = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  tool: Tool;
  canCreateVideoPromptAreas: boolean;
  appMode: AppMode;
  images: CanvasImage[];
  notes: CanvasNote[];
  videoPromptAreas: CanvasVideoPromptArea[];
  paths: Path[];
  isNoteEditing: boolean;
  pan: Point;
  scale: number;
  brushSize: number;
  eraserSize: number;
  brushColor: string;
  selectedImageIds: string[];
  selectedNoteIds: string[];
  primarySelectedNoteId: string | null;
  tailSelectionEnabled: boolean;
  cropMode: CropModeState;
  transformMode: TransformModeState;
  onImagesChange: (images: CanvasImage[]) => void;
  onNotesChange: (notes: CanvasNote[]) => void;
  onVideoPromptAreasChange: (areas: CanvasVideoPromptArea[]) => void;
  onPathsChange: (paths: Path[]) => void;
  onCommit: (overrides?: { images?: CanvasImage[]; paths?: Path[]; notes?: CanvasNote[]; videoPromptAreas?: CanvasVideoPromptArea[] }) => void;
  onImageSelect: (id: string | null, options?: { multi?: boolean; reference?: boolean; lastFrame?: boolean; element?: boolean }) => void;
  onNoteSelect: (id: string | null, options?: { multi?: boolean }) => void;
  onVideoPromptAreaSelect: (id: string | null) => void;
  onFilesDrop: (files: FileList, point: Point) => void;
  onNoteDoubleClick: (id: string) => void;
  onCropRectChange: (rect: { x: number; y: number; width: number; height: number }) => void;
  setPanSmoothly: (nextPan: Point) => Point;
};

type UseCanvasInteractionsResult = {
  currentTool: Tool;
  hoveredVideoId: string | null;
  isDrawing: boolean;
  isPanning: boolean;
  isDragging: boolean;
  isResizing: boolean;
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
  appMode,
  images,
  notes,
  videoPromptAreas,
  paths,
  isNoteEditing,
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
  const [isResizing, setIsResizing] = useState(false);
  const [draggedImageIds, setDraggedImageIds] = useState<string[]>([]);
  const [draggedNoteIds, setDraggedNoteIds] = useState<string[]>([]);
  const [dragStartPoint, setDragStartPoint] = useState<Point | null>(null);
  const [dragStartImagePositions, setDragStartImagePositions] = useState<Record<string, Point> | null>(null);
  const [dragStartNotePositions, setDragStartNotePositions] = useState<Record<string, Point> | null>(null);
  const [resizeStartDimensions, setResizeStartDimensions] = useState<{ width: number; height: number } | null>(null);

  const [isMarqueeSelecting, setIsMarqueeSelecting] = useState(false);
  const [marqueeStart, setMarqueeStart] = useState<Point | null>(null);
  const [marqueeCurrent, setMarqueeCurrent] = useState<Point | null>(null);
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

    if ((e.target as HTMLElement).closest('button')) return;
    if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;

    let activeTool = currentTool; // Mouse handling should respect the active temporary override.
    if (e.button === 1) {
      e.preventDefault();
      activeTool = Tool.FREE_SELECTION;
      setPointerTemporaryTool(Tool.FREE_SELECTION);
    }

    const point = getTransformedPoint(e.clientX, e.clientY);

    if (activeTool === Tool.NOTE) {
      if (isNoteEditing) {
        return;
      }
      const newNote: CanvasNote = {
        id: crypto.randomUUID(),
        x: point.x - 300,
        y: point.y - 150,
        width: 600,
        height: 300,
        text: '',
        backgroundColor: DEFAULT_NOTE_BACKGROUND,
      };
      const updatedNotes = [...notes, newNote];
      onNotesChange(updatedNotes);
      onCommit({ notes: updatedNotes });
      onVideoPromptAreaSelect(null);
      onNoteSelect(newNote.id);
      onNoteDoubleClick(newNote.id);
      return;
    }

    if (activeTool === Tool.VIDEO_PROMPT_AREA) {
      if (!canCreateVideoPromptAreas) {
        return;
      }
      onVideoPromptAreaSelect(null);
      setVideoPromptAreaStart(point);
      setVideoPromptAreaCurrent(point);
      return;
    }

    const isMultiSelectKey = e.metaKey || e.ctrlKey;
    const wantsTailSelection = tailSelectionEnabled && !isMultiSelectKey && e.shiftKey && !e.altKey;
    const isElementToggle = e.altKey && !e.shiftKey && !isMultiSelectKey;
    const isReferenceToggle = !wantsTailSelection && !isMultiSelectKey && e.shiftKey;

    const beginDrag = (imageIdsToDrag: string[], noteIdsToDrag: string[]) => {
      const imagePositions: Record<string, Point> = {};
      imageIdsToDrag.forEach(id => {
        const img = images.find(image => image.id === id);
        if (img) {
          imagePositions[id] = { x: img.x, y: img.y };
        }
      });

      const notePositions: Record<string, Point> = {};
      noteIdsToDrag.forEach(id => {
        const noteItem = notes.find(n => n.id === id);
        if (noteItem) {
          notePositions[id] = { x: noteItem.x, y: noteItem.y };
        }
      });

      setIsDragging(true);
      setDragStartPoint({ x: e.clientX, y: e.clientY });
      setDraggedImageIds(imageIdsToDrag);
      setDraggedNoteIds(noteIdsToDrag);
      setDragStartImagePositions(Object.keys(imagePositions).length ? imagePositions : null);
      setDragStartNotePositions(Object.keys(notePositions).length ? notePositions : null);
    };

    if (activeTool === Tool.SELECTION || activeTool === Tool.FREE_SELECTION) {
      const resizableNote = selectedNoteIds.length === 1
        ? notes.find(n => n.id === primarySelectedNoteId)
        : null;
      if (resizableNote) {
        const handleSize = RESIZE_HANDLE_SIZE / scale;
        const resizeHandleX = resizableNote.x + resizableNote.width - handleSize;
        const resizeHandleY = resizableNote.y + resizableNote.height - handleSize;

        if (point.x >= resizeHandleX && point.y >= resizeHandleY) {
          setIsResizing(true);
          setDraggedNoteIds([resizableNote.id]);
          setDragStartPoint({ x: e.clientX, y: e.clientY });
          setResizeStartDimensions({ width: resizableNote.width, height: resizableNote.height });
          return;
        }
      }
    }

    if (activeTool === Tool.SELECTION || activeTool === Tool.FREE_SELECTION) {
      const note = getNoteAtPoint(point, notes);
      if (note) {
        const wantsNoteMultiSelect = isMultiSelectKey || e.shiftKey;
        if (wantsNoteMultiSelect) {
          onVideoPromptAreaSelect(null);
          onNoteSelect(note.id, { multi: true });
          return;
        }

        const noteAlreadySelected = selectedNoteIds.includes(note.id);
        if (!noteAlreadySelected) {
          onVideoPromptAreaSelect(null);
          onNoteSelect(note.id);
        }

        const noteIdsToDrag = noteAlreadySelected ? selectedNoteIds : [note.id];
        const imageIdsToDrag = noteAlreadySelected ? selectedImageIds : [];

        onVideoPromptAreaSelect(null);
        beginDrag(imageIdsToDrag, noteIdsToDrag);
        return;
      }

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
        const noteIdsToDrag = imageAlreadySelected ? selectedNoteIds : [];

        onVideoPromptAreaSelect(null);
        beginDrag(imageIdsToDrag, noteIdsToDrag);
        return;
      }

      const area = [...videoPromptAreas].reverse().find(currentArea => isPointInRect(point, currentArea));
      if (area && !isMultiSelectKey) {
        onImageSelect(null);
        onNoteSelect(null);
        onVideoPromptAreaSelect(area.id);
        return;
      }

      if (!isMultiSelectKey) {
        onVideoPromptAreaSelect(null);
        onImageSelect(null);
        onNoteSelect(null);
      }
      if (isMultiSelectKey) {
        setIsMarqueeSelecting(true);
        setMarqueeStart(point);
        setMarqueeCurrent(point);
        return;
      }

      if (activeTool === Tool.FREE_SELECTION) {
        const start = { x: e.clientX - pan.x, y: e.clientY - pan.y };
        panStartRef.current = start;
        setPanStart(start);
        isPanningRef.current = true;
        setIsPanning(true);
      }
      return;
    }

    if (activeTool === Tool.PAN) {
      if (isElementToggle || isReferenceToggle || wantsTailSelection) {
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

    if (isResizing && draggedNoteIds.length === 1 && dragStartPoint && resizeStartDimensions) {
      const noteId = draggedNoteIds[0];
      const dx = (e.clientX - dragStartPoint.x) / scale;
      const dy = (e.clientY - dragStartPoint.y) / scale;

      const newWidth = Math.max(MIN_NOTE_WIDTH, resizeStartDimensions.width + dx);
      const newHeight = Math.max(MIN_NOTE_HEIGHT, resizeStartDimensions.height + dy);

      const noteIndex = notes.findIndex(n => n.id === noteId);
      if (noteIndex === -1) return;

      const newNotes = [...notes];
      newNotes[noteIndex] = { ...newNotes[noteIndex], width: newWidth, height: newHeight };
      onNotesChange(newNotes);
      return;
    }

    if (isPanningRef.current) {
      const start = panStartRef.current;
      setPanSmoothly({ x: e.clientX - start.x, y: e.clientY - start.y });
      return;
    }

    if (isDragging && (currentTool === Tool.SELECTION || currentTool === Tool.FREE_SELECTION) && dragStartPoint) {
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

      if (draggedNoteIds.length && dragStartNotePositions) {
        const updatedNotes = notes.map(noteItem => {
          if (!draggedNoteIds.includes(noteItem.id)) return noteItem;
          const startPosition = dragStartNotePositions[noteItem.id];
          if (!startPosition) return noteItem;
          const nextX = startPosition.x + dx;
          const nextY = startPosition.y + dy;
          return { ...noteItem, x: nextX, y: nextY };
        });
        onNotesChange(updatedNotes);
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
      } else if ((currentTool === Tool.SELECTION || currentTool === Tool.FREE_SELECTION) && !isDragging && !isPanning && !isResizing) {
        const selectedNote = selectedNoteIds.length === 1
          ? notes.find(n => n.id === primarySelectedNoteId)
          : null;
        let onResizeHandle = false;

        if (selectedNote) {
          const handleSize = RESIZE_HANDLE_SIZE / scale;
          const resizeHandleX = selectedNote.x + selectedNote.width - handleSize;
          const resizeHandleY = selectedNote.y + selectedNote.height - handleSize;
          if (point.x >= resizeHandleX && point.x <= selectedNote.x + selectedNote.width &&
            point.y >= resizeHandleY && point.y <= selectedNote.y + selectedNote.height) {
            onResizeHandle = true;
          }
        }

        if (onResizeHandle) {
          cursor = 'nwse-resize';
        } else {
          const objectOnPoint = getImageAtPoint(point, images) || getNoteAtPoint(point, notes);
          const baseCursor = currentTool === Tool.SELECTION ? 'default' : 'grab';
          cursor = objectOnPoint ? 'pointer' : baseCursor;
        }
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

    if (isMarqueeSelecting && marqueeStart) {
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
        const noteIdsInBounds = notes
          .filter(note =>
            note.x < bounds.maxX &&
            note.x + note.width > bounds.minX &&
            note.y < bounds.maxY &&
            note.y + note.height > bounds.minY
          )
          .map(note => note.id);

        if (imageIdsInBounds.length === 0 && noteIdsInBounds.length === 0) {
          onVideoPromptAreaSelect(null);
          onImageSelect(null);
          onNoteSelect(null);
        } else {
          onVideoPromptAreaSelect(null);
          imageIdsInBounds.forEach(id => onImageSelect(id, { multi: true }));
          noteIdsInBounds.forEach(id => onNoteSelect(id, { multi: true }));
        }
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
      onVideoPromptAreaSelect(nextAreaId);
      setVideoPromptAreaStart(null);
      setVideoPromptAreaCurrent(null);
      return;
    }

    if (isMarqueeSelecting) {
      setIsMarqueeSelecting(false);
      setMarqueeStart(null);
      setMarqueeCurrent(null);
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
        setDragStartNotePositions(null);
        setDraggedNoteIds([]);
      }
      return;
    }

    if (pointerTemporaryTool && e.type === 'mouseleave') {
      setPointerTemporaryTool(null);
    }

    const wasActive = isDrawing || isDragging || isResizing;

    setIsDrawing(false);
    isPanningRef.current = false;
    setIsPanning(false);
    setIsDragging(false);
    setIsResizing(false);

    setDragStartPoint(null);
    setDragStartImagePositions(null);
    setDraggedImageIds([]);
    setDragStartNotePositions(null);
    setDraggedNoteIds([]);
    setResizeStartDimensions(null);

    if (wasActive) {
      if (draggedImageIds.length > 0) {
        const nextAreas = syncVideoPromptAreaMembership(videoPromptAreas, images);
        onVideoPromptAreasChange(nextAreas);
        onCommit({ images, videoPromptAreas: nextAreas });
        return;
      }
      onCommit();
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (cropMode) return;
    const point = getTransformedPoint(e.clientX, e.clientY);
    const note = getNoteAtPoint(point, notes);
    if (note) {
      onNoteDoubleClick(note.id);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
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
  };
}
