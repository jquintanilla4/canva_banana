import type { Seedance2Variant } from '../types';
import { addDebugLog } from './debugLog';

export type VolcengineQueueStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'; // Match the existing queue panel states.

export type VolcengineQueueUpdate = {
  status: VolcengineQueueStatus;
  requestId?: string;
  logs?: string[];
  outputUrl?: string;
  providerOutputUrl?: string;
  error?: string;
};

type GenerateSeedanceVideoOptions = {
  modelId: string;
  variant: Seedance2Variant;
  aspectRatio: '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | 'adaptive';
  duration: '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15';
  resolution: '480p' | '720p' | '1080p';
  generateAudio: boolean;
  cameraFixed: boolean;
  primaryImageFile?: File | null;
  lastFrameImageFile?: File | null;
  referenceImageFiles?: File[];
  referenceVideoFiles?: File[];
  referenceAudioFiles?: File[];
  onQueueUpdate?: (update: VolcengineQueueUpdate) => void;
};

type VolcengineJobResponse = {
  id: string;
  modelId: string;
  modelLabel: string;
  variant: Seedance2Variant;
  prompt: string;
  status: VolcengineQueueStatus;
  createdAt: number;
  updatedAt: number;
  logs: string[];
  requestId?: string;
  remoteTaskId?: string;
  outputUrl?: string;
  providerOutputUrl?: string;
  lastFrameUrl?: string;
  providerLastFrameUrl?: string;
  error?: string;
  provider: 'volcengine';
};

type VolcengineHealthResponse = {
  status: string;
  ffprobeAvailable?: boolean;
  ffprobeSource?: 'env' | 'system' | 'bundled' | 'missing';
  ffprobePath?: string | null;
  ffprobeWarning?: string | null;
};

type VolcengineTransportStage = 'health' | 'submit' | 'socket' | 'resync'; // Track the active backend hop in debug logs.

type VolcengineSocketResult =
  | { kind: 'terminal'; job: VolcengineJobResponse }
  | { kind: 'disconnected'; reason: string }; // Keep reconnect decisions explicit after each socket attempt.

const DEFAULT_VOLCENGINE_API_BASE_URL = 'http://localhost:8000'; // Local backend default.
const SOCKET_RECONNECT_BASE_DELAY_MS = 1000; // First reconnect waits one second.
const SOCKET_RECONNECT_MAX_DELAY_MS = 5000; // Cap retries so recovery stays responsive.
const VOLCENGINE_BACKEND_UNREACHABLE_MESSAGE_SUFFIX = 'Run `uv sync --project backend` once, then `npm run backend:dev`.'; // Point local setup failures at the expected commands.

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms)); // Reuse browser timers for reconnect backoff.

const getVolcengineApiBaseUrl = (): string => {
  const raw = process.env.VOLCENGINE_API_BASE_URL?.trim() || DEFAULT_VOLCENGINE_API_BASE_URL;
  return raw.replace(/\/+$/, ''); // Avoid double slashes when building paths.
};

const getVolcengineJobSocketUrl = (baseUrl: string, jobId: string): string => {
  const socketUrl = new URL(baseUrl);
  socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:'; // Mirror the backend transport security level.
  socketUrl.pathname = `${socketUrl.pathname.replace(/\/+$/, '')}/api/volcengine/jobs/${jobId}/ws`;
  socketUrl.search = '';
  socketUrl.hash = '';
  return socketUrl.toString();
};

const resolveVolcengineAssetUrl = (assetUrl: string | undefined, baseUrl: string): string | undefined => {
  if (!assetUrl) {
    return assetUrl;
  }
  if (/^https?:\/\//i.test(assetUrl)) {
    return assetUrl;
  }
  return new URL(assetUrl, `${baseUrl}/`).toString(); // Backend responses may hand back relative proxy URLs.
};

