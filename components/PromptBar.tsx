import React, { useRef, useEffect, useLayoutEffect } from 'react';
import { ChevronDownIcon, LayerUpIcon } from './Icons';

interface ModelOption {
  value: string;
  label: string;
  highlightColor?: string;
}

interface FalModelControlConfig {
  id: string;
  ariaLabel: string;
  options: ReadonlyArray<ModelOption>;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  errorMessage?: string;
}

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
  showNegativePrompt?: boolean;
  negativePrompt?: string;
  onNegativePromptChange?: (prompt: string) => void;
  negativePromptPlaceholder?: string;
  promptOutlineColor?: string;
  negativePromptOutlineColor?: string;
  klingSuggestionsEnabled?: boolean;
  klingReferenceCount?: number;
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
  showNegativePrompt,
  negativePrompt,
  onNegativePromptChange,
  negativePromptPlaceholder,
  promptOutlineColor,
  negativePromptOutlineColor,
  klingSuggestionsEnabled,
  klingReferenceCount = 0,
}) => {
  // Prompt input surface with dynamic model selectors and optional negative prompt for video flows.
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const negativeTextareaRef = useRef<HTMLTextAreaElement>(null);
  const wasLoading = useRef(isLoading);
  const modelSelectRef = useRef<HTMLSelectElement>(null);
  const controlSelectRefs = useRef<Map<string, HTMLSelectElement>>(new Map());
  const [showKlingSuggestions, setShowKlingSuggestions] = React.useState(false);
  const [suggestionPosition, setSuggestionPosition] = React.useState<{ left: number; top: number } | null>(null);

  const handleSubmitShortcut = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      if (!isLoading && !inputDisabled && !submitDisabled) {
        onSubmit();
      }
    }
  };

  const resizeSelectToContent = (selectEl: HTMLSelectElement | null) => {
    if (!selectEl) return;
    const selectedText = selectEl.selectedOptions?.[0]?.textContent ?? selectEl.value ?? '';
    const computedStyle = window.getComputedStyle(selectEl);
    const font = computedStyle.font || `${computedStyle.fontSize} ${computedStyle.fontFamily}`;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;
    context.font = font;
    const textWidth = context.measureText(selectedText).width;
    const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
    const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
    const arrowAllowance = 12; // space for chevron icon
    const minWidth = textWidth + paddingLeft + paddingRight + arrowAllowance;
    selectEl.style.width = `${Math.ceil(minWidth)}px`;
  };

  useEffect(() => {
    if (textareaRef.current) {
      // Reset height to allow shrinking
      textareaRef.current.style.height = 'auto';
      // Set height to scroll height to fit content
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
    if (!showNegativePrompt) {
      return;
    }
    if (negativeTextareaRef.current) {
      negativeTextareaRef.current.style.height = 'auto';
      negativeTextareaRef.current.style.height = `${negativeTextareaRef.current.scrollHeight}px`;
    }
  }, [negativePrompt, showNegativePrompt]);

  useLayoutEffect(() => {
    resizeSelectToContent(modelSelectRef.current);
    controlSelectRefs.current.forEach(selectEl => {
      resizeSelectToContent(selectEl);
    });
  }, [
    selectedModel,
    modelControls
      ?.map(control => `${control.id}-${control.value}-${control.options.map(option => option.label).join('~')}`)
      .join('|') ?? '',
  ]);

  const klingOptions = React.useMemo(() => {
    if (!klingSuggestionsEnabled) return [];
    if (klingReferenceCount <= 1) {
      return ['@Image'];
    }
    return Array.from({ length: klingReferenceCount }, (_, idx) => `@Image${idx + 1}`);
  }, [klingReferenceCount, klingSuggestionsEnabled]);

  const handlePromptChange = (value: string, selectionStart: number | null) => {
    onPromptChange(value);
    if (!klingSuggestionsEnabled || klingOptions.length === 0) {
      setShowKlingSuggestions(false);
      return;
    }
    const caret = selectionStart ?? value.length;
    const charBeforeCaret = value.charAt(Math.max(0, caret - 1));
    if (charBeforeCaret === '@') {
      setShowKlingSuggestions(true);
      const textarea = textareaRef.current;
      if (textarea) {
        const { offsetLeft, offsetTop } = textarea;
        const lineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight || '16');
        const font = window.getComputedStyle(textarea).font || `${window.getComputedStyle(textarea).fontSize} ${window.getComputedStyle(textarea).fontFamily}`;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const textUntilCaret = value.slice(0, caret);
        let caretX = 0;
        if (ctx) {
          ctx.font = font;
          const lines = textUntilCaret.split('\n');
          const currentLine = lines[lines.length - 1] ?? '';
          caretX = ctx.measureText(currentLine).width;
        }
        const lineIndex = textUntilCaret.split('\n').length - 1;
        const top = offsetTop + lineIndex * lineHeight + lineHeight;
        setSuggestionPosition({ left: offsetLeft + caretX + 14, top });
      }
    } else {
      setShowKlingSuggestions(false);
      setSuggestionPosition(null);
    }
  };

  const insertKlingSuggestion = (suggestion: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const value = textarea.value;
    const caret = textarea.selectionStart;
    const startIdx = value.lastIndexOf('@', caret - 1);
    if (startIdx === -1) {
      return;
    }
    const before = value.slice(0, startIdx);
    const after = value.slice(caret);
    const nextValue = `${before}${suggestion}${after}`;
    onPromptChange(nextValue);
    const nextCaret = before.length + suggestion.length;
    requestAnimationFrame(() => {
      textarea.setSelectionRange(nextCaret, nextCaret);
      textarea.focus();
    });
    setShowKlingSuggestions(false);
  };

  const resolvedPlaceholder = promptPlaceholder ?? (
    inputDisabled
      ? "Upload or select an image to begin editing..."
      : "Describe your edit or image idea... (Cmd/Ctrl + Enter to generate)"
  );
  const resolvedNegativePromptPlaceholder = negativePromptPlaceholder ?? 'What should the video avoid? (negative prompt)';

  const selectedModelOption = modelOptions.find(option => option.value === selectedModel);
  const selectHighlightStyle = selectedModelOption?.highlightColor
    ? { color: selectedModelOption.highlightColor }
    : undefined;

  const modelSelectLabel = modelMode === 'video' ? 'Select video model' : 'Select image edit model';
  const resolvedModeDisabled = modelModeDisabled || modelSelectDisabled;
  const modelModeOptions: Array<{ value: 'image' | 'video'; label: string }> = [
    { value: 'image', label: 'Image' },
    { value: 'video', label: 'Video' },
  ];
  const containerBaseClass = 'relative bg-gray-900/70 backdrop-blur-sm rounded-2xl shadow-xl flex items-end gap-[1.1rem] py-[0.81rem] pl-[0.83rem] pr-[1.15rem]';
  const promptContainerClass = `${containerBaseClass} ${promptOutlineColor ? 'border' : ''}`;
  const negativePromptContainerClass = `${containerBaseClass} ${negativePromptOutlineColor ? 'border' : ''}`;
  const promptContainerStyle = promptOutlineColor ? { borderColor: promptOutlineColor } : undefined;
  const negativePromptContainerStyle = negativePromptOutlineColor ? { borderColor: negativePromptOutlineColor } : undefined;

  return (
    <footer className="absolute bottom-0 left-1/2 -translate-x-1/2 z-10 mb-[1.02rem] p-[0.61rem] w-full max-w-[69.1rem]">
      <div className="flex flex-col gap-3">
        {showNegativePrompt && (
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
              className="flex-1 bg-transparent text-white placeholder-gray-400 focus:outline-none px-[0.79rem] pb-[0.34rem] resize-none overflow-y-auto disabled:text-gray-400 disabled:placeholder-gray-500 disabled:cursor-not-allowed"
              style={{ minHeight: '92px', maxHeight: '269px' }}
                aria-label="Negative prompt input"
              />
            </div>
          </div>
        )}
        <div className={promptContainerClass} style={promptContainerStyle}>
          <div className="flex flex-1 flex-col">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => handlePromptChange(e.target.value, e.target.selectionStart)}
              onKeyDown={handleSubmitShortcut}
              placeholder={resolvedPlaceholder}
              disabled={inputDisabled || isLoading}
              rows={3}
              className="flex-1 bg-transparent text-white placeholder-gray-400 focus:outline-none px-[0.79rem] pb-[0.34rem] resize-none overflow-y-auto disabled:text-gray-400 disabled:placeholder-gray-500 disabled:cursor-not-allowed"
              style={{ minHeight: '92px', maxHeight: '269px' }}
              aria-label="Prompt input"
            />
            {showKlingSuggestions && klingOptions.length > 0 && suggestionPosition && (
              <div className="absolute z-20" style={{ left: suggestionPosition.left, top: suggestionPosition.top }}>
                <div className="mt-1 w-40 rounded-md border border-gray-700 bg-gray-800 shadow-lg">
                  {klingOptions.map(option => (
                    <button
                      key={option}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => insertKlingSuggestion(option)}
                      className="w-full text-left px-3 py-2 text-sm text-white hover:bg-gray-700"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-col gap-2 mt-[0.47rem] ml-[0.5rem]">
              <div className="relative flex flex-wrap items-center gap-3">
                <div className="flex items-center bg-gray-800/80 rounded-full p-1">
                  {modelModeOptions.map(option => {
                    const isActive = option.value === modelMode;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onModelModeChange(option.value)}
                        disabled={resolvedModeDisabled}
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors duration-150 ${isActive ? 'bg-blue-500 text-white' : 'text-gray-300 hover:text-white'} disabled:opacity-60 disabled:cursor-not-allowed`}
                        aria-pressed={isActive}
                        aria-label={`Switch to ${option.label} models`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <div className="relative">
                  <label className="sr-only" htmlFor="model-select">
                    {modelSelectLabel}
                  </label>
                  <select
                    id="model-select"
                    ref={modelSelectRef}
                    value={selectedModel}
                    onChange={(e) => onModelChange(e.target.value)}
                    disabled={modelSelectDisabled}
                    className="bg-transparent text-white px-[0.4rem] pr-[1.8rem] py-[0.34rem] text-sm focus:outline-none focus:ring-0 appearance-none disabled:text-gray-400"
                    style={selectHighlightStyle}
                    aria-label={modelSelectLabel}
                  >
                    {modelOptions.map(option => (
                      <option
                        key={option.value}
                        value={option.value}
                        style={option.highlightColor ? { color: option.highlightColor } : undefined}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-white/80" aria-hidden="true" />
                </div>
                {modelControls?.map(control => (
                  <div className="relative" key={control.id}>
                    <label className="sr-only" htmlFor={control.id}>
                      {control.ariaLabel}
                    </label>
                    <select
                      id={control.id}
                      ref={el => {
                        if (el) {
                          controlSelectRefs.current.set(control.id, el);
                        } else {
                          controlSelectRefs.current.delete(control.id);
                        }
                      }}
                      value={control.value}
                      onChange={(e) => control.onChange(e.target.value)}
                      disabled={control.disabled}
                      className="bg-transparent text-white px-[0.4rem] pr-[1.8rem] py-[0.34rem] text-sm focus:outline-none focus:ring-0 appearance-none disabled:text-gray-400"
                      aria-label={control.ariaLabel}
                    >
                      {control.options.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDownIcon className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-white/80" aria-hidden="true" />
                  </div>
                ))}
              </div>
              {modelControls?.map(control => control.errorMessage ? (
                <p key={`${control.id}-error`} className="text-xs text-red-400">
                  {control.errorMessage}
                </p>
              ) : null)}
            </div>
          </div>
          <button
            type="button"
            aria-label="Generate"
            onClick={onSubmit}
            disabled={isLoading || submitDisabled}
            className="h-[2.64rem] w-[2.64rem] bg-green-600 text-white font-semibold rounded-full transition-all duration-200 ease-in-out disabled:bg-gray-500 disabled:cursor-not-allowed hover:bg-green-500 flex items-center justify-center"
          >
            {isLoading ? (
              <svg className="animate-spin h-[1.1rem] w-[1.1rem] text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <LayerUpIcon className="h-[1.1rem] w-[1.1rem] text-white" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </footer>
  );
};
