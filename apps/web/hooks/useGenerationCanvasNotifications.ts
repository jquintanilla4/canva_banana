import { useCallback, useEffect, useRef, useState } from 'react';
import type { GenerationPlacedPayload } from '../types';

export const GENERATION_CANVAS_NOTIFICATION_DURATION_MS = 60_000;

export type GenerationCanvasNotification = GenerationPlacedPayload & {
  id: string;
  createdAt: number;
};

type UseGenerationCanvasNotificationsResult = {
  notifications: GenerationCanvasNotification[];
  notifyGenerationPlaced: (payload: GenerationPlacedPayload) => void;
  dismissGenerationNotification: (notificationId: string) => void;
};

const createNotificationId = (): string => crypto.randomUUID(); // Match the app's existing id source.

export const useGenerationCanvasNotifications = (): UseGenerationCanvasNotificationsResult => {
  const [notifications, setNotifications] = useState<GenerationCanvasNotification[]>([]);
  const timeoutIdsRef = useRef<Map<string, number>>(new Map());

  const clearNotificationTimer = useCallback((notificationId: string) => {
    const timeoutId = timeoutIdsRef.current.get(notificationId);
    if (timeoutId === undefined) {
      return;
    }
    window.clearTimeout(timeoutId);
    timeoutIdsRef.current.delete(notificationId);
  }, []);

  const dismissGenerationNotification = useCallback((notificationId: string) => {
    clearNotificationTimer(notificationId);
    setNotifications(prev => prev.filter(notification => notification.id !== notificationId));
  }, [clearNotificationTimer]);

  const notifyGenerationPlaced = useCallback((payload: GenerationPlacedPayload) => {
    const notification: GenerationCanvasNotification = {
      ...payload,
      id: createNotificationId(),
      createdAt: Date.now(),
    };
    const timeoutId = window.setTimeout(() => {
      timeoutIdsRef.current.delete(notification.id);
      setNotifications(prev => prev.filter(candidate => candidate.id !== notification.id));
    }, GENERATION_CANVAS_NOTIFICATION_DURATION_MS);
    timeoutIdsRef.current.set(notification.id, timeoutId);
    setNotifications(prev => [notification, ...prev]);
  }, []);

  useEffect(() => {
    return () => {
      timeoutIdsRef.current.forEach(timeoutId => window.clearTimeout(timeoutId));
      timeoutIdsRef.current.clear();
    };
  }, []);

  return {
    notifications,
    notifyGenerationPlaced,
    dismissGenerationNotification,
  };
};
