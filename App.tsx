import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Toolbar } from './components/Toolbar';
import { PromptBar } from './components/PromptBar';
import { Canvas } from './components/Canvas';
import {
  Tool,
  Path,
  CanvasImage,
  InpaintMode,
  Point,
  CanvasNote,
  FalImageSizePreset,
  FalAspectRatioOption,
} from './types';
import { generateImageEdit as generateGoogleImageEdit, generateImage as generateGoogleImage } from './services/geminiService';
import { generateImageEdit as generateFalImageEdit, generateImage as generateFalImage, removeBackground as removeFalBackground, type FalQueueUpdate } from './services/falService';
import { FalQueuePanel } from './components/FalQueuePanel';
import type { FalQueueJob, FalJobStatus } from './types';
import { ZoomToFitIcon, HamburgerIcon } from './components/Icons';

const NANO_BANANA_MODEL_ID = 'fal-ai/nano-banana/edit' as const;
const SEEDREAM_MODEL_ID = 'fal-ai/bytedance/seedream/v4/edit' as const;
const NANO_BANANA_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/nano-banana' as const;
const SEEDREAM_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/bytedance/seedream/v4/text-to-image' as const;
const REVE_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/reve/text-to-image' as const;

const FAL_MODEL_OPTIONS = [
  { value: NANO_BANANA_MODEL_ID, label: 'Nano Banana' },
  { value: SEEDREAM_MODEL_ID, label: 'Seedream v4' },
  { value: REVE_TEXT_TO_IMAGE_MODEL_ID, label: 'Reve Image' },
] as const;

type FalImageSizeSelectionValue = 'default' | FalImageSizePreset;

type FalAspectRatioSelectionValue = FalAspectRatioOption;

const FAL_IMAGE_SIZE_OPTIONS: ReadonlyArray<{ value: FalImageSizeSelectionValue; label: string }> = [
  { value: 'default', label: 'Match Source' },
  { value: 'square_hd', label: 'Square HD' },
  { value: 'square', label: 'Square' },
  { value: 'portrait_4_3', label: 'Portrait 4:3' },
  { value: 'portrait_16_9', label: 'Portrait 16:9' },
  { value: 'landscape_4_3', label: 'Landscape 4:3' },
  { value: 'landscape_16_9', label: 'Landscape 16:9' },
  { value: 'auto', label: 'Auto' },
  { value: 'auto_2K', label: 'Auto 2K' },
  { value: 'auto_4K', label: 'Auto 4K' },
] as const;

const FAL_NUM_IMAGE_OPTIONS = [1, 2, 3, 4] as const;

const FAL_NANO_ASPECT_RATIO_OPTIONS: ReadonlyArray<{ value: FalAspectRatioSelectionValue; label: string }> = [
  { value: 'default', label: 'Match Source' },
  { value: '21:9', label: '21:9' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: '3:2', label: '3:2' },
  { value: '2:3', label: '2:3' },
  { value: '5:4', label: '5:4' },
  { value: '4:5', label: '4:5' },
  { value: '3:4', label: '3:4' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
] as const;

const FAL_REVE_ASPECT_RATIO_OPTIONS: ReadonlyArray<{ value: FalAspectRatioSelectionValue; label: string }> = [
  { value: 'default', label: 'Default (3:2)' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '3:2', label: '3:2' },
  { value: '2:3', label: '2:3' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
  { value: '1:1', label: '1:1' },
] as const;

const FAL_ASPECT_RATIO_VALUES = new Set<FalAspectRatioSelectionValue>([
  ...FAL_NANO_ASPECT_RATIO_OPTIONS.map(option => option.value),
  ...FAL_REVE_ASPECT_RATIO_OPTIONS.map(option => option.value),
]);

type FalModelId = typeof FAL_MODEL_OPTIONS[number]['value'];
const isFalImageSizeSelectionValue = (value: unknown): value is FalImageSizeSelectionValue =>
  typeof value === 'string' && FAL_IMAGE_SIZE_OPTIONS.some(option => option.value === value);

const isFalAspectRatioSelectionValue = (value: unknown): value is FalAspectRatioSelectionValue =>
  typeof value === 'string' && FAL_ASPECT_RATIO_VALUES.has(value as FalAspectRatioSelectionValue);

type PromptBarModelControl = {
  id: string;
  ariaLabel: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  errorMessage?: string;
};

const isFalModelId = (value: string | undefined): value is FalModelId => {
  return typeof value === 'string' && FAL_MODEL_OPTIONS.some(option => option.value === value);
};

const DEFAULT_FAL_MODEL_ID: FalModelId = isFalModelId(process.env.FAL_MODEL_ID)
  ? process.env.FAL_MODEL_ID
  : NANO_BANANA_MODEL_ID;

interface ViewToolbarProps {
  onZoomToFit: () => void;
  disabled: boolean;
}

const ViewToolbar: React.FC<ViewToolbarProps> = ({ onZoomToFit, disabled }) => {
  return (
    <div className="absolute bottom-4 right-4 z-10 flex flex-col items-center space-y-2">
      <button
        onClick={onZoomToFit}
        disabled={disabled}
        className="p-2 rounded-md border-none outline-none focus:outline-none focus:ring-0 shadow-none transition-colors duration-200 bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        title="Zoom to Fit (.)"
      >
        <ZoomToFitIcon className="w-5 h-5" />
      </button>
    </div>
  );
};

const MAX_HISTORY_SIZE = 30;
const MAX_REFERENCE_IMAGES = 2;
const DEFAULT_NOTE_BACKGROUND = '#1f2937';

type SerializedCanvasImage = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fileName: string;
  fileType: string;
  dataUrl: string;
};

type SerializedSnapshot = {
  version: 1;
  createdAt: string;
  state: {
    images: SerializedCanvasImage[];
    notes: CanvasNote[];
    paths: Path[];
    meta?: {
      appMode: AppMode;
      tool: Tool;
      brushSize: number;
      brushColor: string;
      prompt: string;
      inpaintMode: InpaintMode;
      apiProvider: 'google' | 'fal';
      falModelId: FalModelId;
      falImageSizeSelection: FalImageSizeSelectionValue;
      falAspectRatioSelection: FalAspectRatioSelectionValue;
      falNumImages: number;
      selectedImageIds: string[];
      selectedNoteIds: string[];
      referenceImageIds: string[];
    };
  };
};

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null;
      if (!result) {
        reject(new Error('Failed to read file.'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file.'));
    };
    reader.readAsDataURL(file);
  });
};

const dataUrlToFile = async (dataUrl: string, fileName: string, fileType: string): Promise<File> => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const type = fileType || blob.type || 'application/octet-stream';
  return new File([blob], fileName, { type });
};

type AppMode = 'CANVAS' | 'ANNOTATE' | 'INPAINT';
type AppState = { images: CanvasImage[], paths: Path[], notes: CanvasNote[] };
type CropModeState = { imageId: string; rect: { x: number; y: number; width: number; height: number; }; };

const getStateSignature = (state: AppState): string => {
  const imageSignature = state.images.map(img => `${img.id},${img.x.toFixed(2)},${img.y.toFixed(2)},${img.width},${img.height}`).join(';');
  const pathSignature = state.paths.map(p => `${p.points.length},${p.tool}`).join(',');
  const noteSignature = state.notes.map(n => `${n.id},${n.x.toFixed(2)},${n.y.toFixed(2)},${n.width.toFixed(0)},${n.height.toFixed(0)},${n.text.length}`).join(';');
  return `${imageSignature}|${pathSignature}|${noteSignature}`;
};

const isOverlapping = (img1: CanvasImage, img2: CanvasImage): boolean => {
    return !(
        img1.x > img2.x + img2.width ||
        img1.x + img1.width < img2.x ||
        img1.y > img2.y + img2.height ||
        img1.y + img1.height < img2.y
    );
};

const mapFalStatusToJobStatus = (status: FalQueueUpdate['status'] | undefined): FalJobStatus => {
  switch (status) {
    case 'IN_PROGRESS':
      return 'IN_PROGRESS';
    case 'COMPLETED':
      return 'COMPLETED';
    case 'FAILED':
    case 'CANCELLED':
    case 'CANCELED':
      return 'FAILED';
    default:
      return 'IN_QUEUE';
  }
};

