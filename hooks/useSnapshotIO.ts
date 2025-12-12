import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type {
  ApiProviderId,
  AppMode,
  CanvasImage,
  CanvasNote,
  InpaintMode,
  Path,
  Tool,
} from '../types';
import {
  snapshotBinaryToBlob,
  writeSnapshotBinary,
  type SnapshotBinary,
  type SnapshotMetaState,
  buildSnapshotBinaryFromState,
  restoreSnapshotFromFile,
} from '../services/snapshotService';
import {
  isFalAspectRatioSelectionValue,
  isFalImageModelId,
  isFalImageSizeSelectionValue,
  isFalResolutionSelectionValue,
  isFalVideoModelId,
  normalizeFalModelId,
} from '../services/modelConfig';
import type { WanCreativity } from '../services/modelConfig';
import type { UseFalSettingsResult } from './useFalSettings';
import type { SelectionStateResult } from './useSelectionState';
import type { AppState } from './useCanvasHistory';

type ApiProvider = ApiProviderId;

type SnapshotUIBindings = {
  appMode: AppMode;
  tool: Tool;
  brushSize: number;
  eraserSize: number;
  brushColor: string;
  prompt: string;
  inpaintMode: InpaintMode;
  apiProvider: ApiProvider;
  setAppMode: Dispatch<SetStateAction<AppMode>>;
  setTool: Dispatch<SetStateAction<Tool>>;
  setBrushSize: Dispatch<SetStateAction<number>>;
  setEraserSize: Dispatch<SetStateAction<number>>;
  setBrushColor: Dispatch<SetStateAction<string>>;
  setPrompt: Dispatch<SetStateAction<string>>;
  setInpaintMode: Dispatch<SetStateAction<InpaintMode>>;
  setApiProvider: Dispatch<SetStateAction<ApiProvider>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setToastMessage: Dispatch<SetStateAction<string | null>>;
  setIsFileMenuOpen: Dispatch<SetStateAction<boolean>>;
};

type SnapshotIOArgs = {
  ui: SnapshotUIBindings;
  fal: UseFalSettingsResult;
  selection: SelectionStateResult;
  displayedImages: CanvasImage[];
  displayedNotes: CanvasNote[];
  displayedPaths: Path[];
  resetHistory: (state: AppState) => void;
  providerAvailability: Record<ApiProvider, boolean>;
  availableProviders: ApiProvider[];
};

type SnapshotIOResult = {
  exportSnapshot: () => Promise<void>;
  importSnapshotFromFile: (file: File) => Promise<void>;
  importSnapshotWithPicker: (onFallback: () => void) => Promise<void>;
};