const normalizeJobAssetUrls = (
  job: VolcengineJobResponse,
  baseUrl: string,
): VolcengineJobResponse => ({
  ...job,
  outputUrl: resolveVolcengineAssetUrl(job.outputUrl, baseUrl),
  lastFrameUrl: resolveVolcengineAssetUrl(job.lastFrameUrl, baseUrl),
}); // Keep all consumers on absolute URLs after the backend rewrites assets through its proxy.

const mapJobToQueueUpdate = (job: VolcengineJobResponse): VolcengineQueueUpdate => ({
  status: job.status,
  requestId: job.requestId,
  logs: job.logs,
  outputUrl: job.outputUrl,
  providerOutputUrl: job.providerOutputUrl,
  error: job.error,
});

const isTerminalJobStatus = (status: VolcengineQueueStatus): boolean =>
  status === 'COMPLETED' || status === 'FAILED'; // Socket reconnects stop once the job is done.

const buildVolcengineBackendUnreachableMessage = (baseUrl: string): string =>
  `Seedance 2 could not reach the local Volcengine backend at ${baseUrl}. ${VOLCENGINE_BACKEND_UNREACHABLE_MESSAGE_SUFFIX}`; // Keep the banner text stable across transport failures.

const buildVolcengineBackendUnreachableError = (
  baseUrl: string,
  stage: VolcengineTransportStage,
  errorText: string,
): Error => {
  addDebugLog({
    direction: 'error',
    source: 'volcengine',
    title: 'Volcengine backend',
    message: 'Seedance 2 backend unreachable',
    data: {
      baseUrl,
      stage,
      error: errorText,
    },
  });
  return new Error(buildVolcengineBackendUnreachableMessage(baseUrl)); // The queue and banner should show one actionable recovery path.
};

const fetchVolcengine = async (
  baseUrl: string,
  path: string,
  stage: VolcengineTransportStage,
  init?: RequestInit,
  options?: { requireOk?: boolean },
): Promise<Response> => {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, init);
  } catch (error) {
    const errorText = error instanceof Error ? error.message : String(error);
    throw buildVolcengineBackendUnreachableError(baseUrl, stage, errorText); // Browser transport failures never return an HTTP response.
  }

  if (options?.requireOk && !response.ok) {
    const errorText = response.statusText ? `HTTP ${response.status} ${response.statusText}` : `HTTP ${response.status}`;
    throw buildVolcengineBackendUnreachableError(baseUrl, stage, errorText); // Health must be reachable before submit starts.
  }

  return response;
};

const parseJobPayload = (
  data: unknown,
  baseUrl: string,
): VolcengineJobResponse => normalizeJobAssetUrls(data as VolcengineJobResponse, baseUrl); // REST and WebSocket payloads share the same job schema.

const parseJobResponse = async (
  response: Response,
  baseUrl: string,
): Promise<VolcengineJobResponse> => {
  const data = await response.json() as VolcengineJobResponse | { detail?: string };
  if (!response.ok) {
    throw new Error(typeof (data as { detail?: unknown }).detail === 'string' ? (data as { detail?: string }).detail as string : 'Volcengine request failed.');
  }
  return parseJobPayload(data, baseUrl);
};

const parseSocketJobResponse = (
  data: unknown,
  baseUrl: string,
): VolcengineJobResponse => {
  if (typeof data === 'string') {
    return parseJobPayload(JSON.parse(data) as unknown, baseUrl);
  }
  if (data && typeof data === 'object') {
    return parseJobPayload(data, baseUrl);
  }
  throw new Error('Volcengine returned an invalid WebSocket payload.'); // Guard against malformed backend pushes.
};

const fetchJobSnapshot = async (
  baseUrl: string,
  jobId: string,
  stage: VolcengineTransportStage,
): Promise<VolcengineJobResponse> => {
  const response = await fetchVolcengine(baseUrl, `/api/volcengine/jobs/${jobId}`, stage);
  return parseJobResponse(response, baseUrl);
};

const parseHealthResponse = async (
  response: Response,
  baseUrl: string,
): Promise<VolcengineHealthResponse> => {
  try {
    return await response.json() as VolcengineHealthResponse;
  } catch (error) {
    const errorText = error instanceof Error ? error.message : String(error);
    throw buildVolcengineBackendUnreachableError(baseUrl, 'health', `Invalid health response: ${errorText}`); // Empty localhost responses should stay actionable.
  }
};

