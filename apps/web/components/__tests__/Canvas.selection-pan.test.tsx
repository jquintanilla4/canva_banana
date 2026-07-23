import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { type ComponentProps } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Canvas } from '../Canvas';
import { Tool, type CanvasImage, type CanvasNote, type CanvasVideoPromptArea, type CanvasVideoPromptBar } from '../../types';
import { createLazyVideoFromUrl } from '../../services/mediaService';

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
  onSelectionReplace: vi.fn(),
  zoomToFitTrigger: 0,
  zoomToSelectionTrigger: 0,
  zoomInTrigger: 0,
  zoomOutTrigger: 0,
  trackpadMode: false,
  panToAnchorRequest: null,
  onFilesDrop: vi.fn(),
  onAnchorNoteCreate: vi.fn(),
  onAnchorClick: vi.fn(),
  onImageOrderChange: vi.fn(),
  isImageOverlapping: false,
  canMoveUp: false,
  canMoveDown: false,
  cropMode: null,
  onCropRectChange: vi.fn(),
  onStartCrop: vi.fn(),
  onConfirmCrop: vi.fn(),
  onCancelCrop: vi.fn(),
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

const dragCanvas = (
  root: HTMLElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
  button = 0,
  modifiers: Pick<MouseEventInit, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'> = {},
) => {
  fireEvent.mouseDown(root, { clientX: from.x, clientY: from.y, button, ...modifiers }); // Start the gesture from the canvas root.
  fireEvent.mouseMove(root, { clientX: to.x, clientY: to.y, button, ...modifiers }); // Move the pointer to update pan state.
  fireEvent.mouseUp(root, { clientX: to.x, clientY: to.y, button, ...modifiers }); // Finish the gesture and flush commit logic.
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

const buildNote = (id = 'note-1'): CanvasNote => ({
  id,
  text: 'Selected note',
  label: 1,
  anchor: { x: 240, y: 140 },
});

const buildVideoPromptArea = (): CanvasVideoPromptArea => ({
  id: 'area-1',
  sequence: 1,
  label: 'Video prompt area 01',
  x: 20,
  y: 20,
  width: 360,
  height: 220,
  promptBarId: 'bar-1',
  orderedMediaIds: [],
}); // Minimal area fixture for presentation-mode chrome checks.

const buildVideoPromptBar = (): CanvasVideoPromptBar => ({
  id: 'bar-1',
  assignedAreaId: 'area-1',
  x: 20,
  y: 20,
  width: 360,
  height: 72,
  prompt: 'Embedded prompt',
  negativePrompt: '',
  seedance2Variant: 'smart',
  seedance2AspectRatio: '16:9',
  seedance2Resolution: '720p',
  seedance2Duration: '5',
  seedance2GenerateAudio: false,
  seedance2CameraFixed: false,
}); // Minimal embedded prompt bar fixture.

describe('Canvas selection temporary pan', () => {
  beforeAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: vi.fn(() => null),
      configurable: true,
    }); // jsdom has no real canvas context.
    Object.defineProperty(globalThis, 'requestAnimationFrame', {
      value: vi.fn(() => 0),
      configurable: true,
    }); // Avoid playback draw loops in interaction tests.
    Object.defineProperty(globalThis, 'cancelAnimationFrame', {
      value: vi.fn(),
      configurable: true,
    }); // Match the no-op RAF stub.
  });

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

    const copyButton = screen.getByRole('button', { name: 'Copy Generation Prompt' }) as HTMLButtonElement;
    fireEvent.click(copyButton);

    expect(copyButton.disabled).toBe(false);
    expect(onImagePromptCopy).toHaveBeenCalledWith('generated-1');
  });

  it('toggles favorites through the committed image mutation channel', () => {
    const image = buildImage();
    const onImagesChange = vi.fn();
    const onCommit = vi.fn();
    const { container, rerender } = render(<Canvas {...buildCanvasProps({
      images: [image],
      selectedImageIds: [image.id],
      onImagesChange,
      onCommit,
    })} />);
    const view = within(container);

    fireEvent.click(view.getByRole('button', { name: 'Add to Favorites' }));

    const favoriteImages = onImagesChange.mock.calls[0]?.[0] as CanvasImage[];
    expect(favoriteImages[0]?.isFavorite).toBe(true);
    expect(onCommit).toHaveBeenCalledWith({ images: favoriteImages });

    rerender(<Canvas {...buildCanvasProps({
      images: favoriteImages,
      selectedImageIds: [image.id],
      onImagesChange,
      onCommit,
    })} />);
    fireEvent.click(view.getByRole('button', { name: 'Remove from Favorites' }));

    expect(onImagesChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: image.id, isFavorite: false }),
    ]);
  });

  it('hides selected media controls in presentation mode', () => {
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

    const { container } = render(<Canvas {...buildCanvasProps({
      images: [generatedImage],
      selectedImageIds: ['generated-1'],
      isPresentationMode: true,
    })} />);
    const view = within(container);

    expect(view.queryByRole('button', { name: 'Copy Generation Prompt' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Crop Image' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Duplicate Media' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Add to Favorites' })).toBeNull();
  });

  it('hides video prompt bar controls in presentation mode', () => {
    const area = buildVideoPromptArea();
    const bar = buildVideoPromptBar();

    const { container } = render(<Canvas {...buildCanvasProps({
      videoPromptAreas: [area],
      videoPromptBars: [bar],
      selectedVideoPromptAreaId: area.id,
      isPresentationMode: true,
    })} />);
    const view = within(container);

    expect(view.queryByText(area.label)).toBeNull();
    expect(view.queryByTestId('prompt-bar-inline')).toBeNull();
    expect(view.queryByLabelText(`Delete ${area.label}`)).toBeNull();
  });

  it('pans without changing selection modifiers in presentation mode', () => {
    const onImageSelect = vi.fn();
    const onVideoPromptAreaSelect = vi.fn();
    const { container } = render(<Canvas {...buildCanvasProps({
      images: [buildImage()],
      notes: [buildNote()],
      onImageSelect,
      onVideoPromptAreaSelect,
      tailSelectionEnabled: true,
      isPresentationMode: true,
    })} />);
    const root = container.querySelector('[data-canvas-root="true"]') as HTMLElement;

    dragCanvas(root, { x: 20, y: 20 }, { x: 70, y: 85 }, 0, { shiftKey: true });
    fireEvent.mouseDown(root, { clientX: 20, clientY: 20, button: 0, altKey: true });
    fireEvent.mouseUp(root, { clientX: 20, clientY: 20, button: 0, altKey: true });
    dragCanvas(root, { x: 0, y: 0 }, { x: 420, y: 320 }, 0, { metaKey: true });

    expect(root.style.backgroundPosition).toBe('470px 385px');
    expect(onImageSelect).not.toHaveBeenCalled();
    expect(onVideoPromptAreaSelect).not.toHaveBeenCalled();
  });

  it('does not clear selection with Escape in presentation mode', () => {
    const onImageSelect = vi.fn();
    const onVideoPromptAreaSelect = vi.fn();
    const { container } = render(<Canvas {...buildCanvasProps({
      images: [buildImage()],
      notes: [buildNote()],
      selectedImageIds: ['image-1'],
      selectedVideoPromptAreaId: 'area-1',
      onImageSelect,
      onVideoPromptAreaSelect,
      isPresentationMode: true,
    })} />);
    const root = container.querySelector('[data-canvas-root="true"]') as HTMLElement;

    fireEvent.keyDown(root, { key: 'Escape' });

    expect(onImageSelect).not.toHaveBeenCalled();
    expect(onVideoPromptAreaSelect).not.toHaveBeenCalled();
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
              elementImageIds: [],
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

  it.each([
    { label: 'Command in Selection', tool: Tool.SELECTION, modifiers: { metaKey: true } },
    { label: 'Control in Free Selection', tool: Tool.FREE_SELECTION, modifiers: { ctrlKey: true } },
  ])('selects multiple canvas items with $label marquee from empty canvas', ({ tool, modifiers }) => {
    const onImageSelect = vi.fn();
    const onSelectionReplace = vi.fn();
    const onVideoPromptAreaSelect = vi.fn();
    const secondImage = { ...buildImage('image-2'), x: 240, y: 150 };
    const { container } = render(<Canvas {...buildCanvasProps({
      tool,
      images: [buildImage(), secondImage],
      onImageSelect,
      onSelectionReplace,
      onVideoPromptAreaSelect,
    })} />);
    const root = container.querySelector('[data-canvas-root="true"]') as HTMLElement;

    dragCanvas(root, { x: 0, y: 0 }, { x: 420, y: 320 }, 0, modifiers);

    expect(onVideoPromptAreaSelect).toHaveBeenCalledWith(null);
    expect(onSelectionReplace).toHaveBeenCalledWith(['image-1', 'image-2']);
    expect(onImageSelect).not.toHaveBeenCalled();
  });

  it('starts command-drag marquee selection when the gesture begins on an image', () => {
    const onImageSelect = vi.fn();
    const onSelectionReplace = vi.fn();
    const selectedImage = buildImage('image-1');
    const secondImage = { ...buildImage('image-2'), x: 180, y: 20 };
    const { container } = render(<Canvas {...buildCanvasProps({
      images: [selectedImage, secondImage],
      selectedImageIds: ['image-1'],
      onImageSelect,
      onSelectionReplace,
    })} />);
    const root = container.querySelector('[data-canvas-root="true"]') as HTMLElement;

    dragCanvas(root, { x: 20, y: 20 }, { x: 300, y: 140 }, 0, { metaKey: true });

    expect(onSelectionReplace).toHaveBeenCalledWith(['image-1', 'image-2']);
    expect(onImageSelect).not.toHaveBeenCalled();
  });

  it('replaces prior image selections with command-drag marquee matches', () => {
    const onImageSelect = vi.fn();
    const onSelectionReplace = vi.fn();
    const insideImage = buildImage('image-1');
    const outsideImage = { ...buildImage('image-3'), x: 520, y: 420 };
    const outsideNote = { ...buildNote('note-3'), anchor: { x: 520, y: 420 } };
    const { container } = render(<Canvas {...buildCanvasProps({
      images: [insideImage, outsideImage],
      notes: [outsideNote],
      selectedImageIds: ['image-3'],
      onImageSelect,
      onSelectionReplace,
    })} />);
    const root = container.querySelector('[data-canvas-root="true"]') as HTMLElement;

    dragCanvas(root, { x: 0, y: 0 }, { x: 140, y: 120 }, 0, { metaKey: true });

    expect(onSelectionReplace).toHaveBeenCalledWith(['image-1']);
    expect(onImageSelect).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'command', modifiers: { metaKey: true } },
    { label: 'control', modifiers: { ctrlKey: true } },
  ])('keeps $label-click image toggles when the pointer does not drag', ({ modifiers }) => {
    const onImageSelect = vi.fn();
    const { container } = render(<Canvas {...buildCanvasProps({
      images: [buildImage()],
      onImageSelect,
    })} />);
    const root = container.querySelector('[data-canvas-root="true"]') as HTMLElement;

    fireEvent.mouseDown(root, { clientX: 20, clientY: 20, button: 0, ...modifiers });
    fireEvent.mouseUp(root, { clientX: 20, clientY: 20, button: 0, ...modifiers });

    expect(onImageSelect).toHaveBeenCalledWith('image-1', { multi: true });
  });

  it('opens the note when its pin is command-clicked without dragging', () => {
    const onAnchorClick = vi.fn();
    const { container } = render(<Canvas {...buildCanvasProps({
      notes: [buildNote()],
      onAnchorClick,
    })} />);
    const root = container.querySelector('[data-canvas-root="true"]') as HTMLElement;

    fireEvent.mouseDown(root, { clientX: 240, clientY: 120, button: 0, metaKey: true });
    fireEvent.mouseUp(root, { clientX: 240, clientY: 120, button: 0, metaKey: true });

    expect(onAnchorClick).toHaveBeenCalledWith('note-1');
  });

  it('keeps free-selection selections while left-dragging empty canvas', () => {
    const onImageSelect = vi.fn();
    const onVideoPromptAreaSelect = vi.fn();
    const { container } = render(<Canvas {...buildCanvasProps({
      tool: Tool.FREE_SELECTION,
      images: [buildImage()],
      notes: [buildNote()],
      selectedImageIds: ['image-1'],
      selectedVideoPromptAreaId: 'area-1',
      onImageSelect,
      onVideoPromptAreaSelect,
    })} />);
    const root = container.querySelector('[data-canvas-root="true"]') as HTMLElement;

    dragCanvas(root, { x: 700, y: 600 }, { x: 750, y: 660 });

    expect(root.style.backgroundPosition).toBe('50px 60px');
    expect(onImageSelect).not.toHaveBeenCalled();
    expect(onVideoPromptAreaSelect).not.toHaveBeenCalled();
  });

  it('keeps free-selection selections on left-click empty canvas', () => {
    const onImageSelect = vi.fn();
    const onVideoPromptAreaSelect = vi.fn();
    const { container } = render(<Canvas {...buildCanvasProps({
      tool: Tool.FREE_SELECTION,
      selectedImageIds: ['image-1'],
      selectedVideoPromptAreaId: 'area-1',
      onImageSelect,
      onVideoPromptAreaSelect,
    })} />);
    const root = container.querySelector('[data-canvas-root="true"]') as HTMLElement;

    fireEvent.mouseDown(root, { clientX: 260, clientY: 240, button: 0 });
    fireEvent.mouseUp(root, { clientX: 260, clientY: 240, button: 0 });

    expect(root.style.backgroundPosition).toBe('0px 0px');
    expect(onVideoPromptAreaSelect).not.toHaveBeenCalled();
    expect(onImageSelect).not.toHaveBeenCalled();
  });

  it('clears free-selection selections with right-click anywhere on the canvas surface', () => {
    const onImageSelect = vi.fn();
    const onVideoPromptAreaSelect = vi.fn();
    const { container } = render(<Canvas {...buildCanvasProps({
      tool: Tool.FREE_SELECTION,
      images: [buildImage()],
      notes: [buildNote()],
      selectedImageIds: ['image-1'],
      selectedVideoPromptAreaId: 'area-1',
      onImageSelect,
      onVideoPromptAreaSelect,
    })} />);
    const root = container.querySelector('[data-canvas-root="true"]') as HTMLElement;

    fireEvent.mouseDown(root, { clientX: 20, clientY: 20, button: 2 });
    fireEvent.mouseUp(root, { clientX: 20, clientY: 20, button: 2 });

    expect(onVideoPromptAreaSelect).toHaveBeenCalledWith(null);
    expect(onImageSelect).toHaveBeenCalledWith(null);
  });

  it('clears free-selection selections with right-drag without panning', () => {
    const onImageSelect = vi.fn();
    const onVideoPromptAreaSelect = vi.fn();
    const { container } = render(<Canvas {...buildCanvasProps({
      tool: Tool.FREE_SELECTION,
      selectedImageIds: ['image-1'],
      selectedVideoPromptAreaId: 'area-1',
      onImageSelect,
      onVideoPromptAreaSelect,
    })} />);
    const root = container.querySelector('[data-canvas-root="true"]') as HTMLElement;

    dragCanvas(root, { x: 260, y: 240 }, { x: 330, y: 310 }, 2);

    expect(root.style.backgroundPosition).toBe('0px 0px');
    expect(onVideoPromptAreaSelect).toHaveBeenCalledTimes(1);
    expect(onImageSelect).toHaveBeenCalledTimes(1);
  });

  it('prevents the browser context menu during free-selection right-click deselect', () => {
    const { container } = render(<Canvas {...buildCanvasProps({ tool: Tool.FREE_SELECTION })} />);
    const root = container.querySelector('[data-canvas-root="true"]') as HTMLElement;
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 260, clientY: 240 });

    root.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('still clears selections on selection-tool left-click empty canvas', () => {
    const onImageSelect = vi.fn();
    const onVideoPromptAreaSelect = vi.fn();
    const { container } = render(<Canvas {...buildCanvasProps({
      selectedImageIds: ['image-1'],
      selectedVideoPromptAreaId: 'area-1',
      onImageSelect,
      onVideoPromptAreaSelect,
    })} />);
    const root = container.querySelector('[data-canvas-root="true"]') as HTMLElement;

    fireEvent.mouseDown(root, { clientX: 260, clientY: 240, button: 0 });

    expect(onVideoPromptAreaSelect).toHaveBeenCalledWith(null);
    expect(onImageSelect).toHaveBeenCalledWith(null);
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

  it('wakes an older lazy snapshot video when the user presses Play', () => {
    const videoElement = createLazyVideoFromUrl('canva-banana-snapshot://media/source-1/0/1/legacy.mp4', 1280, 720);
    const load = vi.spyOn(videoElement, 'load').mockImplementation(() => {});
    const play = vi.spyOn(videoElement, 'play').mockResolvedValue(undefined);
    const videoImage = {
      ...buildVideo('legacy-video'),
      element: videoElement,
      isPlaying: false,
    };
    const onImagesChange = vi.fn();

    render(<Canvas {...buildCanvasProps({
      images: [videoImage],
      selectedImageIds: [videoImage.id],
      onImagesChange,
    })} />);
    fireEvent.click(screen.getByLabelText('Play'));

    expect(videoElement.preload).toBe('auto');
    expect(load).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);
    expect(onImagesChange).toHaveBeenCalledWith([expect.objectContaining({ id: videoImage.id, isPlaying: true })]);
  });

  it('plays a lazy snapshot video from its painted center Play control', () => {
    const videoElement = createLazyVideoFromUrl('canva-banana-snapshot://media/source-1/0/1/legacy.mp4', 100, 80);
    const load = vi.spyOn(videoElement, 'load').mockImplementation(() => {});
    const play = vi.spyOn(videoElement, 'play').mockResolvedValue(undefined);
    const videoImage = {
      ...buildVideo('legacy-video'),
      element: videoElement,
      isPlaying: false,
    };
    const onImageSelect = vi.fn();
    const onImagesChange = vi.fn();
    const { container } = render(<Canvas {...buildCanvasProps({
      images: [videoImage],
      onImageSelect,
      onImagesChange,
    })} />);
    const root = container.querySelector('[data-canvas-root="true"]') as HTMLElement;

    fireEvent.mouseDown(root, { clientX: 60, clientY: 50, button: 0 });
    fireEvent.mouseUp(root, { clientX: 60, clientY: 50, button: 0 });

    expect(onImageSelect).toHaveBeenCalledWith(videoImage.id);
    expect(videoElement.preload).toBe('auto');
    expect(load).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);
    expect(onImagesChange).toHaveBeenCalledWith([expect.objectContaining({ id: videoImage.id, isPlaying: true })]);
  });

  it.each([
    ['pan tool', { tool: Tool.PAN }],
    ['presentation mode', { isPresentationMode: true }],
  ] as const)('plays a lazy snapshot video from its painted center Play control in %s', (_label, overrides) => {
    const videoElement = createLazyVideoFromUrl('canva-banana-snapshot://media/source-1/0/1/legacy.mp4', 100, 80);
    const load = vi.spyOn(videoElement, 'load').mockImplementation(() => {});
    const play = vi.spyOn(videoElement, 'play').mockResolvedValue(undefined);
    const videoImage = {
      ...buildVideo('legacy-video'),
      element: videoElement,
      isPlaying: false,
    };
    const onImageSelect = vi.fn();
    const onImagesChange = vi.fn();
    const { container } = render(<Canvas {...buildCanvasProps({
      ...overrides,
      images: [videoImage],
      onImageSelect,
      onImagesChange,
    })} />);
    const root = container.querySelector('[data-canvas-root="true"]') as HTMLElement;

    fireEvent.mouseDown(root, { clientX: 60, clientY: 50, button: 0 });
    fireEvent.mouseUp(root, { clientX: 60, clientY: 50, button: 0 });

    expect(onImageSelect).not.toHaveBeenCalled(); // Playback should not mutate selection while the canvas is a navigation surface.
    expect(videoElement.preload).toBe('auto');
    expect(load).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);
    expect(onImagesChange).toHaveBeenCalledWith([expect.objectContaining({ id: videoImage.id, isPlaying: true })]);
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

  it('does not push image state on each audio playback frame', async () => {
    const audioImage = buildAudio();
    const audioElement = audioImage.audioElement as HTMLAudioElement;
    const onImagesChange = vi.fn();
    const callbacks: FrameRequestCallback[] = [];
    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const cancelAnimationFrameSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    audioElement.currentTime = 0.42;

    try {
      render(<Canvas {...buildCanvasProps({ images: [audioImage], onImagesChange })} />);

      await waitFor(() => {
        expect(callbacks.length).toBeGreaterThan(0);
      });

      act(() => {
        callbacks[callbacks.length - 1]?.(16);
      });

      expect(onImagesChange).not.toHaveBeenCalled();
    } finally {
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    }
  });

  it('persists the current audio time once when playback is paused', () => {
    const audioImage = buildAudio();
    const audioElement = audioImage.audioElement as HTMLAudioElement;
    const onImagesChange = vi.fn();
    audioElement.currentTime = 0.7;

    render(<Canvas {...buildCanvasProps({
      images: [audioImage],
      selectedImageIds: [audioImage.id],
      onImagesChange,
    })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    expect(audioElement.pause).toHaveBeenCalled();
    expect(onImagesChange).toHaveBeenCalledWith([
      expect.objectContaining({
        id: audioImage.id,
        isPlaying: false,
        currentPlaybackTime: 0.7,
      }),
    ]);
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

  it('applies gentle pixel-based wheel zoom while trackpad mode is enabled', () => {
    const onScaleChange = vi.fn();
    const { container } = render(<Canvas {...buildCanvasProps({
      trackpadMode: true,
      onScaleChange,
    })} />);
    const root = container.querySelector('[data-canvas-root="true"]') as HTMLElement;

    fireEvent.wheel(root, { deltaY: 1, deltaMode: 0, clientX: 400, clientY: 300 });

    expect(onScaleChange).toHaveBeenLastCalledWith(expect.closeTo(Math.exp(-0.001), 6));
  });
});
