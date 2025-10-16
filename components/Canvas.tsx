import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Tool, Path, Point, CanvasImage, CanvasNote } from '../types';
import { LayerUpIcon, LayerDownIcon, CropIcon, CancelIcon, ConfirmIcon, CopyIcon } from './Icons';

type AppMode = 'CANVAS' | 'ANNOTATE' | 'INPAINT';

interface CanvasProps {
  images: CanvasImage[];
  onImagesChange: (images: CanvasImage[]) => void;
  notes: CanvasNote[];
  onNotesChange: (notes: CanvasNote[]) => void;
  tool: Tool;
  appMode: AppMode;
  paths: Path[];
  onPathsChange: (paths: Path[]) => void;
  brushSize: number;
  brushColor: string;
  selectedImageIds: string[];
  selectedNoteIds: string[];
  referenceImageIds: string[];
  onImageSelect: (id: string | null, options?: { multi?: boolean; reference?: boolean }) => void;
  onNoteSelect: (id: string | null, options?: { multi?: boolean }) => void;
  onCommit: () => void;
  zoomToFitTrigger: number;
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
}

const RESIZE_HANDLE_SIZE = 12;
const CROP_HANDLE_SIZE = 10;
const MIN_NOTE_WIDTH = 100;
const MIN_NOTE_HEIGHT = 50;
const MIN_SCALE = 0.001; // allow zooming far out to keep huge layouts visible
const MAX_SCALE = 10;

