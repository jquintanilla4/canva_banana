import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Canvas } from '../Canvas';
import { Tool, type CanvasImage } from '../../types';

type CanvasProps = ComponentProps<typeof Canvas>;

const buildCanvasProps = (overrides: Partial<CanvasProps> = {}): CanvasProps => ({
  images: [],
  onImagesChange: vi.fn(),
  notes: [],
  onNotesChange: vi.fn(),
  videoPromptAreas: [],
  onVideoPromptAreasChange: vi.fn(),
  videoPromptBars: [],
  onVideoPromptBarsChange: vi.fn(),
  selectedVideoPromptAreaId: null,
  onVideoPromptAreaSelect: vi.fn(),
  videoPromptAreaMemberships: {},
  tool: Tool.SELECTION,
  appMode: 'CANVAS',
  paths: [],
  onPathsChange: vi.fn(),
  brushSize: 10,
  eraserSize: 10,
  brushColor: '#000000',
  selectedImageIds: [],
  selectedNoteIds: [],
  referenceImageIds: [],
  referenceVideoIds: [],
  referenceAudioIds: [],
  referenceImageOrderLabels: null,
  disabledMediaIds: [],
  elementImageIds: [],
  elementImageOrderLabels: null,
  videoLastFrameImageId: null,
  sourceVideoId: null,
  tailSelectionEnabled: false,
  isKlingO3VideoInputMode: false,
  isKlingO3ReferenceMode: false,
  isSeedance15FflfMode: false,
  isKlingV3ControlVideoInputMode: false,
  isVeo31ExtendMode: false,
  isWanAnimateVideoInputMode: false,
  isWan27VideoMode: false,
  onError: vi.fn(),
  onMediaPlaybackRejected: vi.fn(),
  onImageSelect: vi.fn(),
  onNoteSelect: vi.fn(),
  zoomToFitTrigger: 0,
  zoomToSelectionTrigger: 0,
  zoomInTrigger: 0,
  zoomOutTrigger: 0,
  onFilesDrop: vi.fn(),
  editingNoteId: null,
  onNoteDoubleClick: vi.fn(),
  onNoteTextChange: vi.fn(),
  onNoteEditEnd: vi.fn(),
  onImageOrderChange: vi.fn(),
  isImageOverlapping: false,
  canMoveUp: false,
  canMoveDown: false,
  cropMode: null,
  onCropRectChange: vi.fn(),
  onStartCrop: vi.fn(),
  onConfirmCrop: vi.fn(),
  onCancelCrop: vi.fn(),
  onNoteCopy: vi.fn(),
  onNoteDuplicate: vi.fn(),
  onNoteFontSizeChange: vi.fn(),
  onNoteColorChange: vi.fn(),
  onImagePromptCopy: vi.fn(),
  onImageDuplicate: vi.fn(),
  onRerunGeneration: vi.fn(),
  showMetadataOverlay: false,
  transformMode: null,
  onStartTransform: vi.fn(),
  onExitTransform: vi.fn(),
  isLoading: false,
  onVideoPromptBarFocus: vi.fn(),
  onVideoPromptBarBlur: vi.fn(),
  onVideoPromptBarUpdate: vi.fn(),
  onVideoPromptBarSubmit: vi.fn(),
  buildVideoPromptBarControls: vi.fn(() => []),
  embeddedVideoPromptBarModelOptions: [{ value: 'volcengine/seedance-2', label: 'Seedance 2' }],
  onCommit: vi.fn(),
  ...overrides,
});

const dragCanvas = (root: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }, button = 0) => {
  fireEvent.mouseDown(root, { clientX: from.x, clientY: from.y, button }); // Start the gesture from the canvas root.
  fireEvent.mouseMove(root, { clientX: to.x, clientY: to.y, button }); // Move the pointer to update pan state.
  fireEvent.mouseUp(root, { clientX: to.x, clientY: to.y, button }); // Finish the gesture and flush commit logic.
};

const buildImage = (id = 'image-1'): CanvasImage => ({
  id,
  element: document.createElement('img'),
  mediaType: 'image',
  x: 10,
  y: 10,
  width: 100,
  height: 80,
  rotation: 0,
  naturalWidth: 100,
  naturalHeight: 80,
  file: new File(['image'], `${id}.png`, { type: 'image/png' }),
});

const buildVideo = (id = 'video-1'): CanvasImage => {
  const video = document.createElement('video');
  video.play = vi.fn().mockResolvedValue(undefined); // Let the test verify restored playback without real browser media.
  video.pause = vi.fn(); // Let the test verify cleanup without real browser playback.
  video.muted = false;
  video.volume = 1;

  return {
    id,
    element: video,
    mediaType: 'video',
    x: 10,
    y: 10,
    width: 100,
    height: 80,
    rotation: 0,
    naturalWidth: 100,
    naturalHeight: 80,
    file: new File(['video'], `${id}.mp4`, { type: 'video/mp4' }),
    isPlaying: true,
    hasAudio: true,
  };
};

