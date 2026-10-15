import { describe, expect, it, vi } from 'vitest';
import { writeClipboardText } from './clipboard-service.mjs';

describe('native clipboard writes', () => {
  it('reports success only after the native write completes', async () => {
    const pending = Promise.withResolvers();
    const clipboard = { writeText: vi.fn(() => pending.promise) };
    const completed = vi.fn();
    const result = writeClipboardText(clipboard, 'prompt').then(completed);

    await Promise.resolve();
    expect(clipboard.writeText).toHaveBeenCalledWith('prompt');
    expect(completed).not.toHaveBeenCalled();

    pending.resolve();
    await result;
    expect(completed).toHaveBeenCalledWith(true);
  });

  it('propagates native write failures to the caller', async () => {
    const error = new Error('Clipboard unavailable');
    const clipboard = { writeText: vi.fn().mockRejectedValue(error) };

    await expect(writeClipboardText(clipboard, 'prompt')).rejects.toBe(error);
  });

  it('rejects invalid text before calling the native clipboard', async () => {
    const clipboard = { writeText: vi.fn() };

    await expect(writeClipboardText(clipboard, undefined)).rejects.toThrow('must be a string');
    await expect(writeClipboardText(clipboard, 'x'.repeat(1_000_001))).rejects.toThrow('too large');
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });
});
