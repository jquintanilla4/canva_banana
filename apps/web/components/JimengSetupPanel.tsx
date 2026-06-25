import React from 'react';
import { ConfirmIcon, DownloadIcon, RerunIcon, UploadIcon } from './Icons';
import type { JimengSetupStatus } from '../services/jimengService';
import { OVERLAY_LAYER_CLASS_NAMES } from '../utils/overlayLayers';

type JimengSetupPanelProps = {
  status: JimengSetupStatus | null;
  isChecking: boolean;
  isInstalling: boolean;
  isStartingLogin: boolean;
  onInstall: () => void;
  onLogin: () => void;
  onDebugLogin: () => void;
  onRefresh: () => void;
  onDismiss: () => void;
};

const getStatusDotClass = (isReady: boolean | undefined): string =>
  isReady ? 'bg-emerald-400 shadow-emerald-400/40' : 'bg-amber-300 shadow-amber-300/30'; // Small signal keeps the panel dense.

export const JimengSetupPanel: React.FC<JimengSetupPanelProps> = ({
  status,
  isChecking,
  isInstalling,
  isStartingLogin,
  onInstall,
  onLogin,
  onDebugLogin,
  onRefresh,
  onDismiss,
}) => {
  const backendReachable = status?.backendReachable === true;
  const backendLabel = status === null ? 'Checking' : backendReachable ? 'Connected' : 'Offline';
  const cliReady = status?.cliAvailable === true;
  const authReady = status?.authenticated === true;
  const setupBusy = isChecking || isInstalling || isStartingLogin;
  const primaryActionDisabled = setupBusy || !backendReachable;

  return (
    <section
      className={`fixed right-4 top-20 ${OVERLAY_LAYER_CLASS_NAMES.floatingPanel} w-[22rem] max-w-[calc(100vw-2rem)] rounded-lg border border-cyan-300/25 bg-gray-950/92 p-4 text-gray-100 shadow-2xl shadow-black/40 backdrop-blur-md`}
      aria-label="Jimeng setup"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80">Jimeng Setup</p>
          <h2 className="mt-1 text-sm font-semibold text-white">Seedance 2 (JM CLI)</h2>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          Dismiss
        </button>
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
          <span className="text-gray-300">Backend</span>
          <span className="flex items-center gap-2 font-medium text-gray-100">
            <span className={`h-2 w-2 rounded-full shadow ${getStatusDotClass(backendReachable)}`} />
            {backendLabel}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
          <span className="text-gray-300">CLI</span>
          <span className="flex items-center gap-2 font-medium text-gray-100">
            <span className={`h-2 w-2 rounded-full shadow ${getStatusDotClass(cliReady)}`} />
            {cliReady ? 'Installed' : 'Missing'}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
          <span className="text-gray-300">Account</span>
          <span className="flex items-center gap-2 font-medium text-gray-100">
            <span className={`h-2 w-2 rounded-full shadow ${getStatusDotClass(authReady)}`} />
            {authReady ? 'Ready' : 'Login needed'}
          </span>
        </div>
      </div>

      {status?.message && (
        <p className="mt-3 max-h-20 overflow-y-auto rounded-md border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-[11px] leading-snug text-amber-100">
          {status.message}
        </p>
      )}

      {(status?.loginOutput || status?.detail) && (
        <pre className="mt-3 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-md border border-white/10 bg-black/35 px-3 py-2 text-[10px] leading-snug text-gray-200">
          {status.loginOutput || status.detail}
        </pre>
      )}

      {status?.authUrl && (
        <a
          href={status.authUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex items-center justify-center gap-2 rounded-md border border-emerald-300/30 bg-emerald-300/14 px-3 py-2 text-xs font-semibold text-emerald-100 transition-colors hover:bg-emerald-300/24"
        >
          <UploadIcon className="h-3 w-3" />
          Open Login Page
        </a>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onInstall}
          disabled={primaryActionDisabled}
          className="flex items-center justify-center gap-2 rounded-md border border-cyan-300/25 bg-cyan-300/12 px-3 py-2 text-xs font-semibold text-cyan-100 transition-colors hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <DownloadIcon className="h-3 w-3" />
          {isInstalling ? 'Installing' : 'Install'}
        </button>
        <button
          type="button"
          onClick={onLogin}
          disabled={primaryActionDisabled || !cliReady}
          className="flex items-center justify-center gap-2 rounded-md border border-emerald-300/25 bg-emerald-300/12 px-3 py-2 text-xs font-semibold text-emerald-100 transition-colors hover:bg-emerald-300/20 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <UploadIcon className="h-3 w-3" />
          {isStartingLogin ? 'Opening' : 'Login'}
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={setupBusy}
          className="flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <RerunIcon className="h-3 w-3" />
          {isChecking ? 'Checking' : 'Recheck'}
        </button>
        <button
          type="button"
          onClick={onDebugLogin}
          disabled={primaryActionDisabled || !cliReady}
          className="flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ConfirmIcon className="h-3 w-3" />
          Debug Login
        </button>
      </div>
    </section>
  );
};
