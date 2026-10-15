import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasImage } from '../../types';
import type { AppState } from '../useCanvasHistory';

const mediaMocks = vi.hoisted(() => ({
  loadAudioFromBlob: vi.fn(),
  loadAudioFromUrl: vi.fn(),
  loadMediaFromBlob: vi.fn(),
  loadMediaFromUrl: vi.fn(),
  ensureRealSnapshotFile: vi.fn(),
}));

vi.mock('../../services/audioService', async () => ({
  ...await vi.importActual<typeof import('../../services/audioService')>('../../services/audioService'),
  loadAudioFromBlob: mediaMocks.loadAudioFromBlob,
  loadAudioFromUrl: mediaMocks.loadAudioFromUrl,
}));

vi.mock('../../services/mediaService', async () => ({
  ...await vi.importActual<typeof import('../../services/mediaService')>('../../services/mediaService'),
  loadMediaFromBlob: mediaMocks.loadMediaFromBlob,
  loadMediaFromUrl: mediaMocks.loadMediaFromUrl,
}));

vi.mock('../../services/snapshotService', async () => ({
  ...await vi.importActual<typeof import('../../services/snapshotService')>('../../services/snapshotService'),
  ensureRealSnapshotFile: mediaMocks.ensureRealSnapshotFile,
}));

import { useDuplicateCanvasMedia } from '../useDuplicateCanvasMedia';

type SnapshotBackedFile = File & { snapshotObjectUrl: string };

const buildFile = (mediaType: CanvasImage['mediaType'], snapshotObjectUrl?: string): File => {
  const mimeType = mediaType === 'video' ? 'video/mp4' : mediaType === 'audio' ? 'audio/wav' : 'image/png';
  if (!snapshotObjectUrl) {
    return new File(['current-session'], `source-${mediaType}`, { type: mimeType });
  }
  return {
    name: `restored-${mediaType}`,
    type: mimeType,
    size: 16,
    lastModified: 1,
    snapshotObjectUrl,
  } as SnapshotBackedFile; // Desktop restores expose File metadata over a lazy range source.
};

const buildMedia = (mediaType: CanvasImage['mediaType'], file: File): CanvasImage => ({
  id: `source-${mediaType}`,
  element: document.createElement(mediaType === 'video' ? 'video' : 'img'),
  mediaType,
  x: 10,
  y: 20,
  width: 320,
  height: 180,
  rotation: 0,
  naturalWidth: 320,
  naturalHeight: 180,
  file,
  isPlaying: true,
  ...(mediaType === 'audio' ? { audioElement: document.createElement('audio'), currentPlaybackTime: 4 } : {}),
});

const buildState = (image: CanvasImage): AppState => ({
  images: [image],
  notes: [],
  paths: [],
  videoPromptAreas: [],
  videoPromptBars: [],
});

const renderDuplicateHook = (sourceImage: CanvasImage) => {
  const setSelectedImageIds = vi.fn();
  const setReferenceImageIds = vi.fn();
  const setVideoLastFrameImageId = vi.fn();
  const hook = renderHook(() => {
    const [state, setState] = useState(() => buildState(sourceImage));
    const duplicate = useDuplicateCanvasMedia({
      displayedImages: state.images,
      setState,
      setSelectedImageIds,
      setReferenceImageIds,
      setVideoLastFrameImageId,
    });
    return { state, ...duplicate };
  });
  return { ...hook, setSelectedImageIds };
};

