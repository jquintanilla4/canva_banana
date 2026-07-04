import { useCallback, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type {
  ApiProviderId,
  AppMode,
  CanvasImage,
  CanvasNote,
  CanvasVideoPromptArea,
  CanvasVideoPromptBar,
  Path,
} from '../types';
import { Tool } from '../types';
import {
  snapshotBinaryToBlob,
  writeSnapshotBinary,
  type SnapshotBinary,
  type SnapshotMetaState,
  buildSnapshotBinaryFromState,
  restoreSnapshotFromFile,
} from '../services/snapshotService';
import { pruneBackupSessions, saveBackupSession } from '../services/backupService';
import {
  getFalNumImageMaxForModel,
  isFalAspectRatioSelectionValue,
  isFalImageModelId,
  isFalImageSizeSelectionValue,
  isFalResolutionSelectionValue,
  isInfinitalkAccelerationSelectionValue,
  isInfinitalkResolutionSelectionValue,
  isInfinitalkSeedSelectionValue,
  isKlingV3CfgScaleSelectionValue,
  isKlingV3DurationSelectionValue,
  isKlingV3ShotDurationSelectionValue,
  isGrokImagineVideoAspectRatioSelectionValue,
  isGrokImagineVideoDurationSelectionValue,
  isGrokImagineVideoResolutionSelectionValue,
  isSeedance2AspectRatioSelectionValue,
  isSeedance2DurationSelectionValue,
  isJimengSeedance2ModelVersion,
  isSeedance2ResolutionSelectionValue,
  isSeedance2Variant,
  isVeo31AspectRatioSelectionValue,
  isVeo31DurationSelectionValue,
  isVeo31ResolutionSelectionValue,
  isVeo31Variant,
  isWan27VideoAspectRatioSelectionValue,
  isWan27VideoDurationSelectionValue,
  isWan27VideoResolutionSelectionValue,
  isWan27VideoVariant,
  normalizeVeo31Variant,
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
  apiProvider: ApiProvider;
  setAppMode: Dispatch<SetStateAction<AppMode>>;
  setTool: Dispatch<SetStateAction<Tool>>;
  setBrushSize: Dispatch<SetStateAction<number>>;
  setEraserSize: Dispatch<SetStateAction<number>>;
  setBrushColor: Dispatch<SetStateAction<string>>;
  setPrompt: Dispatch<SetStateAction<string>>;
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
  displayedVideoPromptAreas: CanvasVideoPromptArea[];
  displayedVideoPromptBars: CanvasVideoPromptBar[];
  resetHistory: (state: AppState) => void;
  providerAvailability: Record<ApiProvider, boolean>;
  availableProviders: ApiProvider[];
  autosaveEnabled: boolean;
};

type SnapshotIOResult = {
  exportSnapshot: () => Promise<void>;
  importSnapshotFromFile: (file: File) => Promise<void>;
  importSnapshotWithPicker: (onFallback: () => void) => Promise<void>;
  autosaveSnapshot: (stateOverride?: AppState) => void;
};

type AutosaveSessionInfo = {
  id: string;
  createdAt: number;
  fileName: string;
};

type DesktopAutosaveTarget = {
  kind: 'desktop';
  autosaveId: string;
};

type AutosavePrimaryTarget = FileSystemFileHandle | DesktopAutosaveTarget | null;

const isDesktopAutosaveTarget = (target: AutosavePrimaryTarget): target is DesktopAutosaveTarget =>
  Boolean(target) && 'kind' in target && target.kind === 'desktop';

export const prepareImagesForSnapshot = (images: CanvasImage[]): CanvasImage[] => images.map(image => {
  if (image.mediaType !== 'audio' || !image.isPlaying || !image.audioElement) {
    return image;
  }
  const currentPlaybackTime = image.audioElement.currentTime;
  if (!Number.isFinite(currentPlaybackTime)) {
    return image;
  }
  return { ...image, currentPlaybackTime }; // Persist the live audio playhead without pushing RAF state.
});

export const prepareStateForSnapshot = (state: AppState): AppState => ({
  ...state,
  images: prepareImagesForSnapshot(state.images),
});

const readBlobAsArrayBuffer = (blob: Blob): Promise<ArrayBuffer> => {
  const modernBlob = blob as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof modernBlob.arrayBuffer === 'function') {
    return modernBlob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read snapshot data.'));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
};

export function useSnapshotIO({
  ui,
  fal,
  selection,
  displayedImages,
  displayedNotes,
  displayedPaths,
  displayedVideoPromptAreas,
  displayedVideoPromptBars,
  resetHistory,
  providerAvailability,
  availableProviders,
  autosaveEnabled,
}: SnapshotIOArgs): SnapshotIOResult {
  const {
    appMode,
    tool,
    brushSize,
    eraserSize,
    brushColor,
    prompt,
    apiProvider,
    setAppMode,
    setTool,
    setBrushSize,
    setEraserSize,
    setBrushColor,
    setPrompt,
    setApiProvider,
    setError,
    setToastMessage,
    setIsFileMenuOpen,
  } = ui;

  // Persist file handles so autosave can keep writing without prompting each time.
  const autosavePrimaryHandleRef = useRef<AutosavePrimaryTarget>(null);
  const autosaveSessionRef = useRef<AutosaveSessionInfo | null>(null);
  // Serialize autosave writes to avoid overlapping writes on rapid generations.
  const autosaveQueueRef = useRef<Promise<void>>(Promise.resolve());

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
    oneToAllAnimateResolution,
    wanAnimateShift,
    wanAnimateQuality,
    wanAnimateUseTurbo,
    heygenEnableCaption,
    heygenEnableDynamicDuration,
    heygenDisableMusicTrack,
    heygenEnableSpeechEnhancement,
    infinitalkResolution,
    infinitalkSeed,
    infinitalkAcceleration,
    grokImagineVideoDuration,
    grokImagineVideoResolution,
    grokImagineVideoAspectRatio,
    veo31Variant,
    veo31Duration,
    veo31Resolution,
    veo31AspectRatio,
    veo31GenerateAudio,
    wan27VideoResolution,
    wan27VideoDuration,
    wan27VideoAspectRatio,
    wan27VideoPromptExpansion,
    wan27VideoVariant,
    wan27VideoAudioSetting,
    seedance2Variant,
    seedance2JimengModelVersion,
    seedance2AspectRatio,
    seedance2Resolution,
    seedance2Duration,
    seedance2GenerateAudio,
    seedance2CameraFixed,
    klingV3Duration,
    klingV3GenerateAudio,
    klingV3CfgScale,
    klingV3MultiPromptEnabled,
    klingV3MultiPrompt,
    klingV3Shot1Duration,
    klingV3Shot2Duration,
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
    setOneToAllAnimateResolution,
    setWanAnimateShift,
    setWanAnimateQuality,
    setWanAnimateUseTurbo,
    setHeygenEnableCaption,
    setHeygenEnableDynamicDuration,
    setHeygenDisableMusicTrack,
    setHeygenEnableSpeechEnhancement,
    setInfinitalkResolution,
    setInfinitalkSeed,
    setInfinitalkAcceleration,
    setGrokImagineVideoDuration,
    setGrokImagineVideoResolution,
    setGrokImagineVideoAspectRatio,
    setVeo31Variant,
    setVeo31Duration,
    setVeo31Resolution,
    setVeo31AspectRatio,
    setVeo31GenerateAudio,
    setWan27VideoResolution,
    setWan27VideoDuration,
    setWan27VideoAspectRatio,
    setWan27VideoPromptExpansion,
    setWan27VideoVariant,
    setWan27VideoAudioSetting,
    setSeedance2Variant,
    handleSeedance2JimengModelVersionChange,
    setSeedance2AspectRatio,
    setSeedance2Resolution,
    setSeedance2Duration,
    setSeedance2GenerateAudio,
    setSeedance2CameraFixed,
    setKlingV3Duration,
    setKlingV3GenerateAudio,
    setKlingV3CfgScale,
    setKlingV3MultiPromptEnabled,
    setKlingV3MultiPrompt,
    setKlingV3Shot1Duration,
    setKlingV3Shot2Duration,
  } = fal;

  const {
    selectedImageIds,
    selectedNoteIds,
    referenceImageIds,
    referenceVideoIds,
    referenceAudioIds,
    seedanceReferenceOrderIds,
    elementImageIds,
    videoLastFrameImageId,
    setSelectedImageIds,
    setSelectedNoteIds,
    setReferenceImageIds,
    setReferenceVideoIds,
    setReferenceAudioIds,
    setSeedanceReferenceOrderIds,
    setElementImageIds,
    setVideoLastFrameImageId,
  } = selection;
  // Serialize current canvas state plus UI settings into a binary snapshot for export/share.
  const buildSnapshotBinary = useCallback(async (stateOverride?: AppState): Promise<SnapshotBinary> => {
    const snapshotState = prepareStateForSnapshot(stateOverride ?? {
      images: displayedImages,
      notes: displayedNotes,
      paths: displayedPaths,
      videoPromptAreas: displayedVideoPromptAreas,
      videoPromptBars: displayedVideoPromptBars,
    });
    const meta: SnapshotMetaState = {
      appMode,
      tool,
      brushSize,
      eraserSize,
      brushColor,
      prompt,
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
      oneToAllAnimateResolution,
      wanAnimateShift,
      wanAnimateQuality,
      wanAnimateUseTurbo,
      heygenEnableCaption,
      heygenEnableDynamicDuration,
      heygenDisableMusicTrack,
      heygenEnableSpeechEnhancement,
      infinitalkResolution,
      infinitalkSeed,
      infinitalkAcceleration,
      grokImagineVideoDuration,
      grokImagineVideoResolution,
      grokImagineVideoAspectRatio,
      veo31Variant,
      veo31Duration,
      veo31Resolution,
      veo31AspectRatio,
      veo31GenerateAudio,
      wan27VideoResolution,
      wan27VideoDuration,
      wan27VideoAspectRatio,
      wan27VideoPromptExpansion,
      wan27VideoVariant,
      wan27VideoAudioSetting,
      seedance2Variant,
      seedance2JimengModelVersion,
      seedance2AspectRatio,
      seedance2Resolution,
      seedance2Duration,
      seedance2GenerateAudio,
      seedance2CameraFixed,
      klingV3Duration,
      klingV3GenerateAudio,
      klingV3CfgScale,
      klingV3MultiPromptEnabled,
      klingV3MultiPrompt,
      klingV3Shot1Duration,
      klingV3Shot2Duration,
      selectedImageIds: [...selectedImageIds],
      selectedNoteIds: [...selectedNoteIds],
      referenceImageIds: [...referenceImageIds],
      ...(referenceVideoIds.length ? { referenceVideoIds: [...referenceVideoIds] } : {}),
      ...(referenceAudioIds.length ? { referenceAudioIds: [...referenceAudioIds] } : {}),
      ...(seedanceReferenceOrderIds.length ? { seedanceReferenceOrderIds: [...seedanceReferenceOrderIds] } : {}), // Snapshot restore should preserve Seedance label order.
      ...(elementImageIds.length ? { elementImageIds: [...elementImageIds] } : {}),
      ...(videoLastFrameImageId ? { videoLastFrameImageId } : {}),
    };

    return buildSnapshotBinaryFromState({
      images: snapshotState.images,
      notes: snapshotState.notes,
      paths: snapshotState.paths,
      videoPromptAreas: snapshotState.videoPromptAreas,
      videoPromptBars: snapshotState.videoPromptBars,
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
    displayedVideoPromptAreas,
    displayedVideoPromptBars,
    eraserSize,
    falAspectRatioSelection,
    falCreativity,
    wanTargetResolution,
    wanCreativity,
    wanAnimateVariant,
    wanAnimateSteps,
    wanAnimateResolution,
    oneToAllAnimateResolution,
    wanAnimateShift,
    wanAnimateQuality,
    wanAnimateUseTurbo,
    heygenEnableCaption,
    heygenEnableDynamicDuration,
    heygenDisableMusicTrack,
    heygenEnableSpeechEnhancement,
    infinitalkResolution,
    infinitalkSeed,
    infinitalkAcceleration,
    grokImagineVideoDuration,
    grokImagineVideoResolution,
    grokImagineVideoAspectRatio,
    veo31Variant,
    veo31Duration,
    veo31Resolution,
    veo31AspectRatio,
    veo31GenerateAudio,
    wan27VideoResolution,
    wan27VideoDuration,
    wan27VideoAspectRatio,
    wan27VideoPromptExpansion,
    wan27VideoVariant,
    wan27VideoAudioSetting,
    seedance2Variant,
    seedance2JimengModelVersion,
    seedance2AspectRatio,
    seedance2Resolution,
    seedance2Duration,
    seedance2GenerateAudio,
    seedance2CameraFixed,
    klingV3Duration,
    klingV3GenerateAudio,
    klingV3CfgScale,
    klingV3MultiPromptEnabled,
    klingV3MultiPrompt,
    klingV3Shot1Duration,
    klingV3Shot2Duration,
    falImageSizeSelection,
    falModelId,
    falNoiseScale,
    falNumImages,
    falResolutionSelection,
    elementImageIds,
    falScaleFactor,
    prompt,
    referenceAudioIds,
    referenceImageIds,
    referenceVideoIds,
    selectedImageIds,
    selectedNoteIds,
    tool,
    videoLastFrameImageId,
  ]);

  // Wrap FileSystemFileHandle writes so callers don't repeat the write/close flow.
  const writeSnapshotToHandle = useCallback(async (
    handle: FileSystemFileHandle,
    snapshotBinary: SnapshotBinary,
  ): Promise<void> => {
    const writable = await handle.createWritable();
    try {
      await writeSnapshotBinary(snapshotBinary, writable);
    } finally {
      await writable.close();
    }
  }, []);

  const writeSnapshotToPrimaryTarget = useCallback(async (
    target: Exclude<AutosavePrimaryTarget, null>,
    snapshotBinary: SnapshotBinary,
    snapshotBlob?: Blob,
  ): Promise<void> => {
    if (isDesktopAutosaveTarget(target)) {
      const writeSnapshotFile = window.canvaBananaDesktop?.fileMenu?.writeSnapshotFile;
      if (!writeSnapshotFile) {
        throw new Error('Desktop snapshot autosave is unavailable.');
      }
      const blob = snapshotBlob ?? snapshotBinaryToBlob(snapshotBinary);
      await writeSnapshotFile({ autosaveId: target.autosaveId, data: await readBlobAsArrayBuffer(blob) });
      return;
    }
    await writeSnapshotToHandle(target, snapshotBinary);
  }, [writeSnapshotToHandle]);

  // Best-effort autosave; no-op unless autosave is enabled and a session is active.
  const autosaveSnapshot = useCallback((stateOverride?: AppState) => {
    if (!autosaveEnabled) {
      return;
    }
    const primaryHandle = autosavePrimaryHandleRef.current;
    const session = autosaveSessionRef.current;
    if (!session) {
      return;
    }
    const snapshotState = prepareStateForSnapshot(stateOverride ?? {
      images: displayedImages,
      notes: displayedNotes,
      paths: displayedPaths,
      videoPromptAreas: displayedVideoPromptAreas,
      videoPromptBars: displayedVideoPromptBars,
    });

    autosaveQueueRef.current = autosaveQueueRef.current
      .catch(() => Promise.resolve())
      .then(async () => {
        // Rebuild the binary just-in-time so state stays fresh.
        const snapshotBinary = await buildSnapshotBinary(snapshotState);
        const backupBlob = snapshotBinaryToBlob(snapshotBinary);
        if (primaryHandle) {
          await writeSnapshotToPrimaryTarget(primaryHandle, snapshotBinary, backupBlob);
        }
        // Save a local backup snapshot so users can restore recent sessions.
        await saveBackupSession({
          id: session.id,
          createdAt: session.createdAt,
          updatedAt: Date.now(),
          fileName: session.fileName,
          size: backupBlob.size,
          blob: backupBlob,
        });
        await pruneBackupSessions(3);
      })
      .catch(err => {
        console.error(err);
        const message = err instanceof Error ? err.message : 'Autosave failed.';
        setError(message);
      });
  }, [
    autosaveEnabled,
    buildSnapshotBinary,
    displayedImages,
    displayedNotes,
    displayedPaths,
    displayedVideoPromptAreas,
    displayedVideoPromptBars,
    setError,
    writeSnapshotToPrimaryTarget,
  ]);

  const rememberExportedSnapshot = useCallback(async (
    fileName: string,
    snapshotBinary: SnapshotBinary,
    primaryHandle: AutosavePrimaryTarget,
    snapshotBlob?: Blob,
  ): Promise<boolean> => {
    const sessionId = crypto.randomUUID();
    const sessionCreatedAt = Date.now();
    const backupBlob = snapshotBlob ?? snapshotBinaryToBlob(snapshotBinary);
    autosaveSessionRef.current = {
      id: sessionId,
      createdAt: sessionCreatedAt,
      fileName,
    };
    autosavePrimaryHandleRef.current = primaryHandle;

    try {
      // Persist the initial backup so it shows up in the Backups dialog.
      await saveBackupSession({
        id: sessionId,
        createdAt: sessionCreatedAt,
        updatedAt: sessionCreatedAt,
        fileName,
        size: backupBlob.size,
        blob: backupBlob,
      });
      await pruneBackupSessions(3);
      return true;
    } catch (backupError) {
      console.error(backupError);
      setError('Snapshot exported, but the autosave backup could not be stored.');
      return false;
    }
  }, [setError]);

  const exportSnapshot = useCallback(async () => {
    let shouldClearError = true;
    try {
      const snapshotBinary = await buildSnapshotBinary();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const suggestedName = `banana-canvas-snapshot-${timestamp}.bcsnap`;
      const desktopSaveSnapshotFile = window.canvaBananaDesktop?.fileMenu?.saveSnapshotFile;

      if (desktopSaveSnapshotFile) {
        const blob = snapshotBinaryToBlob(snapshotBinary);
        const result = await desktopSaveSnapshotFile({
          suggestedName,
          data: await readBlobAsArrayBuffer(blob),
        });
        if (result.canceled === true) {
          return;
        }
        const desktopAutosaveTarget = typeof result.autosaveId === 'string'
          ? { kind: 'desktop' as const, autosaveId: result.autosaveId }
          : null;
        shouldClearError = await rememberExportedSnapshot(result.fileName, snapshotBinary, desktopAutosaveTarget, blob);
      } else {
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
          await writeSnapshotToHandle(saveHandle as FileSystemFileHandle, snapshotBinary);

          const sessionFileName = saveHandle.name ?? suggestedName;
          shouldClearError = await rememberExportedSnapshot(sessionFileName, snapshotBinary, saveHandle as FileSystemFileHandle);
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

          shouldClearError = await rememberExportedSnapshot(suggestedName, snapshotBinary, null);
        }
      }

      if (shouldClearError) {
        setError(null);
      }
      setToastMessage('Snapshot exported');
      setTimeout(() => setToastMessage(null), 2000);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to export snapshot.';
      setError(message);
    } finally {
      setIsFileMenuOpen(false);
    }
  }, [buildSnapshotBinary, rememberExportedSnapshot, setError, setIsFileMenuOpen, setToastMessage, writeSnapshotToHandle]);

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
        videoPromptAreas: restored.videoPromptAreas,
        videoPromptBars: restored.videoPromptBars,
      };

      resetHistory(nextState);

      const meta = restored.meta;
      if (meta) {
        const validAppMode: AppMode =
          meta.appMode === 'CANVAS'
            ? 'CANVAS'
            : (meta.appMode === 'ANNOTATE' || meta.appMode === 'INPAINT')
              ? 'ANNOTATE'
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
          const maxFalNumImages = getFalNumImageMaxForModel(normalizedFalModelId); // Respect model-specific output cap on restore.
          setFalNumImages(Math.min(maxFalNumImages, Math.max(1, Math.floor(meta.falNumImages))));
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
        if (meta.oneToAllAnimateResolution === '480p' || meta.oneToAllAnimateResolution === '580p' || meta.oneToAllAnimateResolution === '720p') {
          setOneToAllAnimateResolution(meta.oneToAllAnimateResolution);
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
        if (typeof meta.heygenEnableCaption === 'boolean') {
          setHeygenEnableCaption(meta.heygenEnableCaption);
        }
        if (typeof meta.heygenEnableDynamicDuration === 'boolean') {
          setHeygenEnableDynamicDuration(meta.heygenEnableDynamicDuration);
        }
        if (typeof meta.heygenDisableMusicTrack === 'boolean') {
          setHeygenDisableMusicTrack(meta.heygenDisableMusicTrack);
        }
        if (typeof meta.heygenEnableSpeechEnhancement === 'boolean') {
          setHeygenEnableSpeechEnhancement(meta.heygenEnableSpeechEnhancement);
        }
        if (isInfinitalkResolutionSelectionValue(meta.infinitalkResolution)) {
          setInfinitalkResolution(meta.infinitalkResolution);
        }
        if (isInfinitalkSeedSelectionValue(meta.infinitalkSeed)) {
          setInfinitalkSeed(meta.infinitalkSeed);
        }
        if (isInfinitalkAccelerationSelectionValue(meta.infinitalkAcceleration)) {
          setInfinitalkAcceleration(meta.infinitalkAcceleration);
        }
        if (isGrokImagineVideoDurationSelectionValue(meta.grokImagineVideoDuration)) {
          setGrokImagineVideoDuration(meta.grokImagineVideoDuration);
        }
        if (isGrokImagineVideoResolutionSelectionValue(meta.grokImagineVideoResolution)) {
          setGrokImagineVideoResolution(meta.grokImagineVideoResolution);
        }
        if (isGrokImagineVideoAspectRatioSelectionValue(meta.grokImagineVideoAspectRatio)) {
          setGrokImagineVideoAspectRatio(meta.grokImagineVideoAspectRatio);
        }
        const normalizedVeoVariant = normalizeVeo31Variant(meta.veo31Variant);
        if (normalizedVeoVariant) {
          setVeo31Variant(normalizedVeoVariant);
        }
        if (isVeo31DurationSelectionValue(meta.veo31Duration)) {
          setVeo31Duration(meta.veo31Duration);
        }
        if (isVeo31ResolutionSelectionValue(meta.veo31Resolution)) {
          setVeo31Resolution(meta.veo31Resolution);
        }
        if (isVeo31AspectRatioSelectionValue(meta.veo31AspectRatio)) {
          setVeo31AspectRatio(meta.veo31AspectRatio);
        }
        if (typeof meta.veo31GenerateAudio === 'boolean') {
          setVeo31GenerateAudio(meta.veo31GenerateAudio);
        }
        if (isWan27VideoResolutionSelectionValue(meta.wan27VideoResolution)) {
          setWan27VideoResolution(meta.wan27VideoResolution);
        }
        if (isWan27VideoDurationSelectionValue(meta.wan27VideoDuration)) {
          setWan27VideoDuration(meta.wan27VideoDuration);
        }
        if (isWan27VideoAspectRatioSelectionValue(meta.wan27VideoAspectRatio)) {
          setWan27VideoAspectRatio(meta.wan27VideoAspectRatio);
        }
        if (typeof meta.wan27VideoPromptExpansion === 'boolean') {
          setWan27VideoPromptExpansion(meta.wan27VideoPromptExpansion);
        }
        setWan27VideoVariant(isWan27VideoVariant(meta.wan27VideoVariant) ? meta.wan27VideoVariant : 'smart');
        if (meta.wan27VideoAudioSetting === 'auto' || meta.wan27VideoAudioSetting === 'origin') {
          setWan27VideoAudioSetting(meta.wan27VideoAudioSetting);
        }
        if (isSeedance2Variant(meta.seedance2Variant)) {
          setSeedance2Variant(meta.seedance2Variant);
        }
        if (isJimengSeedance2ModelVersion(meta.seedance2JimengModelVersion)) {
          handleSeedance2JimengModelVersionChange(meta.seedance2JimengModelVersion);
        }
        if (isSeedance2AspectRatioSelectionValue(meta.seedance2AspectRatio)) {
          setSeedance2AspectRatio(meta.seedance2AspectRatio);
        }
        if (isSeedance2ResolutionSelectionValue(meta.seedance2Resolution)) {
          setSeedance2Resolution(meta.seedance2Resolution);
        }
        if (isSeedance2DurationSelectionValue(meta.seedance2Duration)) {
          setSeedance2Duration(meta.seedance2Duration);
        }
        if (typeof meta.seedance2GenerateAudio === 'boolean') {
          setSeedance2GenerateAudio(meta.seedance2GenerateAudio);
        }
        if (typeof meta.seedance2CameraFixed === 'boolean') {
          setSeedance2CameraFixed(meta.seedance2CameraFixed);
        }
        if (isKlingV3DurationSelectionValue(meta.klingV3Duration)) {
          setKlingV3Duration(meta.klingV3Duration);
        }
        if (typeof meta.klingV3GenerateAudio === 'boolean') {
          setKlingV3GenerateAudio(meta.klingV3GenerateAudio);
        }
        if (isKlingV3CfgScaleSelectionValue(meta.klingV3CfgScale)) {
          setKlingV3CfgScale(meta.klingV3CfgScale);
        }
        if (typeof meta.klingV3MultiPromptEnabled === 'boolean') {
          setKlingV3MultiPromptEnabled(meta.klingV3MultiPromptEnabled);
        }
        if (typeof meta.klingV3MultiPrompt === 'string') {
          setKlingV3MultiPrompt(meta.klingV3MultiPrompt);
        }
        if (isKlingV3ShotDurationSelectionValue(meta.klingV3Shot1Duration)) {
          setKlingV3Shot1Duration(meta.klingV3Shot1Duration);
        }
        if (isKlingV3ShotDurationSelectionValue(meta.klingV3Shot2Duration)) {
          setKlingV3Shot2Duration(meta.klingV3Shot2Duration);
        }
        setSelectedImageIds(Array.isArray(meta.selectedImageIds) ? [...meta.selectedImageIds] : []);
        setSelectedNoteIds(Array.isArray(meta.selectedNoteIds) ? [...meta.selectedNoteIds] : []);
        setReferenceImageIds(Array.isArray(meta.referenceImageIds) ? [...meta.referenceImageIds] : []);
        setReferenceVideoIds(Array.isArray(meta.referenceVideoIds) ? [...meta.referenceVideoIds] : []);
        setReferenceAudioIds(Array.isArray(meta.referenceAudioIds) ? [...meta.referenceAudioIds] : []);
        setSeedanceReferenceOrderIds(Array.isArray(meta.seedanceReferenceOrderIds) ? [...meta.seedanceReferenceOrderIds] : []); // Older snapshots safely fall back to rebuilding the order.
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
        setReferenceVideoIds([]);
        setReferenceAudioIds([]);
        setSeedanceReferenceOrderIds([]);
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
    handleSeedance2JimengModelVersionChange,
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
    setOneToAllAnimateResolution,
    setWanAnimateShift,
    setWanAnimateQuality,
    setWanAnimateUseTurbo,
    setInfinitalkResolution,
    setInfinitalkSeed,
    setInfinitalkAcceleration,
    setGrokImagineVideoDuration,
    setGrokImagineVideoResolution,
    setGrokImagineVideoAspectRatio,
    setVeo31Variant,
    setVeo31Duration,
    setVeo31Resolution,
    setVeo31AspectRatio,
    setVeo31GenerateAudio,
    setSeedance2Variant,
    setSeedance2AspectRatio,
    setSeedance2Resolution,
    setSeedance2Duration,
    setSeedance2GenerateAudio,
    setSeedance2CameraFixed,
    setFalImageModelId,
    setFalImageSizeSelection,
    setFalModelMode,
    setFalNoiseScale,
    setFalNumImages,
    setFalResolutionSelection,
    setFalScaleFactor,
    setFalVideoModelId,
    setPrompt,
    setReferenceAudioIds,
    setReferenceImageIds,
    setReferenceVideoIds,
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
    const desktopOpenSnapshotFile = window.canvaBananaDesktop?.fileMenu?.openSnapshotFile;
    if (desktopOpenSnapshotFile) {
      try {
        const result = await desktopOpenSnapshotFile();
        if (result.canceled === true) {
          return;
        }
        const file = new File([new Uint8Array(result.data)], result.fileName, {
          type: result.fileName.endsWith('.json') ? 'application/json' : 'application/octet-stream',
        });
        await importSnapshotFromFile(file);
      } catch (err) {
        console.error(err);
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Failed to import snapshot.');
        }
      }
      return;
    }

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
    autosaveSnapshot,
  };
}
