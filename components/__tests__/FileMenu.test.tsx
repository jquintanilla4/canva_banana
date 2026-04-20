import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileMenu } from '../FileMenu';

describe('FileMenu', () => {
  afterEach(() => {
    cleanup();
  });

  it('sizes the menu to its content instead of keeping a width floor', () => {
    render(
      <FileMenu
        isOpen
        onToggle={vi.fn()}
        onClose={vi.fn()}
        onImportSnapshot={vi.fn()}
        onExportSnapshot={vi.fn()}
        onOpenBackups={vi.fn()}
        autosaveEnabled
        onToggleAutosave={vi.fn()}
        showZoomLevelBadge
        onToggleZoomLevelBadge={vi.fn()}
        onOpenDebugLog={vi.fn()}
      />
    );

    const menu = screen.getByRole('menu');
    const zoomToggle = screen.getByRole('menuitemcheckbox', { name: /hide zoom level/i });

    expect(menu.classList.contains('inline-flex')).toBe(true);
    expect(menu.classList.contains('flex-col')).toBe(true);
    expect(menu.classList.contains('max-w-[calc(100vw-2rem)]')).toBe(true);
    expect(menu.classList.contains('min-w-44')).toBe(false);
    expect(menu.classList.contains('w-44')).toBe(false);
    expect(menu.classList.contains('w-fit')).toBe(false);
    expect(menu.classList.contains('w-max')).toBe(false);
    expect(zoomToggle.classList.contains('w-full')).toBe(false);
  });

  it('shows the zoom level toggle with the active label', () => {
    render(
      <FileMenu
        isOpen
        onToggle={vi.fn()}
        onClose={vi.fn()}
        onImportSnapshot={vi.fn()}
        onExportSnapshot={vi.fn()}
        onOpenBackups={vi.fn()}
        autosaveEnabled
        onToggleAutosave={vi.fn()}
        showZoomLevelBadge
        onToggleZoomLevelBadge={vi.fn()}
        onOpenDebugLog={vi.fn()}
      />
    );

    const zoomToggle = screen.getByRole('menuitemcheckbox', { name: /hide zoom level/i });

    expect(zoomToggle.getAttribute('aria-checked')).toBe('true');
    expect(zoomToggle.textContent).toContain('On');
  });

  it('fires the zoom toggle callback and swaps the menu copy when hidden', () => {
    const handleToggleZoomLevelBadge = vi.fn();

    render(
      <FileMenu
        isOpen
        onToggle={vi.fn()}
        onClose={vi.fn()}
        onImportSnapshot={vi.fn()}
        onExportSnapshot={vi.fn()}
        onOpenBackups={vi.fn()}
        autosaveEnabled
        onToggleAutosave={vi.fn()}
        showZoomLevelBadge={false}
        onToggleZoomLevelBadge={handleToggleZoomLevelBadge}
        onOpenDebugLog={vi.fn()}
      />
    );

    const zoomToggle = screen.getByRole('menuitemcheckbox', { name: /display zoom level/i });

    fireEvent.click(zoomToggle);

    expect(handleToggleZoomLevelBadge).toHaveBeenCalledTimes(1);
    expect(zoomToggle.getAttribute('aria-checked')).toBe('false');
    expect(zoomToggle.textContent).toContain('Off');
  });
});
