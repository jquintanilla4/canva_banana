import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GenerationCanvasNotifications } from '../GenerationCanvasNotifications';
import type { GenerationCanvasNotification } from '../../hooks/useGenerationCanvasNotifications';
import { SEEDREAM_55_VOLCENGINE_MODEL_ID } from '../../services/seedream55Config';

const buildNotification = (
  overrides: Partial<GenerationCanvasNotification> = {},
): GenerationCanvasNotification => ({
  id: 'notification-1',
  mediaIds: ['image-1'],
  mediaType: 'image',
  modelLabel: 'Test Model',
  createdAt: 1,
  ...overrides,
});

describe('GenerationCanvasNotifications', () => {
  afterEach(cleanup);

  it('shows the current blind alias for a completed Seedream job', () => {
    const notification = {
      ...buildNotification({ modelLabel: 'Seedream 5.5 (VE)' }), modelId: SEEDREAM_55_VOLCENGINE_MODEL_ID,
    };
    const props = { notifications: [notification], onActivate: vi.fn(), onDismiss: vi.fn() };
    const blindProps = { blindTestMapping: new Map([[SEEDREAM_55_VOLCENGINE_MODEL_ID, 'Swift Wolf']]) };
    const { rerender } = render(<GenerationCanvasNotifications {...props} {...blindProps} />);
    expect(screen.getByText('Swift Wolf')).not.toBeNull();
    expect(screen.queryByText('Seedream 5.5 (VE)')).toBeNull();
    rerender(<GenerationCanvasNotifications {...props} />);
    expect(screen.getByText('Seedream 5.5 (VE)')).not.toBeNull();
  });
  it('activates and dismisses the selected notification', () => {
    const imageNotification = buildNotification({
      id: 'notification-image',
      mediaIds: ['image-1', 'image-2'],
      modelLabel: 'Image Model',
    });
    const videoNotification = buildNotification({
      id: 'notification-video',
      mediaIds: ['video-1'],
      mediaType: 'video',
      modelLabel: 'Video Model',
    });
    const onActivate = vi.fn();
    const onDismiss = vi.fn();

    render(
      <GenerationCanvasNotifications
        notifications={[imageNotification, videoNotification]}
        onActivate={onActivate}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /2 images added to canvas/i }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss generation notification' })[1]);

    expect(onActivate).toHaveBeenCalledWith(imageNotification);
    expect(onDismiss).toHaveBeenCalledWith('notification-video');
  });
});
