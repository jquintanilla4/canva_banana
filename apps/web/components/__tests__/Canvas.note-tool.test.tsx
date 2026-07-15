import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { Canvas } from '../Canvas';
import { Tool, type CanvasNote } from '../../types';
import { useCanvasHistory } from '../../hooks/useCanvasHistory';

const buildNote = (): CanvasNote => ({
  id: 'note-1',
  x: 100,
  y: 100,
  width: 200,
  height: 120,
  text: 'Initial note',
  backgroundColor: '#1f2937',
});

describe('Canvas note tool flow', () => {
  it('enters edit mode right after creating a note', () => {
    const Harness = () => {
      const { displayedNotes, setLiveNotes, commit } = useCanvasHistory({ images: [], paths: [], notes: [], videoPromptAreas: [], videoPromptBars: [] });
      const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

      return (
        <Canvas
          images={[]}
          onImagesChange={vi.fn()}
          notes={displayedNotes}
          onNotesChange={setLiveNotes}
          videoPromptAreas={[]}
          onVideoPromptAreasChange={vi.fn()}
          videoPromptBars={[]}
          onVideoPromptBarsChange={vi.fn()}
          selectedVideoPromptAreaId={null}
          onVideoPromptAreaSelect={vi.fn()}
          videoPromptAreaMemberships={{}}
          tool={Tool.NOTE}
          appMode="CANVAS"
          paths={[]}
          onPathsChange={vi.fn()}
          brushSize={10}
          eraserSize={10}
          brushColor="#000000"
          selectedImageIds={[]}
          selectedNoteIds={[]}
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
          onNoteSelect={vi.fn()}
          onSelectionReplace={vi.fn()}
          zoomToFitTrigger={0}
          zoomToSelectionTrigger={0}
          zoomInTrigger={0}
          zoomOutTrigger={0}
          onFilesDrop={vi.fn()}
          editingNoteId={editingNoteId}
          onNoteDoubleClick={(id) => setEditingNoteId(id)}
          onNoteTextChange={vi.fn()}
          onNoteEditEnd={() => setEditingNoteId(null)}
          onImageOrderChange={vi.fn()}
          isImageOverlapping={false}
          canMoveUp={false}
          canMoveDown={false}
          cropMode={null}
          onCropRectChange={vi.fn()}
          onStartCrop={vi.fn()}
          onConfirmCrop={vi.fn()}
          onCancelCrop={vi.fn()}
          onNoteCopy={vi.fn()}
          onNoteDuplicate={vi.fn()}
          onNoteFontSizeChange={vi.fn()}
          onNoteColorChange={vi.fn()}
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
          onCommit={commit}
        />
      );
    };

    const { container } = render(<Harness />);
    const root = container.firstElementChild as HTMLElement;

    act(() => {
      fireEvent.mouseDown(root);
      fireEvent.mouseUp(root);
      fireEvent.click(root);
    });

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();
    expect(document.activeElement).toBe(textarea);
  });

  it('exits edit on click-out without creating a note, then allows a new note', () => {
    const onNotesChange = vi.fn();
    const onNoteEditEnd = vi.fn();

    const Harness = () => {
      const [notes, setNotes] = useState<CanvasNote[]>([buildNote()]);
      const [editingNoteId, setEditingNoteId] = useState<string | null>(notes[0].id);

      const handleNotesChange = (nextNotes: CanvasNote[]) => {
        setNotes(nextNotes);
        onNotesChange(nextNotes);
      };

      const handleNoteEditEnd = () => {
        setEditingNoteId(null);
        onNoteEditEnd();
      };

      return (
        <Canvas
          images={[]}
          onImagesChange={vi.fn()}
          notes={notes}
          onNotesChange={handleNotesChange}
          videoPromptAreas={[]}
          onVideoPromptAreasChange={vi.fn()}
          videoPromptBars={[]}
          onVideoPromptBarsChange={vi.fn()}
          selectedVideoPromptAreaId={null}
          onVideoPromptAreaSelect={vi.fn()}
          videoPromptAreaMemberships={{}}
          tool={Tool.NOTE}
          appMode="CANVAS"
          paths={[]}
          onPathsChange={vi.fn()}
          brushSize={10}
          eraserSize={10}
          brushColor="#000000"
          selectedImageIds={[]}
          selectedNoteIds={[]}
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
          onNoteSelect={vi.fn()}
          onSelectionReplace={vi.fn()}
          zoomToFitTrigger={0}
          zoomToSelectionTrigger={0}
          zoomInTrigger={0}
          zoomOutTrigger={0}
          onFilesDrop={vi.fn()}
          editingNoteId={editingNoteId}
          onNoteDoubleClick={(id) => setEditingNoteId(id)}
          onNoteTextChange={vi.fn()}
          onNoteEditEnd={handleNoteEditEnd}
          onImageOrderChange={vi.fn()}
          isImageOverlapping={false}
          canMoveUp={false}
          canMoveDown={false}
          cropMode={null}
          onCropRectChange={vi.fn()}
          onStartCrop={vi.fn()}
          onConfirmCrop={vi.fn()}
          onCancelCrop={vi.fn()}
          onNoteCopy={vi.fn()}
          onNoteDuplicate={vi.fn()}
          onNoteFontSizeChange={vi.fn()}
          onNoteColorChange={vi.fn()}
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
          onCommit={vi.fn()}
        />
      );
    };

    const { container } = render(<Harness />);
    const root = container.firstElementChild as HTMLElement;

    expect(container.querySelector('textarea')).not.toBeNull();

    act(() => {
      fireEvent.mouseDown(root);
      fireEvent.mouseUp(root);
      fireEvent.click(root);
    });

    expect(onNotesChange).not.toHaveBeenCalled();
    expect(onNoteEditEnd).toHaveBeenCalledTimes(1);
    expect(container.querySelector('textarea')).toBeNull();

    act(() => {
      fireEvent.mouseDown(root);
      fireEvent.mouseUp(root);
      fireEvent.click(root);
    });

    expect(onNotesChange).toHaveBeenCalledTimes(1);
    expect(onNotesChange.mock.calls[0][0]).toHaveLength(2);
  });
});
