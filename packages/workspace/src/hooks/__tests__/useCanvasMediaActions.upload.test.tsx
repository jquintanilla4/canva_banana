import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tool, type CanvasImage } from '../../types';

const loadMediaFromBlob = vi.hoisted(() => vi.fn());
const audioMocks = vi.hoisted(() => ({ loadAudioFromBlob: vi.fn(), generateWaveformImage: vi.fn() }));
vi.mock('../../services/audioService', async () => ({
  ...await vi.importActual<typeof import('../../services/audioService')>('../../services/audioService'),
  ...audioMocks,
}));
vi.mock('../../services/mediaService', async () => ({
  ...await vi.importActual<typeof import('../../services/mediaService')>('../../services/mediaService'),
  loadMediaFromBlob,
}));
import { useCanvasMediaActions } from '../useCanvasMediaActions';

const createArgs = () => ({
  images: [] as CanvasImage[], displayedImages: [] as CanvasImage[],
  hasSingleImageSelected: false, primaryImageId: null, selectedImageIds: [],
  setState: vi.fn(), setSelectedImageIds: vi.fn(), setReferenceImageIds: vi.fn(),
  setTool: vi.fn((_tool: Tool) => {}), setError: vi.fn(), setToastMessage: vi.fn(),
  setLiveImages: vi.fn(), handleCommit: vi.fn(),
});
const videoElement = (url: string) => {
  const video = Object.assign(document.createElement('video'), { __videoObjectUrl: url });
  vi.spyOn(video, 'pause').mockImplementation(() => {});
  return video;
};
const files = (count: number) => Array.from({ length: count }, (_, index) =>
  new File(['video'], `${index}.mp4`, { type: 'video/mp4' })) as unknown as FileList;

beforeEach(() => {
  loadMediaFromBlob.mockReset();
  audioMocks.loadAudioFromBlob.mockReset();
  audioMocks.generateWaveformImage.mockReset();
  vi.stubGlobal('URL', class extends URL { static revokeObjectURL = vi.fn(); });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('useCanvasMediaActions pending uploads', () => {
  it('releases both a prepared batch video and a video that finishes after teardown', async () => {
    let finishVideo: (video: HTMLVideoElement) => void = () => {};
    const first = videoElement('blob:prepared');
    const late = videoElement('blob:late');
    loadMediaFromBlob.mockResolvedValueOnce(first).mockImplementationOnce(() => new Promise(resolve => { finishVideo = resolve; }));
    const args = createArgs();
    const { result, unmount } = renderHook(() => useCanvasMediaActions(args));
    act(() => result.current.handleFilesDrop(files(2), { x: 0, y: 0 }));
    await act(async () => { await Promise.resolve(); });
    expect(args.setState).not.toHaveBeenCalled();
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:prepared');
    await act(async () => { finishVideo(late); });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:late');
    expect(args.setState).not.toHaveBeenCalled();
    expect(args.setSelectedImageIds).not.toHaveBeenCalled();
  });

  it('leaves committed video URL cleanup with canvas history', async () => {
    const video = videoElement('blob:committed');
    loadMediaFromBlob.mockResolvedValueOnce(video);
    const args = createArgs();
    const { result, rerender, unmount } = renderHook(props => useCanvasMediaActions(props), { initialProps: args });
    act(() => result.current.handleFilesDrop(files(1), { x: 0, y: 0 }));
    await waitFor(() => expect(args.setState).toHaveBeenCalledTimes(1));
    const nextState = args.setState.mock.calls[0][0]({ images: [], paths: [] });
    rerender({ ...args, images: nextState.images, displayedImages: nextState.images });
    unmount();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('releases audio immediately when waveform creation fails', async () => {
    const audio = Object.assign(document.createElement('audio'), { __audioObjectUrl: 'blob:failed-waveform' });
    vi.spyOn(audio, 'pause').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    audioMocks.loadAudioFromBlob.mockResolvedValueOnce(audio);
    audioMocks.generateWaveformImage.mockRejectedValueOnce(new Error('Cannot decode audio'));
    const args = createArgs();
    const { result, unmount } = renderHook(() => useCanvasMediaActions(args));
    act(() => result.current.handleFilesDrop([
      new File(['audio'], 'audio.wav', { type: 'audio/wav' }),
    ] as unknown as FileList, { x: 0, y: 0 }));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:failed-waveform'));
    expect(audio.pause).toHaveBeenCalled();
    expect(args.setState.mock.calls[0][0]({ images: [], paths: [] }).images).toEqual([]);
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

});
