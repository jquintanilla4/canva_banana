import type { JimengSeedance2ModelVersion, Seedance2Variant } from '../types';
import { addDebugLog } from './debugLog';

export type JimengQueueStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'; // Match the shared generation queue states.

export type JimengQueueUpdate = {
  status: JimengQueueStatus;
  requestId?: string;
  logs?: string[];
  outputUrl?: string;
  providerOutputUrl?: string;
  error?: string;
};

export type JimengSetupStatus = {
  status?: string;
  ready: boolean;
  backendReachable: boolean;
  cliAvailable?: boolean;
  authenticated?: boolean;
  executable?: string;
  message?: string;
  detail?: string;
  authUrl?: string;
  loginOutput?: string;
};

export type JimengSetupActionResult = {
  status: string;
  message: string;
  output?: string;
  pid?: number;
  debug?: boolean;
  authUrl?: string;
};

export type JimengCacheClearResult = {
  status: 'ok' | 'partial';
  deletedFiles: number;
  bytesFreed: number;
  workDir: string;
  errors: string[];
};

type GenerateJimengSeedanceVideoOptions = {
  modelId: string;
  variant: Seedance2Variant;
  modelVersion: JimengSeedance2ModelVersion;
  aspectRatio: '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | 'adaptive';
  duration: '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15';
  resolution: '480p' | '720p' | '1080p';
  generateAudio: boolean;
  cameraFixed: boolean;
  primaryImageFile?: File | null;
  referenceImageFiles?: File[];
  referenceVideoFiles?: File[];
  referenceAudioFiles?: File[];
  onQueueUpdate?: (update: JimengQueueUpdate) => void;
};

type JimengJobResponse = {
  id: string;
  modelId: string;
  modelLabel: string;
  variant: Seedance2Variant;
  prompt: string;
  status: JimengQueueStatus;
  createdAt: number;
  updatedAt: number;
  logs: string[];
  requestId?: string;
  remoteTaskId?: string;
  outputUrl?: string;
  providerOutputUrl?: string | null;
  error?: string;
  provider: 'jimeng';
};

type JimengTransportStage = 'health' | 'submit' | 'socket' | 'resync'; // Identify the backend hop in debug logs.

type JimengSocketResult =
  | { kind: 'terminal'; job: JimengJobResponse }
  | { kind: 'disconnected'; reason: string }; // Keep reconnect decisions explicit.

const DEFAULT_JIMENG_API_BASE_URL = 'http://localhost:8000'; // Jimeng routes live on the existing Python backend.
const JIMENG_SETUP_ACTION_HEADERS = { 'X-Canva-Banana-Local-Action': 'jimeng-setup' }; // Forces setup mutations through local preflight checks.
const SOCKET_RECONNECT_BASE_DELAY_MS = 1000; // First reconnect waits one second.
const SOCKET_RECONNECT_MAX_DELAY_MS = 5000; // Cap retries so recovery stays responsive.
const SOCKET_RECONNECT_MAX_ATTEMPTS = 5; // Stop stale non-terminal jobs from hanging forever.
const JIMENG_BACKEND_UNREACHABLE_MESSAGE_SUFFIX = 'Run `uv sync --project backend` once, then `npm run backend:dev`. Install/update Jimeng CLI with `curl -fsSL https://jimeng.jianying.com/cli | bash`, then run `dreamina login`.'; // Local setup path.

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms)); // Browser timer wrapper for backoff.

const getJimengApiBaseUrl = (): string => {
  const raw = process.env.JIMENG_API_BASE_URL?.trim() || DEFAULT_JIMENG_API_BASE_URL;
  return raw.replace(/\/+$/, ''); // Avoid double slashes when building paths.
};

const getJimengJobSocketUrl = (baseUrl: string, jobId: string): string => {
  const socketUrl = new URL(baseUrl);
  socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:'; // Match HTTP transport security.
  socketUrl.pathname = `${socketUrl.pathname.replace(/\/+$/, '')}/api/jimeng/jobs/${jobId}/ws`;
  socketUrl.search = '';
  socketUrl.hash = '';
  return socketUrl.toString();
};

const resolveJimengAssetUrl = (assetUrl: string | undefined, baseUrl: string): string | undefined => {
  if (!assetUrl || /^https?:\/\//i.test(assetUrl)) {
    return assetUrl;
  }
  return new URL(assetUrl, `${baseUrl}/`).toString(); // Backend may return relative proxy paths.
};

