import { getPythonBackendAuthHeadersForUrl } from './pythonBackendAuth';
import { getRuntimeConfig } from './runtimeConfig';
import { getWorkspaceSignal, workspaceDelay, workspaceFetch } from './workspaceSession';

export type JimengCanvasMediaType = 'image' | 'video';
export type JimengCanvasMode = 't2i' | 'i2i' | 't2v' | 'first_last_frame' | 'm2v';

export interface JimengCanvasCatalogFlag {
  flag: string;
  required?: boolean;
  values?: (string | number | boolean)[];
  min?: number;
  max?: number;
  step?: number;
  minLength?: number;
  maxLength?: number;
}

export interface JimengCanvasReferences {
  min: number;
  max: number;
  types: { mediaType: JimengCanvasMediaType | 'audio'; min: number; max: number }[];
  requireAnyOfTypes?: string[];
}

export interface JimengCanvasCatalogMode {
  name: string;
  scenario?: string;
  flags: JimengCanvasCatalogFlag[];
  references?: JimengCanvasReferences;
}

export interface JimengCanvasModel {
  model: string;
  displayName: string;
  aliases: string[];
  type: JimengCanvasMediaType;
  modes: JimengCanvasCatalogMode[];
}

export interface JimengCanvasSetupStatus {
  cliAvailable: boolean;
  authenticated: boolean;
  version?: string;
  message?: string;
}

export interface JimengCanvasSetupAction {
  status?: string;
  message?: string;
  authenticated?: boolean;
  loginSessionId?: string;
  verificationUri?: string;
  userCode?: string;
  expiresAt?: string | number;
}

export interface JimengCanvasJobSpec {
  requestId: string;
  workspaceKey?: string;
  mediaType: JimengCanvasMediaType;
  mode: JimengCanvasMode;
  model: string;
  prompt: string;
  ratio?: string;
  resolution?: string;
  duration?: number;
  count?: number;
}

export interface JimengCanvasQuote {
  revision: string;
  credits: number;
}

export interface JimengCanvasAsset {
  id: string;
  contentType: string;
}

interface JimengCanvasJobDetails {
  id: string;
  mediaType: JimengCanvasMediaType;
  message?: string;
  assets: JimengCanvasAsset[];
}

export type JimengCanvasJob = JimengCanvasJobDetails & (
  | { phase: 'awaiting_approval'; quote: JimengCanvasQuote }
  | { phase: 'preparing' | 'submitting' | 'running' | 'recovering' | 'completed' | 'failed' | 'cancelled'; quote?: JimengCanvasQuote }
);

export type JimengCanvasApprovalJob = Extract<JimengCanvasJob, { phase: 'awaiting_approval' }>;
export interface JimengCanvasRequestOptions { signal?: AbortSignal }

export class JimengCanvasRequestError extends Error {
  readonly kind = 'jimeng_canvas_error';

  constructor(
    message: string,
    readonly code: 'transport' | 'http' | 'invalid_response',
    readonly status?: number,
  ) {
    super(message);
    this.name = 'JimengCanvasRequestError';
  }
}

const invalidResponse = (): never => {
  throw new JimengCanvasRequestError('Jimeng Canvas returned an invalid response.', 'invalid_response');
};

const objectValue = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidResponse();
  return Object.fromEntries(Object.entries(value));
};

const stringValue = (value: unknown): string => typeof value === 'string' && value.trim() ? value : invalidResponse();
const optionalString = (value: unknown): string | undefined => value === undefined || value === null ? undefined : typeof value === 'string' ? value : invalidResponse();
const booleanValue = (value: unknown): boolean => typeof value === 'boolean' ? value : invalidResponse();
const arrayValue = (value: unknown): unknown[] => Array.isArray(value) ? value : invalidResponse();
const mediaTypeValue = (value: unknown): JimengCanvasMediaType => value === 'image' || value === 'video' ? value : invalidResponse();

const numberValue = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? value : invalidResponse();
const optionalNumber = (value: unknown): number | undefined => value === undefined ? undefined : numberValue(value);

