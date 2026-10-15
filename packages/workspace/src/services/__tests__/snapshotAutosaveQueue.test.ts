import { describe, expect, it, vi } from 'vitest';
import { enqueueSnapshotAutosave } from '../snapshotAutosaveQueue';
import type { SnapshotMediaBlob, SnapshotRangeSource } from '../snapshotService';

const deferred = () => {
  let resolve: () => void = () => {};
  const promise = new Promise<void>(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
}; // Creates a manually controlled queue entry.

const mediaFromSource = (source: SnapshotRangeSource): SnapshotMediaBlob => ({
  size: 8 * 1024 * 1024 * 1024,
  type: 'application/octet-stream',
  slice: vi.fn(),
  arrayBuffer: vi.fn(),
  stream: vi.fn(),
  text: vi.fn(),
  snapshotLeaseSource: source,
}) as unknown as SnapshotMediaBlob; // Represents large lazy media without allocating its bytes.

describe('enqueueSnapshotAutosave', () => {
  it('keeps later writes behind an older autosave when an intervening lease attempt fails', async () => {
    const previous = deferred();
    const leaseError = new Error('Snapshot read source is no longer available.');
    const source = {
      acquireLease: vi.fn(async () => { throw leaseError; }),
    } as unknown as SnapshotRangeSource;
    const failedWrite = vi.fn(async () => {});
    const laterWrite = vi.fn(async () => {});
    const failedLeaseAttempt = enqueueSnapshotAutosave(previous.promise, [mediaFromSource(source)], failedWrite);
    const handledLeaseAttempt = failedLeaseAttempt.catch(() => {}); // Mirrors the hook's best-effort error reporting.
    const laterAttempt = enqueueSnapshotAutosave(handledLeaseAttempt, [], laterWrite);

    await Promise.resolve();
    await Promise.resolve();

    expect(source.acquireLease).toHaveBeenCalledTimes(1);
    expect(failedWrite).not.toHaveBeenCalled();
    expect(laterWrite).not.toHaveBeenCalled();

    previous.resolve();

    await expect(failedLeaseAttempt).rejects.toBe(leaseError);
    await expect(laterAttempt).resolves.toBeUndefined();
    expect(laterWrite).toHaveBeenCalledTimes(1);
  });

  it('acquires a queued media lease immediately but serializes the write', async () => {
    const previous = deferred();
    const releaseLease = vi.fn(async () => {});
    const source = {
      acquireLease: vi.fn(async () => releaseLease),
    } as unknown as SnapshotRangeSource;
    const writeSnapshot = vi.fn(async () => {});
    const queued = enqueueSnapshotAutosave(previous.promise, [mediaFromSource(source)], writeSnapshot);

    await Promise.resolve();

    expect(source.acquireLease).toHaveBeenCalledTimes(1);
    expect(writeSnapshot).not.toHaveBeenCalled();

    previous.resolve();
    await queued;

    expect(writeSnapshot).toHaveBeenCalledTimes(1);
    expect(releaseLease).toHaveBeenCalledTimes(1);
  });

  it('allows the next write after an older autosave failure has settled', async () => {
    const writeSnapshot = vi.fn(async () => {});
    const queued = enqueueSnapshotAutosave(Promise.reject(new Error('Older autosave failed.')), [], writeSnapshot);

    await expect(queued).resolves.toBeUndefined();
    expect(writeSnapshot).toHaveBeenCalledTimes(1);
  });
});
