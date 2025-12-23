import { formatDuration } from '../../../services/audioService';
import { Tool, type CanvasImage, type CanvasNote, type Path, type Point } from '../../../types';
import { getNoteTextColor } from '../noteColors';
import { CROP_HANDLE_SIZE, DEFAULT_NOTE_FONT_SIZE, RESIZE_HANDLE_SIZE, ROTATION_HANDLE_DISTANCE, TRANSFORM_HANDLE_SIZE } from '../constants';
import { getImageCenter, getImageRotation } from '../geometry';
import { isVideoImage } from '../mediaGuards';
import { fitTextWithinBox, wrapText } from './text';

type CropModeState = { imageId: string; rect: { x: number; y: number; width: number; height: number; }; };
type TransformModeState = { imageId: string; };

type DrawCanvasArgs = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  pan: Point;
  scale: number;
  images: CanvasImage[];
  notes: CanvasNote[];
  paths: Path[];
  selectedImageIds: string[];
  selectedNoteIds: string[];
  primarySelectedNoteId: string | null;
  referenceImageIds: string[];
  referenceImageOrderLabels?: Record<string, string> | null;
  elementImageIds: string[];
  elementImageOrderLabels?: Record<string, string> | null;
  videoLastFrameImageId: string | null;
  sourceVideoId: string | null;
  isKlingO1VideoInputMode: boolean;
  isKlingO1FflfMode: boolean;
  isWanAnimateVideoInputMode: boolean;
  showMetadataOverlay: boolean;
  cropMode: CropModeState | null;
  transformMode: TransformModeState | null;
};

