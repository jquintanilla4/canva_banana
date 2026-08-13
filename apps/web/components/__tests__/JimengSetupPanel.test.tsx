import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JimengSetupPanel } from '../JimengSetupPanel';

const renderPanel = () => render(
  <JimengSetupPanel
    status={null}
    isChecking={false}
    isInstalling={false}
    isStartingLogin={false}
    sessionId={0}
    onInstall={vi.fn()}
    onLogin={vi.fn()}
    onCheckLogin={vi.fn()}
    onSessionIdChange={vi.fn()}
    onRefresh={vi.fn()}
    onDismiss={vi.fn()}
  />
); // Render the initial unknown setup state.

describe('JimengSetupPanel', () => {
  it('does not show unknown backend status as connected', () => {
    renderPanel();

    expect(screen.getByText('Checking')).toBeTruthy();
    expect(screen.getByRole('button', { name: /install/i }).hasAttribute('disabled')).toBe(true);
  });

  it('shows OAuth Device Flow material without exposing a device code', () => {
    render(
      <JimengSetupPanel
        status={{
          ready: false,
          backendReachable: true,
          cliAvailable: true,
          authenticated: false,
          loginSessionId: 'opaque-session',
          verificationUri: 'https://example.com/authorize',
          userCode: 'ABCD-EFGH',
        }}
        isChecking={false}
        isInstalling={false}
        isStartingLogin={false}
        sessionId={42}
        onInstall={vi.fn()}
        onLogin={vi.fn()}
        onCheckLogin={vi.fn()}
        onSessionIdChange={vi.fn()}
        onRefresh={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText('ABCD-EFGH')).toBeTruthy();
    expect(screen.getByRole('link', { name: /open authorization page/i }).getAttribute('href')).toBe('https://example.com/authorize');
    expect(screen.queryByText('opaque-session')).toBeNull();
  });
});
