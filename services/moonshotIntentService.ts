import { addDebugLog } from './debugLog';
import { getSecureBackendApiBaseUrl } from './secureBackendService';

export type HeygenClipIntent = {
  startTime?: number;
  endTime?: number;
};

type MoonshotIntentResponse = {
  start_time?: unknown;
  end_time?: unknown;
  detail?: unknown;
};

type ExtractHeygenClipIntentOptions = {
  videoDurationSeconds?: number;
};

const MOONSHOT_BACKEND_UNREACHABLE_MESSAGE_SUFFIX = 'Run `npm run secure-backend:dev` so the Node backend can call Moonshot.';
const MOONSHOT_INTENT_ENDPOINT = '/api/moonshot/intent'; // General Moonshot intent route.

const normalizeSeconds = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return Math.round(parsed * 1000) / 1000;
};

const buildMoonshotBackendUnreachableError = (baseUrl: string, errorText: string): Error => {
  addDebugLog({
    direction: 'error',
    source: 'moonshot',
    title: 'Moonshot intent backend',
    message: 'Moonshot intent backend unreachable',
    data: {
      baseUrl,
      error: errorText,
    },
  });
  return new Error(`Moonshot intent parsing could not reach the local backend at ${baseUrl}. ${MOONSHOT_BACKEND_UNREACHABLE_MESSAGE_SUFFIX}`);
};

export const extractHeygenClipIntent = async (
  prompt: string,
  options: ExtractHeygenClipIntentOptions = {},
): Promise<HeygenClipIntent> => {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    return {};
  }

  const baseUrl = getSecureBackendApiBaseUrl();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${MOONSHOT_INTENT_ENDPOINT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: trimmedPrompt,
        ...(Number.isFinite(options.videoDurationSeconds) ? { video_duration_seconds: options.videoDurationSeconds } : {}),
      }),
    });
  } catch (error) {
    const errorText = error instanceof Error ? error.message : String(error);
    throw buildMoonshotBackendUnreachableError(baseUrl, errorText);
  }

  const data = await response.json().catch(() => ({})) as MoonshotIntentResponse;
  if (!response.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : 'Moonshot intent parsing failed.';
    throw new Error(detail);
  }

  const startTime = normalizeSeconds(data.start_time);
  const endTime = normalizeSeconds(data.end_time);
  return {
    ...(startTime !== undefined ? { startTime } : {}),
    ...(endTime !== undefined ? { endTime } : {}),
  };
};