const buildAudio = (id = 'audio-1'): CanvasImage => {
  const waveform = document.createElement('img');
  const audio = document.createElement('audio');
  audio.play = vi.fn().mockResolvedValue(undefined); // Let tests control browser playback policy.
  audio.pause = vi.fn(); // Let tests verify cleanup without real browser playback.

  return {
    id,
    element: waveform,
    mediaType: 'audio',
    x: 10,
    y: 10,
    width: 100,
    height: 40,
    rotation: 0,
    naturalWidth: 100,
    naturalHeight: 40,
    file: new File(['audio'], `${id}.wav`, { type: 'audio/wav' }),
    isPlaying: true,
    hasAudio: true,
    audioElement: audio,
    audioDuration: 1,
    currentPlaybackTime: 0,
  };
};

describe('Canvas selection temporary pan', () => {
  it('enables prompt copy from saved generation metadata', () => {
    const onImagePromptCopy = vi.fn();
    const generatedImage = {
      ...buildImage('generated-1'),
      metadata: {
        source: 'generated' as const,
        generation: {
          kind: 'text_to_image' as const,
          prompt: 'A saved generation prompt',
          provider: 'fal' as const,
        },
      },
    };

    render(<Canvas {...buildCanvasProps({
      images: [generatedImage],
      selectedImageIds: ['generated-1'],
      onImagePromptCopy,
    })} />);

    const copyButton = screen.getByTitle('Copy Generation Prompt') as HTMLButtonElement;
    fireEvent.click(copyButton);

    expect(copyButton.disabled).toBe(false);
    expect(onImagePromptCopy).toHaveBeenCalledWith('generated-1');
  });

  it('temporarily pans while space is held and returns to selection on keyup', () => {
    const { container } = render(<Canvas {...buildCanvasProps()} />);
    const root = container.querySelector('[data-canvas-root="true"]') as HTMLElement;

    root.focus();
    expect(document.activeElement).toBe(root);
    expect(root.style.backgroundPosition).toBe('0px 0px');

    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    dragCanvas(root, { x: 100, y: 120 }, { x: 150, y: 185 });

    expect(root.style.backgroundPosition).toBe('50px 65px');

    fireEvent.keyUp(window, { key: ' ', code: 'Space' });
    dragCanvas(root, { x: 200, y: 220 }, { x: 260, y: 300 });

    expect(root.style.backgroundPosition).toBe('50px 65px');
  });

  it('does not activate temporary pan when an embedded prompt bar textarea owns focus', () => {
    const { container } = render(
      <Canvas
        {...buildCanvasProps({
          videoPromptAreas: [{
            id: 'area-1',
            sequence: 1,
            label: 'Video prompt area 01',
            x: 40,
            y: 60,
            width: 920,
            height: 420,
            promptBarId: 'bar-1',
            orderedMediaIds: [],
          }],
          videoPromptBars: [{
            id: 'bar-1',
            assignedAreaId: 'area-1',
            prompt: 'Describe this shot',
            negativePrompt: '',
            seedance2Variant: 'reference',
            seedance2AspectRatio: '16:9',
            seedance2Resolution: '720p',
            seedance2Duration: '5',
            seedance2GenerateAudio: false,
            seedance2CameraFixed: false,
            x: 80,
            y: 240,
            width: 920,
            height: 190,
          }],
          videoPromptAreaMemberships: {
            'area-1': {
              orderedMediaIds: [],
              acceptedImageIds: [],
              acceptedVideoIds: [],
              acceptedAudioIds: [],
              ignoredMediaIds: [],
              orderLabels: {},
            },
          },
        })}
      />,
    );

    const root = container.querySelector('[data-canvas-root="true"]') as HTMLElement;
    const promptInput = container.querySelector('textarea[aria-label="Prompt input"]') as HTMLTextAreaElement;

    promptInput.focus();
    expect(document.activeElement).toBe(promptInput);

    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    dragCanvas(root, { x: 160, y: 180 }, { x: 220, y: 260 });

    expect(root.style.backgroundPosition).toBe('0px 0px');
  });

  it('clears the temporary pan override when the window blurs', () => {
    const { container } = render(<Canvas {...buildCanvasProps()} />);
    const root = container.querySelector('[data-canvas-root="true"]') as HTMLElement;

    root.focus();
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    fireEvent.blur(window);
    dragCanvas(root, { x: 100, y: 120 }, { x: 150, y: 185 });

    expect(root.style.backgroundPosition).toBe('0px 0px');
  });

  it('keeps middle mouse temporary free-selection panning intact', () => {
    const { container } = render(<Canvas {...buildCanvasProps()} />);
    const root = container.querySelector('[data-canvas-root="true"]') as HTMLElement;

    dragCanvas(root, { x: 120, y: 150 }, { x: 180, y: 230 }, 1);

    expect(root.style.backgroundPosition).toBe('60px 80px');
  });

  it('stops video playback without changing audio settings when a video is removed from the canvas', async () => {
    const videoImage = buildVideo();
    const videoElement = videoImage.element as HTMLVideoElement;
    const { rerender } = render(<Canvas {...buildCanvasProps({ images: [videoImage] })} />);
    videoElement.muted = false; // Simulate a hovered video that was playing with sound.
    videoElement.volume = 0.75; // Preserve the audible volume for undo restore.

    rerender(<Canvas {...buildCanvasProps({ images: [] })} />);

    await waitFor(() => {
      expect(videoElement.pause).toHaveBeenCalled();
    });
    expect(videoElement.muted).toBe(false);
    expect(videoElement.volume).toBe(0.75);
  });

  it('resumes a restored playing video muted after removal cleanup paused the DOM element', async () => {
    const videoImage = buildVideo();
    const videoElement = videoImage.element as HTMLVideoElement;
    const { rerender } = render(<Canvas {...buildCanvasProps({ images: [videoImage] })} />);

    await waitFor(() => {
      expect(videoElement.play).toHaveBeenCalled();
    });
    vi.mocked(videoElement.play).mockClear();
    vi.mocked(videoElement.play).mockImplementation(() => {
      expect(videoElement.muted).toBe(true); // Verify autoplay starts muted before browser policy checks.
      return Promise.resolve();
    });

    rerender(<Canvas {...buildCanvasProps({ images: [] })} />);

    await waitFor(() => {
      expect(videoElement.pause).toHaveBeenCalled();
    });
    videoElement.muted = false; // Simulate undoing a video that had been audible on hover.

    rerender(<Canvas {...buildCanvasProps({ images: [videoImage] })} />);

    await waitFor(() => {
      expect(videoElement.play).toHaveBeenCalled();
    });
    expect(videoElement.muted).toBe(true);
  });

  it('reports restored audio autoplay rejection so history can replace the playing state', async () => {
    const audioImage = buildAudio();
    const audioElement = audioImage.audioElement as HTMLAudioElement;
    const onMediaPlaybackRejected = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    const cancelAnimationFrameSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    vi.mocked(audioElement.play).mockRejectedValue(new DOMException('Autoplay blocked', 'NotAllowedError'));

    try {
      const props = buildCanvasProps({ images: [], onMediaPlaybackRejected });
      const { rerender } = render(<Canvas {...props} />);

      rerender(<Canvas {...props} images={[audioImage]} />);

      await waitFor(() => {
        expect(onMediaPlaybackRejected).toHaveBeenCalledWith(audioImage.id);
      });
    } finally {
      consoleErrorSpy.mockRestore();
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    }
  });

  it('uses option-shift click as a reference toggle when shift marks an end frame', () => {
    const onImageSelect = vi.fn();
    const { container } = render(<Canvas {...buildCanvasProps({
      images: [buildImage()],
      onImageSelect,
      tailSelectionEnabled: true,
      isKlingO3ReferenceMode: true,
    })} />);
    const root = container.querySelector('[data-canvas-root="true"]') as HTMLElement;

    fireEvent.mouseDown(root, { clientX: 20, clientY: 20, altKey: true, shiftKey: true });

    expect(onImageSelect).toHaveBeenCalledWith('image-1', { reference: true });
  });

  it('renders Krea style reference sliders for tagged references', () => {
    const onStrengthChange = vi.fn();
    const { getByTestId, getByLabelText } = render(<Canvas {...buildCanvasProps({
      images: [buildImage()],
      referenceImageIds: ['image-1'],
      isKrea2StyleReferenceMode: true,
      krea2StyleReferenceStrengths: { 'image-1': 1.2 },
      onKrea2StyleReferenceStrengthChange: onStrengthChange,
    })} />);

    expect(getByTestId('krea-style-reference-slider-image-1')).toBeTruthy();

    const slider = getByLabelText('Krea style reference strength') as HTMLInputElement;
    expect(slider.min).toBe('-2');
    expect(slider.max).toBe('2');
    expect(slider.step).toBe('0.1');
    expect(slider.value).toBe('1.2');

    fireEvent.change(slider, { target: { value: '-0.4' } });

    expect(onStrengthChange).toHaveBeenCalledWith('image-1', -0.4);
  });

  it('renders Krea sliders only for submitted style references when provided', () => {
    const { queryByTestId } = render(<Canvas {...buildCanvasProps({
      images: [buildImage('style-ref'), buildImage('area-ref')],
      referenceImageIds: ['style-ref', 'area-ref'],
      isKrea2StyleReferenceMode: true,
      krea2StyleReferenceImageIds: ['style-ref'],
    })} />);

    expect(queryByTestId('krea-style-reference-slider-style-ref')).toBeTruthy();
    expect(queryByTestId('krea-style-reference-slider-area-ref')).toBeNull();
  });
});
