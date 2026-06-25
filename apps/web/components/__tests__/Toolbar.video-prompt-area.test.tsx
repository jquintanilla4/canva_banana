import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toolbar } from '../Toolbar';
import { Tool } from '../../types';
import { cloneCameraSelection, EMPTY_CAMERA_SELECTION } from '../../utils/cameraSettings';

const buildToolbarProps = (overrides: Partial<ComponentProps<typeof Toolbar>> = {}): ComponentProps<typeof Toolbar> => ({
  activeTool: Tool.SELECTION,
  onToolChange: vi.fn(),
  isVideoPromptAreaToolEnabled: true,
  appMode: 'CANVAS',
  onModeChange: vi.fn(),
  brushSize: 20,
  eraserSize: 20,
  onBrushSizeChange: vi.fn(),
  onEraserSizeChange: vi.fn(),
  brushColor: '#ff0000',
  onBrushColorChange: vi.fn(),
  onClear: vi.fn(),
  hasClearablePaths: false,
  onUploadClick: vi.fn(),
  onUndo: vi.fn(),
  onRedo: vi.fn(),
  canUndo: false,
  canRedo: false,
  onDownload: vi.fn(),
  isImageSelected: false,
  isObjectSelected: false,
  onDelete: vi.fn(),
  onRemoveBackground: vi.fn(),
  isBackgroundRemovalDisabled: true,
  isBackgroundRemovalLoading: false,
  onResize: vi.fn(),
  isResizeDisabled: true,
  isAnnotateModeDisabled: false,
  isRecording: false,
  onRecordToggle: vi.fn(),
  cameraSettings: cloneCameraSelection(EMPTY_CAMERA_SELECTION),
  onCameraSettingsChange: vi.fn(),
  cameraSettingsEnabled: false,
  ...overrides,
});

describe('Toolbar video prompt area tool', () => {
  it('disables the video prompt area button when the current model is not a video model', () => {
    render(<Toolbar {...buildToolbarProps({ isVideoPromptAreaToolEnabled: false })} />);

    const button = screen.getByRole('button', {
      name: 'Video Prompt Area (G) • Switch to a video model to create video prompt areas',
    });

    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute('title')).toBe('Video Prompt Area (G) • Switch to a video model to create video prompt areas');
  });

  it('keeps the video prompt area button clickable when the current model is a video model', () => {
    const onToolChange = vi.fn();
    render(<Toolbar {...buildToolbarProps({ isVideoPromptAreaToolEnabled: true, onToolChange })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Video Prompt Area (G)' }));

    expect(onToolChange).toHaveBeenCalledWith(Tool.VIDEO_PROMPT_AREA);
  });
});