const parseCatalogFlag = (value: unknown): JimengCanvasCatalogFlag => {
  const data = objectValue(value);
  return {
    flag: stringValue(data.flag),
    required: data.required === undefined ? undefined : booleanValue(data.required),
    values: data.values === undefined ? undefined : arrayValue(data.values).map(entry => {
      if (typeof entry === 'string' || typeof entry === 'boolean') return entry;
      return numberValue(entry);
    }),
    min: optionalNumber(data.min),
    max: optionalNumber(data.max),
    step: optionalNumber(data.step),
    minLength: optionalNumber(data.minLength),
    maxLength: optionalNumber(data.maxLength),
  };
};

const parseReferences = (value: unknown): JimengCanvasReferences => {
  const data = objectValue(value);
  return {
    min: numberValue(data.min),
    max: numberValue(data.max),
    types: arrayValue(data.types).map(entry => {
      const reference = objectValue(entry);
      return {
        mediaType: reference.mediaType === 'audio' ? 'audio' : mediaTypeValue(reference.mediaType),
        min: numberValue(reference.min),
        max: numberValue(reference.max),
      };
    }),
    requireAnyOfTypes: data.requireAnyOfTypes === undefined ? undefined : arrayValue(data.requireAnyOfTypes).map(stringValue),
  };
};

const parseSetupStatus = (value: unknown): JimengCanvasSetupStatus => {
  const data = objectValue(value);
  return {
    cliAvailable: booleanValue(data.cliAvailable),
    authenticated: booleanValue(data.authenticated),
    version: optionalString(data.version),
    message: optionalString(data.message),
  };
};

const parseSetupAction = (value: unknown): JimengCanvasSetupAction => {
  const data = objectValue(value);
  const expiresAt = typeof data.expiresAt === 'string' ? data.expiresAt : optionalNumber(data.expiresAt);
  return {
    status: optionalString(data.status),
    message: optionalString(data.message),
    authenticated: data.authenticated === undefined ? undefined : booleanValue(data.authenticated),
    loginSessionId: optionalString(data.loginSessionId),
    verificationUri: optionalString(data.verificationUri),
    userCode: optionalString(data.userCode),
    expiresAt,
  };
};

const parseCatalog = (value: unknown): JimengCanvasModel[] => {
  const envelope = objectValue(value);
  const data = envelope.items === undefined ? objectValue(envelope.data) : envelope;
  return arrayValue(data.items).map(entry => {
    const model = objectValue(entry);
    const modelId = stringValue(model.model);
    return {
      model: modelId,
      displayName: optionalString(model.displayName) || modelId,
      aliases: model.aliases === undefined ? [] : arrayValue(model.aliases).map(stringValue),
      type: mediaTypeValue(model.type),
      modes: arrayValue(model.modes).map(entryMode => {
        const mode: Record<string, unknown> = typeof entryMode === 'string' ? { name: entryMode } : objectValue(entryMode);
        return {
          name: stringValue(mode.name),
          scenario: optionalString(mode.scenario),
          flags: mode.flags === undefined ? [] : arrayValue(mode.flags).map(parseCatalogFlag),
          references: mode.references === undefined ? undefined : parseReferences(mode.references),
        };
      }),
    };
  });
};

const parseQuote = (value: unknown): JimengCanvasQuote => {
  const data = objectValue(value);
  if (typeof data.credits !== 'number' || !Number.isFinite(data.credits) || data.credits < 0) return invalidResponse();
  return { revision: stringValue(data.revision), credits: data.credits };
};

const parseJob = (value: unknown): JimengCanvasJob => {
  const data = objectValue(value);
  const details: JimengCanvasJobDetails = {
    id: stringValue(data.id),
    mediaType: mediaTypeValue(data.mediaType),
    message: optionalString(data.message),
    assets: data.assets === undefined ? [] : arrayValue(data.assets).map(entry => {
      const asset = objectValue(entry);
      return { id: stringValue(asset.id), contentType: stringValue(asset.contentType) };
    }),
  };
  if (data.phase === 'awaiting_approval') return { ...details, phase: data.phase, quote: parseQuote(data.quote) };
  switch (data.phase) {
    case 'preparing':
    case 'submitting':
    case 'running':
    case 'recovering':
    case 'completed':
    case 'failed':
    case 'cancelled':
      return { ...details, phase: data.phase, quote: data.quote === undefined ? undefined : parseQuote(data.quote) };
    default:
      return invalidResponse();
  }
};

