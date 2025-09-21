import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Tool, Path, Point, CanvasImage } from '../types';

interface CanvasProps {
  images: CanvasImage[];
  onImagesChange: (images: CanvasImage[]) => void;
  tool: Tool;
  paths: Path[];
  onPathsChange: (paths: Path[]) => void;
  brushSize: number;
  brushColor: string;
  selectedImageId: string | null;
  referenceImageIds: string[];
  onImageSelect: (id: string | null, isShiftClick: boolean) => void;
  onCommit: () => void;
  zoomToFitTrigger: number;
  onFilesDrop: (files: FileList, point: Point) => void;
}

export const Canvas: React.FC<CanvasProps> = ({
  images,
  onImagesChange,
  tool,
  paths,
  onPathsChange,
  brushSize,
  brushColor,
  selectedImageId,
  referenceImageIds,
  onImageSelect,
  onCommit,
  zoomToFitTrigger,
  onFilesDrop,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Drawing & Panning state
  const [isDrawing, setIsDrawing] = useState(false);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Dragging state
  const [isDragging, setIsDragging] = useState(false);
  const [draggedImageId, setDraggedImageId] = useState<string | null>(null);
  const [dragStartPoint, setDragStartPoint] = useState<Point | null>(null);
  const [dragStartImagePosition, setDragStartImagePosition] = useState<Point | null>(null);
  const prevZoomToFitTrigger = useRef(zoomToFitTrigger);

  const prevImagesLength = useRef(images.length);

  const getCanvasContext = () => canvasRef.current?.getContext('2d');

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

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = getCanvasContext();
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(scale, scale);

    images.forEach(image => {
        ctx.drawImage(image.element, image.x, image.y, image.width, image.height);
        if (image.id === selectedImageId) {
            const padding = 5 / scale;
            ctx.strokeStyle = '#0ea5e9'; // sky-500
            ctx.lineWidth = 2 / scale;
            ctx.setLineDash([6 / scale, 4 / scale]);
            ctx.strokeRect(image.x - padding, image.y - padding, image.width + padding * 2, image.height + padding * 2);
            ctx.setLineDash([]);
        } else if (referenceImageIds.includes(image.id)) {
            const padding = 5 / scale;
            ctx.strokeStyle = '#10b981'; // emerald-500 for reference
            ctx.lineWidth = 2 / scale;
            ctx.setLineDash([6 / scale, 4 / scale]);
            ctx.strokeRect(image.x - padding, image.y - padding, image.width + padding * 2, image.height + padding * 2);
            ctx.setLineDash([]);
        }
    });

    paths.forEach(path => {
      ctx.strokeStyle = tool === Tool.INPAINT ? 'rgba(255, 0, 255, 0.5)' : path.color;
      ctx.lineWidth = path.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      path.points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    });

    ctx.restore();
  }, [images, paths, pan, scale, tool, selectedImageId, referenceImageIds]);

  const zoomToFit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || images.length === 0) {
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
  }, [images]);

  useEffect(() => {
    // This check ensures that the zoomToFit function is only called when the user
    // actually clicks the button, incrementing the trigger. It prevents it from
    // re-triggering on other state changes (like dragging an image).
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
        switch (tool) {
            case Tool.PAN:
                cursor = isPanning ? 'grabbing' : 'grab';
                break;
            case Tool.FREE_SELECTION:
                cursor = isPanning || isDragging ? 'grabbing' : 'grab';
                break;
            case Tool.ANNOTATE:
            case Tool.INPAINT:
                cursor = 'crosshair';
                break;
            case Tool.SELECTION:
                cursor = isDragging ? 'grabbing' : 'default'; // handleMouseMove will override this for hover
                break;
            default:
                cursor = 'default';
        }
        containerRef.current.style.cursor = cursor;
    }
  }, [tool, isPanning, isDragging]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const point = getTransformedPoint(e.clientX, e.clientY);
    
    if (tool === Tool.SELECTION) {
        const image = getImageAtPoint(point);
        onImageSelect(image ? image.id : null, e.shiftKey);
        
        // Only start dragging if not shift-clicking, and if we clicked on an image.
        if (image && !e.shiftKey) {
            setIsDragging(true);
            setDraggedImageId(image.id);
            setDragStartPoint({ x: e.clientX, y: e.clientY });
            setDragStartImagePosition({ x: image.x, y: image.y });
        }
        return;
    }

    if (tool === Tool.FREE_SELECTION) {
        const image = getImageAtPoint(point);
        if (image) {
            // Clicked on an image: select and prepare for dragging
            onImageSelect(image.id, e.shiftKey);
            if (!e.shiftKey) {
                setIsDragging(true);
                setDraggedImageId(image.id);
                setDragStartPoint({ x: e.clientX, y: e.clientY });
                setDragStartImagePosition({ x: image.x, y: image.y });
            }
        } else {
            // Clicked on background: start panning
            setIsPanning(true);
            setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        }
        return;
    }

    if (tool === Tool.PAN) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    } else if (tool === Tool.ANNOTATE || tool === Tool.INPAINT) {
      setIsDrawing(true);
      const newPath: Path = {
        points: [point],
        color: brushColor,
        size: brushSize / scale,
      };
      onPathsChange([...paths, newPath]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }
    
    if (isDragging && (tool === Tool.SELECTION || tool === Tool.FREE_SELECTION) && draggedImageId && dragStartPoint && dragStartImagePosition) {
        const draggedImageIndex = images.findIndex(img => img.id === draggedImageId);
        if (draggedImageIndex === -1) return;

        const dx = (e.clientX - dragStartPoint.x) / scale;
        const dy = (e.clientY - dragStartPoint.y) / scale;
        
        const newImages = [...images];
        newImages[draggedImageIndex] = {
            ...newImages[draggedImageIndex],
            x: dragStartImagePosition.x + dx,
            y: dragStartImagePosition.y + dy,
        };
        onImagesChange(newImages);
        return;
    }

    if ((tool === Tool.SELECTION || tool === Tool.FREE_SELECTION) && containerRef.current && !isDragging) {
        const point = getTransformedPoint(e.clientX, e.clientY);
        const imageOnPoint = getImageAtPoint(point);
        if (imageOnPoint) {
          containerRef.current.style.cursor = 'pointer';
        } else {
          containerRef.current.style.cursor = tool === Tool.SELECTION ? 'default' : 'grab';
        }
    }

    if (!isDrawing) return;

    const point = getTransformedPoint(e.clientX, e.clientY);
    const newPaths = [...paths];
    newPaths[newPaths.length - 1].points.push(point);
    onPathsChange(newPaths);
  };

  const handleMouseUp = () => {
    const wasDrawingOrDragging = isDrawing || isDragging;

    setIsDrawing(false);
    setIsPanning(false);
    setIsDragging(false);
    setDragStartPoint(null);
    setDragStartImagePosition(null);
    setDraggedImageId(null);

    if (wasDrawingOrDragging) {
      onCommit();
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
      onWheel={handleWheel}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <canvas ref={canvasRef} />
      {images.length === 0 && !isDraggingOver && (
         <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center p-8 bg-black/30 rounded-lg">
                <h2 className="text-2xl font-bold text-white">Welcome to the Infinite Canvas</h2>
                <p className="text-gray-300 mt-2">Click "Upload Image" or drag & drop to start your creation.</p>
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