import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopAppIconModal } from '../DesktopAppIconModal';
import type { DesktopAppIconState } from '../../services/runtimeConfig';

const buildState = (selectedIconId = 'institute'): DesktopAppIconState => ({
  selectedIconId,
  supportsDockIcon: true,
  options: [
    {
      id: 'institute',
      label: 'The Institute',
      description: 'Original icon',
      previewDataUrl: 'data:image/png;base64,',
    },
  ],
});

const buildMultiIconState = (selectedIconId = 'institute'): DesktopAppIconState => ({
  selectedIconId,
  supportsDockIcon: true,
  options: [
    ...buildState(selectedIconId).options,
    {
      id: 'alternate',
      label: 'Alternate',
      description: 'Future icon',
      previewDataUrl: 'data:image/png;base64,',
    },
  ],
});

describe('DesktopAppIconModal', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete window.canvaBananaDesktop;
  });

  it('renders the current icon option and disables apply when unchanged', async () => {
    const getState = vi.fn().mockResolvedValue(buildState());
    window.canvaBananaDesktop = { appIcon: { getState } };

    render(<DesktopAppIconModal isOpen onClose={vi.fn()} />);

    const iconOption = await screen.findByRole('radio', { name: /the institute/i });
    const applyButton = screen.getByRole('button', { name: /apply icon/i });

    expect(iconOption.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Current')).toBeTruthy();
    expect(applyButton.hasAttribute('disabled')).toBe(true);
    expect(getState).toHaveBeenCalledTimes(1);
  });

  it('selects and applies a different icon through the desktop bridge', async () => {
    const getState = vi.fn().mockResolvedValue(buildMultiIconState());
    const setSelected = vi.fn().mockResolvedValue(buildMultiIconState('alternate'));
    window.canvaBananaDesktop = { appIcon: { getState, setSelected } };

    render(<DesktopAppIconModal isOpen onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole('radio', { name: /alternate/i }));
    fireEvent.click(screen.getByRole('button', { name: /apply icon/i }));

    await waitFor(() => expect(setSelected).toHaveBeenCalledWith('alternate'));
    expect(await screen.findByText('Icon changed.')).toBeTruthy();
    expect(screen.getByRole('radio', { name: /alternate/i }).getAttribute('aria-checked')).toBe('true');
  });

  it('clears cancelled draft selections before reloading on reopen', async () => {
    let resolveSecondState: (state: DesktopAppIconState) => void = () => undefined;
    const secondStatePromise = new Promise<DesktopAppIconState>((resolve) => {
      resolveSecondState = resolve; // Keep the second load pending while reopened UI renders.
    });
    const getState = vi.fn()
      .mockResolvedValueOnce(buildMultiIconState())
      .mockReturnValueOnce(secondStatePromise);
    window.canvaBananaDesktop = { appIcon: { getState } };

    const { rerender } = render(<DesktopAppIconModal isOpen onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole('radio', { name: /alternate/i }));
    expect(screen.getByRole('button', { name: /apply icon/i }).hasAttribute('disabled')).toBe(false);

    rerender(<DesktopAppIconModal isOpen={false} onClose={vi.fn()} />);
    rerender(<DesktopAppIconModal isOpen onClose={vi.fn()} />);

    expect(screen.queryByRole('radio', { name: /alternate/i })).toBeNull();
    expect(screen.getByRole('button', { name: /apply icon/i }).hasAttribute('disabled')).toBe(true);

    await act(async () => {
      resolveSecondState(buildMultiIconState()); // Finish reload after proving stale draft is hidden.
      await secondStatePromise;
    });

    expect(screen.getByRole('radio', { name: /the institute/i }).getAttribute('aria-checked')).toBe('true');
  });

  it('closes on Escape', async () => {
    const getState = vi.fn().mockResolvedValue(buildState());
    const onClose = vi.fn();
    window.canvaBananaDesktop = { appIcon: { getState } };

    render(<DesktopAppIconModal isOpen onClose={onClose} />);

    await screen.findByRole('dialog', { name: /change icon/i });
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
