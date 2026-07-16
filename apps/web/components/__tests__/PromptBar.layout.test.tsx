import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { PromptBar } from '../PromptBar';
import { PROMPT_BAR_FOOTER_MARGIN_BOTTOM, PROMPT_BAR_FOOTER_PADDING } from '../../utils/promptBarFooterLayout';
import { DEFAULT_ROOT_FONT_SIZE_PX, DEFAULT_UI_SCALE } from '../../utils/uiScale';
import { OVERLAY_LAYER_CLASS_NAMES } from '../../utils/overlayLayers';

const BASE_PROMPT_BAR_MAX_WIDTH_PX = 69.1 * DEFAULT_ROOT_FONT_SIZE_PX; // Matches the desktop baseline width in PromptBar.
const SCALED_ROOT_FONT_SIZE_PX = DEFAULT_ROOT_FONT_SIZE_PX * DEFAULT_UI_SCALE; // Mirrors the default UI scale in the app shell.
const ORIGINAL_CLIENT_WIDTH = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const ORIGINAL_SCROLL_WIDTH = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');
const ORIGINAL_INNER_WIDTH = window.innerWidth;
const ORIGINAL_INNER_HEIGHT = window.innerHeight;
const ORIGINAL_REQUEST_ANIMATION_FRAME = window.requestAnimationFrame;
const ORIGINAL_CANCEL_ANIMATION_FRAME = window.cancelAnimationFrame;
const ORIGINAL_DOCUMENT_FONT_SIZE = document.documentElement.style.fontSize;

const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
  x: left,
  y: top,
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
  toJSON: () => ({}),
});

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

