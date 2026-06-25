import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useFalSettings } from '../useFalSettings';

describe('useFalSettings (Seedance 2)', () => {
  it('defaults Seedance 2 to reference mode', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    expect(result.current.seedance2Variant).toBe('reference');
  });
});
