import React, { useRef, useEffect } from 'react';

interface PromptBarProps {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  inputDisabled: boolean;
  submitDisabled: boolean;
}

export const PromptBar: React.FC<PromptBarProps> = ({ prompt, onPromptChange, onSubmit, isLoading, inputDisabled, submitDisabled }) => {
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
    <footer className="absolute bottom-0 left-1/2 -translate-x-1/2 z-10 mb-4 p-2 w-full max-w-4xl">
      <div className="relative bg-gray-900/70 backdrop-blur-sm rounded-lg shadow-xl flex items-center space-x-2 py-2 pl-2 pr-3">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder={inputDisabled ? "Upload or select an image to begin editing..." : "Describe your edit... (Cmd/Ctrl + Enter to generate)"}
          disabled={inputDisabled || isLoading}
          rows={3}
          className="w-full bg-transparent text-white placeholder-gray-400 focus:outline-none px-2 resize-none overflow-y-auto"
          style={{ maxHeight: '200px' }}
          aria-label="Prompt input"
        />
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