import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasImage, FalQueueJob } from '../../types';
import { renderVolcengineDraft, VolcengineDraftSubmissionRejected, VolcengineDraftTaskUnavailable } from '../../services/volcengineService';
import { saveDraftFinalization } from '../../services/volcengineDraftJournal';
import { beginWorkspaceSession } from '../../services/workspaceSession';
import { isOverlapping } from '../../utils/canvasGeometry';
import { useCanvasHistory } from '../useCanvasHistory';
import { useVolcengineDraftFinalization } from '../useVolcengineDraftFinalization';

vi.mock('../../services/volcengineService', async importOriginal => ({
  ...await importOriginal<typeof import('../../services/volcengineService')>(),
  renderVolcengineDraft: vi.fn(),
}));

vi.mock('../../services/mediaService', async importOriginal => ({
  ...await importOriginal<typeof import('../../services/mediaService')>(),
  loadMediaFromBlob: async () => {
    const element = document.createElement('img');
    element.width = 320;
    element.height = 180;
    return element;
  },
  loadVolcengineVideoFromBlob: async () => {
    const element = document.createElement('video');
    element.width = 640;
    element.height = 360;
    return { element, canPlay: true };
  },
}));

const draftVideo = (id: string): CanvasImage => ({
  id, element: document.createElement('video'), file: new File(['draft'], 'draft.mp4', { type: 'video/mp4' }),
  mediaType: 'video', x: 20, y: 20, width: 320, height: 180, naturalWidth: 320, naturalHeight: 180, rotation: 0,
  metadata: { source: 'generated', generation: {
    kind: 'video', provider: 'volcengine', prompt: 'a landscape',
    volcengineDraft: { requestId: 'draft-task', expiresAt: Date.now() + 86400000 },
  } },
});

const renderDraft = (images: CanvasImage[]) => renderHook(() => {
  const history = useCanvasHistory({ images, paths: [], notes: [], videoPromptAreas: [], videoPromptBars: [] });
  const [, setFalJobs] = useState<FalQueueJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { renderDraft: finalize, clearUnconfirmedRender, retryLastFrame, downloadingLastFrames } = useVolcengineDraftFinalization({ ...history, setFalJobs, setError });
  return { ...history, finalize, clearUnconfirmedRender, retryLastFrame, downloadingLastFrames, error };
});

const render = vi.mocked(renderVolcengineDraft);
const completed = { videoUrl: 'https://example.com/final.mp4', requestId: 'final-task' };