const maybeLogFfprobeFallback = async (
  health: VolcengineHealthResponse,
  options: GenerateSeedanceVideoOptions,
): Promise<void> => {
  if (!options.referenceVideoFiles?.length && !options.referenceAudioFiles?.length) {
    return;
  }

  if (health.ffprobeAvailable === false) {
    addDebugLog({
      direction: 'info',
      source: 'volcengine',
      title: 'Volcengine backend',
      message: 'ffprobe unavailable; backend reference duration validation is using the fallback path',
      data: {
        ffprobeSource: health.ffprobeSource,
        ffprobePath: health.ffprobePath,
        ffprobeWarning: health.ffprobeWarning,
      },
    });
  }
};

const buildSocketDisconnectReason = (
  socketUrl: string,
  event: CloseEvent,
): string => {
  if (event.reason) {
    return `WebSocket closed (${event.code}): ${event.reason}`; // Preserve backend close reasons like job-not-found.
  }
  if (event.wasClean) {
    return `WebSocket closed cleanly (${event.code})`; // Clean closes without a terminal payload still need recovery.
  }
  return `WebSocket connection to ${socketUrl} closed unexpectedly (${event.code})`; // Keep recovery logs actionable.
};

const streamSeedanceJob = async (
  baseUrl: string,
  jobId: string,
  options: GenerateSeedanceVideoOptions,
): Promise<VolcengineSocketResult> => {
  const socketUrl = getVolcengineJobSocketUrl(baseUrl, jobId);

  return new Promise<VolcengineSocketResult>((resolve, reject) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(socketUrl);
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      reject(buildVolcengineBackendUnreachableError(baseUrl, 'socket', errorText));
      return;
    }

    let settled = false;
    let lastSocketError: string | null = null;

    socket.onopen = () => {
      addDebugLog({
        direction: 'info',
        source: 'volcengine',
        title: 'Volcengine backend',
        message: 'Seedance 2 job stream connected',
        data: {
          jobId,
          socketUrl,
        },
      });
    };

    socket.onmessage = event => {
      if (settled) {
        return;
      }

      let job: VolcengineJobResponse;
      try {
        job = parseSocketJobResponse(event.data, baseUrl);
      } catch (error) {
        settled = true;
        socket.close();
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      options.onQueueUpdate?.(mapJobToQueueUpdate(job));
      if (!isTerminalJobStatus(job.status)) {
        return;
      }

      settled = true;
      resolve({ kind: 'terminal', job });
    };

    socket.onerror = () => {
      lastSocketError = `WebSocket error while streaming Seedance 2 job ${jobId}.`; // Browsers hide the low-level cause on socket errors.
    };

    socket.onclose = event => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({
        kind: 'disconnected',
        reason: lastSocketError || buildSocketDisconnectReason(socketUrl, event),
      });
    };
  });
};

const reconnectToSeedanceJob = async (
  baseUrl: string,
  jobId: string,
  reconnectAttempt: number,
  options: GenerateSeedanceVideoOptions,
): Promise<VolcengineJobResponse> => {
  const reconnectDelayMs = Math.min(
    SOCKET_RECONNECT_BASE_DELAY_MS * (2 ** reconnectAttempt),
    SOCKET_RECONNECT_MAX_DELAY_MS,
  );

  addDebugLog({
    direction: 'info',
    source: 'volcengine',
    title: 'Volcengine backend',
    message: 'Seedance 2 job stream disconnected; attempting recovery',
    data: {
      jobId,
      reconnectAttempt: reconnectAttempt + 1,
      reconnectDelayMs,
    },
  });

  await wait(reconnectDelayMs);

  const job = await fetchJobSnapshot(baseUrl, jobId, 'resync');
  options.onQueueUpdate?.(mapJobToQueueUpdate(job));
  return job;
};

