import { useCallback, useEffect, useRef, useState } from 'react';
import {
  checkJimengLogin,
  clearJimengCache,
  getJimengSetupStatus,
  installJimengCli,
  startJimengLogin,
  type JimengSetupStatus,
} from '../services/jimengService';

type UseJimengSetupArgs = {
  isSetupRequired: boolean;
  isSelectedModelActive: boolean;
  onBeforeClearCache: () => void;
  onCacheCleared: (invalidatedProviderJobIds: string[]) => void;
  setError: (message: string | null) => void;
  setToastMessage: (message: string | null) => void;
};

const reserveJimengAuthorizationWindow = (): Window | null => {
  try {
    const authorizationWindow = window.open('about:blank', '_blank');
    if (authorizationWindow) {
      authorizationWindow.opener = null; // Detach the reserved tab before it navigates to the external login page.
    }
    return authorizationWindow;
  } catch {
    return null; // The setup-panel link remains available when the browser blocks popups.
  }
};

const openJimengAuthorizationPage = (authorizationWindow: Window | null, verificationUri: string): boolean => {
  if (!authorizationWindow || authorizationWindow.closed) {
    return false;
  }
  try {
    authorizationWindow.location.replace(verificationUri);
    return true;
  } catch {
    authorizationWindow.close();
    return false; // Keep login usable through the explicit setup-panel link.
  }
};

export type UseJimengSetupResult = {
  status: JimengSetupStatus | null;
  isChecking: boolean;
  isInstalling: boolean;
  isStartingLogin: boolean;
  isClearingCache: boolean;
  isReady: boolean;
  isDismissed: boolean;
  shouldBlockSelectedSubmit: boolean;
  shouldShowPanel: boolean;
  shouldShowReopen: boolean;
  refreshStatus: () => Promise<JimengSetupStatus | null>;
  ensureReady: () => Promise<boolean>;
  handleInstall: () => Promise<void>;
  handleLogin: () => Promise<void>;
  handleCheckLogin: () => Promise<void>;
  handleClearCache: () => Promise<void>;
  dismiss: () => void;
  reopen: () => void;
};