const normalizeJobAssetUrls = (job: JimengJobResponse, baseUrl: string): JimengJobResponse => ({
  ...job,
  outputUrl: resolveJimengAssetUrl(job.outputUrl, baseUrl),
}); // Keep consumers on absolute URLs after backend proxy rewrites.

const mapJobToQueueUpdate = (job: JimengJobResponse): JimengQueueUpdate => ({
  status: job.status,
  requestId: job.requestId,
  logs: job.logs,
  outputUrl: job.outputUrl,
  providerOutputUrl: job.providerOutputUrl || undefined,
  error: job.error,
});

const isTerminalJobStatus = (status: JimengQueueStatus): boolean =>
  status === 'COMPLETED' || status === 'FAILED'; // Socket reconnects stop once the job is done.

const buildJimengBackendUnreachableMessage = (baseUrl: string): string =>
  `Seedance 2 (JM CLI) could not reach the local Jimeng backend at ${baseUrl}. ${JIMENG_BACKEND_UNREACHABLE_MESSAGE_SUFFIX}`; // Keep setup errors actionable.

const buildJimengBackendUnreachableError = (
  baseUrl: string,
  stage: JimengTransportStage,
  errorText: string,
): Error => {
  addDebugLog({
    direction: 'error',
    source: 'jimeng',
    title: 'Jimeng backend',
    message: 'Seedance 2 (JM CLI) backend unreachable',
    data: {
      baseUrl,
      stage,
      error: errorText,
    },
  });
  return new Error(buildJimengBackendUnreachableMessage(baseUrl)); // Show one stable recovery path in the UI.
};

const fetchJimeng = async (
  baseUrl: string,
  path: string,
  stage: JimengTransportStage,
  init?: RequestInit,
  options?: { requireOk?: boolean },
): Promise<Response> => {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, init);
  } catch (error) {
    const errorText = error instanceof Error ? error.message : String(error);
    throw buildJimengBackendUnreachableError(baseUrl, stage, errorText); // Browser transport failures do not return HTTP details.
  }

  if (options?.requireOk && !response.ok) {
    let detail = response.statusText ? `HTTP ${response.status} ${response.statusText}` : `HTTP ${response.status}`;
    try {
      const payload = await response.json() as { detail?: unknown };
      detail = typeof payload.detail === 'string' ? payload.detail : detail;
    } catch {
      // Keep the HTTP status when the backend does not return JSON.
    }
    throw buildJimengBackendUnreachableError(baseUrl, stage, detail);
  }

  return response;
};

const parseJobPayload = (data: unknown, baseUrl: string): JimengJobResponse =>
  normalizeJobAssetUrls(data as JimengJobResponse, baseUrl); // REST and socket payloads share the same schema.

const parseJobResponse = async (response: Response, baseUrl: string): Promise<JimengJobResponse> => {
  const data = await response.json() as JimengJobResponse | { detail?: string };
  if (!response.ok) {
    throw new Error(typeof (data as { detail?: unknown }).detail === 'string' ? (data as { detail?: string }).detail as string : 'Jimeng request failed.');
  }
  return parseJobPayload(data, baseUrl);
};

const parseSetupError = async (response: Response): Promise<string> => {
  try {
    const payload = await response.json() as { detail?: unknown };
    return typeof payload.detail === 'string' ? payload.detail : `HTTP ${response.status} ${response.statusText}`; // Prefer backend setup detail when present.
  } catch {
    return `HTTP ${response.status} ${response.statusText}`; // Non-JSON failures still need a readable status.
  }
};

