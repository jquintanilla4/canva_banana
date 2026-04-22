import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { Tool, type CanvasImage } from '../types';
import { FLOATING_EDGE_CONTROL_SIDE_OFFSET } from '../utils/promptBarFooterLayout';

const buildCanvasMedia = (id: string, mediaType: CanvasImage['mediaType']): CanvasImage => ({
  id,
  element: document.createElement(mediaType === 'video' ? 'video' : 'img'),
  mediaType,
  x: 0,
  y: 0,
  width: 320,
  height: 180,
  rotation: 0,
  naturalWidth: 320,
  naturalHeight: 180,
  file: new File(['test'], `${id}.${mediaType === 'audio' ? 'mp3' : mediaType === 'video' ? 'mp4' : 'png'}`, {
    type: mediaType === 'audio' ? 'audio/mpeg' : mediaType === 'video' ? 'video/mp4' : 'image/png',
  }),
}); // The embedded prompt tests only need media ids/types, so minimal canvas items keep setup lean.

const mockState = vi.hoisted(() => {
  const handleGenerate = vi.fn();
  const setReferenceImageIds = vi.fn();
  const baseVideoPromptArea = {
    id: 'area-1',
    sequence: 1,
    label: 'Video prompt area 01',
    x: 0,
    y: 0,
    width: 320,
    height: 180,
    promptBarId: 'bar-1',
    orderedMediaIds: [],
  };
  const baseVideoPromptBar = {
    id: 'bar-1',
    assignedAreaId: 'area-1',
    x: 0,
    y: 0,
    width: 320,
    height: 72,
    prompt: 'Existing area prompt',
    negativePrompt: '',
    modelId: undefined as string | undefined,
    seedance2Variant: 'reference',
    seedance2AspectRatio: '16:9',
    seedance2Resolution: '720p',
    seedance2Duration: '5',
    seedance2GenerateAudio: false,
    seedance2CameraFixed: false,
  };
  const falState: any = {
    falModelMode: 'video',
    falModelId: 'volcengine/seedance-2',
    falImageModelId: 'fal-ai/flux/dev',
    falVideoModelId: 'volcengine/seedance-2',
    isVideoMode: true,
    isKlingVideoModel: false,
    isKlingO1VideoModel: false,
    isKling26VideoModel: false,
    isKling26ControlVideoModel: false,
    isHailuoVideoModel: false,
    isWanAnimateVideoModel: false,
    isOneToAllAnimateVideoModel: false,
    isLipsyncVideoModel: false,
    isHeygenV3LipsyncVideoModel: false,
    isInfinitalkVideoModel: false,
    isGrokImagineVideoModel: false,
    isWan26I2VVideoModel: false,
    isSeedance15VideoModel: false,
    isSeedance2VideoModel: true,
    isFalSeedance2VideoModel: false,
    isVolcengineSeedance2VideoModel: true,
    isVeo31VideoModel: false,
    isFlux2MaxModel: false,
    isWan27ImageModel: false,
    isUpscaleModel: false,
    isKlingProVideoSelection: false,
    isKlingO1EditMode: false,
    isKlingO1RefV2VMode: false,
    falImageSizeSelection: 'default',
    falAspectRatioSelection: 'default',
    falResolutionSelection: '720p',
    falNumImages: 1,
    falScaleFactor: 2,
    falNoiseScale: 0.5,
    falCreativity: 0.5,
    falVideoDuration: '5',
    hailuoVariant: 'standard',
    klingVariant: 'standard',
    klingO1Variant: 'refI2V',
    klingO1KeepAudio: false,
    kling26AudioSelection: 'off',
    kling26ControlVariant: 'standard',
    kling26ControlKeepSound: false,
    kling26ControlDriver: 'video',
    wanTargetResolution: '720p',
    wanCreativity: 0,
    wanAnimateVariant: 'replace',
    wanAnimateSteps: '10',
    wanAnimateResolution: '480p',
    oneToAllAnimateResolution: '480p',
    wanAnimateShift: '5.0',
    wanAnimateQuality: 'high',
    wanAnimateUseTurbo: false,
    lipsyncSyncMode: 'cut_off',
    heygenEnableCaption: false,
    heygenEnableDynamicDuration: true,
    heygenDisableMusicTrack: false,
    heygenEnableSpeechEnhancement: false,
    infinitalkResolution: '480p',
    infinitalkSeed: '42',
    infinitalkAcceleration: 'none',
    infinitalkDuration: '5s',
    grokImagineVideoDuration: '5',
    grokImagineVideoResolution: '720p',
    grokImagineVideoAspectRatio: '16:9',
    veo31Variant: 'i2v-fflf',
    veo31Duration: '4s',
    veo31Resolution: '720p',
    veo31AspectRatio: 'auto',
    veo31GenerateAudio: false,
    wan26Resolution: '720p',
    wan26Duration: '5',
    wan26PromptExpansion: false,
    wan26MultiShots: false,
    seedance15AspectRatio: '16:9',
    seedance15Resolution: '720p',
    seedance15Duration: '5',
    seedance15CameraFixed: false,
    seedance15Audio: false,
    seedance2Variant: 'reference',
    seedance2AspectRatio: '16:9',
    seedance2Resolution: '720p',
    seedance2Duration: '5',
    seedance2GenerateAudio: false,
    seedance2CameraFixed: false,
    flux2MaxImageSize: 'landscape_16_9',
    wan27ImageAspectRatio: 'landscape_16_9',
    wan27ImageMaxImages: '1',
  };

  falState.handleModelModeChange = vi.fn((mode: 'image' | 'video') => {
    falState.falModelMode = mode;
    falState.isVideoMode = mode === 'video';
    falState.falModelId = mode === 'video' ? 'volcengine/seedance-2' : 'fal-ai/flux/dev';
    falState.isSeedance2VideoModel = mode === 'video';
    falState.isFalSeedance2VideoModel = false;
    falState.isVolcengineSeedance2VideoModel = mode === 'video';
  });
  falState.handleFalModelChange = vi.fn();
  falState.handleFalVideoDurationChange = vi.fn();
  falState.handleHailuoVariantChange = vi.fn();
  falState.handleKlingVariantChange = vi.fn();
  falState.handleKlingO1VariantChange = vi.fn();
  falState.handleKlingO1KeepAudioChange = vi.fn();
  falState.handleKling26AudioChange = vi.fn();
  falState.handleKling26ControlVariantChange = vi.fn();
  falState.handleKling26ControlKeepSoundChange = vi.fn();
  falState.handleKling26ControlDriverChange = vi.fn();
  falState.handleWanTargetResolutionChange = vi.fn();
  falState.handleWanCreativityChange = vi.fn();
  falState.handleWanAnimateVariantChange = vi.fn();
  falState.handleWanAnimateStepsChange = vi.fn();
  falState.handleWanAnimateResolutionChange = vi.fn();
  falState.handleOneToAllAnimateResolutionChange = vi.fn();
  falState.handleWanAnimateShiftChange = vi.fn();
  falState.handleWanAnimateQualityChange = vi.fn();
  falState.handleWanAnimateTurboChange = vi.fn();
  falState.handleLipsyncSyncModeChange = vi.fn();
  falState.handleHeygenEnableCaptionChange = vi.fn();
  falState.handleHeygenEnableDynamicDurationChange = vi.fn();
  falState.handleHeygenDisableMusicTrackChange = vi.fn();
  falState.handleHeygenEnableSpeechEnhancementChange = vi.fn();
  falState.handleInfinitalkResolutionChange = vi.fn();
  falState.handleInfinitalkSeedChange = vi.fn();
  falState.handleInfinitalkAccelerationChange = vi.fn();
  falState.handleInfinitalkDurationChange = vi.fn();
  falState.handleGrokImagineVideoDurationChange = vi.fn();
  falState.handleGrokImagineVideoResolutionChange = vi.fn();
  falState.handleGrokImagineVideoAspectRatioChange = vi.fn();
  falState.handleVeo31VariantChange = vi.fn();
  falState.handleVeo31DurationChange = vi.fn();
  falState.handleVeo31ResolutionChange = vi.fn();
  falState.handleVeo31AspectRatioChange = vi.fn();
  falState.handleVeo31GenerateAudioChange = vi.fn();
  falState.handleWan26ResolutionChange = vi.fn();
  falState.handleWan26DurationChange = vi.fn();
  falState.handleWan26PromptExpansionChange = vi.fn();
  falState.handleWan26MultiShotsChange = vi.fn();
  falState.handleSeedance15AspectRatioChange = vi.fn();
  falState.handleSeedance15ResolutionChange = vi.fn();
  falState.handleSeedance15DurationChange = vi.fn();
  falState.handleSeedance15CameraFixedChange = vi.fn();
  falState.handleSeedance15AudioChange = vi.fn();
  falState.handleSeedance2VariantChange = vi.fn();
  falState.handleSeedance2AspectRatioChange = vi.fn();
  falState.handleSeedance2ResolutionChange = vi.fn();
  falState.handleSeedance2DurationChange = vi.fn();
  falState.handleSeedance2GenerateAudioChange = vi.fn();
  falState.handleSeedance2CameraFixedChange = vi.fn();
  falState.handleFlux2MaxImageSizeChange = vi.fn();
  falState.handleWan27ImageAspectRatioChange = vi.fn();
  falState.handleWan27ImageMaxImagesChange = vi.fn();
  falState.handleFalImageSizeChange = vi.fn();
  falState.handleFalAspectRatioChange = vi.fn();
  falState.handleFalResolutionChange = vi.fn();
  falState.handleFalNumImagesChange = vi.fn();
  falState.handleFalScaleFactorChange = vi.fn();
  falState.handleFalNoiseScaleChange = vi.fn();
  falState.handleFalCreativityChange = vi.fn();

  return {
    handleGenerate,
    setReferenceImageIds,
    falState,
    images: [] as CanvasImage[],
    displayedImages: [] as CanvasImage[],
    lastCanvasProps: null as Record<string, unknown> | null,
    baseVideoPromptArea,
    baseVideoPromptBar,
    videoPromptAreas: [{ ...baseVideoPromptArea }],
    videoPromptBars: [{ ...baseVideoPromptBar }],
    displayedVideoPromptAreas: [{ ...baseVideoPromptArea }],
    displayedVideoPromptBars: [{ ...baseVideoPromptBar }],
  };
});

