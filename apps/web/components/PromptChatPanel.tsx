import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDownIcon, CopyIcon, LayerUpIcon, RobotIcon } from './Icons';
import {
  OPENROUTER_CHAT_MODELS,
  OPENROUTER_MAX_CHAT_MESSAGES,
  OPENROUTER_MAX_MESSAGE_CHARS,
  sendOpenRouterChat,
  type OpenRouterChatMessage,
  type OpenRouterChatModelId,
} from '../services/openRouterChatService';
import { PROMPT_BAR_FOOTER_MARGIN_BOTTOM } from '../utils/promptBarFooterLayout';
import { OVERLAY_LAYER_CLASS_NAMES } from '../utils/overlayLayers';

type PromptChatPanelProps = {
  isOpen: boolean;
  isSuppressed?: boolean;
  currentPrompt: string;
  onToggle: () => void;
};

const PANEL_WIDTH = 'clamp(380px, 33vw, 620px)'; // Keep the overlay near one-third of desktop width.
const PANEL_LEFT_INSET = '0.625rem'; // Leaves a visible edge away from the app window.
const PANEL_TOP_OFFSET = 'calc(3.25rem + 14px)'; // Aligns below the lower edge of the top toolbar.
const PANEL_BOTTOM_OFFSET = `calc(${PROMPT_BAR_FOOTER_MARGIN_BOTTOM} + 5px)`; // Lifts the panel to the prompt bar bottom edge.
const CHAT_ACTION_BUTTON_SIZE_REM = 2.64; // Matches the normal prompt bar submit button.
const TOGGLE_VIEWPORT_RIGHT_GAP = '1rem'; // Keeps the toggle reachable on narrow screens.
const COPY_STATUS_TIMEOUT_MS = 1600;

const capPromptChatMessages = (messages: OpenRouterChatMessage[]) => {
  const cappedMessages = messages.slice(-OPENROUTER_MAX_CHAT_MESSAGES); // Keep within backend transcript limit.
  const firstUserIndex = cappedMessages.findIndex(message => message.role === 'user'); // Drop orphaned assistant replies.
  return firstUserIndex === -1 ? [] : cappedMessages.slice(firstUserIndex); // OpenRouter context should start with user intent.
};

