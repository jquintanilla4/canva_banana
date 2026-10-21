import React from 'react';
import type { GenerationCanvasNotification } from '../hooks/useGenerationCanvasNotifications';
import { CrosshairIcon } from './Icons';

type GenerationCanvasNotificationsProps = {
  notifications: GenerationCanvasNotification[];
  onActivate: (notification: GenerationCanvasNotification) => void;
  onDismiss: (notificationId: string) => void;
};

const getNotificationTitle = (notification: GenerationCanvasNotification): string => {
  const count = notification.mediaIds.length;
  if (notification.mediaType === 'video') {
    return 'Video added to canvas';
  }
  return count === 1 ? 'Image added to canvas' : `${count} images added to canvas`;
};

export const GenerationCanvasNotifications: React.FC<GenerationCanvasNotificationsProps> = ({
  notifications,
  onActivate,
  onDismiss,
}) => {
  if (notifications.length === 0) {
    return null;
  }

  return (
    <aside
      className="pointer-events-none fixed right-4 top-24 z-40 w-80 max-w-[calc(100vw-2rem)]"
      aria-live="polite"
      aria-label="Generation notifications"
    >
      <ul className="space-y-2">
        {notifications.map(notification => (
          <li
            key={notification.id}
            className="pointer-events-auto relative overflow-hidden rounded-md border border-emerald-300/25 bg-gray-950/92 shadow-2xl shadow-black/40 backdrop-blur-md"
          >
            <button
              type="button"
              onClick={() => onActivate(notification)}
              className="flex w-full items-start gap-3 px-3 py-3 pr-9 text-left transition-colors hover:bg-emerald-300/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-400/14 text-emerald-200">
                <CrosshairIcon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-emerald-50">
                  {getNotificationTitle(notification)}
                </span>
                <span className="mt-1 block truncate text-xs text-gray-300">
                  {notification.modelLabel ?? 'Generation ready'}
                </span>
                <span className="mt-1 block text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-200/80">
                  Click to view
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => onDismiss(notification.id)}
              className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md text-lg leading-none text-gray-300 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
              aria-label="Dismiss generation notification"
            >
              &times;
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
};
