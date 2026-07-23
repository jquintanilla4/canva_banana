import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { attachBlobDownloadCompletionNotifier } from './blob-download-lifecycle.mjs';

class FakeDownloadItem extends EventEmitter {
  constructor(url) {
    super();
    this.url = url;
  }

  getURL() {
    return this.url;
  }
}

describe('Blob download lifecycle', () => {
  it('notifies the originating renderer when a Blob download reaches a terminal state', () => {
    const item = new FakeDownloadItem('blob:file:///generated-image');
    const webContents = {
      isDestroyed: vi.fn(() => false),
      send: vi.fn(),
    };

    expect(attachBlobDownloadCompletionNotifier({
      item,
      webContents,
      channel: 'canva-banana:canvas-media-download-finished',
    })).toBe(true);

    item.emit('done', {}, 'completed');

    expect(webContents.send).toHaveBeenCalledWith('canva-banana:canvas-media-download-finished', {
      url: 'blob:file:///generated-image',
      state: 'completed',
    });
  });

  it('ignores non-Blob downloads and closed renderer documents', () => {
    const fileItem = new FakeDownloadItem('canva-banana-snapshot://media/source/image.png');
    const closedBlobItem = new FakeDownloadItem('blob:file:///closed-renderer');
    const webContents = {
      isDestroyed: vi.fn(() => true),
      send: vi.fn(),
    };

    expect(attachBlobDownloadCompletionNotifier({
      item: fileItem,
      webContents,
      channel: 'canva-banana:canvas-media-download-finished',
    })).toBe(false);
    expect(attachBlobDownloadCompletionNotifier({
      item: closedBlobItem,
      webContents,
      channel: 'canva-banana:canvas-media-download-finished',
    })).toBe(true);

    closedBlobItem.emit('done', {}, 'cancelled');

    expect(webContents.send).not.toHaveBeenCalled();
  });
});