describe('useDuplicateCanvasMedia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mediaMocks.ensureRealSnapshotFile.mockImplementation(async file => file);
    vi.stubGlobal('URL', class extends URL { static revokeObjectURL = vi.fn(); });
  });

  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it.each(['image', 'video'] as const)('duplicates a restored snapshot %s through its retained media URL', async mediaType => {
    const snapshotObjectUrl = `canva-banana-snapshot://source/${mediaType}`;
    const sourceImage = buildMedia(mediaType, buildFile(mediaType, snapshotObjectUrl));
    const duplicatedElement = document.createElement(mediaType === 'video' ? 'video' : 'img');
    if (duplicatedElement instanceof HTMLVideoElement) {
      vi.spyOn(duplicatedElement, 'pause').mockImplementation(() => {});
    }
    mediaMocks.loadMediaFromUrl.mockResolvedValueOnce(duplicatedElement);
    const { result, setSelectedImageIds } = renderDuplicateHook(sourceImage);

    act(() => result.current.duplicateImage(sourceImage.id));

    await waitFor(() => expect(result.current.state.images).toHaveLength(2));
    const duplicate = result.current.state.images[1];
    expect(mediaMocks.loadMediaFromUrl).toHaveBeenCalledWith(snapshotObjectUrl, mediaType);
    expect(mediaMocks.loadMediaFromBlob).not.toHaveBeenCalled();
    expect(duplicate.file).toBe(sourceImage.file);
    expect(duplicate.element).toBe(duplicatedElement);
    expect(duplicate.isPlaying).toBe(false);
    expect(duplicate.y).toBe(sourceImage.y + sourceImage.height + 20);
    expect(setSelectedImageIds).toHaveBeenLastCalledWith([duplicate.id]);
  });

  it('duplicates restored snapshot audio through its retained media URL', async () => {
    const snapshotObjectUrl = 'canva-banana-snapshot://source/audio';
    const sourceImage = buildMedia('audio', buildFile('audio', snapshotObjectUrl));
    const duplicatedAudio = document.createElement('audio');
    mediaMocks.loadAudioFromUrl.mockResolvedValueOnce(duplicatedAudio);
    const { result } = renderDuplicateHook(sourceImage);

    act(() => result.current.duplicateImage(sourceImage.id));

    await waitFor(() => expect(result.current.state.images).toHaveLength(2));
    const duplicate = result.current.state.images[1];
    expect(mediaMocks.loadAudioFromUrl).toHaveBeenCalledWith(snapshotObjectUrl);
    expect(mediaMocks.loadAudioFromBlob).not.toHaveBeenCalled();
    expect(duplicate.file).toBe(sourceImage.file);
    expect(duplicate.audioElement).toBe(duplicatedAudio);
    expect(duplicate.currentPlaybackTime).toBe(0);
    expect(duplicate.isPlaying).toBe(false);
  });

  it('keeps duplicating current-session media from its real File', async () => {
    const sourceImage = buildMedia('image', buildFile('image'));
    const duplicatedElement = document.createElement('img');
    mediaMocks.loadMediaFromBlob.mockResolvedValueOnce(duplicatedElement);
    const { result } = renderDuplicateHook(sourceImage);

    act(() => result.current.duplicateImage(sourceImage.id));

    await waitFor(() => expect(result.current.state.images).toHaveLength(2));
    expect(mediaMocks.loadMediaFromBlob).toHaveBeenCalledWith(sourceImage.file, 'image');
    expect(mediaMocks.loadMediaFromUrl).not.toHaveBeenCalled();
    expect(result.current.state.images[1].file).toBe(sourceImage.file);
  });

  it('does not start another media load when snapshot materialization completes after unmount', async () => {
    let finishFile: (file: File) => void = () => {};
    mediaMocks.ensureRealSnapshotFile.mockImplementationOnce(() => new Promise(resolve => { finishFile = resolve; }));
    const source = buildMedia('video', buildFile('video'));
    const { result, unmount, setSelectedImageIds } = renderDuplicateHook(source);
    act(() => result.current.duplicateImage(source.id));
    unmount();
    await act(async () => { finishFile(source.file); });
    expect(mediaMocks.loadMediaFromBlob).not.toHaveBeenCalled();
    expect(setSelectedImageIds).not.toHaveBeenCalled();
  });

  it.each([false, true])('cleans a late video duplicate without revoking a shared snapshot URL (%s)', async snapshotBacked => {
    let finishVideo: (video: HTMLVideoElement) => void = () => {};
    const snapshotUrl = snapshotBacked ? 'blob:shared-snapshot' : undefined;
    const source = buildMedia('video', buildFile('video', snapshotUrl));
    const loader = snapshotBacked ? mediaMocks.loadMediaFromUrl : mediaMocks.loadMediaFromBlob;
    loader.mockImplementationOnce(() => new Promise(resolve => { finishVideo = resolve; }));
    const video = Object.assign(document.createElement('video'), { __videoObjectUrl: snapshotUrl ?? 'blob:duplicate-owned' });
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => {});
    const { result, unmount, setSelectedImageIds } = renderDuplicateHook(source);
    act(() => result.current.duplicateImage(source.id));
    await waitFor(() => expect(loader).toHaveBeenCalled());
    unmount();
    await act(async () => { finishVideo(video); });
    expect(pause).toHaveBeenCalled();
    expect(setSelectedImageIds).not.toHaveBeenCalled();
    if (snapshotBacked) expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    else expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:duplicate-owned');
  });

});