vi.mock('../components/Toolbar', () => ({
  Toolbar: ({ activeTool, onToolChange, isVideoPromptAreaToolEnabled }: { activeTool: Tool; onToolChange: (tool: Tool) => void; isVideoPromptAreaToolEnabled: boolean }) => (
    <div>
      <span data-testid="active-tool">{activeTool}</span>
      <span data-testid="video-tool-enabled">{String(isVideoPromptAreaToolEnabled)}</span>
      <button type="button" onClick={() => onToolChange(Tool.VIDEO_PROMPT_AREA)}>
        Activate Video Prompt Area
      </button>
    </div>
  ),
}));

vi.mock('../components/PromptBar', () => ({
  PromptBar: ({ onModelModeChange, leadingAccessory }: { onModelModeChange: (mode: 'image' | 'video') => void; leadingAccessory?: ReactNode }) => (
    <div>
      <button type="button" onClick={() => onModelModeChange('image')}>
        Switch To Image
      </button>
      {leadingAccessory}
    </div>
  ),
}));

vi.mock('../components/Canvas', () => ({
  Canvas: (props: { onVideoPromptBarSubmit: (barId: string) => void } & Record<string, unknown>) => {
    mockState.lastCanvasProps = props;
    return (
      <button type="button" onClick={() => props.onVideoPromptBarSubmit('bar-1')}>
        Submit Embedded Prompt
      </button>
    );
  },
}));