const effectiveSignal = (signal?: AbortSignal): AbortSignal | undefined => {
  const workspaceSignal = getWorkspaceSignal();
  return signal && workspaceSignal ? AbortSignal.any([signal, workspaceSignal]) : signal ?? workspaceSignal;
};

const request = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const baseUrl = (getRuntimeConfig().jimengApiBaseUrl?.trim() || 'http://localhost:8000').replace(/\/+$/, '');
  const signal = effectiveSignal(init.signal ?? undefined);
  signal?.throwIfAborted();
  let response: Response;
  try {
    response = await workspaceFetch(`${baseUrl}/api/jimeng/canvas${path}`, {
      ...init,
      signal,
      headers: {
        'X-Canva-Banana-Local-Action': 'jimeng-setup',
        ...getPythonBackendAuthHeadersForUrl(baseUrl),
        ...init.headers,
      },
    });
  } catch (error) {
    signal?.throwIfAborted();
    throw new JimengCanvasRequestError(`Could not reach the Jimeng Canvas backend at ${baseUrl}. ${error instanceof Error ? error.message : String(error)}`, 'transport');
  }
  if (!response.ok) {
    let message = `Jimeng Canvas request failed (HTTP ${response.status}).`;
    try {
      const data = objectValue(await response.json());
      if (typeof data.detail === 'string') message = data.detail;
      else if (typeof data.message === 'string') message = data.message;
    } catch {
      message = `Jimeng Canvas request failed (HTTP ${response.status}).`;
    }
    throw new JimengCanvasRequestError(message, 'http', response.status);
  }
  return response;
};

const requestJson = async <T>(path: string, parse: (value: unknown) => T, init?: RequestInit): Promise<T> => {
  const signal = effectiveSignal(init?.signal ?? undefined);
  const response = await request(path, { ...init, signal });
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    signal?.throwIfAborted();
    return invalidResponse();
  }
  signal?.throwIfAborted();
  return parse(value);
};

export const getJimengCanvasSetupStatus = (options: JimengCanvasRequestOptions = {}): Promise<JimengCanvasSetupStatus> =>
  requestJson('/setup/status', parseSetupStatus, { signal: options.signal });

export const installJimengCanvasCli = (options: JimengCanvasRequestOptions = {}): Promise<JimengCanvasSetupAction> =>
  requestJson('/setup/install', parseSetupAction, { method: 'POST', signal: options.signal });

export const startJimengCanvasLogin = (options: JimengCanvasRequestOptions = {}): Promise<JimengCanvasSetupAction> =>
  requestJson('/setup/login', parseSetupAction, { method: 'POST', signal: options.signal });

export const checkJimengCanvasLogin = (options: JimengCanvasRequestOptions & { loginSessionId: string; poll?: number }): Promise<JimengCanvasSetupAction> =>
  requestJson(`/setup/login/check?${new URLSearchParams({ login_session_id: options.loginSessionId, poll: String(options.poll ?? 15) })}`, parseSetupAction, { method: 'POST', signal: options.signal });

export const getJimengCanvasCatalog = (options: JimengCanvasRequestOptions & { kind: JimengCanvasMediaType }): Promise<JimengCanvasModel[]> =>
  requestJson(`/catalog?kind=${options.kind}`, parseCatalog, { signal: options.signal });

export const prepareJimengCanvasJob = (options: JimengCanvasRequestOptions & { spec: JimengCanvasJobSpec; files?: readonly File[] }): Promise<JimengCanvasJob> => {
  const body = new FormData();
  body.set('spec', JSON.stringify(options.spec));
  for (const file of options.files ?? []) body.append('files', file);
  return requestJson('/jobs', parseJob, { method: 'POST', signal: options.signal, body });
};

