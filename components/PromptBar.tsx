import React, { useRef, useEffect } from 'react';
import { ChevronDownIcon } from './Icons';

interface ModelOption {
  value: string;
  label: string;
}

interface PromptBarProps {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  inputDisabled: boolean;
  submitDisabled: boolean;
  modelOptions: ModelOption[];
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  modelSelectDisabled: boolean;
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

  return (
    <footer className="absolute bottom-0 left-1/2 -translate-x-1/2 z-10 mb-4 p-2 w-full max-w-[64rem]">
      <div className="relative bg-gray-900/70 backdrop-blur-sm rounded-lg shadow-xl flex items-center py-2 pl-2 pr-3">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder={inputDisabled ? "Upload or select an image to begin editing..." : "Describe your edit... (Cmd/Ctrl + Enter to generate)"}
          disabled={inputDisabled || isLoading}
          rows={3}
          className="flex-1 bg-transparent text-white placeholder-gray-400 focus:outline-none px-2 mr-12 resize-none overflow-y-auto"
          style={{ maxHeight: '200px' }}
          aria-label="Prompt input"
        />
        <div className="relative flex items-center mr-[10px]">
          <label className="sr-only" htmlFor="model-select">
            Select image edit model
          </label>
          <select
            id="model-select"
            value={selectedModel}
            onChange={(e) => onModelChange(e.target.value)}
            disabled={modelSelectDisabled}
            className="bg-transparent text-white px-1 pr-6 py-1 text-sm focus:outline-none focus:ring-0 appearance-none disabled:text-gray-400"
            aria-label="Select image edit model"
          >
            {modelOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute right-0 text-white/80" aria-hidden="true" />
        </div>
        <button
          onClick={onSubmit}
          disabled={isLoading || submitDisabled}
          className="px-6 py-2.5 bg-green-600 text-white font-semibold rounded-md transition-all duration-200 ease-in-out disabled:bg-gray-500 disabled:cursor-not-allowed hover:bg-green-500 flex items-center justify-center min-w-[120px]"
        >
          {isLoading ? (
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            'Generate'
          )}
        </button>
      </div>
    </footer>
  );
};