vi.mock('../components/RecordingOverlay', () => ({ RecordingOverlay: () => null }));
vi.mock('../components/BackupsModal', () => ({ BackupsModal: () => null }));
vi.mock('../components/FalQueuePanel', () => ({ FalQueuePanel: () => null }));
vi.mock('../components/DebugLogPanel', () => ({ DebugLogPanel: () => null }));
vi.mock('../components/FileMenu', () => ({
  FileMenu: () => (
    <button type="button" aria-label="Snapshot menu">
      Menu
    </button>
  ),
}));
vi.mock('../components/ViewToolbar', () => ({ ViewToolbar: () => null }));
vi.mock('../components/ProviderSwitcher', () => ({ ProviderSwitcher: () => null }));
vi.mock('../components/StatusBanner', () => ({ StatusBanner: () => null }));
vi.mock('../components/ImageResizeToast', () => ({ ImageResizeToast: () => null }));

vi.mock('../hooks/useCanvasHistory', () => ({
  useCanvasHistory: () => ({
    images: mockState.images,
    paths: [],
    notes: [],
    videoPromptAreas: mockState.videoPromptAreas,
    videoPromptBars: mockState.videoPromptBars,
    displayedImages: mockState.displayedImages,
    displayedPaths: [],
    displayedNotes: [],
    displayedVideoPromptAreas: mockState.displayedVideoPromptAreas,
    displayedVideoPromptBars: mockState.displayedVideoPromptBars,
    setState: vi.fn(),
    setLiveImages: vi.fn(),
    setLivePaths: vi.fn(),
    setLiveNotes: vi.fn(),
    setLiveVideoPromptAreas: vi.fn(),
    setLiveVideoPromptBars: vi.fn(),
    commit: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: false,
    canRedo: false,
    resetHistory: vi.fn(),
  }),
}));

