import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useFalSettings } from '../useFalSettings';

describe('useFalSettings (Seedance 2)', () => {
  it('defaults Seedance 2 to reference mode', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    expect(result.current.seedance2Variant).toBe('reference');
  });

  it('keeps Seedance 2.5 on its separate provider defaults', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    expect(result.current.seedance25Variant).toBe('reference');
    expect(result.current.seedance25AspectRatio).toBe('adaptive');
    expect(result.current.seedance25Resolution).toBe('720p');
    expect(result.current.seedance25Duration).toBe('auto');
    expect(result.current.seedance25GenerateAudio).toBe(true);
    expect(result.current.seedance2Duration).toBe('5');
    expect(result.current.seedance2GenerateAudio).toBe(false);
  });
});
