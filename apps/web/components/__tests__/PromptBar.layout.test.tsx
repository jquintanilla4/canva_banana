import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { PromptBar } from '../PromptBar';
import { PROMPT_BAR_FOOTER_MARGIN_BOTTOM, PROMPT_BAR_FOOTER_PADDING } from '../../utils/promptBarFooterLayout';
import { DEFAULT_ROOT_FONT_SIZE_PX, DEFAULT_UI_SCALE } from '../../utils/uiScale';

const BASE_PROMPT_BAR_MAX_WIDTH_PX = 69.1 * DEFAULT_ROOT_FONT_SIZE_PX; // Matches the desktop baseline width in PromptBar.
const SCALED_ROOT_FONT_SIZE_PX = DEFAULT_ROOT_FONT_SIZE_PX * DEFAULT_UI_SCALE; // Mirrors the default UI scale in the app shell.
const ORIGINAL_CLIENT_WIDTH = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const ORIGINAL_SCROLL_WIDTH = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');
const ORIGINAL_INNER_WIDTH = window.innerWidth;
const ORIGINAL_REQUEST_ANIMATION_FRAME = window.requestAnimationFrame;
const ORIGINAL_CANCEL_ANIMATION_FRAME = window.cancelAnimationFrame;
const ORIGINAL_DOCUMENT_FONT_SIZE = document.documentElement.style.fontSize;

const modelControls = [
  {
    id: 'seedance2-variant-select',
    ariaLabel: 'Select Seedance 2 variant',
    options: [
      { value: 'smart', label: 'Smart' },
      { value: 'reference', label: 'Reference' },
    ],
    value: 'reference',
    onChange: vi.fn(),
    disabled: false,
  },
  {
    id: 'seedance2-aspect-ratio-select',
    prefixLabel: 'AR',
    ariaLabel: 'Select Seedance 2 aspect ratio',
    options: [
      { value: '16:9', label: '16:9' },
      { value: '9:16', label: '9:16' },
    ],
    value: '16:9',
    onChange: vi.fn(),
    disabled: false,
  },
  {
    id: 'seedance2-duration-select',
    ariaLabel: 'Select Seedance 2 duration',
    options: [
      { value: '5', label: '5s' },
      { value: '10', label: '10s' },
    ],
    value: '10',
    onChange: vi.fn(),
    disabled: false,
  },
  {
    id: 'seedance2-resolution-select',
    prefixLabel: 'Resolution',
    ariaLabel: 'Select Seedance 2 resolution',
    options: [
      { value: '720p', label: '720p' },
      { value: '1080p', label: '1080p (TBR)', disabled: true }, // Mirrors the provisional disabled Seedance 2 UI label.
    ],
    value: '1080p',
    onChange: vi.fn(),
    disabled: false,
  },
  {
    id: 'seedance2-audio-select',
    prefixLabel: 'Audio',
    ariaLabel: 'Toggle Seedance 2 audio generation',
    options: [
      { value: 'false', label: 'Off' },
      { value: 'true', label: 'On' },
    ],
    value: 'true',
    onChange: vi.fn(),
    disabled: false,
  },
] as const;

const installControlWidthMocks = ({ viewportWidth, stripWidth }: { viewportWidth: number; stripWidth: number }) => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      if (this.getAttribute?.('data-testid') === 'prompt-bar-control-viewport') {
        return viewportWidth;
      }

      return ORIGINAL_CLIENT_WIDTH?.get ? ORIGINAL_CLIENT_WIDTH.get.call(this) : 0;
    },
  });

  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get() {
      if (this.getAttribute?.('data-testid') === 'prompt-bar-control-strip') {
        return stripWidth;
      }

      return ORIGINAL_SCROLL_WIDTH?.get ? ORIGINAL_SCROLL_WIDTH.get.call(this) : 0;
    },
  });
};

const renderPromptBar = () => render(
  <PromptBar
    prompt="Animate the subject"
    onPromptChange={vi.fn()}
    onSubmit={vi.fn()}
    isLoading={false}
    inputDisabled={false}
    submitDisabled={false}
    modelOptions={[
      { value: 'seedance-2', label: 'Seedance 2' },
      { value: 'wan-2.7', label: 'Wan 2.7' },
    ]}
    selectedModel="seedance-2"
    onModelChange={vi.fn()}
    modelSelectDisabled={false}
    modelMode="video"
    onModelModeChange={vi.fn()}
    modelControls={modelControls}
  />
);

