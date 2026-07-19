import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Canvas } from '../Canvas';
import { Tool, type CanvasNote } from '../../types';

const buildAnchoredNote = (): CanvasNote => ({
  id: 'note-1',
  text: 'Initial note',
  label: 1,
  anchor: { x: 100, y: 100 },
});

type HarnessOverrides = {
  tool?: Tool;
  notes?: CanvasNote[];
  onNotesChange?: (notes: CanvasNote[]) => void;
  onAnchorNoteCreate?: (point: { x: number; y: number }) => void;
  onAnchorClick?: (noteId: string) => void;
  onCommit?: () => void;
};

const renderCanvas = (overrides: HarnessOverrides = {}) => {
  const {
    tool = Tool.NOTE,
    notes = [],
    onNotesChange = vi.fn(),
    onAnchorNoteCreate = vi.fn(),
    onAnchorClick = vi.fn(),
    onCommit = vi.fn(),
  } = overrides;

  return render(
    <Canvas
      images={[]}
      onImagesChange={vi.fn()}
      notes={notes}
      onNotesChange={onNotesChange}
      videoPromptAreas={[]}
      onVideoPromptAreasChange={vi.fn()}
      videoPromptBars={[]}
      onVideoPromptBarsChange={vi.fn()}
      selectedVideoPromptAreaId={null}
      onVideoPromptAreaSelect={vi.fn()}
      videoPromptAreaMemberships={{}}
      tool={tool}
      appMode="CANVAS"
      paths={[]}
      onPathsChange={vi.fn()}
      brushSize={10}
      eraserSize={10}
      brushColor="#000000"
      selectedImageIds={[]}
      referenceImageIds={[]}
      referenceVideoIds={[]}
      referenceAudioIds={[]}
      referenceImageOrderLabels={null}
      disabledMediaIds={[]}
      elementImageIds={[]}
      elementImageOrderLabels={null}
      videoLastFrameImageId={null}
      sourceVideoId={null}
      tailSelectionEnabled={false}
      isKlingO3VideoInputMode={false}
      isKlingO3ReferenceMode={false}
      isSeedance15FflfMode={false}
      isKlingV3ControlVideoInputMode={false}
      isVeo31ExtendMode={false}
      isWanAnimateVideoInputMode={false}
      isWan27VideoMode={false}
      onError={vi.fn()}
      onImageSelect={vi.fn()}
      onSelectionReplace={vi.fn()}
      zoomToFitTrigger={0}
      zoomToSelectionTrigger={0}
      zoomInTrigger={0}
      zoomOutTrigger={0}
      panToAnchorRequest={null}
      onFilesDrop={vi.fn()}
      onAnchorNoteCreate={onAnchorNoteCreate}
      onAnchorClick={onAnchorClick}
      onImageOrderChange={vi.fn()}
      isImageOverlapping={false}
      canMoveUp={false}
      canMoveDown={false}
      cropMode={null}
      onCropRectChange={vi.fn()}
      onStartCrop={vi.fn()}
      onConfirmCrop={vi.fn()}
      onCancelCrop={vi.fn()}
      onImagePromptCopy={vi.fn()}
      onImageDuplicate={vi.fn()}
      onRerunGeneration={vi.fn()}
      showMetadataOverlay={false}
      transformMode={null}
      onStartTransform={vi.fn()}
      onExitTransform={vi.fn()}
      isLoading={false}
      onVideoPromptBarFocus={vi.fn()}
      onVideoPromptBarBlur={vi.fn()}
      onVideoPromptBarUpdate={vi.fn()}
      onVideoPromptBarSubmit={vi.fn()}
      buildVideoPromptBarControls={vi.fn(() => [])}
      embeddedVideoPromptBarModelOptions={[{ value: 'volcengine/seedance-2', label: 'Seedance 2' }]}
      onCommit={onCommit}
    />
  );
};

