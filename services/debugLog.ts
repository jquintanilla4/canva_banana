export type DebugLogDirection = 'outbound' | 'inbound' | 'info' | 'error';

export interface DebugLogEntry {
  id: string;
  timestamp: number;
  direction: DebugLogDirection;
  source: string;
  title: string;
  message?: string;
  data?: Record<string, unknown>;
}

export type DebugLogListener = (entries: DebugLogEntry[]) => void;

const MAX_ENTRIES = 200;
const entries: DebugLogEntry[] = [];
const listeners = new Set<DebugLogListener>();

const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const notifyListeners = () => {
  const snapshot = entries.slice();
  listeners.forEach(listener => {
    try {
      listener(snapshot);
    } catch (error) {
      console.error('Debug log listener error:', error);
    }
  });
};

export interface DebugLogInput {
  direction: DebugLogDirection;
  source: string;
  title: string;
  message?: string;
  data?: Record<string, unknown>;
}

export const addDebugLog = ({ direction, source, title, message, data }: DebugLogInput): DebugLogEntry => {
  const entry: DebugLogEntry = {
    id: generateId(),
    timestamp: Date.now(),
    direction,
    source,
    title,
    message,
    data,
  };

  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
  notifyListeners();
  return entry;
};

export const subscribeToDebugLogs = (listener: DebugLogListener): (() => void) => {
  listeners.add(listener);
  listener(entries.slice());
  return () => {
    listeners.delete(listener);
  };
};

export const getDebugLogs = (): DebugLogEntry[] => entries.slice();

export const clearDebugLogs = () => {
  if (entries.length === 0) {
    return;
  }
  entries.splice(0, entries.length);
  notifyListeners();
};