export const PromptChatPanel: React.FC<PromptChatPanelProps> = ({
  isOpen,
  isSuppressed = false,
  currentPrompt,
  onToggle,
}) => {
  const [model, setModel] = useState<OpenRouterChatModelId>('google/gemini-3.5-flash');
  const [messages, setMessages] = useState<OpenRouterChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const draftTextareaRef = useRef<HTMLTextAreaElement>(null);
  const copyStatusTimeoutRef = useRef<number | null>(null);

  const latestAssistantMessage = useMemo(
    () => [...messages].reverse().find(message => message.role === 'assistant') ?? null,
    [messages],
  );
  const selectedModelLabel = OPENROUTER_CHAT_MODELS.find(option => option.id === model)?.label ?? model;

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [messages, isSending]);

  useEffect(() => () => {
    if (copyStatusTimeoutRef.current !== null) {
      window.clearTimeout(copyStatusTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    const textarea = draftTextareaRef.current;
    if (!textarea) {
      return;
    }
    const panelHeight = panelRef.current?.clientHeight ?? window.innerHeight;
    const maxHeight = Math.max(96, Math.floor(panelHeight / 3)); // Composer grows until it uses one third of the panel.
    textarea.style.height = 'auto';
    textarea.style.maxHeight = `${maxHeight}px`;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [draft, isOpen]);

  const showCopyStatus = (status: string) => {
    setCopyStatus(status);
    if (copyStatusTimeoutRef.current !== null) {
      window.clearTimeout(copyStatusTimeoutRef.current);
    }
    copyStatusTimeoutRef.current = window.setTimeout(() => setCopyStatus(null), COPY_STATUS_TIMEOUT_MS);
  };

  const copyText = async (text: string, emptyMessage: string, successMessage: string) => {
    const trimmedText = text.trim();
    if (!trimmedText) {
      showCopyStatus(emptyMessage);
      return;
    }
    try {
      await navigator.clipboard.writeText(trimmedText);
      showCopyStatus(successMessage);
    } catch {
      showCopyStatus('Copy failed');
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isSending) {
      return;
    }
    if (content.length > OPENROUTER_MAX_MESSAGE_CHARS) {
      setError(`Prompt chat messages must be ${OPENROUTER_MAX_MESSAGE_CHARS.toLocaleString()} characters or fewer.`);
      return;
    }
    const userMessage: OpenRouterChatMessage = { role: 'user', content };
    const nextMessages = capPromptChatMessages([...messages, userMessage]); // Keep whole turns after capping.
    setMessages(nextMessages);
    setDraft('');
    setError(null);
    setIsSending(true);
    try {
      const response = await sendOpenRouterChat({ model, messages: nextMessages });
      setMessages(currentMessages => capPromptChatMessages([...currentMessages, response.message])); // Keep local transcript valid too.
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : String(chatError));
    } finally {
      setIsSending(false);
    }
  };

  const handleDraftKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) {
      return; // IME Enter confirms text before it should submit.
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const panelTransform = isOpen ? 'translateX(0)' : 'translateX(calc(-1 * (var(--prompt-chat-panel-width) + var(--prompt-chat-panel-left-inset))))';
  const toggleLeft = isOpen
    ? `min(calc(var(--prompt-chat-panel-left-inset) + var(--prompt-chat-panel-width) + 0.75rem), calc(100vw - ${CHAT_ACTION_BUTTON_SIZE_REM}rem - ${TOGGLE_VIEWPORT_RIGHT_GAP}))`
    : '1rem';
  const modelPicker = (
    <div className="flex min-w-0 items-center gap-2">
      <span className="text-sm font-bold text-white">Model:</span>
      <div className="relative inline-flex min-w-0 items-center gap-1.5 py-1">
        <span className="truncate text-sm font-semibold text-white">{selectedModelLabel}</span>
        <ChevronDownIcon className="h-3 w-3 shrink-0 text-white/80" aria-hidden="true" />
        <select
          id="prompt-chat-model"
          value={model}
          onChange={event => setModel(event.target.value as OpenRouterChatModelId)}
          disabled={isSending}
          aria-label="Prompt chat model"
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent text-transparent opacity-0 outline-none disabled:cursor-not-allowed"
          style={{ colorScheme: 'dark' }}
        >
          {OPENROUTER_CHAT_MODELS.map(option => (
            <option key={option.id} value={option.id} className="bg-gray-950 text-white">{option.label}</option>
          ))}
        </select>
      </div>
    </div>
  );

  if (isSuppressed) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={isOpen}
        aria-label={isOpen ? 'Close prompt chat' : 'Open prompt chat'}
        title={isOpen ? 'Close prompt chat' : 'Open prompt chat'}
        className={`fixed top-1/2 ${OVERLAY_LAYER_CLASS_NAMES.floatingPanel} flex -translate-y-1/2 items-center justify-center rounded-full border border-cyan-300/25 bg-gray-950/92 text-cyan-100 shadow-2xl shadow-black/40 backdrop-blur-md transition-[background-color,border-color,left] duration-200 hover:border-cyan-200/60 hover:bg-cyan-300/12`}
        style={{
          left: toggleLeft,
          height: `${CHAT_ACTION_BUTTON_SIZE_REM}rem`,
          width: `${CHAT_ACTION_BUTTON_SIZE_REM}rem`,
          ['--prompt-chat-panel-width' as string]: PANEL_WIDTH,
          ['--prompt-chat-panel-left-inset' as string]: PANEL_LEFT_INSET,
        }}
      >
        <span className="flex h-full w-full items-center justify-center leading-none [&>svg]:block">
          <RobotIcon className="h-5 w-5" />
        </span>
      </button>
      <aside
        ref={panelRef}
        aria-label="Prompt chat"
        aria-hidden={!isOpen}
        className={`fixed ${OVERLAY_LAYER_CLASS_NAMES.floatingPanel} flex max-w-[calc(100vw-4.75rem)] flex-col overflow-hidden rounded-lg border border-white/10 bg-[#050917]/96 text-gray-100 shadow-[10px_0_24px_rgba(0,0,0,0.18),0_10px_18px_rgba(0,0,0,0.16)] backdrop-blur-xl transition-transform duration-200`}
        style={{
          left: PANEL_LEFT_INSET,
          top: PANEL_TOP_OFFSET,
          bottom: PANEL_BOTTOM_OFFSET,
          width: PANEL_WIDTH,
          transform: panelTransform,
          ['--prompt-chat-panel-width' as string]: PANEL_WIDTH,
          ['--prompt-chat-panel-left-inset' as string]: PANEL_LEFT_INSET,
        }}
      >
        {isOpen && (
          <>
            <div className="pointer-events-none absolute left-3 right-3 top-3 z-10 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => copyText(currentPrompt, 'No prompt', 'Prompt copied')}
                className="pointer-events-auto flex h-8 items-center gap-2 rounded-md border border-white/10 bg-[#080A16] px-2.5 text-xs font-semibold text-gray-200 shadow-[5px_0_12px_rgba(0,0,0,0.12),0_6px_10px_rgba(0,0,0,0.14)] backdrop-blur-md transition-colors hover:bg-white/10"
              >
                <CopyIcon className="h-3.5 w-3.5" />
                Copy prompt
              </button>
              <button
                type="button"
                onClick={() => copyText(latestAssistantMessage?.content ?? '', 'No reply', 'Reply copied')}
                disabled={!latestAssistantMessage}
                className="pointer-events-auto flex h-8 items-center gap-2 rounded-md border border-white/10 bg-[#080A16] px-2.5 text-xs font-semibold text-gray-200 shadow-[5px_0_12px_rgba(0,0,0,0.12),0_6px_10px_rgba(0,0,0,0.14)] backdrop-blur-md transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <CopyIcon className="h-3.5 w-3.5" />
                Copy latest reply
              </button>
            </div>

            <div ref={transcriptRef} className="min-h-0 flex-1 overflow-y-auto bg-[#01030a]/96 px-3 pb-4 pt-14">
              {messages.length === 0 ? (
                <p className="text-sm leading-6 text-gray-400">Ask for a sharper prompt, alternate versions, or a cleaner structure.</p>
              ) : (
                <div className="space-y-4">
                  {messages.map((message, index) => (
                    <div key={`${message.role}-${index}`} className={message.role === 'user' ? 'flex justify-end' : 'block'}>
                      {message.role === 'user' ? (
                        <div className="max-w-[86%] rounded-md bg-cyan-500/18 px-3 py-2 text-sm leading-6 text-cyan-50">
                          {message.content}
                        </div>
                      ) : (
                        <div className="prompt-chat-markdown text-sm leading-6 text-gray-100">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            disallowedElements={['img']}
                            components={{
                              a: ({ children, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-cyan-200 underline decoration-cyan-200/40 underline-offset-2">{children}</a>,
                              code: ({ children, className, ...props }) => (
                                <code {...props} className={`${className ?? ''} rounded bg-black/35 px-1 py-0.5 text-[0.85em] text-cyan-100`}>
                                  {children}
                                </code>
                              ),
                              pre: ({ children }) => <pre className="my-3 overflow-x-auto rounded-md border border-white/10 bg-black/35 p-3 text-xs">{children}</pre>,
                              ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
                              ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
                              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  ))}
                  {isSending && <p className="text-sm text-gray-400">Thinking...</p>}
                </div>
              )}
            </div>

            <footer className="shrink-0 border-t border-white/10 p-3">
              {error && <p className="mb-2 rounded-md border border-red-300/25 bg-red-400/10 px-3 py-2 text-xs text-red-100">{error}</p>}
              {copyStatus && <p className="mb-2 text-xs font-semibold text-cyan-100">{copyStatus}</p>}
              <div className="mb-2 px-3">{modelPicker}</div>
              <form onSubmit={handleSubmit} className="relative">
                <textarea
                  ref={draftTextareaRef}
                  value={draft}
                  onChange={event => setDraft(event.target.value)}
                  onKeyDown={handleDraftKeyDown}
                  disabled={isSending}
                  aria-label="Prompt chat message"
                  placeholder="Ask for prompt help..."
                  rows={3}
                  className="min-h-20 w-full resize-none rounded-md border border-white/10 bg-black/35 py-2 pl-3 pr-16 text-sm leading-5 text-white outline-none transition-colors placeholder:text-gray-500 focus:border-cyan-300/60 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  type="submit"
                  aria-label="Send"
                  disabled={isSending || draft.trim().length === 0}
                  className="absolute bottom-[0.875rem] right-3 flex items-center justify-center rounded-full bg-green-600 text-sm font-semibold text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:bg-gray-500"
                  style={{ height: `${CHAT_ACTION_BUTTON_SIZE_REM}rem`, width: `${CHAT_ACTION_BUTTON_SIZE_REM}rem` }}
                >
                  {isSending ? (
                    <span className="flex h-full w-full items-center justify-center leading-none [&>svg]:block">
                      <svg className="h-[1.1rem] w-[1.1rem] animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
              </form>
            </footer>
          </>
        )}
      </aside>
    </>
  );
};
