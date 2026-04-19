import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { PromptBar } from '../PromptBar';
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
      { value: 'wan-2.6', label: 'Wan 2.6' },
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
      { value: 'wan-2.6', label: 'Wan 2.6' },
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
