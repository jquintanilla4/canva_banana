import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GenerationCanvasNotifications } from '../GenerationCanvasNotifications';
import type { GenerationCanvasNotification } from '../../hooks/useGenerationCanvasNotifications';

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
