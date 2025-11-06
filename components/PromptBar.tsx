import React, { useRef, useEffect } from 'react';
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
  modelControls?: ReadonlyArray<FalModelControlConfig>;
  promptPlaceholder?: string;
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
  modelControls,
  promptPlaceholder,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wasLoading = useRef(isLoading);

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

  const resolvedPlaceholder = promptPlaceholder ?? (
    inputDisabled
      ? "Upload or select an image to begin editing..."
      : "Describe your edit or image idea... (Cmd/Ctrl + Enter to generate)"
  );

  const selectedModelOption = modelOptions.find(option => option.value === selectedModel);
  const selectHighlightStyle = selectedModelOption?.highlightColor
    ? { color: selectedModelOption.highlightColor }
    : undefined;

  return (
    <footer className="absolute bottom-0 left-1/2 -translate-x-1/2 z-10 mb-[1.02rem] p-[0.61rem] w-full max-w-[69.1rem]">
      <div className="relative bg-gray-900/70 backdrop-blur-sm rounded-2xl shadow-xl flex items-end gap-[1.1rem] py-[0.81rem] pl-[0.83rem] pr-[1.15rem]">
        <div className="flex flex-1 flex-col">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder={resolvedPlaceholder}
            disabled={inputDisabled || isLoading}
            rows={3}
            className="flex-1 bg-transparent text-white placeholder-gray-400 focus:outline-none px-[0.79rem] pb-[0.34rem] resize-none overflow-y-auto disabled:text-gray-400 disabled:placeholder-gray-500 disabled:cursor-not-allowed"
            style={{ minHeight: '92px', maxHeight: '269px' }}
            aria-label="Prompt input"
          />
          <div className="flex flex-col gap-2 mt-[0.47rem] ml-[0.5rem]">
            <div className="relative flex flex-wrap items-center gap-3">
              <div className="relative">
                <label className="sr-only" htmlFor="model-select">
                  Select image edit model
                </label>
                <select
                  id="model-select"
                  value={selectedModel}
                  onChange={(e) => onModelChange(e.target.value)}
                  disabled={modelSelectDisabled}
                  className="bg-transparent text-white px-[0.4rem] pr-[1.8rem] py-[0.34rem] text-sm focus:outline-none focus:ring-0 appearance-none disabled:text-gray-400"
                  style={selectHighlightStyle}
                  aria-label="Select image edit model"
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
    </footer>
  );
};
