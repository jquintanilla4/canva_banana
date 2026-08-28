import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createBuildVariantMetadata,
  parseBuildVariantMetadata,
  readBuildVariantMetadata,
  writeBuildVariantMetadata,
} from './build-variant.mjs';

const nowMs = Date.parse('2026-08-27T12:00:00Z');

describe('desktop build variant metadata', () => {
  it('creates regular metadata without trial timestamps', () => {
    expect(createBuildVariantMetadata({ variant: 'regular', nowMs })).toEqual({
      schemaVersion: 1,
      variant: 'regular',
    });
  });

  it('normalizes a future trial expiration to UTC', () => {
    expect(createBuildVariantMetadata({
      variant: 'trial',
      expiresAt: '2026-09-30T23:59:59-07:00',
      nowMs,
    })).toEqual({
      schemaVersion: 1,
      variant: 'trial',
      expiresAt: '2026-10-01T06:59:59.000Z',
      builtAt: '2026-08-27T12:00:00.000Z',
    });
  });

  it.each([
    undefined,
    '2026-09-30',
    '2026-09-30T23:59:59',
    '2026-02-30T12:00:00Z',
    'not-a-date',
  ])('rejects an invalid or timezone-free expiration: %s', expiresAt => {
    expect(() => createBuildVariantMetadata({ variant: 'trial', expiresAt, nowMs })).toThrow(/ISO-8601|valid timestamp/);
  });

  it('rejects an expiration at or before build time', () => {
    expect(() => createBuildVariantMetadata({
      variant: 'trial',
      expiresAt: '2026-08-27T12:00:00Z',
      nowMs,
    })).toThrow(/later than/);
  });

  it('rejects regular metadata carrying stale trial timestamps', () => {
    expect(() => parseBuildVariantMetadata({
      schemaVersion: 1,
      variant: 'regular',
      expiresAt: '2026-10-01T00:00:00Z',
    })).toThrow(/must not contain/);
  });

  it('rejects impossible dates in packaged metadata', () => {
    expect(() => parseBuildVariantMetadata({
      schemaVersion: 1,
      variant: 'trial',
      expiresAt: '2026-02-30T12:00:00Z',
      builtAt: '2026-02-01T12:00:00Z',
    })).toThrow(/valid timestamp/);
  });

  it('overwrites stale trial metadata with a regular build', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'canva-banana-build-'));
    const metadataPath = join(directory, 'build-variant.json');
    await writeBuildVariantMetadata(metadataPath, createBuildVariantMetadata({
      variant: 'trial',
      expiresAt: '2026-09-30T23:59:59-07:00',
      nowMs,
    }));
    await writeBuildVariantMetadata(metadataPath, createBuildVariantMetadata({ variant: 'regular', nowMs }));
    await expect(readBuildVariantMetadata(metadataPath)).resolves.toEqual({ schemaVersion: 1, variant: 'regular' });
  });
});
