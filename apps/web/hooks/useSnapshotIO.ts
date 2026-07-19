import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
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
  assertSnapshotBinaryMediaReadable,
  getSnapshotBinaryByteLength,
  isSnapshotMediaBlob,
  readSnapshotBlobPartAsArrayBuffer,
  snapshotBinaryToBlob,
  writeSnapshotBinaryStreaming,
  isSnapshotMediaReadError,
  SnapshotMediaReadError,
  type SnapshotBinary,
  type SnapshotByteSource,
  type SnapshotMediaBlob,
  type SnapshotMetaState,
  buildSnapshotBinaryFromState,
  restoreSnapshotFromFile,
} from '../services/snapshotService';
import { pruneBackupSessions, saveBackupSessionBinary } from '../services/backupService';
import { createDesktopSnapshotSource } from '../services/desktopSnapshotSource';
import { persistAutosaveSnapshot } from '../services/autosavePersistence';
import { enqueueSnapshotAutosave } from '../services/snapshotAutosaveQueue';
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
  noteLabelCounterRef: MutableRefObject<number>;
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
  activeSnapshotFileName: string | null;
  exportSnapshot: () => Promise<void>;
  importSnapshotFromFile: (file: SnapshotByteSource) => Promise<void>;
  importSnapshotWithPicker: (onFallback: () => void) => Promise<void>;
  autosaveSnapshot: (stateOverride?: AppState) => void;
};

type AutosaveSessionInfo = {
  id: string;
  createdAt: number;
  fileName: string;
  primaryTarget: AutosavePrimaryTarget;
};

type DesktopAutosaveTarget = {
  kind: 'desktop';
  autosaveId: string;
};

type AutosavePrimaryTarget = FileSystemFileHandle | DesktopAutosaveTarget | null;
type SnapshotFallbackWriteResult = {
  snapshotBinary: SnapshotBinary;
  snapshotBlob?: Blob;
  fallbackCount: number;
};

const isDesktopAutosaveTarget = (target: AutosavePrimaryTarget): target is DesktopAutosaveTarget =>
  Boolean(target) && 'kind' in target && target.kind === 'desktop';

const DESKTOP_SNAPSHOT_CHUNK_BYTES = 8 * 1024 * 1024;

const getSnapshotSourceFileName = (file: SnapshotByteSource): string => (
  'fileName' in file ? file.fileName : file.name
); // Browser files and desktop sources both expose the imported basename.

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

const createDesktopSnapshotWritable = (writeId: string): { write: (data: SnapshotMediaBlob | Uint8Array | string, manifest?: SnapshotBinary['images'][number]['manifest']) => Promise<void> } => ({
  write: async (data, manifest) => {
    const writeSnapshotChunk = window.canvaBananaDesktop?.fileMenu?.writeSnapshotChunk;
    if (!writeSnapshotChunk) {
      throw new Error('Desktop snapshot export is unavailable.');
    }
    const writeBytes = async (bytes: Uint8Array) => {
      for (let offset = 0; offset < bytes.byteLength; offset += DESKTOP_SNAPSHOT_CHUNK_BYTES) {
        const chunk = bytes.subarray(offset, offset + DESKTOP_SNAPSHOT_CHUNK_BYTES);
        await writeSnapshotChunk({ writeId, data: chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) }); // Keep non-Blob snapshot chunks bounded.
      }
    };
    if (isSnapshotMediaBlob(data)) {
      for (let offset = 0; offset < data.size; offset += DESKTOP_SNAPSHOT_CHUNK_BYTES) {
        const chunk = data.slice(offset, offset + DESKTOP_SNAPSHOT_CHUNK_BYTES);
        let chunkData: ArrayBuffer;
        try {
          chunkData = await readSnapshotBlobPartAsArrayBuffer(chunk, 0, chunk.size);
        } catch (error) {
          if (manifest) {
            throw new SnapshotMediaReadError(manifest, error);
          }
          throw error;
        }
        await writeSnapshotChunk({ writeId, data: chunkData }); // Keep snapshot IPC chunks bounded.
      }
      return;
    }
    if (typeof data === 'string') {
      await writeBytes(new TextEncoder().encode(data));
      return;
    }
    await writeBytes(data);
  },
});

const finishDesktopSnapshotWrite = async (writeId: string): Promise<void> => {
  const finishSnapshotWrite = window.canvaBananaDesktop?.fileMenu?.finishSnapshotWrite;
  if (!finishSnapshotWrite) {
    throw new Error('Desktop snapshot export is unavailable.');
  }
  await finishSnapshotWrite({ writeId });
};

