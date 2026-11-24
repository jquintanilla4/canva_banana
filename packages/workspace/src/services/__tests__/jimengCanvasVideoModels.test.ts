import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GenerationInputs } from '../../types';
import type { JimengCanvasModel } from '../jimengCanvasService';
import {
  getJimengCanvasVideoModel,
  getSavedJimengCanvasVideoModel,
  isJimengCanvasVideoModelId,
} from '../jimengCanvasVideoModels';

const model = (modelId: string, aliases: string[] = [], overrides: Partial<JimengCanvasModel> = {}): JimengCanvasModel => ({
  model: modelId,
  aliases,
  displayName: modelId,
  type: 'video',
  modes: [],
  ...overrides,
});

const generation = (canvasModel: string): GenerationInputs => ({
  kind: 'video',
  provider: 'jimeng',
  prompt: 'A bird flies over a river',
  jimengOptions: { canvasModel },
});

describe('Jimeng Canvas video model resolution', () => {
  it.each([
    ['seedance2.0fast_vip', 'seedance_2.0_fast_vip'],
    ['seedance2.0_vip', 'seedance_2.0_vip'],
    ['seedance2.0mini', 'seedance_2.0_mini'],
    ['seedance2.5', 'seedance_2.5'],
  ])('retains verified %s mapping independently of catalog loading', (version, expected) => {
    expect(getJimengCanvasVideoModel(version, undefined)).toBe(expected);
    expect(getJimengCanvasVideoModel(version, [])).toBe(expected);
  });

  it.each(['seedance2.0', 'seedance2.0fast'])('distinguishes pending and unavailable %s catalog entries', version => {
    expect(getJimengCanvasVideoModel(version, undefined)).toBeNull();
    expect(getJimengCanvasVideoModel(version, [])).toBeUndefined();
  });

  it('keeps Standard channels unavailable in the observed free-account catalog', () => {
    const fixture: { items: JimengCanvasModel[] } = JSON.parse(readFileSync(resolve(process.cwd(), 'src/services/__tests__/fixtures/jimeng-canvas-video-catalog.json'), 'utf8'));
    expect(getJimengCanvasVideoModel('seedance2.0', fixture.items)).toBeUndefined();
    expect(getJimengCanvasVideoModel('seedance2.0fast', fixture.items)).toBeUndefined();
    expect(getJimengCanvasVideoModel('seedance2.0_vip', fixture.items)).toBe('seedance_2.0_vip');
  });

  it.each([
    ['seedance2.0', 'Seedance_2.0', []],
    ['seedance2.0', 'seedance-2.0-standard', []],
    ['seedance2.0', 'paid_video_channel_2026', ['SEEDANCE 2.0 Standard']],
    ['seedance2.0', 'standard-channel', ['Seedance:2.0']],
    ['seedance2.0fast', 'Seedance_2.0_Fast', []],
    ['seedance2.0fast', 'seedance-2.0-standard-fast', []],
    ['seedance2.0fast', 'accelerated_2026', ['SEEDANCE 2.0 Standard Fast']],
    ['seedance2.0fast', 'fast-channel', ['Seedance 2.0-fast']],
  ])('returns the exact catalog identifier for %s via %s', (version, canonical, aliases) => {
    expect(getJimengCanvasVideoModel(version, [model(canonical, aliases)])).toBe(canonical);
  });

  it('resolves both channels independently from one catalog', () => {
    const catalog = [model('channel-a', ['seedance2.0standard']), model('channel-b', ['seedance2.0standardfast'])];
    expect(getJimengCanvasVideoModel('seedance2.0', catalog)).toBe('channel-a');
    expect(getJimengCanvasVideoModel('seedance2.0fast', catalog)).toBe('channel-b');
  });

  it.each(['seedance2.0', 'seedance2.0fast'])('does not guess %s from display names or related tiers', version => {
    const catalog = [
      model('seedance_2.0_fast_vip', ['seedance2.0fast_vip']),
      model('seedance_2.0_vip', ['seedance2.0_vip']),
      model('seedance_2.0_mini', ['seedance2.0mini']),
      model('unidentified', [], { displayName: 'Seedance 2.0 Standard Fast' }),
      model('marketing', ['seedance2.0standardfastpreview', 'seedance2.0standardpreview']),
    ];
    expect(getJimengCanvasVideoModel(version, catalog)).toBeUndefined();
  });

  it.each([
    ['seedance2.0', 'seedance_2.0_vip', ['seedance2.0standard']],
    ['seedance2.0fast', 'seedance_2.0_mini', ['seedance2.0standardfast']],
    ['seedance2.0', 'seedance_2.0_fast', ['seedance2.0standard']],
    ['seedance2.0fast', 'seedance_2.0', ['seedance2.0standardfast']],
    ['seedance2.0fast', 'channel', ['seedance2.0standardfast', 'seedance2.0fast_vip']],
    ['seedance2.0', 'channel', ['seedance2.0standard', 'seedance2.0standardfast']],
  ])('rejects contrary tier identities on %s catalog row %s', (version, canonical, aliases) => {
    expect(getJimengCanvasVideoModel(version, [model(canonical, aliases)])).toBeUndefined();
  });

  it('ignores nonvideo rows and rejects unsafe canonical identifiers', () => {
    expect(getJimengCanvasVideoModel('seedance2.0', [model('image-channel', ['seedance2.0'], { type: 'image' })])).toBeUndefined();
    expect(getJimengCanvasVideoModel('seedance2.0', [model('--untrusted', ['seedance2.0'])])).toBeUndefined();
    expect(getJimengCanvasVideoModel('seedance2.0', [model('channel', ['seedance2ß0'])])).toBeUndefined();
  });

  it('rejects ambiguous aliases and duplicate canonical rows', () => {
    expect(getJimengCanvasVideoModel('seedance2.0', [model('channel-a', ['seedance2.0']), model('channel-b', ['seedance2.0standard'])])).toBeUndefined();
    expect(getJimengCanvasVideoModel('seedance2.0', [model('channel', ['seedance2.0']), model('channel', [])])).toBeUndefined();
    expect(getJimengCanvasVideoModel('seedance2.0fast', [model('channel', ['seedance2.0fast']), model('channel', ['seedance2.0standardfast'])])).toBeUndefined();
  });

  it('permits duplicate aliases within one unambiguous row and ignores image ID collisions', () => {
    const row = model('channel', ['seedance2.0', 'Seedance 2.0 Standard', 'seedance2.0']);
    expect(getJimengCanvasVideoModel('seedance2.0', [row, { ...row, type: 'image' }])).toBe('channel');
  });

  it.each([undefined, '', 'unknown', 'seedance2.0standard', 'seedance2.0fast_vip_preview'])('does not wait for unrecognized classic version %s', version => {
    expect(getJimengCanvasVideoModel(version, undefined)).toBeUndefined();
  });
});