export const useJimengSetup = ({
  isSetupRequired,
  isSelectedModelActive,
  onBeforeClearCache,
  onCacheCleared,
  setError,
  setToastMessage,
}: UseJimengSetupArgs): UseJimengSetupResult => {
  const [status, setStatus] = useState<JimengSetupStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isStartingLogin, setIsStartingLogin] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isForcedOpen, setIsForcedOpen] = useState(false);
  const isLoginStartInFlightRef = useRef(false); // Async readiness checks must not race a new Device Flow request.
  const statusRequestIdRef = useRef(0); // Only the newest refresh or explicit login may commit setup state.
  const isEffectiveSetupRequired = isSetupRequired || isForcedOpen; // Reruns can force setup even when the selector changes.
  const isReady = status?.ready === true;
  const shouldBlockSelectedSubmit = isSelectedModelActive && (!isReady || isStartingLogin); // Never generate while setup or a new login is unresolved.
  const shouldShowPanel = isEffectiveSetupRequired && (!isReady || isForcedOpen) && !isDismissed;
  const shouldShowReopen = isEffectiveSetupRequired && !shouldShowPanel; // Ready users reopen this compact entry point to edit the session.

  const refreshStatus = useCallback(async (): Promise<JimengSetupStatus | null> => {
    const requestId = ++statusRequestIdRef.current;
    setIsChecking(true);
    try {
      const nextStatus = await getJimengSetupStatus();
      if (requestId !== statusRequestIdRef.current) {
        return null;
      }
      setStatus(previous => ({
        ...nextStatus,
        loginSessionId: nextStatus.ready ? undefined : previous?.loginSessionId,
        verificationUri: nextStatus.ready ? undefined : previous?.verificationUri,
        userCode: nextStatus.ready ? undefined : previous?.userCode,
      })); // Keep manual login links visible until the account is ready.
      if (nextStatus.ready) {
        setIsDismissed(false);
        setIsForcedOpen(false); // Ready resolves the force-open latch so the panel closes and stops following model switches.
      }
      return nextStatus;
    } catch (err) {
      if (requestId !== statusRequestIdRef.current) {
        return null;
      }
      const message = err instanceof Error ? err.message : 'Failed to check Jimeng setup.';
      const failedStatus = { ready: false, backendReachable: false, message };
      setStatus(failedStatus); // Keep setup failures visible in the panel.
      return failedStatus;
    } finally {
      if (requestId === statusRequestIdRef.current) {
        setIsChecking(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isEffectiveSetupRequired) {
      setIsDismissed(false);
      return;
    }
    void refreshStatus();
  }, [isEffectiveSetupRequired, refreshStatus]);

  const blockSubmit = useCallback((shouldRefresh = true) => {
    setIsForcedOpen(true);
    setIsDismissed(false);
    setError('Complete Jimeng CLI setup before generating with this model.');
    if (shouldRefresh) {
      void refreshStatus();
    }
  }, [refreshStatus, setError]);

  const ensureReady = useCallback(async () => {
    if (isLoginStartInFlightRef.current) {
      blockSubmit(false);
      return false;
    }
    const nextStatus = await refreshStatus();
    if (nextStatus?.ready === true) {
      return true;
    }
    blockSubmit(false);
    return false;
  }, [blockSubmit, refreshStatus]);

  const handleInstall = useCallback(async () => {
    setIsInstalling(true);
    setError(null);
    try {
      await installJimengCli();
      setToastMessage('Jimeng CLI installed. Run login next if the account is not ready.');
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to install Jimeng CLI.');
    } finally {
      setIsInstalling(false);
    }
  }, [refreshStatus, setError, setToastMessage]);

  const handleLogin = useCallback(async () => {
    isLoginStartInFlightRef.current = true;
    statusRequestIdRef.current += 1;
    setIsChecking(false); // Invalidate any readiness request that predates this explicit login.
    const authorizationWindow = reserveJimengAuthorizationWindow(); // Reserve the tab while the click still has browser activation.
    setIsStartingLogin(true);
    setError(null);
    try {
      const result = await startJimengLogin();
      statusRequestIdRef.current += 1;
      setIsChecking(false); // The Device Flow result also outranks refreshes started while Login was pending.
      setStatus(previous => ({
        ...(previous ?? { ready: false, backendReachable: true }),
        status: result.status,
        backendReachable: true,
        ready: result.status === 'ready',
        authenticated: result.status === 'ready',
        loginSessionId: result.loginSessionId,
        verificationUri: result.verificationUri,
        userCode: result.userCode,
        message: result.verificationUri ? 'Enter the displayed code on the Jimeng authorization page, then check login.' : result.message,
      })); // A new Device Flow result replaces stale readiness from the previous account check.
      const authorizationPageOpened = result.verificationUri
        ? openJimengAuthorizationPage(authorizationWindow, result.verificationUri)
        : false;
      if (!result.verificationUri) authorizationWindow?.close(); // Already-ready responses do not need the reserved tab.
      if (result.status === 'ready') {
        await refreshStatus();
      }
      setToastMessage(result.verificationUri
        ? authorizationPageOpened
          ? 'Jimeng authorization page opened. Enter the code shown in setup.'
          : 'Jimeng authorization is ready. Open the page from the setup panel.'
        : result.message);
    } catch (err) {
      statusRequestIdRef.current += 1;
      setIsChecking(false);
      authorizationWindow?.close();
      setError(err instanceof Error ? err.message : 'Failed to start Jimeng login.');
    } finally {
      isLoginStartInFlightRef.current = false;
      setIsStartingLogin(false);
    }
  }, [refreshStatus, setError, setToastMessage]);

  const handleCheckLogin = useCallback(async () => {
    const loginSessionId = status?.loginSessionId;
    if (!loginSessionId) {
      await refreshStatus();
      return;
    }
    const requestId = ++statusRequestIdRef.current;
    setIsChecking(false); // This explicit login check supersedes any older setup refresh.
    setIsStartingLogin(true);
    setError(null);
    try {
      const result = await checkJimengLogin(loginSessionId);
      if (requestId !== statusRequestIdRef.current) {
        return;
      }
      if (result.ready) {
        setToastMessage('Jimeng login completed.');
        await refreshStatus();
        return;
      }
      const authorizationPending = result.status === 'pending';
      setStatus(previous => ({
        ...previous,
        ...result,
        backendReachable: previous?.backendReachable ?? true,
        loginSessionId: authorizationPending ? previous?.loginSessionId : undefined,
        verificationUri: authorizationPending ? previous?.verificationUri : undefined,
        userCode: authorizationPending ? previous?.userCode : undefined,
      })); // Terminal setup states must not retain a completed Device Flow prompt.
    } catch (err) {
      if (requestId !== statusRequestIdRef.current) {
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to check Jimeng login.';
      setError(message);
      if (message.includes('expired')) {
        setStatus(previous => previous ? { ...previous, loginSessionId: undefined, verificationUri: undefined, userCode: undefined } : previous); // Drop dead Device Flow material so the panel stops showing it.
      }
    } finally {
      setIsStartingLogin(false);
    }
  }, [refreshStatus, setError, setToastMessage, status?.loginSessionId]);

  const handleClearCache = useCallback(async () => {
    onBeforeClearCache();
    setIsClearingCache(true);
    try {
      const result = await clearJimengCache();
      onCacheCleared(result.invalidatedJobIds);
      const freedMegabytes = result.bytesFreed / (1024 * 1024);
      const formattedSize = freedMegabytes >= 0.1 ? `${freedMegabytes.toFixed(1)} MB` : `${result.bytesFreed} bytes`;
      const suffix = result.status === 'partial' ? ` Some files could not be removed: ${result.errors[0] || 'unknown error'}` : '';
      setToastMessage(`Cleared ${result.deletedFiles} Jimeng video file${result.deletedFiles === 1 ? '' : 's'} (${formattedSize}).${suffix}`);
      setTimeout(() => setToastMessage(null), result.status === 'partial' ? 6000 : 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear Jimeng cache.');
    } finally {
      setIsClearingCache(false);
    }
  }, [onBeforeClearCache, onCacheCleared, setError, setToastMessage]);

  return {
    status,
    isChecking,
    isInstalling,
    isStartingLogin,
    isClearingCache,
    isReady,
    isDismissed,
    shouldBlockSelectedSubmit,
    shouldShowPanel,
    shouldShowReopen,
    refreshStatus,
    ensureReady,
    handleInstall,
    handleLogin,
    handleCheckLogin,
    handleClearCache,
    dismiss: () => {
      setIsForcedOpen(false);
      setIsDismissed(true);
    },
    reopen: () => {
      setIsForcedOpen(true);
      setIsDismissed(false);
    },
  };
};
