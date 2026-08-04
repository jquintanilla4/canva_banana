import React, { useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { LayerUpIcon } from './Icons';
import { PromptBarPicker } from './PromptBarPicker';
import { Tooltip } from './Tooltip';
import { getRootFontSizePx } from '../utils/uiScale';
import { KEYBOARD_SHORTCUT_LABELS } from '../utils/keyboardShortcutLabels';
import { PROMPT_BAR_FOOTER_MARGIN_BOTTOM, PROMPT_BAR_FOOTER_PADDING } from '../utils/promptBarFooterLayout';
import { getIntrinsicElementSize, getViewportMenuPosition, type VerticalMenuPlacement } from '../utils/viewportMenuPosition';
import { ANCHORED_PORTAL_TRACKING_IGNORE_ATTRIBUTE, useAnchoredPortalTracking } from '../hooks/useAnchoredPortalTracking';
import { OVERLAY_LAYER_CLASS_NAMES } from '../utils/overlayLayers';
import { CANVAS_INTERACTION_BOUNDARY_PROPS } from '../utils/canvasInteractionBoundary';

const PROMPT_BAR_BASE_MAX_WIDTH_REM = 69.1; // Keeps the existing desktop prompt bar width as the baseline.
const PROMPT_BAR_MINI_MAX_WIDTH_REM = 31.5; // Mini mode mirrors the compact bar from the design reference.
const PROMPT_BAR_HORIZONTAL_GUTTER_REM = 1.5; // Leaves a little space from the viewport edges on narrow screens.
const PROMPT_TEXTAREA_MIN_HEIGHT_REM = 5.75; // Keeps the textarea tall enough for 3 rows.
const PROMPT_TEXTAREA_MAX_HEIGHT_REM = 23; // Lets medium prompts grow to ~4x the resting height before scrolling.
const PROMPT_TEXTAREA_MINI_HEIGHT_REM = 2.85; // Mini mode collapses to a one-line editing affordance.
const PROMPT_TEXTAREA_MINI_MAX_HEIGHT_REM = 11.4; // Mini mode grows to ~4x its resting height before scrolling.

const getPromptBarHorizontalGutterPx = (): number => PROMPT_BAR_HORIZONTAL_GUTTER_REM * getRootFontSizePx();

const getPromptBarBaseMaxWidthPx = (sizeMode: 'full' | 'mini'): number => {
  if (typeof window === 'undefined') {
    return (sizeMode === 'mini' ? PROMPT_BAR_MINI_MAX_WIDTH_REM : PROMPT_BAR_BASE_MAX_WIDTH_REM) * 16;
  }

  const rootFontSize = getRootFontSizePx();
  return (sizeMode === 'mini' ? PROMPT_BAR_MINI_MAX_WIDTH_REM : PROMPT_BAR_BASE_MAX_WIDTH_REM) * rootFontSize;
};

const getPromptBarViewportClampPx = (sizeMode: 'full' | 'mini'): number => {
  if (typeof window === 'undefined') {
    return getPromptBarBaseMaxWidthPx(sizeMode);
  }

  return Math.max(320, window.innerWidth - getPromptBarHorizontalGutterPx());
};

const getControlSignature = (control: FalModelControlConfig): string => {
  if (control.kind === 'action') {
    return `${control.id}-${control.disabled}-${control.label}`;
  }
  if (control.kind === 'color') {
    return `${control.id}-${control.value}-${control.disabled}`;
  }
  return `${control.id}-${control.value}-${control.options.map(option => option.label).join('~')}`;
};

type ActiveKlingMention = {
  startIndex: number;
  query: string;
};

const ACTIVE_KLING_MENTION_REGEX = /^@[A-Za-z]*\d*$/; // Keep mention parsing limited to the autocomplete token under the caret.
const KLING_SUGGESTION_GAP_PX = 4; // Leaves space between the caret line and suggestions.
const KLING_SUGGESTION_VIEWPORT_MARGIN_PX = 8; // Keeps suggestions inside the app window.
const TEXTAREA_CARET_MIRROR_STYLE_PROPS = [ // Copy the text metrics that affect wrapped caret placement.
  'boxSizing',
  'width',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontFamily',
  'lineHeight',
  'letterSpacing',
  'textTransform',
  'textAlign',
  'textIndent',
  'textDecoration',
  'direction',
  'wordSpacing',
  'tabSize',
] as const;

const getActiveKlingMention = (value: string, caret: number): ActiveKlingMention | null => {
  const textBeforeCaret = value.slice(0, caret);
  const mentionStartIndex = textBeforeCaret.lastIndexOf('@');
  if (mentionStartIndex === -1) {
    return null;
  }
  const mentionText = textBeforeCaret.slice(mentionStartIndex);
  if (mentionText.length === 0 || /[\s]/.test(mentionText) || !ACTIVE_KLING_MENTION_REGEX.test(mentionText)) {
    return null;
  }
  return {
    startIndex: mentionStartIndex,
    query: mentionText.slice(1),
  };
};

const getTextareaCaretPosition = (
  textarea: HTMLTextAreaElement,
  value: string,
  caret: number,
): { left: number; top: number } | null => {
  if (typeof document === 'undefined') {
    return null;
  }

  const computedStyle = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  const marker = document.createElement('span');

  mirror.setAttribute('aria-hidden', 'true');
  mirror.setAttribute(ANCHORED_PORTAL_TRACKING_IGNORE_ATTRIBUTE, ''); // Prevents temporary caret measurement from feeding portal tracking.
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.whiteSpace = 'pre-wrap'; // Match textarea wrapping so the caret anchor stays on the active line.
  mirror.style.wordBreak = 'break-word'; // Long tokens should wrap in the mirror just like the textarea.
  mirror.style.overflowWrap = 'break-word';

  TEXTAREA_CARET_MIRROR_STYLE_PROPS.forEach(property => {
    mirror.style[property] = computedStyle[property];
  });

  mirror.textContent = value.slice(0, caret);
  marker.textContent = value.slice(caret) || '.';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const mirrorRect = mirror.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();
  document.body.removeChild(mirror);

  return {
    left: markerRect.left - mirrorRect.left - textarea.scrollLeft,
    top: markerRect.top - mirrorRect.top - textarea.scrollTop,
  };
};

interface ModelOption {
  value: string;
  label: string;
  highlightColor?: string;
  tooltip?: string;
  disabled?: boolean;
}

interface FalModelSelectControlConfig {
  kind?: 'select';
  id: string;
  prefixLabel?: string;
  hideSelectedValue?: boolean;
  ariaLabel: string;
  options: ReadonlyArray<ModelOption>;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  errorMessage?: string;
  tooltip?: string;
}

interface FalModelColorControlConfig {
  kind: 'color';
  id: string;
  prefixLabel: string;
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  errorMessage?: string;
}

interface FalModelActionControlConfig {
  kind: 'action';
  id: string;
  label: string;
  ariaLabel: string;
  onClick: () => void;
  disabled: boolean;
  errorMessage?: string;
}

type FalModelControlConfig = FalModelSelectControlConfig | FalModelColorControlConfig | FalModelActionControlConfig;

export type PromptBarControlConfig = FalModelControlConfig;

interface PromptBarProps {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  inputDisabled: boolean;
  submitDisabled: boolean;
  modelOptions: ReadonlyArray<ModelOption>;
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  modelSelectDisabled: boolean;
  modelMode: 'image' | 'video';
  onModelModeChange: (mode: 'image' | 'video') => void;
  modelModeDisabled?: boolean;
  modelControls?: ReadonlyArray<FalModelControlConfig>;
  promptPlaceholder?: string;
  showMultiPrompt?: boolean;
  multiPrompt?: string;
  onMultiPromptChange?: (prompt: string) => void;
  multiPromptPlaceholder?: string;
  multiPromptOutlineColor?: string;
  showNegativePrompt?: boolean;
  negativePrompt?: string;
  onNegativePromptChange?: (prompt: string) => void;
  negativePromptPlaceholder?: string;
  promptOutlineColor?: string;
  negativePromptOutlineColor?: string;
  klingSuggestionsEnabled?: boolean;
  klingReferenceCount?: number;
  klingSuggestionOptions?: ReadonlyArray<string>;
  cameraThemeActive?: boolean;
  layout?: 'footer' | 'inline';
  sizeMode?: 'full' | 'mini';
  showModeSwitch?: boolean;
  leadingAccessory?: React.ReactNode;
  outerClassName?: string;
  outerStyle?: React.CSSProperties;
  maxInlineWidthPx?: number;
  onPromptFocus?: () => void;
  onPromptBlur?: () => void;
  focusRequestToken?: number;
}

export const PromptBar: React.FC<PromptBarProps> = ({
  prompt,
  onPromptChange,
  onSubmit,
  isLoading,
  inputDisabled,
  submitDisabled,
  modelOptions,
  selectedModel,
  onModelChange,
  modelSelectDisabled,
  modelMode,
  onModelModeChange,
  modelModeDisabled,
  modelControls,
  promptPlaceholder,
  showMultiPrompt,
  multiPrompt,
  onMultiPromptChange,
  multiPromptPlaceholder,
  multiPromptOutlineColor,
  showNegativePrompt,
  negativePrompt,
  onNegativePromptChange,
  negativePromptPlaceholder,
  promptOutlineColor,
  negativePromptOutlineColor,
  klingSuggestionsEnabled,
  klingReferenceCount = 0,
  klingSuggestionOptions = [],
  cameraThemeActive = false,
  layout = 'footer',
  sizeMode = 'full',
  showModeSwitch = true,
  leadingAccessory,
  outerClassName,
  outerStyle,
  maxInlineWidthPx,
  onPromptFocus,
  onPromptBlur,
  focusRequestToken,
}) => {
  const resolvedSizeMode = sizeMode as 'full' | 'mini';
  // Prompt input surface with dynamic model selectors and optional negative prompt for video flows.
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const multiPromptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const negativeTextareaRef = useRef<HTMLTextAreaElement>(null);
  const wasLoading = useRef(isLoading);
  const handledFocusRequestTokenRef = useRef(focusRequestToken); // Ignore the initial token and react only to later requests.
  const controlsViewportRef = useRef<HTMLDivElement>(null);
  const controlsStripRef = useRef<HTMLDivElement>(null);
  const promptBarOuterRef = useRef<HTMLElement | null>(null);
  const klingSuggestionListId = React.useId();
  const klingSuggestionListRef = useRef<HTMLDivElement>(null);
  const klingSuggestionOptionRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const [showKlingSuggestions, setShowKlingSuggestions] = React.useState(false);
  const [suggestionPosition, setSuggestionPosition] = React.useState<{
    placement: VerticalMenuPlacement;
    left: number;
    top: number;
    maxWidth: number;
    maxHeight: number;
  } | null>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = React.useState(0);
  const [activeKlingQuery, setActiveKlingQuery] = React.useState('');
  const [promptBarMaxWidthPx, setPromptBarMaxWidthPx] = React.useState(() => getPromptBarBaseMaxWidthPx(resolvedSizeMode));

  const closeKlingSuggestions = React.useCallback(() => {
    setShowKlingSuggestions(false);
    setActiveKlingQuery('');
    setSuggestionPosition(null);
    setActiveSuggestionIndex(0);
  }, []); // Keeps every dismissal path in the same fully reset state.

  const handleSubmitShortcut = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      if (!isLoading && !inputDisabled && !submitDisabled) {
        onSubmit();
      }
    }
  };

  const updatePromptBarWidth = React.useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const baseWidthPx = getPromptBarBaseMaxWidthPx(resolvedSizeMode);
    const viewportClampPx = getPromptBarViewportClampPx(resolvedSizeMode);
    const promptBarOuter = promptBarOuterRef.current;
    const controlsViewport = controlsViewportRef.current;
    const controlsStrip = controlsStripRef.current;
    const baselineControlsViewportWidthPx = promptBarOuter && controlsViewport
      ? (() => {
          const previousWidth = promptBarOuter.style.width;
          const previousMaxWidth = promptBarOuter.style.maxWidth;
          const baselineWidthPx = Math.min(baseWidthPx, viewportClampPx); // Measure from the unexpanded shell width.

          if (layout === 'inline') {
            promptBarOuter.style.width = `${baselineWidthPx}px`;
          }
          promptBarOuter.style.maxWidth = `${baselineWidthPx}px`;

          const measuredWidthPx = controlsViewport.clientWidth;

          promptBarOuter.style.width = previousWidth;
          promptBarOuter.style.maxWidth = previousMaxWidth;

          return measuredWidthPx;
        })()
      : controlsViewport?.clientWidth ?? 0;
    const overflowWidthPx = controlsViewport && controlsStrip
      ? Math.max(0, controlsStrip.scrollWidth - baselineControlsViewportWidthPx)
      : 0; // Treat missing controls as no overflow.
    const desiredWidthPx = baseWidthPx + overflowWidthPx; // Expand the shell only enough to reveal overflowing controls.
    setPromptBarMaxWidthPx(Math.min(desiredWidthPx, viewportClampPx));
  }, [layout, resolvedSizeMode]);

  useLayoutEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [prompt]);

  useEffect(() => {
    // When a generation finishes (isLoading goes from true to false),
    // refocus the textarea so the user can immediately type their next prompt.
    // This also ensures keyboard shortcuts continue to work.
    if (wasLoading.current && !isLoading && !inputDisabled) {
        textareaRef.current?.focus();
    }
    wasLoading.current = isLoading;
  }, [isLoading, inputDisabled]);

  useEffect(() => {
    if (focusRequestToken === undefined || focusRequestToken === handledFocusRequestTokenRef.current) {
      return;
    }
    handledFocusRequestTokenRef.current = focusRequestToken; // Consume the request even when it cannot be honored, so it never fires later.
    if (inputDisabled) {
      return;
    }
    textareaRef.current?.focus(); // Metadata transfers put the caret back in the editable prompt.
  }, [focusRequestToken, inputDisabled]);

  useLayoutEffect(() => {
    if (!showMultiPrompt) {
      return;
    }
    if (multiPromptTextareaRef.current) {
      multiPromptTextareaRef.current.style.height = 'auto';
      multiPromptTextareaRef.current.style.height = `${multiPromptTextareaRef.current.scrollHeight}px`;
    }
  }, [multiPrompt, showMultiPrompt]);

  useLayoutEffect(() => {
    if (!showNegativePrompt) {
      return;
    }
    if (negativeTextareaRef.current) {
      negativeTextareaRef.current.style.height = 'auto';
      negativeTextareaRef.current.style.height = `${negativeTextareaRef.current.scrollHeight}px`;
    }
  }, [negativePrompt, showNegativePrompt]);

  useLayoutEffect(() => {
    updatePromptBarWidth();
  }, [
    selectedModel,
    modelControls
      ?.map(getControlSignature)
      .join('|') ?? '',
    updatePromptBarWidth,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = () => {
      updatePromptBarWidth();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [updatePromptBarWidth]);

  const klingOptions = React.useMemo(() => {
    if (!klingSuggestionsEnabled) return [];
    if (klingSuggestionOptions.length > 0) {
      return [...klingSuggestionOptions];
    }
    if (klingReferenceCount <= 0) {
      return [];
    }
    if (klingReferenceCount === 1) {
      return ['@Image'];
    }
    return Array.from({ length: klingReferenceCount }, (_, idx) => `@Image${idx + 1}`);
  }, [klingReferenceCount, klingSuggestionOptions, klingSuggestionsEnabled]);
  const klingAutocompleteAvailable = klingOptions.length > 0; // Keeps native textarea semantics until autocomplete can actually offer a choice.

  const filteredKlingOptions = React.useMemo(() => {
    if (!klingAutocompleteAvailable) {
      return [];
    }
    if (activeKlingQuery.length === 0) {
      return klingOptions;
    }
    const normalizedQuery = `@${activeKlingQuery.toLowerCase()}`;
    return klingOptions.filter(option => option.toLowerCase().startsWith(normalizedQuery)); // Keep the list open while the user types the rest of the token.
  }, [activeKlingQuery, klingAutocompleteAvailable, klingOptions]);
  const klingSuggestionsOpen = klingAutocompleteAvailable && showKlingSuggestions && filteredKlingOptions.length > 0;
  const activeKlingSuggestionId = klingSuggestionsOpen
    ? `${klingSuggestionListId}-option-${activeSuggestionIndex}`
    : undefined; // Links the focused textarea to its portaled active option.

  const updateKlingSuggestionPosition = React.useCallback((value: string, caret: number) => {
    const textarea = textareaRef.current;
    const listbox = klingSuggestionListRef.current;
    if (!textarea || !listbox) {
      setSuggestionPosition(null);
      return;
    }

    const caretPosition = getTextareaCaretPosition(textarea, value, caret);
    if (!caretPosition) {
      setSuggestionPosition(null);
      return;
    }

    const textareaRect = textarea.getBoundingClientRect();
    const scaleX = textarea.offsetWidth > 0 ? textareaRect.width / textarea.offsetWidth : 1;
    const scaleY = textarea.offsetHeight > 0 ? textareaRect.height / textarea.offsetHeight : 1;
    const computedStyle = window.getComputedStyle(textarea);
    const parsedLineHeight = Number.parseFloat(computedStyle.lineHeight);
    const parsedFontSize = Number.parseFloat(computedStyle.fontSize);
    const lineHeightPx = Number.isFinite(parsedLineHeight)
      ? parsedLineHeight
      : (Number.isFinite(parsedFontSize) ? parsedFontSize * 1.2 : 16); // Browsers can expose "normal" instead of pixels.
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const caretLineTop = textareaRect.top + (caretPosition.top * scaleY);
    const caretLineHeight = lineHeightPx * scaleY;
    const caretLeft = textareaRect.left + (caretPosition.left * scaleX);
    const intrinsicSize = getIntrinsicElementSize(listbox);
    const nextPosition = getViewportMenuPosition({
      anchorRect: {
        left: caretLeft,
        top: caretLineTop,
        bottom: caretLineTop + caretLineHeight,
      },
      menuWidth: intrinsicSize.width,
      menuHeight: intrinsicSize.height,
      viewportWidth,
      viewportHeight,
      gapPx: KLING_SUGGESTION_GAP_PX,
      marginPx: KLING_SUGGESTION_VIEWPORT_MARGIN_PX,
      preferredPlacement: 'top',
    });

    setSuggestionPosition(previous => (
      previous
      && previous.placement === nextPosition.placement
      && previous.left === nextPosition.left
      && previous.top === nextPosition.top
      && previous.maxWidth === nextPosition.maxWidth
      && previous.maxHeight === nextPosition.maxHeight
        ? previous
        : nextPosition
    ));
  }, []);

  const refreshKlingSuggestionPosition = React.useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      updateKlingSuggestionPosition(textarea.value, textarea.selectionStart);
    }
  }, [updateKlingSuggestionPosition]);

  useEffect(() => {
    if (!showKlingSuggestions || filteredKlingOptions.length === 0) {
      setActiveSuggestionIndex(0);
      return;
    }
    setActiveSuggestionIndex(prev => Math.min(Math.max(prev, 0), filteredKlingOptions.length - 1));
  }, [filteredKlingOptions.length, showKlingSuggestions]);

  useEffect(() => {
    if (!showKlingSuggestions || filteredKlingOptions.length === 0) {
      return;
    }
    klingSuggestionOptionRefs.current.get(activeSuggestionIndex)?.scrollIntoView?.({ block: 'nearest' }); // Keeps keyboard focus visible in clipped menus.
  }, [activeSuggestionIndex, filteredKlingOptions.length, showKlingSuggestions]);

  useLayoutEffect(() => {
    if (!showKlingSuggestions || filteredKlingOptions.length === 0) {
      return;
    }
    refreshKlingSuggestionPosition();
  });

  useAnchoredPortalTracking({
    active: klingSuggestionsOpen,
    anchorRef: textareaRef,
    portalRef: klingSuggestionListRef,
    updatePosition: refreshKlingSuggestionPosition,
  });

  const handlePromptChange = (value: string, selectionStart: number | null) => {
    onPromptChange(value);
    if (!klingAutocompleteAvailable) {
      setShowKlingSuggestions(false);
      setActiveKlingQuery('');
      setActiveSuggestionIndex(0);
      return;
    }
    const caret = selectionStart ?? value.length;
    const activeMention = getActiveKlingMention(value, caret);
    if (!activeMention) {
      setShowKlingSuggestions(false);
      setActiveKlingQuery('');
      setSuggestionPosition(null);
      setActiveSuggestionIndex(0);
      return;
    }

    const normalizedQuery = `@${activeMention.query.toLowerCase()}`;
    const hasMatchingOptions = activeMention.query.length === 0
      || klingOptions.some(option => option.toLowerCase().startsWith(normalizedQuery));
    if (!hasMatchingOptions) {
      setShowKlingSuggestions(false);
      setActiveKlingQuery(activeMention.query);
      setSuggestionPosition(null);
      setActiveSuggestionIndex(0);
      return;
    }

    setShowKlingSuggestions(true);
    setActiveKlingQuery(activeMention.query);
    setActiveSuggestionIndex(0);
  };

  const handlePromptKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      handleSubmitShortcut(event);
      return;
    }
    if (!showKlingSuggestions || filteredKlingOptions.length === 0) {
      handleSubmitShortcut(event);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSuggestionIndex(prev => (prev + 1) % filteredKlingOptions.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSuggestionIndex(prev => (prev - 1 + filteredKlingOptions.length) % filteredKlingOptions.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const suggestion = filteredKlingOptions[activeSuggestionIndex] ?? filteredKlingOptions[0];
      if (suggestion) {
        insertKlingSuggestion(suggestion);
      }
      return;
    }
    if (event.key === 'Escape') {
      closeKlingSuggestions();
      return;
    }
    if (event.key === 'Tab') {
      closeKlingSuggestions(); // Closes the portaled popup without blocking normal Tab navigation.
      return;
    }
    handleSubmitShortcut(event);
  };

  const insertKlingSuggestion = (suggestion: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const value = textarea.value;
    const caret = textarea.selectionStart;
    const activeMention = getActiveKlingMention(value, caret);
    if (!activeMention) {
      return;
    }
    const before = value.slice(0, activeMention.startIndex);
    const after = value.slice(caret);
    const nextValue = `${before}${suggestion}${after}`;
    onPromptChange(nextValue);
    const nextCaret = before.length + suggestion.length;
    requestAnimationFrame(() => {
      textarea.setSelectionRange(nextCaret, nextCaret);
      textarea.focus();
    });
    closeKlingSuggestions();
  };

  const handlePromptBlur = () => {
    closeKlingSuggestions();
    onPromptBlur?.();
  }; // A detached popup must close whenever its owning textarea loses focus.

  const resolvedPlaceholder = promptPlaceholder ?? (
    inputDisabled
      ? "Upload or select an image to begin editing..."
      : "Describe your edit or image idea... (Cmd/Ctrl + Enter to generate)"
  );
  const resolvedMultiPromptPlaceholder = multiPromptPlaceholder ?? 'Describe the second shot...';
  const resolvedNegativePromptPlaceholder = negativePromptPlaceholder ?? 'What should the video avoid? (negative prompt)';
  const activeModeClassName = cameraThemeActive ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white';
  const submitButtonAccentClassName = cameraThemeActive ? 'bg-amber-500 hover:bg-amber-400' : 'bg-green-600 hover:bg-green-500';
  const isMiniMode = resolvedSizeMode === 'mini';
  const textareaPaintStyle: React.CSSProperties = { backgroundColor: 'transparent', colorScheme: 'dark' }; // Keep native textarea paint dark before CSS settles.
  const promptTextareaClassName = `w-full appearance-none border-0 bg-transparent text-white shadow-none placeholder-gray-400 focus:outline-none px-[0.79rem] pb-[0.34rem] resize-none overflow-y-auto disabled:text-gray-400 disabled:placeholder-gray-500 disabled:cursor-not-allowed ${
    cameraThemeActive ? 'caret-amber-400' : ''
  }`;

  const getControlTooltip = (control: FalModelSelectControlConfig): string | undefined =>
    control.tooltip ?? control.options.find(option => option.value === control.value)?.tooltip; // Prefer selected option guidance.

  const modelSelectLabel = modelMode === 'video' ? 'Select video model' : 'Select image edit model';
  const resolvedModeDisabled = modelModeDisabled || modelSelectDisabled;
  const resolvedInlineWidthPx = Math.max(0, Math.min(promptBarMaxWidthPx, maxInlineWidthPx ?? Number.POSITIVE_INFINITY)); // Inline bars reuse the shared width logic before the area cap trims them.
  const modelModeOptions: Array<{ value: 'image' | 'video'; label: string }> = [
    { value: 'image', label: 'Image' },
    { value: 'video', label: 'Video' },
  ];
  const containerBaseClass = `relative bg-gray-900/70 backdrop-blur-sm rounded-2xl shadow-xl flex ${isMiniMode ? 'items-center' : 'items-end'} gap-[1.1rem] transition-all duration-300 ease-out ${isMiniMode ? 'py-[0.48rem] pl-[0.7rem] pr-[0.8rem]' : 'py-[0.81rem] pl-[0.83rem] pr-[1.15rem]'}`;
  const promptContainerClass = `${containerBaseClass} ${promptOutlineColor ? 'border' : ''}`;
  const negativePromptContainerClass = `${containerBaseClass} ${negativePromptOutlineColor ? 'border' : ''}`;
  const multiPromptContainerClass = `${containerBaseClass} ${multiPromptOutlineColor ? 'border' : ''}`;
  const promptContainerStyle = promptOutlineColor ? { borderColor: promptOutlineColor } : undefined;
  const negativePromptContainerStyle = negativePromptOutlineColor ? { borderColor: negativePromptOutlineColor } : undefined;
  const multiPromptContainerStyle = multiPromptOutlineColor ? { borderColor: multiPromptOutlineColor } : undefined;
  const textareaMinHeightRem = isMiniMode ? PROMPT_TEXTAREA_MINI_HEIGHT_REM : PROMPT_TEXTAREA_MIN_HEIGHT_REM;
  const textareaMaxHeightRem = isMiniMode ? PROMPT_TEXTAREA_MINI_MAX_HEIGHT_REM : PROMPT_TEXTAREA_MAX_HEIGHT_REM;
  const content = (
    <div className={`flex ${leadingAccessory ? `${isMiniMode ? 'items-center' : 'items-end'} gap-3` : ''}`}>
      {leadingAccessory}
      <div className="flex flex-1 flex-col gap-3">
        {!isMiniMode && showMultiPrompt && (
          <div className={multiPromptContainerClass} style={multiPromptContainerStyle}>
            <div className="flex flex-1 flex-col">
              <div className="flex items-center justify-between pr-1">
                <span className="text-xs font-semibold text-sky-200 uppercase tracking-wide">Multi prompt</span>
              </div>
              <textarea
                ref={multiPromptTextareaRef}
                value={multiPrompt ?? ''}
                onChange={(e) => onMultiPromptChange?.(e.target.value)}
                onKeyDown={handleSubmitShortcut}
                placeholder={resolvedMultiPromptPlaceholder}
                disabled={isLoading || !onMultiPromptChange}
                rows={3}
                className="w-full appearance-none border-0 bg-transparent text-white shadow-none placeholder-gray-400 focus:outline-none px-[0.79rem] pb-[0.34rem] resize-none overflow-y-auto disabled:text-gray-400 disabled:placeholder-gray-500 disabled:cursor-not-allowed"
                style={{ minHeight: `${PROMPT_TEXTAREA_MIN_HEIGHT_REM}rem`, maxHeight: `${PROMPT_TEXTAREA_MAX_HEIGHT_REM}rem`, ...textareaPaintStyle }}
                aria-label="Multi prompt input"
              />
            </div>
          </div>
        )}
        {!isMiniMode && showNegativePrompt && (
          <div className={negativePromptContainerClass} style={negativePromptContainerStyle}>
            <div className="flex flex-1 flex-col">
              <div className="flex items-center justify-between pr-1">
                <span className="text-xs font-semibold text-red-200 uppercase tracking-wide">Negative prompt</span>
              </div>
              <textarea
                ref={negativeTextareaRef}
                value={negativePrompt ?? ''}
                onChange={(e) => onNegativePromptChange?.(e.target.value)}
                onKeyDown={handleSubmitShortcut}
                placeholder={resolvedNegativePromptPlaceholder}
                disabled={isLoading || !onNegativePromptChange}
                rows={3}
                className="w-full appearance-none border-0 bg-transparent text-white shadow-none placeholder-gray-400 focus:outline-none px-[0.79rem] pb-[0.34rem] resize-none overflow-y-auto disabled:text-gray-400 disabled:placeholder-gray-500 disabled:cursor-not-allowed"
                style={{ minHeight: `${PROMPT_TEXTAREA_MIN_HEIGHT_REM}rem`, maxHeight: `${PROMPT_TEXTAREA_MAX_HEIGHT_REM}rem`, ...textareaPaintStyle }}
                aria-label="Negative prompt input"
              />
            </div>
          </div>
        )}
        <div className={promptContainerClass} style={promptContainerStyle}>
          <div className="flex min-w-0 flex-1 flex-col">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => handlePromptChange(e.target.value, e.target.selectionStart)}
              onKeyDown={handlePromptKeyDown}
              onFocus={onPromptFocus}
              onBlur={handlePromptBlur}
              placeholder={resolvedPlaceholder}
              disabled={inputDisabled || isLoading}
              rows={isMiniMode ? 1 : 3}
              className={`${promptTextareaClassName} transition-[min-height,max-height,padding-top,font-size] duration-300 ease-out ${isMiniMode ? 'pt-[0.22rem] text-[0.98rem]' : ''}`}
              style={{ minHeight: `${textareaMinHeightRem}rem`, maxHeight: `${textareaMaxHeightRem}rem`, ...textareaPaintStyle }}
              aria-label="Prompt input"
              aria-autocomplete={klingAutocompleteAvailable ? 'list' : undefined}
              aria-haspopup={klingAutocompleteAvailable ? 'listbox' : undefined}
              aria-controls={klingSuggestionsOpen ? klingSuggestionListId : undefined}
              aria-activedescendant={activeKlingSuggestionId}
            />
            {klingSuggestionsOpen && createPortal(
              <div
                {...CANVAS_INTERACTION_BOUNDARY_PROPS}
                id={klingSuggestionListId}
                ref={klingSuggestionListRef}
                className={`fixed ${OVERLAY_LAYER_CLASS_NAMES.anchoredPopover} w-40 overflow-y-auto rounded-md border border-gray-700 bg-gray-800 shadow-lg`}
                style={{
                  left: suggestionPosition?.left ?? 0,
                  top: suggestionPosition?.top ?? 0,
                  maxWidth: suggestionPosition?.maxWidth,
                  maxHeight: suggestionPosition?.maxHeight,
                  visibility: suggestionPosition ? 'visible' : 'hidden',
                }}
                role="listbox"
                data-placement={suggestionPosition?.placement}
              >
                  {filteredKlingOptions.map((option, index) => {
                    const isActive = index === activeSuggestionIndex;
                    return (
                    <button
                      key={option}
                      id={`${klingSuggestionListId}-option-${index}`}
                      ref={(element) => {
                        if (element) {
                          klingSuggestionOptionRefs.current.set(index, element);
                        } else {
                          klingSuggestionOptionRefs.current.delete(index);
                        }
                      }}
                      type="button"
                      tabIndex={-1}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActiveSuggestionIndex(index)}
                      onClick={() => insertKlingSuggestion(option)}
                      className={`w-full text-left px-3 py-2 text-sm text-white ${isActive ? 'bg-gray-700' : 'hover:bg-gray-700'}`}
                      role="option"
                      aria-selected={isActive}
                    >
                      {option}
                    </button>
                    );
                  })}
              </div>,
              document.body,
            )}
            {!isMiniMode && (
              <div className="flex flex-col gap-2 mt-[0.47rem] ml-[0.5rem]">
                <div
                  className="w-full max-w-full overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                  ref={controlsViewportRef}
                  data-testid="prompt-bar-control-viewport"
                >
                  <div
                    className="relative flex min-w-full w-max flex-nowrap items-center gap-3 pr-2"
                    ref={controlsStripRef}
                    data-testid="prompt-bar-control-strip"
                  >
                    {showModeSwitch && (
                      <div className="flex items-center bg-gray-800/80 rounded-full p-1">
                        {modelModeOptions.map(option => {
                          const isActive = option.value === modelMode;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => onModelModeChange(option.value)}
                              disabled={resolvedModeDisabled}
                              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors duration-150 ${isActive ? activeModeClassName : 'text-gray-300 hover:text-white'} disabled:opacity-60 disabled:cursor-not-allowed`}
                              aria-pressed={isActive}
                              aria-label={`Switch to ${option.label} models`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div>
                      <PromptBarPicker
                        id="model-select"
                        ariaLabel={modelSelectLabel}
                        options={modelOptions}
                        value={selectedModel}
                        onChange={onModelChange}
                        disabled={modelSelectDisabled}
                      />
                    </div>
                    {modelControls?.map(control => {
                      if (control.kind === 'action') {
                        return (
                          <button
                            key={control.id}
                            id={control.id}
                            type="button"
                            onClick={control.onClick}
                            disabled={control.disabled}
                            className="text-sm text-white px-[0.4rem] py-[0.34rem] focus:outline-none focus:ring-0 disabled:text-gray-400 disabled:cursor-not-allowed"
                            aria-label={control.ariaLabel}
                          >
                            {control.label}
                          </button>
                        );
                      }

                      if (control.kind === 'color') {
                        return (
                          <div className="relative flex items-center gap-2" key={control.id}>
                            <span className="text-sm text-gray-200">{control.prefixLabel}</span>
                            <label className="sr-only" htmlFor={control.id}>
                              {control.ariaLabel}
                            </label>
                            <input
                              id={control.id}
                              type="color"
                              value={control.value}
                              onChange={(e) => control.onChange(e.target.value)}
                              disabled={control.disabled}
                              className="h-7 w-7 cursor-pointer appearance-none rounded-md border border-white/20 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-60"
                              style={{ colorScheme: 'light dark' }}
                              aria-label={control.ariaLabel}
                            />
                          </div>
                        );
                      }

                      const controlTooltip = getControlTooltip(control);

                      return (
                      <div className="relative flex items-center gap-1" key={control.id} title={controlTooltip}>
                        {control.hideSelectedValue ? (
                          <div
                            className={`inline-flex items-center focus-within:outline-none ${control.disabled ? 'opacity-60' : ''}`}
                            title={controlTooltip}
                          >
                            <PromptBarPicker
                              id={control.id}
                              ariaLabel={control.ariaLabel}
                              options={control.options}
                              value={control.value}
                              onChange={control.onChange}
                              disabled={control.disabled}
                              displayLabel={control.prefixLabel ?? ''}
                              title={controlTooltip}
                            />
                          </div>
                        ) : (
                          <>
                            {control.prefixLabel && <span className="text-sm text-gray-200">{control.prefixLabel}</span>}
                            <PromptBarPicker
                              id={control.id}
                              ariaLabel={control.ariaLabel}
                              options={control.options}
                              value={control.value}
                              onChange={control.onChange}
                              disabled={control.disabled}
                              title={controlTooltip}
                            />
                          </>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </div>
                {modelControls?.map(control => control.errorMessage ? (
                  <p key={`${control.id}-error`} className="text-xs text-red-400">
                    {control.errorMessage}
                  </p>
                ) : null)}
              </div>
            )}
          </div>
          <Tooltip label="Generate" shortcut={KEYBOARD_SHORTCUT_LABELS.generate}>
            <button
              type="button"
              aria-label="Generate"
              onClick={onSubmit}
              disabled={isLoading || submitDisabled}
              className={`shrink-0 text-white font-semibold rounded-full transition-all duration-300 ease-out disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center justify-center ${isMiniMode ? 'h-[2.28rem] w-[2.28rem]' : 'h-[2.64rem] w-[2.64rem]'} ${submitButtonAccentClassName}`}
            >
              {isLoading ? (
                <span className="flex h-full w-full items-center justify-center leading-none [&>svg]:block">
                  <svg className="animate-spin h-[1.1rem] w-[1.1rem] text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </span>
              ) : (
                <span className="flex h-full w-full items-center justify-center leading-none [&>svg]:block">
                  <LayerUpIcon className="h-[1.1rem] w-[1.1rem] text-white" aria-hidden="true" />
                </span>
              )}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );

  if (layout === 'inline') {
    return (
      <div
        ref={(node) => {
          promptBarOuterRef.current = node;
        }}
        className={`transition-[width,max-width] duration-200 ease-out ${outerClassName ?? ''}`.trim()}
        style={{ width: `${resolvedInlineWidthPx}px`, maxWidth: `${resolvedInlineWidthPx}px`, ...outerStyle }}
        data-testid="prompt-bar-inline"
      >
        {content}
      </div>
    );
  }

  return (
    <footer
      ref={(node) => {
        promptBarOuterRef.current = node;
      }}
      className={`absolute bottom-0 left-1/2 -translate-x-1/2 z-10 ${outerClassName ?? ''}`}
      style={{
        width: `calc(100% - ${PROMPT_BAR_HORIZONTAL_GUTTER_REM}rem)`,
        maxWidth: `${promptBarMaxWidthPx}px`,
        marginBottom: PROMPT_BAR_FOOTER_MARGIN_BOTTOM,
        padding: PROMPT_BAR_FOOTER_PADDING,
        ...outerStyle,
      }}
      data-testid="prompt-bar-footer"
    >
      {content}
    </footer>
  );
};