const renderInlinePromptBar = (maxInlineWidthPx?: number) => render(
  <PromptBar
    layout="inline"
    prompt="Animate the subject"
    onPromptChange={vi.fn()}
    onSubmit={vi.fn()}
    isLoading={false}
    inputDisabled={false}
    submitDisabled={false}
    modelOptions={[
      { value: 'seedance-2', label: 'Seedance 2' },
      { value: 'wan-2.7', label: 'Wan 2.7' },
    ]}
    selectedModel="seedance-2"
    onModelChange={vi.fn()}
    modelSelectDisabled={false}
    modelMode="video"
    onModelModeChange={vi.fn()}
    modelControls={modelControls}
    maxInlineWidthPx={maxInlineWidthPx}
  />
);

const renderHeygenPromptBar = () => render(
  <PromptBar
    prompt=""
    onPromptChange={vi.fn()}
    onSubmit={vi.fn()}
    isLoading={false}
    inputDisabled
    submitDisabled={false}
    modelOptions={[
      { value: 'fal-ai/heygen/v3/lipsync/precision', label: 'HeyGen V3 Lipsync' },
    ]}
    selectedModel="fal-ai/heygen/v3/lipsync/precision"
    onModelChange={vi.fn()}
    modelSelectDisabled={false}
    modelMode="video"
    onModelModeChange={vi.fn()}
    modelControls={[
      {
        id: 'heygen-caption-select',
        prefixLabel: 'Captions',
        ariaLabel: 'Toggle HeyGen captions',
        options: [
          { value: 'false', label: 'Off', tooltip: 'Do not generate captions in the output video.' },
          { value: 'true', label: 'On', tooltip: 'Generate captions in the output video when HeyGen returns them.' },
        ],
        value: 'false',
        onChange: vi.fn(),
        disabled: false,
        tooltip: 'Do not generate captions in the output video.',
      },
      {
        id: 'heygen-dynamic-duration-select',
        prefixLabel: 'Duration',
        ariaLabel: 'Toggle HeyGen dynamic duration',
        options: [
          { value: 'true', label: 'Dynamic', tooltip: 'Allow HeyGen to adjust the video duration to match the replacement audio.' },
          { value: 'false', label: 'Source', tooltip: 'Keep the source video duration instead of matching the replacement audio.' },
        ],
        value: 'true',
        onChange: vi.fn(),
        disabled: false,
        tooltip: 'Allow HeyGen to adjust the video duration to match the replacement audio.',
      },
      {
        id: 'heygen-music-track-select',
        prefixLabel: 'Music',
        ariaLabel: 'Toggle HeyGen music removal',
        options: [
          { value: 'false', label: 'Keep', tooltip: 'Keep background music from the source video.' },
          { value: 'true', label: 'Remove', tooltip: 'Remove background music from the source video.' },
        ],
        value: 'false',
        onChange: vi.fn(),
        disabled: false,
        tooltip: 'Keep background music from the source video.',
      },
      {
        id: 'heygen-speech-enhancement-select',
        prefixLabel: 'Speech',
        ariaLabel: 'Toggle HeyGen speech enhancement',
        options: [
          { value: 'false', label: 'Original', tooltip: 'Use the replacement audio without extra speech enhancement.' },
          { value: 'true', label: 'Enhanced', tooltip: 'Enhance the replacement audio quality before syncing.' },
        ],
        value: 'false',
        onChange: vi.fn(),
        disabled: false,
        tooltip: 'Use the replacement audio without extra speech enhancement.',
      },
    ]}
  />
);