export function useSnapshotIO({
  ui,
  fal,
  selection,
  displayedImages,
  displayedNotes,
  displayedPaths,
  resetHistory,
  providerAvailability,
  availableProviders,
}: SnapshotIOArgs): SnapshotIOResult {
  const {
    appMode,
    tool,
    brushSize,
    eraserSize,
    brushColor,
    prompt,
    inpaintMode,
    apiProvider,
    setAppMode,
    setTool,
    setBrushSize,
    setEraserSize,
    setBrushColor,
    setPrompt,
    setInpaintMode,
    setApiProvider,
    setError,
    setToastMessage,
    setIsFileMenuOpen,
  } = ui;

  const {
    falModelId,
    falImageSizeSelection,
    falAspectRatioSelection,
    falResolutionSelection,
    falNumImages,
    falScaleFactor,
    falNoiseScale,
    falCreativity,
    wanTargetResolution,
    wanCreativity,
    wanAnimateVariant,
    wanAnimateSteps,
    wanAnimateResolution,
    wanAnimateShift,
    wanAnimateQuality,
    wanAnimateUseTurbo,
    setFalModelMode,
    setFalImageModelId,
    setFalVideoModelId,
    setFalImageSizeSelection,
    setFalAspectRatioSelection,
    setFalResolutionSelection,
    setFalNumImages,
    setFalScaleFactor,
    setFalNoiseScale,
    setFalCreativity,
    setWanTargetResolution,
    setWanCreativity,
    setWanAnimateVariant,
    setWanAnimateSteps,
    setWanAnimateResolution,
    setWanAnimateShift,
    setWanAnimateQuality,
    setWanAnimateUseTurbo,
  } = fal;

  const {
    selectedImageIds,
    selectedNoteIds,
    referenceImageIds,
    elementImageIds,
    videoLastFrameImageId,
    setSelectedImageIds,
    setSelectedNoteIds,
    setReferenceImageIds,
    setElementImageIds,
    setVideoLastFrameImageId,
  } = selection;
  // Serialize current canvas state plus UI settings into a binary snapshot for export/share.
  const buildSnapshotBinary = useCallback(async (): Promise<SnapshotBinary> => {
    const meta: SnapshotMetaState = {
      appMode,
      tool,
      brushSize,
      eraserSize,
      brushColor,
      prompt,
      inpaintMode,
      apiProvider,
      falModelId,
      falImageSizeSelection,
      falAspectRatioSelection,
      falResolutionSelection,
      falNumImages,
      falScaleFactor,
      falNoiseScale,
      falCreativity,
      wanTargetResolution,
      wanCreativity,
      wanAnimateVariant,
      wanAnimateSteps,
      wanAnimateResolution,
      wanAnimateShift,
      wanAnimateQuality,
      wanAnimateUseTurbo,
      selectedImageIds: [...selectedImageIds],
      selectedNoteIds: [...selectedNoteIds],
      referenceImageIds: [...referenceImageIds],
      ...(elementImageIds.length ? { elementImageIds: [...elementImageIds] } : {}),
      ...(videoLastFrameImageId ? { videoLastFrameImageId } : {}),
    };

    return buildSnapshotBinaryFromState({
      images: displayedImages,
      notes: displayedNotes,
      paths: displayedPaths,
      meta,
    });
  }, [
    appMode,
    apiProvider,
    brushColor,
    brushSize,
    displayedImages,
    displayedNotes,
    displayedPaths,
    eraserSize,
	    falAspectRatioSelection,
	    falCreativity,
	    wanTargetResolution,
	    wanCreativity,
	    wanAnimateVariant,
	    wanAnimateSteps,
	    wanAnimateResolution,
	    wanAnimateShift,
	    wanAnimateQuality,
	    wanAnimateUseTurbo,
	    falImageSizeSelection,
    falModelId,
    falNoiseScale,
    falNumImages,
    falResolutionSelection,
    elementImageIds,
    falScaleFactor,
    inpaintMode,
    prompt,
    referenceImageIds,
    selectedImageIds,
    selectedNoteIds,
    tool,
    videoLastFrameImageId,
  ]);

  const exportSnapshot = useCallback(async () => {
    try {
      const snapshotBinary = await buildSnapshotBinary();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const suggestedName = `banana-canvas-snapshot-${timestamp}.bcsnap`;

      const win = window as unknown as { showSaveFilePicker?: (options?: unknown) => Promise<any> };
      if (typeof win.showSaveFilePicker === 'function') {
        const saveHandle = await win.showSaveFilePicker({
          suggestedName,
          types: [
            {
              description: 'Canvas Snapshot',
              accept: { 'application/octet-stream': ['.bcsnap'] },
            },
          ],
        });
        const writable = await saveHandle.createWritable();
        await writeSnapshotBinary(snapshotBinary, writable);
        await writable.close();
      } else {
        const blob = snapshotBinaryToBlob(snapshotBinary);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = suggestedName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }

      setError(null);
      setToastMessage('Snapshot exported');
      setTimeout(() => setToastMessage(null), 2000);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to export snapshot.';
      setError(message);
    } finally {
      setIsFileMenuOpen(false);
    }
  }, [buildSnapshotBinary, setError, setIsFileMenuOpen, setToastMessage]);

  // Restore a snapshot file into state, validating each option before applying it.
  const importSnapshotFromFile = useCallback(async (file: File) => {
    try {
      const restored = await restoreSnapshotFromFile(file, {
        brushSize,
        eraserSize,
        brushColor,
      });

      const nextState: AppState = {
        images: restored.images,
        paths: restored.paths,
        notes: restored.notes,
      };

      resetHistory(nextState);

      const meta = restored.meta;
      if (meta) {
        const validAppMode: AppMode =
          meta.appMode === 'CANVAS' || meta.appMode === 'ANNOTATE' || meta.appMode === 'INPAINT'
            ? meta.appMode
            : 'CANVAS';
        setAppMode(validAppMode);

        const validTool = Object.values(Tool).includes(meta.tool) ? meta.tool : Tool.PAN;
        setTool(validTool);

        if (typeof meta.brushSize === 'number' && Number.isFinite(meta.brushSize) && meta.brushSize > 0) {
          setBrushSize(meta.brushSize);
        }
        if (typeof meta.eraserSize === 'number' && Number.isFinite(meta.eraserSize) && meta.eraserSize > 0) {
          setEraserSize(meta.eraserSize);
        }
        if (typeof meta.brushColor === 'string' && meta.brushColor.length > 0) {
          setBrushColor(meta.brushColor);
        }
        if (typeof meta.prompt === 'string') {
          setPrompt(meta.prompt);
        }
        if (meta.inpaintMode === 'STRICT' || meta.inpaintMode === 'CREATIVE') {
          setInpaintMode(meta.inpaintMode);
        }
        if (meta.apiProvider === 'google' || meta.apiProvider === 'fal') {
          if (providerAvailability[meta.apiProvider]) {
            setApiProvider(meta.apiProvider);
          } else if (availableProviders.length > 0) {
            setApiProvider(availableProviders[0]);
          }
        }
        const normalizedFalModelId = normalizeFalModelId(meta.falModelId);
        if (normalizedFalModelId) {
          if (isFalVideoModelId(normalizedFalModelId)) {
            setFalModelMode('video');
            setFalVideoModelId(normalizedFalModelId);
          } else if (isFalImageModelId(normalizedFalModelId)) {
            setFalModelMode('image');
            setFalImageModelId(normalizedFalModelId);
          }
        }
        if (isFalImageSizeSelectionValue(meta.falImageSizeSelection)) {
          setFalImageSizeSelection(meta.falImageSizeSelection);
        }
        if (isFalAspectRatioSelectionValue(meta.falAspectRatioSelection)) {
          setFalAspectRatioSelection(meta.falAspectRatioSelection);
        }
        if (isFalResolutionSelectionValue(meta.falResolutionSelection)) {
          setFalResolutionSelection(meta.falResolutionSelection);
        }
        if (typeof meta.falNumImages === 'number') {
          setFalNumImages(Math.min(4, Math.max(1, Math.floor(meta.falNumImages))));
        }
        if (typeof meta.falScaleFactor === 'number') {
          setFalScaleFactor(Math.min(10, Math.max(1, Math.round(meta.falScaleFactor))));
        }
        if (typeof meta.falNoiseScale === 'number') {
          const normalizedNoise = Number.isFinite(meta.falNoiseScale) ? meta.falNoiseScale : 0.1;
          const roundedNoise = Math.round(normalizedNoise * 10) / 10;
          setFalNoiseScale(Math.min(1, Math.max(0.1, roundedNoise)));
        }
	        if (typeof meta.falCreativity === 'number') {
	          const normalizedCreativity = Number.isFinite(meta.falCreativity)
	            ? Math.round(meta.falCreativity * 2) / 2
	            : 0;
	          setFalCreativity(Math.min(10, Math.max(0, normalizedCreativity)));
	        }
	        if (meta.wanTargetResolution === '720p' || meta.wanTargetResolution === '1080p') {
	          setWanTargetResolution(meta.wanTargetResolution);
	        }
	        if (typeof meta.wanCreativity === 'number') {
	          const normalizedWanCreativity = Number.isFinite(meta.wanCreativity)
	            ? Math.round(meta.wanCreativity)
	            : 1;
	          setWanCreativity(Math.min(4, Math.max(0, normalizedWanCreativity)) as WanCreativity);
	        }
	        if (meta.wanAnimateVariant === 'replace' || meta.wanAnimateVariant === 'move') {
	          setWanAnimateVariant(meta.wanAnimateVariant);
	        }
	        if (meta.wanAnimateSteps === '10' || meta.wanAnimateSteps === '20' || meta.wanAnimateSteps === '30' || meta.wanAnimateSteps === '40') {
	          setWanAnimateSteps(meta.wanAnimateSteps);
	        }
	        if (meta.wanAnimateResolution === '480p' || meta.wanAnimateResolution === '580p' || meta.wanAnimateResolution === '720p') {
	          setWanAnimateResolution(meta.wanAnimateResolution);
	        }
	        if (meta.wanAnimateShift === '5.0' || meta.wanAnimateShift === '6.0' || meta.wanAnimateShift === '7.0' || meta.wanAnimateShift === '8.0' || meta.wanAnimateShift === '9.0' || meta.wanAnimateShift === '10.0') {
	          setWanAnimateShift(meta.wanAnimateShift);
	        }
	        if (meta.wanAnimateQuality === 'high' || meta.wanAnimateQuality === 'maximum') {
	          setWanAnimateQuality(meta.wanAnimateQuality);
	        }
	        if (typeof meta.wanAnimateUseTurbo === 'boolean') {
	          setWanAnimateUseTurbo(meta.wanAnimateUseTurbo);
	        }
	        setSelectedImageIds(Array.isArray(meta.selectedImageIds) ? [...meta.selectedImageIds] : []);
        setSelectedNoteIds(Array.isArray(meta.selectedNoteIds) ? [...meta.selectedNoteIds] : []);
        setReferenceImageIds(Array.isArray(meta.referenceImageIds) ? [...meta.referenceImageIds] : []);
        setElementImageIds(Array.isArray(meta.elementImageIds) ? [...meta.elementImageIds] : []);
        if (typeof meta.videoLastFrameImageId === 'string' && meta.videoLastFrameImageId.length > 0) {
          setVideoLastFrameImageId(meta.videoLastFrameImageId);
        } else {
          setVideoLastFrameImageId(null);
        }
      } else {
        setSelectedImageIds([]);
        setSelectedNoteIds([]);
        setReferenceImageIds([]);
        setElementImageIds([]);
        setVideoLastFrameImageId(null);
      }

      setError(null);
      setToastMessage('Snapshot imported');
      setTimeout(() => setToastMessage(null), 2000);
    } catch (err) {
      console.error(err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to import snapshot.');
      }
    } finally {
      setIsFileMenuOpen(false);
    }
  }, [
    availableProviders,
    brushColor,
    brushSize,
    eraserSize,
    providerAvailability,
    resetHistory,
    setApiProvider,
    setAppMode,
    setBrushColor,
    setBrushSize,
    setEraserSize,
	    setFalAspectRatioSelection,
	    setFalCreativity,
	    setWanTargetResolution,
	    setWanCreativity,
	    setWanAnimateVariant,
	    setWanAnimateSteps,
	    setWanAnimateResolution,
	    setWanAnimateShift,
	    setWanAnimateQuality,
	    setWanAnimateUseTurbo,
	    setFalImageModelId,
    setFalImageSizeSelection,
    setFalModelMode,
    setFalNoiseScale,
    setFalNumImages,
    setFalResolutionSelection,
    setFalScaleFactor,
    setFalVideoModelId,
    setInpaintMode,
    setPrompt,
    setReferenceImageIds,
    setElementImageIds,
    setSelectedImageIds,
    setSelectedNoteIds,
    setTool,
    setVideoLastFrameImageId,
    setError,
    setToastMessage,
    setIsFileMenuOpen,
  ]);

  // Use File System Access API when available; fall back to hidden input for older browsers.
  const importSnapshotWithPicker = useCallback(async (onFallback: () => void) => {
    const win = window as unknown as { showOpenFilePicker?: (options?: unknown) => Promise<any[]> };
    if (typeof win.showOpenFilePicker === 'function') {
      try {
        const [fileHandle] = await win.showOpenFilePicker({
          multiple: false,
          types: [
            {
              description: 'Canvas Snapshot',
              accept: {
                'application/octet-stream': ['.bcsnap'],
                'application/json': ['.json'],
              },
            },
          ],
        });
        if (fileHandle) {
          const file = await fileHandle.getFile();
          await importSnapshotFromFile(file);
        }
      } catch (err) {
        if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
          return;
        }
        console.error(err);
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Failed to import snapshot.');
        }
      }
    } else {
      onFallback();
    }
  }, [importSnapshotFromFile, setError]);

  return {
    exportSnapshot,
    importSnapshotFromFile,
    importSnapshotWithPicker,
  };
}