vi.mock('../hooks/useSelectionState', () => ({
  useSelectionState: () => ({
    selectedImageIds: [],
    selectedNoteIds: [],
    referenceImageIds: [],
    referenceVideoIds: [],
    referenceAudioIds: [],
    seedanceReferenceOrderIds: [],
    elementImageIds: [],
    videoLastFrameImageId: null,
    sourceVideoId: null,
    sourceAudioId: null,
    primaryImageId: null,
    primarySelectionMediaType: null,
    activePrimaryImage: null,
    hasSingleImageSelected: false,
    setSelectedImageIds: vi.fn(),
    setSelectedNoteIds: vi.fn(),
    setReferenceImageIds: mockState.setReferenceImageIds,
    setReferenceVideoIds: vi.fn(),
    setReferenceAudioIds: vi.fn(),
    setElementImageIds: vi.fn(),
    setVideoLastFrameImageId: vi.fn(),
    setSourceVideoId: vi.fn(),
    setSourceAudioId: vi.fn(),
    handleImageSelection: vi.fn(),
    handleNoteSelection: vi.fn(),
  }),
}));

vi.mock('../hooks/useFalSettings', () => ({
  useFalSettings: () => mockState.falState,
}));

vi.mock('../hooks/useGeneration', () => ({
  useGeneration: () => ({
    handleGenerate: mockState.handleGenerate,
  }),
}));

vi.mock('../hooks/useSnapshotIO', () => ({
  useSnapshotIO: () => ({
    exportSnapshot: vi.fn(),
    importSnapshotFromFile: vi.fn(),
    importSnapshotWithPicker: (callback: () => void) => callback(),
    autosaveSnapshot: vi.fn(),
  }),
}));

vi.mock('../hooks/useCanvasMediaActions', () => ({
  useCanvasMediaActions: () => ({
    cropMode: null,
    transformMode: null,
    isRemovingBackground: false,
    handleFilesDrop: vi.fn(),
    handleFileChange: vi.fn(),
    handleDownload: vi.fn(),
    handleBackgroundRemoval: vi.fn(),
    handleStartCrop: vi.fn(),
    handleCropRectChange: vi.fn(),
    handleConfirmCrop: vi.fn(),
    handleCancelCrop: vi.fn(),
    handleStartTransform: vi.fn(),
    handleExitTransform: vi.fn(),
  }),
}));