// FIX: Added 'resize-l' to the CropAction type to support left-side cropping and fix a type error.
type CropAction = 'move' | 'resize-tl' | 'resize-t' | 'resize-tr' | 'resize-r' | 'resize-br' | 'resize-b' | 'resize-bl' | 'resize-l';

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
  brushColor,
  selectedImageIds,
  selectedNoteIds,
  referenceImageIds,
  onImageSelect,
  onNoteSelect,
  onCommit,
  zoomToFitTrigger,
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
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Drawing & Panning state
  const [isDrawing, setIsDrawing] = useState(false);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [temporaryTool, setTemporaryTool] = useState<Tool | null>(null);

  // Dragging & Resizing state
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [draggedImageIds, setDraggedImageIds] = useState<string[]>([]);
  const [draggedNoteIds, setDraggedNoteIds] = useState<string[]>([]);
  const [dragStartPoint, setDragStartPoint] = useState<Point | null>(null);
  const [dragStartImagePositions, setDragStartImagePositions] = useState<Record<string, Point> | null>(null);
  const [dragStartNotePositions, setDragStartNotePositions] = useState<Record<string, Point> | null>(null);
  const [resizeStartDimensions, setResizeStartDimensions] = useState<{width: number, height: number} | null>(null);
  const [isMarqueeSelecting, setIsMarqueeSelecting] = useState(false);
  const [marqueeStart, setMarqueeStart] = useState<Point | null>(null);
  const [marqueeCurrent, setMarqueeCurrent] = useState<Point | null>(null);

  // Crop state
  const [cropAction, setCropAction] = useState<CropAction | null>(null);
  const [cropDragStart, setCropDragStart] = useState<{point: Point, rect: { x: number; y: number; width: number; height: number; }} | null>(null);

  const prevZoomToFitTrigger = useRef(zoomToFitTrigger);
  const prevImagesLength = useRef(images.length);
  const scaleRef = useRef(scale);
  const panRef = useRef(pan);
  
  const currentTool = temporaryTool || tool;
  const primarySelectedImageId = selectedImageIds[0] ?? null;
  const primarySelectedNoteId = selectedNoteIds[0] ?? null;

  const getCanvasContext = () => canvasRef.current?.getContext('2d');

  const getNoteAtPoint = useCallback((point: Point): CanvasNote | null => {
    for (let i = notes.length - 1; i >= 0; i--) {
        const note = notes[i];
        if (point.x >= note.x && point.x <= note.x + note.width && point.y >= note.y && point.y <= note.y + note.height) {
            return note;
        }
    }
    return null;
  }, [notes]);

  const getImageAtPoint = useCallback((point: Point): CanvasImage | null => {
    // Iterate backwards to select the top-most image
    for (let i = images.length - 1; i >= 0; i--) {
        const img = images[i];
        if (
            point.x >= img.x &&
            point.x <= img.x + img.width &&
            point.y >= img.y &&
            point.y <= img.y + img.height
        ) {
            return img;
        }
    }
    return null;
  }, [images]);

  const getTransformedPoint = useCallback((clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - pan.x) / scale,
      y: (clientY - rect.top - pan.y) / scale,
    };
  }, [pan, scale]);

  const wrapText = (context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
    const paragraphs = text.split(/\r?\n/);
    let currentY = y;

    paragraphs.forEach(paragraph => {
      if (paragraph === '') {
        currentY += lineHeight;
        return;
      }

      const words = paragraph.split(' ');
      let line = '';

      words.forEach(word => {
        const appendWord = word === '' ? ' ' : `${word} `;
        const testLine = line + appendWord;
        const testWidth = context.measureText(testLine).width;

        if (testWidth > maxWidth && line) {
          context.fillText(line.trimEnd(), x, currentY);
          line = appendWord;
          currentY += lineHeight;
        } else {
          line = testLine;
        }
      });

      if (line) {
        context.fillText(line.trimEnd(), x, currentY);
      }
      currentY += lineHeight;
    });
  };

  const setPanSmoothly = useCallback((nextPan: Point) => {
    panRef.current = nextPan;
    setPan(nextPan);
    return nextPan;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = getCanvasContext();
    if (!canvas || !ctx) return;

    // --- 1. Draw scene (images, notes, selections) ---
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(scale, scale);

    // Draw images
    images.forEach(image => {
        ctx.drawImage(image.element, image.x, image.y, image.width, image.height);
        const padding = 5 / scale;
        if (selectedImageIds.includes(image.id)) {
            ctx.strokeStyle = '#0ea5e9'; // sky-500
            ctx.lineWidth = 2 / scale;
            ctx.setLineDash([6 / scale, 4 / scale]);
            ctx.strokeRect(image.x - padding, image.y - padding, image.width + padding * 2, image.height + padding * 2);
            ctx.setLineDash([]);
        } else if (referenceImageIds.includes(image.id)) {
            ctx.strokeStyle = '#10b981'; // emerald-500 for reference
            ctx.lineWidth = 2 / scale;
            ctx.setLineDash([6 / scale, 4 / scale]);
            ctx.strokeRect(image.x - padding, image.y - padding, image.width + padding * 2, image.height + padding * 2);
            ctx.setLineDash([]);
        }
    });

    if (cropMode) {
      const imageToCrop = images.find(img => img.id === cropMode.imageId);
      if (imageToCrop) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        const cropAbsX = imageToCrop.x + cropMode.rect.x;
        const cropAbsY = imageToCrop.y + cropMode.rect.y;

        // Overlay outside the crop rect, within the image bounds
        ctx.fillRect(imageToCrop.x, imageToCrop.y, imageToCrop.width, cropMode.rect.y); // Top
        ctx.fillRect(imageToCrop.x, cropAbsY + cropMode.rect.height, imageToCrop.width, imageToCrop.height - (cropMode.rect.y + cropMode.rect.height)); // Bottom
        ctx.fillRect(imageToCrop.x, cropAbsY, cropMode.rect.x, cropMode.rect.height); // Left
        ctx.fillRect(cropAbsX + cropMode.rect.width, cropAbsY, imageToCrop.width - (cropMode.rect.x + cropMode.rect.width), cropMode.rect.height); // Right

        // Crop rect border
        ctx.strokeStyle = '#0ea5e9';
        ctx.lineWidth = 2 / scale;
        ctx.strokeRect(cropAbsX, cropAbsY, cropMode.rect.width, cropMode.rect.height);

        // Grid lines
        ctx.lineWidth = 1 / scale;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.moveTo(cropAbsX + cropMode.rect.width / 3, cropAbsY);
        ctx.lineTo(cropAbsX + cropMode.rect.width / 3, cropAbsY + cropMode.rect.height);
        ctx.moveTo(cropAbsX + 2 * cropMode.rect.width / 3, cropAbsY);
        ctx.lineTo(cropAbsX + 2 * cropMode.rect.width / 3, cropAbsY + cropMode.rect.height);
        ctx.moveTo(cropAbsX, cropAbsY + cropMode.rect.height / 3);
        ctx.lineTo(cropAbsX + cropMode.rect.width, cropAbsY + cropMode.rect.height / 3);
        ctx.moveTo(cropAbsX, cropAbsY + 2 * cropMode.rect.height / 3);
        ctx.lineTo(cropAbsX + cropMode.rect.width, cropAbsY + 2 * cropMode.rect.height / 3);
        ctx.stroke();

        // Handles
        const handleSize = CROP_HANDLE_SIZE / scale;
        ctx.fillStyle = '#0ea5e9';
        const handles = [
          { x: cropAbsX, y: cropAbsY }, // TL
          { x: cropAbsX + cropMode.rect.width / 2, y: cropAbsY }, // T
          { x: cropAbsX + cropMode.rect.width, y: cropAbsY }, // TR
          { x: cropAbsX + cropMode.rect.width, y: cropAbsY + cropMode.rect.height / 2 }, // R
          { x: cropAbsX + cropMode.rect.width, y: cropAbsY + cropMode.rect.height }, // BR
          { x: cropAbsX + cropMode.rect.width / 2, y: cropAbsY + cropMode.rect.height }, // B
          { x: cropAbsX, y: cropAbsY + cropMode.rect.height }, // BL
          { x: cropAbsX, y: cropAbsY + cropMode.rect.height / 2 }, // L
        ];
        handles.forEach(p => ctx.fillRect(p.x - handleSize/2, p.y - handleSize/2, handleSize, handleSize));
      }
    }

    // Draw notes
    notes.forEach(note => {
      ctx.fillStyle = note.backgroundColor;
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 10 / scale;
      ctx.shadowOffsetX = 5 / scale;
      ctx.shadowOffsetY = 5 / scale;
      ctx.fillRect(note.x, note.y, note.width, note.height);
      ctx.shadowColor = 'transparent'; // Reset shadow for text and border

      if (selectedNoteIds.includes(note.id)) {
          const padding = 5 / scale;
          ctx.strokeStyle = '#0ea5e9'; // sky-500
          ctx.lineWidth = 2 / scale;
          ctx.strokeRect(note.x - padding, note.y - padding, note.width + padding * 2, note.height + padding * 2);
          
          if (selectedNoteIds.length === 1 && primarySelectedNoteId === note.id) {
            // Draw resize handle for single-note selection
            const handleSize = RESIZE_HANDLE_SIZE / scale;
            ctx.fillStyle = '#0ea5e9';
            ctx.fillRect(note.x + note.width - handleSize / 2, note.y + note.height - handleSize / 2, handleSize, handleSize);
          }
      }
      
      ctx.save();
      
      const textPadding = 10 / scale;
      ctx.beginPath();
      ctx.rect(
        note.x + textPadding,
        note.y + textPadding,
        note.width - (2 * textPadding),
        note.height - (2 * textPadding)
      );
      ctx.clip();
      
      ctx.fillStyle = '#e5e7eb'; // light gray
      const fontSize = 16 / scale;
      ctx.font = `${fontSize}px sans-serif`;
      wrapText(ctx, note.text, note.x + textPadding, note.y + textPadding + fontSize, note.width - (2 * textPadding), fontSize * 1.2);
      
      ctx.restore();
    });

    ctx.restore(); // Restore main context transform

    // --- 2. Draw path overlay ---
    if (paths.length > 0) {
        const pathCanvas = document.createElement('canvas');
        pathCanvas.width = canvas.width;
        pathCanvas.height = canvas.height;
        const pathCtx = pathCanvas.getContext('2d');

        if (pathCtx) {
            // Apply same transform to the path canvas
            pathCtx.translate(pan.x, pan.y);
            pathCtx.scale(scale, scale);

            // Process all paths in order to respect drawing/erasing sequence
            paths.forEach(path => {
                if (path.tool === Tool.ERASE) {
                    pathCtx.globalCompositeOperation = 'destination-out';
                    // For destination-out, color doesn't matter, but alpha must be 1.
                    pathCtx.strokeStyle = 'rgba(0,0,0,1)';
                } else {
                    pathCtx.globalCompositeOperation = 'source-over';
                    pathCtx.strokeStyle = path.tool === Tool.INPAINT ? 'rgba(255, 0, 255, 0.5)' : path.color;
                }
                
                pathCtx.lineWidth = path.size;
                pathCtx.lineCap = 'round';
                pathCtx.lineJoin = 'round';
                pathCtx.beginPath();
                path.points.forEach((point, index) => {
                    if (index === 0) pathCtx.moveTo(point.x, point.y);
                    else pathCtx.lineTo(point.x, point.y);
                });
                pathCtx.stroke();
            });

            // Reset composite operation for safety before drawing to main canvas
            pathCtx.globalCompositeOperation = 'source-over';

            // Draw the path canvas onto the main canvas
            ctx.drawImage(pathCanvas, 0, 0);
        }
    }
  }, [images, notes, paths, pan, scale, selectedImageIds, selectedNoteIds, referenceImageIds, cropMode]);

  const zoomToFit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || (images.length === 0 && notes.length === 0)) {
        return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    images.forEach(img => {
        minX = Math.min(minX, img.x);
        minY = Math.min(minY, img.y);
        maxX = Math.max(maxX, img.x + img.width);
        maxY = Math.max(maxY, img.y + img.height);
    });

    notes.forEach(note => {
        minX = Math.min(minX, note.x);
        minY = Math.min(minY, note.y);
        maxX = Math.max(maxX, note.x + note.width);
        maxY = Math.max(maxY, note.y + note.height);
    });

    const bboxWidth = maxX - minX;
    const bboxHeight = maxY - minY;

    if (bboxWidth === 0 || bboxHeight === 0) return;

    const canvasWidth = canvas.clientWidth;
    const canvasHeight = canvas.clientHeight;
    
    const padding = 0.9; // 10% padding
    const scaleX = canvasWidth / bboxWidth;
    const scaleY = canvasHeight / bboxHeight;
    const newScale = Math.min(scaleX, scaleY) * padding;
    
    const bboxCenterX = minX + bboxWidth / 2;
    const bboxCenterY = minY + bboxHeight / 2;

    const newPanX = canvasWidth / 2 - bboxCenterX * newScale;
    const newPanY = canvasHeight / 2 - bboxCenterY * newScale;

    const clampedScale = Math.max(MIN_SCALE, Math.min(newScale, MAX_SCALE));
    scaleRef.current = clampedScale;
    setScale(clampedScale);
    setPanSmoothly({ x: newPanX, y: newPanY });
  }, [images, notes, setPanSmoothly]);

  const getCropActionForPoint = useCallback((point: Point, image: CanvasImage, rect: { x: number, y: number, width: number, height: number }): CropAction | null => {
      const handleSize = CROP_HANDLE_SIZE / scale;
      const absX = image.x + rect.x;
      const absY = image.y + rect.y;

      const checkHandle = (px: number, py: number, hx: number, hy: number) => 
        px >= hx - handleSize / 2 && px <= hx + handleSize / 2 &&
        py >= hy - handleSize / 2 && py <= hy + handleSize / 2;

      if (checkHandle(point.x, point.y, absX, absY)) return 'resize-tl';
      if (checkHandle(point.x, point.y, absX + rect.width, absY)) return 'resize-tr';
      if (checkHandle(point.x, point.y, absX, absY + rect.height)) return 'resize-bl';
      if (checkHandle(point.x, point.y, absX + rect.width, absY + rect.height)) return 'resize-br';
      if (checkHandle(point.x, point.y, absX + rect.width / 2, absY)) return 'resize-t';
      if (checkHandle(point.x, point.y, absX + rect.width, absY + rect.height / 2)) return 'resize-r';
      if (checkHandle(point.x, point.y, absX + rect.width / 2, absY + rect.height)) return 'resize-b';
      // FIX: The left crop handle was incorrectly returning 'resize-bl'. It now correctly returns 'resize-l'.
      if (checkHandle(point.x, point.y, absX, absY + rect.height / 2)) return 'resize-l';
      if (point.x > absX && point.x < absX + rect.width && point.y > absY && point.y < absY + rect.height) return 'move';
      
      return null;
  }, [scale]);

  useEffect(() => {
    if (zoomToFitTrigger > prevZoomToFitTrigger.current) {
      zoomToFit();
    }
    prevZoomToFitTrigger.current = zoomToFitTrigger;
  }, [zoomToFitTrigger, zoomToFit]);

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

      const scaleFactor = 1.1;
      const currentScale = scaleRef.current;
      const currentPan = panRef.current;

      const nextScale = event.deltaY < 0 ? currentScale * scaleFactor : currentScale / scaleFactor;
      const clampedScale = Math.max(MIN_SCALE, Math.min(nextScale, MAX_SCALE));
      const scaleRatio = currentScale === 0 ? 1 : clampedScale / currentScale;

      const updatedPan = {
        x: mouseX - (mouseX - currentPan.x) * scaleRatio,
        y: mouseY - (mouseY - currentPan.y) * scaleRatio,
      };

      scaleRef.current = clampedScale;
      setScale(clampedScale);
      setPanSmoothly(updatedPan);
    };

    // Attach a non-passive wheel listener so we can prevent the browser's default scroll.
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [setPanSmoothly]);

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

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [draw]);

  useEffect(() => {
    draw();
  }, [draw]);
  
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
  }, [currentTool, isPanning, isDragging, isResizing, cropMode, isMarqueeSelecting]);
  
  useEffect(() => {
    if (editingNoteId && textareaRef.current) {
        textareaRef.current.focus();
    }
  }, [editingNoteId]);


  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (cropMode) {
      const point = getTransformedPoint(e.clientX, e.clientY);
      const imageToCrop = images.find(img => img.id === cropMode.imageId);
      if (!imageToCrop) return;

      const action = getCropActionForPoint(point, imageToCrop, cropMode.rect);
      if (action) {
        setCropAction(action);
        setCropDragStart({ point, rect: cropMode.rect });
      }
      return;
    }

    if ((e.target as HTMLElement).closest('button')) return;
    if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;

    let activeTool = tool;
    if (e.button === 1) { // Middle mouse button
        e.preventDefault();
        activeTool = Tool.FREE_SELECTION;
        setTemporaryTool(Tool.FREE_SELECTION);
    }
    
    const point = getTransformedPoint(e.clientX, e.clientY);
    
    if (activeTool === Tool.NOTE) {
      const newNote: CanvasNote = {
        id: crypto.randomUUID(),
        x: point.x - 100,
        y: point.y - 50,
        width: 200,
        height: 100,
        text: '',
        backgroundColor: '#1f2937', // Dark blue-gray
      };
      onNotesChange([...notes, newNote]);
      onNoteSelect(newNote.id);
      onNoteDoubleClick(newNote.id);
      return;
    }

    const isMultiSelectKey = e.metaKey || e.ctrlKey;
    const isReferenceToggle = !isMultiSelectKey && e.shiftKey;

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
        const note = getNoteAtPoint(point);
        if (note) {
          const wantsNoteMultiSelect = isMultiSelectKey || e.shiftKey;
          if (wantsNoteMultiSelect) {
            onNoteSelect(note.id, { multi: true });
            return;
          }

          const noteAlreadySelected = selectedNoteIds.includes(note.id);
          if (!noteAlreadySelected) {
            onNoteSelect(note.id);
          }

          const noteIdsToDrag = noteAlreadySelected ? selectedNoteIds : [note.id];
          const imageIdsToDrag = noteAlreadySelected ? selectedImageIds : [];

          beginDrag(imageIdsToDrag, noteIdsToDrag);
          return;
        }

        const image = getImageAtPoint(point);
        if (image) {
          if (isReferenceToggle) {
            onImageSelect(image.id, { reference: true });
            return;
          }
          if (isMultiSelectKey) {
            onImageSelect(image.id, { multi: true });
            return;
          }

          const imageAlreadySelected = selectedImageIds.includes(image.id);
          if (!imageAlreadySelected) {
            onImageSelect(image.id);
          }

          const imageIdsToDrag = imageAlreadySelected ? selectedImageIds : [image.id];
          const noteIdsToDrag = imageAlreadySelected ? selectedNoteIds : [];
          
          beginDrag(imageIdsToDrag, noteIdsToDrag);
          return;
        }

        if (!isMultiSelectKey) {
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
          setIsPanning(true);
          setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        }
        return;
    }

    if (activeTool === Tool.PAN) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    } else if (activeTool === Tool.BRUSH || activeTool === Tool.ERASE) {
      setIsDrawing(true);

      // FIX: Explicitly type `pathTool` as `Tool` to prevent a type error when assigning
      // `Tool.ANNOTATE` or `Tool.INPAINT`, which are not part of the inferred `Tool.BRUSH | Tool.ERASE` type.
      let pathTool: Tool = activeTool;
      if (activeTool === Tool.BRUSH) {
        if (appMode === 'ANNOTATE') {
          pathTool = Tool.ANNOTATE;
        } else if (appMode === 'INPAINT') {
          pathTool = Tool.INPAINT;
        } else {
          return; // Should not be able to draw with brush in canvas mode.
        }
      }

      const newPath: Path = {
        points: [point],
        color: brushColor,
        size: brushSize / scale,
        tool: pathTool,
      };
      onPathsChange([...paths, newPath]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isMarqueeSelecting) {
        const point = getTransformedPoint(e.clientX, e.clientY);
        setMarqueeCurrent(point);
        return;
    }

    if (cropMode && cropAction && cropDragStart) {
        const point = getTransformedPoint(e.clientX, e.clientY);
        const imageToCrop = images.find(img => img.id === cropMode.imageId);
        if (!imageToCrop) return;

        const dx = point.x - cropDragStart.point.x;
        const dy = point.y - cropDragStart.point.y;
        const startRect = cropDragStart.rect;
        let newRect = { ...startRect };

        switch(cropAction) {
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
          // FIX: Added missing resize logic for the left crop handle.
          case 'resize-l':
            newRect.x += dx; newRect.width -= dx;
            break;
        }

        // Ensure width/height are positive
        if (newRect.width < 0) { newRect.x += newRect.width; newRect.width *= -1; }
        if (newRect.height < 0) { newRect.y += newRect.height; newRect.height *= -1; }

        // Clamp to image boundaries
        newRect.x = Math.max(0, newRect.x);
        newRect.y = Math.max(0, newRect.y);
        if (newRect.x + newRect.width > imageToCrop.width) { newRect.width = imageToCrop.width - newRect.x; }
        if (newRect.y + newRect.height > imageToCrop.height) { newRect.height = imageToCrop.height - newRect.y; }
        
        onCropRectChange(newRect);
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
    
    if (isPanning) {
      setPanSmoothly({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
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

    if(containerRef.current) {
        const point = getTransformedPoint(e.clientX, e.clientY);
        let cursor = containerRef.current.style.cursor; // default

        if (cropMode) {
          const imageToCrop = images.find(img => img.id === cropMode.imageId);
          const action = imageToCrop ? getCropActionForPoint(point, imageToCrop, cropMode.rect) : null;
          switch (action) {
              case 'move': cursor = 'move'; break;
              case 'resize-tl': case 'resize-br': cursor = 'nwse-resize'; break;
              case 'resize-tr': case 'resize-bl': cursor = 'nesw-resize'; break;
              case 'resize-t': case 'resize-b': cursor = 'ns-resize'; break;
              case 'resize-r': case 'resize-l': cursor = 'ew-resize'; break;
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
                const objectOnPoint = getImageAtPoint(point) || getNoteAtPoint(point);
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
    if (cropMode && cropAction) {
      setCropAction(null);
      setCropDragStart(null);
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
          .filter(img =>
            img.x < bounds.maxX &&
            img.x + img.width > bounds.minX &&
            img.y < bounds.maxY &&
            img.y + img.height > bounds.minY
          )
          .map(img => img.id);

        const noteIdsInBounds = notes
          .filter(note =>
            note.x < bounds.maxX &&
            note.x + note.width > bounds.minX &&
            note.y < bounds.maxY &&
            note.y + note.height > bounds.minY
          )
          .map(note => note.id);

        if (imageIdsInBounds.length || noteIdsInBounds.length) {
          onImageSelect(null);
          onNoteSelect(null);
          imageIdsInBounds.forEach(id => onImageSelect(id, { multi: true }));
          noteIdsInBounds.forEach(id => onNoteSelect(id, { multi: true }));
        }
      }
    }

    if (isMarqueeSelecting) {
      setIsMarqueeSelecting(false);
      setMarqueeStart(null);
      setMarqueeCurrent(null);
    }

    // If we're releasing the middle mouse button, we're ending a temporary tool action.
    // This is handled separately to prevent it from interfering with an ongoing left-mouse-button action.
    if (e.button === 1) {
      if (temporaryTool) {
        setTemporaryTool(null);
      }
      // The temporary tool can either pan or drag. Reset these states and commit if dragging occurred.
      if (isPanning) {
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
      return; // IMPORTANT: Stop processing to not affect other actions.
    }

    // For any other mouse up (e.g., left button) or mouse leave, run the generic state reset.
    if (temporaryTool && e.type === 'mouseleave') {
      setTemporaryTool(null);
    }
  
    const wasActive = isDrawing || isDragging || isResizing;
  
    // Reset all primary action states.
    setIsDrawing(false);
    setIsPanning(false); // For the main PAN tool
    setIsDragging(false);
    setIsResizing(false);
  
    setDragStartPoint(null);
    setDragStartImagePositions(null);
    setDraggedImageIds([]);
    setDragStartNotePositions(null);
    setDraggedNoteIds([]);
    setResizeStartDimensions(null);
    
    if (wasActive) {
      onCommit();
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (cropMode) return;
      const point = getTransformedPoint(e.clientX, e.clientY);
      const note = getNoteAtPoint(point);
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

  const handleNoteBlur = useCallback(() => {
    onCommit();
    onNoteEditEnd();
  }, [onCommit, onNoteEditEnd]);

  const editingNote = useMemo(() => editingNoteId ? notes.find(n => n.id === editingNoteId) : null, [notes, editingNoteId]);
  const selectedNote = useMemo(() => {
    if (editingNoteId) return null;
    if (selectedNoteIds.length !== 1) return null;
    const targetId = primarySelectedNoteId;
    if (!targetId) return null;
    return notes.find(n => n.id === targetId) || null;
  }, [notes, primarySelectedNoteId, editingNoteId, selectedNoteIds.length]);
  const selectedImage = useMemo(() => {
    if (selectedImageIds.length !== 1) return null;
    const targetId = primarySelectedImageId;
    if (!targetId) return null;
    return images.find(img => img.id === targetId) || null;
  }, [images, primarySelectedImageId, selectedImageIds.length]);
  const imageBeingCropped = useMemo(() => cropMode ? images.find(img => img.id === cropMode.imageId) : null, [images, cropMode]);
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

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-black overflow-hidden relative"
      style={{
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.2) 1px, transparent 1px)',
        backgroundSize: '25px 25px',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <canvas ref={canvasRef} />
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
            color: '#e5e7eb', // light gray
            border: `2px solid #0ea5e9`,
            borderRadius: '4px',
            padding: `${10 / scale}px`,
            fontSize: `${16 * scale}px`,
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
          <ActionButton
            onClick={() => onNoteCopy(selectedNote.id)}
            disabled={!selectedNote.text}
            title="Copy Text"
          >
            <CopyIcon className="w-4 h-4" />
          </ActionButton>
        </div>
      )}
      {selectedImage && !cropMode && (
        <div
          className="flex items-center space-x-2"
          style={{
            position: 'absolute',
            left: `${(selectedImage.x + selectedImage.width / 2) * scale + pan.x}px`,
            top: `${(selectedImage.y + selectedImage.height) * scale + pan.y + 14}px`,
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
          <ActionButton onClick={() => onStartCrop(selectedImage.id)} disabled={false} title="Crop Image">
            <CropIcon className="w-4 h-4" />
          </ActionButton>
        </div>
      )}
      {imageBeingCropped && (
          <div
            className="flex items-center space-x-2"
            style={{
              position: 'absolute',
              left: `${(imageBeingCropped.x + imageBeingCropped.width / 2) * scale + pan.x}px`,
              top: `${(imageBeingCropped.y + imageBeingCropped.height) * scale + pan.y + 14}px`,
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
      {images.length === 0 && notes.length === 0 && !isDraggingOver && (
         <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center p-8 bg-black/30 rounded-lg">
                <h2 className="text-2xl font-bold text-white">Welcome to the Infinite Canvas</h2>
                <p className="text-gray-300 mt-2">Click "Upload Image", create a Note, or drag & drop to start.</p>
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
