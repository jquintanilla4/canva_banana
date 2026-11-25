import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopSettingsModal } from '../DesktopSettingsModal';
import type { DesktopSettingsKey, DesktopSettingsStatus } from '../../services/runtimeConfig';

const keys: DesktopSettingsKey[] = [
  'GEMINI_API_KEY',
  'FAL_API_KEY',
  'MOONSHOT_API_KEY',
  'OPENROUTER_API_KEY',
  'TOKENHUB_API_KEY',
  'TOKENHUB_BASE_URL',
  'ARK_API_KEY',
  'VOLCENGINE_ACCESS_KEY',
  'VOLCENGINE_SECRET_KEY',
  'TOS_BUCKET_NAME',
  'TOS_REGION',
  'JIMENG_CANVAS_CLI_PATH',
];

const optionalKeys: DesktopSettingsKey[] = ['JIMENG_CANVAS_CLI_PATH', 'OPENROUTER_API_KEY', 'TOKENHUB_API_KEY', 'TOKENHUB_BASE_URL'];

const buildStatus = (presentKeys: DesktopSettingsKey[] = []): DesktopSettingsStatus => ({
  configPath: '/Users/qa/Library/Application Support/The Institute/.env.local',
  fields: Object.fromEntries(keys.map(key => [key, {
    present: presentKeys.includes(key),
    required: !optionalKeys.includes(key),
    secret: key.endsWith('_KEY') || key.includes('API_KEY'),
  }])) as DesktopSettingsStatus['fields'],
  missingKeys: keys.filter(key => !optionalKeys.includes(key) && !presentKeys.includes(key)),
  isPackaged: true,
  serviceStatus: {
    secureBackend: { state: 'ready', url: 'http://localhost:8787' },
    pythonBackend: { state: 'ready', url: 'http://localhost:8000' },
  },
});

describe('DesktopSettingsModal', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete window.canvaBananaDesktop;
  });

  it('preserves saved secrets when their inputs are left blank', async () => {
    const saveSettings = vi.fn().mockResolvedValue(buildStatus(['GEMINI_API_KEY']));
    window.canvaBananaDesktop = { saveSettings };

    render(
      <DesktopSettingsModal
        isOpen
        onClose={vi.fn()}
        initialStatus={buildStatus(['GEMINI_API_KEY'])}
        onStatusChange={vi.fn()}
      />
    );

    expect(screen.getByRole('dialog', { name: /manage keys/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /close manage keys/i })).toBeTruthy();
    expect(screen.getByLabelText('Gemini API Key', { selector: 'input' }).getAttribute('placeholder')).toBe('Saved');

    fireEvent.click(screen.getByRole('button', { name: /apply settings/i }));

    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith({}));
  });

  it('sends only filled fields when applying settings', async () => {
    const saveSettings = vi.fn().mockResolvedValue(buildStatus(['GEMINI_API_KEY', 'FAL_API_KEY']));
    window.canvaBananaDesktop = { saveSettings };

    render(
      <DesktopSettingsModal
        isOpen
        onClose={vi.fn()}
        initialStatus={buildStatus(['GEMINI_API_KEY'])}
        onStatusChange={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('FAL API Key', { selector: 'input' }), { target: { value: ' fal-secret ' } });
    fireEvent.click(screen.getByRole('button', { name: /apply settings/i }));

    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith({ FAL_API_KEY: 'fal-secret' }));
  });

  it('shows the Jimeng Canvas CLI path only in manage mode', () => {
    render(
      <DesktopSettingsModal
        isOpen
        mode="onboarding"
        onClose={vi.fn()}
        initialStatus={buildStatus([])}
        onStatusChange={vi.fn()}
      />
    );

    expect(screen.queryByLabelText('Jimeng Canvas CLI Path', { selector: 'input' })).toBeNull();
    cleanup();

    render(
      <DesktopSettingsModal
        isOpen
        mode="manage"
        onClose={vi.fn()}
        initialStatus={buildStatus([])}
        onStatusChange={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: /advanced/i })).toBeTruthy();
    expect(screen.getByLabelText('Jimeng Canvas CLI Path', { selector: 'input' })).toBeTruthy();
  });

  it('allows the advanced Jimeng Canvas CLI path to be saved manually', async () => {
    const saveSettings = vi.fn().mockResolvedValue(buildStatus(['JIMENG_CANVAS_CLI_PATH']));
    window.canvaBananaDesktop = { saveSettings };

    render(
      <DesktopSettingsModal
        isOpen
        mode="manage"
        onClose={vi.fn()}
        initialStatus={buildStatus([])}
        onStatusChange={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('Jimeng Canvas CLI Path', { selector: 'input' }), { target: { value: ' /usr/local/bin/dreamina-canvas ' } });
    fireEvent.click(screen.getByRole('button', { name: /apply settings/i }));

    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith({ JIMENG_CANVAS_CLI_PATH: '/usr/local/bin/dreamina-canvas' }));
  });

  it('saves optional TokenHub credentials and advanced base URL settings', async () => {
    const saveSettings = vi.fn().mockResolvedValue(buildStatus(['TOKENHUB_API_KEY', 'TOKENHUB_BASE_URL']));
    window.canvaBananaDesktop = { saveSettings };

    render(
      <DesktopSettingsModal
        isOpen
        mode="manage"
        onClose={vi.fn()}
        initialStatus={buildStatus([])}
        onStatusChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText('TokenHub API Key', { selector: 'input' }).getAttribute('type')).toBe('password');
    fireEvent.change(screen.getByLabelText('TokenHub API Key', { selector: 'input' }), { target: { value: ' tokenhub-secret ' } });
    fireEvent.change(screen.getByLabelText('TokenHub Base URL', { selector: 'input' }), { target: { value: ' https://tokenhub.example/v1 ' } });
    fireEvent.click(screen.getByRole('button', { name: /apply settings/i }));

    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith({
      TOKENHUB_API_KEY: 'tokenhub-secret',
      TOKENHUB_BASE_URL: 'https://tokenhub.example/v1',
    }));
  });

  it('clears a saved field through the desktop bridge', async () => {
    const clearSettings = vi.fn().mockResolvedValue(buildStatus([]));
    window.canvaBananaDesktop = { clearSettings };

    render(
      <DesktopSettingsModal
        isOpen
        onClose={vi.fn()}
        initialStatus={buildStatus(['GEMINI_API_KEY'])}
        onStatusChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /clear gemini api key/i }));

    await waitFor(() => expect(clearSettings).toHaveBeenCalledWith(['GEMINI_API_KEY']));
  });
});
