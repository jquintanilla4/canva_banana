import { afterEach, describe, expect, it, vi } from 'vitest';
import { fal } from '@fal-ai/client';
import { beginWorkspaceSession } from '../workspaceSession';
import { clearDebugLogs, getDebugLogs } from '../debugLog';
import { generateImage } from '../fal/imageGenerate';
import { uploadVideoToFal } from '../fal/media';

vi.mock('@fal-ai/client', () => ({
  fal: { config: vi.fn(), subscribe: vi.fn(), storage: { upload: vi.fn() } },
}));

describe('Fal workspace session cleanup', () => {
  afterEach(() => { clearDebugLogs(); vi.clearAllMocks(); });

  it.each(['resolve', 'reject'] as const)('ignores late queue events and %s diagnostics from a closed workspace', async outcome => {
    const closeFirst = beginWorkspaceSession();
    let closeSecond: (() => void) | undefined;
    let settle!: (value: unknown) => void;
    vi.mocked(fal.subscribe).mockImplementationOnce(() => new Promise((resolve, reject) => {
      settle = outcome === 'resolve' ? resolve : reject;
    }));
    const onQueueUpdate = vi.fn();
    try {
      const run = generateImage('private previous-project prompt', { onQueueUpdate });
      const rejection = expect(run).rejects.toMatchObject({ name: 'AbortError' });
      const queueCallback = vi.mocked(fal.subscribe).mock.calls[0]?.[1].onQueueUpdate;
      expect(queueCallback).toBeTypeOf('function');
      closeFirst();
      clearDebugLogs();
      closeSecond = beginWorkspaceSession();
      queueCallback?.({ status: 'IN_PROGRESS', request_id: 'old-request', logs: [], response_url: '', status_url: '', cancel_url: '' });
      settle(outcome === 'resolve'
        ? { data: { images: [{ url: 'https://private.fal.media/previous-project.png' }] }, requestId: 'old-request' }
        : new Error('private previous-project failure'));
      await rejection;
      expect(onQueueUpdate).not.toHaveBeenCalled();
      expect(getDebugLogs()).toEqual([]);
    } finally { closeFirst(); closeSecond?.(); }
  });

  it('does not publish an upload failure after the source workspace closes', async () => {
    const close = beginWorkspaceSession();
    let fail!: (reason: Error) => void;
    vi.mocked(fal.storage.upload).mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    try {
      const upload = uploadVideoToFal(new File(['video'], 'private-video.mp4', { type: 'video/mp4' }));
      const rejection = expect(upload).rejects.toMatchObject({ name: 'AbortError' });
      close();
      clearDebugLogs();
      fail(new Error('late upload failure'));
      await rejection;
      expect(getDebugLogs()).toEqual([]);
    } finally { close(); }
  });
});
