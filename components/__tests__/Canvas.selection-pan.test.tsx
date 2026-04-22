import { fireEvent, render } from '@testing-library/react';
import { type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Canvas } from '../Canvas';
import { Tool } from '../../types';

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
  isKlingO1VideoInputMode: false,
  isKlingO1FflfMode: false,
  isSeedance15FflfMode: false,
  isKling26ControlVideoInputMode: false,
  isVeo31ExtendMode: false,
  isWanAnimateVideoInputMode: false,
  isWan27VideoMode: false,
  onError: vi.fn(),
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

describe('Canvas selection temporary pan', () => {
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
});
