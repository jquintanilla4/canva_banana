import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { CanvasImage, FalQueueJob, GenerationPlacedPayload } from '../types';
import type { AppState } from './useCanvasHistory';
import { isArkIdentifier, type VolcengineDraft, type VolcengineFinalization, type VolcengineFinalResolution } from '../services/volcengineSettings';
import { getSavedDraftFinalization, hasVolcengineFinalVideo, saveDraftFinalization, wasDraftFinalizationUnavailable, withDraftFinalizationLock, type VolcengineDraftJournalUpdate } from '../services/volcengineDraftJournal';
import { renderVolcengineDraft, VolcengineDraftSubmissionRejected, VolcengineDraftTaskUnavailable, VolcengineRemoteJobFailed } from '../services/volcengineService';
import { getNaturalSize, getVideoFileExtension, isVideoFileType, loadVolcengineVideoFromBlob, revokeVideoObjectUrl } from '../services/mediaService';
import { downloadVolcengineLastFrame, hasVolcengineLastFrame } from '../services/volcengineMedia';
import { getWorkspaceSignal, workspaceFetch } from '../services/workspaceSession';
import { findNonOverlappingPlacement, getImageBounds } from '../utils/canvasGeometry';

type Options = {
  getCanvasDocument: () => { version: number; images: CanvasImage[] };
  setState: Dispatch<SetStateAction<AppState>>;
  updateImagesMetadata: (update: (metadata: CanvasImage['metadata']) => CanvasImage['metadata']) => void;
  setFalJobs: Dispatch<SetStateAction<FalQueueJob[]>>;
  setError: (error: string | null) => void;
  onGenerationPlaced?: (result: GenerationPlacedPayload) => void;
};

const updateDraftTask = (
  metadata: CanvasImage['metadata'],
  draftId: string,
  resolution: VolcengineFinalResolution,
  task: VolcengineFinalization,
): CanvasImage['metadata'] => {
  const generation = metadata?.generation;
  const draft = generation?.volcengineDraft;
  if (!metadata || !draft || draft.requestId !== draftId) return metadata;
  const finalizations = { ...draft.finalizations, [resolution]: task };
  return { ...metadata, generation: { ...generation, volcengineDraft: { ...draft, finalizations } } };
};

const placeBeside = (images: CanvasImage[], item: Omit<CanvasImage, 'x' | 'y'>, anchor: CanvasImage): CanvasImage => {
  const { maxX, minY } = getImageBounds(anchor);
  return { ...item, ...findNonOverlappingPlacement(images, item.width, item.height, maxX + 20, minY) };
};

