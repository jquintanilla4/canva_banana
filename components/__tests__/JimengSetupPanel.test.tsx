import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JimengSetupPanel } from '../JimengSetupPanel';

const renderPanel = () => render(
  <JimengSetupPanel
    status={null}
    isChecking={false}
    isInstalling={false}
    isStartingLogin={false}
    onInstall={vi.fn()}
    onLogin={vi.fn()}
    onDebugLogin={vi.fn()}
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
});
