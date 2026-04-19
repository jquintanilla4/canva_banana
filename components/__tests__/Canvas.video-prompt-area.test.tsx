import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { Canvas } from '../Canvas';
import { Tool, type CanvasVideoPromptArea, type CanvasVideoPromptBar } from '../../types';

describe('Canvas video prompt area tool', () => {
  afterEach(() => {
    cleanup();
  });

  it('creates a labeled video prompt area from a drag gesture', async () => {
    const Harness = () => {
      const [areas, setAreas] = useState<CanvasVideoPromptArea[]>([]);
      const [bars, setBars] = useState<CanvasVideoPromptBar[]>([]);
      const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);

      return (
        <Canvas
          images={[]}
          onImagesChange={vi.fn()}
          notes={[]}
          onNotesChange={vi.fn()}
          videoPromptAreas={areas}
          onVideoPromptAreasChange={setAreas}
          videoPromptBars={bars}
          onVideoPromptBarsChange={setBars}
          selectedVideoPromptAreaId={selectedAreaId}
          onVideoPromptAreaSelect={setSelectedAreaId}
          videoPromptAreaMemberships={{}}
          tool={Tool.VIDEO_PROMPT_AREA}
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
          isKlingO1VideoInputMode={false}
          isKlingO1FflfMode={false}
          isSeedance15FflfMode={false}
          isKling26ControlVideoInputMode={false}
          isVeo31ExtendMode={false}
          isWanAnimateVideoInputMode={false}
          isWan26I2VMode={false}
          onError={vi.fn()}
          onImageSelect={vi.fn()}
          onNoteSelect={vi.fn()}
          zoomToFitTrigger={0}
          zoomToSelectionTrigger={0}
          zoomInTrigger={0}
          zoomOutTrigger={0}
          onFilesDrop={vi.fn()}
          editingNoteId={null}
          onNoteDoubleClick={vi.fn()}
          onNoteTextChange={vi.fn()}
          onNoteEditEnd={vi.fn()}
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
          buildVideoPromptBarControls={() => []}
          embeddedVideoPromptBarModelOptions={[{ value: 'volcengine/seedance-2', label: 'Seedance 2' }]}
          onCommit={vi.fn()}
        />
      );
    };

    const { container } = render(<Harness />);
    const root = container.querySelector('[data-canvas-root="true"]') as HTMLElement;

    await act(async () => {
      fireEvent.mouseDown(root, { clientX: 40, clientY: 60 });
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.mouseMove(root, { clientX: 420, clientY: 280 });
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.mouseUp(root, { clientX: 420, clientY: 280 });
      await Promise.resolve();
    });

    expect(await screen.findByRole('button', { name: 'Video prompt area 01' })).toBeTruthy();
  });

  it('shows resize handles only after the area is selected in selection mode', async () => {
    const Harness = () => {
      const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);

      return (
        <Canvas
          images={[]}
          onImagesChange={vi.fn()}
          notes={[]}
          onNotesChange={vi.fn()}
          videoPromptAreas={[{
            id: 'area-1',
            sequence: 1,
            label: 'Video prompt area 01',
            x: 40,
            y: 60,
            width: 320,
            height: 240,
            promptBarId: null,
            orderedMediaIds: [],
          }]}
          onVideoPromptAreasChange={vi.fn()}
          videoPromptBars={[]}
          onVideoPromptBarsChange={vi.fn()}
          selectedVideoPromptAreaId={selectedAreaId}
          onVideoPromptAreaSelect={setSelectedAreaId}
          videoPromptAreaMemberships={{}}
          tool={Tool.SELECTION}
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
          isKlingO1VideoInputMode={false}
          isKlingO1FflfMode={false}
          isSeedance15FflfMode={false}
          isKling26ControlVideoInputMode={false}
          isVeo31ExtendMode={false}
          isWanAnimateVideoInputMode={false}
          isWan26I2VMode={false}
          onError={vi.fn()}
          onImageSelect={vi.fn()}
          onNoteSelect={vi.fn()}
          zoomToFitTrigger={0}
          zoomToSelectionTrigger={0}
          zoomInTrigger={0}
          zoomOutTrigger={0}
          onFilesDrop={vi.fn()}
          editingNoteId={null}
          onNoteDoubleClick={vi.fn()}
          onNoteTextChange={vi.fn()}
          onNoteEditEnd={vi.fn()}
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
          buildVideoPromptBarControls={() => []}
          embeddedVideoPromptBarModelOptions={[{ value: 'volcengine/seedance-2', label: 'Seedance 2' }]}
          onCommit={vi.fn()}
        />
      );
    };

    const { getByRole, queryByRole } = render(<Harness />);

    expect(queryByRole('button', { name: 'Resize top left of Video prompt area 01' })).toBeNull();

    await act(async () => {
      const labelButton = getByRole('button', { name: 'Video prompt area 01' });
      fireEvent.mouseDown(labelButton, { clientX: 80, clientY: 90 });
      fireEvent.mouseUp(labelButton, { clientX: 80, clientY: 90 });
      await Promise.resolve();
    });

    expect(getByRole('button', { name: 'Resize top left of Video prompt area 01' })).toBeTruthy();
    expect(getByRole('button', { name: 'Resize top right of Video prompt area 01' })).toBeTruthy();
    expect(getByRole('button', { name: 'Resize bottom left of Video prompt area 01' })).toBeTruthy();
    expect(getByRole('button', { name: 'Resize bottom right of Video prompt area 01' })).toBeTruthy();
  });

  it('hides the helper message once media has been added to the area', () => {
    render(
      <Canvas
        images={[]}
        onImagesChange={vi.fn()}
        notes={[]}
        onNotesChange={vi.fn()}
        videoPromptAreas={[{
          id: 'area-1',
          sequence: 1,
          label: 'Video prompt area 01',
          x: 40,
          y: 60,
          width: 320,
          height: 240,
          promptBarId: null,
          orderedMediaIds: ['image-1'],
        }]}
        onVideoPromptAreasChange={vi.fn()}
        videoPromptBars={[]}
        onVideoPromptBarsChange={vi.fn()}
        selectedVideoPromptAreaId={null}
        onVideoPromptAreaSelect={vi.fn()}
        videoPromptAreaMemberships={{}}
        tool={Tool.SELECTION}
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
        isKlingO1VideoInputMode={false}
        isKlingO1FflfMode={false}
        isSeedance15FflfMode={false}
        isKling26ControlVideoInputMode={false}
        isVeo31ExtendMode={false}
        isWanAnimateVideoInputMode={false}
        isWan26I2VMode={false}
        onError={vi.fn()}
        onImageSelect={vi.fn()}
        onNoteSelect={vi.fn()}
        zoomToFitTrigger={0}
        zoomToSelectionTrigger={0}
        zoomInTrigger={0}
        zoomOutTrigger={0}
        onFilesDrop={vi.fn()}
        editingNoteId={null}
        onNoteDoubleClick={vi.fn()}
        onNoteTextChange={vi.fn()}
        onNoteEditEnd={vi.fn()}
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
        buildVideoPromptBarControls={() => []}
        embeddedVideoPromptBarModelOptions={[{ value: 'volcengine/seedance-2', label: 'Seedance 2' }]}
        onCommit={vi.fn()}
      />
    );

    expect(screen.queryByText('Drag a video prompt bar here to activate this area.')).toBeNull();
  });

  it('selects an area when clicking anywhere inside it with the selection tool', async () => {
    const Harness = () => {
      const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);

      return (
        <Canvas
          images={[]}
          onImagesChange={vi.fn()}
          notes={[]}
          onNotesChange={vi.fn()}
          videoPromptAreas={[{
            id: 'area-1',
            sequence: 1,
            label: 'Video prompt area 01',
            x: 40,
            y: 60,
            width: 320,
            height: 240,
            promptBarId: null,
            orderedMediaIds: [],
          }]}
          onVideoPromptAreasChange={vi.fn()}
          videoPromptBars={[]}
          onVideoPromptBarsChange={vi.fn()}
          selectedVideoPromptAreaId={selectedAreaId}
          onVideoPromptAreaSelect={setSelectedAreaId}
          videoPromptAreaMemberships={{}}
          tool={Tool.SELECTION}
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
          isKlingO1VideoInputMode={false}
          isKlingO1FflfMode={false}
          isSeedance15FflfMode={false}
          isKling26ControlVideoInputMode={false}
          isVeo31ExtendMode={false}
          isWanAnimateVideoInputMode={false}
          isWan26I2VMode={false}
          onError={vi.fn()}
          onImageSelect={vi.fn()}
          onNoteSelect={vi.fn()}
          zoomToFitTrigger={0}
          zoomToSelectionTrigger={0}
          zoomInTrigger={0}
          zoomOutTrigger={0}
          onFilesDrop={vi.fn()}
          editingNoteId={null}
          onNoteDoubleClick={vi.fn()}
          onNoteTextChange={vi.fn()}
          onNoteEditEnd={vi.fn()}
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
          buildVideoPromptBarControls={() => []}
          embeddedVideoPromptBarModelOptions={[{ value: 'volcengine/seedance-2', label: 'Seedance 2' }]}
          onCommit={vi.fn()}
        />
      );
    };

    const { container, getByRole } = render(<Harness />);
    const root = container.querySelector('[data-canvas-root="true"]') as HTMLElement;

    await act(async () => {
      fireEvent.mouseDown(root, { clientX: 180, clientY: 180 });
      fireEvent.mouseUp(root, { clientX: 180, clientY: 180 });
      await Promise.resolve();
    });

    expect(getByRole('button', { name: 'Resize top left of Video prompt area 01' })).toBeTruthy();
  });

  it('uses the shared color swatch picker to change the selected area border color', async () => {
    const Harness = () => {
      const [areas, setAreas] = useState<CanvasVideoPromptArea[]>([{
        id: 'area-1',
        sequence: 1,
        label: 'Video prompt area 01',
        borderColor: '#d1d5db',
        x: 40,
        y: 60,
        width: 320,
        height: 240,
        promptBarId: null,
        orderedMediaIds: [],
      }]);
      const [selectedAreaId, setSelectedAreaId] = useState<string | null>('area-1');

      const handleAreaBorderColorChange = (areaId: string, color: string) => {
        setAreas(currentAreas => currentAreas.map(area => (
          area.id === areaId ? { ...area, borderColor: color } : area
        )));
      };

      return (
        <Canvas
          images={[]}
          onImagesChange={vi.fn()}
          notes={[]}
          onNotesChange={vi.fn()}
          videoPromptAreas={areas}
          onVideoPromptAreasChange={setAreas}
          videoPromptBars={[]}
          onVideoPromptBarsChange={vi.fn()}
          selectedVideoPromptAreaId={selectedAreaId}
          onVideoPromptAreaSelect={setSelectedAreaId}
          videoPromptAreaMemberships={{}}
          tool={Tool.SELECTION}
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
          isKlingO1VideoInputMode={false}
          isKlingO1FflfMode={false}
          isSeedance15FflfMode={false}
          isKling26ControlVideoInputMode={false}
          isVeo31ExtendMode={false}
          isWanAnimateVideoInputMode={false}
          isWan26I2VMode={false}
          onError={vi.fn()}
          onImageSelect={vi.fn()}
          onNoteSelect={vi.fn()}
          zoomToFitTrigger={0}
          zoomToSelectionTrigger={0}
          zoomInTrigger={0}
          zoomOutTrigger={0}
          onFilesDrop={vi.fn()}
          editingNoteId={null}
          onNoteDoubleClick={vi.fn()}
          onNoteTextChange={vi.fn()}
          onNoteEditEnd={vi.fn()}
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
          onVideoPromptAreaBorderColorChange={handleAreaBorderColorChange}
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
          buildVideoPromptBarControls={() => []}
          embeddedVideoPromptBarModelOptions={[{ value: 'volcengine/seedance-2', label: 'Seedance 2' }]}
          onCommit={vi.fn()}
        />
      );
    };

    render(<Harness />);

    const swatchButton = screen.getByTitle('Video Prompt Area Border Color');
    const swatch = swatchButton.querySelector('span') as HTMLSpanElement | null;
    expect(swatch).not.toBeNull();
    expect(window.getComputedStyle(swatch as HTMLSpanElement).backgroundColor).toBe('rgb(209, 213, 219)');

    await act(async () => {
      fireEvent.click(swatchButton);
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByTitle('Orange'));
      await Promise.resolve();
    });

    expect(window.getComputedStyle(swatch as HTMLSpanElement).backgroundColor).toBe('rgb(249, 115, 22)');
  });

  it('renders embedded bars without a negative prompt field and with a delete button', () => {
    const { container } = render(
      <Canvas
        images={[]}
        onImagesChange={vi.fn()}
        notes={[]}
        onNotesChange={vi.fn()}
        videoPromptAreas={[{
          id: 'area-1',
          sequence: 1,
          label: 'Video prompt area 01',
          x: 40,
          y: 60,
          width: 1200,
          height: 900,
          promptBarId: 'bar-1',
          orderedMediaIds: ['image-1'],
        }]}
        onVideoPromptAreasChange={vi.fn()}
        videoPromptBars={[{
          id: 'bar-1',
          assignedAreaId: 'area-1',
          prompt: '',
          negativePrompt: '',
          seedance2Variant: 'reference',
          seedance2AspectRatio: '16:9',
          seedance2Resolution: '720p',
          seedance2Duration: '5',
          seedance2GenerateAudio: false,
          seedance2CameraFixed: false,
          x: 180,
          y: 600,
          width: 920,
          height: 190,
        }]}
        onVideoPromptBarsChange={vi.fn()}
        selectedVideoPromptAreaId={null}
        onVideoPromptAreaSelect={vi.fn()}
        videoPromptAreaMemberships={{
          'area-1': {
            orderedMediaIds: ['image-1'],
            acceptedImageIds: ['image-1'],
            acceptedVideoIds: [],
            acceptedAudioIds: [],
            ignoredMediaIds: [],
            orderLabels: { 'image-1': '@Image1' },
          },
        }}
        tool={Tool.SELECTION}
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
        isKlingO1VideoInputMode={false}
        isKlingO1FflfMode={false}
        isSeedance15FflfMode={false}
        isKling26ControlVideoInputMode={false}
        isVeo31ExtendMode={false}
        isWanAnimateVideoInputMode={false}
        isWan26I2VMode={false}
        onError={vi.fn()}
        onImageSelect={vi.fn()}
        onNoteSelect={vi.fn()}
        zoomToFitTrigger={0}
        zoomToSelectionTrigger={0}
        zoomInTrigger={0}
        zoomOutTrigger={0}
        onFilesDrop={vi.fn()}
        editingNoteId={null}
        onNoteDoubleClick={vi.fn()}
        onNoteTextChange={vi.fn()}
        onNoteEditEnd={vi.fn()}
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
        buildVideoPromptBarControls={() => []}
        embeddedVideoPromptBarModelOptions={[{ value: 'volcengine/seedance-2', label: 'Seedance 2' }]}
        onCommit={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Delete Video prompt area 01' })).toBeTruthy();
    expect(screen.queryByLabelText('Negative prompt input')).toBeNull();

    const root = container.querySelector('[data-canvas-root="true"]') as HTMLElement;
    const modelBadgeButton = screen.getByRole('button', { name: 'Seedance 2' });
    const embeddedPromptShell = modelBadgeButton.closest('[data-embedded-prompt-size-mode]') as HTMLElement;

    expect(embeddedPromptShell.dataset.embeddedPromptSizeMode).toBe('full');
    expect(screen.getByLabelText('Select video model')).toBeTruthy();

    for (let iteration = 0; iteration < 14; iteration += 1) {
      fireEvent.wheel(root, { deltaY: 100, clientX: 400, clientY: 300 });
    }

    expect(embeddedPromptShell.dataset.embeddedPromptSizeMode).toBe('mini');
    expect(screen.queryByLabelText('Select video model')).toBeNull();
    expect(embeddedPromptShell.style.transform).toBe('scale(0.8)');
  });
});
