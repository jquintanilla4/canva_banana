import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderSwitcher } from '../ProviderSwitcher';
import { ViewToolbar } from '../ViewToolbar';
import { FLOATING_EDGE_CONTROL_BOTTOM_OFFSET, FLOATING_EDGE_CONTROL_SIDE_OFFSET } from '../../utils/promptBarFooterLayout';

afterEach(() => {
  cleanup();
});

describe('Floating edge control layout', () => {
  it('anchors the provider switcher to the shared prompt bar baseline', () => {
    render(
      <ProviderSwitcher
        providers={['fal', 'google']}
        activeProvider="fal"
        labels={{ fal: 'Fal', google: 'Google' }}
        onSelect={vi.fn()}
      />
    );

    const root = screen.getByTestId('provider-switcher-root');

    expect(root.style.bottom).toBe(FLOATING_EDGE_CONTROL_BOTTOM_OFFSET);
    expect(root.style.left).toBe(FLOATING_EDGE_CONTROL_SIDE_OFFSET);
  });

  it('keeps the provider popout behavior while using the shared bottom offset', () => {
    render(
      <ProviderSwitcher
        providers={['fal', 'google']}
        activeProvider="fal"
        labels={{ fal: 'Fal', google: 'Google' }}
        onSelect={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cloud' }));

    expect(screen.getByRole('button', { name: 'FAL' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'GOOGLE' })).toBeTruthy();
    expect(screen.getByTestId('provider-switcher-root').style.bottom).toBe(FLOATING_EDGE_CONTROL_BOTTOM_OFFSET);
    expect(screen.getByTestId('provider-switcher-root').style.left).toBe(FLOATING_EDGE_CONTROL_SIDE_OFFSET);
  });

  it('anchors the view toolbar to the shared prompt bar baseline', () => {
    render(
      <ViewToolbar
        onZoomToFit={vi.fn()}
        disabled={false}
        metadataVisible={false}
        onToggleMetadata={vi.fn()}
        blindTestEnabled={false}
        openSourceAliasEnabled={false}
        onToggleBlindTest={vi.fn()}
      />
    );

    const root = screen.getByTestId('view-toolbar-root');

    expect(root.style.bottom).toBe(FLOATING_EDGE_CONTROL_BOTTOM_OFFSET);
    expect(root.style.right).toBe(FLOATING_EDGE_CONTROL_SIDE_OFFSET);
  });
});
