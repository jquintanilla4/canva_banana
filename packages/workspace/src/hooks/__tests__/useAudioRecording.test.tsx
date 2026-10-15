import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAudioRecording } from '../useAudioRecording';

class TestRecorder {
  static instances: TestRecorder[] = [];
  constructor() { TestRecorder.instances.push(this); }
  static isTypeSupported = () => true;
  state = 'inactive';
  mimeType = 'audio/webm';
  onstop: (() => void) | null = null;
  start = vi.fn(() => { this.state = 'recording'; });
  stop = vi.fn(() => { this.state = 'inactive'; });
}

const createStream = () => {
  const stop = vi.fn();
  return { stream: { getTracks: () => [{ stop }] } as unknown as MediaStream, stop };
};

describe('audio recording session cleanup', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('stops a microphone granted after unmount without starting a recorder or timer', async () => {
    vi.useFakeTimers();
    let grant!: (stream: MediaStream) => void;
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(() => new Promise<MediaStream>(resolve => { grant = resolve; })) } });
    const recorder = vi.fn(TestRecorder);
    vi.stubGlobal('MediaRecorder', Object.assign(recorder, { isTypeSupported: TestRecorder.isTypeSupported }));
    const { stream, stop } = createStream();
    const { result, unmount } = renderHook(() => useAudioRecording(), { wrapper: StrictMode });
    const recording = result.current.startRecording();
    unmount();
    await act(async () => { grant(stream); await recording; });
    expect(stop).toHaveBeenCalledOnce();
    expect(recorder).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases the microphone when MediaRecorder setup fails', async () => {
    const { stream, stop } = createStream();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
    const failure = new Error('Unsupported recorder');
    class FailingRecorder extends TestRecorder { constructor() { super(); throw failure; } }
    vi.stubGlobal('MediaRecorder', FailingRecorder);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useAudioRecording());
    await act(async () => { await result.current.startRecording(); });
    expect(stop).toHaveBeenCalledOnce();
    expect(result.current.error).toBe(failure.message);
    unmount();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('records after a StrictMode effect replay and stops tracks and timer on teardown', async () => {
    vi.useFakeTimers();
    const { stream, stop } = createStream();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
    vi.stubGlobal('MediaRecorder', TestRecorder);
    const { result, unmount } = renderHook(() => useAudioRecording(), { wrapper: StrictMode });
    await act(async () => { await result.current.startRecording(); });
    expect(result.current.isRecording).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(stop).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps the first stop result when Stop is pressed again before the recorder stop event', async () => {
    const { stream } = createStream();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
    vi.stubGlobal('MediaRecorder', TestRecorder);
    const { result, unmount } = renderHook(() => useAudioRecording());
    await act(async () => { await result.current.startRecording(); });
    const recorder = TestRecorder.instances.at(-1)!;
    const firstStop = result.current.stopRecording();
    await act(async () => { expect(await result.current.stopRecording()).toBeNull(); });
    await act(async () => { recorder.onstop?.(); expect(await firstStop).toBeInstanceOf(Blob); });
    unmount();
  });

});
