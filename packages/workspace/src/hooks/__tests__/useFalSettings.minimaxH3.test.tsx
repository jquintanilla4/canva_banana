import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useFalSettings } from '../useFalSettings';

describe('useFalSettings (MiniMax H3)', () => {
  it('defaults H3 to Reference, Adaptive, and 5 seconds', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    expect(result.current.miniMaxH3Variant).toBe('reference');
    expect(result.current.miniMaxH3AspectRatio).toBe('adaptive');
    expect(result.current.miniMaxH3Duration).toBe('5');
  });

  it('coerces Adaptive to 16:9 when Standard is selected and keeps it when returning to Reference', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    act(() => result.current.handleMiniMaxH3VariantChange('standard'));
    expect(result.current.miniMaxH3Variant).toBe('standard');
    expect(result.current.miniMaxH3AspectRatio).toBe('16:9');

    act(() => result.current.handleMiniMaxH3VariantChange('reference'));
    expect(result.current.miniMaxH3Variant).toBe('reference');
    expect(result.current.miniMaxH3AspectRatio).toBe('16:9');
  });
});