export const generateSeedanceVideo = async (
  prompt: string,
  options: GenerateSeedanceVideoOptions,
): Promise<{ videoUrl: string; providerVideoUrl?: string; requestId?: string; lastFrameUrl?: string; providerLastFrameUrl?: string }> => {
  const formData = new FormData();
  formData.set('prompt', prompt);
  formData.set('model_id', options.modelId);
  formData.set('variant', options.variant);
  formData.set('ratio', options.aspectRatio);
  formData.set('duration', options.duration);
  formData.set('resolution', options.resolution);
  formData.set('generate_audio', String(options.generateAudio));
  formData.set('camera_fixed', String(options.cameraFixed));

  if (options.primaryImageFile) {
    formData.append('primary_image', options.primaryImageFile); // Smart i2v primary frame.
  }
  if (options.lastFrameImageFile) {
    formData.append('last_frame_image', options.lastFrameImageFile); // Smart first/last-frame tail image.
  }
  options.referenceImageFiles?.forEach(file => {
    formData.append('reference_images', file); // Reference variant image refs.
  });
  options.referenceVideoFiles?.forEach(file => {
    formData.append('reference_videos', file); // Reference variant video refs.
  });
  options.referenceAudioFiles?.forEach(file => {
    formData.append('reference_audios', file); // Reference variant audio refs.
  });

  const baseUrl = getVolcengineApiBaseUrl();
  const healthResponse = await fetchVolcengine(baseUrl, '/health', 'health', undefined, { requireOk: true });
  const health = await parseHealthResponse(healthResponse, baseUrl);
  await maybeLogFfprobeFallback(health, options);

  addDebugLog({
    direction: 'outbound',
    source: 'volcengine',
    title: options.modelId,
    message: 'Submitting Seedance 2 request',
    data: {
      variant: options.variant,
      aspectRatio: options.aspectRatio,
      duration: options.duration,
      resolution: options.resolution,
      baseUrl,
    },
  });

  const submitResponse = await fetchVolcengine(baseUrl, '/api/volcengine/jobs', 'submit', {
    method: 'POST',
    body: formData,
  });
  let job = await parseJobResponse(submitResponse, baseUrl);
  options.onQueueUpdate?.(mapJobToQueueUpdate(job));

  addDebugLog({
    direction: 'inbound',
    source: 'volcengine',
    title: options.modelId,
    message: 'Seedance 2 job accepted',
    data: {
      jobId: job.id,
      requestId: job.requestId,
      status: job.status,
    },
  });

  for (let reconnectAttempt = 0; !isTerminalJobStatus(job.status); reconnectAttempt += 1) {
    const socketResult = await streamSeedanceJob(baseUrl, job.id, options);
    if (socketResult.kind === 'terminal') {
      job = socketResult.job;
      break;
    }

    addDebugLog({
      direction: 'info',
      source: 'volcengine',
      title: 'Volcengine backend',
      message: 'Seedance 2 job stream closed before completion',
      data: {
        jobId: job.id,
        reason: socketResult.reason,
      },
    });

    job = await reconnectToSeedanceJob(baseUrl, job.id, reconnectAttempt, options);
  }

  addDebugLog({
    direction: job.status === 'COMPLETED' ? 'inbound' : 'error',
    source: 'volcengine',
    title: options.modelId,
    message: job.status === 'COMPLETED' ? 'Seedance 2 job completed' : 'Seedance 2 job failed',
    data: {
      jobId: job.id,
      requestId: job.requestId,
      outputUrl: job.outputUrl,
      providerOutputUrl: job.providerOutputUrl,
      error: job.error,
    },
  });

  if (job.status !== 'COMPLETED' || !job.outputUrl) {
    throw new Error(job.error || 'Volcengine did not return a video URL.');
  }

  return {
    videoUrl: job.outputUrl,
    providerVideoUrl: job.providerOutputUrl,
    requestId: job.requestId,
    lastFrameUrl: job.lastFrameUrl,
    providerLastFrameUrl: job.providerLastFrameUrl,
  };
};