export const useVolcengineDraftFinalization = ({ getCanvasDocument, setState, updateImagesMetadata, setFalJobs, setError, onGenerationPlaced }: Options) => {
  const running = useRef(new Set<string>());
  const [downloadingLastFrames, setDownloadingLastFrames] = useState<ReadonlySet<string>>(new Set());

  const downloadLastFrame = useCallback(async (
    videoId: string,
    taskId: string,
    version: number,
    getFrameUrl: (signal?: AbortSignal) => string | Promise<string | undefined>,
  ) => {
    const key = `frame:${taskId}`;
    if (running.current.has(key)) return;
    running.current.add(key);
    setDownloadingLastFrames(prev => new Set(prev).add(taskId));
    const signal = getWorkspaceSignal();
    const isOriginatingDocumentOpen = () => !signal?.aborted && getCanvasDocument().version === version;
    setError(null);

    try {
      const url = await getFrameUrl(signal);
      if (!isOriginatingDocumentOpen()) return;
      if (!url) throw new Error('Ark did not return a last frame for this video.');
      const frame = await downloadVolcengineLastFrame(url, signal);
      if (!isOriginatingDocumentOpen()) return;
      setState(prev => {
        const video = prev.images.find(image => image.id === videoId && image.metadata?.volcengineLastFrameTaskId === taskId);
        if (!video || hasVolcengineLastFrame(prev.images, taskId)) return prev;
        return { ...prev, images: [...prev.images, placeBeside(prev.images, {
          ...frame, metadata: { source: 'generated', ...frame.metadata, volcengineLastFrameTaskId: taskId },
        }, video)] };
      });
    } catch (error) {
      if (isOriginatingDocumentOpen()) setError(error instanceof Error ? error.message : 'Could not download the last frame.');
    } finally {
      running.current.delete(key);
      if (!signal?.aborted) setDownloadingLastFrames(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  }, [getCanvasDocument, setError, setState]);

  const retryLastFrame = useCallback(async (videoId: string) => {
    const { version, images } = getCanvasDocument();
    const video = images.find(image => image.id === videoId);
    const taskId = video?.metadata?.volcengineLastFrameTaskId;
    if (video?.mediaType !== 'video' || !taskId || hasVolcengineLastFrame(images, taskId)) return;
    await downloadLastFrame(videoId, taskId, version, async signal => {
      const result = await renderVolcengineDraft({ kind: 'resume', requestId: taskId }, { abortSignal: signal });
      return result.lastFrameUrl;
    });
  }, [downloadLastFrame, getCanvasDocument]);

  const clearUnconfirmedRender = useCallback(async (imageId: string, resolution: VolcengineFinalResolution) => {
    const { version, images } = getCanvasDocument();
    const signal = getWorkspaceSignal();
    const isOriginatingDocumentOpen = () => !signal?.aborted && getCanvasDocument().version === version;
    const source = images.find(image => image.id === imageId);
    const draft = source?.metadata?.generation?.volcengineDraft;
    if (!draft) return;
    const cleared = await withDraftFinalizationLock(draft, resolution, () => {
      if (!isOriginatingDocumentOpen() || getSavedDraftFinalization(draft, resolution)?.kind !== 'submitting') return;
      const rejected = { kind: 'rejected' } satisfies VolcengineFinalization;
      saveDraftFinalization(draft, resolution, rejected);
      updateImagesMetadata(metadata => updateDraftTask(metadata, draft.requestId, resolution, rejected));
      setError(null);
    });
    if (!cleared && isOriginatingDocumentOpen()) setError('Wait for the current request before clearing the pending render.');
  }, [getCanvasDocument, setError, updateImagesMetadata]);

  const renderDraft = useCallback(async (imageId: string, resolution: VolcengineFinalResolution, recoveryId?: string) => {
    const { version, images } = getCanvasDocument();
    const signal = getWorkspaceSignal();
    const isOriginatingDocumentOpen = () => !signal?.aborted && getCanvasDocument().version === version;
    const source = images.find(image => image.id === imageId);
    const generation = source?.metadata?.generation;
    const draft: VolcengineDraft | undefined = generation?.provider === 'volcengine' ? generation.volcengineDraft : undefined;
    if (source?.mediaType !== 'video' || !generation || !draft) return;

    const locked = await withDraftFinalizationLock(draft, resolution, async () => {
      if (!isOriginatingDocumentOpen()) return;
      const existing = getSavedDraftFinalization(draft, resolution);
      const currentImages = getCanvasDocument().images;
      if (!currentImages.some(image => image.id === imageId) || hasVolcengineFinalVideo(currentImages, draft.requestId, resolution)) return;
      if (!existing && Date.now() >= draft.expiresAt) {
        setError('This Seedance Draft has expired. Generate a new Draft to render a final video.');
        return;
      }
      if (existing?.kind === 'submitting' ? !isArkIdentifier(recoveryId) : recoveryId !== undefined) return;
      if (recoveryId && wasDraftFinalizationUnavailable(draft, resolution, recoveryId)) {
        setError('That Ark task is no longer available. Enter the task ID for the pending render.');
        return;
      }
      const jobId = crypto.randomUUID();
      const modelLabel = `Seedance 2.5 (VE) Final · ${resolution === '4k' ? '4K' : resolution}`;
      const arkSettings = generation.volcengineOptions?.seedanceArkSettings;
      const outputFormat = generation.volcengineOptions?.seedance2OutputFormat ?? 'mp4';
      let requestId = existing && existing.kind !== 'submitting' ? existing.requestId : undefined;
      let remoteCompleted = false;
      const saveTask = (task: VolcengineFinalization, update?: VolcengineDraftJournalUpdate) => {
        saveDraftFinalization(draft, resolution, task, update);
        if (isOriginatingDocumentOpen()) updateImagesMetadata(metadata => updateDraftTask(metadata, draft.requestId, resolution, task));
      };
      setError(null);
      setFalJobs(prev => [...prev, {
        id: jobId, prompt: generation.prompt, modelId: generation.modelId ?? '', modelLabel,
        provider: 'volcengine', status: 'IN_QUEUE', createdAt: Date.now(), updatedAt: Date.now(), logs: [],
      }]);

      try {
        const result = await renderVolcengineDraft(recoveryId
          ? { kind: 'resume', requestId: recoveryId, draftTaskId: draft.requestId, resolution }
          : requestId
          ? { kind: 'resume', requestId }
          : { kind: 'finalize', draftTaskId: draft.requestId, resolution, outputFormat,
              returnLastFrame: arkSettings?.returnLastFrame, watermark: arkSettings?.watermark, priority: arkSettings?.priority }, {
          abortSignal: signal,
          onBeforeSubmit: () => {
            if (getSavedDraftFinalization(draft, resolution)) throw new Error('A finalization task already exists. Resume it from the draft.');
            saveTask({ kind: 'submitting' });
          },
          onQueueUpdate: update => {
            if (update.requestId && update.requestId !== requestId) {
              requestId = update.requestId;
              if (!recoveryId) saveTask({ kind: 'submitted', requestId });
            }
            if (signal?.aborted) return;
            setFalJobs(prev => prev.map(job => job.id === jobId ? {
              ...job, ...update, logs: update.logs ?? job.logs, updatedAt: Date.now(),
            } : job));
          },
        });
        remoteCompleted = true;
        requestId ??= result.requestId;
        if (!requestId) throw new Error('Ark did not return a finalization task ID.');
        if (recoveryId) saveTask({ kind: 'submitting', restoredRequestId: requestId });
        else saveTask({ kind: 'completed', requestId }, existing?.kind === 'completed' ? 'restore' : 'submission');
        if (!isOriginatingDocumentOpen()) return;
        const response = await workspaceFetch(result.videoUrl, { signal });
        if (!response.ok) throw new Error(`Final video download failed (HTTP ${response.status}).`);
        const blob = await response.blob();
        if (!isOriginatingDocumentOpen()) return;
        if (blob.type && !isVideoFileType(blob.type)) throw new Error('Ark did not return a video file.');
        const extension = blob.type ? getVideoFileExtension(blob.type) : outputFormat;
        const file = new File([blob], `seedance-final-${resolution}.${extension}`, { type: blob.type || (extension === 'mov' ? 'video/quicktime' : 'video/mp4') });
        const { element } = await loadVolcengineVideoFromBlob(file);
        if (!isOriginatingDocumentOpen() || hasVolcengineFinalVideo(getCanvasDocument().images, draft.requestId, resolution)) {
          revokeVideoObjectUrl(element);
          return;
        }
        const { naturalWidth, naturalHeight } = getNaturalSize(element);
        const final: Omit<CanvasImage, 'x' | 'y'> = {
          id: crypto.randomUUID(), element, mediaType: 'video', file, rotation: 0,
          width: naturalWidth, height: naturalHeight, naturalWidth, naturalHeight,
          hasAudio: generation.volcengineOptions?.seedance2GenerateAudio,
          metadata: {
            source: 'generated', modelLabel, prompt: generation.prompt,
            ...(arkSettings?.returnLastFrame ? { volcengineLastFrameTaskId: requestId } : {}),
            generation: {
              ...generation, url: result.videoUrl, modelLabel, volcengineDraft: undefined,
              volcengineFinalizedFrom: draft.requestId,
              volcengineOptions: {
                ...generation.volcengineOptions, seedance2Resolution: resolution,
                seedanceArkSettings: { ...arkSettings, draft: undefined },
              },
            },
          },
        };
        setState(prev => ({
          ...prev,
          images: [...prev.images, placeBeside(prev.images, final, prev.images.find(image => image.id === source.id) ?? source)],
        }));
        onGenerationPlaced?.({ mediaIds: [final.id], mediaType: 'video', modelLabel });
        const frameUrl = result.lastFrameUrl;
        if (existing?.kind !== 'completed' && isOriginatingDocumentOpen() && arkSettings?.returnLastFrame && frameUrl) {
          await downloadLastFrame(final.id, requestId, version, () => frameUrl);
        }
      } catch (error) {
        const unavailableTaskId = error instanceof VolcengineDraftTaskUnavailable ? requestId : undefined;
        const expiredRecovery = error instanceof VolcengineDraftTaskUnavailable && recoveryId !== undefined && error.confirmedRequestId === recoveryId;
        if (recoveryId && (expiredRecovery || error instanceof VolcengineRemoteJobFailed) && existing?.kind === 'submitting') {
          if (existing.restoredRequestId === recoveryId) saveTask({ kind: 'submitting' });
        } else if ((!requestId && error instanceof VolcengineDraftSubmissionRejected) || unavailableTaskId
          || (existing?.kind !== 'completed' && error instanceof VolcengineRemoteJobFailed)) {
          saveTask({ kind: 'rejected', requestId });
        }
        if (signal?.aborted) return;
        const message = unavailableTaskId && Date.now() < draft.expiresAt
          ? 'Ark no longer has this final video. You can render it again from the draft.'
          : expiredRecovery
            ? 'That Ark task expired. Check Ark for another task before clearing the pending render.'
            : error instanceof Error ? error.message : 'Seedance Draft finalization failed.';
        if (!remoteCompleted) setFalJobs(prev => prev.map(job => job.id === jobId ? {
          ...job, status: 'FAILED', error: message, updatedAt: Date.now(),
        } : job));
        if (isOriginatingDocumentOpen()) setError(message);
      }
    });
    if (!locked && isOriginatingDocumentOpen()) setError('This draft render is already active.');
  }, [downloadLastFrame, getCanvasDocument, onGenerationPlaced, setError, setFalJobs, setState, updateImagesMetadata]);

  return { renderDraft, clearUnconfirmedRender, retryLastFrame, downloadingLastFrames };
};
