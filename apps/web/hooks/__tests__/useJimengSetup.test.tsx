import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getJimengSetupStatus } from '../../services/jimengService';
import { useJimengSetup } from '../useJimengSetup';

vi.mock('../../services/jimengService', () => ({
  clearJimengCache: vi.fn(),
  getJimengSetupStatus: vi.fn(),
  installJimengCli: vi.fn(),
  startJimengLogin: vi.fn(),
}));

const buildHookArgs = () => ({
  isSetupRequired: false,
  isSelectedModelActive: false,
  onBeforeClearCache: vi.fn(),
  setError: vi.fn(),
  setToastMessage: vi.fn(),
}); // Minimal setup bindings for readiness gating.

describe('useJimengSetup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows the first submit when the initial readiness check resolves ready', async () => {
    vi.mocked(getJimengSetupStatus).mockResolvedValue({
      status: 'ready',
      ready: true,
      backendReachable: true,
      message: 'Jimeng setup is ready.',
    }); // Simulate a ready backend before cached status exists.
    const args = buildHookArgs();
    const { result } = renderHook(() => useJimengSetup(args));

    let isReady = false;
    await act(async () => {
      isReady = await result.current.ensureReady();
    });

    expect(isReady).toBe(true);
    expect(args.setError).not.toHaveBeenCalled();
    expect(getJimengSetupStatus).toHaveBeenCalledTimes(1);
  });
});