vi.mock('../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => undefined,
}));

vi.mock('../hooks/useAudioRecording', () => ({
  useAudioRecording: () => ({
    isRecording: false,
    recordingDuration: 0,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    error: null,
  }),
}));

vi.mock('../hooks/useGenerationGuards', () => ({
  useGenerationGuards: () => ({
    submitDisabled: false,
    promptPlaceholderText: 'Describe your generation',
    disablePromptInput: false,
    shouldValidateFalOptions: false,
    isNumImagesInvalid: false,
    isTextToImage: false,
  }),
}));

vi.mock('../hooks/useImageResize', () => ({
  useImageResize: () => ({
    isOpen: false,
    width: 0,
    height: 0,
    keepAspect: true,
    isProcessing: false,
    canResize: false,
    open: vi.fn(),
    cancel: vi.fn(),
    setWidth: vi.fn(),
    setHeight: vi.fn(),
    setKeepAspect: vi.fn(),
    confirm: vi.fn(),
  }),
}));

vi.mock('../hooks/useDuplicateCanvasMedia', () => ({
  useDuplicateCanvasMedia: () => ({
    duplicateNote: vi.fn(),
    duplicateImage: vi.fn(),
  }),
}));

vi.mock('../hooks/useKlingReferenceHelpers', () => ({
  useKlingReferenceHelpers: () => ({
    referenceOrderLabels: {},
    elementOrderLabels: {},
  }),
}));

vi.mock('../hooks/useKlingPromptMentions', () => ({
  useKlingPromptMentions: () => ({
    klingPromptMentions: [],
    klingReferenceCount: 0,
  }),
}));

vi.mock('../hooks/useVideoNegativePrompt', () => ({
  useVideoNegativePrompt: () => ({
    videoNegativePrompt: '',
    setVideoNegativePrompt: vi.fn(),
    shouldShowVideoNegativePrompt: false,
  }),
}));

vi.mock('../hooks/useFalQueueJobs', () => ({
  useFalQueueJobs: () => ({
    falJobs: [],
    setFalJobs: vi.fn(),
    dismissFalJob: vi.fn(),
  }),
}));

vi.mock('../hooks/useDebugLogState', () => ({
  useDebugLogState: () => ({
    isDebugLogOpen: false,
    debugLogEntries: [],
    openDebugLogPanel: vi.fn(),
    closeDebugLogPanel: vi.fn(),
    copyLastEntry: vi.fn(),
  }),
}));

vi.mock('../services/backupService', () => ({
  listBackupSessions: vi.fn(),
  getBackupSession: vi.fn(),
}));

vi.mock('../services/audioService', () => ({
  convertAudioBlobToWav: vi.fn(),
  generateWaveformImage: vi.fn(),
  loadAudioFromBlob: vi.fn(),
}));

vi.mock('../services/debugLog', () => ({
  clearDebugLogs: vi.fn(),
}));

afterEach(() => {
  cleanup();
  mockState.handleGenerate.mockClear();
  mockState.setReferenceImageIds.mockClear();
  mockState.images = [];
  mockState.displayedImages = [];
  mockState.lastCanvasProps = null;
  mockState.videoPromptAreas = [{ ...mockState.baseVideoPromptArea }];
  mockState.videoPromptBars = [{ ...mockState.baseVideoPromptBar }];
  mockState.displayedVideoPromptAreas = [{ ...mockState.baseVideoPromptArea }];
  mockState.displayedVideoPromptBars = [{ ...mockState.baseVideoPromptBar }];
  Object.assign(mockState.falState, {
    falModelMode: 'video',
    falModelId: 'volcengine/seedance-2',
    falVideoModelId: 'volcengine/seedance-2',
    isVideoMode: true,
    isSeedance2VideoModel: true,
    isFalSeedance2VideoModel: false,
    isVolcengineSeedance2VideoModel: true,
  });
  mockState.falState.handleModelModeChange.mockClear();
});

