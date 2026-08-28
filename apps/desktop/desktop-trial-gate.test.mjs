import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { writeBuildVariantMetadata } from './build-variant.mjs';
import { createDesktopTrialGate } from './desktop-trial-gate.mjs';

const createHarness = async ({ metadata, nowMs }) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'canva-banana-gate-'));
  const desktopDir = join(rootDir, 'desktop');
  const userDataDir = join(rootDir, 'user-data');
  await writeBuildVariantMetadata(join(desktopDir, 'generated/build-variant.json'), metadata);
  const showMessageBox = vi.fn(async () => ({ response: 0 }));
  const hideApp = vi.fn();
  const quit = vi.fn();
  const onError = vi.fn();
  const gate = createDesktopTrialGate({
    isPackaged: true,
    desktopDir,
    getUserDataPath: () => userDataDir,
    showMessageBox,
    hideApp,
    quit,
    now: () => nowMs,
    onError,
  });
  return { gate, rootDir, userDataDir, showMessageBox, hideApp, quit, onError };
};

describe('desktop trial gate', () => {
  it('lets a regular build start without reading trial state or showing a dialog', async () => {
    const harness = await createHarness({
      metadata: { schemaVersion: 1, variant: 'regular' },
      nowMs: Date.parse('2026-09-01T12:00:00Z'),
    });
    await mkdir(harness.userDataDir, { recursive: true });
    await writeFile(join(harness.userDataDir, 'trial-state.json'), '{broken', 'utf8');

    await expect(harness.gate.initialize()).resolves.toBe(true);
    await expect(harness.gate.check()).resolves.toBe(true);
    expect(harness.showMessageBox).not.toHaveBeenCalled();
    expect(harness.hideApp).not.toHaveBeenCalled();
  });

  it('records an active trial and shows the launch notice', async () => {
    const nowMs = Date.parse('2026-09-01T12:00:00Z');
    const harness = await createHarness({
      metadata: {
        schemaVersion: 1,
        variant: 'trial',
        builtAt: '2026-08-27T12:00:00.000Z',
        expiresAt: '2026-09-03T12:00:00.000Z',
      },
      nowMs,
    });

    await expect(harness.gate.initialize()).resolves.toBe(true);
    expect(harness.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
      buttons: ['Continue'],
      message: 'This is a time-limited trial.',
      detail: expect.stringContaining('2 days remaining'),
    }));
    expect(harness.hideApp).not.toHaveBeenCalled();
    harness.gate.stop();
    await harness.gate.flush();
  });

  it('blocks an expired trial before startup', async () => {
    const harness = await createHarness({
      metadata: {
        schemaVersion: 1,
        variant: 'trial',
        builtAt: '2026-08-27T12:00:00.000Z',
        expiresAt: '2026-09-01T12:00:00.000Z',
      },
      nowMs: Date.parse('2026-09-01T12:00:00Z'),
    });

    await expect(harness.gate.initialize()).resolves.toBe(false);
    expect(harness.hideApp).toHaveBeenCalledTimes(1);
    expect(harness.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
      buttons: ['Quit'],
      message: 'This trial has expired.',
    }));
    expect(harness.quit).toHaveBeenCalledTimes(1);
  });

  it('still quits and stays denied when the blocking dialog fails', async () => {
    const harness = await createHarness({
      metadata: {
        schemaVersion: 1,
        variant: 'trial',
        builtAt: '2026-08-27T12:00:00.000Z',
        expiresAt: '2026-09-01T12:00:00.000Z',
      },
      nowMs: Date.parse('2026-09-01T12:00:00Z'),
    });
    const dialogError = new Error('Dialog unavailable');
    harness.showMessageBox.mockRejectedValue(dialogError);

    await expect(harness.gate.initialize()).resolves.toBe(false);
    await expect(harness.gate.check()).resolves.toBe(false);
    expect(harness.onError).toHaveBeenCalledWith('Trial blocking dialog could not be shown.', dialogError);
    expect(harness.hideApp).toHaveBeenCalledTimes(1);
    expect(harness.quit).toHaveBeenCalledTimes(1);
  });

  it('still shows the blocking dialog and quits when hiding the app fails', async () => {
    const harness = await createHarness({
      metadata: {
        schemaVersion: 1,
        variant: 'trial',
        builtAt: '2026-08-27T12:00:00.000Z',
        expiresAt: '2026-09-01T12:00:00.000Z',
      },
      nowMs: Date.parse('2026-09-01T12:00:00Z'),
    });
    const hideError = new Error('Window unavailable');
    harness.hideApp.mockImplementation(() => { throw hideError; });

    await expect(harness.gate.initialize()).resolves.toBe(false);
    await expect(harness.gate.check()).resolves.toBe(false);
    expect(harness.onError).toHaveBeenCalledWith('Trial app could not be hidden.', hideError);
    expect(harness.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ buttons: ['Quit'] }));
    expect(harness.quit).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the active launch notice cannot be shown', async () => {
    const nowMs = Date.parse('2026-09-01T12:00:00Z');
    const harness = await createHarness({
      metadata: {
        schemaVersion: 1,
        variant: 'trial',
        builtAt: '2026-08-27T12:00:00.000Z',
        expiresAt: '2026-09-03T12:00:00.000Z',
      },
      nowMs,
    });
    const dialogError = new Error('Dialog unavailable');
    harness.showMessageBox.mockRejectedValue(dialogError);

    await expect(harness.gate.initialize()).resolves.toBe(false);
    await expect(harness.gate.check()).resolves.toBe(false);
    expect(harness.showMessageBox).toHaveBeenCalledTimes(2);
    expect(harness.onError).toHaveBeenCalledWith('Trial launch notice could not be shown.', dialogError);
    expect(harness.onError).toHaveBeenCalledWith('Trial blocking dialog could not be shown.', dialogError);
    expect(harness.hideApp).toHaveBeenCalledTimes(1);
    expect(harness.quit).toHaveBeenCalledTimes(1);
  });

  it('fails closed when saved clock state is malformed', async () => {
    const harness = await createHarness({
      metadata: {
        schemaVersion: 1,
        variant: 'trial',
        builtAt: '2026-08-27T12:00:00.000Z',
        expiresAt: '2026-09-03T12:00:00.000Z',
      },
      nowMs: Date.parse('2026-09-01T12:00:00Z'),
    });
    await mkdir(harness.userDataDir, { recursive: true });
    await writeFile(join(harness.userDataDir, 'trial-state.json'), '{broken', 'utf8');

    await expect(harness.gate.initialize()).resolves.toBe(false);
    expect(harness.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
      message: 'This trial cannot verify the current date.',
    }));
    expect(harness.onError).toHaveBeenCalledWith('Trial clock state could not be verified.', expect.any(Error));
    expect(harness.quit).toHaveBeenCalledTimes(1);
  });
});
