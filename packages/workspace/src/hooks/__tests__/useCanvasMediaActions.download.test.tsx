import { useState } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasImage } from '../../types';
import { Tool } from '../../types';

const downloadMocks = vi.hoisted(() => ({
  downloadSelection: vi.fn(),
}));

vi.mock('../../services/canvasMediaDownloadService', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/canvasMediaDownloadService')>();
  return { ...original, downloadCanvasMediaSelection: downloadMocks.downloadSelection };
});

import { useCanvasMediaActions } from '../useCanvasMediaActions';

const buildImage = (id: string, fileName: string): CanvasImage => ({
  id,
  element: document.createElement('img'),
  mediaType: 'image',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  rotation: 0,
  naturalWidth: 10,
  naturalHeight: 10,
  file: new File([id], fileName, { type: 'image/png' }),
});

const createArgs = (images: CanvasImage[], selectedImageIds: string[]) => ({
  images,
  displayedImages: images,
  hasSingleImageSelected: selectedImageIds.length === 1,
  primaryImageId: selectedImageIds[0] ?? null,
  selectedImageIds,
  setState: vi.fn(),
  setSelectedImageIds: vi.fn(),
  setReferenceImageIds: vi.fn(),
  setTool: vi.fn((_tool: Tool) => {}),
  setError: vi.fn(),
  setToastMessage: vi.fn(),
  setLiveImages: vi.fn(),
  handleCommit: vi.fn(),
});

describe('useCanvasMediaActions downloads', () => {
  beforeEach(() => {
    downloadMocks.downloadSelection.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('preserves selection order, reports skipped files, and blocks a repeat click', async () => {
    const first = buildImage('first', 'first.png');
    const second = buildImage('second', 'second.png');
    const args = createArgs([first, second], ['second', 'first']);
    let finishDownload: ((value: { downloadedCount: number; skipped: Array<{ id: string; fileName: string; message: string }> }) => void) | undefined;
    downloadMocks.downloadSelection.mockImplementation((selected: CanvasImage[], onProgress: (value: unknown) => void) => {
      onProgress({ phase: 'archiving', completedItems: 1, totalItems: 2 });
      return new Promise(resolve => { finishDownload = resolve; });
    });
    const { result } = renderHook(() => useCanvasMediaActions(args));

    act(() => {
      result.current.handleDownload();
      result.current.handleDownload();
    });

    expect(downloadMocks.downloadSelection).toHaveBeenCalledOnce();
    expect(downloadMocks.downloadSelection.mock.calls[0][0].map((image: CanvasImage) => image.id)).toEqual(['second', 'first']);
    expect(result.current.downloadProgress).toEqual({ phase: 'archiving', completedItems: 1, totalItems: 2 });

    await act(async () => {
      finishDownload?.({
        downloadedCount: 1,
        skipped: [{ id: 'first', fileName: 'first.png', message: 'unreadable' }],
      });
    });

    await waitFor(() => expect(result.current.downloadProgress).toBeNull());
    expect(args.setToastMessage).toHaveBeenCalledWith('Downloaded 1 selected item; skipped 1: first.png');
  });

  it('reports a direct single-item download as started', async () => {
    const image = buildImage('first', 'first.png');
    const args = createArgs([image], ['first']);
    downloadMocks.downloadSelection.mockResolvedValue({ downloadedCount: 1, skipped: [] });
    const { result } = renderHook(() => useCanvasMediaActions(args));

    act(() => {
      result.current.handleDownload();
    });

    await waitFor(() => expect(args.setToastMessage).toHaveBeenCalledWith('Download started'));
  });

  it('does not let an earlier download expiry clear newer toast feedback', async () => {
    vi.useFakeTimers();
    const image = buildImage('first', 'first.png');
    const args = createArgs([image], ['first']);
    downloadMocks.downloadSelection.mockResolvedValue({ downloadedCount: 1, skipped: [] });
    const { result } = renderHook(() => {
      const [toastMessage, setToastMessage] = useState<string | null>(null);
      return {
        actions: useCanvasMediaActions({ ...args, setToastMessage }),
        setToastMessage,
        toastMessage,
      };
    });

    await act(async () => {
      result.current.actions.handleDownload();
      await Promise.resolve();
    });
    expect(result.current.toastMessage).toBe('Download started');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    await act(async () => {
      result.current.actions.handleDownload();
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.toastMessage).toBe('Download started');

    act(() => {
      result.current.setToastMessage('Newer toast');
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.toastMessage).toBe('Newer toast');
  });
});
