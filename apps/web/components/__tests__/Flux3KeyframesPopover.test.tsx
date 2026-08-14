import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CANVAS_INTERACTION_BOUNDARY_ATTRIBUTE } from '../../utils/canvasInteractionBoundary';
import { Flux3KeyframesPopover } from '../Flux3KeyframesPopover';

const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
  x: left, y: top, left, top, right: left + width, bottom: top + height, width, height, toJSON: () => ({}),
});

describe('Flux3KeyframesPopover', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('opens below the button when there is not enough room above it', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getBoundingClientRect() {
      if (this.getAttribute('aria-label') === 'Edit Flux 3 keyframe timing') return rect(100, 20, 120, 30);
      if (this.getAttribute('role') === 'dialog') return rect(0, 0, 288, 300);
      return rect(0, 0, 0, 0);
    });

    render(
      <Flux3KeyframesPopover
        id="keyframes"
        label="Keyframes 1"
        ariaLabel="Edit Flux 3 keyframe timing"
        entries={[{ imageId: 'image-1', timestampSeconds: 0 }]}
        durationSeconds={5}
        disabled={false}
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit Flux 3 keyframe timing' }));

    const dialog = screen.getByRole('dialog', { name: 'Flux 3 keyframe timing' });
    await waitFor(() => expect(dialog.dataset.placement).toBe('bottom'));
    expect(dialog.style.top).toBe('62px');
    expect(dialog.getAttribute(CANVAS_INTERACTION_BOUNDARY_ATTRIBUTE)).toBe('true');
  });

  it('keeps a trailing decimal while typing a fractional timestamp', async () => {
    const onChange = vi.fn();
    render(
      <Flux3KeyframesPopover
        id="keyframes"
        label="Keyframes 1"
        ariaLabel="Edit Flux 3 keyframe timing"
        entries={[{ imageId: 'image-1', timestampSeconds: 2 }]}
        durationSeconds={5}
        disabled={false}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit Flux 3 keyframe timing' }));
    const input = screen.getByLabelText('@Image1 timestamp in seconds');

    fireEvent.change(input, { target: { value: '2.' } });
    expect((input as HTMLInputElement).value).toBe('2.');
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '2.5' } });
    expect((input as HTMLInputElement).value).toBe('2.5');
    expect(onChange).toHaveBeenCalledWith('image-1', 2.5);
  });

  it('ignores empty timing input and clamps the committed value on blur', async () => {
    const onChange = vi.fn();
    render(
      <Flux3KeyframesPopover
        id="keyframes"
        label="Keyframes 1"
        ariaLabel="Edit Flux 3 keyframe timing"
        entries={[{ imageId: 'image-1', timestampSeconds: 1 }]}
        durationSeconds={5}
        disabled={false}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit Flux 3 keyframe timing' }));
    const input = screen.getByLabelText('@Image1 timestamp in seconds');

    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '9' } });
    expect(onChange).toHaveBeenCalledWith('image-1', 9);
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith('image-1', 5);
  });
});
