import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID, SEEDANCE_2_VIDEO_MODEL_ID, WAN_27_VIDEO_MODEL_ID } from '../../services/modelConfig';
import type { CanvasImage, GenerationInputs } from '../../types';
import { useGenerationPromptBarTransfer } from '../useGenerationPromptBarTransfer';

const buildImage = (id: string, generation?: GenerationInputs): CanvasImage => ({
  id,
  element: document.createElement('img'),
  mediaType: 'image',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  naturalWidth: 100,
  naturalHeight: 100,
  file: new File(['image'], `${id}.png`, { type: 'image/png' }),
  ...(generation ? { metadata: { source: 'generated', generation } } : {}),
}); // Transfer resolution only needs normal canvas identity fields.

const buildHookArgs = (displayedImages: CanvasImage[]) => ({
  displayedImages,
  providerAvailability: { google: true, fal: true },
  applyGenerationSettings: vi.fn(() => true),
  selection: {
    setSelectedImageIds: vi.fn(),
    setReferenceImageIds: vi.fn(),
    setReferenceVideoIds: vi.fn(),
    setReferenceAudioIds: vi.fn(),
    setSeedanceReferenceOrderIds: vi.fn(),
    setElementImageIds: vi.fn(),
    setVideoLastFrameImageId: vi.fn(),
    setSourceVideoId: vi.fn(),
    setSourceAudioId: vi.fn(),
  },
  setApiProvider: vi.fn(),
  setPrompt: vi.fn(),
  setCameraSettings: vi.fn(),
  setActiveEmbeddedPromptBarId: vi.fn(),
  setSelectedVideoPromptAreaId: vi.fn(),
  setVideoNegativePromptForModel: vi.fn(),
  setWan27ImageNegativePrompt: vi.fn(),
  setKrea2StyleReferenceStrengths: vi.fn(),
  setToastMessage: vi.fn(),
  resetEditContext: vi.fn(),
}); // Tests override only the transfer channels they need to observe.

describe('useGenerationPromptBarTransfer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the newest toast visible for its full duration after a rapid second transfer', () => {
    vi.useFakeTimers();
    const generation: GenerationInputs = {
      kind: 'text_to_image',
      prompt: 'Restore the old image prompt',
      provider: 'fal',
      modelId: KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID,
      modelMode: 'image',
    };
    const displayedImages = [buildImage('output-a', generation), buildImage('output-b', generation)];
    const args = buildHookArgs(displayedImages);
    const { result } = renderHook(() => useGenerationPromptBarTransfer(args));

    act(() => result.current.handleMetadataToPromptBar('output-a'));
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    act(() => result.current.handleMetadataToPromptBar('output-b'));
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(args.setToastMessage).not.toHaveBeenCalledWith(null); // The first transfer's timer must not clear the second toast early.

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(args.setToastMessage).toHaveBeenCalledWith(null);
  });

  it('warns about an unsupported saved negative prompt while restoring everything else', () => {
    const generation: GenerationInputs = {
      kind: 'text_to_image',
      prompt: 'Restore the old image prompt',
      provider: 'fal',
      modelId: KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID,
      modelMode: 'image',
      primaryImageId: 'source-image',
      falOptions: { negativePrompt: 'Old unsupported negative prompt' },
    };
    const displayedImages = [buildImage('output-image', generation), buildImage('source-image')];
    const args = buildHookArgs(displayedImages);

    const { result } = renderHook(() => useGenerationPromptBarTransfer(args));

    act(() => result.current.handleMetadataToPromptBar('output-image'));

    expect(args.applyGenerationSettings).toHaveBeenCalledWith(generation);
    expect(args.selection.setSelectedImageIds).toHaveBeenCalledWith(['source-image']);
    expect(args.selection.setReferenceImageIds).toHaveBeenCalledWith([]);
    expect(args.setVideoNegativePromptForModel).not.toHaveBeenCalled();
    expect(args.setWan27ImageNegativePrompt).not.toHaveBeenCalled();
    expect(args.setToastMessage).toHaveBeenCalledWith(expect.stringContaining('saved negative prompt was not restored'));
    expect(result.current.promptFocusRequestToken).toBe(1);
  });

  it('clears live edit context before restoring a saved image edit', () => {
    const generation: GenerationInputs = {
      kind: 'image_edit',
      prompt: 'Restore this edit prompt',
      provider: 'fal',
      modelId: KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID,
      modelMode: 'image',
      primaryImageId: 'source-image',
    };
    const displayedImages = [buildImage('output-image', generation), buildImage('source-image')];
    const args = buildHookArgs(displayedImages);
    const { result } = renderHook(() => useGenerationPromptBarTransfer(args));

    act(() => result.current.handleMetadataToPromptBar('output-image'));

    expect(args.resetEditContext).toHaveBeenCalledOnce();
    expect(args.selection.setSelectedImageIds).toHaveBeenCalledWith(['source-image']);
  });

  it('leaves shared negative-prompt buckets alone for video models that never store one', () => {
    const generation: GenerationInputs = {
      kind: 'video',
      prompt: 'Restore this Seedance prompt',
      provider: 'fal',
      modelId: SEEDANCE_2_VIDEO_MODEL_ID,
      modelMode: 'video',
    };
    const displayedImages = [buildImage('output-video', generation)];
    const args = buildHookArgs(displayedImages);
    const { result } = renderHook(() => useGenerationPromptBarTransfer(args));

    act(() => result.current.handleMetadataToPromptBar('output-video'));

    expect(args.setVideoNegativePromptForModel).not.toHaveBeenCalled(); // Seedance owns no bucket, so Kling's must survive.
  });

  it('targets the restored video model when loading its negative prompt', () => {
    const generation: GenerationInputs = {
      kind: 'video',
      prompt: 'Restore this Wan prompt',
      provider: 'fal',
      modelId: WAN_27_VIDEO_MODEL_ID,
      modelMode: 'video',
      falOptions: { negativePrompt: 'No camera shake' },
    };
    const displayedImages = [buildImage('output-image', generation)];
    const args = buildHookArgs(displayedImages);
    const { result } = renderHook(() => useGenerationPromptBarTransfer(args));

    act(() => result.current.handleMetadataToPromptBar('output-image'));

    expect(args.setVideoNegativePromptForModel).toHaveBeenCalledWith(WAN_27_VIDEO_MODEL_ID, 'No camera shake');
  });
});