export const getJimengCanvasJob = (options: JimengCanvasRequestOptions & { jobId: string }): Promise<JimengCanvasJob> =>
  requestJson(`/jobs/${encodeURIComponent(options.jobId)}`, parseJob, { signal: options.signal });

export const resumeJimengCanvasPreparation = (options: JimengCanvasRequestOptions & { jobId: string }): Promise<JimengCanvasJob> =>
  requestJson(`/jobs/${encodeURIComponent(options.jobId)}/resume-preparation`, parseJob, { method: 'POST', signal: options.signal });

export const approveJimengCanvasJob = (options: JimengCanvasRequestOptions & { jobId: string; revision: string }): Promise<JimengCanvasJob> =>
  requestJson(`/jobs/${encodeURIComponent(options.jobId)}/approve`, parseJob, {
    method: 'POST', signal: options.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: options.revision }),
  });

export const cancelJimengCanvasJob = (options: JimengCanvasRequestOptions & { jobId: string }): Promise<JimengCanvasJob> =>
  requestJson(`/jobs/${encodeURIComponent(options.jobId)}/cancel`, parseJob, { method: 'POST', signal: options.signal });

export const fetchJimengCanvasAsset = async (options: JimengCanvasRequestOptions & { jobId: string; assetId: string }): Promise<Blob> =>
  (await request(`/jobs/${encodeURIComponent(options.jobId)}/assets/${encodeURIComponent(options.assetId)}`, { signal: options.signal })).blob();

export interface WaitForJimengCanvasJobOptions extends JimengCanvasRequestOptions {
  jobId: string;
  initialJob?: JimengCanvasJob;
  pollIntervalMs?: number;
  onUpdate?: (job: JimengCanvasJob) => void;
  onApprovalRequired?: (job: JimengCanvasApprovalJob) => Promise<'approve' | 'cancel'>;
}

const awaitApproval = (decision: Promise<'approve' | 'cancel'>, signal?: AbortSignal): Promise<'approve' | 'cancel'> => {
  if (!signal) return decision;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    decision.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
};

export const waitForJimengCanvasJob = async (options: WaitForJimengCanvasJobOptions): Promise<JimengCanvasJob> => {
  const signal = effectiveSignal(options.signal);
  let job = options.initialJob ?? await getJimengCanvasJob({ jobId: options.jobId, signal });
  let recoveryDeadline: number | undefined;
  const recoveryError = () => new Error('Jimeng Canvas is still preparing or recovering. Retry to continue the same job.');
  while (true) {
    signal?.throwIfAborted();
    options.onUpdate?.(job);
    if (job.phase === 'completed' || job.phase === 'failed' || job.phase === 'cancelled') return job;
    if (job.phase === 'recovering' || job.phase === 'preparing') {
      recoveryDeadline ??= Date.now() + 60_000;
    } else {
      recoveryDeadline = undefined;
    }
    if (job.phase === 'awaiting_approval') {
      if (!options.onApprovalRequired) return job;
      const decision = await awaitApproval(options.onApprovalRequired(job), signal);
      signal?.throwIfAborted();
      job = decision === 'approve'
        ? await approveJimengCanvasJob({ jobId: job.id, revision: job.quote.revision, signal })
        : await cancelJimengCanvasJob({ jobId: job.id, signal });
      continue;
    }
    const interval = options.pollIntervalMs ?? 1000;
    if (recoveryDeadline === undefined) {
      await workspaceDelay(interval, signal);
      job = await getJimengCanvasJob({ jobId: job.id, signal });
      continue;
    }
    await workspaceDelay(Math.max(0, Math.min(interval, recoveryDeadline - Date.now())), signal);
    const remaining = recoveryDeadline - Date.now();
    if (remaining <= 0) throw recoveryError();
    const timeout = new AbortController();
    const timer = globalThis.setTimeout(() => timeout.abort(recoveryError()), remaining);
    try {
      const statusSignal = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
      job = await getJimengCanvasJob({ jobId: job.id, signal: statusSignal });
    } finally {
      globalThis.clearTimeout(timer);
    }
  }
};