const PromptBarMentionHarness = () => {
  const [prompt, setPrompt] = React.useState('Use @Image1 and ');

  return (
    <PromptBar
      prompt={prompt}
      onPromptChange={setPrompt}
      onSubmit={vi.fn()}
      isLoading={false}
      inputDisabled={false}
      submitDisabled={false}
      modelOptions={[
        { value: 'seedance-2', label: 'Seedance 2' },
      ]}
      selectedModel="seedance-2"
      onModelChange={vi.fn()}
      modelSelectDisabled={false}
      modelMode="video"
      onModelModeChange={vi.fn()}
      modelControls={modelControls}
      klingSuggestionsEnabled
      klingSuggestionOptions={['@Image1', '@Image2']}
    />
  );
};

const PromptBarAutocompleteHarness = () => {
  const [prompt, setPrompt] = React.useState(''); // Start empty so the test uses the real autocomplete insert path.

  return (
    <PromptBar
      prompt={prompt}
      onPromptChange={setPrompt}
      onSubmit={vi.fn()}
      isLoading={false}
      inputDisabled={false}
      submitDisabled={false}
      modelOptions={[
        { value: 'seedance-2', label: 'Seedance 2' },
      ]}
      selectedModel="seedance-2"
      onModelChange={vi.fn()}
      modelSelectDisabled={false}
      modelMode="video"
      onModelModeChange={vi.fn()}
      modelControls={modelControls}
      klingSuggestionsEnabled
      klingSuggestionOptions={['@Image1', '@Video1', '@Audio1']}
    />
  );
};

const RecraftPromptBarHarness = ({ isLoading = false }: { isLoading?: boolean }) => {
  const [backgroundColor, setBackgroundColor] = React.useState('#0c2238');
  const [colors, setColors] = React.useState<string[]>([]);
  const recraftControls = [
    {
      id: 'recraft-image-size-select',
      prefixLabel: 'Image Size',
      ariaLabel: 'Select Recraft image size',
      options: [
        { value: 'square_hd', label: 'Square HD' },
        { value: 'landscape_16_9', label: 'Landscape 16:9' },
      ],
      value: 'square_hd',
      onChange: vi.fn(),
      disabled: isLoading,
    },
    {
      kind: 'color' as const,
      id: 'recraft-background-color-picker',
      prefixLabel: 'BG',
      ariaLabel: 'Select Recraft background color',
      value: backgroundColor,
      onChange: setBackgroundColor,
      disabled: isLoading,
    },
    ...colors.map((color, index) => ({
      kind: 'color' as const,
      id: `recraft-color-${index + 1}-picker`,
      prefixLabel: `C${index + 1}`,
      ariaLabel: `Select Recraft preferred color ${index + 1}`,
      value: color,
      onChange: (value: string) => setColors(prev => prev.map((existing, colorIndex) => (colorIndex === index ? value : existing))),
      disabled: isLoading,
    })),
    ...(colors.length < 5 ? [{
      kind: 'action' as const,
      id: 'recraft-add-color-button',
      label: '+ Color',
      ariaLabel: 'Add Recraft preferred color',
      onClick: () => setColors(prev => (prev.length >= 5 ? prev : [...prev, '#000000'])),
      disabled: isLoading,
    }] : []),
    ...(colors.length > 0 ? [{
      kind: 'action' as const,
      id: 'recraft-remove-color-button',
      label: '- Color',
      ariaLabel: 'Remove Recraft preferred color',
      onClick: () => setColors(prev => prev.slice(0, -1)),
      disabled: isLoading,
    }] : []),
  ];

  return (
    <PromptBar
      prompt="Design a product shot"
      onPromptChange={vi.fn()}
      onSubmit={vi.fn()}
      isLoading={isLoading}
      inputDisabled={false}
      submitDisabled={false}
      modelOptions={[
        { value: 'fal-ai/recraft/v4/pro/text-to-image', label: 'Recraft v4 Pro' },
      ]}
      selectedModel="fal-ai/recraft/v4/pro/text-to-image"
      onModelChange={vi.fn()}
      modelSelectDisabled={false}
      modelMode="image"
      onModelModeChange={vi.fn()}
      modelControls={recraftControls}
    />
  );
};

const flushPromptBarLayout = async () => {
  await act(async () => {
    vi.runAllTimers();
    await Promise.resolve();
  });
};

