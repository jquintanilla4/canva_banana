import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ComponentProps, useState } from 'react';
import { Canvas } from '../Canvas';
import { buildSeedance2PromptBarControls } from '../../services/promptBarConfig';
import { Tool, type CanvasVideoPromptArea, type CanvasVideoPromptBar } from '../../types';
import { CANVAS_INTERACTION_BOUNDARY_ATTRIBUTE } from '../../utils/canvasInteractionBoundary';
import { EMBEDDED_VIDEO_PROMPT_BAR_SCREEN_BOTTOM_PADDING } from '../../utils/videoPromptAreas';

const buildCanvasProps = (overrides: Partial<ComponentProps<typeof Canvas>> = {}): ComponentProps<typeof Canvas> => ({
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
  onImageSelect: vi.fn(),
  onNoteSelect: vi.fn(),
  onSelectionReplace: vi.fn(),
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
  buildVideoPromptBarControls: () => [],
  embeddedVideoPromptBarModelOptions: [{ value: 'volcengine/seedance-2', label: 'Seedance 2' }],
  onCommit: vi.fn(),
  ...overrides,
});

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

  it('does not create a video prompt area when creation is gated off', async () => {
    const onVideoPromptAreasChange = vi.fn();
    const onCommit = vi.fn();

    render(
      <Canvas
        images={[]}
        onImagesChange={vi.fn()}
        notes={[]}
        onNotesChange={vi.fn()}
        videoPromptAreas={[]}
        onVideoPromptAreasChange={onVideoPromptAreasChange}
        videoPromptBars={[]}
        onVideoPromptBarsChange={vi.fn()}
        selectedVideoPromptAreaId={null}
        onVideoPromptAreaSelect={vi.fn()}
        videoPromptAreaMemberships={{}}
        tool={Tool.VIDEO_PROMPT_AREA}
        canCreateVideoPromptAreas={false}
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
        onCommit={onCommit}
      />,
    );

    const root = document.querySelector('[data-canvas-root="true"]') as HTMLElement;

    await act(async () => {
      fireEvent.mouseDown(root, { clientX: 40, clientY: 60 });
      fireEvent.mouseMove(root, { clientX: 420, clientY: 280 });
      fireEvent.mouseUp(root, { clientX: 420, clientY: 280 });
      await Promise.resolve();
    });

    expect(onVideoPromptAreasChange).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Video prompt area 01' })).toBeNull();
  });

  it('keeps Kling v3 embedded text-to-video submission enabled without area media', () => {
    const videoPromptArea: CanvasVideoPromptArea = {
      id: 'area-1',
      sequence: 1,
      label: 'Video prompt area 01',
      x: 40,
      y: 60,
      width: 720,
      height: 360,
      promptBarId: 'bar-1',
      orderedMediaIds: [],
    };
    const videoPromptBar: CanvasVideoPromptBar = {
      id: 'bar-1',
      assignedAreaId: 'area-1',
      modelId: 'fal-ai/kling-video/v3/pro',
      x: 0,
      y: 0,
      width: 720,
      height: 190,
      prompt: 'A neon city timelapse',
      negativePrompt: '',
      seedance2Variant: 'reference',
      seedance2AspectRatio: '16:9',
      seedance2Resolution: '720p',
      seedance2Duration: '5',
      seedance2GenerateAudio: false,
      seedance2CameraFixed: false,
      klingV3MultiPrompt: '',
      klingV3Duration: '5',
      klingV3GenerateAudio: true,
      klingV3CfgScale: '0.5',
      klingV3MultiPromptEnabled: false,
      klingV3Shot1Duration: '5',
      klingV3Shot2Duration: '5',
    };

    render(
      <Canvas
        {...buildCanvasProps({
          videoPromptAreas: [videoPromptArea],
          videoPromptBars: [videoPromptBar],
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
          embeddedVideoPromptBarModelOptions: [
            { value: 'volcengine/seedance-2', label: 'Seedance 2' },
            { value: 'fal-ai/kling-video/v3/pro', label: 'Kling 3.0 Pro' },
          ],
        })}
      />,
    );

    expect((screen.getByRole('button', { name: 'Generate' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('does not gate Kling Control embedded submission on Kling v3 multi-prompt text', () => {
    const videoPromptArea: CanvasVideoPromptArea = {
      id: 'area-1',
      sequence: 1,
      label: 'Video prompt area 01',
      x: 40,
      y: 60,
      width: 720,
      height: 360,
      promptBarId: 'bar-1',
      orderedMediaIds: [],
    };
    const videoPromptBar: CanvasVideoPromptBar = {
      id: 'bar-1',
      assignedAreaId: 'area-1',
      modelId: 'fal-ai/kling-video/v3/pro/motion-control',
      x: 0,
      y: 0,
      width: 720,
      height: 190,
      prompt: 'A guided motion shot',
      negativePrompt: '',
      seedance2Variant: 'reference',
      seedance2AspectRatio: '16:9',
      seedance2Resolution: '720p',
      seedance2Duration: '5',
      seedance2GenerateAudio: false,
      seedance2CameraFixed: false,
      klingV3MultiPrompt: '',
      klingV3Duration: '5',
      klingV3GenerateAudio: true,
      klingV3CfgScale: '0.5',
      klingV3MultiPromptEnabled: true,
      klingV3Shot1Duration: '5',
      klingV3Shot2Duration: '5',
    };

    render(
      <Canvas
        {...buildCanvasProps({
          videoPromptAreas: [videoPromptArea],
          videoPromptBars: [videoPromptBar],
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
          embeddedVideoPromptBarModelOptions: [
            { value: 'fal-ai/kling-video/v3/pro/motion-control', label: 'Kling 3.0 Control' },
          ],
        })}
      />,
    );

    expect((screen.getByRole('button', { name: 'Generate' }) as HTMLButtonElement).disabled).toBe(false);
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

    const swatchButton = screen.getByRole('button', { name: 'Video Prompt Area Border Color' });
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

  it('keeps assigned bars full through 50 percent zoom before switching to the reduced shell', () => {
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
          width: 2600,
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
            elementImageIds: [],
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
    const embeddedPromptScaleShell = embeddedPromptShell.firstElementChild as HTMLElement;
    const embeddedPromptBar = screen.getByTestId('prompt-bar-inline');

    expect(embeddedPromptShell.dataset.embeddedPromptSizeMode).toBe('full');
    expect(embeddedPromptShell.style.top).toBe(`${60 + 900 - EMBEDDED_VIDEO_PROMPT_BAR_SCREEN_BOTTOM_PADDING}px`);
    expect(embeddedPromptShell.style.transform).toBe('translate(-50%, -100%)');
    expect(screen.getByLabelText('Select video model')).toBeTruthy();
    expect(embeddedPromptScaleShell.style.transform).toBe('scale(1)');
    expect(embeddedPromptScaleShell.style.transformOrigin).toBe('bottom center');
    expect(parseFloat(embeddedPromptBar.style.width)).toBeGreaterThan(920);

    for (let iteration = 0; iteration < 7; iteration += 1) {
      fireEvent.wheel(root, { deltaY: 100, clientX: 400, clientY: 300 });
    }

    expect(embeddedPromptShell.dataset.embeddedPromptSizeMode).toBe('full');
    expect(embeddedPromptScaleShell.style.transform).toBe('scale(1)');

    fireEvent.wheel(root, { deltaY: 100, clientX: 400, clientY: 300 });

    expect(embeddedPromptShell.dataset.embeddedPromptSizeMode).toBe('full');
    expect(parseFloat(embeddedPromptScaleShell.style.transform.replace('scale(', '').replace(')', ''))).toBeGreaterThan(0.8);
    expect(parseFloat(embeddedPromptScaleShell.style.transform.replace('scale(', '').replace(')', ''))).toBeLessThan(1);

    for (let iteration = 0; iteration < 6; iteration += 1) {
      fireEvent.wheel(root, { deltaY: 100, clientX: 400, clientY: 300 });
    }

    expect(embeddedPromptShell.dataset.embeddedPromptSizeMode).toBe('mini');
    expect(screen.queryByLabelText('Select video model')).toBeNull();
    expect(embeddedPromptScaleShell.style.transform).toBe('scale(0.8)');
  });

  it('isolates portaled prompt-bar controls from canvas focus, note edits, and file drops', () => {
    const onFilesDrop = vi.fn();
    const onNotesChange = vi.fn();
    const onNoteDoubleClick = vi.fn();
    const Harness = () => {
      const [bars, setBars] = useState<CanvasVideoPromptBar[]>([{
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
      }]);

      return (
        <Canvas
          {...buildCanvasProps({
            videoPromptAreas: [{
              id: 'area-1',
              sequence: 1,
              label: 'Video prompt area 01',
              x: 40,
              y: 60,
              width: 2600,
              height: 900,
              promptBarId: 'bar-1',
              orderedMediaIds: ['image-1'],
            }],
            videoPromptBars: bars,
            onVideoPromptBarsChange: setBars,
            notes: [{
              id: 'note-behind-picker',
              x: 200,
              y: 300,
              width: 100,
              height: 100,
              text: 'Behind picker',
              backgroundColor: '#ffffff',
            }],
            videoPromptAreaMemberships: {
              'area-1': {
                orderedMediaIds: ['image-1'],
                acceptedImageIds: ['image-1'],
                acceptedVideoIds: [],
                acceptedAudioIds: [],
                elementImageIds: [],
                ignoredMediaIds: [],
                orderLabels: { 'image-1': '@Image1' },
              },
            },
            onVideoPromptBarUpdate: (barId, updater) => {
              setBars(currentBars => currentBars.map(bar => (
                bar.id === barId ? updater(bar) : bar
              )));
            },
            onFilesDrop,
            onNotesChange,
            onNoteDoubleClick,
            tool: Tool.NOTE,
          })}
        />
      );
    };

    const { container } = render(<Harness />);
    const canvasRoot = container.querySelector('[data-canvas-root="true"]') as HTMLElement;
    const textarea = screen.getByRole('textbox', { name: 'Prompt input' }) as HTMLTextAreaElement;
    textarea.focus();
    fireEvent.change(textarea, { target: { value: '@', selectionStart: 1 } });

    const suggestion = screen.getByRole('option', { name: '@Image1' });
    const droppedFile = new File(['image'], 'reference.png', { type: 'image/png' });
    const dropEvent = { clientX: 240, clientY: 320, dataTransfer: { files: [droppedFile] } };
    expect(suggestion.closest(`[${CANVAS_INTERACTION_BOUNDARY_ATTRIBUTE}]`)).toBeTruthy();
    fireEvent.dragOver(suggestion, dropEvent);
    fireEvent.drop(suggestion, dropEvent);
    expect(onFilesDrop).not.toHaveBeenCalled();

    fireEvent.mouseDown(suggestion); // Mirrors the browser event that previously let Canvas steal focus through the portal.

    expect(document.activeElement).toBe(textarea);
    expect(screen.getByRole('option', { name: '@Image1' })).toBeTruthy();
    expect(document.activeElement).not.toBe(canvasRoot);

    fireEvent.click(suggestion);

    expect(textarea.value).toBe('@Image1');
    expect(screen.queryByRole('option', { name: '@Image1' })).toBeNull();

    fireEvent.click(screen.getByRole('combobox', { name: 'Select video model' }));
    const modelOption = screen.getByRole('option', { name: 'Seedance 2' });
    expect(modelOption.closest(`[${CANVAS_INTERACTION_BOUNDARY_ATTRIBUTE}]`)).toBeTruthy();
    fireEvent.mouseDown(modelOption, { clientX: 240, clientY: 320, detail: 1 });
    fireEvent.mouseUp(modelOption, { clientX: 240, clientY: 320, detail: 1 });
    fireEvent.click(modelOption, { clientX: 240, clientY: 320, detail: 1 }); // The first click selects and unmounts the portaled option.
    expect(screen.queryByRole('option', { name: 'Seedance 2' })).toBeNull();

    fireEvent.mouseDown(canvasRoot, { clientX: 240, clientY: 320, detail: 2 }); // The browser retargets the repeated click after the portal closes.
    fireEvent.mouseUp(canvasRoot, { clientX: 240, clientY: 320, detail: 2 });
    fireEvent.click(canvasRoot, { clientX: 240, clientY: 320, detail: 2 });
    fireEvent.doubleClick(canvasRoot, { clientX: 240, clientY: 320, detail: 2 }); // The emitted dblclick must remain part of the suppressed sequence.
    expect(onNotesChange).not.toHaveBeenCalled();
    expect(onNoteDoubleClick).not.toHaveBeenCalled();

    fireEvent.doubleClick(canvasRoot, { clientX: 240, clientY: 320, detail: 2 }); // Suppression must not leak into a later legitimate Canvas gesture.
    expect(onNoteDoubleClick).toHaveBeenCalledWith('note-behind-picker');
  });

  it('keeps the browser context menu available on portaled picker padding', () => {
    const area: CanvasVideoPromptArea = {
      id: 'area-1',
      sequence: 1,
      label: 'Video prompt area 01',
      x: 40,
      y: 60,
      width: 2600,
      height: 900,
      promptBarId: 'bar-1',
      orderedMediaIds: [],
    };
    const bar: CanvasVideoPromptBar = {
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
    };

    render(
      <Canvas
        {...buildCanvasProps({
          tool: Tool.FREE_SELECTION,
          videoPromptAreas: [area],
          videoPromptBars: [bar],
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

    fireEvent.click(screen.getByRole('combobox', { name: 'Select video model' }));
    const listbox = screen.getByRole('listbox', { name: 'Select video model' });

    expect(listbox.parentElement).toBe(document.body);
    expect(fireEvent.contextMenu(listbox)).toBe(true); // Canvas must not cancel detached control context menus.
  });

  it('shows the shared Seedance 2 labels and updates embedded audio and camera toggles', () => {
    const Harness = () => {
      const [bars, setBars] = useState<CanvasVideoPromptBar[]>([{
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
      }]);

      const handleVideoPromptBarUpdate = (barId: string, updater: (bar: CanvasVideoPromptBar) => CanvasVideoPromptBar) => {
        setBars(currentBars => currentBars.map(bar => (
          bar.id === barId ? updater(bar) : bar
        )));
      };

      return (
        <>
          <output data-testid="seedance2-audio-state">{bars[0]?.seedance2GenerateAudio ? 'true' : 'false'}</output>
          <output data-testid="seedance2-camera-state">{bars[0]?.seedance2CameraFixed ? 'true' : 'false'}</output>
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
              width: 2600,
              height: 900,
              promptBarId: 'bar-1',
              orderedMediaIds: ['image-1'],
            }]}
            onVideoPromptAreasChange={vi.fn()}
            videoPromptBars={bars}
            onVideoPromptBarsChange={setBars}
            selectedVideoPromptAreaId={null}
            onVideoPromptAreaSelect={vi.fn()}
            videoPromptAreaMemberships={{
              'area-1': {
                orderedMediaIds: ['image-1'],
                acceptedImageIds: ['image-1'],
                acceptedVideoIds: [],
                acceptedAudioIds: [],
                elementImageIds: [],
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
            onVideoPromptBarUpdate={handleVideoPromptBarUpdate}
            onVideoPromptBarSubmit={vi.fn()}
            buildVideoPromptBarControls={(bar) => buildSeedance2PromptBarControls({
              idPrefix: bar.id,
              seedance2Variant: bar.seedance2Variant,
              seedance2AspectRatio: bar.seedance2AspectRatio,
              seedance2Resolution: bar.seedance2Resolution,
              seedance2Duration: bar.seedance2Duration,
              seedance2GenerateAudio: bar.seedance2GenerateAudio,
              seedance2CameraFixed: bar.seedance2CameraFixed,
              isLoading: false,
              onSeedance2VariantChange: value => handleVideoPromptBarUpdate(bar.id, currentBar => ({ ...currentBar, seedance2Variant: value })),
              onSeedance2AspectRatioChange: value => handleVideoPromptBarUpdate(bar.id, currentBar => ({ ...currentBar, seedance2AspectRatio: value })),
              onSeedance2ResolutionChange: value => handleVideoPromptBarUpdate(bar.id, currentBar => ({ ...currentBar, seedance2Resolution: value })),
              onSeedance2DurationChange: value => handleVideoPromptBarUpdate(bar.id, currentBar => ({ ...currentBar, seedance2Duration: value })),
              onSeedance2GenerateAudioChange: value => handleVideoPromptBarUpdate(bar.id, currentBar => ({ ...currentBar, seedance2GenerateAudio: value })),
              onSeedance2CameraFixedChange: value => handleVideoPromptBarUpdate(bar.id, currentBar => ({ ...currentBar, seedance2CameraFixed: value })),
            })}
            embeddedVideoPromptBarModelOptions={[{ value: 'volcengine/seedance-2', label: 'Seedance 2' }]}
            onCommit={vi.fn()}
          />
        </>
      );
    };

    render(<Harness />);

    const promptBar = within(screen.getByTestId('prompt-bar-inline'));
    expect(promptBar.getByText('AR')).toBeTruthy();
    expect(promptBar.getByText('Resolution')).toBeTruthy();
    expect(promptBar.getByText('Camera')).toBeTruthy();
    expect(promptBar.getByText('Audio')).toBeTruthy();

    const audioPicker = promptBar.getByRole('combobox', { name: 'Toggle Seedance 2 audio generation' });
    expect(audioPicker.textContent).toContain('Off');

    fireEvent.click(audioPicker);
    fireEvent.click(screen.getByRole('option', { name: 'On' }));

    const updatedAudioPicker = promptBar.getByRole('combobox', { name: 'Toggle Seedance 2 audio generation' });
    expect(updatedAudioPicker.textContent).toContain('On');
    expect(screen.getByTestId('seedance2-audio-state').textContent).toBe('true');

    const cameraPicker = promptBar.getByRole('combobox', { name: 'Toggle Seedance 2 camera fixed' });
    expect(cameraPicker.textContent).toContain('Free');

    fireEvent.click(cameraPicker);
    fireEvent.click(screen.getByRole('option', { name: 'Fixed' }));

    const updatedCameraPicker = promptBar.getByRole('combobox', { name: 'Toggle Seedance 2 camera fixed' });
    expect(updatedCameraPicker.textContent).toContain('Fixed');
    expect(screen.getByTestId('seedance2-camera-state').textContent).toBe('true');
  });

  it('normalizes hidden Jimeng-incompatible Seedance 2 values when switching embedded models', () => {
    const Harness = () => {
      const [bars, setBars] = useState<CanvasVideoPromptBar[]>([{
        id: 'bar-1',
        assignedAreaId: 'area-1',
        prompt: 'Area prompt',
        negativePrompt: '',
        modelId: 'volcengine/seedance-2',
        seedance2Variant: 'reference',
        seedance2JimengModelVersion: 'seedance2.0fast',
        seedance2AspectRatio: 'adaptive',
        seedance2Resolution: '1080p',
        seedance2Duration: '5',
        seedance2GenerateAudio: false,
        seedance2CameraFixed: false,
        falOptions: {
          seedance2JimengModelVersion: 'seedance2.0fast',
          seedance2AspectRatio: 'adaptive',
          seedance2Resolution: '1080p',
        },
        x: 180,
        y: 600,
        width: 920,
        height: 190,
      }]);
      const handleVideoPromptBarUpdate = (barId: string, updater: (bar: CanvasVideoPromptBar) => CanvasVideoPromptBar) => {
        setBars(currentBars => currentBars.map(bar => (bar.id === barId ? updater(bar) : bar)));
      };

      return (
        <>
          <output data-testid="bar-state">{JSON.stringify(bars[0])}</output>
          <Canvas
            {...buildCanvasProps({
              videoPromptAreas: [{
                id: 'area-1',
                sequence: 1,
                label: 'Video prompt area 01',
                x: 40,
                y: 60,
                width: 900,
                height: 520,
                promptBarId: 'bar-1',
                orderedMediaIds: ['image-1'],
              }],
              videoPromptBars: bars,
              onVideoPromptBarsChange: setBars,
              videoPromptAreaMemberships: {
                'area-1': {
                  orderedMediaIds: ['image-1'],
                  acceptedImageIds: ['image-1'],
                  acceptedVideoIds: [],
                  acceptedAudioIds: [],
                  elementImageIds: [],
                  ignoredMediaIds: [],
                  orderLabels: { 'image-1': '@Image1' },
                },
              },
              onVideoPromptBarUpdate: handleVideoPromptBarUpdate,
              buildVideoPromptBarControls: () => [],
              embeddedVideoPromptBarModelOptions: [
                { value: 'volcengine/seedance-2', label: 'Seedance 2 (VE)' },
                { value: 'jimeng-cli/seedance-2', label: 'Seedance 2 (JM CLI)' },
              ],
            })}
          />
        </>
      );
    };

    render(<Harness />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Select video model' }));
    fireEvent.click(screen.getByRole('option', { name: 'Seedance 2 (JM CLI)' }));

    const state = JSON.parse(screen.getByTestId('bar-state').textContent ?? '{}') as CanvasVideoPromptBar;
    expect(state.modelId).toBe('jimeng-cli/seedance-2');
    expect(state.seedance2AspectRatio).toBe('16:9');
    expect(state.seedance2Resolution).toBe('720p');
    expect(state.falOptions?.seedance2AspectRatio).toBe('16:9');
    expect(state.falOptions?.seedance2Resolution).toBe('720p');
  });

  it('keeps Smart embedded submits enabled with no accepted area media but blocks empty Reference submits', () => {
    const buildCanvas = (seedance2Variant: 'smart' | 'reference') => (
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
          width: 900,
          height: 520,
          promptBarId: 'bar-1',
          orderedMediaIds: [],
        }]}
        onVideoPromptAreasChange={vi.fn()}
        videoPromptBars={[{
          id: 'bar-1',
          assignedAreaId: 'area-1',
          prompt: 'Area prompt',
          negativePrompt: '',
          seedance2Variant,
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
            orderedMediaIds: [],
            acceptedImageIds: [],
            acceptedVideoIds: [],
            acceptedAudioIds: [],
            elementImageIds: [],
            ignoredMediaIds: [],
            orderLabels: {},
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

    const { rerender } = render(buildCanvas('smart'));

    expect(screen.getByRole('button', { name: 'Generate' }).hasAttribute('disabled')).toBe(false);

    rerender(buildCanvas('reference'));

    expect(screen.getByRole('button', { name: 'Generate' }).hasAttribute('disabled')).toBe(true);
  });

  it('keeps the full shell at the legacy readable width in narrow areas', () => {
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
          width: 280,
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
            elementImageIds: [],
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

    const root = container.querySelector('[data-canvas-root="true"]') as HTMLElement;

    for (let iteration = 0; iteration < 8; iteration += 1) {
      fireEvent.wheel(root, { deltaY: 100, clientX: 400, clientY: 300 });
    }

    const embeddedPromptShell = screen.getByRole('button', { name: 'Seedance 2' }).closest('[data-embedded-prompt-size-mode]') as HTMLElement;
    const embeddedPromptScaleShell = embeddedPromptShell.firstElementChild as HTMLElement;
    const embeddedPromptBar = screen.getByTestId('prompt-bar-inline');

    expect(embeddedPromptShell.dataset.embeddedPromptSizeMode).toBe('full');
    expect(parseFloat(embeddedPromptScaleShell.style.transform.replace('scale(', '').replace(')', ''))).toBeGreaterThan(0.8);
    expect(parseFloat(embeddedPromptBar.style.width)).toBe(920);
  });

  it('anchors assigned-bar drags to the rendered shell bounds', async () => {
    const handleVideoPromptBarsChange = vi.fn();
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
          width: 2600,
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
        onVideoPromptBarsChange={handleVideoPromptBarsChange}
        selectedVideoPromptAreaId={null}
        onVideoPromptAreaSelect={vi.fn()}
        videoPromptAreaMemberships={{
          'area-1': {
            orderedMediaIds: ['image-1'],
            acceptedImageIds: ['image-1'],
            acceptedVideoIds: [],
            acceptedAudioIds: [],
            elementImageIds: [],
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

    const root = container.querySelector('[data-canvas-root="true"]') as HTMLElement;
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    const modelBadgeButton = screen.getByRole('button', { name: 'Seedance 2' });
    const renderedShell = modelBadgeButton.parentElement as HTMLElement;
    const canvasRect = {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1200,
      bottom: 800,
      width: 1200,
      height: 800,
      toJSON: () => ({}),
    } as DOMRect;
    const renderedShellRect = {
      x: 100,
      y: 200,
      left: 100,
      top: 200,
      right: 1180,
      bottom: 420,
      width: 1080,
      height: 220,
      toJSON: () => ({}),
    } as DOMRect;

    Object.defineProperty(canvas, 'getBoundingClientRect', { configurable: true, value: () => canvasRect });
    Object.defineProperty(renderedShell, 'getBoundingClientRect', { configurable: true, value: () => renderedShellRect });

    await act(async () => {
      fireEvent.mouseDown(modelBadgeButton, { clientX: 110, clientY: 210 });
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.mouseMove(root, { clientX: 120, clientY: 220 });
      await Promise.resolve();
    });

    const nextBars = handleVideoPromptBarsChange.mock.lastCall?.[0] as CanvasVideoPromptBar[] | undefined;

    expect(nextBars).toBeTruthy();
    expect(nextBars?.[0]?.assignedAreaId).toBeNull();
    expect(nextBars?.[0]?.x).toBe(110);
    expect(nextBars?.[0]?.y).toBe(210);
  });
});