export const getJimengSetupStatus = async (): Promise<JimengSetupStatus> => {
  const baseUrl = getJimengApiBaseUrl();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/jimeng/setup/status`, { headers: JIMENG_SETUP_ACTION_HEADERS });
  } catch (error) {
    const errorText = error instanceof Error ? error.message : String(error);
    return {
      status: 'offline',
      ready: false,
      backendReachable: false,
      message: `Jimeng backend unavailable at ${baseUrl}: ${errorText}`,
    }; // The backend must be running before install/login buttons can work.
  }

  if (!response.ok) {
    return {
      status: 'error',
      ready: false,
      backendReachable: true,
      message: await parseSetupError(response),
    };
  }

  const payload = await response.json() as {
    status?: string;
    ready?: boolean;
    cliAvailable?: boolean;
    authenticated?: boolean;
    executable?: string;
    message?: string;
    detail?: string;
  };
  const ready = payload.ready === true || Boolean(payload.cliAvailable && payload.authenticated);
  return {
    status: payload.status,
    ready,
    backendReachable: true,
    cliAvailable: payload.cliAvailable,
    authenticated: payload.authenticated,
    executable: payload.executable,
    message: payload.message || (ready ? 'Jimeng CLI is ready' : undefined),
    detail: payload.detail,
  }; // Setup status separates install availability from login readiness.
};

const runJimengSetupAction = async (path: string): Promise<JimengSetupActionResult> => {
  const baseUrl = getJimengApiBaseUrl();
  const response = await fetchJimeng(baseUrl, path, 'health', { method: 'POST', headers: JIMENG_SETUP_ACTION_HEADERS });
  const data = await response.json().catch(() => ({})) as JimengSetupActionResult | { detail?: string };
  if (!response.ok) {
    throw new Error(typeof (data as { detail?: unknown }).detail === 'string' ? (data as { detail?: string }).detail as string : 'Jimeng setup action failed.');
  }
  return data as JimengSetupActionResult;
};

export const installJimengCli = async (): Promise<JimengSetupActionResult> =>
  runJimengSetupAction('/api/jimeng/setup/install'); // User-triggered install/update action.

export const startJimengLogin = async (debug = false): Promise<JimengSetupActionResult> =>
  runJimengSetupAction(`/api/jimeng/setup/login${debug ? '?debug=true' : ''}`); // Launch browser auth from the backend host.

export const clearJimengCache = async (): Promise<JimengCacheClearResult> => {
  const baseUrl = getJimengApiBaseUrl();
  const response = await fetchJimeng(baseUrl, '/api/jimeng/cache', 'health', { method: 'DELETE', headers: JIMENG_SETUP_ACTION_HEADERS });
  const data = await response.json().catch(() => ({})) as JimengCacheClearResult | { detail?: string };
  if (!response.ok) {
    throw new Error(typeof (data as { detail?: unknown }).detail === 'string' ? (data as { detail?: string }).detail as string : 'Failed to clear Jimeng cache.');
  }
  return data as JimengCacheClearResult;
}; // User-triggered cleanup for local generated Jimeng videos.

const parseSocketJobResponse = (data: unknown, baseUrl: string): JimengJobResponse => {
  if (typeof data === 'string') {
    return parseJobPayload(JSON.parse(data) as unknown, baseUrl);
  }
  if (data && typeof data === 'object') {
    return parseJobPayload(data, baseUrl);
  }
  throw new Error('Jimeng backend returned an invalid WebSocket payload.'); // Guard against malformed backend pushes.
};

const fetchJobSnapshot = async (
  baseUrl: string,
  jobId: string,
  stage: JimengTransportStage,
): Promise<JimengJobResponse> => {
  const response = await fetchJimeng(baseUrl, `/api/jimeng/jobs/${jobId}`, stage);
  return parseJobResponse(response, baseUrl);
};

const buildSocketDisconnectReason = (socketUrl: string, event: CloseEvent): string => {
  if (event.reason) {
    return `WebSocket closed (${event.code}): ${event.reason}`; // Preserve backend close reasons.
  }
  if (event.wasClean) {
    return `WebSocket closed cleanly (${event.code})`; // Clean closes before terminal payload still need recovery.
  }
  return `WebSocket connection to ${socketUrl} closed unexpectedly (${event.code})`; // Keep recovery logs actionable.
};

const streamJimengJob = async (
  baseUrl: string,
  jobId: string,
  options: GenerateJimengSeedanceVideoOptions,
): Promise<JimengSocketResult> => {
  const socketUrl = getJimengJobSocketUrl(baseUrl, jobId);

  return new Promise<JimengSocketResult>((resolve, reject) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(socketUrl);
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      reject(buildJimengBackendUnreachableError(baseUrl, 'socket', errorText));
      return;
    }

    let settled = false;
    let lastSocketError: string | null = null;

    socket.onopen = () => {
      addDebugLog({
        direction: 'info',
        source: 'jimeng',
        title: 'Jimeng backend',
        message: 'Seedance 2 (JM CLI) job stream connected',
        data: { jobId, socketUrl },
      });
    };

    socket.onmessage = event => {
      if (settled) {
        return;
      }

      let job: JimengJobResponse;
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
      lastSocketError = `WebSocket error while streaming Jimeng job ${jobId}.`; // Browsers hide the low-level cause.
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

const reconnectToJimengJob = async (
  baseUrl: string,
  jobId: string,
  reconnectAttempt: number,
  options: GenerateJimengSeedanceVideoOptions,
): Promise<JimengJobResponse> => {
  const reconnectDelayMs = Math.min(SOCKET_RECONNECT_BASE_DELAY_MS * (2 ** reconnectAttempt), SOCKET_RECONNECT_MAX_DELAY_MS);

  addDebugLog({
    direction: 'info',
    source: 'jimeng',
    title: 'Jimeng backend',
    message: 'Seedance 2 (JM CLI) job stream disconnected; attempting recovery',
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

export const generateJimengSeedanceVideo = async (
  prompt: string,
  options: GenerateJimengSeedanceVideoOptions,
): Promise<{ videoUrl: string; providerVideoUrl?: string; requestId?: string }> => {
  const formData = new FormData();
  formData.set('prompt', prompt);
  formData.set('model_id', options.modelId);
  formData.set('variant', options.variant);
  formData.set('model_version', options.modelVersion);
  formData.set('ratio', options.aspectRatio);
  formData.set('duration', options.duration);
  formData.set('resolution', options.resolution);
  formData.set('generate_audio', String(options.generateAudio));
  formData.set('camera_fixed', String(options.cameraFixed));

  if (options.primaryImageFile) {
    formData.append('primary_image', options.primaryImageFile); // Optional first frame for image2video.
  }
  options.referenceImageFiles?.forEach(file => formData.append('reference_images', file)); // Reference mode maps to multimodal2video.
  options.referenceVideoFiles?.forEach(file => formData.append('reference_videos', file)); // Reference videos are uploaded by the backend CLI.
  options.referenceAudioFiles?.forEach(file => formData.append('reference_audios', file)); // Audio refs are accepted by multimodal2video.

  const baseUrl = getJimengApiBaseUrl();
  const setupStatus = await getJimengSetupStatus();
  if (!setupStatus.ready) {
    throw new Error(setupStatus.message || 'Jimeng CLI is not ready. Install the CLI and complete login before generating.');
  }

  addDebugLog({
    direction: 'outbound',
    source: 'jimeng',
    title: options.modelId,
    message: 'Submitting Seedance 2 (JM CLI) request',
    data: {
      variant: options.variant,
      modelVersion: options.modelVersion,
      aspectRatio: options.aspectRatio,
      duration: options.duration,
      resolution: options.resolution,
      baseUrl,
    },
  });

  const submitResponse = await fetchJimeng(baseUrl, '/api/jimeng/jobs', 'submit', {
    method: 'POST',
    headers: JIMENG_SETUP_ACTION_HEADERS,
    body: formData,
  });
  let job = await parseJobResponse(submitResponse, baseUrl);
  options.onQueueUpdate?.(mapJobToQueueUpdate(job));

  addDebugLog({
    direction: 'inbound',
    source: 'jimeng',
    title: options.modelId,
    message: 'Seedance 2 (JM CLI) job accepted',
    data: {
      jobId: job.id,
      requestId: job.requestId,
      status: job.status,
    },
  });

  for (let reconnectAttempt = 0; !isTerminalJobStatus(job.status); reconnectAttempt += 1) {
    const socketResult = await streamJimengJob(baseUrl, job.id, options);
    if (socketResult.kind === 'terminal') {
      job = socketResult.job;
      break;
    }

    addDebugLog({
      direction: 'info',
      source: 'jimeng',
      title: 'Jimeng backend',
      message: 'Seedance 2 (JM CLI) job stream closed before completion',
      data: {
        jobId: job.id,
        reason: socketResult.reason,
      },
    });

    if (reconnectAttempt >= SOCKET_RECONNECT_MAX_ATTEMPTS) {
      throw new Error(`Jimeng job stream did not recover after ${SOCKET_RECONNECT_MAX_ATTEMPTS} reconnect attempts. Recheck the job in the Jimeng setup panel or try again.`);
    }

    job = await reconnectToJimengJob(baseUrl, job.id, reconnectAttempt, options);
  }

  addDebugLog({
    direction: job.status === 'COMPLETED' ? 'inbound' : 'error',
    source: 'jimeng',
    title: options.modelId,
    message: job.status === 'COMPLETED' ? 'Seedance 2 (JM CLI) job completed' : 'Seedance 2 (JM CLI) job failed',
    data: {
      jobId: job.id,
      requestId: job.requestId,
      outputUrl: job.outputUrl,
      providerOutputUrl: job.providerOutputUrl,
      error: job.error,
    },
  });

  if (job.status !== 'COMPLETED' || !job.outputUrl) {
    throw new Error(job.error || 'Jimeng did not return a video URL.');
  }

  return {
    videoUrl: job.outputUrl,
    providerVideoUrl: job.providerOutputUrl || undefined,
    requestId: job.requestId,
  };
};
