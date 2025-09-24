import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Tool, Path, Point, CanvasImage, CanvasNote } from '../types';
import { LayerUpIcon, LayerDownIcon } from './Icons';

interface CanvasProps {
  images: CanvasImage[];
  onImagesChange: (images: CanvasImage[]) => void;
  notes: CanvasNote[];
  onNotesChange: (notes: CanvasNote[]) => void;
  tool: Tool;
  paths: Path[];
  onPathsChange: (paths: Path[]) => void;
  brushSize: number;
  brushColor: string;
  selectedImageId: string | null;
  selectedNoteId: string | null;
  referenceImageIds: string[];
  onImageSelect: (id: string | null, isShiftClick: boolean) => void;
  onNoteSelect: (id: string | null) => void;
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
}

const RESIZE_HANDLE_SIZE = 12;
const MIN_NOTE_WIDTH = 100;
const MIN_NOTE_HEIGHT = 50;

const LayerButton: React.FC<{
  onClick: () => void;
  disabled: boolean;
  title: string;
  children: React.ReactNode;
}> = ({ onClick, disabled, title, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className="p-2 rounded-md transition-colors duration-200 bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
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
  paths,
  onPathsChange,
  brushSize,
  brushColor,
  selectedImageId,
  selectedNoteId,
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

  // Dragging & Resizing state
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [draggedImageId, setDraggedImageId] = useState<string | null>(null);
  const [dragStartPoint, setDragStartPoint] = useState<Point | null>(null);
  const [dragStartImagePosition, setDragStartImagePosition] = useState<Point | null>(null);
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [dragStartNotePosition, setDragStartNotePosition] = useState<Point | null>(null);
  const [resizeStartDimensions, setResizeStartDimensions] = useState<{width: number, height: number} | null>(null);

  const prevZoomToFitTrigger = useRef(zoomToFitTrigger);
  const prevImagesLength = useRef(images.length);

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
    const words = text.split(' ');
    let line = '';
    for(let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = context.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            context.fillText(line, x, y);
            line = words[n] + ' ';
            y += lineHeight;
        } else {
            line = testLine;
        }
    }
    context.fillText(line, x, y);
  };

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
        if (image.id === selectedImageId) {
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

    // Draw notes
    notes.forEach(note => {
      ctx.fillStyle = note.backgroundColor;
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 10 / scale;
      ctx.shadowOffsetX = 5 / scale;
      ctx.shadowOffsetY = 5 / scale;
      ctx.fillRect(note.x, note.y, note.width, note.height);
      ctx.shadowColor = 'transparent'; // Reset shadow for text and border

      if (note.id === selectedNoteId) {
          const padding = 5 / scale;
          ctx.strokeStyle = '#0ea5e9'; // sky-500
          ctx.lineWidth = 2 / scale;
          ctx.strokeRect(note.x - padding, note.y - padding, note.width + padding * 2, note.height + padding * 2);
          
          // Draw resize handle
          const handleSize = RESIZE_HANDLE_SIZE / scale;
          ctx.fillStyle = '#0ea5e9';
          ctx.fillRect(note.x + note.width - handleSize / 2, note.y + note.height - handleSize / 2, handleSize, handleSize);
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
  }, [images, notes, paths, pan, scale, selectedImageId, selectedNoteId, referenceImageIds]);

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

    setScale(Math.max(0.1, Math.min(newScale, 10)));
    setPan({ x: newPanX, y: newPanY });
  }, [images, notes]);

  useEffect(() => {
    if (zoomToFitTrigger > prevZoomToFitTrigger.current) {
      zoomToFit();
    }
    prevZoomToFitTrigger.current = zoomToFitTrigger;
  }, [zoomToFitTrigger, zoomToFit]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeCanvas = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
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
        setScale(newScale);

        const newPanX = (canvas.width - image.width * newScale) / 2;
        const newPanY = (canvas.height - image.height * newScale) / 2;
        setPan({ x: newPanX, y: newPanY });
    }

    prevImagesLength.current = images.length;
  }, [images]);

  useEffect(() => {
    if (containerRef.current) {
        let cursor;
        if(isResizing) {
            cursor = 'nwse-resize';
        } else {
            switch (tool) {
                case Tool.PAN: cursor = isPanning ? 'grabbing' : 'grab'; break;
                case Tool.FREE_SELECTION: cursor = isPanning || isDragging ? 'grabbing' : 'grab'; break;
                case Tool.NOTE: cursor = 'cell'; break;
                case Tool.ANNOTATE:
                case Tool.INPAINT:
                case Tool.ERASE:
                    cursor = 'crosshair'; break;
                case Tool.SELECTION: cursor = isDragging ? 'grabbing' : 'default'; break;
                default: cursor = 'default';
            }
        }
        containerRef.current.style.cursor = cursor;
    }
  }, [tool, isPanning, isDragging, isResizing]);
  
  useEffect(() => {
    if (editingNoteId && textareaRef.current) {
        textareaRef.current.focus();
    }
  }, [editingNoteId]);


  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
    const point = getTransformedPoint(e.clientX, e.clientY);
    
    if (tool === Tool.NOTE) {
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
    
    if (tool === Tool.SELECTION || tool === Tool.FREE_SELECTION) {
      const selectedNote = notes.find(n => n.id === selectedNoteId);
      if (selectedNote) {
        const handleSize = RESIZE_HANDLE_SIZE / scale;
        const resizeHandleX = selectedNote.x + selectedNote.width - handleSize;
        const resizeHandleY = selectedNote.y + selectedNote.height - handleSize;

        if (point.x >= resizeHandleX && point.y >= resizeHandleY) {
            setIsResizing(true);
            setDraggedNoteId(selectedNote.id);
            setDragStartPoint({ x: e.clientX, y: e.clientY });
            setResizeStartDimensions({ width: selectedNote.width, height: selectedNote.height });
            return;
        }
      }
    }
    
    if (tool === Tool.SELECTION) {
        const note = getNoteAtPoint(point);
        if (note) {
          onNoteSelect(note.id);
          setIsDragging(true);
          setDraggedNoteId(note.id);
          setDragStartPoint({ x: e.clientX, y: e.clientY });
          setDragStartNotePosition({ x: note.x, y: note.y });
          return;
        }

        const image = getImageAtPoint(point);
        onImageSelect(image ? image.id : null, e.shiftKey);
        
        if (image && !e.shiftKey) {
            setIsDragging(true);
            setDraggedImageId(image.id);
            setDragStartPoint({ x: e.clientX, y: e.clientY });
            setDragStartImagePosition({ x: image.x, y: image.y });
        }
        return;
    }

    if (tool === Tool.FREE_SELECTION) {
        const note = getNoteAtPoint(point);
        const image = getImageAtPoint(point);
        const object = note || image;

        if (object) {
            if (note) onNoteSelect(note.id); else if (image) onImageSelect(image.id, e.shiftKey);
            
            if (!e.shiftKey) {
              setIsDragging(true);
              setDragStartPoint({ x: e.clientX, y: e.clientY });
              if (note) {
                  setDraggedNoteId(note.id);
                  setDragStartNotePosition({ x: note.x, y: note.y });
              } else if(image) {
                  setDraggedImageId(image.id);
                  setDragStartImagePosition({ x: image.x, y: image.y });
              }
            }
        } else {
            setIsPanning(true);
            setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        }
        return;
    }

    if (tool === Tool.PAN) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    } else if (tool === Tool.ANNOTATE || tool === Tool.INPAINT || tool === Tool.ERASE) {
      setIsDrawing(true);
      const newPath: Path = {
        points: [point],
        color: brushColor,
        size: brushSize / scale,
        tool: tool,
      };
      onPathsChange([...paths, newPath]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isResizing && draggedNoteId && dragStartPoint && resizeStartDimensions) {
        const dx = (e.clientX - dragStartPoint.x) / scale;
        const dy = (e.clientY - dragStartPoint.y) / scale;

        const newWidth = Math.max(MIN_NOTE_WIDTH, resizeStartDimensions.width + dx);
        const newHeight = Math.max(MIN_NOTE_HEIGHT, resizeStartDimensions.height + dy);
        
        const noteIndex = notes.findIndex(n => n.id === draggedNoteId);
        if (noteIndex === -1) return;
        
        const newNotes = [...notes];
        newNotes[noteIndex] = { ...newNotes[noteIndex], width: newWidth, height: newHeight };
        onNotesChange(newNotes);
        return;
    }
    
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }
    
    if (isDragging && (tool === Tool.SELECTION || tool === Tool.FREE_SELECTION) && dragStartPoint) {
        const dx = (e.clientX - dragStartPoint.x) / scale;
        const dy = (e.clientY - dragStartPoint.y) / scale;
        
        if (draggedImageId && dragStartImagePosition) {
            const draggedImageIndex = images.findIndex(img => img.id === draggedImageId);
            if (draggedImageIndex === -1) return;
            const newImages = [...images];
            newImages[draggedImageIndex] = { ...newImages[draggedImageIndex], x: dragStartImagePosition.x + dx, y: dragStartImagePosition.y + dy };
            onImagesChange(newImages);
        } else if (draggedNoteId && dragStartNotePosition) {
            const draggedNoteIndex = notes.findIndex(n => n.id === draggedNoteId);
            if (draggedNoteIndex === -1) return;
            const newNotes = [...notes];
            newNotes[draggedNoteIndex] = { ...newNotes[draggedNoteIndex], x: dragStartNotePosition.x + dx, y: dragStartNotePosition.y + dy };
            onNotesChange(newNotes);
        }
        return;
    }

    if ((tool === Tool.SELECTION || tool === Tool.FREE_SELECTION) && containerRef.current && !isDragging && !isPanning && !isResizing) {
        const point = getTransformedPoint(e.clientX, e.clientY);
        const selectedNote = notes.find(n => n.id === selectedNoteId);
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
            containerRef.current.style.cursor = 'nwse-resize';
        } else {
            const objectOnPoint = getImageAtPoint(point) || getNoteAtPoint(point);
            const baseCursor = tool === Tool.SELECTION ? 'default' : 'grab';
            containerRef.current.style.cursor = objectOnPoint ? 'pointer' : baseCursor;
        }
    }

    if (!isDrawing) return;

    const point = getTransformedPoint(e.clientX, e.clientY);
    const newPaths = [...paths];
    newPaths[newPaths.length - 1].points.push(point);
    onPathsChange(newPaths);
  };

  const handleMouseUp = () => {
    const wasActive = isDrawing || isDragging || isResizing;
    setIsDrawing(false);
    setIsPanning(false);
    setIsDragging(false);
    setIsResizing(false);
    setDragStartPoint(null);
    setDragStartImagePosition(null);
    setDraggedImageId(null);
    setDragStartNotePosition(null);
    setDraggedNoteId(null);
    setResizeStartDimensions(null);
    if (wasActive) onCommit();
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const point = getTransformedPoint(e.clientX, e.clientY);
      const note = getNoteAtPoint(point);
      if (note) {
          onNoteDoubleClick(note.id);
      }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if(!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const scaleFactor = 1.1;
    let newScale;
    if (e.deltaY < 0) {
      newScale = scale * scaleFactor;
    } else {
      newScale = scale / scaleFactor;
    }
    newScale = Math.max(0.1, Math.min(newScale, 10));

    const newPanX = mouseX - (mouseX - pan.x) * (newScale / scale);
    const newPanY = mouseY - (mouseY - pan.y) * (newScale / scale);

    setScale(newScale);
    setPan({ x: newPanX, y: newPanY });
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

  const editingNote = editingNoteId ? notes.find(n => n.id === editingNoteId) : null;
  const selectedImage = useMemo(() => images.find(img => img.id === selectedImageId), [images, selectedImageId]);

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
      onWheel={handleWheel}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <canvas ref={canvasRef} />
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
       {selectedImage && isImageOverlapping && (
        <div
          className="flex items-center space-x-2"
          style={{
            position: 'absolute',
            left: `${(selectedImage.x + selectedImage.width / 2) * scale + pan.x}px`,
            top: `${(selectedImage.y + selectedImage.height) * scale + pan.y + (10)}px`,
            transform: 'translateX(-50%)',
            zIndex: 100,
          }}
        >
          <LayerButton onClick={() => onImageOrderChange(selectedImage.id, 'down')} disabled={!canMoveDown} title="Move Down (Layer Back)">
            <LayerDownIcon className="w-4 h-4" />
          </LayerButton>
          <LayerButton onClick={() => onImageOrderChange(selectedImage.id, 'up')} disabled={!canMoveUp} title="Move Up (Layer Forward)">
            <LayerUpIcon className="w-4 h-4" />
          </LayerButton>
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