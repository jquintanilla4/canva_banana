import { getSecureBackendApiBaseUrl, getSecureBackendAuthHeaders } from './secureBackendService';

export const OPENROUTER_CHAT_MODELS = [
  { id: 'google/gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
  { id: 'openai/gpt-5.5', label: 'GPT 5.5' },
] as const;
export const OPENROUTER_MAX_CHAT_MESSAGES = 40; // Backend rejects longer transcripts.
export const OPENROUTER_MAX_MESSAGE_CHARS = 12000; // Backend per-message character limit.

export type OpenRouterChatModelId = typeof OPENROUTER_CHAT_MODELS[number]['id'];

export type OpenRouterChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type OpenRouterChatResponse = {
  message: OpenRouterChatMessage;
  model: string;
  usage?: unknown;
};

type OpenRouterChatPayload = {
  model: OpenRouterChatModelId;
  messages: OpenRouterChatMessage[];
};

type OpenRouterChatErrorResponse = {
  detail?: unknown;
};

const OPENROUTER_CHAT_ENDPOINT = '/api/openrouter/chat'; // Secure backend keeps the OpenRouter key server-side.
const OPENROUTER_BACKEND_UNREACHABLE_MESSAGE_SUFFIX = 'Run `npm run secure-backend:dev` so the Node backend can call OpenRouter.';

export const sendOpenRouterChat = async (payload: OpenRouterChatPayload): Promise<OpenRouterChatResponse> => {
  const baseUrl = getSecureBackendApiBaseUrl();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${OPENROUTER_CHAT_ENDPOINT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getSecureBackendAuthHeaders() },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const errorText = error instanceof Error ? error.message : String(error);
    throw new Error(`Prompt chat could not reach the local backend at ${baseUrl}. ${OPENROUTER_BACKEND_UNREACHABLE_MESSAGE_SUFFIX} ${errorText}`);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorPayload = data as OpenRouterChatErrorResponse;
    const detail = typeof errorPayload.detail === 'string' ? errorPayload.detail : 'Prompt chat request failed.';
    throw new Error(detail);
  }

  return data as OpenRouterChatResponse;
};