const abortDesktopSnapshotWrite = async (writeId: string): Promise<void> => {
  await window.canvaBananaDesktop?.fileMenu?.abortSnapshotWrite?.({ writeId });
};

const getSnapshotExportToast = (fallbackCount: number): string =>
  fallbackCount > 0
    ? `Snapshot exported with ${fallbackCount} unavailable media ${fallbackCount === 1 ? 'preview' : 'previews'}`
    : 'Snapshot exported';

export function useSnapshotIO({
  ui,
  fal,
  selection,
  noteLabelCounterRef,
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

  const autosaveSessionRef = useRef<AutosaveSessionInfo | null>(null); // Keep document metadata and its write target together.
  const retainedSnapshotSourceClosersRef = useRef<Array<() => Promise<void>>>([]);
  const latestSnapshotOperationIdRef = useRef(0); // Ignore stale import and export completions.
  const [activeSnapshotFileName, setActiveSnapshotFileName] = useState<string | null>(null);
  const autosaveQueueRef = useRef<Promise<void>>(Promise.resolve()); // Serialize rapid autosave writes.

  useEffect(() => () => {
    const closers = retainedSnapshotSourceClosersRef.current;
    retainedSnapshotSourceClosersRef.current = [];
    void Promise.all(closers.map(close => close().catch(error => console.error(error)))); // Release retained desktop handles after renderer teardown.
  }, []);

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
    referenceImageIds,
    referenceVideoIds,
    referenceAudioIds,
    seedanceReferenceOrderIds,
    elementImageIds,
    videoLastFrameImageId,
    setSelectedImageIds,
    setReferenceImageIds,
    setReferenceVideoIds,
    setReferenceAudioIds,
    setSeedanceReferenceOrderIds,
    setElementImageIds,
    setVideoLastFrameImageId,
  } = selection;
  // Serialize current canvas state plus UI settings into a binary snapshot for export/share.
  const buildSnapshotBinary = useCallback(async (stateOverride?: AppState, fallbackMediaIds?: ReadonlySet<string>): Promise<SnapshotBinary> => {
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
      noteLabelCounter: noteLabelCounterRef.current,
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
    }, { fallbackMediaIds });
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
    seedanceReferenceOrderIds,
    selectedImageIds,
    noteLabelCounterRef,
    tool,
    videoLastFrameImageId,
  ]);

  const writeSnapshotWithMediaFallbacks = useCallback(async (
    snapshotState: AppState,
    writeAttempt: (snapshotBinary: SnapshotBinary, getSnapshotBlob: () => Blob) => Promise<void>,
    afterMediaFallback?: () => Promise<void>,
  ): Promise<SnapshotFallbackWriteResult> => {
    const fallbackMediaIds = new Set<string>();

    while (true) {
      const snapshotBinary = await buildSnapshotBinary(snapshotState, fallbackMediaIds);
      let snapshotBlob: Blob | undefined;
      const getSnapshotBlob = () => {
        snapshotBlob ??= snapshotBinaryToBlob(snapshotBinary);
        return snapshotBlob;
      };
      try {
        await writeAttempt(snapshotBinary, getSnapshotBlob);
        return { snapshotBinary, snapshotBlob, fallbackCount: fallbackMediaIds.size };
      } catch (error) {
        if (!isSnapshotMediaReadError(error) || fallbackMediaIds.has(error.mediaId)) {
          throw error;
        }
        fallbackMediaIds.add(error.mediaId);
        await afterMediaFallback?.();
      }
    }
  }, [buildSnapshotBinary]);

  // Wrap FileSystemFileHandle writes so callers don't repeat the write/close flow.
  const writeSnapshotToHandle = useCallback(async (
    handle: FileSystemFileHandle,
    snapshotBinary: SnapshotBinary,
  ): Promise<void> => {
    const writable = await handle.createWritable();
    try {
      await writeSnapshotBinaryStreaming(snapshotBinary, {
        write: async (data) => {
          if (isSnapshotMediaBlob(data) && !(data instanceof Blob)) {
            for (let offset = 0; offset < data.size; offset += DESKTOP_SNAPSHOT_CHUNK_BYTES) {
              const chunk = data.slice(offset, offset + DESKTOP_SNAPSHOT_CHUNK_BYTES);
              await writable.write(new Uint8Array(await readSnapshotBlobPartAsArrayBuffer(chunk, 0, chunk.size))); // File handles need concrete byte chunks.
            }
            return;
          }
          await writable.write(data as FileSystemWriteChunkType);
        },
      });
    } catch (writeError) {
      try {
        await writable.abort(); // Discard partial bytes so the previous file stays intact.
      } catch (abortError) {
        console.error(abortError); // Keep the original write failure as the user-facing cause.
      }
      throw writeError;
    }
    await writable.close(); // Closing is the commit point after every snapshot byte succeeds.
  }, []);

  const writeSnapshotToPrimaryTarget = useCallback(async (
    target: Exclude<AutosavePrimaryTarget, null>,
    snapshotBinary: SnapshotBinary,
  ): Promise<void> => {
    if (isDesktopAutosaveTarget(target)) {
      const beginAutosaveSnapshot = window.canvaBananaDesktop?.fileMenu?.beginAutosaveSnapshot;
      if (!beginAutosaveSnapshot) {
        throw new Error('Desktop snapshot autosave is unavailable.');
      }
      const session = await beginAutosaveSnapshot({ autosaveId: target.autosaveId });
      try {
        await writeSnapshotBinaryStreaming(snapshotBinary, createDesktopSnapshotWritable(session.writeId));
        await finishDesktopSnapshotWrite(session.writeId);
      } catch (error) {
        await abortDesktopSnapshotWrite(session.writeId);
        throw error;
      }
      return;
    }
    await writeSnapshotToHandle(target, snapshotBinary);
  }, [writeSnapshotToHandle]);

  // Best-effort autosave; no-op unless autosave is enabled and a session is active.
  const autosaveSnapshot = useCallback((stateOverride?: AppState) => {
    if (!autosaveEnabled) {
      return;
    }
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

    const queuedMedia = snapshotState.images.map(image => image.file); // Keep lazy media on disk while this captured state waits its turn.
    autosaveQueueRef.current = enqueueSnapshotAutosave(autosaveQueueRef.current, queuedMedia, async () => {
      const persistence = await persistAutosaveSnapshot({
        writeWithMediaFallbacks: writeAttempt => writeSnapshotWithMediaFallbacks(snapshotState, writeAttempt),
        writePrimary: session.primaryTarget
          ? snapshotBinary => writeSnapshotToPrimaryTarget(session.primaryTarget, snapshotBinary)
          : undefined,
        writeBackup: snapshotBinary => saveBackupSessionBinary({
          id: session.id,
          createdAt: session.createdAt,
          updatedAt: Date.now(),
          fileName: session.fileName,
          size: getSnapshotBinaryByteLength(snapshotBinary),
        }, snapshotBinary),
        pruneBackups: () => pruneBackupSessions(3),
      });
      if (autosaveSessionRef.current?.id !== session.id) return; // Do not publish feedback for a detached document.
      const { fallbackCount } = persistence.writeResult;
      const backupUnavailable = persistence.backup.status === 'failed';
      if (persistence.backup.status === 'failed') {
        console.warn('Primary snapshot autosave succeeded, but its backup could not be stored.', persistence.backup.error); // Backup quota cannot invalidate the user-selected file.
      }
      if (persistence.maintenanceError) {
        console.warn('Snapshot autosave succeeded, but old backups could not be pruned.', persistence.maintenanceError); // Cleanup stays independent from persistence success.
      }
      const maintenanceUnavailable = persistence.maintenanceError !== undefined;
      if (fallbackCount > 0 || backupUnavailable || maintenanceUnavailable) {
        const fallbackMessage = fallbackCount > 0
          ? ` with ${fallbackCount} unavailable media ${fallbackCount === 1 ? 'preview' : 'previews'}`
          : '';
        const backupMessage = backupUnavailable
          ? '; backup unavailable'
          : maintenanceUnavailable
            ? '; backup cleanup unavailable'
            : '';
        setToastMessage(`Autosaved${fallbackMessage}${backupMessage}`);
        setTimeout(() => setToastMessage(null), 2000);
      }
    })
      .catch(err => {
        console.error(err);
        if (autosaveSessionRef.current?.id !== session.id) return;
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
    setToastMessage,
    writeSnapshotWithMediaFallbacks,
    writeSnapshotToPrimaryTarget,
  ]);

  const rememberExportedSnapshot = useCallback(async (
    fileName: string,
    snapshotBinary: SnapshotBinary,
    primaryTarget: AutosavePrimaryTarget,
    operationId: number,
    snapshotBlob?: Blob,
  ): Promise<boolean> => {
    const sessionId = crypto.randomUUID();
    const sessionCreatedAt = Date.now();
    const backupSize = snapshotBlob?.size ?? getSnapshotBinaryByteLength(snapshotBinary);
    if (latestSnapshotOperationIdRef.current === operationId) {
      autosaveSessionRef.current = { id: sessionId, createdAt: sessionCreatedAt, fileName, primaryTarget };
      setActiveSnapshotFileName(fileName); // Adopt the destination only after its write succeeds.
    }

    try {
      // Persist the initial backup so it shows up in the Backups dialog.
      await saveBackupSessionBinary({
        id: sessionId,
        createdAt: sessionCreatedAt,
        updatedAt: sessionCreatedAt,
        fileName,
        size: backupSize,
      }, snapshotBinary);
      await pruneBackupSessions(3);
      return true;
    } catch (backupError) {
      console.error(backupError);
      return false;
    }
  }, []);

  const exportSnapshot = useCallback(async () => {
    const operationId = latestSnapshotOperationIdRef.current + 1;
    latestSnapshotOperationIdRef.current = operationId;
    let shouldClearError = true;
    let fallbackCount = 0;
    try {
      const snapshotState = prepareStateForSnapshot({
        images: displayedImages,
        notes: displayedNotes,
        paths: displayedPaths,
        videoPromptAreas: displayedVideoPromptAreas,
        videoPromptBars: displayedVideoPromptBars,
      });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const suggestedName = `banana-canvas-snapshot-${timestamp}.bcsnap`;
      const desktopBeginSaveSnapshot = window.canvaBananaDesktop?.fileMenu?.beginSaveSnapshot;

      if (desktopBeginSaveSnapshot) {
        const result = await desktopBeginSaveSnapshot({ suggestedName });
        if (result.canceled === true) {
          return;
        }
        const beginAutosaveSnapshot = window.canvaBananaDesktop?.fileMenu?.beginAutosaveSnapshot;
        let writeId = result.writeId;
        const writeResult = await writeSnapshotWithMediaFallbacks(
          snapshotState,
          async (nextSnapshotBinary) => {
            try {
              await writeSnapshotBinaryStreaming(nextSnapshotBinary, createDesktopSnapshotWritable(writeId));
              await finishDesktopSnapshotWrite(writeId);
            } catch (error) {
              await abortDesktopSnapshotWrite(writeId);
              throw error;
            }
          },
          async () => {
            if (typeof result.autosaveId !== 'string' || !beginAutosaveSnapshot) {
              throw new Error('Desktop snapshot retry is unavailable.');
            }
            const retrySession = await beginAutosaveSnapshot({ autosaveId: result.autosaveId });
            writeId = retrySession.writeId;
          },
        );
        fallbackCount = writeResult.fallbackCount;
        const desktopAutosaveTarget = typeof result.autosaveId === 'string'
          ? { kind: 'desktop' as const, autosaveId: result.autosaveId }
          : null;
        shouldClearError = await rememberExportedSnapshot(result.fileName, writeResult.snapshotBinary, desktopAutosaveTarget, operationId, writeResult.snapshotBlob);
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
          const writeResult = await writeSnapshotWithMediaFallbacks(
            snapshotState,
            async (nextSnapshotBinary) => {
              await writeSnapshotToHandle(saveHandle as FileSystemFileHandle, nextSnapshotBinary);
            },
          );
          fallbackCount = writeResult.fallbackCount;

          const sessionFileName = saveHandle.name ?? suggestedName;
          shouldClearError = await rememberExportedSnapshot(sessionFileName, writeResult.snapshotBinary, saveHandle as FileSystemFileHandle, operationId, writeResult.snapshotBlob);
        } else {
          const writeResult = await writeSnapshotWithMediaFallbacks(
            snapshotState,
            async (nextSnapshotBinary, getSnapshotBlob) => {
              await assertSnapshotBinaryMediaReadable(nextSnapshotBinary);
              const nextSnapshotBlob = getSnapshotBlob();
              const url = URL.createObjectURL(nextSnapshotBlob);
              const link = document.createElement('a');
              link.href = url;
              link.download = suggestedName;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
            },
          );
          fallbackCount = writeResult.fallbackCount;

          shouldClearError = await rememberExportedSnapshot(suggestedName, writeResult.snapshotBinary, null, operationId, writeResult.snapshotBlob);
        }
      }

      if (latestSnapshotOperationIdRef.current === operationId) {
        setError(shouldClearError ? null : 'Snapshot exported, but the autosave backup could not be stored.');
        setToastMessage(getSnapshotExportToast(fallbackCount));
        setTimeout(() => setToastMessage(null), 2000);
      }
    } catch (err) {
      console.error(err);
      if (latestSnapshotOperationIdRef.current === operationId) {
        const message = err instanceof Error ? err.message : 'Failed to export snapshot.';
        setError(message);
      }
    } finally {
      setIsFileMenuOpen(false);
    }
  }, [
    displayedImages,
    displayedNotes,
    displayedPaths,
    displayedVideoPromptAreas,
    displayedVideoPromptBars,
    rememberExportedSnapshot,
    setError,
    setIsFileMenuOpen,
    setToastMessage,
    writeSnapshotToHandle,
    writeSnapshotWithMediaFallbacks,
  ]);

  const retainSnapshotSourceForImport = useCallback(async (file: SnapshotByteSource): Promise<(() => Promise<void>) | null> => {
    if (!('retain' in file) || typeof file.retain !== 'function' || typeof file.close !== 'function') {
      return null;
    }
    await file.retain(); // Retain before restore so large lazy media cannot expire during import.
    return file.close.bind(file);
  }, []);

  // Restore a snapshot file into state, validating each option before applying it.
  const importSnapshotFromFile = useCallback(async (file: SnapshotByteSource) => {
    const operationId = latestSnapshotOperationIdRef.current + 1;
    latestSnapshotOperationIdRef.current = operationId;
    let retainedSourceCloser: (() => Promise<void>) | null = null;
    let sourceActivated = false;
    try {
      retainedSourceCloser = await retainSnapshotSourceForImport(file);
      const restored = await restoreSnapshotFromFile(file, {
        brushSize,
        eraserSize,
        brushColor,
      });
      if (latestSnapshotOperationIdRef.current !== operationId) {
        if (retainedSourceCloser) await retainedSourceCloser().catch(error => console.error(error));
        retainedSourceCloser = null;
        return;
      }

      const nextState: AppState = {
        images: restored.images,
        paths: restored.paths,
        notes: restored.notes,
        videoPromptAreas: restored.videoPromptAreas,
        videoPromptBars: restored.videoPromptBars,
      };

      resetHistory(nextState);

      const meta = restored.meta;
      const maxRestoredNoteLabel = restored.notes.reduce((max, note) => Math.max(max, note.label ?? 0), 0);
      const restoredNoteLabelCounter = typeof meta?.noteLabelCounter === 'number' && Number.isFinite(meta.noteLabelCounter)
        ? Math.floor(meta.noteLabelCounter)
        : 1;
      noteLabelCounterRef.current = Math.max(restoredNoteLabelCounter, maxRestoredNoteLabel + 1, 1);
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
        setReferenceImageIds([]);
        setReferenceVideoIds([]);
        setReferenceAudioIds([]);
        setSeedanceReferenceOrderIds([]);
        setElementImageIds([]);
        setVideoLastFrameImageId(null);
      }

      if (restored.sourceRetention === 'not-required' && retainedSourceCloser) {
        void retainedSourceCloser().catch(error => console.error(error)); // Legacy JSON media is fully materialized after restore.
        retainedSourceCloser = null;
      }
      const previousClosers = retainedSnapshotSourceClosersRef.current;
      retainedSnapshotSourceClosersRef.current = retainedSourceCloser ? [retainedSourceCloser] : [];
      autosaveSessionRef.current = null; // Imported documents must not inherit the previous file destination.
      setActiveSnapshotFileName(getSnapshotSourceFileName(file));
      sourceActivated = true;
      setError(null);
      setToastMessage(restored.droppedLegacyNoteCount > 0
        ? `Snapshot imported — ${restored.droppedLegacyNoteCount} canvas ${restored.droppedLegacyNoteCount === 1 ? 'note' : 'notes'} from an older version could not be kept`
        : 'Snapshot imported');
      setTimeout(() => setToastMessage(null), restored.droppedLegacyNoteCount > 0 ? 5000 : 2000);
      void Promise.all(previousClosers.map(close => close().catch(error => console.error(error)))); // Cleanup cannot delay document activation.
    } catch (err) {
      console.error(err);
      if (latestSnapshotOperationIdRef.current === operationId) {
        setError(err instanceof Error ? err.message : 'Failed to import snapshot.');
      }
      if (!sourceActivated && 'close' in file && typeof file.close === 'function') {
        await file.close().catch(error => console.error(error)); // Failed imports should not keep desktop handles open.
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
    retainSnapshotSourceForImport,
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
    noteLabelCounterRef,
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
        const source = createDesktopSnapshotSource(result);
        await importSnapshotFromFile(source);
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
    activeSnapshotFileName,
    exportSnapshot,
    importSnapshotFromFile,
    importSnapshotWithPicker,
    autosaveSnapshot,
  };
}
