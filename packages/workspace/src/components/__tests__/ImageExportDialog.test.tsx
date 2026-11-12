import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ImageExportDialog } from '../ImageExportDialog';
import { useBlockingOverlays } from '../../hooks/useBlockingOverlays';

afterEach(cleanup);
it('defaults to SVG, traps focus, submits once and restores focus', () => {
  const prior = document.createElement('button');
  document.body.append(prior); prior.focus();
  const onResolve = vi.fn();
  const view = render(<ImageExportDialog onResolve={onResolve} />);
  const svg = screen.getByLabelText('SVG at canvas size (keeps vectors)');
  expect(document.activeElement).toBe(svg);
  fireEvent.keyDown(svg, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Download' }));
  fireEvent.submit(screen.getByRole('dialog'));
  fireEvent.submit(screen.getByRole('dialog'));
  expect(onResolve).toHaveBeenCalledExactlyOnceWith('image/svg+xml');
  view.unmount(); expect(document.activeElement).toBe(prior); prior.remove();
});
it.each(['Escape', 'backdrop', 'cancel'])('cancels through %s', method => {
  const onResolve = vi.fn();
  render(<ImageExportDialog onResolve={onResolve} />);
  if (method === 'Escape') fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  else if (method === 'backdrop') fireEvent.click(screen.getByRole('dialog').parentElement!);
  else fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onResolve).toHaveBeenCalledExactlyOnceWith(null);
});
it('settles pending choices when another overlay opens, a request replaces it, or the host unmounts', async () => {
  const { result, unmount } = renderHook(() => useBlockingOverlays());
  let first!: ReturnType<typeof result.current.requestSvgExportFormat>;
  act(() => { first = result.current.requestSvgExportFormat(); });
  expect(result.current.hasBlockingOverlay).toBe(true);
  act(() => result.current.openAppOwnedBlockingOverlay('backups'));
  await expect(first).resolves.toBeNull();
  let second!: typeof first;
  let third!: typeof first;
  act(() => { second = result.current.requestSvgExportFormat(); third = result.current.requestSvgExportFormat(); });
  await expect(second).resolves.toBeNull();
  unmount(); await expect(third).resolves.toBeNull();
});
