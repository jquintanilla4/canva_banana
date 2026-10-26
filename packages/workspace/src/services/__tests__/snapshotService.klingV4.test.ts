import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFalSettings } from '../../hooks/useFalSettings';
import type { GenerationFalOptions, GenerationInputs } from '../../types';
import { getNewVideoPromptBarDefaults } from '../../utils/videoPromptBarDefaults';
import { KLING_V4_DEFAULTS, KLING_V4_VIDEO_MODEL_ID } from '../klingV4Config';
import { buildSnapshotBinaryFromState, normalizeSnapshotImageMetadata, restoreSnapshotFromFile, snapshotBinaryToBlob, type SnapshotMetaState } from '../snapshotService';

const generation: GenerationInputs = { kind: 'video', provider: 'fal', modelId: KLING_V4_VIDEO_MODEL_ID, modelMode: 'video', prompt: 'A moving subject' };

describe('Kling v4 snapshot settings', () => {
  it.each([
    { ...KLING_V4_DEFAULTS, klingV4Resolution: '720p', klingV4Duration: '30', klingV4AspectRatio: '21:9' },
    { ...KLING_V4_DEFAULTS, klingV4Variant: 'edit', klingV4Resolution: '720p', klingV4Duration: 'source' },
  ] satisfies GenerationFalOptions[])('roundtrips $klingV4Variant $klingV4Duration through binary snapshot and settings restore', async falOptions => {
    const NativeURL = URL;
    vi.stubGlobal('URL', class extends NativeURL {
      static createObjectURL = () => 'blob:kling-v4-test';
      static revokeObjectURL = () => undefined;
    });
    vi.stubGlobal('Image', class {
      onload?: () => void;
      naturalWidth = 1024;
      naturalHeight = 1024;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    });
    try {
      const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
      act(() => result.current.applyGenerationSettings(generation));
      const savedGeneration: GenerationInputs = { ...generation, falOptions };
      const binary = await buildSnapshotBinaryFromState({
        images: [{
          id: 'image-1', element: document.createElement('img'), mediaType: 'image', x: 0, y: 0, width: 1024, height: 1024, rotation: 0,
          naturalWidth: 1024, naturalHeight: 1024,
          file: new File(['image'], 'image.png', { type: 'image/png' }),
          metadata: { source: 'generated', generation: savedGeneration },
        }],
        notes: [], paths: [], videoPromptAreas: [],
        videoPromptBars: [{ ...getNewVideoPromptBarDefaults(result.current), id: 'bar-1', assignedAreaId: null, x: 0, y: 0, width: 400, height: 100, falOptions }],
        meta: falOptions as SnapshotMetaState,
      });
      const restored = await restoreSnapshotFromFile(new File([snapshotBinaryToBlob(binary)], 'kling.bcsnap'), { brushSize: 20, eraserSize: 20, brushColor: '#000000' });
      expect(restored.images[0].metadata?.generation).toMatchObject(savedGeneration);
      expect(restored.videoPromptBars[0]).toMatchObject({ modelId: KLING_V4_VIDEO_MODEL_ID, falOptions });
      expect(restored.meta).toMatchObject(falOptions);
      act(() => result.current.applyGenerationSettings(restored.images[0].metadata!.generation!));
      expect(result.current).toMatchObject(falOptions);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('drops invalid fields from generation, embedded settings, and footer metadata', async () => {
    const falOptions = { klingV4Variant: 'reference', klingV4Resolution: '4k', klingV4AspectRatio: 'source', klingV4Duration: '31' };
    const normalized = normalizeSnapshotImageMetadata({ source: 'generated', generation: { ...generation, falOptions } } as never);
    expect(normalized?.generation?.falOptions).toBeUndefined();
    const json = JSON.stringify({ version: 1, createdAt: new Date(0).toISOString(), state: {
      images: [], notes: [], paths: [], meta: falOptions,
      videoPromptBars: [{ id: 'bar-invalid', modelId: KLING_V4_VIDEO_MODEL_ID, falOptions }],
    } });
    const file = new File([json], 'invalid.json', { type: 'application/json' });
    if (typeof file.text !== 'function') Object.defineProperty(file, 'text', { value: () => Promise.resolve(json) });
    const restored = await restoreSnapshotFromFile(file, { brushSize: 20, eraserSize: 20, brushColor: '#000000' });
    expect(restored.videoPromptBars[0].falOptions).toEqual({});
    for (const key of Object.keys(falOptions)) expect((restored.meta as Record<string, unknown>)[key]).toBeUndefined();
  });

  it.each(['2', '31', '5.5', '03', 30, null])('rejects malformed duration %s', duration => {
    const normalized = normalizeSnapshotImageMetadata({ source: 'generated', generation: { ...generation, falOptions: { klingV4Duration: duration } } } as never);
    expect(normalized?.generation?.falOptions?.klingV4Duration).toBeUndefined();
  });
});