describe('Seedance Draft finalization', () => {
  beforeEach(() => {
    localStorage.clear();
    render.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('restores a paid task after a failed download and after undo', async () => {
    const { result } = renderDraft([draftVideo('original'), draftVideo('duplicate')]);
    render.mockImplementationOnce(async (_, options) => {
      options.onQueueUpdate?.({ status: 'COMPLETED', requestId: completed.requestId });
      return completed;
    }).mockResolvedValue(completed);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockImplementation(async () => new Response('final', { headers: { 'Content-Type': 'video/mp4' } })));

    await act(async () => result.current.finalize('original', '4k'));

    for (const image of result.current.images) {
      expect(image.metadata?.generation?.volcengineDraft?.finalizations?.['4k']).toEqual({ kind: 'completed', requestId: 'final-task' });
    }
    expect(result.current.canUndo).toBe(false);
    await act(async () => result.current.finalize('duplicate', '4k'));

    expect(render.mock.calls.map(([command]) => command)).toEqual([
      expect.objectContaining({ kind: 'finalize', draftTaskId: 'draft-task', resolution: '4k' }),
      { kind: 'resume', requestId: 'final-task' },
    ]);
    expect(result.current.images).toHaveLength(3);
    act(() => result.current.undo());
    expect(result.current.images).toHaveLength(2);
    expect(result.current.images[0].metadata?.generation?.volcengineDraft?.finalizations?.['4k']).toEqual({ kind: 'completed', requestId: 'final-task' });
    act(() => result.current.setState(prev => ({ ...prev, images: [...prev.images, draftVideo('new-edit')] })));
    expect(result.current.canRedo).toBe(false);
    await act(async () => result.current.finalize('original', '4k'));
    expect(render).toHaveBeenCalledTimes(3);
    expect(render.mock.calls[2]?.[0]).toEqual({ kind: 'resume', requestId: 'final-task' });
    expect(result.current.images).toHaveLength(4);
    await act(async () => result.current.finalize('duplicate', '4k'));
    expect(render).toHaveBeenCalledTimes(3);
  });

  it.each([
    [new VolcengineDraftSubmissionRejected('Rate limited'), 2],
    [new Error('Connection lost before receiving an ID'), 1],
  ])('only allows resubmission after a confirmed rejection (%s)', async (error, submits) => {
    const { result } = renderDraft([draftVideo('original')]);
    render.mockImplementation(async (_, options) => {
      options.onBeforeSubmit?.();
      throw error;
    });
    await act(async () => result.current.finalize('original', '4k'));
    await act(async () => result.current.finalize('original', '4k'));
    expect(render).toHaveBeenCalledTimes(submits);
  });

  it('recovers an unconfirmed submission with the matching Ark task ID', async () => {
    const { result } = renderDraft([draftVideo('original')]);
    render.mockImplementationOnce(async (_, options) => {
      options.onBeforeSubmit?.();
      throw new Error('Connection lost after submitting');
    }).mockResolvedValueOnce(completed);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('final', { headers: { 'Content-Type': 'video/mp4' } })));

    await act(async () => result.current.finalize('original', '4k'));
    await act(async () => result.current.finalize('original', '4k'));
    expect(render).toHaveBeenCalledOnce();
    await act(async () => result.current.finalize('original', '4k', 'final-task'));
    expect(render.mock.calls[1]?.[0]).toEqual({
      kind: 'resume', requestId: 'final-task', draftTaskId: 'draft-task', resolution: '4k',
    });
    expect(result.current.images).toHaveLength(2);
  });

  it('lets the user render again after Ark confirms a saved final is unavailable', async () => {
    const source = draftVideo('original');
    const draft = source.metadata?.generation?.volcengineDraft;
    if (!draft) throw new Error('Expected draft fixture');
    draft.finalizations = { '4k': { kind: 'completed', requestId: 'expired-final' } };
    const { result } = renderDraft([source]);
    render.mockRejectedValueOnce(new VolcengineDraftTaskUnavailable('Task no longer available')).mockResolvedValueOnce(completed);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('final', { headers: { 'Content-Type': 'video/mp4' } })));

    await act(async () => result.current.finalize(source.id, '4k'));
    expect(render.mock.calls[0]?.[0]).toEqual({ kind: 'resume', requestId: 'expired-final' });
    expect(result.current.error).toContain('You can render it again');
    expect(render).toHaveBeenCalledOnce();
    act(() => result.current.resetHistory({ images: [source], paths: [], notes: [], videoPromptAreas: [], videoPromptBars: [] }));

    await act(async () => result.current.finalize(source.id, '4k'));
    expect(render.mock.calls[1]?.[0]).toMatchObject({ kind: 'finalize', draftTaskId: 'draft-task', resolution: '4k' });
    expect(result.current.images).toHaveLength(2);
  });

  it('restores a completed snapshot task despite an unconfirmed local submission', async () => {
    const source = draftVideo('original');
    const draft = source.metadata?.generation?.volcengineDraft;
    if (!draft) throw new Error('Expected draft fixture');
    draft.finalizations = { '4k': { kind: 'completed', requestId: 'final-task' } };
    saveDraftFinalization(draft, '4k', { kind: 'submitting' });
    const { result } = renderDraft([source]);
    render.mockResolvedValueOnce(completed);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('final', { headers: { 'Content-Type': 'video/mp4' } })));

    await act(async () => result.current.finalize(source.id, '4k'));
    expect(render.mock.calls[0]?.[0]).toEqual({ kind: 'resume', requestId: 'final-task' });
    expect(result.current.images).toHaveLength(2);
  });

  it('remembers a completed snapshot task when an earlier snapshot is reopened', async () => {
    const earlier = draftVideo('original');
    const saved = draftVideo('original');
    const draft = saved.metadata?.generation?.volcengineDraft;
    if (!draft) throw new Error('Expected draft fixture');
    draft.finalizations = { '4k': { kind: 'completed', requestId: 'final-task' } };
    const { result } = renderDraft([saved]);
    render.mockResolvedValue(completed);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('final', { headers: { 'Content-Type': 'video/mp4' } })));

    await act(async () => result.current.finalize(saved.id, '4k'));
    act(() => result.current.resetHistory({ images: [earlier], paths: [], notes: [], videoPromptAreas: [], videoPromptBars: [] }));
    await act(async () => result.current.finalize(earlier.id, '4k'));

    expect(render.mock.calls.map(([command]) => command)).toEqual([
      { kind: 'resume', requestId: 'final-task' }, { kind: 'resume', requestId: 'final-task' },
    ]);
  });

  it('keeps the pending render after an expired lookup until the user clears it', async () => {
    const source = draftVideo('original');
    const draft = source.metadata?.generation?.volcengineDraft;
    if (!draft) throw new Error('Expected draft fixture');
    saveDraftFinalization(draft, '4k', { kind: 'rejected', requestId: 'older-expired-final' });
    const { result } = renderDraft([source]);
    render.mockImplementationOnce(async (_, options) => {
      options.onBeforeSubmit?.();
      throw new Error('Connection lost');
    }).mockRejectedValueOnce(new VolcengineDraftTaskUnavailable('Task not found'))
      .mockRejectedValueOnce(new VolcengineDraftTaskUnavailable('Task expired', 'expired-final'))
      .mockResolvedValueOnce(completed);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('final', { headers: { 'Content-Type': 'video/mp4' } })));

    await act(async () => result.current.finalize(source.id, '4k'));
    await act(async () => result.current.finalize(source.id, '4k', 'older-expired-final'));
    expect(render).toHaveBeenCalledOnce();
    await act(async () => result.current.finalize(source.id, '4k', 'unknown-id'));
    await act(async () => result.current.finalize(source.id, '4k'));
    expect(render).toHaveBeenCalledTimes(2);

    await act(async () => result.current.finalize(source.id, '4k', 'expired-final'));
    expect(result.current.error).toContain('Check Ark for another task');
    await act(async () => result.current.finalize(source.id, '4k'));
    expect(render).toHaveBeenCalledTimes(3);

    await act(async () => result.current.clearUnconfirmedRender(source.id, '4k'));
    expect(render).toHaveBeenCalledTimes(3);
    await act(async () => result.current.finalize(source.id, '4k'));
    expect(render.mock.calls[3]?.[0]).toMatchObject({ kind: 'finalize', draftTaskId: 'draft-task', resolution: '4k' });
    expect(result.current.images).toHaveLength(2);
  });

  it('restores a manually entered task without replacing the pending submission', async () => {
    const source = draftVideo('original');
    const { result } = renderDraft([source]);
    render.mockImplementationOnce(async (_, options) => {
      options.onBeforeSubmit?.();
      throw new Error('Connection lost');
    }).mockImplementationOnce(async (_, options) => {
      options.onQueueUpdate?.({ status: 'COMPLETED', requestId: 'older-final' });
      return { ...completed, requestId: 'older-final' };
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('final', { headers: { 'Content-Type': 'video/mp4' } })));

    await act(async () => result.current.finalize(source.id, '4k'));
    await act(async () => result.current.finalize(source.id, '4k', 'older-final'));
    expect(result.current.images).toHaveLength(2);
    const [restoredDraft] = result.current.images;
    expect(restoredDraft.metadata?.generation?.volcengineDraft?.finalizations?.['4k'])
      .toEqual({ kind: 'submitting', restoredRequestId: 'older-final' });

    act(() => result.current.resetHistory({ images: [source], paths: [], notes: [], videoPromptAreas: [], videoPromptBars: [] }));
    await act(async () => result.current.finalize(source.id, '4k'));
    expect(render).toHaveBeenCalledTimes(2);

    localStorage.clear();
    act(() => result.current.resetHistory({ images: [restoredDraft], paths: [], notes: [], videoPromptAreas: [], videoPromptBars: [] }));
    await act(async () => result.current.finalize(source.id, '4k'));
    expect(render).toHaveBeenCalledTimes(2);

    render.mockRejectedValueOnce(new VolcengineDraftTaskUnavailable('Task expired', 'older-final'));
    await act(async () => result.current.finalize(source.id, '4k', 'older-final'));
    expect(result.current.images[0].metadata?.generation?.volcengineDraft?.finalizations?.['4k'])
      .toEqual({ kind: 'submitting' });
    await act(async () => result.current.finalize(source.id, '4k'));
    expect(render).toHaveBeenCalledTimes(3);
  });

  it('blocks a second workspace from clearing a render during submission', async () => {
    const first = renderDraft([draftVideo('first')]);
    const second = renderDraft([draftVideo('second')]);
    let finishSubmission!: () => void;
    const submission = new Promise<void>(resolve => { finishSubmission = resolve; });
    render.mockImplementationOnce(async (_, options) => {
      options.onBeforeSubmit?.();
      await submission;
      throw new Error('Connection lost');
    });
    let pending!: Promise<void>;
    await act(async () => { pending = first.result.current.finalize('first', '4k'); });
    await act(async () => second.result.current.clearUnconfirmedRender('second', '4k'));
    expect(second.result.current.error).toContain('Wait for the current request');
    await act(async () => second.result.current.finalize('second', '4k'));
    expect(render).toHaveBeenCalledOnce();
    await act(async () => {
      finishSubmission();
      await pending;
    });
  });

  it.each(['replaced', 'closed'] as const)('does not start a render after its workspace is %s while waiting for the lock', async closeMode => {
    const closeWorkspace = beginWorkspaceSession();
    const { result } = renderDraft([draftVideo('original')]);
    let acquireLock!: () => void;
    const available = new Promise<void>(resolve => { acquireLock = resolve; });
    const locks = {
      request: async (name: string, _: LockOptions, run: (lock: { name: string }) => Promise<boolean>) => {
        await available;
        return run({ name });
      },
    };
    vi.stubGlobal('navigator', Object.create(navigator, { locks: { value: locks } }));

    try {
      let pending!: Promise<void>;
      await act(async () => { pending = result.current.finalize('original', '4k'); });
      if (closeMode === 'closed') closeWorkspace();
      else act(() => result.current.resetHistory({ images: [], paths: [], notes: [], videoPromptAreas: [], videoPromptBars: [] }));
      await act(async () => {
        acquireLock();
        await pending;
      });
      expect(render).not.toHaveBeenCalled();
    } finally {
      closeWorkspace();
    }
  });

  it('leaves a render recoverable without inserting it into a different snapshot', async () => {
    const source = draftVideo('original');
    const { result } = renderDraft([source]);
    let finishDownload!: (response: Response) => void;
    const response = new Promise<Response>(resolve => { finishDownload = resolve; });
    const fetchMock = vi.fn().mockReturnValueOnce(response)
      .mockImplementation(async () => new Response('final', { headers: { 'Content-Type': 'video/mp4' } }));
    vi.stubGlobal('fetch', fetchMock);
    render.mockImplementationOnce(async (_, options) => {
      options.onQueueUpdate?.({ status: 'COMPLETED', requestId: completed.requestId });
      return completed;
    }).mockResolvedValueOnce(completed);

    let pending!: Promise<void>;
    await act(async () => { pending = result.current.finalize('original', '1080p'); });
    expect(fetchMock).toHaveBeenCalledOnce();
    act(() => result.current.resetHistory({ images: [draftVideo('other-document')], paths: [], notes: [], videoPromptAreas: [], videoPromptBars: [] }));
    await act(async () => {
      finishDownload(new Response('final', { headers: { 'Content-Type': 'video/mp4' } }));
      await pending;
    });
    expect(result.current.images.map(image => image.id)).toEqual(['other-document']);
    expect(result.current.images[0].metadata?.generation?.volcengineDraft?.finalizations).toBeUndefined();

    act(() => result.current.resetHistory({ images: [source], paths: [], notes: [], videoPromptAreas: [], videoPromptBars: [] }));
    await act(async () => result.current.finalize('original', '1080p'));
    expect(render.mock.calls[1]?.[0]).toEqual({ kind: 'resume', requestId: 'final-task' });
    expect(result.current.images).toHaveLength(2);
  });

  it('allows retry from a snapshot captured before a confirmed rejection', async () => {
    const source = draftVideo('original');
    const { result } = renderDraft([source]);
    let rejectSubmission!: (error: Error) => void;
    render.mockImplementationOnce(async (_, options) => {
      options.onBeforeSubmit?.();
      return new Promise((_, reject) => { rejectSubmission = reject; });
    }).mockRejectedValue(new VolcengineDraftSubmissionRejected('Rate limited'));

    let pending!: Promise<void>;
    await act(async () => { pending = result.current.finalize(source.id, '1080p'); });
    const saved = result.current.images;
    expect(saved[0].metadata?.generation?.volcengineDraft?.finalizations?.['1080p']).toEqual({ kind: 'submitting' });
    act(() => result.current.resetHistory({ images: [], paths: [], notes: [], videoPromptAreas: [], videoPromptBars: [] }));
    await act(async () => {
      rejectSubmission(new VolcengineDraftSubmissionRejected('Rate limited'));
      await pending;
    });
    act(() => result.current.resetHistory({ images: saved, paths: [], notes: [], videoPromptAreas: [], videoPromptBars: [] }));
    await act(async () => result.current.finalize(source.id, '1080p'));
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('places concurrent 1080p and 4K finals without overlapping the current canvas', async () => {
    const { result } = renderDraft([draftVideo('original')]);
    render.mockImplementation(async (command, options) => {
      const requestId = command.kind === 'finalize' ? `final-${command.resolution}` : command.requestId;
      options.onQueueUpdate?.({ status: 'COMPLETED', requestId });
      return { ...completed, requestId };
    });
    let finishDownload!: (response: Response) => void;
    const downloads = new Promise<Response>(resolve => { finishDownload = resolve; });
    const fetchMock = vi.fn().mockImplementation(async () => (await downloads).clone());
    vi.stubGlobal('fetch', fetchMock);

    let pending!: Promise<void[]>;
    await act(async () => {
      pending = Promise.all([result.current.finalize('original', '1080p'), result.current.finalize('original', '4k')]);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const blocker = { ...draftVideo('blocker'), x: 360 };
    act(() => result.current.setState(prev => ({ ...prev, images: [...prev.images, blocker] })));
    await act(async () => {
      finishDownload(new Response('final', { headers: { 'Content-Type': 'video/mp4' } }));
      await pending;
    });

    const [, , first, second] = result.current.images;
    expect(new Set([first.metadata?.generation?.volcengineOptions?.seedance2Resolution,
      second.metadata?.generation?.volcengineOptions?.seedance2Resolution])).toEqual(new Set(['1080p', '4k']));
    expect(isOverlapping(first, second)).toBe(false);
    expect(isOverlapping(first, blocker)).toBe(false);
    expect(isOverlapping(second, blocker)).toBe(false);
  });

  it('retries only the last frame of a paid video after a download failure', async () => {
    const source = draftVideo('original');
    source.metadata!.generation!.volcengineOptions = { seedanceArkSettings: { returnLastFrame: true } };
    const { result } = renderDraft([source]);
    render.mockImplementationOnce(async (_, options) => {
      options.onQueueUpdate?.({ status: 'COMPLETED', requestId: completed.requestId });
      return { ...completed, lastFrameUrl: 'https://example.com/old.jpg' };
    }).mockResolvedValueOnce({ ...completed, lastFrameUrl: 'https://example.com/fresh.jpg' });
    let finishFrame!: (response: Response) => void;
    const retry = new Promise<Response>(resolve => { finishFrame = resolve; });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('final', { headers: { 'Content-Type': 'video/mp4' } }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockReturnValueOnce(retry);
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => result.current.finalize('original', '4k'));
    const final = result.current.images[1];
    expect(final.metadata?.volcengineLastFrameTaskId).toBe('final-task');
    expect(result.current.images).toHaveLength(2);
    expect(result.current.error).toMatch(/503/);

    let pending!: Promise<void>;
    await act(async () => {
      pending = result.current.retryLastFrame(final.id);
      await result.current.retryLastFrame(final.id);
    });
    expect(result.current.downloadingLastFrames.has('final-task')).toBe(true);
    expect(render).toHaveBeenCalledTimes(2);
    expect(render.mock.calls[1]?.[0]).toEqual({ kind: 'resume', requestId: 'final-task' });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      completed.videoUrl, 'https://example.com/old.jpg', 'https://example.com/fresh.jpg',
    ]);

    await act(async () => {
      finishFrame(new Response('frame', { headers: { 'Content-Type': 'image/jpeg' } }));
      await pending;
    });
    expect(result.current.images[1]).toBe(final);
    expect(result.current.images[2]).toMatchObject({ mediaType: 'image', metadata: { volcengineLastFrameTaskId: 'final-task' } });
    expect(isOverlapping(final, result.current.images[2])).toBe(false);
    expect(result.current.downloadingLastFrames.size).toBe(0);
    await act(async () => result.current.retryLastFrame(final.id));
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('resumes from the local task record after reopening an earlier snapshot', async () => {
    const first = renderDraft([draftVideo('original')]);
    render.mockImplementationOnce(async (_, options) => {
      options.onQueueUpdate?.({ status: 'IN_PROGRESS', requestId: 'final-task' });
      throw new Error('Connection lost');
    });
    await act(async () => first.result.current.finalize('original', '1080p'));
    first.unmount();

    const reopened = renderDraft([draftVideo('original')]);
    render.mockResolvedValueOnce(completed);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('final', { headers: { 'Content-Type': 'video/mp4' } })));
    await act(async () => reopened.result.current.finalize('original', '1080p'));
    expect(render.mock.calls[1]?.[0]).toEqual({ kind: 'resume', requestId: 'final-task' });
    expect(reopened.result.current.images).toHaveLength(2);
  });
});