describe('PromptBar layout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1600 });
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0)) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = ((handle: number) => window.clearTimeout(handle)) as typeof window.cancelAnimationFrame;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: ORIGINAL_INNER_WIDTH });
    document.documentElement.style.fontSize = ORIGINAL_DOCUMENT_FONT_SIZE;

    if (ORIGINAL_CLIENT_WIDTH) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', ORIGINAL_CLIENT_WIDTH);
    }

    if (ORIGINAL_SCROLL_WIDTH) {
      Object.defineProperty(HTMLElement.prototype, 'scrollWidth', ORIGINAL_SCROLL_WIDTH);
    }

    window.requestAnimationFrame = ORIGINAL_REQUEST_ANIMATION_FRAME;
    window.cancelAnimationFrame = ORIGINAL_CANCEL_ANIMATION_FRAME;
  });

  it('mounts overflowing footer controls at the final measured width before animation frames run', () => {
    installControlWidthMocks({ viewportWidth: 620, stripWidth: 940 });
    renderPromptBar();

    const footer = screen.getByTestId('prompt-bar-footer');
    const textarea = screen.getByLabelText('Prompt input') as HTMLTextAreaElement;

    expect(parseFloat(footer.style.maxWidth)).toBeCloseTo(BASE_PROMPT_BAR_MAX_WIDTH_PX + 320, 1);
    expect(parseFloat(footer.style.maxWidth)).toBeGreaterThan(BASE_PROMPT_BAR_MAX_WIDTH_PX);
    expect(footer.className).not.toContain('transition-all');
    expect(footer.className).not.toContain('transition-[width,max-width]');
    expect(textarea.className).not.toContain('transition-all');
    expect(textarea.style.backgroundColor).toBe('transparent');
  });

  it('renders HeyGen boolean controls with option tooltips', () => {
    renderHeygenPromptBar();

    const captionsSelect = screen.getByLabelText('Toggle HeyGen captions') as HTMLSelectElement;
    const durationSelect = screen.getByLabelText('Toggle HeyGen dynamic duration') as HTMLSelectElement;
    const musicSelect = screen.getByLabelText('Toggle HeyGen music removal') as HTMLSelectElement;
    const speechSelect = screen.getByLabelText('Toggle HeyGen speech enhancement') as HTMLSelectElement;

    expect(captionsSelect.selectedOptions[0]?.textContent).toBe('Off');
    expect(durationSelect.selectedOptions[0]?.textContent).toBe('Dynamic');
    expect(musicSelect.selectedOptions[0]?.textContent).toBe('Keep');
    expect(speechSelect.selectedOptions[0]?.textContent).toBe('Original');
    expect(captionsSelect.title).toBe('Do not generate captions in the output video.');
    expect(durationSelect.options[0]?.title).toBe('Allow HeyGen to adjust the video duration to match the replacement audio.');
    expect(musicSelect.options[1]?.title).toBe('Remove background music from the source video.');
    expect(speechSelect.options[1]?.title).toBe('Enhance the replacement audio quality before syncing.');
  });

  it('expands beyond the desktop baseline when model controls overflow', async () => {
    installControlWidthMocks({ viewportWidth: 620, stripWidth: 940 });
    renderPromptBar();
    await flushPromptBarLayout();

    const footer = screen.getByTestId('prompt-bar-footer');
    const controlsViewport = screen.getByTestId('prompt-bar-control-viewport');
    const controlsStrip = screen.getByTestId('prompt-bar-control-strip');

    expect(parseFloat(footer.style.maxWidth)).toBeCloseTo(BASE_PROMPT_BAR_MAX_WIDTH_PX + 320, 1);
    expect(parseFloat(footer.style.maxWidth)).toBeGreaterThan(BASE_PROMPT_BAR_MAX_WIDTH_PX);
    expect(controlsViewport.className).toContain('overflow-x-auto');
    expect(controlsStrip.className).toContain('flex-nowrap');
  });

  it('keeps measuring control overflow from the baseline width after expansion', async () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        if (this.getAttribute?.('data-testid') === 'prompt-bar-control-viewport') {
          const footer = this.closest('[data-testid="prompt-bar-footer"]') as HTMLElement | null;
          const measuredMaxWidthPx = Number.parseFloat(footer?.style.maxWidth ?? '');

          return measuredMaxWidthPx > BASE_PROMPT_BAR_MAX_WIDTH_PX ? 940 : 620; // Expanded shells can hide baseline overflow.
        }

        return ORIGINAL_CLIENT_WIDTH?.get ? ORIGINAL_CLIENT_WIDTH.get.call(this) : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get() {
        if (this.getAttribute?.('data-testid') === 'prompt-bar-control-strip') {
          return 940;
        }

        return ORIGINAL_SCROLL_WIDTH?.get ? ORIGINAL_SCROLL_WIDTH.get.call(this) : 0;
      },
    });

    const { rerender } = render(
      <PromptBar
        prompt="Animate the subject"
        onPromptChange={vi.fn()}
        onSubmit={vi.fn()}
        isLoading={false}
        inputDisabled={false}
        submitDisabled={false}
        modelOptions={[
          { value: 'seedance-2', label: 'Seedance 2' },
          { value: 'wan-2.7', label: 'Wan 2.7' },
        ]}
        selectedModel="seedance-2"
        onModelChange={vi.fn()}
        modelSelectDisabled={false}
        modelMode="video"
        onModelModeChange={vi.fn()}
        modelControls={modelControls}
      />
    );
    await flushPromptBarLayout();

    const footer = screen.getByTestId('prompt-bar-footer');

    expect(parseFloat(footer.style.maxWidth)).toBeCloseTo(BASE_PROMPT_BAR_MAX_WIDTH_PX + 320, 1);

    rerender(
      <PromptBar
        prompt="Animate the subject"
        onPromptChange={vi.fn()}
        onSubmit={vi.fn()}
        isLoading={false}
        inputDisabled={false}
        submitDisabled={false}
        modelOptions={[
          { value: 'seedance-2', label: 'Seedance 2' },
          { value: 'wan-2.7', label: 'Wan 2.7' },
        ]}
        selectedModel="wan-2.7"
        onModelChange={vi.fn()}
        modelSelectDisabled={false}
        modelMode="video"
        onModelModeChange={vi.fn()}
        modelControls={modelControls}
      />
    );
    await flushPromptBarLayout();

    expect(parseFloat(footer.style.maxWidth)).toBeCloseTo(BASE_PROMPT_BAR_MAX_WIDTH_PX + 320, 1);
  });

  it('clamps the widened prompt bar to the viewport and keeps the controls scrollable', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1100 });
    installControlWidthMocks({ viewportWidth: 620, stripWidth: 940 });
    renderPromptBar();
    await flushPromptBarLayout();

    const footer = screen.getByTestId('prompt-bar-footer');
    const controlsViewport = screen.getByTestId('prompt-bar-control-viewport');
    const controlsStrip = screen.getByTestId('prompt-bar-control-strip');

    expect(parseFloat(footer.style.maxWidth)).toBe(1076);
    expect(parseFloat(footer.style.maxWidth)).toBeLessThan(BASE_PROMPT_BAR_MAX_WIDTH_PX + 320);
    expect(controlsViewport.className).toContain('overflow-x-auto');
    expect(controlsStrip.className).toContain('flex-nowrap');
  });

  it('uses the shared footer spacing values for the visible prompt shell baseline', async () => {
    installControlWidthMocks({ viewportWidth: 620, stripWidth: 940 });
    renderPromptBar();
    await flushPromptBarLayout();

    const footer = screen.getByTestId('prompt-bar-footer');

    expect(footer.style.marginBottom).toBe(PROMPT_BAR_FOOTER_MARGIN_BOTTOM);
    expect(footer.style.padding).toBe(PROMPT_BAR_FOOTER_PADDING);
  });

  it('recomputes width from the current root font size before applying the viewport clamp', async () => {
    document.documentElement.style.fontSize = `${SCALED_ROOT_FONT_SIZE_PX}px`;
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 900 });
    installControlWidthMocks({ viewportWidth: 620, stripWidth: 940 });
    renderPromptBar();
    await flushPromptBarLayout();

    const footer = screen.getByTestId('prompt-bar-footer');
    const expectedViewportClampPx = 900 - (1.5 * SCALED_ROOT_FONT_SIZE_PX);

    expect(parseFloat(footer.style.maxWidth)).toBeCloseTo(expectedViewportClampPx, 1);
    expect(parseFloat(footer.style.maxWidth)).toBeLessThan(BASE_PROMPT_BAR_MAX_WIDTH_PX + 320);
  });

  it('reuses the shared computed width for inline full-size prompt bars', async () => {
    installControlWidthMocks({ viewportWidth: 620, stripWidth: 940 });
    renderInlinePromptBar();
    await flushPromptBarLayout();

    const inline = screen.getByTestId('prompt-bar-inline');

    expect(parseFloat(inline.style.width)).toBeCloseTo(BASE_PROMPT_BAR_MAX_WIDTH_PX + 320, 1);
    expect(parseFloat(inline.style.maxWidth)).toBeCloseTo(BASE_PROMPT_BAR_MAX_WIDTH_PX + 320, 1);
  });

  it('caps inline prompt bars to the provided width while keeping the controls scrollable', async () => {
    installControlWidthMocks({ viewportWidth: 620, stripWidth: 940 });
    renderInlinePromptBar(540);
    await flushPromptBarLayout();

    const inline = screen.getByTestId('prompt-bar-inline');
    const controlsViewport = screen.getByTestId('prompt-bar-control-viewport');
    const controlsStrip = screen.getByTestId('prompt-bar-control-strip');

    expect(parseFloat(inline.style.width)).toBe(540);
    expect(parseFloat(inline.style.maxWidth)).toBe(540);
    expect(controlsViewport.className).toContain('overflow-x-auto');
    expect(controlsStrip.className).toContain('flex-nowrap');
  });

  it('remeasures dropdown widths after returning from mini mode', async () => {
    const expectedResolutionWidthPx = `${('1080p (TBR)'.length * 7) + 12}px`;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      font: '',
      measureText: (text: string) => ({ width: text.length * 7 }),
    } as unknown as CanvasRenderingContext2D);

    const { rerender } = render(
      <PromptBar
        prompt="Animate the subject"
        onPromptChange={vi.fn()}
        onSubmit={vi.fn()}
        isLoading={false}
        inputDisabled={false}
        submitDisabled={false}
        modelOptions={[
          { value: 'seedance-2', label: 'Seedance 2' },
        ]}
        selectedModel="seedance-2"
        onModelChange={vi.fn()}
        modelSelectDisabled={false}
        modelMode="video"
        onModelModeChange={vi.fn()}
        modelControls={modelControls}
        sizeMode="full"
      />
    );

    await flushPromptBarLayout();

    const initialResolutionSelect = screen.getByLabelText('Select Seedance 2 resolution') as HTMLSelectElement;
    expect(initialResolutionSelect.style.width).toBe(expectedResolutionWidthPx);

    rerender(
      <PromptBar
        prompt="Animate the subject"
        onPromptChange={vi.fn()}
        onSubmit={vi.fn()}
        isLoading={false}
        inputDisabled={false}
        submitDisabled={false}
        modelOptions={[
          { value: 'seedance-2', label: 'Seedance 2' },
        ]}
        selectedModel="seedance-2"
        onModelChange={vi.fn()}
        modelSelectDisabled={false}
        modelMode="video"
        onModelModeChange={vi.fn()}
        modelControls={modelControls}
        sizeMode="mini"
      />
    );

    await flushPromptBarLayout();

    expect(screen.queryByLabelText('Select Seedance 2 resolution')).toBeNull();

    rerender(
      <PromptBar
        prompt="Animate the subject"
        onPromptChange={vi.fn()}
        onSubmit={vi.fn()}
        isLoading={false}
        inputDisabled={false}
        submitDisabled={false}
        modelOptions={[
          { value: 'seedance-2', label: 'Seedance 2' },
        ]}
        selectedModel="seedance-2"
        onModelChange={vi.fn()}
        modelSelectDisabled={false}
        modelMode="video"
        onModelModeChange={vi.fn()}
        modelControls={modelControls}
        sizeMode="full"
      />
    );

    await flushPromptBarLayout();

    const remountedResolutionSelect = screen.getByLabelText('Select Seedance 2 resolution') as HTMLSelectElement;
    expect(remountedResolutionSelect.style.width).toBe(expectedResolutionWidthPx);
  });

  it('renders Recraft size and color controls in the shared control strip', async () => {
    render(<RecraftPromptBarHarness />);
    await flushPromptBarLayout();

    const sizeSelect = screen.getByLabelText('Select Recraft image size') as HTMLSelectElement;
    const backgroundPicker = screen.getByLabelText('Select Recraft background color') as HTMLInputElement;

    expect(sizeSelect.value).toBe('square_hd');
    expect(backgroundPicker.type).toBe('color');
    expect(backgroundPicker.value).toBe('#0c2238');
    expect(backgroundPicker.style.colorScheme).toBe('light dark');
    expect(screen.getByRole('button', { name: 'Add Recraft preferred color' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove Recraft preferred color' })).toBeNull();
  });

  it('adds and removes up to five Recraft preferred colors', async () => {
    render(<RecraftPromptBarHarness />);
    await flushPromptBarLayout();

    const addButton = screen.getByRole('button', { name: 'Add Recraft preferred color' });
    fireEvent.click(addButton);
    fireEvent.click(addButton);
    fireEvent.click(addButton);
    fireEvent.click(addButton);
    fireEvent.click(addButton);
    await flushPromptBarLayout();

    expect(screen.getByLabelText('Select Recraft preferred color 5')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add Recraft preferred color' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Recraft preferred color' }));
    await flushPromptBarLayout();

    expect(screen.queryByLabelText('Select Recraft preferred color 5')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add Recraft preferred color' })).toBeTruthy();
  });

  it('disables Recraft controls while loading', async () => {
    render(<RecraftPromptBarHarness isLoading />);
    await flushPromptBarLayout();

    expect((screen.getByLabelText('Select Recraft image size') as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText('Select Recraft background color') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Add Recraft preferred color' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps mention suggestions open while typing a second seedance reference token', async () => {
    render(<PromptBarMentionHarness />);
    await flushPromptBarLayout();

    const textarea = screen.getByLabelText('Prompt input') as HTMLTextAreaElement;
    const secondMentionPrefix = 'Use @Image1 and @';
    const secondMentionQuery = 'Use @Image1 and @I';

    fireEvent.change(textarea, {
      target: {
        value: secondMentionPrefix,
        selectionStart: secondMentionPrefix.length,
      },
    });

    expect(screen.getByRole('listbox')).toBeTruthy();

    fireEvent.change(textarea, {
      target: {
        value: secondMentionQuery,
        selectionStart: secondMentionQuery.length,
      },
    });

    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(screen.getByText('@Image1')).toBeTruthy();
    expect(screen.getByText('@Image2')).toBeTruthy();
  });

  it('keeps recognizing later @ mentions after inserting an earlier one from autocomplete', async () => {
    render(<PromptBarAutocompleteHarness />);
    await flushPromptBarLayout();

    const textarea = screen.getByLabelText('Prompt input') as HTMLTextAreaElement;
    const firstMentionQuery = '@V';
    const secondMentionPrefix = '@Video1 then @';
    const thirdMentionPrefix = '@Video1 then @Image1 and @';

    fireEvent.change(textarea, {
      target: {
        value: firstMentionQuery,
        selectionStart: firstMentionQuery.length,
      },
    });

    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(screen.getByText('@Video1')).toBeTruthy();

    textarea.setSelectionRange(firstMentionQuery.length, firstMentionQuery.length); // Keep Enter aligned with the typed token.
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await flushPromptBarLayout();

    expect(textarea.value).toBe('@Video1');

    fireEvent.change(textarea, {
      target: {
        value: secondMentionPrefix,
        selectionStart: secondMentionPrefix.length,
      },
    });

    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(screen.getByText('@Image1')).toBeTruthy();
    expect(screen.getByText('@Video1')).toBeTruthy();

    textarea.setSelectionRange(secondMentionPrefix.length, secondMentionPrefix.length); // Mirror the real caret before the next insert.
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await flushPromptBarLayout();

    expect(textarea.value).toBe('@Video1 then @Image1');

    fireEvent.change(textarea, {
      target: {
        value: thirdMentionPrefix,
        selectionStart: thirdMentionPrefix.length,
      },
    });

    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(screen.getByText('@Audio1')).toBeTruthy();
  });
});
