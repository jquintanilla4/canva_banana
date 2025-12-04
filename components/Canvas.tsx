import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Tool, Path, Point, CanvasImage, CanvasNote } from '../types';
import { LayerUpIcon, LayerDownIcon, CropIcon, CancelIcon, ConfirmIcon, CopyIcon, TransformIcon, RerunIcon } from './Icons';

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
  eraserSize: number;
  brushColor: string;
  selectedImageIds: string[];
  selectedNoteIds: string[];
  referenceImageIds: string[];
  videoLastFrameImageId: string | null;
  tailSelectionEnabled: boolean;
  onImageSelect: (id: string | null, options?: { multi?: boolean; reference?: boolean; lastFrame?: boolean }) => void;
  onNoteSelect: (id: string | null, options?: { multi?: boolean }) => void;
  onCommit: () => void;
  zoomToFitTrigger: number;
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
  onImagePromptCopy: (imageId: string) => void;
  onRerunGeneration: (imageId: string) => void;
  showMetadataOverlay: boolean;
  transformMode: { imageId: string; } | null;
  onStartTransform: (imageId: string) => void;
  onExitTransform: () => void;
}

const RESIZE_HANDLE_SIZE = 12;
const CROP_HANDLE_SIZE = 10;
const TRANSFORM_HANDLE_SIZE = 10;
const ROTATION_HANDLE_DISTANCE = 30;
const MIN_NOTE_WIDTH = 100;
const MIN_NOTE_HEIGHT = 50;
const MIN_SCALE = 0.001; // allow zooming far out to keep huge layouts visible
const MAX_SCALE = 10;
const GRID_BASE_SIZE = 300;
const GRID_MIN_SIZE = 2;
const GRID_MAX_SIZE = 360;
const DOT_BASE_SIZE = 3.5;
const DOT_MIN_SIZE = 0.4;
const DOT_MAX_SIZE = 6;
const KEYBOARD_ZOOM_MULTIPLIER = 1.05; // 5% zoom steps for keyboard shortcuts
const KEYBOARD_ZOOM_OUT_MULTIPLIER = 1 / KEYBOARD_ZOOM_MULTIPLIER;
const WHEEL_ZOOM_MULTIPLIER = 1.1;

// FIX: Added 'resize-l' to the CropAction type to support left-side cropping and fix a type error.
type CropAction = 'move' | 'resize-tl' | 'resize-t' | 'resize-tr' | 'resize-r' | 'resize-br' | 'resize-b' | 'resize-bl' | 'resize-l';

