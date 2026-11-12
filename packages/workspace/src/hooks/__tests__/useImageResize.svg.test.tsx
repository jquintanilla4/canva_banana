import { useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useImageResize } from '../useImageResize';
import type { AppState } from '../useCanvasHistory';
import type { CanvasImage } from '../../types';

afterEach(() => vi.restoreAllMocks());
it.each(['svg', 'gif'] as const)('resizes a %s around its center without reading or replacing the source or element', async format => {
  const image: CanvasImage = { id: 'vector', element: document.createElement('img'), mediaType: 'image',
    file: new File(['source-bytes'], `vector.${format}`, { type: format === 'gif' ? 'image/gif' : 'image/svg+xml' }),
    x: 20, y: 30, width: 100, height: 80, naturalWidth: 100, naturalHeight: 80, rotation: 0.5 };
  const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob');
  const handleCommit = vi.fn();
  const { result } = renderHook(() => {
    const [state, setState] = useState<AppState>({ images: [image], paths: [], notes: [], videoPromptAreas: [], videoPromptBars: [] });
    const resize = useImageResize({ images: state.images, selectedImageIds: ['vector'], setState, handleCommit, setError: vi.fn(), setToastMessage: vi.fn() });
    return { resize, state };
  });
  act(() => result.current.resize.open());
  act(() => result.current.resize.setKeepAspect(false));
  act(() => { result.current.resize.setWidth('400'); result.current.resize.setHeight('120'); });
  await act(async () => result.current.resize.confirm());
  expect(result.current.state.images[0]).toMatchObject({ width: 400, height: 120, x: -130, y: 10, rotation: 0.5 });
  expect(result.current.state.images[0].file).toBe(image.file);
  expect(result.current.state.images[0].element).toBe(image.element);
  expect(toBlob).not.toHaveBeenCalled();
  expect(handleCommit).toHaveBeenCalledOnce();
});
