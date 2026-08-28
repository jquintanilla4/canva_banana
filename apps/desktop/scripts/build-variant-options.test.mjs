import { describe, expect, it } from 'vitest';
import {
  assertTrialBuildTargetPlatform,
  getBuildVariantArgs,
  parseBuildVariantArgs,
} from './build-variant-options.mjs';

const nowMs = Date.parse('2026-08-27T12:00:00Z');

describe('desktop build variant arguments', () => {
  it('defaults to a regular build and preserves Forge arguments', () => {
    const result = parseBuildVariantArgs(['--arch', 'arm64'], { nowMs });
    expect(result.metadata).toEqual({ schemaVersion: 1, variant: 'regular' });
    expect(result.passthroughArgs).toEqual(['--arch', 'arm64']);
  });

  it('requires an expiration for trial builds', () => {
    expect(() => parseBuildVariantArgs(['--trial'], { nowMs })).toThrow(/ISO-8601/);
  });

  it('removes trial options before forwarding Forge arguments', () => {
    const result = parseBuildVariantArgs([
      '--trial',
      '--expires-at=2026-10-01T06:59:59Z',
      '--arch',
      'arm64',
    ], { nowMs });
    expect(result.metadata.variant).toBe('trial');
    expect(result.passthroughArgs).toEqual(['--arch', 'arm64']);
    expect(getBuildVariantArgs(result.metadata)).toEqual([
      '--trial',
      '--expires-at=2026-10-01T06:59:59.000Z',
    ]);
  });

  it('rejects an expiration on a regular build', () => {
    expect(() => parseBuildVariantArgs(['--expires-at=2026-10-01T06:59:59Z'], { nowMs })).toThrow(/trial build/);
  });

  it.each([
    { args: ['--expires-at'] },
    { args: ['--expires-at', '--arch', 'arm64'] },
    { args: ['--expires-at='] },
  ])('rejects a missing expiration value: $args', ({ args }) => {
    expect(() => parseBuildVariantArgs(args, { nowMs })).toThrow(/requires a timestamp/);
  });

  it('rejects trial packaging for non-macOS targets', () => {
    const { metadata } = parseBuildVariantArgs([
      '--trial',
      '--expires-at=2026-10-01T06:59:59Z',
    ], { nowMs });
    expect(() => assertTrialBuildTargetPlatform(metadata, 'linux')).toThrow(/only supported for macOS/);
    expect(() => assertTrialBuildTargetPlatform(metadata, 'darwin')).not.toThrow();
    expect(() => assertTrialBuildTargetPlatform({ schemaVersion: 1, variant: 'regular' }, 'linux')).not.toThrow();
  });
});