describe('saved Jimeng Canvas model validation', () => {
  it.each(['seedance_2.0_fast_vip', 'paid-channel-2026', 'Canonical.Video_2', 'a'.repeat(256)])('preserves a syntax-safe canonical identifier %s', canonical => {
    expect(isJimengCanvasVideoModelId(canonical)).toBe(true);
    expect(getSavedJimengCanvasVideoModel(generation(canonical))).toBe(canonical);
  });

  it.each(['', 'a'.repeat(257), '--model', '.hidden', '_hidden', ' model', 'model ', 'model\n', 'model\r', 'two words', 'path/to/model', 'path\\model', 'model;command', 'model\u0000', '模型'])('rejects unsafe saved identifier %j', canonical => {
    expect(isJimengCanvasVideoModelId(canonical)).toBe(false);
    expect(getSavedJimengCanvasVideoModel(generation(canonical))).toBeUndefined();
  });

  it.each([undefined, null, 12, {}, []])('rejects nonstring canonical identifier %j', value => {
    expect(isJimengCanvasVideoModelId(value)).toBe(false);
  });

  it('handles missing saved execution metadata', () => {
    expect(getSavedJimengCanvasVideoModel(undefined)).toBeUndefined();
    expect(getSavedJimengCanvasVideoModel({ kind: 'video', provider: 'jimeng', prompt: 'A bird' })).toBeUndefined();
  });
});
