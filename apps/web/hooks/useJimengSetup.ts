import { useCallback, useEffect, useState } from 'react';
import {
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
  setError: (message: string | null) => void;
  setToastMessage: (message: string | null) => void;
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
  handleLogin: (debug?: boolean) => Promise<void>;
  handleClearCache: () => Promise<void>;
  dismiss: () => void;
  reopen: () => void;
};

export const useJimengSetup = ({
  isSetupRequired,
  isSelectedModelActive,
  onBeforeClearCache,
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
  const isEffectiveSetupRequired = isSetupRequired || isForcedOpen; // Reruns can force setup even when the selector changes.
  const isReady = status?.ready === true;
  const shouldBlockSelectedSubmit = isSelectedModelActive && !isReady; // Disable selected JM CLI submits until setup is ready.
  const shouldShowPanel = isEffectiveSetupRequired && !isReady && !isDismissed; // Full setup stays visible until dismissed.
  const shouldShowReopen = isEffectiveSetupRequired && !isReady && isDismissed; // Dismissed setup still needs recovery.

  const refreshStatus = useCallback(async (): Promise<JimengSetupStatus | null> => {
    setIsChecking(true);
    try {
      const nextStatus = await getJimengSetupStatus();
      setStatus(previous => ({
        ...nextStatus,
        authUrl: nextStatus.ready ? undefined : previous?.authUrl,
        loginOutput: nextStatus.ready ? undefined : previous?.loginOutput,
      })); // Keep manual login links visible until the account is ready.
      if (nextStatus.ready) {
        setIsDismissed(false);
        setIsForcedOpen(false);
      }
      return nextStatus;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to check Jimeng setup.';
      const failedStatus = { ready: false, backendReachable: false, message };
      setStatus(failedStatus); // Keep setup failures visible in the panel.
      return failedStatus;
    } finally {
      setIsChecking(false);
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
    setError('Complete Jimeng setup before generating Seedance 2 (JM CLI).');
    if (shouldRefresh) {
      void refreshStatus();
    }
  }, [refreshStatus, setError]);

  const ensureReady = useCallback(async () => {
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

  const handleLogin = useCallback(async (debug = false) => {
    setIsStartingLogin(true);
    setError(null);
    try {
      const result = await startJimengLogin(debug);
      const loginOutput = result.output?.trim();
      setStatus(previous => ({
        ...(previous ?? { ready: false, backendReachable: true }),
        authUrl: result.authUrl ?? previous?.authUrl,
        loginOutput,
        message: result.authUrl ? 'Open the Jimeng login page, complete auth, then recheck.' : (loginOutput || result.message),
      })); // Surface CLI login output because browser auto-open can fail.
      if (result.authUrl) {
        window.open(result.authUrl, '_blank', 'noopener,noreferrer');
      }
      setToastMessage(result.authUrl ? 'Jimeng login page opened. Complete auth, then recheck.' : (debug ? 'Jimeng debug login started. Check the setup panel output, then recheck.' : 'Jimeng login started. If no page opened, try Debug Login.'));
      window.setTimeout(() => {
        void refreshStatus();
      }, 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Jimeng login.');
    } finally {
      setIsStartingLogin(false);
    }
  }, [refreshStatus, setError, setToastMessage]);

  const handleClearCache = useCallback(async () => {
    onBeforeClearCache();
    setIsClearingCache(true);
    try {
      const result = await clearJimengCache();
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
  }, [onBeforeClearCache, setError, setToastMessage]);

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
    handleClearCache,
    dismiss: () => setIsDismissed(true),
    reopen: () => setIsDismissed(false),
  };
};
