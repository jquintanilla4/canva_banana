import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkJimengLogin, clearJimengCache, getJimengSetupStatus, startJimengLogin, type JimengSetupActionResult, type JimengSetupStatus } from '../../services/jimengService';
import { useJimengSetup } from '../useJimengSetup';

vi.mock('../../services/jimengService', () => ({
  clearJimengCache: vi.fn(),
  checkJimengLogin: vi.fn(),
  getJimengSetupStatus: vi.fn(),
  installJimengCli: vi.fn(),
  startJimengLogin: vi.fn(),
}));

const buildHookArgs = () => ({
  isSetupRequired: false,
  isSelectedModelActive: false,
  onBeforeClearCache: vi.fn(),
  onCacheCleared: vi.fn(),
  setError: vi.fn(),
  setToastMessage: vi.fn(),
}); // Minimal setup bindings for readiness gating.

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}; // Tests control async completion order to reproduce request races.

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

  it('clears the force-open latch once setup reports ready', async () => {
    vi.mocked(getJimengSetupStatus)
      .mockResolvedValueOnce({ status: 'setup_required', ready: false, backendReachable: true, message: 'Login required.' })
      .mockResolvedValueOnce({ status: 'setup_required', ready: false, backendReachable: true, message: 'Login required.' })
      .mockResolvedValue({ status: 'ready', ready: true, backendReachable: true, message: 'Jimeng setup is ready.' });
    const initialArgs = { ...buildHookArgs(), isSetupRequired: true, isSelectedModelActive: true };
    const { result, rerender } = renderHook(props => useJimengSetup(props), { initialProps: initialArgs });

    await waitFor(() => expect(result.current.status).not.toBeNull()); // Initial effect refresh resolves not-ready.

    let isReady = true;
    await act(async () => {
      isReady = await result.current.ensureReady(); // Not ready: submit is blocked and the panel is forced open.
    });
    expect(isReady).toBe(false);
    expect(result.current.shouldShowPanel).toBe(true);

    await act(async () => {
      await result.current.refreshStatus(); // Login completes; ready must release the latch.
    });
    expect(result.current.shouldShowPanel).toBe(false);
    expect(result.current.shouldShowReopen).toBe(true);

    rerender({ ...initialArgs, isSetupRequired: false, isSelectedModelActive: false }); // The panel must not follow model switches.
    expect(result.current.shouldShowPanel).toBe(false);
    expect(result.current.shouldShowReopen).toBe(false);
  });

  it('reserves the authorization tab before requesting login and navigates it after the response', async () => {
    const callOrder: string[] = [];
    const replace = vi.fn();
    const close = vi.fn();
    const authorizationWindow = {
      closed: false,
      close,
      location: { replace },
      opener: window,
    } as unknown as Window;
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => {
      callOrder.push('open');
      return authorizationWindow;
    });
    vi.mocked(startJimengLogin).mockImplementation(async () => {
      callOrder.push('start');
      return {
        status: 'authorization_required',
        message: 'Authorize Jimeng.',
        loginSessionId: 'login-session-1',
        verificationUri: 'https://example.com/device',
        userCode: 'ABCD-EFGH',
      };
    });
    const args = buildHookArgs();
    const { result } = renderHook(() => useJimengSetup(args));

    await act(async () => {
      await result.current.handleLogin();
    });

    expect(callOrder).toEqual(['open', 'start']);
    expect(openSpy).toHaveBeenCalledWith('about:blank', '_blank');
    expect(authorizationWindow.opener).toBeNull();
    expect(replace).toHaveBeenCalledWith('https://example.com/device');
    expect(close).not.toHaveBeenCalled();
    expect(args.setToastMessage).toHaveBeenCalledWith('Jimeng authorization page opened. Enter the code shown in setup.');
    openSpy.mockRestore();
  });

  it('keeps the setup-panel authorization link available when the popup is blocked', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    vi.mocked(startJimengLogin).mockResolvedValue({
      status: 'authorization_required',
      message: 'Authorize Jimeng.',
      loginSessionId: 'login-session-1',
      verificationUri: 'https://example.com/device',
      userCode: 'ABCD-EFGH',
    });
    const args = buildHookArgs();
    const { result } = renderHook(() => useJimengSetup(args));

    await act(async () => {
      await result.current.handleLogin();
    });

    expect(result.current.status?.verificationUri).toBe('https://example.com/device');
    expect(args.setToastMessage).toHaveBeenCalledWith('Jimeng authorization is ready. Open the page from the setup panel.');
    openSpy.mockRestore();
  });

  it('clears cached readiness when a new Device Flow requires authorization', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    vi.mocked(getJimengSetupStatus).mockResolvedValue({
      status: 'ready',
      ready: true,
      backendReachable: true,
      authenticated: true,
      message: 'Jimeng setup is ready.',
    });
    vi.mocked(startJimengLogin).mockResolvedValue({
      status: 'authorization_required',
      message: 'Authorize Jimeng.',
      loginSessionId: 'login-session-1',
      verificationUri: 'https://example.com/device',
      userCode: 'ABCD-EFGH',
    });
    const args = { ...buildHookArgs(), isSetupRequired: true, isSelectedModelActive: true };
    const { result } = renderHook(() => useJimengSetup(args));
    await waitFor(() => expect(result.current.status?.ready).toBe(true));

    await act(async () => {
      await result.current.handleLogin();
    });

    expect(result.current.status).toEqual(expect.objectContaining({
      status: 'authorization_required',
      backendReachable: true,
      ready: false,
      authenticated: false,
    }));
    expect(result.current.shouldBlockSelectedSubmit).toBe(true);
    openSpy.mockRestore();
  });

  it('blocks readiness checks while a new login request is in flight', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const loginResult = deferred<JimengSetupActionResult>();
    vi.mocked(startJimengLogin).mockReturnValue(loginResult.promise);
    vi.mocked(getJimengSetupStatus).mockResolvedValue({
      status: 'ready',
      ready: true,
      backendReachable: true,
      authenticated: true,
      message: 'Jimeng setup is ready.',
    });
    const args = { ...buildHookArgs(), isSetupRequired: true, isSelectedModelActive: true };
    const { result } = renderHook(() => useJimengSetup(args));
    await waitFor(() => expect(result.current.status?.ready).toBe(true));

    let loginPromise!: Promise<void>;
    act(() => {
      loginPromise = result.current.handleLogin();
    });
    await waitFor(() => expect(result.current.isStartingLogin).toBe(true));

    expect(result.current.shouldBlockSelectedSubmit).toBe(true);
    let isReady = true;
    await act(async () => {
      isReady = await result.current.ensureReady();
    });
    expect(isReady).toBe(false);
    expect(getJimengSetupStatus).toHaveBeenCalledTimes(1); // The initial status check is the only allowed refresh.

    await act(async () => {
      loginResult.resolve({
        status: 'authorization_required',
        message: 'Authorize Jimeng.',
        loginSessionId: 'login-session-1',
        verificationUri: 'https://example.com/device',
        userCode: 'ABCD-EFGH',
      });
      await loginPromise;
    });

    expect(result.current.status?.loginSessionId).toBe('login-session-1');
    openSpy.mockRestore();
  });

  it('ignores a ready refresh that predates a new login result', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const staleStatus = deferred<JimengSetupStatus>();
    vi.mocked(getJimengSetupStatus)
      .mockResolvedValueOnce({
        status: 'ready',
        ready: true,
        backendReachable: true,
        authenticated: true,
        message: 'Jimeng setup is ready.',
      })
      .mockReturnValueOnce(staleStatus.promise);
    vi.mocked(startJimengLogin).mockResolvedValue({
      status: 'authorization_required',
      message: 'Authorize Jimeng.',
      loginSessionId: 'login-session-1',
      verificationUri: 'https://example.com/device',
      userCode: 'ABCD-EFGH',
    });
    const args = { ...buildHookArgs(), isSetupRequired: true, isSelectedModelActive: true };
    const { result } = renderHook(() => useJimengSetup(args));
    await waitFor(() => expect(result.current.status?.ready).toBe(true));

    let refreshPromise!: Promise<JimengSetupStatus | null>;
    act(() => {
      refreshPromise = result.current.refreshStatus();
    });
    await waitFor(() => expect(result.current.isChecking).toBe(true));

    await act(async () => {
      await result.current.handleLogin();
    });
    expect(result.current.status?.loginSessionId).toBe('login-session-1');

    await act(async () => {
      staleStatus.resolve({
        status: 'ready',
        ready: true,
        backendReachable: true,
        authenticated: true,
        message: 'Stale ready status.',
      });
      await refreshPromise;
    });

    expect(result.current.status).toEqual(expect.objectContaining({
      status: 'authorization_required',
      ready: false,
      loginSessionId: 'login-session-1',
    }));
    openSpy.mockRestore();
  });

  it('keeps the newest result from overlapping status refreshes', async () => {
    const olderStatus = deferred<JimengSetupStatus>();
    const newerStatus = deferred<JimengSetupStatus>();
    vi.mocked(getJimengSetupStatus)
      .mockReturnValueOnce(olderStatus.promise)
      .mockReturnValueOnce(newerStatus.promise);
    const { result } = renderHook(() => useJimengSetup(buildHookArgs()));

    let olderRefresh!: Promise<JimengSetupStatus | null>;
    let newerRefresh!: Promise<JimengSetupStatus | null>;
    act(() => {
      olderRefresh = result.current.refreshStatus();
      newerRefresh = result.current.refreshStatus();
    });

    await act(async () => {
      newerStatus.resolve({
        status: 'setup_required',
        ready: false,
        backendReachable: true,
        message: 'Newest setup status.',
      });
      await newerRefresh;
    });
    await act(async () => {
      olderStatus.resolve({
        status: 'ready',
        ready: true,
        backendReachable: true,
        authenticated: true,
        message: 'Older ready status.',
      });
      await olderRefresh;
    });

    expect(result.current.status).toEqual(expect.objectContaining({
      status: 'setup_required',
      ready: false,
      message: 'Newest setup status.',
    }));
    expect(result.current.isChecking).toBe(false);
  });

  it('ignores a pending login check that predates a ready status refresh', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const staleLoginCheck = deferred<Awaited<ReturnType<typeof checkJimengLogin>>>();
    vi.mocked(startJimengLogin).mockResolvedValue({
      status: 'authorization_required',
      message: 'Authorize Jimeng.',
      loginSessionId: 'login-session-1',
      verificationUri: 'https://example.com/device',
      userCode: 'ABCD-EFGH',
    });
    vi.mocked(checkJimengLogin).mockReturnValue(staleLoginCheck.promise);
    vi.mocked(getJimengSetupStatus).mockResolvedValue({
      status: 'ready',
      ready: true,
      backendReachable: true,
      authenticated: true,
      message: 'Jimeng setup is ready.',
    });
    const { result } = renderHook(() => useJimengSetup(buildHookArgs()));

    await act(async () => {
      await result.current.handleLogin();
    });

    let loginCheckPromise!: Promise<void>;
    act(() => {
      loginCheckPromise = result.current.handleCheckLogin();
    });
    await waitFor(() => expect(result.current.isStartingLogin).toBe(true));

    await act(async () => {
      await result.current.refreshStatus();
    });
    expect(result.current.status?.ready).toBe(true);

    await act(async () => {
      staleLoginCheck.resolve({
        status: 'pending',
        ready: false,
        message: 'Waiting for Jimeng authorization.',
      });
      await loginCheckPromise;
    });

    expect(result.current.status).toEqual(expect.objectContaining({
      status: 'ready',
      ready: true,
    }));
    expect(result.current.status?.loginSessionId).toBeUndefined();
    expect(result.current.isStartingLogin).toBe(false);
    openSpy.mockRestore();
  });

  it('preserves actionable setup fields returned after authorization', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    vi.mocked(startJimengLogin).mockResolvedValue({
      status: 'authorization_required',
      message: 'Authorize Jimeng.',
      loginSessionId: 'login-session-1',
      verificationUri: 'https://example.com/device',
      userCode: 'ABCD-EFGH',
    });
    vi.mocked(checkJimengLogin).mockResolvedValue({
      status: 'update_required',
      ready: false,
      cliAvailable: true,
      authenticated: true,
      cliVersion: '1.4.14',
      message: 'Install Dreamina CLI 1.4.15 or newer.',
    });
    const args = buildHookArgs();
    const { result } = renderHook(() => useJimengSetup(args));

    await act(async () => {
      await result.current.handleLogin();
    });
    await act(async () => {
      await result.current.handleCheckLogin();
    });

    expect(result.current.status).toEqual(expect.objectContaining({
      status: 'update_required',
      ready: false,
      backendReachable: true,
      cliAvailable: true,
      authenticated: true,
      cliVersion: '1.4.14',
      message: 'Install Dreamina CLI 1.4.15 or newer.',
    }));
    expect(result.current.status?.loginSessionId).toBeUndefined();
    expect(result.current.status?.verificationUri).toBeUndefined();
    expect(result.current.status?.userCode).toBeUndefined();
    openSpy.mockRestore();
  });

  it('closes the reserved authorization tab when login setup fails', async () => {
    const close = vi.fn();
    const authorizationWindow = {
      closed: false,
      close,
      location: { replace: vi.fn() },
      opener: window,
    } as unknown as Window;
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(authorizationWindow);
    vi.mocked(startJimengLogin).mockRejectedValue(new Error('Login backend failed.'));
    const args = buildHookArgs();
    const { result } = renderHook(() => useJimengSetup(args));

    await act(async () => {
      await result.current.handleLogin();
    });

    expect(close).toHaveBeenCalledTimes(1);
    expect(args.setError).toHaveBeenCalledWith('Login backend failed.');
    openSpy.mockRestore();
  });

  it('reports cache-cleared job IDs so stale result links can be invalidated', async () => {
    vi.mocked(clearJimengCache).mockResolvedValue({
      status: 'ok',
      deletedFiles: 1,
      bytesFreed: 1024,
      workDir: '/tmp/jimeng',
      errors: [],
      invalidatedJobIds: ['completed-job'],
    });
    const args = buildHookArgs();
    const { result } = renderHook(() => useJimengSetup(args));

    await act(async () => {
      await result.current.handleClearCache();
    });

    expect(args.onCacheCleared).toHaveBeenCalledWith(['completed-job']);
  });
});
