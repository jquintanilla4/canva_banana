import { PassThrough, Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createSnapshotMediaStreamController } from './snapshot-media-stream-controller.mjs';

const createController = (maxActive = 1, maxPending = 2) => createSnapshotMediaStreamController({
  maxActive,
  maxPending,
  closedErrorMessage: 'Snapshot read source is no longer available.',
  busyErrorMessage: 'Too many snapshot media streams are waiting.',
});

const readBody = async body => new Uint8Array(await new Response(body).arrayBuffer());
const waitForStreamCleanup = () => new Promise(resolve => setImmediate(resolve));

describe('snapshot media stream controller', () => {
  it('queues excess streams in FIFO order without applying a byte-size limit', async () => {
    const controller = createController();
    const firstStream = new PassThrough();
    const opened = [];
    const firstBody = await controller.open({
      createStream: () => {
        opened.push('first');
        return firstStream;
      },
    });
    const secondBodyPromise = controller.open({
      createStream: () => {
        opened.push('second');
        return new PassThrough();
      },
    });
    const thirdBodyPromise = controller.open({
      createStream: () => {
        opened.push('third');
        return new PassThrough();
      },
    });

    expect(opened).toEqual(['first']);
    expect(controller.getUsage()).toEqual({ active: 1, pending: 2, closed: false });

    await firstBody.cancel();
    const secondBody = await secondBodyPromise;
    expect(opened).toEqual(['first', 'second']);

    await secondBody.cancel();
    const thirdBody = await thirdBodyPromise;
    expect(opened).toEqual(['first', 'second', 'third']);

    await thirdBody.cancel();
    await waitForStreamCleanup();
    expect(controller.getUsage()).toEqual({ active: 0, pending: 0, closed: false });
  });

  it('removes an aborted request from the wait queue', async () => {
    const controller = createController();
    const firstBody = await controller.open({ createStream: () => new PassThrough() });
    const abortController = new AbortController();
    const createStream = vi.fn(() => new PassThrough());
    const queuedBody = controller.open({ signal: abortController.signal, createStream });

    abortController.abort();

    await expect(queuedBody).rejects.toMatchObject({ name: 'AbortError' });
    expect(createStream).not.toHaveBeenCalled();
    expect(controller.getUsage()).toEqual({ active: 1, pending: 0, closed: false });
    await firstBody.cancel();
  });

  it('rejects excess waiters without limiting the admitted stream length', async () => {
    const controller = createController(1, 1);
    const activeBody = await controller.open({ createStream: () => new PassThrough() });
    const queuedBody = controller.open({ createStream: () => new PassThrough() });

    await expect(controller.open({ createStream: () => new PassThrough() })).rejects.toMatchObject({
      code: 'SNAPSHOT_MEDIA_STREAM_BUSY',
    });
    expect(controller.getUsage()).toEqual({ active: 1, pending: 1, closed: false });

    await activeBody.cancel();
    await (await queuedBody).cancel();
  });

  it('releases active capacity after completion, failure, and cancellation', async () => {
    const controller = createController();
    const completedBody = await controller.open({ createStream: () => Readable.from([Buffer.from('ok')]) });

    await expect(readBody(completedBody)).resolves.toEqual(new Uint8Array(Buffer.from('ok')));
    expect(controller.getUsage().active).toBe(0);

    const failedStream = new PassThrough();
    const failedBody = await controller.open({ createStream: () => failedStream });
    failedStream.destroy(new Error('stream failed'));
    await expect(readBody(failedBody)).rejects.toThrow('stream failed');
    expect(controller.getUsage().active).toBe(0);

    const canceledBody = await controller.open({ createStream: () => new PassThrough() });
    await canceledBody.cancel();
    await waitForStreamCleanup();
    expect(controller.getUsage().active).toBe(0);

    const abortController = new AbortController();
    const abortedBody = await controller.open({
      signal: abortController.signal,
      createStream: () => new PassThrough(),
    });
    abortController.abort();
    await expect(readBody(abortedBody)).rejects.toMatchObject({ name: 'AbortError' });
    expect(controller.getUsage().active).toBe(0);
  });

  it('releases capacity when stream construction fails', async () => {
    const controller = createController();

    await expect(controller.open({
      createStream: () => {
        throw new Error('construction failed');
      },
    })).rejects.toThrow('construction failed');

    expect(controller.getUsage()).toEqual({ active: 0, pending: 0, closed: false });
  });

  it('aborts active streams and rejects queued streams when closed', async () => {
    const controller = createController();
    const activeBody = await controller.open({ createStream: () => new PassThrough() });
    const queuedStream = vi.fn(() => new PassThrough());
    const queuedBody = controller.open({ createStream: queuedStream });

    controller.close();

    await expect(queuedBody).rejects.toThrow('no longer available');
    await expect(readBody(activeBody)).rejects.toThrow('no longer available');
    expect(queuedStream).not.toHaveBeenCalled();
    expect(controller.getUsage()).toEqual({ active: 0, pending: 0, closed: true });
    await expect(controller.open({ createStream: () => new PassThrough() })).rejects.toThrow('no longer available');
  });
});
