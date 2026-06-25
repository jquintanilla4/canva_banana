import React, { useEffect, useMemo, useState } from 'react';
import { CancelIcon, ConfirmIcon, DeleteIcon, RerunIcon } from './Icons';
import type { DesktopSettingsKey, DesktopSettingsPayload, DesktopSettingsStatus } from '../services/runtimeConfig';

type DesktopSettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialStatus: DesktopSettingsStatus | null;
  onStatusChange: (status: DesktopSettingsStatus) => void;
  mode?: 'onboarding' | 'manage';
};

type SettingField = {
  key: DesktopSettingsKey;
  label: string;
  secret: boolean;
  placeholder: string;
};

const PRIMARY_SETTING_FIELDS: SettingField[] = [
  { key: 'GEMINI_API_KEY', label: 'Gemini API Key', secret: true, placeholder: 'AIza...' },
  { key: 'FAL_API_KEY', label: 'FAL API Key', secret: true, placeholder: 'fal-key...' },
  { key: 'MOONSHOT_API_KEY', label: 'Moonshot API Key', secret: true, placeholder: 'sk-...' },
  { key: 'ARK_API_KEY', label: 'Ark API Key', secret: true, placeholder: 'ark-key...' },
  { key: 'VOLCENGINE_ACCESS_KEY', label: 'Volcengine Access Key', secret: true, placeholder: 'AK...' },
  { key: 'VOLCENGINE_SECRET_KEY', label: 'Volcengine Secret Key', secret: true, placeholder: 'SK...' },
  { key: 'TOS_BUCKET_NAME', label: 'TOS Bucket Name', secret: false, placeholder: 'seedance-assets' },
  { key: 'TOS_REGION', label: 'TOS Region', secret: false, placeholder: 'cn-beijing' },
];

const ADVANCED_SETTING_FIELDS: SettingField[] = [
  { key: 'JIMENG_CLI_PATH', label: 'Jimeng CLI Path', secret: false, placeholder: '/usr/local/bin/dreamina' },
];

const SETTING_FIELDS = [...PRIMARY_SETTING_FIELDS, ...ADVANCED_SETTING_FIELDS]; // Keep value state aware of every managed key.

const buildEmptyValues = (): Record<DesktopSettingsKey, string> => Object.fromEntries(
  SETTING_FIELDS.map(field => [field.key, '']),
) as Record<DesktopSettingsKey, string>;

const formatService = (status: DesktopSettingsStatus | null, service: 'secureBackend' | 'pythonBackend'): string => {
  const entry = status?.serviceStatus[service];
  if (!entry) {
    return 'Unknown';
  }
  return entry.error ? `${entry.state}: ${entry.error}` : entry.state;
};

