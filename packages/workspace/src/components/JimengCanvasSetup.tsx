import React, { useEffect, useRef, useState } from 'react';
import {
  checkJimengCanvasLogin,
  getJimengCanvasSetupStatus,
  installJimengCanvasCli,
  removeJimengLegacyCli,
  startJimengCanvasLogin,
  type JimengCanvasSetupAction,
  type JimengCanvasSetupStatus,
  type JimengLegacyCliLocation,
} from '../services/jimengCanvasService';
import { workspaceDelay } from '../services/workspaceSession';
import { OVERLAY_LAYER_CLASS_NAMES } from '../utils/overlayLayers';
import { JimengLegacyCliRemoval } from './JimengLegacyCliRemoval';

export interface JimengCanvasSetupProps {
  onDismiss: () => void;
  onReadyChange?: (ready: boolean) => void;
}

const authorizationUrl = (value?: string): string | undefined => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
};

const loginExpired = (expiresAt: JimengCanvasSetupAction['expiresAt']): boolean => {
  if (expiresAt === undefined) return false;
  const time = typeof expiresAt === 'string' ? Date.parse(expiresAt) : expiresAt < 1e12 ? expiresAt * 1000 : expiresAt;
  return Number.isFinite(time) && Date.now() >= time;
};

type SetupAction = 'check' | 'install' | 'login' | { removeLegacy: JimengLegacyCliLocation };

export const JimengCanvasSetup: React.FC<JimengCanvasSetupProps> = ({ onDismiss, onReadyChange }) => {
  const [status, setStatus] = useState<JimengCanvasSetupStatus | null>(null);
  const [action, setAction] = useState<SetupAction | null>('check');
  const [login, setLogin] = useState<JimengCanvasSetupAction | null>(null);
  const [notice, setNotice] = useState<{ kind: 'error' | 'info'; message: string } | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const refresh = async (signal: AbortSignal): Promise<JimengCanvasSetupStatus> => {
    const next = await getJimengCanvasSetupStatus({ signal });
    signal.throwIfAborted();
    setStatus(next);
    return next;
  };

  const perform = async (nextAction: SetupAction): Promise<void> => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const signal = controller.signal;
    setAction(nextAction);
    setNotice(null);
    try {
      if (nextAction === 'install') {
        const result = await installJimengCanvasCli({ signal });
        signal.throwIfAborted();
        if (result.message) setNotice({ kind: 'info', message: result.message });
      }
      if (typeof nextAction === 'object') {
        const location = nextAction.removeLegacy;
        const result = await removeJimengLegacyCli({ location, signal });
        signal.throwIfAborted();
        setStatus(current => current && {
          ...current,
          legacyCliInstallations: current.legacyCliInstallations.filter(installation => installation.location !== location),
        });
        if (result.message) setNotice({ kind: 'info', message: result.message });
        return;
      }
      if (nextAction === 'login') {
        const result = await startJimengCanvasLogin({ signal });
        signal.throwIfAborted();
        setLogin(result);
        if (result.message) setNotice({ kind: 'info', message: result.message });
        if (result.loginSessionId) {
          while (true) {
            if (loginExpired(result.expiresAt)) throw new Error('Authorization expired. Start login again.');
            const check = await checkJimengCanvasLogin({ loginSessionId: result.loginSessionId, poll: 15, signal });
            signal.throwIfAborted();
            const next = await refresh(signal);
            if (next.authenticated) {
              setLogin(null);
              setNotice({ kind: 'info', message: 'Jimeng Canvas is signed in.' });
              break;
            }
            if (check.status === 'expired' || check.status === 'failed' || check.status === 'denied') {
              throw new Error(check.message || 'Authorization ended. Start login again.');
            }
            await workspaceDelay(2000, signal);
          }
        }
      }
      const next = await refresh(signal);
      onReadyChange?.(next.cliAvailable && next.authenticated);
    } catch (error) {
      if (!signal.aborted) {
        if (typeof nextAction !== 'object') {
          setStatus(null);
          onReadyChange?.(false);
        }
        setNotice({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      if (activeRequest.current === controller && !signal.aborted) setAction(null);
    }
  };

  useEffect(() => {
    void perform('check');
    return () => activeRequest.current?.abort();
  }, []);

  useEffect(() => {
    if (notice?.kind === 'error') noticeRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [notice]);

  const verificationUri = authorizationUrl(login?.verificationUri);
  const legacyCliInstallations = status?.legacyCliInstallations ?? [];
  const buttonClass = 'rounded-md border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45';

  return (
    <section aria-label="Jimeng Canvas setup" className={`fixed right-4 top-20 ${OVERLAY_LAYER_CLASS_NAMES.floatingPanel} max-h-[calc(100%-6rem)] w-[23rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-cyan-300/25 bg-gray-950/95 p-4 text-gray-100 shadow-2xl`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Jimeng Canvas CLI</h2>
          <p className="mt-1 text-xs text-gray-400">Image and video generation with credit approval.</p>
        </div>
        <button type="button" onClick={onDismiss} className={buttonClass}>Close</button>
      </div>
      <dl className="mt-4 space-y-2 text-xs">
        <div className="flex justify-between"><dt className="text-gray-400">Installation</dt><dd>{status ? status.cliAvailable ? `Installed${status.version ? ` · ${status.version}` : ''}` : 'Not installed' : action === 'check' ? 'Checking…' : 'Unavailable'}</dd></div>
        <div className="flex justify-between"><dt className="text-gray-400">Account</dt><dd>{status ? status.authenticated ? 'Signed in' : 'Sign-in required' : 'Unknown'}</dd></div>
      </dl>
      {(notice?.message || status?.message) && <p ref={noticeRef} role={notice?.kind === 'error' ? 'alert' : 'status'} className="mt-3 whitespace-pre-wrap rounded-md border border-white/10 bg-white/5 p-3 text-xs text-gray-200">{notice?.message || status?.message}</p>}
      {login && verificationUri && (
        <div className="mt-3 rounded-md border border-emerald-300/25 bg-emerald-300/10 p-3 text-xs text-emerald-100">
          {login.userCode && <p>Authorization code <code className="select-all font-semibold">{login.userCode}</code></p>}
          <a href={verificationUri} target="_blank" rel="noreferrer" className="mt-2 inline-block underline">Open authorization page</a>
          {action === 'login' && <p className="mt-2" role="status">Waiting for authorization…</p>}
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <button type="button" disabled={action !== null} onClick={() => void perform('install')} className={buttonClass}>{action === 'install' ? 'Installing…' : 'Install / update'}</button>
        <button type="button" disabled={action !== null || !status?.cliAvailable} onClick={() => void perform('login')} className={buttonClass}>{action === 'login' ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" disabled={action !== null} onClick={() => void perform('check')} className={buttonClass}>Refresh</button>
      </div>
      {legacyCliInstallations.length > 0 && (
        <JimengLegacyCliRemoval
          installations={legacyCliInstallations}
          buttonClass={buttonClass}
          busy={action !== null}
          onRemove={location => void perform({ removeLegacy: location })}
        />
      )}
    </section>
  );
};
