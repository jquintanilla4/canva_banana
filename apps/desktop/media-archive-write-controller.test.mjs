import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_MEDIA_ARCHIVE_CHUNK_BYTES,
  createMediaArchiveWriteController,
  sanitizeMediaArchiveFileName,
} from './media-archive-write-controller.mjs';

const tempDirectories = [];

const createTestController = (options = {}) => {
  const activeOwners = new Set(['renderer-1', 'renderer-2']);
  const controller = createMediaArchiveWriteController({
    ...options,
    isOwnerCurrent: owner => activeOwners.has(owner),
    isSameOwner: (left, right) => left === right,
  });
  return { activeOwners, controller };
};

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(tempDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe('media archive write controller', () => {
  it('streams chunks with backpressure and atomically replaces the target on finish', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'media-archive-'));
    tempDirectories.push(directory);
    const targetPath = join(directory, 'canvas-media.zip');
    await writeFile(targetPath, 'old-archive');
    const { controller } = createTestController();
    const session = await controller.begin({ targetPath, owner: 'renderer-1' });

    await expect(controller.write({
      writeId: session.writeId,
      data: new TextEncoder().encode('new-archive'),
      owner: 'renderer-1',
    })).resolves.toEqual({ written: 11 });
    expect(await readFile(targetPath, 'utf8')).toBe('old-archive');

    await expect(controller.finish(session.writeId, 'renderer-1')).resolves.toEqual({ saved: true });
    expect(await readFile(targetPath, 'utf8')).toBe('new-archive');
    expect((await readdir(directory)).filter(name => name.endsWith('.tmp'))).toEqual([]);
  });

  it('supports valid target names near the filesystem component limit', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'media-archive-'));
    tempDirectories.push(directory);
    const fileName = `${'a'.repeat(222)}.zip`;
    const targetPath = join(directory, fileName);
    const { controller } = createTestController();
    const session = await controller.begin({ targetPath, owner: 'renderer-1' });

    await controller.write({
      writeId: session.writeId,
      data: new TextEncoder().encode('archive'),
      owner: 'renderer-1',
    });
    await controller.finish(session.writeId, 'renderer-1');

    expect(await readFile(targetPath, 'utf8')).toBe('archive');
  });

  it('keeps finishing sessions inside the session limit until cleanup completes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'media-archive-'));
    tempDirectories.push(directory);
    const { controller } = createTestController({ maxSessions: 1 });
    const first = await controller.begin({ targetPath: join(directory, 'first.zip'), owner: 'renderer-1' });

    const finishing = controller.finish(first.writeId, 'renderer-1');
    await expect(controller.begin({
      targetPath: join(directory, 'second.zip'),
      owner: 'renderer-1',
    })).rejects.toThrow('Too many media archives');
    await finishing;

    const second = await controller.begin({ targetPath: join(directory, 'second.zip'), owner: 'renderer-1' });
    await controller.abort(second.writeId, 'renderer-1');
  });

  it('rejects invalid chunks and renderer owners without deleting an existing target', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'media-archive-'));
    tempDirectories.push(directory);
    const targetPath = join(directory, 'canvas-media.zip');
    await writeFile(targetPath, 'existing');
    const { controller } = createTestController();
    const session = await controller.begin({ targetPath, owner: 'renderer-1' });

    await expect(controller.write({
      writeId: session.writeId,
      data: new Uint8Array(MAX_MEDIA_ARCHIVE_CHUNK_BYTES + 1),
      owner: 'renderer-1',
    })).rejects.toThrow('too large');
    await expect(controller.write({
      writeId: session.writeId,
      data: new Uint8Array([1]),
      owner: 'renderer-2',
    })).rejects.toThrow('another renderer');

    await controller.abort(session.writeId, 'renderer-1');
    expect(await readFile(targetPath, 'utf8')).toBe('existing');
    expect((await readdir(directory)).filter(name => name.endsWith('.tmp'))).toEqual([]);
  });

  it('cleans partial files when a renderer is invalidated or the app shuts down', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'media-archive-'));
    tempDirectories.push(directory);
    const { controller } = createTestController();
    const first = await controller.begin({ targetPath: join(directory, 'first.zip'), owner: 'renderer-1' });
    const second = await controller.begin({ targetPath: join(directory, 'second.zip'), owner: 'renderer-2' });
    await controller.write({ writeId: first.writeId, data: new Uint8Array([1, 2]), owner: 'renderer-1' });
    await controller.write({ writeId: second.writeId, data: new Uint8Array([3, 4]), owner: 'renderer-2' });

    await controller.abortWhere(owner => owner === 'renderer-1');
    expect(controller.getUsage().sessions).toBe(1);
    await controller.shutdown();

    expect(controller.getUsage()).toEqual({ sessions: 0, operations: 0, shuttingDown: true });
    expect(await readdir(directory)).toEqual([]);
  });

  it('keeps a session available while slow archive preparation is idle', async () => {
    vi.useFakeTimers();
    const directory = await mkdtemp(join(tmpdir(), 'media-archive-'));
    tempDirectories.push(directory);
    const targetPath = join(directory, 'slow-archive.zip');
    const { controller } = createTestController();
    const session = await controller.begin({ targetPath, owner: 'renderer-1' });

    await vi.advanceTimersByTimeAsync(10 * 60 * 1_000);
    await expect(controller.write({
      writeId: session.writeId,
      data: new TextEncoder().encode('new-archive'),
      owner: 'renderer-1',
    })).resolves.toEqual({ written: 11 });

    await expect(controller.finish(session.writeId, 'renderer-1')).resolves.toEqual({ saved: true });
    expect(await readFile(targetPath, 'utf8')).toBe('new-archive');
    expect((await readdir(directory)).filter(name => name.endsWith('.tmp'))).toEqual([]);
  });

  it('accepts only flat ZIP save-dialog suggestions', () => {
    expect(sanitizeMediaArchiveFileName('canvas-media-2026.zip')).toBe('canvas-media-2026.zip');
    expect(sanitizeMediaArchiveFileName('archive')).toBe('archive.zip');
    expect(sanitizeMediaArchiveFileName('../escape.zip')).toBe('canvas-media.zip');
  });
});