const renderPromptBar = (overrides: Partial<React.ComponentProps<typeof PromptBar>> = {}) => render(
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
    {...overrides}
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

const PromptBarMentionHarness = ({ onPromptBlur }: { onPromptBlur?: () => void }) => {
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
      onPromptBlur={onPromptBlur}
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
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: ORIGINAL_INNER_HEIGHT });
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

    const captionsPicker = screen.getByRole('combobox', { name: 'Toggle HeyGen captions' });
    const durationPicker = screen.getByRole('combobox', { name: 'Toggle HeyGen dynamic duration' });
    const musicPicker = screen.getByRole('combobox', { name: 'Toggle HeyGen music removal' });
    const speechPicker = screen.getByRole('combobox', { name: 'Toggle HeyGen speech enhancement' });

    expect(captionsPicker.textContent).toContain('Off');
    expect(durationPicker.textContent).toContain('Dynamic');
    expect(musicPicker.textContent).toContain('Keep');
    expect(speechPicker.textContent).toContain('Original');
    expect(captionsPicker.title).toBe('Do not generate captions in the output video.');

    fireEvent.click(durationPicker);
    expect(screen.getByRole('option', { name: 'Dynamic' }).title).toBe('Allow HeyGen to adjust the video duration to match the replacement audio.');
    fireEvent.keyDown(durationPicker, { key: 'Escape' });

    fireEvent.click(musicPicker);
    expect(screen.getByRole('option', { name: 'Remove' }).title).toBe('Remove background music from the source video.');
    fireEvent.keyDown(musicPicker, { key: 'Escape' });

    fireEvent.click(speechPicker);
    expect(screen.getByRole('option', { name: 'Enhanced' }).title).toBe('Enhance the replacement audio quality before syncing.');
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

  it('restores picker controls after returning from mini mode', async () => {
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

    const initialResolutionPicker = screen.getByRole('combobox', { name: 'Select Seedance 2 resolution' });
    expect(initialResolutionPicker.textContent).toContain('1080p (TBR)');

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

    const remountedResolutionPicker = screen.getByRole('combobox', { name: 'Select Seedance 2 resolution' });
    expect(remountedResolutionPicker.textContent).toContain('1080p (TBR)');
  });

  it('renders Recraft size and color controls in the shared control strip', async () => {
    render(<RecraftPromptBarHarness />);
    await flushPromptBarLayout();

    const sizePicker = screen.getByRole('combobox', { name: 'Select Recraft image size' });
    const backgroundPicker = screen.getByLabelText('Select Recraft background color') as HTMLInputElement;

    expect(sizePicker.textContent).toContain('Square HD');
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

    expect((screen.getByRole('combobox', { name: 'Select Recraft image size' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Select Recraft background color') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Add Recraft preferred color' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps native textbox semantics when mention autocomplete is disabled', () => {
    renderPromptBar();

    const textarea = screen.getByRole('textbox', { name: 'Prompt input' });
    expect(screen.queryByRole('combobox', { name: 'Prompt input' })).toBeNull();
    expect(textarea.getAttribute('aria-autocomplete')).toBeNull();
    expect(textarea.getAttribute('aria-haspopup')).toBeNull();
    expect(textarea.getAttribute('aria-expanded')).toBeNull();
  });

  it('keeps native textbox semantics when mention autocomplete has no options', () => {
    renderPromptBar({ klingSuggestionsEnabled: true, klingSuggestionOptions: [] });

    const textarea = screen.getByRole('textbox', { name: 'Prompt input' });
    expect(screen.queryByRole('combobox', { name: 'Prompt input' })).toBeNull();
    expect(textarea.getAttribute('aria-autocomplete')).toBeNull();
    expect(textarea.getAttribute('aria-haspopup')).toBeNull();
    expect(textarea.getAttribute('aria-expanded')).toBeNull();
  });

  it('places mention suggestions below a caret near the viewport top', async () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 600 });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getBoundingClientRect() {
      if (this instanceof HTMLTextAreaElement && this.getAttribute('aria-label') === 'Prompt input') {
        return rect(100, 4, 400, 100);
      }
      if (this.getAttribute('role') === 'listbox') {
        return rect(0, 0, 160, 120);
      }
      if (this instanceof HTMLSpanElement && this.parentElement?.getAttribute('aria-hidden') === 'true') {
        return rect(20, 0, 0, 16);
      }
      return rect(0, 0, 0, 0);
    });
    render(<PromptBarMentionHarness />);
    await flushPromptBarLayout();

    const textarea = screen.getByLabelText('Prompt input') as HTMLTextAreaElement;
    const mentionPrefix = 'Use @Image1 and @';
    fireEvent.change(textarea, {
      target: {
        value: mentionPrefix,
        selectionStart: mentionPrefix.length,
      },
    });

    const suggestions = screen.getByRole('listbox');
    expect(suggestions.dataset.placement).toBe('bottom');
    expect(parseFloat(suggestions.style.maxHeight)).toBeGreaterThan(0);
    expect(parseFloat(suggestions.style.top)).toBeGreaterThan(4);
    expect(suggestions.className).not.toContain('-translate-y-full');
  });

  it('keeps mention suggestions aligned throughout ancestor transforms', () => {
    let textareaLeft = 100;
    let nextFrameId = 1;
    const frameCallbacks = new Map<number, FrameRequestCallback>(); // Lets the test advance each transition frame independently.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      frameCallbacks.set(frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId) => {
      frameCallbacks.delete(frameId);
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getBoundingClientRect() {
      if (this instanceof HTMLTextAreaElement && this.getAttribute('aria-label') === 'Prompt input') {
        return rect(textareaLeft, 400, 400, 100);
      }
      if (this.getAttribute('role') === 'listbox') {
        return rect(0, 0, 160, 120);
      }
      if (this instanceof HTMLSpanElement && this.parentElement?.getAttribute('aria-hidden') === 'true') {
        return rect(20, 0, 0, 16);
      }
      return rect(0, 0, 0, 0);
    });
    const runNextFrame = (timestamp: number) => {
      const nextFrame = frameCallbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
      expect(nextFrame).toBeTruthy();
      if (!nextFrame) {
        return;
      }
      frameCallbacks.delete(nextFrame[0]);
      act(() => nextFrame[1](timestamp));
    };
    const transitionEvent = (type: 'transitionrun' | 'transitionend'): Event => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperty(event, 'propertyName', { value: 'transform' });
      return event;
    };

    render(
      <div data-testid="moving-prompt-bar">
        <PromptBarMentionHarness />
      </div>,
    );
    const textarea = screen.getByLabelText('Prompt input') as HTMLTextAreaElement;
    const mentionPrefix = 'Use @Image1 and @';
    fireEvent.change(textarea, {
      target: { value: mentionPrefix, selectionStart: mentionPrefix.length },
    });
    const suggestions = screen.getByRole('listbox');
    const movingPromptBar = screen.getByTestId('moving-prompt-bar');
    runNextFrame(0); // Flushes the initial post-mount position check.

    expect(suggestions.style.left).toBe('120px');
    textareaLeft = 240;
    fireEvent(movingPromptBar, transitionEvent('transitionrun'));
    runNextFrame(16);
    expect(suggestions.style.left).toBe('260px');

    textareaLeft = 320;
    runNextFrame(32);
    expect(suggestions.style.left).toBe('340px');
    fireEvent(movingPromptBar, transitionEvent('transitionend'));
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

    const initialSuggestions = screen.getByRole('listbox');
    expect(initialSuggestions.dataset.placement).toBe('top');
    expect(initialSuggestions.className).not.toContain('-translate-y-full');

    const secondSuggestion = screen.getByRole('option', { name: '@Image2' });
    const scrollIntoView = vi.fn();
    Object.defineProperty(secondSuggestion, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });

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

  it('preserves native textbox semantics while associating portaled mention suggestions', async () => {
    render(<PromptBarMentionHarness />);
    await flushPromptBarLayout();

    const textarea = screen.getByLabelText('Prompt input') as HTMLTextAreaElement;
    expect(textarea.getAttribute('role')).toBeNull();
    expect(textarea.getAttribute('aria-controls')).toBeNull();
    expect(textarea.getAttribute('aria-expanded')).toBe('false');

    const mentionPrefix = 'Use @Image1 and @';
    fireEvent.change(textarea, {
      target: { value: mentionPrefix, selectionStart: mentionPrefix.length },
    });

    const suggestions = screen.getByRole('listbox');
    const firstOption = screen.getByRole('option', { name: '@Image1' });
    const secondOption = screen.getByRole('option', { name: '@Image2' });
    expect(suggestions.parentElement).toBe(document.body);
    expect(suggestions.className).toContain(OVERLAY_LAYER_CLASS_NAMES.anchoredPopover);
    expect(suggestions.className).not.toContain(OVERLAY_LAYER_CLASS_NAMES.blockingModal);
    expect(screen.getByRole('textbox', { name: 'Prompt input' })).toBe(textarea);
    expect(textarea.getAttribute('aria-autocomplete')).toBe('list');
    expect(textarea.getAttribute('aria-haspopup')).toBe('listbox');
    expect(textarea.getAttribute('aria-expanded')).toBe('true');
    expect(textarea.getAttribute('aria-controls')).toBe(suggestions.id);
    expect(textarea.getAttribute('aria-activedescendant')).toBe(firstOption.id);

    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    expect(textarea.getAttribute('aria-activedescendant')).toBe(secondOption.id);

    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(textarea.getAttribute('aria-controls')).toBeNull();
    expect(textarea.getAttribute('aria-activedescendant')).toBeNull();
    expect(textarea.getAttribute('aria-expanded')).toBe('false');
  });

  it('dismisses portaled mention suggestions when focus leaves without trapping Tab', async () => {
    const onPromptBlur = vi.fn();
    render(<PromptBarMentionHarness onPromptBlur={onPromptBlur} />);
    await flushPromptBarLayout();

    const textarea = screen.getByLabelText('Prompt input') as HTMLTextAreaElement;
    const mentionPrefix = 'Use @Image1 and @';
    fireEvent.change(textarea, {
      target: { value: mentionPrefix, selectionStart: mentionPrefix.length },
    });

    const options = screen.getAllByRole('option');
    expect(options.every(option => option.tabIndex === -1)).toBe(true);
    expect(fireEvent.keyDown(textarea, { key: 'Tab' })).toBe(true); // Tab stays available for normal focus movement.
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(textarea.getAttribute('aria-controls')).toBeNull();

    const narrowedMention = `${mentionPrefix}I`;
    fireEvent.change(textarea, {
      target: { value: narrowedMention, selectionStart: narrowedMention.length },
    });
    expect(screen.getByRole('listbox')).toBeTruthy();

    fireEvent.blur(textarea);
    expect(onPromptBlur).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(textarea.getAttribute('aria-controls')).toBeNull();
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