describe('App video prompt area gating', () => {
  it('renders the top control rail that centers the menu button and zoom badge with the toolbar row', () => {
    render(<App />);

    const rail = screen.getByTestId('top-control-rail');

    expect(rail.classList.contains('top-4')).toBe(true);
    expect(rail.classList.contains('z-30')).toBe(true);
    expect(rail.classList.contains('h-12')).toBe(true);
    expect(rail.classList.contains('items-center')).toBe(true);
    expect(rail.style.paddingInline).toBe(FLOATING_EDGE_CONTROL_SIDE_OFFSET);
    expect(screen.getByLabelText('Snapshot menu').closest('[data-testid="top-control-rail"]')).toBe(rail);
    expect(screen.getByLabelText('Canvas zoom 100%').closest('[data-testid="top-control-rail"]')).toBe(rail);
  });

  it('hides the footer add button when video mode has no video prompt areas', () => {
    mockState.videoPromptAreas = [];
    mockState.videoPromptBars = [];
    mockState.displayedVideoPromptAreas = [];
    mockState.displayedVideoPromptBars = [];

    render(<App />);

    expect(screen.queryByRole('button', { name: 'Create video prompt bar' })).toBeNull();
  });

  it('shows the footer add button when video mode has at least one video prompt area', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: 'Create video prompt bar' })).toBeTruthy();
  });

  it('hides the footer add button after switching away from video mode even when areas still exist', async () => {
    const { rerender } = render(<App />);

    expect(screen.getByRole('button', { name: 'Create video prompt bar' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Switch To Image' }));
    rerender(<App />);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Create video prompt bar' })).toBeNull();
    });
  });

  it('falls back to selection after switching to image mode and still submits existing embedded video prompt bars', async () => {
    const { rerender } = render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Activate Video Prompt Area' }));

    expect(screen.getByTestId('active-tool').textContent).toBe(Tool.VIDEO_PROMPT_AREA);
    expect(screen.getByTestId('video-tool-enabled').textContent).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Switch To Image' }));
    rerender(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('active-tool').textContent).toBe(Tool.SELECTION);
    });

    expect(screen.getByTestId('video-tool-enabled').textContent).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Submit Embedded Prompt' }));

    expect(mockState.handleGenerate).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'video',
      prompt: 'Existing area prompt',
      provider: 'volcengine',
      modelId: 'volcengine/seedance-2',
      modelMode: 'video',
      primaryImageId: undefined,
      videoLastFrameImageId: undefined,
      referenceImageIds: [],
      referenceVideoIds: [],
      referenceAudioIds: [],
    }));
  });

  it('submits Seedance 2 (FAL) embedded video prompt bars through Fal options', () => {
    mockState.videoPromptBars = [{
      ...mockState.baseVideoPromptBar,
      modelId: 'bytedance/seedance-2.0',
      seedance2Variant: 'reference',
      seedance2GenerateAudio: true,
    }];
    mockState.displayedVideoPromptBars = [{
      ...mockState.baseVideoPromptBar,
      modelId: 'bytedance/seedance-2.0',
      seedance2Variant: 'reference',
      seedance2GenerateAudio: true,
    }];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Submit Embedded Prompt' }));

    expect(mockState.lastCanvasProps?.embeddedVideoPromptBarModelOptions).toEqual([
      { value: 'volcengine/seedance-2', label: 'Seedance 2' },
      { value: 'bytedance/seedance-2.0', label: 'Seedance 2 (FAL)' },
    ]);
    expect(mockState.handleGenerate).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'video',
      provider: 'fal',
      modelId: 'bytedance/seedance-2.0',
      falOptions: expect.objectContaining({
        seedance2Variant: 'reference',
        seedance2GenerateAudio: true,
      }),
    }));
    expect(mockState.handleGenerate).toHaveBeenCalledWith(expect.not.objectContaining({
      volcengineOptions: expect.anything(),
    }));
  });

  it('maps the first area image into Seedance Smart primaryImageId without canvas selection', () => {
    const image1 = buildCanvasMedia('image-1', 'image');
    mockState.images = [image1];
    mockState.displayedImages = [image1];
    mockState.videoPromptAreas = [{ ...mockState.baseVideoPromptArea, orderedMediaIds: [image1.id] }];
    mockState.displayedVideoPromptAreas = [{ ...mockState.baseVideoPromptArea, orderedMediaIds: [image1.id] }];
    mockState.videoPromptBars = [{ ...mockState.baseVideoPromptBar, seedance2Variant: 'smart' }];
    mockState.displayedVideoPromptBars = [{ ...mockState.baseVideoPromptBar, seedance2Variant: 'smart' }];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Submit Embedded Prompt' }));

    expect(mockState.handleGenerate).toHaveBeenCalledWith(expect.objectContaining({
      primaryImageId: image1.id,
      videoLastFrameImageId: undefined,
      referenceImageIds: [],
      referenceVideoIds: [],
      referenceAudioIds: [],
    }));
  });

  it('maps the first two area images into Seedance Smart first and last frames', () => {
    const image1 = buildCanvasMedia('image-1', 'image');
    const image2 = buildCanvasMedia('image-2', 'image');
    mockState.images = [image1, image2];
    mockState.displayedImages = [image1, image2];
    mockState.videoPromptAreas = [{ ...mockState.baseVideoPromptArea, orderedMediaIds: [image1.id, image2.id] }];
    mockState.displayedVideoPromptAreas = [{ ...mockState.baseVideoPromptArea, orderedMediaIds: [image1.id, image2.id] }];
    mockState.videoPromptBars = [{ ...mockState.baseVideoPromptBar, seedance2Variant: 'smart' }];
    mockState.displayedVideoPromptBars = [{ ...mockState.baseVideoPromptBar, seedance2Variant: 'smart' }];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Submit Embedded Prompt' }));

    expect(mockState.handleGenerate).toHaveBeenCalledWith(expect.objectContaining({
      primaryImageId: image1.id,
      videoLastFrameImageId: image2.id,
      referenceImageIds: [],
      referenceVideoIds: [],
      referenceAudioIds: [],
    }));
  });

  it('ignores extra images and non-image assets in Seedance Smart area submissions', () => {
    const image1 = buildCanvasMedia('image-1', 'image');
    const video1 = buildCanvasMedia('video-1', 'video');
    const image2 = buildCanvasMedia('image-2', 'image');
    const audio1 = buildCanvasMedia('audio-1', 'audio');
    const image3 = buildCanvasMedia('image-3', 'image');
    mockState.images = [image1, video1, image2, audio1, image3];
    mockState.displayedImages = [image1, video1, image2, audio1, image3];
    mockState.videoPromptAreas = [{
      ...mockState.baseVideoPromptArea,
      orderedMediaIds: [image1.id, video1.id, image2.id, audio1.id, image3.id],
    }];
    mockState.displayedVideoPromptAreas = [{
      ...mockState.baseVideoPromptArea,
      orderedMediaIds: [image1.id, video1.id, image2.id, audio1.id, image3.id],
    }];
    mockState.videoPromptBars = [{ ...mockState.baseVideoPromptBar, seedance2Variant: 'smart' }];
    mockState.displayedVideoPromptBars = [{ ...mockState.baseVideoPromptBar, seedance2Variant: 'smart' }];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Submit Embedded Prompt' }));

    expect(mockState.handleGenerate).toHaveBeenCalledWith(expect.objectContaining({
      primaryImageId: image1.id,
      videoLastFrameImageId: image2.id,
      referenceImageIds: [],
      referenceVideoIds: [],
      referenceAudioIds: [],
    }));
  });

  it('limits Smart embedded canvas labels and tagged refs to the first two still images', () => {
    const image1 = buildCanvasMedia('image-1', 'image');
    const video1 = buildCanvasMedia('video-1', 'video');
    const image2 = buildCanvasMedia('image-2', 'image');
    const audio1 = buildCanvasMedia('audio-1', 'audio');
    const image3 = buildCanvasMedia('image-3', 'image');
    mockState.images = [image1, video1, image2, audio1, image3];
    mockState.displayedImages = [image1, video1, image2, audio1, image3];
    mockState.videoPromptAreas = [{
      ...mockState.baseVideoPromptArea,
      orderedMediaIds: [image1.id, video1.id, image2.id, audio1.id, image3.id],
    }];
    mockState.displayedVideoPromptAreas = [{
      ...mockState.baseVideoPromptArea,
      orderedMediaIds: [image1.id, video1.id, image2.id, audio1.id, image3.id],
    }];
    mockState.videoPromptBars = [{ ...mockState.baseVideoPromptBar, seedance2Variant: 'smart' }];
    mockState.displayedVideoPromptBars = [{ ...mockState.baseVideoPromptBar, seedance2Variant: 'smart' }];

    render(<App />);

    expect(mockState.lastCanvasProps).toEqual(expect.objectContaining({
      referenceImageIds: [image1.id, image2.id],
      referenceVideoIds: [],
      referenceAudioIds: [],
      referenceImageOrderLabels: {
        [image1.id]: '@Image1',
        [image2.id]: '@Image2',
      },
      disabledMediaIds: [video1.id, audio1.id, image3.id],
      videoPromptAreaMemberships: {
        'area-1': expect.objectContaining({
          acceptedImageIds: [image1.id, image2.id],
          acceptedVideoIds: [],
          acceptedAudioIds: [],
          ignoredMediaIds: [video1.id, audio1.id, image3.id],
          orderLabels: {
            [image1.id]: '@Image1',
            [image2.id]: '@Image2',
          },
        }),
      },
    }));
  });

  it('allows Seedance Smart embedded submissions with no usable area images as text-to-video', () => {
    const video1 = buildCanvasMedia('video-1', 'video');
    const audio1 = buildCanvasMedia('audio-1', 'audio');
    mockState.images = [video1, audio1];
    mockState.displayedImages = [video1, audio1];
    mockState.videoPromptAreas = [{ ...mockState.baseVideoPromptArea, orderedMediaIds: [video1.id, audio1.id] }];
    mockState.displayedVideoPromptAreas = [{ ...mockState.baseVideoPromptArea, orderedMediaIds: [video1.id, audio1.id] }];
    mockState.videoPromptBars = [{ ...mockState.baseVideoPromptBar, seedance2Variant: 'smart' }];
    mockState.displayedVideoPromptBars = [{ ...mockState.baseVideoPromptBar, seedance2Variant: 'smart' }];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Submit Embedded Prompt' }));

    expect(mockState.handleGenerate).toHaveBeenCalledWith(expect.objectContaining({
      primaryImageId: undefined,
      videoLastFrameImageId: undefined,
      referenceImageIds: [],
      referenceVideoIds: [],
      referenceAudioIds: [],
    }));
  });

  it('uses area assets as the full Seedance Reference payload without active selection', () => {
    const image1 = buildCanvasMedia('image-1', 'image');
    const video1 = buildCanvasMedia('video-1', 'video');
    const audio1 = buildCanvasMedia('audio-1', 'audio');
    mockState.images = [image1, video1, audio1];
    mockState.displayedImages = [image1, video1, audio1];
    mockState.videoPromptAreas = [{ ...mockState.baseVideoPromptArea, orderedMediaIds: [image1.id, video1.id, audio1.id] }];
    mockState.displayedVideoPromptAreas = [{ ...mockState.baseVideoPromptArea, orderedMediaIds: [image1.id, video1.id, audio1.id] }];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Submit Embedded Prompt' }));

    expect(mockState.handleGenerate).toHaveBeenCalledWith(expect.objectContaining({
      primaryImageId: undefined,
      videoLastFrameImageId: undefined,
      referenceImageIds: [image1.id],
      referenceVideoIds: [video1.id],
      referenceAudioIds: [audio1.id],
    }));
  });
});