describe('Canvas note tool flow', () => {
  it('keeps the empty-canvas guidance visible for panel-only notes', () => {
    const { getByText } = renderCanvas({ notes: [{ id: 'panel-note', text: 'Panel only' }] });

    expect(getByText('Welcome to the Infinite Canvas')).toBeTruthy();
  });

  it('requests an anchored note at the clicked world point on empty canvas', () => {
    const onAnchorNoteCreate = vi.fn();
    const { container } = renderCanvas({ onAnchorNoteCreate });
    const root = container.firstElementChild as HTMLElement;

    act(() => {
      fireEvent.mouseDown(root, { clientX: 250, clientY: 140 });
      fireEvent.mouseUp(root, { clientX: 250, clientY: 140 });
    });

    expect(onAnchorNoteCreate).toHaveBeenCalledTimes(1);
    expect(onAnchorNoteCreate).toHaveBeenCalledWith({ x: 250, y: 140 });
  });

  it('ignores right-clicks so the context menu does not drop a pin', () => {
    const onAnchorNoteCreate = vi.fn();
    const onAnchorClick = vi.fn();
    const { container } = renderCanvas({
      notes: [buildAnchoredNote()],
      onAnchorNoteCreate,
      onAnchorClick,
    });
    const root = container.firstElementChild as HTMLElement;

    act(() => {
      fireEvent.mouseDown(root, { clientX: 250, clientY: 140, button: 2 });
      fireEvent.mouseUp(root, { clientX: 250, clientY: 140, button: 2 });
      fireEvent.mouseDown(root, { clientX: 100, clientY: 80, button: 2 });
      fireEvent.mouseUp(root, { clientX: 100, clientY: 80, button: 2 });
    });

    expect(onAnchorNoteCreate).not.toHaveBeenCalled();
    expect(onAnchorClick).not.toHaveBeenCalled();
  });

  it('opens an existing note instead of creating one when clicking its pin', () => {
    const onAnchorNoteCreate = vi.fn();
    const onAnchorClick = vi.fn();
    const { container } = renderCanvas({
      notes: [buildAnchoredNote()],
      onAnchorNoteCreate,
      onAnchorClick,
    });
    const root = container.firstElementChild as HTMLElement;

    act(() => {
      // Pin head is centered ~22px above the anchor tip at (100, 100).
      fireEvent.mouseDown(root, { clientX: 100, clientY: 80 });
      fireEvent.mouseUp(root, { clientX: 100, clientY: 80 });
    });

    expect(onAnchorClick).toHaveBeenCalledTimes(1);
    expect(onAnchorClick).toHaveBeenCalledWith('note-1');
    expect(onAnchorNoteCreate).not.toHaveBeenCalled();
  });

  it('opens a note when its pin is clicked with the selection tool', () => {
    const onAnchorClick = vi.fn();
    const { container } = renderCanvas({
      tool: Tool.SELECTION,
      notes: [buildAnchoredNote()],
      onAnchorClick,
    });
    const root = container.firstElementChild as HTMLElement;

    act(() => {
      fireEvent.mouseDown(root, { clientX: 100, clientY: 80 });
      fireEvent.mouseUp(root, { clientX: 100, clientY: 80 });
    });

    expect(onAnchorClick).toHaveBeenCalledTimes(1);
    expect(onAnchorClick).toHaveBeenCalledWith('note-1');
  });

  it('drags a pin to a new anchor position and commits without opening the note', () => {
    const onNotesChange = vi.fn();
    const onAnchorClick = vi.fn();
    const onCommit = vi.fn();
    const { container } = renderCanvas({
      tool: Tool.SELECTION,
      notes: [buildAnchoredNote()],
      onNotesChange,
      onAnchorClick,
      onCommit,
    });
    const root = container.firstElementChild as HTMLElement;

    act(() => {
      fireEvent.mouseDown(root, { clientX: 100, clientY: 80 });
      fireEvent.mouseMove(root, { clientX: 140, clientY: 120 });
      fireEvent.mouseUp(root, { clientX: 140, clientY: 120 });
    });

    expect(onNotesChange).toHaveBeenCalled();
    const movedNotes = onNotesChange.mock.calls.at(-1)?.[0] as CanvasNote[];
    expect(movedNotes[0].anchor).toEqual({ x: 140, y: 140 });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onAnchorClick).not.toHaveBeenCalled();
  });
});
