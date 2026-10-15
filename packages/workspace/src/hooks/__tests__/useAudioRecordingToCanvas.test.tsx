import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAudioRecording } from '../useAudioRecording';
import { useAudioRecordingToCanvas } from '../useAudioRecordingToCanvas';
import { convertAudioBlobToWav, generateWaveformImage, loadAudioFromBlob, revokeAudioObjectUrl } from '../../services/audioService';

vi.mock('../useAudioRecording', () => ({ useAudioRecording: vi.fn(() => ({
  isRecording: true, recordingDuration: 1, startRecording: vi.fn(),
  stopRecording: vi.fn().mockResolvedValue(new Blob(['recording'])), error: null,
})) }));
vi.mock('../../services/audioService', () => ({
  convertAudioBlobToWav: vi.fn(), generateWaveformImage: vi.fn(), loadAudioFromBlob: vi.fn(), revokeAudioObjectUrl: vi.fn(),
}));

describe('recording conversion teardown', () => {
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it.each(['conversion', 'audio-load', 'waveform'] as const)('discards a result completed after teardown during $0', async stage => {
    const wav = new Blob(['wav'], { type: 'audio/wav' });
    const audio = document.createElement('audio');
    const pause = vi.spyOn(audio, 'pause').mockImplementation(() => {});
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    vi.mocked(convertAudioBlobToWav).mockImplementation(async () => { if (stage === 'conversion') await pending; return wav; });
    vi.mocked(loadAudioFromBlob).mockImplementation(async () => { if (stage === 'audio-load') await pending; return audio; });
    vi.mocked(generateWaveformImage).mockImplementation(async () => { await pending; return { dataUrl: 'data:image/png;base64,aQ==', duration: 1 }; });
    const setState = vi.fn();
    const setError = vi.fn();
    const { result, unmount } = renderHook(() => useAudioRecordingToCanvas({
      setState, setSelectedImageIds: vi.fn(), setReferenceImageIds: vi.fn(), setTool: vi.fn(), setToastMessage: vi.fn(), setError,
    }));
    const run = result.current.handleRecordToggle();
    const awaitedStep = stage === 'conversion' ? convertAudioBlobToWav : stage === 'audio-load' ? loadAudioFromBlob : generateWaveformImage;
    await vi.waitFor(() => expect(awaitedStep).toHaveBeenCalledOnce());
    unmount();
    await act(async () => { finish(); await run; });
    expect(setState).not.toHaveBeenCalled();
    expect(setError).not.toHaveBeenCalled();
    if (stage !== 'conversion') {
      expect(pause).toHaveBeenCalledOnce();
      expect(revokeAudioObjectUrl).toHaveBeenCalledWith(audio);
    }
  });
  it('preserves the first stopped recording when a second toggle returns no blob', async () => {
    let finishStop!: (blob: Blob) => void;
    const firstStop = new Promise<Blob>(resolve => { finishStop = resolve; });
    vi.mocked(useAudioRecording).mockReturnValueOnce({
      isRecording: true, recordingDuration: 1, startRecording: vi.fn(), error: null,
      stopRecording: vi.fn().mockReturnValueOnce(firstStop).mockResolvedValueOnce(null),
    });
    const audio = document.createElement('audio');
    vi.mocked(convertAudioBlobToWav).mockResolvedValue(new Blob(['wav']));
    vi.mocked(loadAudioFromBlob).mockResolvedValue(audio);
    vi.mocked(generateWaveformImage).mockResolvedValue({ dataUrl: 'data:image/png;base64,aQ==', duration: 1 });
    class LoadedImage {
      onload: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal('Image', LoadedImage);
    const setState = vi.fn();
    const { result, unmount } = renderHook(() => useAudioRecordingToCanvas({
      setState, setSelectedImageIds: vi.fn(), setReferenceImageIds: vi.fn(), setTool: vi.fn(), setToastMessage: vi.fn(), setError: vi.fn(),
    }));
    const firstToggle = result.current.handleRecordToggle();
    await result.current.handleRecordToggle();
    await act(async () => { finishStop(new Blob(['recording'])); await firstToggle; });
    expect(setState).toHaveBeenCalledOnce();
    expect(revokeAudioObjectUrl).not.toHaveBeenCalled();
    unmount();
  });

});