export const DesktopSettingsModal: React.FC<DesktopSettingsModalProps> = ({
  isOpen,
  onClose,
  initialStatus,
  onStatusChange,
  mode = 'manage',
}) => {
  const [status, setStatus] = useState<DesktopSettingsStatus | null>(initialStatus);
  const [values, setValues] = useState<Record<DesktopSettingsKey, string>>(() => buildEmptyValues());
  const [isApplying, setIsApplying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStatus(initialStatus);
      setValues(buildEmptyValues()); // Saved values stay masked in the renderer.
      setMessage(null);
    }
  }, [initialStatus, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const missingCount = status?.missingKeys.length ?? 0;
  const showAdvancedSettings = mode === 'manage'; // Onboarding stays focused on required app keys.
  const savePayload = useMemo<DesktopSettingsPayload>(() => {
    const entries = SETTING_FIELDS
      .map(field => [field.key, values[field.key].trim()] as const)
      .filter(([, value]) => value.length > 0);
    return Object.fromEntries(entries) as DesktopSettingsPayload;
  }, [values]);

  if (!isOpen) {
    return null;
  }

  const updateStatus = (nextStatus: DesktopSettingsStatus) => {
    setStatus(nextStatus);
    onStatusChange(nextStatus);
  };

  const handleSave = async () => {
    if (!window.canvaBananaDesktop?.saveSettings) {
      setMessage('Desktop settings are unavailable.');
      return;
    }
    setIsApplying(true);
    setMessage(null);
    try {
      const nextStatus = await window.canvaBananaDesktop.saveSettings(savePayload);
      updateStatus(nextStatus);
      setValues(buildEmptyValues());
      setMessage('Settings applied. Reloading...');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleClear = async (key: DesktopSettingsKey) => {
    if (!window.canvaBananaDesktop?.clearSettings) {
      setMessage('Desktop settings are unavailable.');
      return;
    }
    setIsApplying(true);
    setMessage(null);
    try {
      const nextStatus = await window.canvaBananaDesktop.clearSettings([key]);
      updateStatus(nextStatus);
      setValues(prev => ({ ...prev, [key]: '' }));
      setMessage(`${key} cleared.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to clear setting.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleRestart = async () => {
    if (!window.canvaBananaDesktop?.restartServices) {
      setMessage('Desktop services are unavailable.');
      return;
    }
    setIsApplying(true);
    setMessage(null);
    try {
      const nextStatus = await window.canvaBananaDesktop.restartServices();
      updateStatus(nextStatus);
      setMessage('Services restarted.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to restart services.');
    } finally {
      setIsApplying(false);
    }
  };

  const renderField = (field: SettingField) => {
    const fieldStatus = status?.fields[field.key];
    const saved = fieldStatus?.present === true;
    const required = fieldStatus?.required === true;
    return (
      <div key={field.key} className="block rounded-md border border-white/10 bg-white/[0.03] p-3">
        <span className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-gray-200">
          <span>{field.label}</span>
          <span className={saved ? 'text-emerald-200' : required ? 'text-amber-200' : 'text-gray-500'}>
            {saved ? 'Saved' : required ? 'Required' : 'Optional'}
          </span>
        </span>
        <div className="flex gap-2">
          <input
            type={field.secret ? 'password' : 'text'}
            value={values[field.key]}
            onChange={event => setValues(prev => ({ ...prev, [field.key]: event.target.value }))}
            placeholder={saved ? 'Saved' : field.placeholder}
            aria-label={field.label}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-gray-500 focus:border-cyan-300/60"
          />
          <button
            type="button"
            onClick={() => handleClear(field.key)}
            disabled={isApplying || !saved}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-gray-300 transition-colors hover:bg-red-400/15 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={`Clear ${field.label}`}
          >
            <DeleteIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="desktop-settings-title"
        className="flex max-h-full w-full max-w-3xl flex-col rounded-lg border border-white/10 bg-gray-950 text-gray-100 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <h2 id="desktop-settings-title" className="text-base font-semibold text-white">Manage Keys</h2>
            <p className="mt-1 text-xs text-gray-400">{status?.configPath ?? 'Loading settings path...'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Close manage keys"
          >
            <CancelIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2.5 py-1 font-semibold ${missingCount === 0 ? 'bg-emerald-400/15 text-emerald-100' : 'bg-amber-300/15 text-amber-100'}`}>
              {missingCount === 0 ? 'All required settings saved' : `${missingCount} required missing`}
            </span>
            <span className="rounded-full bg-white/5 px-2.5 py-1 text-gray-300">Node {formatService(status, 'secureBackend')}</span>
            <span className="rounded-full bg-white/5 px-2.5 py-1 text-gray-300">Python {formatService(status, 'pythonBackend')}</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {PRIMARY_SETTING_FIELDS.map(renderField)}
          </div>

          {showAdvancedSettings && (
            <section className="mt-5 border-t border-white/10 pt-4" aria-labelledby="desktop-advanced-settings-title">
              <h3 id="desktop-advanced-settings-title" className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Advanced</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {ADVANCED_SETTING_FIELDS.map(renderField)}
              </div>
            </section>
          )}

          {message && (
            <p className="mt-4 rounded-md border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs text-cyan-100">
              {message}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={handleRestart}
            disabled={isApplying}
            className="flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-gray-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <RerunIcon className="h-3.5 w-3.5" />
            Restart Services
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isApplying}
            className="flex items-center justify-center gap-2 rounded-md border border-emerald-300/30 bg-emerald-300/16 px-3 py-2 text-sm font-semibold text-emerald-100 transition-colors hover:bg-emerald-300/25 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ConfirmIcon className="h-3.5 w-3.5" />
            {isApplying ? 'Applying' : 'Apply Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};
