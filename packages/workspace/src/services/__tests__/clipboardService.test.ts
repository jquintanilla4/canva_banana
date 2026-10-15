import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeClipboardText } from '../clipboardService';

afterEach(() => {
  delete window.canvaBananaDesktop;
  vi.restoreAllMocks();
});

describe('writeClipboardText', () => {
  it('uses the desktop clipboard bridge when available', async () => {
    const desktopWriteText = vi.fn().mockResolvedValue(true);
    const browserWriteText = vi.fn().mockResolvedValue(undefined);
    window.canvaBananaDesktop = { clipboard: { writeText: desktopWriteText } };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: browserWriteText },
    });

    await writeClipboardText('Generated prompt');

    expect(desktopWriteText).toHaveBeenCalledWith('Generated prompt');
    expect(browserWriteText).not.toHaveBeenCalled();
  });

  it('falls back to the browser clipboard outside desktop', async () => {
    const browserWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: browserWriteText },
    });

    await writeClipboardText('Web prompt');

    expect(browserWriteText).toHaveBeenCalledWith('Web prompt');
  });
});
