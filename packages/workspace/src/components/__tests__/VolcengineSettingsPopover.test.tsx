import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VolcengineSettings } from '../../services/volcengineSettings';
import { CANVAS_INTERACTION_BOUNDARY_ATTRIBUTE } from '../../utils/canvasInteractionBoundary';
import { getPromptBarControlSignature, PromptBarModelControlList, type PromptBarVolcengineControl } from '../promptBarControls';
import { VolcengineSettingsPopover } from '../VolcengineSettingsPopover';

const renderSettings = (supportsDraft = true) => {
  const onSettingsChange = vi.fn();
  const Harness = () => {
    const [settings, setSettings] = useState<VolcengineSettings>({});
    return <VolcengineSettingsPopover id="ark-settings" settings={settings} supportsDraft={supportsDraft} assetMediaTypes={['image', 'video', 'audio']} disabled={false} onSettingsChange={next => { setSettings(next); onSettingsChange(next); }} />;
  };
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Ark advanced settings' }));
  return onSettingsChange;
};

describe('VolcengineSettingsPopover', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('offers draft only on supported models and updates all shared toggles', () => {
    const onSettingsChange = renderSettings();
    fireEvent.click(screen.getByRole('checkbox', { name: /Draft mode/ }));
    expect(onSettingsChange).toHaveBeenLastCalledWith({ draft: true });
    expect(screen.getByText(/Preview at 480p.*1080p or 4K/)).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: /Return last frame/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Web search/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Watermark' }));
    expect(onSettingsChange).toHaveBeenLastCalledWith({ draft: true, returnLastFrame: true, webSearch: true, watermark: true });
    cleanup();
    renderSettings(false);
    expect(screen.queryByRole('checkbox', { name: /Draft mode/ })).toBeNull();
  });

  it('validates priority and omits the unsupported Seed control', () => {
    const onSettingsChange = renderSettings();
    expect(screen.queryByRole('textbox', { name: 'Seed' })).toBeNull();
    const priority = screen.getByRole('textbox', { name: 'Priority' });
    fireEvent.change(priority, { target: { value: '0' } });
    expect(onSettingsChange).toHaveBeenLastCalledWith({ priority: 0 });
    fireEvent.change(priority, { target: { value: '9' } });
    expect(onSettingsChange).toHaveBeenLastCalledWith({ priority: 9 });
    const calls = onSettingsChange.mock.calls.length;
    fireEvent.change(priority, { target: { value: '10' } });
    expect(priority.getAttribute('aria-invalid')).toBe('true');
    expect(onSettingsChange.mock.calls.length).toBe(calls);
    fireEvent.change(priority, { target: { value: '' } });
    expect(onSettingsChange).toHaveBeenLastCalledWith({});
  });

  it('validates, normalizes, reorders, and removes reusable asset references', () => {
    const onSettingsChange = renderSettings();
    const input = screen.getByRole('textbox', { name: 'Ark asset ID' });
    fireEvent.change(input, { target: { value: 'https://invalid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert').textContent).toContain('valid Ark asset ID');
    expect(onSettingsChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'asset://first_id' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Ark asset media type' }), { target: { value: 'video' } });
    fireEvent.change(input, { target: { value: 'second-id' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSettingsChange).toHaveBeenLastCalledWith({ assets: [{ mediaType: 'image', assetId: 'first_id' }, { mediaType: 'video', assetId: 'second-id' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Move asset 2 up' }));
    expect(onSettingsChange).toHaveBeenLastCalledWith({ assets: [{ mediaType: 'video', assetId: 'second-id' }, { mediaType: 'image', assetId: 'first_id' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Remove asset 1' }));
    expect(onSettingsChange).toHaveBeenLastCalledWith({ assets: [{ mediaType: 'image', assetId: 'first_id' }] });
  });

  it('uses viewport placement and the canvas boundary for embedded prompt bars', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getBoundingClientRect(this: HTMLElement) {
      const dialog = this.getAttribute('role') === 'dialog';
      const left = dialog ? 0 : 100;
      const top = dialog ? 0 : 20;
      const width = dialog ? 320 : 120;
      const height = dialog ? 400 : 30;
      return { x: left, y: top, left, top, right: left + width, bottom: top + height, width, height, toJSON: () => ({}) };
    });
    renderSettings();
    const dialog = screen.getByRole('dialog', { name: 'Ark advanced settings' });
    await waitFor(() => expect(dialog.dataset.placement).toBe('bottom'));
    expect(dialog.style.top).toBe('62px');
    expect(dialog.getAttribute(CANVAS_INTERACTION_BOUNDARY_ATTRIBUTE)).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders through the generic control and includes model capabilities in its signature', () => {
    const control: PromptBarVolcengineControl = { kind: 'volcengine-settings', id: 'ark-settings', settings: {}, supportsDraft: false, assetMediaTypes: [], disabled: false, onSettingsChange: vi.fn() };
    render(<PromptBarModelControlList controls={[control]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ark advanced settings' }));
    expect(screen.queryByRole('combobox', { name: 'Ark asset media type' })).toBeNull();
    expect(getPromptBarControlSignature(control)).not.toBe(getPromptBarControlSignature({ ...control, supportsDraft: true }));
    expect(getPromptBarControlSignature(control)).not.toBe(getPromptBarControlSignature({ ...control, assetMediaTypes: ['image'] } satisfies PromptBarVolcengineControl));
  });
});