export function drawCanvas({
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
  isWanAnimateVideoInputMode,
  showMetadataOverlay,
  cropMode,
  transformMode,
}: DrawCanvasArgs) {
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

    if (image.element instanceof HTMLImageElement) {
      if (!image.element.complete || image.element.naturalWidth === 0 || image.element.naturalHeight === 0) {
        ctx.restore();
        return;
      }
    }

    if (isVideoImage(image) && image.element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      ctx.restore();
      return;
    }

    ctx.drawImage(image.element, baseX, baseY, image.width, image.height);

    // Draw playhead for audio objects
    if (image.mediaType === 'audio' && image.audioDuration && image.currentPlaybackTime !== undefined) {
      const progress = image.currentPlaybackTime / image.audioDuration;
      const playheadX = baseX + (image.width * progress);

      // Draw playhead line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 / scale;
      ctx.beginPath();
      ctx.moveTo(playheadX, baseY);
      ctx.lineTo(playheadX, baseY + image.height);
      ctx.stroke();

      // Draw playhead triangle marker at top
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(playheadX, baseY);
      ctx.lineTo(playheadX - 6 / scale, baseY - 8 / scale);
      ctx.lineTo(playheadX + 6 / scale, baseY - 8 / scale);
      ctx.closePath();
      ctx.fill();
    }

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
    const isFflfSelectedVideo = isKlingO1FflfMode && image.mediaType === 'video' && selectedImageIds.includes(image.id);

    if (elementImageIds.includes(image.id)) {
      ctx.strokeStyle = '#a855f7'; // purple-500 for elements
      ctx.lineWidth = 4 / scale;
      ctx.setLineDash([6 / scale, 4 / scale]);
      ctx.strokeRect(baseX - padding, baseY - padding, image.width + padding * 2, image.height + padding * 2);
      ctx.setLineDash([]);
    } else if (isKlingO1VideoInputMode && sourceVideoId === image.id) {
      ctx.strokeStyle = '#f97316'; // orange-500 for source video in video input mode
      ctx.lineWidth = 4 / scale;
      ctx.setLineDash([6 / scale, 4 / scale]);
      ctx.strokeRect(baseX - padding, baseY - padding, image.width + padding * 2, image.height + padding * 2);
      ctx.setLineDash([]);
    } else if (isWanAnimateVideoInputMode && sourceVideoId === image.id) {
      ctx.strokeStyle = '#f97316'; // orange-500 for source video in WAN animate mode
      ctx.lineWidth = 4 / scale;
      ctx.setLineDash([6 / scale, 4 / scale]);
      ctx.strokeRect(baseX - padding, baseY - padding, image.width + padding * 2, image.height + padding * 2);
      ctx.setLineDash([]);
    } else if (isFflfSelectedVideo) {
      ctx.strokeStyle = '#f97316'; // orange-500 for FFLF video selection
      ctx.lineWidth = 4 / scale;
      ctx.setLineDash([6 / scale, 4 / scale]);
      ctx.strokeRect(baseX - padding, baseY - padding, image.width + padding * 2, image.height + padding * 2);
      ctx.setLineDash([]);
    } else if (selectedImageIds.includes(image.id) && image.mediaType === 'audio') {
      ctx.strokeStyle = '#eab308'; // yellow-500 for audio
      ctx.lineWidth = 4 / scale;
      ctx.setLineDash([6 / scale, 4 / scale]);
      ctx.strokeRect(baseX - padding, baseY - padding, image.width + padding * 2, image.height + padding * 2);
      ctx.setLineDash([]);

      // Draw audio duration badge
      if (image.audioDuration) {
        const currentTime = image.currentPlaybackTime ?? 0;
        const totalTime = image.audioDuration;
        const durationText = image.isPlaying
          ? `${formatDuration(currentTime)}/${formatDuration(totalTime)}`
          : formatDuration(totalTime);

        const badgePaddingX = 8 / scale;
        const badgePaddingY = 6 / scale;
        const badgeFontSize = 24 / scale;
        ctx.font = `bold ${badgeFontSize}px sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        const textWidth = ctx.measureText(durationText).width;
        const badgeWidth = textWidth + badgePaddingX * 2;
        const badgeHeight = badgeFontSize + badgePaddingY * 2;
        const badgeX = baseX - padding;
        const badgeY = baseY - padding - badgeHeight - 2 / scale;

        // Yellow background to match selection
        ctx.fillStyle = 'rgba(234, 179, 8, 0.95)'; // yellow-500
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 4 / scale);
        ctx.fill();

        // Dark text for contrast
        ctx.fillStyle = '#000000';
        ctx.fillText(durationText, badgeX + badgePaddingX, badgeY + badgeHeight / 2);
      }
    } else if (selectedImageIds.includes(image.id)) {
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

    const isKlingSourceVideo = isKlingO1VideoInputMode && sourceVideoId === image.id;
    const referenceOrderLabel = isKlingSourceVideo ? 'Video' : referenceImageOrderLabels?.[image.id];
    const shouldShowReferenceBadge = !!referenceOrderLabel && (isKlingSourceVideo || image.mediaType === 'image');
    if (shouldShowReferenceBadge) {
      const badgePaddingX = 8 / scale;
      const badgePaddingY = 6 / scale;
      const badgeFontSize = 24 / scale;
      ctx.font = `${badgeFontSize}px sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      const textWidth = ctx.measureText(referenceOrderLabel).width;
      const badgeWidth = textWidth + badgePaddingX * 2;
      const badgeHeight = badgeFontSize + badgePaddingY * 2;
      const badgeX = baseX - padding;
      const badgeY = baseY - padding - badgeHeight - 2 / scale;

      const isPrimaryReference = selectedImageIds[0] === image.id;
      const badgeFillColor = isKlingSourceVideo
        ? 'rgba(249, 115, 22, 0.95)'
        : isPrimaryReference
          ? 'rgba(14, 165, 233, 0.95)'
          : 'rgba(16, 185, 129, 0.92)';
      const badgeStrokeColor = isKlingSourceVideo
        ? '#c2410c'
        : isPrimaryReference
          ? '#0ea5e9'
          : '#064e3b';
      ctx.fillStyle = badgeFillColor;
      ctx.strokeStyle = badgeStrokeColor;
      ctx.lineWidth = 1 / scale;
      ctx.beginPath();
      ctx.rect(badgeX, badgeY, badgeWidth, badgeHeight);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ecfdf3';
      ctx.fillText(referenceOrderLabel, badgeX + badgePaddingX, badgeY + badgeHeight / 2);
    }

    const elementOrderLabel = elementImageOrderLabels?.[image.id];
    if (elementOrderLabel) {
      const badgePaddingX = 8 / scale;
      const badgePaddingY = 6 / scale;
      const badgeFontSize = 24 / scale;
      ctx.font = `${badgeFontSize}px sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      const textWidth = ctx.measureText(elementOrderLabel).width;
      const badgeWidth = textWidth + badgePaddingX * 2;
      const badgeHeight = badgeFontSize + badgePaddingY * 2;
      const badgeX = baseX - padding;
      const badgeY = baseY - padding - badgeHeight - 2 / scale;

      ctx.fillStyle = 'rgba(139, 92, 246, 0.95)';
      ctx.strokeStyle = '#5b21b6';
      ctx.lineWidth = 1 / scale;
      ctx.beginPath();
      ctx.rect(badgeX, badgeY, badgeWidth, badgeHeight);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f5f3ff';
      ctx.fillText(elementOrderLabel, badgeX + badgePaddingX, badgeY + badgeHeight / 2);
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
      note.height - (2 * textPadding),
    );
    ctx.clip();

    ctx.fillStyle = getNoteTextColor(note.backgroundColor);
    const fontSize = (note.fontSize ?? DEFAULT_NOTE_FONT_SIZE) / scale;
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
}
