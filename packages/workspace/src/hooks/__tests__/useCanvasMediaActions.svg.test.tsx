import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useCanvasMediaActions } from '../useCanvasMediaActions';
import { removeBackground } from '../../services/falService';
import { loadMediaFromBlob } from '../../services/mediaService';
import type { CanvasImage } from '../../types';
import { useCanvasHistory, type AppState } from '../useCanvasHistory';

vi.mock('../../services/falService', async () => ({ ...await vi.importActual<typeof import('../../services/falService')>('../../services/falService'), removeBackground: vi.fn() }));
vi.mock('../../services/mediaService', async () => ({ ...await vi.importActual<typeof import('../../services/mediaService')>('../../services/mediaService'), loadMediaFromBlob: vi.fn() }));
afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const image = (format: 'svg' | 'gif' = 'svg'): CanvasImage => ({ id: 'svg', mediaType: 'image', element: document.createElement('img'),
  file: format === 'gif' ? new File(['GIF89a'], 'vector.gif', { type: 'image/gif' }) : new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'vector.svg', { type: 'image/svg+xml' }),
  x: 20, y: 30, width: 100, height: 50, naturalWidth: 100, naturalHeight: 50, rotation: 0 });
const setup = (format: 'svg' | 'gif' = 'svg') => {
  const original = image(format);
  let state: AppState = { images: [original], paths: [], notes: [], videoPromptAreas: [], videoPromptBars: [] };
  const args = { images: state.images, displayedImages: state.images, hasSingleImageSelected: true, primaryImageId: original.id,
    selectedImageIds: [original.id], setState: vi.fn((update: (previous: AppState) => AppState) => { state = update(state); }),
    setSelectedImageIds: vi.fn(), setReferenceImageIds: vi.fn(), setTool: vi.fn(), setError: vi.fn(), setToastMessage: vi.fn(), setLiveImages: vi.fn(), handleCommit: vi.fn() };
  return { args, original, get state() { return state; } };
};
it.each(['svg', 'gif'] as const)('cancels %s background removal without busy, provider, history or source changes', async format => {
  const data = setup(format);
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  const { result } = renderHook(() => useCanvasMediaActions(data.args));
  await act(async () => result.current.handleBackgroundRemoval());
  expect(removeBackground).not.toHaveBeenCalled();
  expect(data.args.handleCommit).not.toHaveBeenCalled();
  expect(data.args.setState).not.toHaveBeenCalled();
  expect(data.state.images).toEqual([data.original]);
  expect(result.current.isRemovingBackground).toBe(false);
});
it.each(['svg', 'gif'] as const)('keeps the original %s and appends a derived PNG after confirmed background removal', async format => {
  const data = setup(format);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(removeBackground).mockResolvedValue({ imageBase64: 'cG5n' });
  vi.mocked(loadMediaFromBlob).mockResolvedValue(Object.assign(document.createElement('img'), { width: 100, height: 50 }));
  vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob(['png'], { type: 'image/png' }) })));
  const { result } = renderHook(() => useCanvasMediaActions(data.args));
  await act(async () => result.current.handleBackgroundRemoval());
  expect(data.state.images).toHaveLength(2);
  expect(data.state.images[0]).toBe(data.original);
  expect(data.state.images[1]).toMatchObject({ x: 152, y: 30, file: { type: 'image/png', name: 'vector-nobg.png' } });
  expect(data.args.handleCommit).toHaveBeenCalledOnce();
});
it.each((['svg', 'gif'] as const).flatMap(format => (['replacement', 'deleted', 'file-replaced', 'unmounted'] as const).map(change => ({ format, change }))))('discards a pending $format background result after the source is $change', async ({ format, change }) => {
  const data = setup(format);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  let complete: (response: { imageBase64: string }) => void = () => { throw new Error('Provider request did not start.'); };
  vi.mocked(removeBackground).mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  vi.mocked(loadMediaFromBlob).mockResolvedValue(Object.assign(document.createElement('img'), { width: 100, height: 50 }));
  vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob(['png'], { type: 'image/png' }) })));
  const { result, rerender, unmount } = renderHook(args => useCanvasMediaActions(args), { initialProps: data.args });
  let pending: Promise<void> | undefined;
  act(() => { pending = result.current.handleBackgroundRemoval(); });
  if (change === 'unmounted') unmount();
  else act(() => {
    const replacement = { ...image(), id: change === 'replacement' ? 'new-document' : data.original.id };
    data.args.setState(previous => ({ ...previous, images: change === 'deleted' ? [] : [replacement] }));
    rerender({ ...data.args, images: data.state.images, displayedImages: data.state.images });
  });
  const expectedImages = data.state.images;
  data.args.setState.mockClear();
  data.args.handleCommit.mockClear();
  await act(async () => { complete({ imageBase64: 'cG5n' }); await pending; });
  expect(data.state.images).toBe(expectedImages);
  expect(data.args.setState).not.toHaveBeenCalled();
  expect(data.args.handleCommit).not.toHaveBeenCalled();
  expect(data.args.setSelectedImageIds).not.toHaveBeenCalled();
  expect(data.args.setToastMessage).not.toHaveBeenCalled();
});
it('does not download when SVG format selection is canceled', async () => {
  const data = setup();
  const requestSvgExportFormat = vi.fn(async () => null);
  const { result } = renderHook(() => useCanvasMediaActions({ ...data.args, requestSvgExportFormat }));
  await act(async () => result.current.handleDownload());
  expect(requestSvgExportFormat).toHaveBeenCalledOnce();
  expect(data.args.setState).not.toHaveBeenCalled();
  expect(data.args.setToastMessage).not.toHaveBeenCalled();
  expect(result.current.downloadProgress).toBeNull();
});