const mergeFalLogMessages = (existing: string[], updateLogs?: FalQueueUpdate['logs']): string[] => {
  if (!updateLogs || updateLogs.length === 0) {
    return existing;
  }

  const next = [...existing];
  updateLogs.forEach(log => {
    const message = typeof log?.message === 'string' ? log.message.trim() : '';
    if (message && !next.includes(message)) {
      next.push(message);
    }
  });
  return next;
};

const loadImageFromDataUrl = (dataUrl: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image.'));
    img.src = dataUrl;
  });
};

export default function App() {
  const [appMode, setAppMode] = useState<AppMode>('CANVAS');
  const [tool, setTool] = useState<Tool>(Tool.PAN);
  const [brushSize, setBrushSize] = useState(20);
  const [brushColor, setBrushColor] = useState('#ff0000');
  const [prompt, setPrompt] = useState('');
  const [inpaintMode, setInpaintMode] = useState<InpaintMode>('STRICT');
  
  const [historyState, setHistoryState] = useState<{
    history: AppState[],
    index: number,
  }>({
    history: [{ images: [], paths: [], notes: [] }],
    index: 0,
  });

  const { history, index: historyIndex } = historyState;
  const { images, paths, notes } = history[historyIndex];

  const [liveImages, setLiveImages] = useState<CanvasImage[] | null>(null);
  const [livePaths, setLivePaths] = useState<Path[] | null>(null);
  const [liveNotes, setLiveNotes] = useState<CanvasNote[] | null>(null);

  const displayedImages = liveImages ?? images;
  const displayedPaths = livePaths ?? paths;
  const displayedNotes = liveNotes ?? notes;

  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const primaryImageId = selectedImageIds[0] ?? null;
  const primaryNoteId = selectedNoteIds[0] ?? null;
  const hasSingleImageSelected = selectedImageIds.length === 1;
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [referenceImageIds, setReferenceImageIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRemovingBackground, setIsRemovingBackground] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomToFitTrigger, setZoomToFitTrigger] = useState(0);
  const [zoomInTrigger, setZoomInTrigger] = useState(0);
  const [zoomOutTrigger, setZoomOutTrigger] = useState(0);
  const [cropMode, setCropMode] = useState<CropModeState | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [apiProvider, setApiProvider] = useState<'google' | 'fal'>('google');
  const [falJobs, setFalJobs] = useState<FalQueueJob[]>([]);
  const falAutoDismissTimeouts = useRef<Map<string, number>>(new Map());
  const [falModelId, setFalModelId] = useState<FalModelId>(DEFAULT_FAL_MODEL_ID);
  const [falImageSizeSelection, setFalImageSizeSelection] = useState<FalImageSizeSelectionValue>('default');
  const [falAspectRatioSelection, setFalAspectRatioSelection] = useState<FalAspectRatioSelectionValue>('default');
  const [falNumImages, setFalNumImages] = useState(1);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const requestZoomIn = useCallback(() => {
    setZoomInTrigger(prev => prev + 1);
  }, []);
  const requestZoomOut = useCallback(() => {
    setZoomOutTrigger(prev => prev + 1);
  }, []);

  const primaryImage = useMemo(() => {
    if (!primaryImageId) return null;
    return images.find(img => img.id === primaryImageId) || null;
  }, [images, primaryImageId]);

  const handleFalImageSizeChange = useCallback((value: string) => {
    setFalImageSizeSelection(value as FalImageSizeSelectionValue);
  }, []);

  const handleFalAspectRatioChange = useCallback((value: string) => {
    setFalAspectRatioSelection(value as FalAspectRatioSelectionValue);
  }, []);

  const handleFalNumImagesChange = useCallback((value: number) => {
    if (!Number.isFinite(value)) {
      setFalNumImages(1);
      return;
    }
    const clamped = Math.min(4, Math.max(1, Math.floor(value)));
    setFalNumImages(clamped);
  }, []);

  useEffect(() => {
    const validOptions = (falModelId === REVE_TEXT_TO_IMAGE_MODEL_ID
      ? FAL_REVE_ASPECT_RATIO_OPTIONS
      : FAL_NANO_ASPECT_RATIO_OPTIONS).map(option => option.value);
    if (!validOptions.includes(falAspectRatioSelection)) {
      setFalAspectRatioSelection('default');
    }
  }, [falModelId, falAspectRatioSelection, setFalAspectRatioSelection]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const snapshotInputRef = useRef<HTMLInputElement>(null);
  const prevDisplayedNotesLength = useRef(displayedNotes.length);

  const setState = useCallback((updater: (prevState: AppState) => AppState) => {
    setHistoryState(currentState => {
      const { history: prevHistory, index: prevIndex } = currentState;
      const prevState = prevHistory[prevIndex];
      const newState = updater(prevState);
      
      if (getStateSignature(newState) === getStateSignature(prevState)) {
          return currentState;
      }

      const newHistory = prevHistory.slice(0, prevIndex + 1);
      newHistory.push(newState);

      if (newHistory.length > MAX_HISTORY_SIZE) {
        newHistory.shift();
      }

      return {
        history: newHistory,
        index: newHistory.length - 1,
      };
    });
  }, []);

  const handleClear = useCallback(() => {
    setState(prevState => ({...prevState, paths: [] }));
  }, [setState]);

  const handleModeChange = useCallback((newMode: AppMode) => {
    if (newMode === appMode) return;

    setAppMode(newMode);
    handleClear();
    if (newMode === 'CANVAS') {
        setTool(Tool.PAN);
    } else { // ANNOTATE or INPAINT
        setTool(Tool.BRUSH);
    }
  }, [appMode, handleClear]);

  const handleDelete = useCallback(() => {
    if (selectedImageIds.length === 0 && selectedNoteIds.length === 0) {
      return;
    }

    setState(prevState => ({
      ...prevState,
      images: selectedImageIds.length
        ? prevState.images.filter(img => !selectedImageIds.includes(img.id))
        : prevState.images,
      notes: selectedNoteIds.length
        ? prevState.notes.filter(note => !selectedNoteIds.includes(note.id))
        : prevState.notes,
    }));

    if (selectedImageIds.length) {
      setSelectedImageIds([]);
      setReferenceImageIds([]);
    }
    if (selectedNoteIds.length) {
      setSelectedNoteIds([]);
    }
  }, [selectedImageIds, selectedNoteIds, setState]);

  const handleZoomToFit = useCallback(() => {
    setZoomToFitTrigger(c => c + 1);
  }, []);

  const handleImageOrderChange = useCallback((imageId: string, direction: 'up' | 'down') => {
    setState(prevState => {
        const newImages = [...prevState.images];
        const index = newImages.findIndex(img => img.id === imageId);
        
        if (direction === 'up' && index < newImages.length - 1) {
            [newImages[index], newImages[index + 1]] = [newImages[index + 1], newImages[index]];
        } else if (direction === 'down' && index > 0) {
            [newImages[index], newImages[index - 1]] = [newImages[index - 1], newImages[index]];
        }
        
        return { ...prevState, images: newImages };
    });
  }, [setState]);

  const handleNoteCopy = useCallback((noteId: string) => {
    const note = displayedNotes.find(n => n.id === noteId);
    if (note && note.text) {
        navigator.clipboard.writeText(note.text)
            .then(() => {
                setToastMessage("Copied to clipboard!");
                setTimeout(() => setToastMessage(null), 2000);
            })
            .catch(err => {
                console.error('Failed to copy text: ', err);
                setToastMessage("Failed to copy text.");
                setTimeout(() => setToastMessage(null), 2000);
            });
    }
  }, [displayedNotes]);

  const buildSnapshot = useCallback(async (): Promise<SerializedSnapshot> => {
    const serializedImages = await Promise.all(
      displayedImages.map(async (img) => {
        try {
          const dataUrl = await fileToDataUrl(img.file);
          return {
            id: img.id,
            x: img.x,
            y: img.y,
            width: img.width,
            height: img.height,
            fileName: img.file.name,
            fileType: img.file.type,
            dataUrl,
          };
        } catch (err) {
          console.error(err);
          throw new Error(`Unable to serialize image "${img.file?.name ?? img.id}".`);
        }
      })
    );

    const snapshot: SerializedSnapshot = {
      version: 1,
      createdAt: new Date().toISOString(),
      state: {
        images: serializedImages,
        notes: displayedNotes.map(note => ({ ...note })),
        paths: displayedPaths.map(path => ({
          ...path,
          points: path.points.map(point => ({ ...point })),
        })),
        meta: {
          appMode,
          tool,
          brushSize,
          brushColor,
          prompt,
          inpaintMode,
          apiProvider,
          falModelId,
          falImageSizeSelection,
          falAspectRatioSelection,
          falNumImages,
          selectedImageIds: [...selectedImageIds],
          selectedNoteIds: [...selectedNoteIds],
          referenceImageIds: [...referenceImageIds],
        },
      },
    };

    return snapshot;
  }, [
    displayedImages,
    displayedNotes,
    displayedPaths,
    appMode,
    tool,
    brushSize,
    brushColor,
    prompt,
    inpaintMode,
    apiProvider,
    falModelId,
    falImageSizeSelection,
    falAspectRatioSelection,
    falNumImages,
    selectedImageIds,
    selectedNoteIds,
    referenceImageIds,
  ]);

  const handleExportSnapshot = useCallback(async () => {
    try {
      const snapshot = await buildSnapshot();
      const contents = JSON.stringify(snapshot, null, 2);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const suggestedName = `banana-canvas-snapshot-${timestamp}.json`;

      const win = window as unknown as { showSaveFilePicker?: (options?: unknown) => Promise<any> };
      if (typeof win.showSaveFilePicker === 'function') {
        const saveHandle = await win.showSaveFilePicker({
          suggestedName,
          types: [
            {
              description: 'Canvas Snapshot',
              accept: { 'application/json': ['.json'] },
            },
          ],
        });
        const writable = await saveHandle.createWritable();
        await writable.write(contents);
        await writable.close();
      } else {
        const blob = new Blob([contents], { type: 'application/json' });
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
  }, [buildSnapshot]);

  const handleImportSnapshotFromFile = useCallback(async (file: File) => {
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as Partial<SerializedSnapshot>;
      if (!parsed || typeof parsed !== 'object' || !parsed.state) {
        throw new Error('Snapshot file is invalid.');
      }

      const { images = [], notes = [], paths = [], meta } = parsed.state;

      if (!Array.isArray(images) || !Array.isArray(notes) || !Array.isArray(paths)) {
        throw new Error('Snapshot data is incomplete.');
      }

      const restoredImages: CanvasImage[] = await Promise.all(
        images.map(async (img, index) => {
          if (!img || typeof img !== 'object' || typeof img.dataUrl !== 'string') {
            throw new Error(`Snapshot image at index ${index} is invalid.`);
          }

          const element = await loadImageFromDataUrl(img.dataUrl);
          const naturalWidth = element.naturalWidth || element.width || 1;
          const naturalHeight = element.naturalHeight || element.height || 1;
          const fileName = typeof img.fileName === 'string' && img.fileName.length > 0
            ? img.fileName
            : `snapshot-image-${index + 1}.png`;
          const fileType = typeof img.fileType === 'string' && img.fileType.length > 0
            ? img.fileType
            : 'image/png';
          const snapshotFile = await dataUrlToFile(img.dataUrl, fileName, fileType);
          const width = typeof img.width === 'number' ? img.width : naturalWidth;
          const height = typeof img.height === 'number' ? img.height : naturalHeight;

          return {
            id: typeof img.id === 'string' && img.id.length > 0 ? img.id : crypto.randomUUID(),
            element,
            x: typeof img.x === 'number' ? img.x : 0,
            y: typeof img.y === 'number' ? img.y : 0,
            width,
            height,
            naturalWidth,
            naturalHeight,
            file: snapshotFile,
          };
        })
      );

      const sanitizedNotes: CanvasNote[] = notes.map(note => ({
        id: typeof note?.id === 'string' && note.id.length > 0 ? note.id : crypto.randomUUID(),
        x: typeof note?.x === 'number' ? note.x : 0,
        y: typeof note?.y === 'number' ? note.y : 0,
        width: typeof note?.width === 'number' ? note.width : 200,
        height: typeof note?.height === 'number' ? note.height : 120,
        text: typeof note?.text === 'string' ? note.text : '',
        backgroundColor: typeof note?.backgroundColor === 'string' && note.backgroundColor.length > 0
          ? note.backgroundColor
          : DEFAULT_NOTE_BACKGROUND,
      }));

      const sanitizedPaths: Path[] = paths.map(path => {
        const rawPoints = Array.isArray(path?.points) ? path.points : [];
        const points: Point[] = rawPoints
          .map(point => (point && typeof point === 'object' ? point : null))
          .filter((point): point is Point => point !== null && typeof point.x === 'number' && typeof point.y === 'number')
          .map(point => ({ x: point.x, y: point.y }));

        const fallbackTool = Tool.BRUSH;
        const toolValue = Object.values(Tool).includes(path?.tool as Tool)
          ? (path?.tool as Tool)
          : fallbackTool;

        return {
          points,
          color: typeof path?.color === 'string' && path.color.length > 0 ? path.color : brushColor,
          size: typeof path?.size === 'number' ? path.size : brushSize,
          tool: toolValue,
        };
      });

      const nextState: AppState = {
        images: restoredImages,
        paths: sanitizedPaths,
        notes: sanitizedNotes,
      };

      setLiveImages(null);
      setLivePaths(null);
      setLiveNotes(null);
      setHistoryState({ history: [nextState], index: 0 });

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
          setApiProvider(meta.apiProvider);
        }
        if (isFalModelId(meta.falModelId)) {
          setFalModelId(meta.falModelId);
        }
        if (isFalImageSizeSelectionValue(meta.falImageSizeSelection)) {
          setFalImageSizeSelection(meta.falImageSizeSelection);
        }
        if (isFalAspectRatioSelectionValue(meta.falAspectRatioSelection)) {
          setFalAspectRatioSelection(meta.falAspectRatioSelection);
        }
        if (typeof meta.falNumImages === 'number') {
          setFalNumImages(Math.min(4, Math.max(1, Math.floor(meta.falNumImages))));
        }
        setSelectedImageIds(Array.isArray(meta.selectedImageIds) ? [...meta.selectedImageIds] : []);
        setSelectedNoteIds(Array.isArray(meta.selectedNoteIds) ? [...meta.selectedNoteIds] : []);
        setReferenceImageIds(Array.isArray(meta.referenceImageIds) ? [...meta.referenceImageIds] : []);
      } else {
        setSelectedImageIds([]);
        setSelectedNoteIds([]);
        setReferenceImageIds([]);
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
    brushColor,
    brushSize,
    setLiveImages,
    setLivePaths,
    setLiveNotes,
    setHistoryState,
    setAppMode,
    setTool,
    setBrushSize,
    setBrushColor,
    setPrompt,
    setInpaintMode,
    setApiProvider,
    setFalModelId,
    setFalImageSizeSelection,
    setFalAspectRatioSelection,
    setFalNumImages,
    setSelectedImageIds,
    setSelectedNoteIds,
    setReferenceImageIds,
    setError,
    setToastMessage,
  ]);

  const handleSnapshotFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImportSnapshotFromFile(file).catch(err => {
        console.error(err);
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Failed to import snapshot.');
        }
      });
    }
    e.target.value = '';
  }, [handleImportSnapshotFromFile, setError]);

  const closeFileMenu = useCallback(() => {
    setIsFileMenuOpen(false);
  }, []);

  const toggleFileMenu = useCallback(() => {
    setIsFileMenuOpen(prev => !prev);
  }, []);

  const handleImportSnapshot = useCallback(async () => {
    const win = window as unknown as { showOpenFilePicker?: (options?: unknown) => Promise<any[]> };
    if (typeof win.showOpenFilePicker === 'function') {
      try {
        const [fileHandle] = await win.showOpenFilePicker({
          multiple: false,
          types: [
            {
              description: 'Canvas Snapshot',
              accept: { 'application/json': ['.json'] },
            },
          ],
        });
        if (fileHandle) {
          const file = await fileHandle.getFile();
          await handleImportSnapshotFromFile(file);
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
      closeFileMenu();
      snapshotInputRef.current?.click();
    }
  }, [closeFileMenu, handleImportSnapshotFromFile, setError]);

  useEffect(() => {
    if (!isFileMenuOpen) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(event.target as Node)) {
        closeFileMenu();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeFileMenu();
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [closeFileMenu, isFileMenuOpen]);

  const handleDismissFalJob = useCallback((jobId: string) => {
    const timeoutId = falAutoDismissTimeouts.current.get(jobId);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      falAutoDismissTimeouts.current.delete(jobId);
    }

    setFalJobs(prev => prev.filter(job => job.id !== jobId));
  }, [setFalJobs]);

  useEffect(() => {
    const timeoutMap = falAutoDismissTimeouts.current;

    timeoutMap.forEach((timeoutId, jobId) => {
      const job = falJobs.find(j => j.id === jobId);
      if (!job || job.status !== 'COMPLETED') {
        window.clearTimeout(timeoutId);
        timeoutMap.delete(jobId);
      }
    });

    falJobs.forEach(job => {
      if (job.status !== 'COMPLETED') {
        return;
      }

      if (timeoutMap.has(job.id)) {
        return;
      }

      const timeoutId = window.setTimeout(() => {
        timeoutMap.delete(job.id);
        setFalJobs(prev => prev.filter(j => j.id !== job.id));
      }, 1000);

      timeoutMap.set(job.id, timeoutId);
    });
  }, [falJobs, setFalJobs]);

  useEffect(() => {
    return () => {
      falAutoDismissTimeouts.current.forEach(timeoutId => {
        window.clearTimeout(timeoutId);
      });
      falAutoDismissTimeouts.current.clear();
    };
  }, []);

  const rasterizeImages = (imagesToCompose: CanvasImage[]): Promise<{
    element: HTMLImageElement;
    x: number;
    y: number;
    width: number;
    height: number;
    naturalWidth: number;
    naturalHeight: number;
    file: File;
  }> => {
    return new Promise((resolve, reject) => {
      if (imagesToCompose.length === 0) {
        return reject(new Error("No images to rasterize."));
      }
  
      const minX = Math.min(...imagesToCompose.map(img => img.x));
      const minY = Math.min(...imagesToCompose.map(img => img.y));
      const maxX = Math.max(...imagesToCompose.map(img => img.x + img.width));
      const maxY = Math.max(...imagesToCompose.map(img => img.y + img.height));
  
      const width = maxX - minX;
      const height = maxY - minY;
  
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
  
      if (!ctx) {
        return reject(new Error("Could not create canvas context for rasterization."));
      }
  
      imagesToCompose.forEach(img => {
        ctx.drawImage(img.element, img.x - minX, img.y - minY, img.width, img.height);
      });
  
      const newImg = new Image();
      newImg.onload = async () => {
        try {
          // FIX: Await the fetch call before calling .blob()
          const blob = await (await fetch(newImg.src)).blob();
          const newFile = new File([blob], 'composite.png', { type: 'image/png' });
          const naturalWidth = newImg.naturalWidth || newImg.width || width;
          const naturalHeight = newImg.naturalHeight || newImg.height || height;
          const displayWidth = newImg.width || naturalWidth;
          const displayHeight = newImg.height || naturalHeight;
          resolve({
            element: newImg,
            x: minX,
            y: minY,
            width: displayWidth,
            height: displayHeight,
            naturalWidth,
            naturalHeight,
            file: newFile,
          });
        } catch (e) {
          reject(e);
        }
      };
      newImg.onerror = (err) => reject(err);
      newImg.src = canvas.toDataURL('image/png');
    });
  };

  const handleCommit = useCallback(() => {
    if (liveImages !== null || livePaths !== null || liveNotes !== null) {
      setState(prevState => ({
        images: liveImages ?? prevState.images,
        paths: livePaths ?? prevState.paths,
        notes: liveNotes ?? prevState.notes,
      }));
      setLiveImages(null);
      setLivePaths(null);
      setLiveNotes(null);
    }
  }, [liveImages, livePaths, liveNotes, setState]);

  const handleToolChange = useCallback((newTool: Tool) => {
      setTool(newTool);
      if (editingNoteId) {
          setEditingNoteId(null);
          handleCommit();
      }
      if(cropMode) {
        setCropMode(null);
      }
  }, [editingNoteId, handleCommit, cropMode]);

  const handleGenerate = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    const isTextToImage = !primaryImageId;

    if (!trimmedPrompt) {
      setError(isTextToImage ? 'Please describe the image you want to create.' : 'Please write a prompt to describe your edit.');
      return;
    }

    const usingFal = apiProvider === 'fal';
    const isSeedreamModel = falModelId === SEEDREAM_MODEL_ID;
    const isNanoModel = falModelId === NANO_BANANA_MODEL_ID;
    const isReveModel = falModelId === REVE_TEXT_TO_IMAGE_MODEL_ID;
    const shouldValidateFalOptions = usingFal && (isSeedreamModel || isNanoModel || isReveModel);
    const isNumImagesInvalid =
      !Number.isFinite(falNumImages) ||
      falNumImages < 1 ||
      falNumImages > 4;
    const normalizedFalNumImages = Math.min(4, Math.max(1, Math.floor(Number.isFinite(falNumImages) ? falNumImages : 1)));
    const googleAspectRatio = isNanoModel && falAspectRatioSelection !== 'default'
      ? falAspectRatioSelection
      : undefined;

    const activePrimaryImage = primaryImage;

    if (!isTextToImage) {
      if (!primaryImageId || !activePrimaryImage) {
        setError('Please select an image to edit.');
        return;
      }

      if (usingFal && isReveModel) {
        setError('Reve Image only supports text-to-image generation. Please switch to Nano Banana or Seedream for edits.');
        return;
      }

      if (appMode === 'CANVAS' && tool !== Tool.SELECTION && tool !== Tool.FREE_SELECTION) {
        setError('In Canvas Mode, please use the Select tool to perform a general image edit.');
        return;
      }

      if ((appMode === 'ANNOTATE' || appMode === 'INPAINT') && paths.length === 0) {
        setError(`Please use the Brush tool to draw ${appMode === 'ANNOTATE' ? 'annotations' : 'an inpaint mask'} before generating.`);
        return;
      }
    }

    if (shouldValidateFalOptions && isNumImagesInvalid) {
      setError('Number of images must be between 1 and 4.');
      return;
    }

    const falJobId = usingFal ? crypto.randomUUID() : null;

    if (usingFal && falJobId) {
      const newJob: FalQueueJob = {
        id: falJobId,
        prompt: trimmedPrompt,
        status: 'IN_QUEUE',
        logs: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setFalJobs(prev => [...prev.slice(-9), newJob]);
    } else {
      setIsLoading(true);
    }

    setError(null);

    try {
      let generationResult: { imageBase64: string; imagesBase64: string[]; text: string; requestId?: string };
      let placementOrigin = { x: 100, y: 100 };
      let sourceImageForAPI: {
        element: HTMLImageElement;
        x: number;
        y: number;
        width: number;
        height: number;
        naturalWidth: number;
        naturalHeight: number;
        file: File;
      } | null = null;

      if (isTextToImage) {
        const placementX = images.length > 0
          ? Math.max(...images.map(img => img.x + img.width)) + 20
          : 100;
        const placementY = images.length > 0
          ? Math.min(...images.map(img => img.y))
          : 100;
        placementOrigin = { x: placementX, y: placementY };

        if (usingFal) {
          if (!falJobId) {
            throw new Error('Unable to create Fal job identifier.');
          }

          const textToImageModelId = isSeedreamModel
            ? SEEDREAM_TEXT_TO_IMAGE_MODEL_ID
            : isReveModel
              ? REVE_TEXT_TO_IMAGE_MODEL_ID
              : NANO_BANANA_TEXT_TO_IMAGE_MODEL_ID;

          const falResult = await generateFalImage(trimmedPrompt, {
            onQueueUpdate: (update) => {
              setFalJobs(prev => prev.map(job => {
                if (job.id !== falJobId) {
                  return job;
                }

                const status = mapFalStatusToJobStatus(update.status);
                return {
                  ...job,
                  status,
                  requestId: update.requestId || job.requestId,
                  logs: mergeFalLogMessages(job.logs, update.logs),
                  updatedAt: Date.now(),
                };
              }));
            },
            modelId: textToImageModelId,
            aspectRatio: (isNanoModel || isReveModel) ? falAspectRatioSelection : 'default',
            ...(isSeedreamModel ? { imageSize: falImageSizeSelection } : {}),
            numImages: normalizedFalNumImages,
          });

          generationResult = falResult;

          setFalJobs(prev => prev.map(job => {
            if (job.id !== falJobId) {
              return job;
            }
            if (job.status === 'FAILED') {
              return job;
            }
            return {
              ...job,
              status: 'COMPLETED',
              requestId: falResult.requestId || job.requestId,
              description: falResult.text,
              updatedAt: Date.now(),
            };
          }));
        } else {
          generationResult = await generateGoogleImage(trimmedPrompt, {
            aspectRatio: googleAspectRatio,
          });
        }
      } else {
        if (!primaryImageId || !activePrimaryImage) {
          throw new Error('Unable to locate selected image for editing.');
        }

        const referenceCanvasImages = referenceImageIds
          .map(id => images.find(img => img.id === id))
          .filter((img): img is CanvasImage => !!img);

        const allSelectedImages = [activePrimaryImage, ...referenceCanvasImages];

        const shouldCompose = referenceCanvasImages.length > 0 &&
          referenceCanvasImages.some(refImg => isOverlapping(activePrimaryImage, refImg));

        let referenceImagesForAPI: HTMLImageElement[] = [];

        if (shouldCompose) {
          const imageIdsToCompose = allSelectedImages.map(img => img.id);
          const imagesToCompose = images.filter(img => imageIdsToCompose.includes(img.id));
          const composed = await rasterizeImages(imagesToCompose);
          sourceImageForAPI = composed;
          referenceImagesForAPI = [];
        } else {
          sourceImageForAPI = {
            element: activePrimaryImage.element,
            x: activePrimaryImage.x,
            y: activePrimaryImage.y,
            width: activePrimaryImage.width,
            height: activePrimaryImage.height,
            naturalWidth: activePrimaryImage.naturalWidth,
            naturalHeight: activePrimaryImage.naturalHeight,
            file: activePrimaryImage.file,
          };
          referenceImagesForAPI = referenceCanvasImages.map(img => img.element);
        }

        if (!sourceImageForAPI) {
          throw new Error('Failed to prepare source image for editing.');
        }

        const translatedPaths = paths.map(path => ({
          ...path,
          points: path.points.map(point => ({
            x: point.x - sourceImageForAPI.x,
            y: point.y - sourceImageForAPI.y,
          })),
        }));

        const naturalWidth = sourceImageForAPI.naturalWidth || sourceImageForAPI.element.naturalWidth || sourceImageForAPI.width;
        const naturalHeight = sourceImageForAPI.naturalHeight || sourceImageForAPI.element.naturalHeight || sourceImageForAPI.height;
        const scaleX = sourceImageForAPI.width === 0 ? 1 : naturalWidth / sourceImageForAPI.width;
        const scaleY = sourceImageForAPI.height === 0 ? 1 : naturalHeight / sourceImageForAPI.height;

        const scaledPaths = translatedPaths.map(path => ({
          ...path,
          size: path.size * scaleX,
          points: path.points.map(point => ({
            x: point.x * scaleX,
            y: point.y * scaleY,
          })),
        }));

        const toolForApi = appMode === 'ANNOTATE' ? Tool.ANNOTATE : appMode === 'INPAINT' ? Tool.INPAINT : tool;

        const basePayload = {
          prompt: trimmedPrompt,
          image: sourceImageForAPI.element,
          tool: toolForApi,
          paths: scaledPaths,
          imageDimensions: { width: naturalWidth, height: naturalHeight },
          inpaintMode,
          referenceImages: referenceImagesForAPI,
        } as const;

        placementOrigin = {
          x: sourceImageForAPI.x + sourceImageForAPI.width + 20,
          y: sourceImageForAPI.y,
        };

        if (usingFal) {
          if (!falJobId) {
            throw new Error('Unable to create Fal job identifier.');
          }

          const falResult = await generateFalImageEdit(basePayload, {
            modelId: falModelId,
            onQueueUpdate: (update) => {
              setFalJobs(prev => prev.map(job => {
                if (job.id !== falJobId) {
                  return job;
                }

                const status = mapFalStatusToJobStatus(update.status);
                return {
                  ...job,
                  status,
                  requestId: update.requestId || job.requestId,
                  logs: mergeFalLogMessages(job.logs, update.logs),
                  updatedAt: Date.now(),
                };
              }));
            },
            ...(isSeedreamModel
              ? {
                  imageSize: falImageSizeSelection === 'default'
                    ? 'default'
                    : falImageSizeSelection,
                }
              : {}),
            ...(isNanoModel
              ? {
                  aspectRatio: falAspectRatioSelection,
                }
              : {}),
            numImages: normalizedFalNumImages,
          });

          generationResult = falResult;

          setFalJobs(prev => prev.map(job => {
            if (job.id !== falJobId) {
              return job;
            }
            if (job.status === 'FAILED') {
              return job;
            }
            return {
              ...job,
              status: 'COMPLETED',
              requestId: falResult.requestId || job.requestId,
              description: falResult.text,
              updatedAt: Date.now(),
            };
          }));
        } else {
          generationResult = await generateGoogleImageEdit({
            ...basePayload,
            mimeType: sourceImageForAPI.file.type || 'image/png',
          });
        }
      }

      const generatedBase64Images = generationResult.imagesBase64.length > 0
        ? generationResult.imagesBase64
        : [generationResult.imageBase64];

      const generatedCanvasImages: CanvasImage[] = [];
      let yOffset = 0;

      for (let index = 0; index < generatedBase64Images.length; index += 1) {
        const base64 = generatedBase64Images[index];
        const dataUrl = `data:image/png;base64,${base64}`;
        const element = await loadImageFromDataUrl(dataUrl);
        const blob = await (await fetch(dataUrl)).blob();
        const naturalWidth = element.naturalWidth || element.width || 1;
        const naturalHeight = element.naturalHeight || element.height || 1;
        const displayWidth = element.width || naturalWidth;
        const displayHeight = element.height || naturalHeight;
        const fileSuffix = generatedBase64Images.length === 1 ? '' : `_${index + 1}`;
        const file = new File([blob], `generated_image${fileSuffix}.png`, { type: 'image/png' });

        generatedCanvasImages.push({
          id: crypto.randomUUID(),
          element,
          x: placementOrigin.x,
          y: placementOrigin.y + yOffset,
          width: displayWidth,
          height: displayHeight,
          naturalWidth,
          naturalHeight,
          file,
        });

        yOffset += displayHeight + 20;
      }

      if (generatedCanvasImages.length > 0) {
        setState(prevState => ({
          ...prevState,
          images: [...prevState.images, ...generatedCanvasImages],
        }));
      }

      setReferenceImageIds([]);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'An unknown error occurred.';

      if (usingFal && falJobId) {
        setFalJobs(prev => prev.map(job => {
          if (job.id !== falJobId) {
            return job;
          }
          return {
            ...job,
            status: 'FAILED',
            error: message,
            updatedAt: Date.now(),
          };
        }));
      }

      setError(message);
    } finally {
      if (!usingFal) {
        setIsLoading(false);
      }
    }
  }, [
    apiProvider,
    appMode,
    falAspectRatioSelection,
    falImageSizeSelection,
    falModelId,
    falNumImages,
    images,
    inpaintMode,
    paths,
    primaryImage,
    primaryImageId,
    prompt,
    referenceImageIds,
    setError,
    setFalJobs,
    setIsLoading,
    setReferenceImageIds,
    setSelectedImageIds,
    setSelectedNoteIds,
    setState,
    tool,
  ]);

  const handleBackgroundRemoval = useCallback(async () => {
    if (!hasSingleImageSelected || !primaryImageId) {
      setError('Please select an image to remove the background.');
      return;
    }

    if (!primaryImage) {
      setError('Selected image not found. Please select another image.');
      return;
    }

    setError(null);
    setIsRemovingBackground(true);

    try {
      const removalResult = await removeFalBackground(primaryImage.element);
      const dataUrl = `data:image/png;base64,${removalResult.imageBase64}`;
      const element = await loadImageFromDataUrl(dataUrl);
      const blob = await (await fetch(dataUrl)).blob();
      const naturalWidth = element.naturalWidth || element.width || 1;
      const naturalHeight = element.naturalHeight || element.height || 1;
      const displayWidth = element.width || naturalWidth;
      const displayHeight = element.height || naturalHeight;

      const originalName = primaryImage.file?.name || 'image.png';
      const baseName = originalName.includes('.')
        ? originalName.slice(0, originalName.lastIndexOf('.'))
        : originalName;
      const fileName = `${baseName || 'image'}_no_bg.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      const targetX = primaryImage.x + primaryImage.width + 20;
      const spacing = 20;
      const existingImages = displayedImages;
      let offsetMultiplier = 0;
      let placementY = primaryImage.y;
      const maxAttempts = existingImages.length + 10;

      const createCandidate = (y: number): CanvasImage => ({
        id: 'candidate',
        element,
        x: targetX,
        y,
        width: displayWidth,
        height: displayHeight,
        naturalWidth,
        naturalHeight,
        file,
      });

      while (
        offsetMultiplier <= maxAttempts &&
        existingImages.some(img => isOverlapping(img, createCandidate(placementY)))
      ) {
        offsetMultiplier += 1;
        placementY = primaryImage.y + offsetMultiplier * (element.height + spacing);
      }

      const newImage: CanvasImage = {
        ...createCandidate(placementY),
        id: crypto.randomUUID(),
      };

      setState(prevState => ({
        ...prevState,
        images: [...prevState.images, newImage],
      }));

      setSelectedImageIds([newImage.id]);
      setSelectedNoteIds([]);
      setReferenceImageIds([]);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to remove background.';
      setError(message);
    } finally {
      setIsRemovingBackground(false);
    }
  }, [
    hasSingleImageSelected,
    primaryImageId,
    primaryImage,
    displayedImages,
    setState,
  ]);

  // Crop handlers
  const handleStartCrop = useCallback((imageId: string) => {
    const imageToCrop = displayedImages.find(img => img.id === imageId);
    if (!imageToCrop) return;
    setCropMode({
      imageId: imageId,
      rect: { x: 0, y: 0, width: imageToCrop.width, height: imageToCrop.height },
    });
  }, [displayedImages]);

  const handleCropRectChange = useCallback((rect: { x: number; y: number; width: number; height: number; }) => {
    setCropMode(prev => prev ? { ...prev, rect } : null);
  }, []);

  const handleCancelCrop = useCallback(() => {
    setCropMode(null);
  }, []);

  const handleConfirmCrop = useCallback(async () => {
    if (!cropMode) return;

    const originalImage = history[historyIndex].images.find(img => img.id === cropMode.imageId);
    if (!originalImage) return;

    const { rect } = cropMode;
    if (rect.width <= 0 || rect.height <= 0) {
      handleCancelCrop();
      return;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = rect.width;
    tempCanvas.height = rect.height;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(
      originalImage.element,
      rect.x, rect.y, rect.width, rect.height,
      0, 0, rect.width, rect.height
    );

    const croppedImageURL = tempCanvas.toDataURL('image/png');
    const newImg = new Image();
    newImg.onload = async () => {
        const blob = await (await fetch(newImg.src)).blob();
        const newFile = new File([blob], "cropped_image.png", { type: "image/png" });
        const naturalWidth = newImg.naturalWidth || newImg.width || 1;
        const naturalHeight = newImg.naturalHeight || newImg.height || 1;
        const displayWidth = newImg.width || naturalWidth;
        const displayHeight = newImg.height || naturalHeight;
        
        const updatedImage: CanvasImage = {
          ...originalImage,
          element: newImg,
          x: originalImage.x + rect.x,
          y: originalImage.y + rect.y,
          width: displayWidth,
          height: displayHeight,
          naturalWidth,
          naturalHeight,
          file: newFile,
        };

        setState(prevState => ({
            ...prevState,
            images: prevState.images.map(img => img.id === originalImage.id ? updatedImage : img),
        }));
        setSelectedImageIds([originalImage.id]);
        setCropMode(null);
    };
    newImg.src = croppedImageURL;

  }, [cropMode, history, historyIndex, setState, handleCancelCrop]);

  useEffect(() => {
    // When a new note is added using the Note tool, switch to the free selection tool
    // to prevent accidental creation of multiple notes.
    if (tool === Tool.NOTE && displayedNotes.length > prevDisplayedNotesLength.current) {
        handleToolChange(Tool.FREE_SELECTION);
    }
    // Update the ref for the next render.
    prevDisplayedNotesLength.current = displayedNotes.length;
  }, [displayedNotes, tool, handleToolChange]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (cropMode) {
        if (e.key === 'Enter') handleConfirmCrop();
        if (e.key === 'Escape') handleCancelCrop();
        return;
      }
      if (editingNoteId) return; // Don't handle shortcuts while editing a note
      const activeEl = document.activeElement;
      if (
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key.toLowerCase() === 'escape' && tool === Tool.NOTE) {
        handleToolChange(Tool.SELECTION);
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'v': handleToolChange(Tool.SELECTION); break;
        case 'f': handleToolChange(Tool.FREE_SELECTION); break;
        case 'h': handleToolChange(Tool.PAN); break;
        case 'b': if (appMode !== 'CANVAS') handleToolChange(Tool.BRUSH); break;
        case 'e': handleToolChange(Tool.ERASE); break;
        case 'n': handleToolChange(Tool.NOTE); break;
        case '=':
        case '+':
          e.preventDefault();
          requestZoomIn();
          break;
        case '-':
        case '_':
          e.preventDefault();
          requestZoomOut();
          break;
        case 'delete':
        case 'backspace':
          handleDelete();
          break;
        case '.':
          if (images.length > 0 || notes.length > 0) {
            handleZoomToFit();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDelete, handleZoomToFit, images, notes, editingNoteId, tool, handleToolChange, appMode, cropMode, handleConfirmCrop, handleCancelCrop, requestZoomIn, requestZoomOut]);
  
  useEffect(() => {
    const handleGlobalSubmit = (e: KeyboardEvent) => {
      if (cropMode) return;

      const isCanvasGenerationTool = tool === Tool.SELECTION || tool === Tool.FREE_SELECTION;
      const isSeedreamModel = falModelId === SEEDREAM_MODEL_ID;
      const isNanoModel = falModelId === NANO_BANANA_MODEL_ID;
      const isReveModel = falModelId === REVE_TEXT_TO_IMAGE_MODEL_ID;
      const shouldValidateFalOptions = apiProvider === 'fal' && (isSeedreamModel || isNanoModel || isReveModel);
      const isNumImagesInvalid =
        !Number.isFinite(falNumImages) ||
        falNumImages < 1 ||
        falNumImages > 4;

      const isTextToImage = !primaryImageId;
      const promptEmpty = prompt.trim().length === 0;

      const submitDisabled = promptEmpty ||
        (shouldValidateFalOptions && isNumImagesInvalid) ||
        (!isTextToImage && (
          (apiProvider === 'fal' && isReveModel) ||
          (appMode === 'CANVAS' && !isCanvasGenerationTool) ||
          (appMode === 'ANNOTATE' && paths.length === 0) ||
          (appMode === 'INPAINT' && paths.length === 0)
        ));

      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        
        if (!isLoading && !submitDisabled) {
          handleGenerate();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalSubmit);
    return () => {
      window.removeEventListener('keydown', handleGlobalSubmit);
    };
  }, [
    isLoading,
    primaryImageId,
    tool,
    appMode,
    paths,
    handleGenerate,
    cropMode,
    apiProvider,
    falModelId,
    falNumImages,
    prompt,
  ]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const undo = useCallback(() => {
    if (canUndo) {
      setLiveImages(null);
      setLivePaths(null);
      setLiveNotes(null);
      setHistoryState(prev => ({ ...prev, index: prev.index - 1 }));
    }
  }, [canUndo]);
  
  const redo = useCallback(() => {
    if (canRedo) {
      setLiveImages(null);
      setLivePaths(null);
      setLiveNotes(null);
      setHistoryState(prev => ({ ...prev, index: prev.index + 1 }));
    }
  }, [canRedo]);


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const naturalWidth = img.naturalWidth || img.width || 1;
          const naturalHeight = img.naturalHeight || img.height || 1;
          const displayWidth = img.width || naturalWidth;
          const displayHeight = img.height || naturalHeight;
          setState(prevState => {
            let newX = 0;
            let newY = 0;
            if (prevState.images.length > 0) {
              const lastImage = prevState.images[prevState.images.length - 1];
              newX = lastImage.x + lastImage.width + 20;
              newY = lastImage.y;
            }

            const newCanvasImage: CanvasImage = {
              id: crypto.randomUUID(),
              element: img,
              x: newX,
              y: newY,
              width: displayWidth,
              height: displayHeight,
              naturalWidth,
              naturalHeight,
              file: file,
            };
            setSelectedImageIds([newCanvasImage.id]);
            setSelectedNoteIds([]);
            setReferenceImageIds([]);
            return {
              ...prevState,
              images: [...prevState.images, newCanvasImage],
              paths: [],
            };
          });
          setTool(Tool.SELECTION);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
      e.target.value = ''; // Reset file input
    }
  };

  const handleFilesDrop = useCallback((files: FileList, point: Point) => {
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    let lastAddedImageId: string | null = null;
    const newImages: CanvasImage[] = [];
    let imagesProcessed = 0;

    imageFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const naturalWidth = img.naturalWidth || img.width || 1;
                const naturalHeight = img.naturalHeight || img.height || 1;
                const displayWidth = img.width || naturalWidth;
                const displayHeight = img.height || naturalHeight;
                const newCanvasImage: CanvasImage = {
                    id: crypto.randomUUID(),
                    element: img,
                    x: point.x - (displayWidth / 2) + (index * 20),
                    y: point.y - (displayHeight / 2) + (index * 20),
                    width: displayWidth,
                    height: displayHeight,
                    naturalWidth,
                    naturalHeight,
                    file: file,
                };
                newImages.push(newCanvasImage);
                lastAddedImageId = newCanvasImage.id;
                imagesProcessed++;
                
                if (imagesProcessed === imageFiles.length) {
                    setState(prevState => ({
                        ...prevState,
                        images: [...prevState.images, ...newImages],
                        paths: [], 
                    }));
                    setSelectedImageIds(lastAddedImageId ? [lastAddedImageId] : []);
                    setSelectedNoteIds([]);
                    setReferenceImageIds([]);
                    setTool(Tool.SELECTION);
                }
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    });
  }, [setState]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };
  
  const handleDownload = useCallback(() => {
    if (!hasSingleImageSelected || !primaryImageId) return;
    const imageToDownload = images.find(img => img.id === primaryImageId);
    if (!imageToDownload) return;

    const link = document.createElement('a');
    link.href = imageToDownload.element.src;
    link.download = imageToDownload.file.name || 'download.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [hasSingleImageSelected, primaryImageId, images]);
  
  const handleImageSelection = useCallback((
    imageId: string | null,
    options: { multi?: boolean; reference?: boolean } = {},
  ) => {
    const { multi = false, reference = false } = options;

    if (!imageId) {
      if (!multi) {
        setSelectedImageIds([]);
        setSelectedNoteIds([]);
        setReferenceImageIds([]);
      }
      return;
    }

    if (reference && primaryImageId && imageId !== primaryImageId) {
      setReferenceImageIds(prevIds => {
        if (prevIds.includes(imageId)) {
          return prevIds.filter(id => id !== imageId);
        }
        if (prevIds.length < MAX_REFERENCE_IMAGES) {
          return [...prevIds, imageId];
        }
        return prevIds;
      });
      return;
    }

    if (multi) {
      setReferenceImageIds([]);
      setSelectedImageIds(prevIds => {
        if (prevIds.includes(imageId)) {
          return prevIds.filter(id => id !== imageId);
        }
        return [...prevIds, imageId];
      });
      return;
    }

    if (primaryImageId === imageId && selectedImageIds.length === 1) {
      setSelectedNoteIds([]);
      setReferenceImageIds([]);
      return;
    }

    setSelectedImageIds([imageId]);
    setSelectedNoteIds([]);
    setReferenceImageIds([]);
  }, [primaryImageId, selectedImageIds.length]);

  const handleNoteSelection = useCallback((
    noteId: string | null,
    options: { multi?: boolean } = {},
  ) => {
      const { multi = false } = options;

      if (!noteId) {
        if (!multi) {
          setSelectedNoteIds([]);
          setSelectedImageIds([]);
          setReferenceImageIds([]);
        }
        return;
      }

      if (multi) {
        setSelectedNoteIds(prevIds => {
          if (prevIds.includes(noteId)) {
            return prevIds.filter(id => id !== noteId);
          }
          return [...prevIds, noteId];
        });
        return;
      }

      if (primaryNoteId === noteId && selectedNoteIds.length === 1) {
        setSelectedImageIds([]);
        setReferenceImageIds([]);
        return;
      }

      setSelectedNoteIds([noteId]);
      setSelectedImageIds([]);
      setReferenceImageIds([]);
  }, [primaryNoteId, selectedNoteIds.length]);

  const handleNoteTextChange = useCallback((noteId: string, text: string) => {
    const targetNotes = liveNotes ?? displayedNotes;
    const noteIndex = targetNotes.findIndex(n => n.id === noteId);
    if (noteIndex === -1) return;

    const newNotes = [...targetNotes];
    newNotes[noteIndex] = { ...newNotes[noteIndex], text };
    setLiveNotes(newNotes);
  }, [liveNotes, displayedNotes]);

  const selectedImageIndex = primaryImageId ? images.findIndex(img => img.id === primaryImageId) : -1;
  const isImageOverlapping = primaryImageId && selectedImageIndex !== -1 ? images.some(other => other.id !== primaryImageId && isOverlapping(images[selectedImageIndex], other)) : false;
  const canMoveUp = selectedImageIndex > -1 && selectedImageIndex < images.length - 1;
  const canMoveDown = selectedImageIndex > -1 && selectedImageIndex > 0;

  const isCanvasGenerationTool = tool === Tool.SELECTION || tool === Tool.FREE_SELECTION;
  const isTextToImage = !primaryImageId;
  const promptEmpty = prompt.trim().length === 0;
  const isSeedreamModel = falModelId === SEEDREAM_MODEL_ID;
  const isNanoModel = falModelId === NANO_BANANA_MODEL_ID;
  const isReveModel = falModelId === REVE_TEXT_TO_IMAGE_MODEL_ID;
  const shouldValidateFalOptions = apiProvider === 'fal' && (isSeedreamModel || isNanoModel || isReveModel);
  const isNumImagesInvalid =
    !Number.isFinite(falNumImages) ||
    falNumImages < 1 ||
    falNumImages > 4;

  const submitDisabled = promptEmpty ||
    (shouldValidateFalOptions && isNumImagesInvalid) ||
    (!isTextToImage && (
      (apiProvider === 'fal' && isReveModel) ||
      (appMode === 'CANVAS' && !isCanvasGenerationTool) ||
      (appMode === 'ANNOTATE' && paths.length === 0) ||
      (appMode === 'INPAINT' && paths.length === 0)
    ));

  const promptPlaceholderText = isTextToImage
    ? 'Describe the image you want to create... (Cmd/Ctrl + Enter to generate)'
    : 'Describe your edit... (Cmd/Ctrl + Enter to generate)';

  const shouldShowSeedreamImageSizeControl = apiProvider === 'fal' && isSeedreamModel;
  const supportsAspectRatioControl = isNanoModel || isReveModel;
  const shouldShowAspectRatioControl = supportsAspectRatioControl && (apiProvider === 'fal' || isTextToImage);
  const shouldShowNumImagesControl = apiProvider === 'fal' && (isSeedreamModel || isNanoModel || isReveModel);

  const promptBarModelControlsList: PromptBarModelControl[] = [];

  if (shouldShowSeedreamImageSizeControl) {
    promptBarModelControlsList.push({
      id: 'fal-image-size-select',
      ariaLabel: 'Select Seedream image size',
      options: FAL_IMAGE_SIZE_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: falImageSizeSelection,
      onChange: handleFalImageSizeChange,
      disabled: isLoading,
    });
  }

  if (shouldShowAspectRatioControl) {
    const aspectRatioOptions = isReveModel ? FAL_REVE_ASPECT_RATIO_OPTIONS : FAL_NANO_ASPECT_RATIO_OPTIONS;
    promptBarModelControlsList.push({
      id: 'fal-aspect-ratio-select',
      ariaLabel: isReveModel ? 'Select Reve Image aspect ratio' : 'Select Nano Banana aspect ratio',
      options: aspectRatioOptions.map(option => ({ value: option.value, label: option.label })),
      value: falAspectRatioSelection,
      onChange: handleFalAspectRatioChange,
      disabled: isLoading,
    });
  }

  if (shouldShowNumImagesControl) {
    promptBarModelControlsList.push({
      id: 'fal-num-images-select',
      ariaLabel: 'Select number of images to generate',
      options: FAL_NUM_IMAGE_OPTIONS.map(option => ({ value: `${option}`, label: `${option}` })),
      value: falNumImages.toString(),
      onChange: (value: string) => handleFalNumImagesChange(Number(value)),
      disabled: isLoading,
      errorMessage: shouldValidateFalOptions && isNumImagesInvalid ? 'Num images must be between 1 and 4.' : undefined,
    });
  }

  const promptBarModelControls: ReadonlyArray<PromptBarModelControl> | undefined =
    promptBarModelControlsList.length > 0 ? promptBarModelControlsList : undefined;

  return (
    <div className="h-screen w-screen bg-gray-800 text-white flex flex-col overflow-hidden">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
      <input
        type="file"
        ref={snapshotInputRef}
        onChange={handleSnapshotFileChange}
        accept="application/json"
        className="hidden"
      />
      <div ref={fileMenuRef} className="absolute top-4 left-4 z-30">
        <button
          type="button"
          onClick={toggleFileMenu}
          aria-haspopup="menu"
          aria-expanded={isFileMenuOpen}
          aria-label="Snapshot menu"
          className="p-2 text-white bg-transparent hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-md transition-colors"
        >
          <HamburgerIcon className="w-6 h-6" />
        </button>
        {isFileMenuOpen && (
          <div
            role="menu"
            className="mt-2 w-40 rounded-md border border-gray-700 bg-gray-900/95 shadow-lg overflow-hidden"
          >
            <button
              type="button"
              role="menuitem"
              onClick={handleImportSnapshot}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-700 transition-colors"
            >
              Import Snapshot
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={handleExportSnapshot}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-700 transition-colors"
            >
              Export Snapshot
            </button>
          </div>
        )}
      </div>
      
      {!cropMode && (
        <Toolbar
          activeTool={tool}
          onToolChange={handleToolChange}
          appMode={appMode}
          onModeChange={handleModeChange}
          brushSize={brushSize}
          onBrushSizeChange={setBrushSize}
          brushColor={brushColor}
          onBrushColorChange={setBrushColor}
          onClear={handleClear}
          onUploadClick={handleUploadClick}
          inpaintMode={inpaintMode}
          onInpaintModeChange={setInpaintMode}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          onDownload={handleDownload}
          isImageSelected={hasSingleImageSelected}
          isObjectSelected={selectedImageIds.length > 0 || selectedNoteIds.length > 0}
          onDelete={handleDelete}
          onRemoveBackground={handleBackgroundRemoval}
          isBackgroundRemovalDisabled={!hasSingleImageSelected || isRemovingBackground || isLoading}
          isBackgroundRemovalLoading={isRemovingBackground}
        />
      )}
      
      <main className="flex-1 relative">
        <Canvas
          images={displayedImages}
          onImagesChange={setLiveImages}
          notes={displayedNotes}
          onNotesChange={setLiveNotes}
          tool={tool}
          appMode={appMode}
          paths={displayedPaths}
          onPathsChange={setLivePaths}
          brushSize={brushSize}
          brushColor={brushColor}
          selectedImageIds={selectedImageIds}
          selectedNoteIds={selectedNoteIds}
          referenceImageIds={referenceImageIds}
          onImageSelect={handleImageSelection}
          onNoteSelect={handleNoteSelection}
  
          onCommit={handleCommit}
          onFilesDrop={handleFilesDrop}
          zoomToFitTrigger={zoomToFitTrigger}
          zoomInTrigger={zoomInTrigger}
          zoomOutTrigger={zoomOutTrigger}
          editingNoteId={editingNoteId}
          onNoteDoubleClick={setEditingNoteId}
          onNoteTextChange={handleNoteTextChange}
          onNoteEditEnd={() => setEditingNoteId(null)}
          onImageOrderChange={handleImageOrderChange}
          isImageOverlapping={isImageOverlapping}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          cropMode={cropMode}
          onStartCrop={handleStartCrop}
          onCropRectChange={handleCropRectChange}
          onConfirmCrop={handleConfirmCrop}
          onCancelCrop={handleCancelCrop}
          onNoteCopy={handleNoteCopy}
        />
        <ViewToolbar onZoomToFit={handleZoomToFit} disabled={images.length === 0 && notes.length === 0} />
      </main>
      
      {error && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-red-500 text-white p-3 rounded-md shadow-lg z-20 max-w-md text-center">
            <p>{error}</p>
            <button onClick={() => setError(null)} className="absolute -top-1 -right-1 text-2xl font-bold bg-red-700 rounded-full h-6 w-6 flex items-center justify-center leading-none">&times;</button>
        </div>
      )}
      
      {toastMessage && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-green-500 text-white p-3 rounded-md shadow-lg z-20 max-w-md text-center">
            <p>{toastMessage}</p>
        </div>
      )}

      <FalQueuePanel jobs={falJobs} onDismiss={handleDismissFalJob} />

      {!cropMode && (
        <div className="absolute bottom-4 left-4 z-20 flex items-center space-x-2">
          {(['google', 'fal'] as const).map((provider) => {
            const isActive = apiProvider === provider;
            return (
              <button
                key={provider}
                type="button"
                onClick={() => setApiProvider(provider)}
                disabled={isLoading}
                aria-pressed={isActive}
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors duration-200 ${isActive ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'} disabled:bg-gray-600 disabled:text-gray-300 disabled:cursor-not-allowed`}
              >
                {provider === 'google' ? 'Google' : 'FAL'}
              </button>
            );
          })}
        </div>
      )}
      
      {!cropMode && (
        <PromptBar
          prompt={prompt}
          onPromptChange={setPrompt}
          onSubmit={handleGenerate}
          isLoading={isLoading}
          inputDisabled={false}
          submitDisabled={submitDisabled}
          modelOptions={FAL_MODEL_OPTIONS}
          selectedModel={falModelId}
          onModelChange={(modelId) => {
            if (isFalModelId(modelId)) {
              setFalModelId(modelId);
            }
          }}
          modelSelectDisabled={apiProvider !== 'fal' || isLoading}
          modelControls={promptBarModelControls}
          promptPlaceholder={promptPlaceholderText}
        />
      )}
    </div>
  );
}
