import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getActiveVolcengineSettings, getVolcengineAssetMentions, type VolcengineSettings } from '../../services/volcengineSettings';
import type { Seedance2Variant } from '../../types';
import { CANVAS_INTERACTION_BOUNDARY_ATTRIBUTE } from '../../utils/canvasInteractionBoundary';
import { getPromptBarControlSignature, PromptBarModelControlList, type PromptBarVolcengineControl } from '../promptBarControls';
import { VolcengineSettingsPopover } from '../VolcengineSettingsPopover';

const renderSettings = (supportsDraft = true, initialSettings: VolcengineSettings = {}, variant: Seedance2Variant = 'reference') => {
  const onSettingsChange = vi.fn();
  const Harness = () => {
    const [settings, setSettings] = useState(initialSettings);
    const activeSettings = getActiveVolcengineSettings('standard', variant, settings);
    const assetMentions = getVolcengineAssetMentions(activeSettings.assets, { image: 1, video: 0, audio: 0 });
    return <VolcengineSettingsPopover id="ark-settings" settings={settings} supportsDraft={supportsDraft} assetMentions={assetMentions} disabled={false} onSettingsChange={next => { setSettings(next); onSettingsChange(next); }} />;
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

  it('omits Priority and Seed controls', () => {
    renderSettings();
    expect(screen.queryByRole('textbox', { name: 'Priority' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Seed' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear saved Ark references' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset saved Priority' })).toBeNull();
  });

  it('hides the Ark asset editor and preserves saved references when changing settings', () => {
    const settings: VolcengineSettings = { assets: [
      { mediaType: 'image', assetId: 'first-image' },
      { mediaType: 'audio', assetId: 'saved-audio' },
      { mediaType: 'image', assetId: 'second-image' },
    ] };
    const onSettingsChange = renderSettings(true, settings);
    expect(screen.queryByRole('region', { name: 'Reusable Ark assets' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Ark asset ID' })).toBeNull();
    expect(screen.getByText('@Image2').nextElementSibling?.textContent).toBe('first-image');
    expect(screen.getByText('@Audio1').nextElementSibling?.textContent).toBe('saved-audio');
    expect(screen.getByText('@Image3').nextElementSibling?.textContent).toBe('second-image');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Watermark' }));
    expect(onSettingsChange).toHaveBeenLastCalledWith({ ...settings, watermark: true });
  });

  it('shows saved references that are inactive in Extend before clearing them', () => {
    const onSettingsChange = renderSettings(false, { assets: [
      { mediaType: 'video', assetId: 'saved-video' },
      { mediaType: 'image', assetId: 'saved-image' },
    ] }, 'extend');
    expect(screen.getByText('@Video1').nextElementSibling?.textContent).toBe('saved-video');
    expect(screen.getByText('Inactive image').nextElementSibling?.textContent).toBe('saved-image');
    expect(screen.queryByText('@Image2')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clear saved Ark references' }));
    expect(onSettingsChange).toHaveBeenLastCalledWith({});
  });

  const savedAssets: VolcengineSettings['assets'] = [{ mediaType: 'image', assetId: 'saved-image' }];

  it.each([
    { name: 'Reset saved Priority', remaining: { assets: savedAssets }, other: 'Clear saved Ark references' },
    { name: 'Clear saved Ark references', remaining: { priority: 0 }, other: 'Reset saved Priority' },
  ])('can independently use $name', ({ name, remaining, other }) => {
    const onSettingsChange = renderSettings(true, { assets: savedAssets, priority: 0, watermark: true });
    fireEvent.click(screen.getByRole('button', { name }));
    expect(onSettingsChange).toHaveBeenLastCalledWith({ ...remaining, watermark: true });
    const advancedButton = screen.getByRole('button', { name: 'Ark advanced settings' });
    expect(document.activeElement).toBe(advancedButton);
    fireEvent.click(advancedButton);
    expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.getByRole('button', { name: other })).toBeTruthy();
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
    const control: PromptBarVolcengineControl = { kind: 'volcengine-settings', id: 'ark-settings', settings: {}, supportsDraft: false, disabled: false, onSettingsChange: vi.fn() };
    render(<PromptBarModelControlList controls={[control]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ark advanced settings' }));
    expect(screen.getByRole('dialog', { name: 'Ark advanced settings' })).toBeTruthy();
    expect(getPromptBarControlSignature(control)).not.toBe(getPromptBarControlSignature({ ...control, supportsDraft: true }));
  });
});