type TransformAction = 'scale-tl' | 'scale-t' | 'scale-tr' | 'scale-r' | 'scale-br' | 'scale-b' | 'scale-bl' | 'scale-l' | 'rotate';

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
  eraserSize,
  brushColor,
  selectedImageIds,
  selectedNoteIds,
  referenceImageIds,
  videoLastFrameImageId,
  tailSelectionEnabled,
  onImageSelect,
  onNoteSelect,
  onCommit,
  zoomToFitTrigger,
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
  onImagePromptCopy,
  onRerunGeneration,
  showMetadataOverlay,
  transformMode,
  onStartTransform,
  onExitTransform,
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
  const [resizeStartDimensions, setResizeStartDimensions] = useState<{ width: number, height: number } | null>(null);
  const [isMarqueeSelecting, setIsMarqueeSelecting] = useState(false);
  const [marqueeStart, setMarqueeStart] = useState<Point | null>(null);
  const [marqueeCurrent, setMarqueeCurrent] = useState<Point | null>(null);
  const [brushPreviewPosition, setBrushPreviewPosition] = useState<{ x: number; y: number } | null>(null);

  // Crop state
  const [cropAction, setCropAction] = useState<CropAction | null>(null);
  const [cropDragStart, setCropDragStart] = useState<{ point: Point, rect: { x: number; y: number; width: number; height: number; } } | null>(null);

  // Transform state
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

  const prevZoomToFitTrigger = useRef(zoomToFitTrigger);
  const prevZoomInTrigger = useRef(zoomInTrigger);
  const prevZoomOutTrigger = useRef(zoomOutTrigger);
  const prevImagesLength = useRef(images.length);
  const scaleRef = useRef(scale);
  const panRef = useRef(pan);

  const currentTool = temporaryTool || tool;
  const primarySelectedImageId = selectedImageIds[0] ?? null;
  const primarySelectedNoteId = selectedNoteIds[0] ?? null;

  const getCanvasContext = () => canvasRef.current?.getContext('2d');

  const getImageRotation = useCallback((image: CanvasImage) => image.rotation ?? 0, []);

  const getImageCenter = useCallback((image: CanvasImage): Point => ({
    x: image.x + image.width / 2,
    y: image.y + image.height / 2,
  }), []);

  const worldToImageLocal = useCallback((point: Point, image: CanvasImage): Point => {
    const center = getImageCenter(image);
    const angle = -getImageRotation(image);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
      x: dx * cos - dy * sin + image.width / 2,
      y: dx * sin + dy * cos + image.height / 2,
    };
  }, [getImageCenter, getImageRotation]);

  const imageLocalToWorld = useCallback((local: Point, image: CanvasImage): Point => {
    const center = getImageCenter(image);
    const angle = getImageRotation(image);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const offsetX = local.x - image.width / 2;
    const offsetY = local.y - image.height / 2;
    return {
      x: center.x + offsetX * cos - offsetY * sin,
      y: center.y + offsetX * sin + offsetY * cos,
    };
  }, [getImageCenter, getImageRotation]);

  const getImageBounds = useCallback((image: CanvasImage) => {
    const corners = [
      imageLocalToWorld({ x: 0, y: 0 }, image),
      imageLocalToWorld({ x: image.width, y: 0 }, image),
      imageLocalToWorld({ x: 0, y: image.height }, image),
      imageLocalToWorld({ x: image.width, y: image.height }, image),
    ];
    const xs = corners.map(c => c.x);
    const ys = corners.map(c => c.y);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }, [imageLocalToWorld]);

  const isVideoImage = (img: CanvasImage): img is CanvasImage & { element: HTMLVideoElement } =>
    img.mediaType === 'video';

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
      const localPoint = worldToImageLocal(point, img);
      if (localPoint.x >= 0 && localPoint.x <= img.width && localPoint.y >= 0 && localPoint.y <= img.height) {
        return img;
      }
    }
    return null;
  }, [images, worldToImageLocal]);

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

  const getWrappedLines = (context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
    const lines: string[] = [];
    const paragraphs = text.split(/\r?\n/);

    paragraphs.forEach(paragraph => {
      if (paragraph === '') {
        lines.push('');
        return;
      }

      const words = paragraph.split(' ');
      let line = '';

      words.forEach(word => {
        const appendWord = word === '' ? ' ' : `${word} `;
        const testLine = line + appendWord;
        const testWidth = context.measureText(testLine).width;

        if (testWidth > maxWidth && line) {
          lines.push(line.trimEnd());
          line = appendWord;
        } else {
          line = testLine;
        }
      });

      if (line) {
        lines.push(line.trimEnd());
      }
    });

    return lines;
  };

  const toggleVideoPlayback = useCallback((videoId: string) => {
    const target = images.find(img => img.id === videoId && isVideoImage(img));
    if (!target) {
      return;
    }

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
      if (img.id !== videoId) return img;
      return { ...img, isPlaying: nextIsPlaying };
    });
    onImagesChange(updatedImages);
    onCommit();
  }, [images, isVideoImage, onCommit, onImagesChange]);

  const fitTextWithinBox = (
    context: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    maxHeight: number,
    initialFontSize: number,
    minFontSize = 8,
  ): { fontSize: number; lineHeight: number; lines: string[] } => {
    const sanitizedText = text.trim();
    if (sanitizedText.length === 0 || maxWidth <= 0 || maxHeight <= 0) {
      const fontSize = Math.max(minFontSize, Math.min(initialFontSize, 16));
      const lineHeight = fontSize * 1.2;
      return { fontSize, lineHeight, lines: [] };
    }

    let fontSize = Math.max(initialFontSize, minFontSize);
    let lines: string[] = [];
    let lineHeight = fontSize * 1.2;
    const minimumFontSize = Math.max(8, minFontSize);

    while (fontSize >= minimumFontSize) {
      context.font = `${fontSize}px sans-serif`;
      lineHeight = fontSize * 1.2;
      lines = getWrappedLines(context, sanitizedText, maxWidth);
      const requiredHeight = lines.length * lineHeight;

      if (requiredHeight <= maxHeight || fontSize === minimumFontSize) {
        return { fontSize, lineHeight, lines };
      }

      fontSize = Math.max(fontSize - 2, minimumFontSize);
    }

    context.font = `${minimumFontSize}px sans-serif`;
    lineHeight = minimumFontSize * 1.2;
    lines = getWrappedLines(context, sanitizedText, maxWidth);
    return { fontSize: minimumFontSize, lineHeight, lines };
  };

  const setPanSmoothly = useCallback((nextPan: Point) => {
    panRef.current = nextPan;
    setPan(nextPan);
    return nextPan;
  }, []);

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

    // --- 1. Draw scene (images, notes, selections) ---
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(scale, scale);

    // Draw images
    images.forEach(image => {
      const rotation = getImageRotation(image);
      const center = getImageCenter(image);
      const halfWidth = image.width / 2;
      const halfHeight = image.height / 2;
      const baseX = -halfWidth;
      const baseY = -halfHeight;

      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.rotate(rotation);

      if (isVideoImage(image) && image.element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        ctx.restore();
        return;
      }

      ctx.drawImage(image.element, baseX, baseY, image.width, image.height);

      const metadata = image.metadata;
      const promptText = metadata?.prompt?.trim() ?? '';
      const modelLabel = metadata?.modelLabel?.trim() ?? '';
      const segments: string[] = [];

      if (modelLabel.length > 0) {
        segments.push(modelLabel);
      }

      const upscaleFactor = metadata?.upscaleFactor;
      if (typeof upscaleFactor === 'number' && Number.isFinite(upscaleFactor) && upscaleFactor > 0) {
        const formattedFactor = Number.isInteger(upscaleFactor)
          ? `${upscaleFactor}x`
          : `${Number.parseFloat(upscaleFactor.toFixed(2))}x`;
        segments.push(formattedFactor);
      }

      const noiseScale = metadata?.noiseScale;
      if (typeof noiseScale === 'number' && Number.isFinite(noiseScale)) {
        const formattedNoise = (Math.round(noiseScale * 10) / 10).toFixed(1);
        segments.push(formattedNoise);
      }

      const creativity = metadata?.creativity;
      if (typeof creativity === 'number' && Number.isFinite(creativity)) {
        segments.push(`Creativity ${creativity.toFixed(1)}`);
      }

      if (promptText.length > 0) {
        segments.push(promptText);
      }

      const overlayText = segments.join('; ');
      const hasOverlayText = overlayText.length > 0;
      const shouldShowMetadata = showMetadataOverlay && hasOverlayText && metadata?.source !== 'imported';

      if (shouldShowMetadata) {
        const overlayHeight = image.height * 0.15;
        const overlayY = baseY + image.height - overlayHeight;
        const paddingInner = Math.max(8, overlayHeight * 0.1);
        const textAreaWidth = Math.max(image.width - paddingInner * 2, 0);
        const overlayInnerHeight = Math.max(overlayHeight - paddingInner * 2, 0);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(baseX, overlayY, image.width, overlayHeight);

        if (textAreaWidth > 0 && overlayInnerHeight > 0) {
          const baseFontSize = Math.max(14, overlayHeight * 0.35);
          const { fontSize: fittedFontSize, lineHeight, lines } = fitTextWithinBox(
            ctx,
            overlayText,
            textAreaWidth,
            overlayInnerHeight,
            baseFontSize,
          );

          ctx.save();
          ctx.beginPath();
          ctx.rect(baseX + paddingInner, overlayY + paddingInner, textAreaWidth, overlayInnerHeight);
          ctx.clip();
          ctx.fillStyle = '#ffffff';
          ctx.font = `${fittedFontSize}px sans-serif`;
          lines.forEach((line, lineIndex) => {
            const textY = overlayY + paddingInner + fittedFontSize + lineIndex * lineHeight;
            ctx.fillText(line, baseX + paddingInner, textY);
          });
          ctx.restore();
        }
      }

      const padding = 5 / scale;
      if (selectedImageIds.includes(image.id)) {
        ctx.strokeStyle = '#0ea5e9'; // sky-500
        ctx.lineWidth = 4 / scale;
        ctx.setLineDash([6 / scale, 4 / scale]);
        ctx.strokeRect(baseX - padding, baseY - padding, image.width + padding * 2, image.height + padding * 2);
        ctx.setLineDash([]);
      } else if (videoLastFrameImageId === image.id) {
        ctx.strokeStyle = '#f59e0b'; // amber-500 for ending frame
        ctx.lineWidth = 4 / scale;
        ctx.setLineDash([6 / scale, 4 / scale]);
        ctx.strokeRect(baseX - padding, baseY - padding, image.width + padding * 2, image.height + padding * 2);
        ctx.setLineDash([]);
      } else if (referenceImageIds.includes(image.id)) {
        ctx.strokeStyle = '#10b981'; // emerald-500 for reference
        ctx.lineWidth = 4 / scale;
        ctx.setLineDash([6 / scale, 4 / scale]);
        ctx.strokeRect(baseX - padding, baseY - padding, image.width + padding * 2, image.height + padding * 2);
        ctx.setLineDash([]);
      }

      ctx.restore();
    });

    if (cropMode) {
      const imageToCrop = images.find(img => img.id === cropMode.imageId);
      if (imageToCrop) {
        const rotation = getImageRotation(imageToCrop);
        const center = getImageCenter(imageToCrop);
        const handleSize = CROP_HANDLE_SIZE / scale;
        const baseX = -imageToCrop.width / 2;
        const baseY = -imageToCrop.height / 2;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        const cropAbsX = baseX + cropMode.rect.x;
        const cropAbsY = baseY + cropMode.rect.y;

        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.rotate(rotation);

        // Overlay outside the crop rect, within the image bounds
        ctx.fillRect(baseX, baseY, imageToCrop.width, cropMode.rect.y); // Top
        ctx.fillRect(baseX, cropAbsY + cropMode.rect.height, imageToCrop.width, imageToCrop.height - (cropMode.rect.y + cropMode.rect.height)); // Bottom
        ctx.fillRect(baseX, cropAbsY, cropMode.rect.x, cropMode.rect.height); // Left
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
        handles.forEach(p => ctx.fillRect(p.x - handleSize / 2, p.y - handleSize / 2, handleSize, handleSize));

        ctx.restore();
      }
    }

    // Draw transform handles when in transform mode
    if (transformMode) {
      const imageToTransform = images.find(img => img.id === transformMode.imageId);
      if (imageToTransform) {
        const handleSize = TRANSFORM_HANDLE_SIZE / scale;
        const rotationDistance = ROTATION_HANDLE_DISTANCE / scale;
        const rotation = getImageRotation(imageToTransform);
        const center = getImageCenter(imageToTransform);
        const baseX = -imageToTransform.width / 2;
        const baseY = -imageToTransform.height / 2;

        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.rotate(rotation);

        // Draw bounding box
        ctx.strokeStyle = '#f97316'; // orange-500
        ctx.lineWidth = 2 / scale;
        ctx.setLineDash([]);
        ctx.strokeRect(baseX, baseY, imageToTransform.width, imageToTransform.height);

        // Draw line from top center to rotation handle
        const topCenterX = baseX + imageToTransform.width / 2;
        const topCenterY = baseY;
        const rotationHandleY = baseY - rotationDistance;

        ctx.beginPath();
        ctx.moveTo(topCenterX, topCenterY);
        ctx.lineTo(topCenterX, rotationHandleY);
        ctx.stroke();

        // Draw rotation handle (circle)
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.arc(topCenterX, rotationHandleY, handleSize, 0, Math.PI * 2);
        ctx.fill();

        // Draw corner handles (squares)
        const cornerHandles = [
          { x: baseX, y: baseY }, // TL
          { x: baseX + imageToTransform.width, y: baseY }, // TR
          { x: baseX, y: baseY + imageToTransform.height }, // BL
          { x: baseX + imageToTransform.width, y: baseY + imageToTransform.height }, // BR
        ];
        cornerHandles.forEach(p => {
          ctx.fillRect(p.x - handleSize / 2, p.y - handleSize / 2, handleSize, handleSize);
        });

        // Draw edge handles (smaller squares)
        const edgeHandles = [
          { x: baseX + imageToTransform.width / 2, y: baseY }, // T
          { x: baseX + imageToTransform.width, y: baseY + imageToTransform.height / 2 }, // R
          { x: baseX + imageToTransform.width / 2, y: baseY + imageToTransform.height }, // B
          { x: baseX, y: baseY + imageToTransform.height / 2 }, // L
        ];
        const edgeHandleSize = handleSize * 0.8;
        edgeHandles.forEach(p => {
          ctx.fillRect(p.x - edgeHandleSize / 2, p.y - edgeHandleSize / 2, edgeHandleSize, edgeHandleSize);
        });

        ctx.restore();
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
        ctx.lineWidth = 4 / scale;
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
  }, [cropMode, getImageCenter, getImageRotation, images, notes, paths, pan, referenceImageIds, scale, selectedImageIds, selectedNoteIds, showMetadataOverlay, transformMode, videoLastFrameImageId]);

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
      const bounds = getImageBounds(img);
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
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
  }, [getImageBounds, images, notes, setPanSmoothly]);

  const getCropActionForPoint = useCallback((point: Point, image: CanvasImage, rect: { x: number, y: number, width: number, height: number }): CropAction | null => {
    const handleSize = CROP_HANDLE_SIZE / scale;
    const checkHandle = (target: Point) =>
      point.x >= target.x - handleSize / 2 && point.x <= target.x + handleSize / 2 &&
      point.y >= target.y - handleSize / 2 && point.y <= target.y + handleSize / 2;

    const localToWorld = (local: Point) => imageLocalToWorld(local, image);

    const tl = localToWorld({ x: rect.x, y: rect.y });
    const tr = localToWorld({ x: rect.x + rect.width, y: rect.y });
    const bl = localToWorld({ x: rect.x, y: rect.y + rect.height });
    const br = localToWorld({ x: rect.x + rect.width, y: rect.y + rect.height });
    const top = localToWorld({ x: rect.x + rect.width / 2, y: rect.y });
    const right = localToWorld({ x: rect.x + rect.width, y: rect.y + rect.height / 2 });
    const bottom = localToWorld({ x: rect.x + rect.width / 2, y: rect.y + rect.height });
    const left = localToWorld({ x: rect.x, y: rect.y + rect.height / 2 });

    if (checkHandle(tl)) return 'resize-tl';
    if (checkHandle(tr)) return 'resize-tr';
    if (checkHandle(bl)) return 'resize-bl';
    if (checkHandle(br)) return 'resize-br';
    if (checkHandle(top)) return 'resize-t';
    if (checkHandle(right)) return 'resize-r';
    if (checkHandle(bottom)) return 'resize-b';
    if (checkHandle(left)) return 'resize-l';

    const localPoint = worldToImageLocal(point, image);
    if (localPoint.x > rect.x && localPoint.x < rect.x + rect.width && localPoint.y > rect.y && localPoint.y < rect.y + rect.height) return 'move';

    return null;
  }, [scale, imageLocalToWorld, worldToImageLocal]);

  const getTransformActionForPoint = useCallback((point: Point, image: CanvasImage): TransformAction | null => {
    const handleSize = TRANSFORM_HANDLE_SIZE / scale;
    const rotationDistance = ROTATION_HANDLE_DISTANCE / scale;

    const checkHandle = (target: Point) =>
      point.x >= target.x - handleSize && point.x <= target.x + handleSize &&
      point.y >= target.y - handleSize && point.y <= target.y + handleSize;

    const localRotationHandle = { x: image.width / 2, y: -rotationDistance };
    const rotationHandle = imageLocalToWorld(localRotationHandle, image);
    if (checkHandle(rotationHandle)) return 'rotate';

    const cornerHandles = [
      { action: 'scale-tl' as const, point: imageLocalToWorld({ x: 0, y: 0 }, image) },
      { action: 'scale-tr' as const, point: imageLocalToWorld({ x: image.width, y: 0 }, image) },
      { action: 'scale-bl' as const, point: imageLocalToWorld({ x: 0, y: image.height }, image) },
      { action: 'scale-br' as const, point: imageLocalToWorld({ x: image.width, y: image.height }, image) },
    ];
    const cornerHit = cornerHandles.find(handle => checkHandle(handle.point));
    if (cornerHit) return cornerHit.action;

    const edgeHandles = [
      { action: 'scale-t' as const, point: imageLocalToWorld({ x: image.width / 2, y: 0 }, image) },
      { action: 'scale-r' as const, point: imageLocalToWorld({ x: image.width, y: image.height / 2 }, image) },
      { action: 'scale-b' as const, point: imageLocalToWorld({ x: image.width / 2, y: image.height }, image) },
      { action: 'scale-l' as const, point: imageLocalToWorld({ x: 0, y: image.height / 2 }, image) },
    ];
    const edgeHit = edgeHandles.find(handle => checkHandle(handle.point));
    if (edgeHit) return edgeHit.action;

    return null;
  }, [scale, imageLocalToWorld]);

  useEffect(() => {
    if (zoomToFitTrigger > prevZoomToFitTrigger.current) {
      zoomToFit();
    }
    prevZoomToFitTrigger.current = zoomToFitTrigger;
  }, [zoomToFitTrigger, zoomToFit]);

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
    const hasPlayingVideo = images.some(img => img.mediaType === 'video' && img.isPlaying);
    if (!hasPlayingVideo) {
      return;
    }

    let rafId = requestAnimationFrame(() => {});

    const tick = () => {
      draw();
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [draw, images]);

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
    if (currentTool !== Tool.BRUSH && currentTool !== Tool.ERASE) {
      setBrushPreviewPosition(null);
    }
  }, [currentTool]);

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

    if (transformMode) {
      const point = getTransformedPoint(e.clientX, e.clientY);
      const imageToTransform = images.find(img => img.id === transformMode.imageId);
      if (!imageToTransform) return;

      const action = getTransformActionForPoint(point, imageToTransform);
      if (action) {
        // Calculate initial angle for rotation
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
    const wantsTailSelection = tailSelectionEnabled && !isMultiSelectKey && e.shiftKey;
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
        if (wantsTailSelection) {
          onImageSelect(image.id, { lastFrame: true });
          return;
        }
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
    const hoveredImage = getImageAtPoint(hoverPoint);
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

    // Handle transform mode mouse move
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

      // Shift key = non-uniform scaling (free transform)
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

        // Handle scaling from different handles
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
              // Keep vertically centered
              newY = startY + (startHeight - newHeight) / 2;
            }
            // Non-uniform: height stays the same
            break;
          case 'scale-l':
            newWidth = Math.max(MIN_IMAGE_SIZE, startWidth - dx);
            newX = startX + startWidth - newWidth;
            if (uniformScale) {
              newHeight = newWidth / aspectRatio;
              // Keep vertically centered
              newY = startY + (startHeight - newHeight) / 2;
            }
            // Non-uniform: height stays the same
            break;
          case 'scale-b':
            newHeight = Math.max(MIN_IMAGE_SIZE, startHeight + dy);
            if (uniformScale) {
              newWidth = newHeight * aspectRatio;
              // Keep horizontally centered
              newX = startX + (startWidth - newWidth) / 2;
            }
            // Non-uniform: width stays the same
            break;
          case 'scale-t':
            newHeight = Math.max(MIN_IMAGE_SIZE, startHeight - dy);
            newY = startY + startHeight - newHeight;
            if (uniformScale) {
              newWidth = newHeight * aspectRatio;
              // Keep horizontally centered
              newX = startX + (startWidth - newWidth) / 2;
            }
            // Non-uniform: width stays the same
            break;
        }
      }

      // Update the image
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

    if (containerRef.current) {
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
      } else if (transformMode) {
        const imageToTransform = images.find(img => img.id === transformMode.imageId);
        const action = imageToTransform ? getTransformActionForPoint(point, imageToTransform) : null;
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
          .filter(img =>
            {
              const b = getImageBounds(img);
              return b.minX < bounds.maxX &&
                b.maxX > bounds.minX &&
                b.minY < bounds.maxY &&
                b.maxY > bounds.minY;
            }
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

    const dragDistance = dragStartPoint
      ? Math.hypot(e.clientX - dragStartPoint.x, e.clientY - dragStartPoint.y)
      : 0;
    const DRAG_DEADZONE_PX = 3;
    const didDrag = isDragging && dragDistance > DRAG_DEADZONE_PX;
    const canToggleVideo = e.button !== 1 &&
      !isDrawing &&
      !isResizing &&
      !isPanning &&
      !isMarqueeSelecting &&
      !cropMode &&
      !transformMode &&
      (!isDragging || !didDrag);
    if (canToggleVideo) {
      const point = getTransformedPoint(e.clientX, e.clientY);
      const targetImage = getImageAtPoint(point);
      if (targetImage && isVideoImage(targetImage)) {
        toggleVideoPlayback(targetImage.id);
      }
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
  const selectedImageIsVideo = selectedImage?.mediaType === 'video';
  const selectedImagePrompt = selectedImage?.metadata?.prompt?.trim() ?? '';
  const selectedImageHasGeneration = Boolean(selectedImage?.metadata?.generation);
  const imageBeingCropped = useMemo(() => cropMode ? images.find(img => img.id === cropMode.imageId) : null, [images, cropMode]);
  const imageBeingTransformed = useMemo(() => transformMode ? images.find(img => img.id === transformMode.imageId) : null, [images, transformMode]);
  const selectedImageBounds = useMemo(() => selectedImage ? getImageBounds(selectedImage) : null, [getImageBounds, selectedImage]);
  const croppingBounds = useMemo(() => imageBeingCropped ? getImageBounds(imageBeingCropped) : null, [getImageBounds, imageBeingCropped]);
  const transformingBounds = useMemo(() => imageBeingTransformed ? getImageBounds(imageBeingTransformed) : null, [getImageBounds, imageBeingTransformed]);
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

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-0 bg-black overflow-hidden"
      style={{
        backgroundImage,
        backgroundSize: `${gridSpacing}px ${gridSpacing}px`,
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
          <ActionButton onClick={() => onStartTransform(selectedImage.id)} disabled={false} title="Transform Image (Shift for free transform)">
            <TransformIcon className="w-4 h-4" />
          </ActionButton>
          <ActionButton
            onClick={() => onStartCrop(selectedImage.id)}
            disabled={selectedImageIsVideo}
            title={selectedImageIsVideo ? 'Cropping is only available for images' : 'Crop Image'}
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