it.each(['svg', 'gif'] as const)('preserves replacement content and selection when %s background decode completes in the same React batch', async format => {
  const original = image(format);
  const state = (images: CanvasImage[]): AppState => ({ images, paths: [], notes: [], videoPromptAreas: [], videoPromptBars: [] });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(removeBackground).mockResolvedValue({ imageBase64: 'cG5n' });
  let decode!: (element: Awaited<ReturnType<typeof loadMediaFromBlob>>) => void;
  let entered!: () => void;
  const decoded = new Promise<Awaited<ReturnType<typeof loadMediaFromBlob>>>(resolve => { decode = resolve; });
  const decoding = new Promise<void>(resolve => { entered = resolve; });
  vi.mocked(loadMediaFromBlob).mockImplementation(() => { entered(); return decoded; });
  vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob(['png'], { type: 'image/png' }) })));
  const { result } = renderHook(() => {
    const history = useCanvasHistory(state([original]));
    const [selectedImageIds, setSelectedImageIds] = useState([original.id]);
    const media = useCanvasMediaActions({ ...history, hasSingleImageSelected: true, primaryImageId: original.id,
      selectedImageIds, setSelectedImageIds, setReferenceImageIds: vi.fn(), setTool: vi.fn(), setError: vi.fn(), setToastMessage: vi.fn(), handleCommit: history.commit });
    return { history, media, selectedImageIds, setSelectedImageIds };
  });
  act(() => { result.current.history.setLiveNotes([{ id: 'old-note', text: 'Old document text' }]); });
  let pending: Promise<void> | undefined;
  await act(async () => { pending = result.current.media.handleBackgroundRemoval(); await decoding; });
  const replacement = { ...image(), id: 'new-document' };
  await act(async () => {
    result.current.history.resetHistory(state([replacement]));
    result.current.setSelectedImageIds([replacement.id]);
    decode(Object.assign(document.createElement('img'), { width: 100, height: 50 }));
    await pending;
  });
  expect(result.current.history.images).toEqual([replacement]);
  expect(result.current.history.notes).toEqual([]);
  expect(result.current.selectedImageIds).toEqual([replacement.id]);
});

it('asks before producing a GIF crop, retains the original and appends one PNG on confirmation', async () => {
  const data = setup('gif');
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['cropped'], { type: 'image/png' })));
  vi.mocked(loadMediaFromBlob).mockResolvedValue(Object.assign(document.createElement('img'), { width: 50, height: 25 }));
  const { result } = renderHook(() => useCanvasMediaActions(data.args));
  act(() => result.current.handleStartCrop(data.original.id));
  act(() => result.current.handleCropRectChange({ x: 10, y: 5, width: 50, height: 25 }));
  await act(async () => result.current.handleConfirmCrop());
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('first frame only'));
  expect(toBlob).not.toHaveBeenCalled();
  expect(data.args.handleCommit).not.toHaveBeenCalled();
  expect(data.args.setState).not.toHaveBeenCalled();
  expect(data.state.images).toEqual([data.original]);
  confirm.mockReturnValue(true);
  await act(async () => { await Promise.all([result.current.handleConfirmCrop(), result.current.handleConfirmCrop()]); });
  expect(toBlob).toHaveBeenCalledOnce();
  expect(data.state.images).toHaveLength(2);
  expect(data.state.images[0]).toBe(data.original);
  expect(data.state.images[1]).toMatchObject({ x: 152, y: 30, width: 50, height: 25, file: { type: 'image/png', name: 'vector-cropped.png' } });
  expect(data.state.images[1].id).not.toBe(data.original.id);
  expect(data.args.handleCommit).toHaveBeenCalledOnce();
});

it('preserves replacement content and selection when GIF crop decoding completes in the same React batch', async () => {
  const original = image('gif');
  const state = (images: CanvasImage[]): AppState => ({ images, paths: [], notes: [], videoPromptAreas: [], videoPromptBars: [] });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['crop'], { type: 'image/png' })));
  let decode: (element: Awaited<ReturnType<typeof loadMediaFromBlob>>) => void = () => {};
  let entered: () => void = () => {};
  const decoded = new Promise<Awaited<ReturnType<typeof loadMediaFromBlob>>>(resolve => { decode = resolve; });
  const decoding = new Promise<void>(resolve => { entered = resolve; });
  vi.mocked(loadMediaFromBlob).mockImplementation(() => { entered(); return decoded; });
  const { result } = renderHook(() => {
    const history = useCanvasHistory(state([original]));
    const [selectedImageIds, setSelectedImageIds] = useState([original.id]);
    const media = useCanvasMediaActions({ ...history, hasSingleImageSelected: true, primaryImageId: original.id,
      selectedImageIds, setSelectedImageIds, setReferenceImageIds: vi.fn(), setTool: vi.fn(), setError: vi.fn(), setToastMessage: vi.fn(), handleCommit: history.commit });
    return { history, media, selectedImageIds, setSelectedImageIds };
  });
  act(() => result.current.media.handleStartCrop(original.id));
  let pending: Promise<void> | undefined;
  await act(async () => { pending = result.current.media.handleConfirmCrop(); await decoding; });
  const replacement = { ...image('gif'), id: 'new-document' };
  await act(async () => {
    result.current.history.resetHistory(state([replacement]));
    result.current.setSelectedImageIds([replacement.id]);
    decode(Object.assign(document.createElement('img'), { width: 100, height: 50 }));
    await pending;
  });
  expect(result.current.history.images).toEqual([replacement]);
  expect(result.current.history.notes).toEqual([]);
  expect(result.current.selectedImageIds).toEqual([replacement.id]);
});
