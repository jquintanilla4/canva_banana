import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const DEFAULT_PORT = 8787;
const DEFAULT_HOST = '127.0.0.1';
export const SECURE_BACKEND_SERVICE_NAME = 'canva-banana-secure-backend';
export const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000', 'file://', 'null']; // Include local desktop renderer origins.
const TARGET_URL_HEADER = 'x-fal-target-url';
const DESKTOP_AUTH_TOKEN_HEADER = 'x-canva-banana-desktop-token';
const DEV_SERVICE_HEALTH_PROBE_HEADER = 'x-canva-banana-dev-service-probe'; // Dev launcher asks for reuse identity.
const DEV_SERVICE_HEALTH_PROBE_VALUE = 'canva-banana-dev-service-health'; // Keep probe header out of browser CORS allowlist.
const DEV_SERVICE_HEALTH_TOKEN_HEADER = 'x-canva-banana-dev-service-token'; // Secret token unlocks detailed dev health.
const DEV_SERVICE_HEALTH_TOKEN_ENV = 'CANVA_BANANA_DEV_SERVICE_HEALTH_TOKEN'; // Env key used only for local dev probing.
export const DEV_SERVICE_HEALTH_PROTOCOL_VERSION = 2; // Bump when probe payload shape changes.
const MOONSHOT_CHAT_COMPLETIONS_URL = 'https://api.moonshot.ai/v1/chat/completions';
const MOONSHOT_INTENT_PATH = '/api/moonshot/intent';
const MOONSHOT_INTENT_MODEL = 'kimi-k2.6';
const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_CHAT_PATH = '/api/openrouter/chat';
const OPENROUTER_CHAT_MODELS = new Set([
  'google/gemini-3.5-flash',
  'anthropic/claude-sonnet-4.6',
  'openai/gpt-5.5',
]);
const OPENROUTER_MAX_CHAT_MESSAGES = 40;
const OPENROUTER_MAX_MESSAGE_CHARS = 12000;
const OPENROUTER_SYSTEM_PROMPT = [
  'You help users improve prompts for image and video generation workflows.',
  'Ask concise clarifying questions when required, otherwise produce sharper prompt options.',
  'Preserve the user intent, include concrete visual details when useful, and avoid claiming to run tools.',
].join(' ');
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const MAX_JSON_BODY_BYTES = 1024 * 1024;
const CORS_ALLOWED_METHODS = 'GET,POST,PUT,DELETE,OPTIONS';
const CORS_ALLOWED_HEADERS = `Content-Type, Authorization, x-fal-target-url, x-fal-queue-priority, x-fal-runner-hint, ${DESKTOP_AUTH_TOKEN_HEADER}`;
export const SECURE_BACKEND_CAPABILITIES = {
  falProxy: true,
  falAssetFetch: true,
  moonshotIntent: true,
  openrouterChat: true,
};
export const SECURE_BACKEND_REQUIRED_CAPABILITIES = Object.keys(SECURE_BACKEND_CAPABILITIES); // Routes the desktop app needs from a reused backend.
export const SECURE_BACKEND_REQUIRED_READINESS_KEYS = [
  'falProxy',
  'falAssetFetch',
  'moonshotIntent',
  'openrouterChat',
]; // Key-backed routes must match current launch config.
const SECURE_BACKEND_SECRET_CONFIG_ENV_KEYS = [
  'FAL_API_KEY',
  'MOONSHOT_API_KEY',
  'OPENROUTER_API_KEY',
]; // Secret values cannot be safely compared from shell env.
export const SECURE_BACKEND_REUSE_CONFIG_ENV_KEYS = [
  ...SECURE_BACKEND_SECRET_CONFIG_ENV_KEYS,
  'SECURE_BACKEND_ALLOWED_ORIGINS',
  'CANVA_BANANA_DESKTOP_AUTH_TOKEN',
]; // Every env key that changes renderer/backend compatibility.

const currentFilePath = fileURLToPath(import.meta.url);
const nodeBackendDir = dirname(currentFilePath);
const findRepoRoot = (startDir) => {
  let currentDir = startDir;
  while (dirname(currentDir) !== currentDir) {
    if (existsSync(join(currentDir, 'package.json')) && existsSync(join(currentDir, 'apps'))) {
      return currentDir; // Monorepo root owns env files and workspace scripts.
    }
    currentDir = dirname(currentDir);
  }
  return resolve(startDir, '../../..'); // Fallback matches apps/secure-backend/src.
};
export const canonicalWorkspaceRoot = (pathValue) => {
  const resolvedPath = resolve(pathValue); // Normalize trailing slashes and dot segments.
  try {
    return realpathSync.native(resolvedPath); // Match symlinked checkouts by their real path.
  } catch {
    return resolvedPath;
  }
};
const repoRoot = canonicalWorkspaceRoot(findRepoRoot(nodeBackendDir));

export const parseAllowedOrigins = (env) => {
  const rawOrigins = env.SECURE_BACKEND_ALLOWED_ORIGINS?.trim();
  if (!rawOrigins) {
    return DEFAULT_ALLOWED_ORIGINS;
  }
  return rawOrigins.split(',').map(origin => origin.trim()).filter(Boolean);
};

const getRequestOrigin = (request) => {
  const origin = request.headers.origin;
  return Array.isArray(origin) ? origin[0] : origin;
};

const isDesktopOrigin = (origin) => origin === 'file://' || origin === 'null';

const resolveCors = (request, env) => {
  const origin = getRequestOrigin(request);
  const originAllowed = !origin || parseAllowedOrigins(env).includes(origin);
  const headers = {
    'Access-Control-Allow-Methods': CORS_ALLOWED_METHODS,
    'Access-Control-Allow-Headers': CORS_ALLOWED_HEADERS,
  };
  if (origin && originAllowed) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  return { headers, originAllowed };
};

const getHeaderValue = (request, headerName) => {
  const value = request.headers[headerName];
  return Array.isArray(value) ? value[0] : value;
};

const hasValidDesktopAuthToken = (request, env) => {
  const expectedToken = env.CANVA_BANANA_DESKTOP_AUTH_TOKEN?.trim();
  if (!expectedToken) {
    return false; // Desktop origins must opt in with a per-launch token.
  }
  const headerToken = getHeaderValue(request, DESKTOP_AUTH_TOKEN_HEADER)?.trim();
  return headerToken === expectedToken; // Keep the desktop nonce out of request URLs.
};

const hasConfiguredDesktopAuthToken = (env) => Boolean(env.CANVA_BANANA_DESKTOP_AUTH_TOKEN?.trim());

const hasValidStaticToken = (actualToken, expectedToken) => {
  const actualBuffer = Buffer.from(actualToken);
  const expectedBuffer = Buffer.from(expectedToken);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer); // Avoid leaking token prefix matches.
};

const hasValidDevServiceHealthToken = (request, env) => {
  const expectedToken = env[DEV_SERVICE_HEALTH_TOKEN_ENV]?.trim();
  const headerToken = getHeaderValue(request, DEV_SERVICE_HEALTH_TOKEN_HEADER)?.trim();
  return Boolean(expectedToken && headerToken && hasValidStaticToken(headerToken, expectedToken)); // Static probe marker is not auth.
};

const shouldRequireDesktopAuth = (request, env) => hasConfiguredDesktopAuthToken(env) || isDesktopOrigin(getRequestOrigin(request)); // Tokened desktop backends gate every key route.

const isKeyBearingPath = (requestUrl) => (
  requestUrl.pathname === MOONSHOT_INTENT_PATH ||
  requestUrl.pathname === OPENROUTER_CHAT_PATH ||
  requestUrl.pathname === '/api/fal/proxy' ||
  requestUrl.pathname === '/api/fal/fetch-asset'
);

export const getSecureBackendListenOptions = (env = process.env) => {
  const port = Number(env.NODE_BACKEND_PORT || DEFAULT_PORT);
  const host = env.NODE_BACKEND_HOST?.trim() || DEFAULT_HOST;
  return { port, host };
};

const parseDotenvLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }
  const equalsIndex = trimmed.indexOf('=');
  if (equalsIndex === -1) {
    return null;
  }
  const key = trimmed.slice(0, equalsIndex).trim();
  let value = trimmed.slice(equalsIndex + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return key ? [key, value] : null;
};

export const loadEnvFiles = (rootDir = repoRoot) => {
  for (const fileName of ['.env.local', '.env']) {
    const envPath = join(rootDir, fileName);
    if (!existsSync(envPath)) {
      continue;
    }
    const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const parsed = parseDotenvLine(line);
      if (parsed && process.env[parsed[0]] === undefined) {
        process.env[parsed[0]] = parsed[1];
      }
    }
  }
};

const readDotenvValues = (rootDir) => {
  const values = {};
  for (const fileName of ['.env.local', '.env']) {
    const envPath = join(rootDir, fileName);
    if (!existsSync(envPath)) {
      continue;
    }
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const parsed = parseDotenvLine(line);
      if (parsed && values[parsed[0]] === undefined) {
        values[parsed[0]] = parsed[1]; // First dotenv file wins like loadEnvFiles.
      }
    }
  }
  return values;
};

const getEnvFileMetadata = (rootDir) => ['.env.local', '.env'].map(fileName => {
  const envPath = join(rootDir, fileName);
  if (!existsSync(envPath)) {
    return { fileName, exists: false };
  }
  const stats = statSync(envPath, { bigint: true });
  return {
    fileName,
    exists: true,
    size: Number(stats.size),
    mtimeNs: stats.mtimeNs.toString(),
    ctimeNs: stats.ctimeNs.toString(),
  };
});

const buildEffectiveSecureBackendEnv = (rootDir, env) => {
  const dotenvValues = readDotenvValues(rootDir);
  const effectiveEnv = {};
  for (const key of SECURE_BACKEND_REUSE_CONFIG_ENV_KEYS) {
    effectiveEnv[key] = env[key] === undefined ? dotenvValues[key] : env[key]; // Shell env overrides dotenv files.
  }
  return effectiveEnv;
};

export const buildSecureBackendReadiness = (env) => ({
  falProxy: Boolean(env.FAL_API_KEY?.trim()),
  falAssetFetch: Boolean(env.FAL_API_KEY?.trim()),
  moonshotIntent: Boolean(env.MOONSHOT_API_KEY?.trim()),
  openrouterChat: Boolean(env.OPENROUTER_API_KEY?.trim()),
});

const buildSecureBackendReuseConfig = (env) => {
  const config = {
    FAL_API_KEY: { present: Boolean(env.FAL_API_KEY?.trim()) },
    MOONSHOT_API_KEY: { present: Boolean(env.MOONSHOT_API_KEY?.trim()) },
    OPENROUTER_API_KEY: { present: Boolean(env.OPENROUTER_API_KEY?.trim()) },
    SECURE_BACKEND_ALLOWED_ORIGINS: parseAllowedOrigins(env),
    CANVA_BANANA_DESKTOP_AUTH_TOKEN: { present: Boolean(env.CANVA_BANANA_DESKTOP_AUTH_TOKEN?.trim()) },
  }; // Registry-backed compatibility values; secrets expose only presence.
  const missingKeys = SECURE_BACKEND_REUSE_CONFIG_ENV_KEYS.filter(key => !Object.prototype.hasOwnProperty.call(config, key));
  if (missingKeys.length > 0) {
    throw new Error(`Secure backend reuse config is missing keys: ${missingKeys.join(', ')}`);
  }
  return config;
};

export const buildSecureBackendReuseContract = (rootDir, env = process.env) => {
  const effectiveEnv = buildEffectiveSecureBackendEnv(rootDir, env);
  return {
    version: 1,
    workspaceRoot: canonicalWorkspaceRoot(rootDir),
    capabilities: SECURE_BACKEND_CAPABILITIES,
    readiness: buildSecureBackendReadiness(effectiveEnv),
    config: buildSecureBackendReuseConfig(effectiveEnv),
    envFiles: getEnvFileMetadata(rootDir),
  };
};

export const buildSecureBackendConfigState = (rootDir, env = process.env, shellEnv = env) => {
  const effectiveEnv = buildEffectiveSecureBackendEnv(rootDir, env);
  const shellProvidedKeys = SECURE_BACKEND_REUSE_CONFIG_ENV_KEYS.filter(key => shellEnv[key] !== undefined);
  const shellProvidedUnverifiableKeys = SECURE_BACKEND_SECRET_CONFIG_ENV_KEYS.filter(key => shellEnv[key] !== undefined);
  return {
    verifiable: shellProvidedUnverifiableKeys.length === 0,
    shellProvidedKeys,
    shellProvidedUnverifiableKeys,
    envFiles: getEnvFileMetadata(rootDir),
    readiness: buildSecureBackendReadiness(effectiveEnv),
    allowedOrigins: parseAllowedOrigins(effectiveEnv),
    auth: { desktopTokenRequired: Boolean(effectiveEnv.CANVA_BANANA_DESKTOP_AUTH_TOKEN?.trim()) },
    reuseContract: buildSecureBackendReuseContract(rootDir, env),
  };
};

const sendJson = (response, statusCode, payload, corsHeaders) => {
  response.writeHead(statusCode, {
    ...corsHeaders,
    'Content-Type': JSON_CONTENT_TYPE,
  });
  response.end(JSON.stringify(payload));
};

const sendEmpty = (response, statusCode = 204, corsHeaders = {}) => {
  response.writeHead(statusCode, corsHeaders);
  response.end();
};

const readRequestBody = async (request, maxBytes = MAX_JSON_BODY_BYTES) => {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      throw new Error('Request body is too large');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

const readJsonBody = async (request) => {
  const body = await readRequestBody(request);
  if (body.length === 0) {
    return {};
  }
  return JSON.parse(body.toString('utf8'));
};

const isAllowedFalTarget = (url) => (
  url.protocol === 'https:' &&
  (
    url.hostname === 'fal.run' ||
    url.hostname.endsWith('.fal.run') ||
    url.hostname === 'fal.ai' ||
    url.hostname.endsWith('.fal.ai') ||
    url.hostname === 'fal.media' ||
    url.hostname.endsWith('.fal.media') ||
    url.hostname === 'rest.alpha.fal.ai'
  )
);

const copyRequestHeaders = (requestHeaders) => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(requestHeaders)) {
    const lowerName = name.toLowerCase();
    if (
      lowerName === 'host' ||
      lowerName === 'connection' ||
      lowerName === 'content-length' ||
      lowerName === 'authorization' ||
      lowerName === DESKTOP_AUTH_TOKEN_HEADER ||
      lowerName === TARGET_URL_HEADER
    ) {
      continue;
    }
    if (Array.isArray(value)) {
      headers.set(name, value.join(', '));
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  return headers;
};

const responseHeadersFromFetch = (upstreamResponse, corsHeaders) => {
  const headers = { ...corsHeaders };
  for (const [name, value] of upstreamResponse.headers.entries()) {
    const lowerName = name.toLowerCase();
    if (
      lowerName === 'content-length' ||
      lowerName === 'content-encoding' ||
      lowerName === 'transfer-encoding' ||
      lowerName === 'connection' ||
      lowerName === 'keep-alive' ||
      lowerName === 'proxy-authenticate' ||
      lowerName === 'proxy-authorization' ||
      lowerName === 'te' ||
      lowerName === 'trailer' ||
      lowerName === 'upgrade' ||
      lowerName.startsWith('access-control-')
    ) {
      continue;
    }
    headers[name] = value;
  }
  return headers;
};

const pipeFetchResponse = async (response, upstreamResponse, corsHeaders) => {
  response.writeHead(upstreamResponse.status, upstreamResponse.statusText, responseHeadersFromFetch(upstreamResponse, corsHeaders));
  if (!upstreamResponse.body) {
    response.end();
    return;
  }
  Readable.fromWeb(upstreamResponse.body).pipe(response);
};

const extractJsonObject = (text) => {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Fall through to extracting a JSON object from surrounding text.
  }
  const startIndex = trimmed.indexOf('{');
  const endIndex = trimmed.lastIndexOf('}');
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error('Moonshot did not return a JSON object');
  }
  const parsed = JSON.parse(trimmed.slice(startIndex, endIndex + 1));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Moonshot did not return a JSON object');
  }
  return parsed;
};

const normalizeOptionalSeconds = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string' && ['', 'null', 'none', 'unknown'].includes(value.trim().toLowerCase())) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed * 1000) / 1000;
};

const normalizeClipIntent = (rawIntent) => {
  const startTime = normalizeOptionalSeconds(rawIntent.start_time);
  let endTime = normalizeOptionalSeconds(rawIntent.end_time);
  if (startTime !== null && endTime !== null && endTime <= startTime) {
    endTime = null;
  }
  return {
    start_time: startTime,
    end_time: endTime,
  };
};

const buildMoonshotIntentPayload = (prompt, videoDurationSeconds) => {
  const durationContext = Number.isFinite(videoDurationSeconds) && videoDurationSeconds > 0
    ? `${Math.round(videoDurationSeconds * 1000) / 1000} seconds`
    : 'unknown';
  return {
    model: MOONSHOT_INTENT_MODEL,
    messages: [
      {
        role: 'system',
        content: [
          'Extract partial lipsync timing intent for a video editing tool.',
          'Return only a JSON object with keys start_time and end_time.',
          'Values must be numbers in seconds or null. Do not include markdown.',
          'Use 0 for phrases like from the beginning.',
          'If the user says until the end and the video duration is known, use that duration.',
          'If timing intent is absent or ambiguous, return null for that field. Do not invent timestamps.',
        ].join(' '),
      },
      {
        role: 'user',
        content: `Video duration: ${durationContext}\nPrompt: ${prompt}`,
      },
    ],
    temperature: 0,
  };
};

const handleMoonshotIntent = async (request, response, env, fetchImpl, corsHeaders) => {
  if (!env.MOONSHOT_API_KEY?.trim()) {
    sendJson(response, 503, { detail: 'MOONSHOT_API_KEY must be set to parse HeyGen start/end intent.' }, corsHeaders);
    return;
  }
  let payload;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    sendJson(response, 400, { detail: error instanceof SyntaxError ? 'Request body must be valid JSON.' : error.message }, corsHeaders);
    return;
  }
  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';
  if (!prompt) {
    sendJson(response, 200, { start_time: null, end_time: null }, corsHeaders);
    return;
  }
  const videoDurationSeconds = Number(payload.video_duration_seconds);
  const moonshotPayload = buildMoonshotIntentPayload(prompt, videoDurationSeconds);
  let upstreamResponse;
  try {
    upstreamResponse = await fetchImpl(MOONSHOT_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.MOONSHOT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(moonshotPayload),
    });
  } catch (error) {
    sendJson(response, 502, { detail: `Moonshot request failed: ${error instanceof Error ? error.message : String(error)}` }, corsHeaders);
    return;
  }
  const responseText = await upstreamResponse.text();
  if (!upstreamResponse.ok) {
    let detail = `Moonshot request failed with HTTP ${upstreamResponse.status}.`;
    try {
      const errorPayload = JSON.parse(responseText);
      if (typeof errorPayload?.error?.message === 'string' && errorPayload.error.message) {
        detail = errorPayload.error.message;
      }
    } catch {
      // Keep the generic upstream error.
    }
    sendJson(response, 502, { detail }, corsHeaders);
    return;
  }
  try {
    const responsePayload = JSON.parse(responseText);
    const content = responsePayload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('Moonshot returned an empty message');
    }
    sendJson(response, 200, normalizeClipIntent(extractJsonObject(content)), corsHeaders);
  } catch (error) {
    sendJson(response, 502, { detail: `Moonshot returned invalid timing intent: ${error instanceof Error ? error.message : String(error)}` }, corsHeaders);
  }
};

const normalizeOpenRouterMessage = (rawMessage, index) => {
  if (!rawMessage || typeof rawMessage !== 'object' || Array.isArray(rawMessage)) {
    throw new Error(`messages[${index}] must be an object`);
  }
  const role = rawMessage.role;
  if (role !== 'user' && role !== 'assistant') {
    throw new Error(`messages[${index}].role must be user or assistant`);
  }
  const content = typeof rawMessage.content === 'string' ? rawMessage.content.trim() : '';
  if (!content) {
    throw new Error(`messages[${index}].content must be a non-empty string`);
  }
  if (content.length > OPENROUTER_MAX_MESSAGE_CHARS) {
    throw new Error(`messages[${index}].content must be ${OPENROUTER_MAX_MESSAGE_CHARS} characters or fewer`);
  }
  return { role, content };
};

const normalizeOpenRouterMessages = (rawMessages) => {
  if (!Array.isArray(rawMessages)) {
    throw new Error('messages must be an array');
  }
  if (rawMessages.length === 0) {
    throw new Error('messages must include at least one message');
  }
  if (rawMessages.length > OPENROUTER_MAX_CHAT_MESSAGES) {
    throw new Error(`messages must include ${OPENROUTER_MAX_CHAT_MESSAGES} messages or fewer`);
  }
  return rawMessages.map(normalizeOpenRouterMessage);
};

const getOpenRouterErrorDetail = (responseText, fallback) => {
  try {
    const payload = JSON.parse(responseText);
    const detail = payload?.error?.message ?? payload?.detail;
    return typeof detail === 'string' && detail.trim() ? detail : fallback;
  } catch {
    return fallback;
  }
};

const handleOpenRouterChat = async (request, response, env, fetchImpl, corsHeaders) => {
  if (!env.OPENROUTER_API_KEY?.trim()) {
    sendJson(response, 503, { detail: 'OPENROUTER_API_KEY must be set on the Node backend.' }, corsHeaders);
    return;
  }
  let payload;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    sendJson(response, 400, { detail: error instanceof SyntaxError ? 'Request body must be valid JSON.' : error.message }, corsHeaders);
    return;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    sendJson(response, 400, { detail: 'Request body must be a JSON object.' }, corsHeaders);
    return;
  }
  const model = typeof payload.model === 'string' ? payload.model.trim() : '';
  if (!OPENROUTER_CHAT_MODELS.has(model)) {
    sendJson(response, 400, { detail: 'OpenRouter model is not supported by this chatbox.' }, corsHeaders);
    return;
  }
  let messages;
  try {
    messages = normalizeOpenRouterMessages(payload.messages);
  } catch (error) {
    sendJson(response, 400, { detail: error instanceof Error ? error.message : String(error) }, corsHeaders);
    return;
  }
  let upstreamResponse;
  try {
    upstreamResponse = await fetchImpl(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Title': 'Canva Banana',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: OPENROUTER_SYSTEM_PROMPT },
          ...messages,
        ],
        temperature: 0.4,
        max_tokens: 1600,
        stream: false,
      }),
    });
  } catch (error) {
    sendJson(response, 502, { detail: `OpenRouter request failed: ${error instanceof Error ? error.message : String(error)}` }, corsHeaders);
    return;
  }
  const responseText = await upstreamResponse.text();
  if (!upstreamResponse.ok) {
    const detail = getOpenRouterErrorDetail(responseText, `OpenRouter request failed with HTTP ${upstreamResponse.status}.`);
    sendJson(response, 502, { detail }, corsHeaders);
    return;
  }
  try {
    const responsePayload = JSON.parse(responseText);
    const content = responsePayload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('OpenRouter returned an empty message');
    }
    sendJson(response, 200, {
      message: { role: 'assistant', content },
      model: typeof responsePayload.model === 'string' ? responsePayload.model : model,
      usage: responsePayload.usage ?? null,
    }, corsHeaders);
  } catch (error) {
    sendJson(response, 502, { detail: `OpenRouter returned invalid chat output: ${error instanceof Error ? error.message : String(error)}` }, corsHeaders);
  }
};

const handleFalProxy = async (request, response, env, fetchImpl, corsHeaders) => {
  if (!env.FAL_API_KEY?.trim()) {
    sendJson(response, 503, { detail: 'FAL_API_KEY must be set on the Node backend.' }, corsHeaders);
    return;
  }
  const targetHeader = request.headers[TARGET_URL_HEADER];
  const targetUrlValue = Array.isArray(targetHeader) ? targetHeader[0] : targetHeader;
  if (!targetUrlValue) {
    sendJson(response, 400, { detail: `Missing ${TARGET_URL_HEADER} header.` }, corsHeaders);
    return;
  }
  let targetUrl;
  try {
    targetUrl = new URL(targetUrlValue);
  } catch {
    sendJson(response, 400, { detail: 'Fal target URL is invalid.' }, corsHeaders);
    return;
  }
  if (!isAllowedFalTarget(targetUrl)) {
    sendJson(response, 400, { detail: 'Fal target URL is not allowed.' }, corsHeaders);
    return;
  }
  let body;
  try {
    body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await readRequestBody(request, 25 * MAX_JSON_BODY_BYTES);
  } catch (error) {
    sendJson(response, 413, { detail: error.message }, corsHeaders);
    return;
  }
  const headers = copyRequestHeaders(request.headers);
  headers.set('Authorization', `Key ${env.FAL_API_KEY}`);
  let upstreamResponse;
  try {
    upstreamResponse = await fetchImpl(targetUrl.toString(), {
      method: request.method,
      headers,
      body,
    });
  } catch (error) {
    sendJson(response, 502, { detail: `Fal proxy request failed: ${error instanceof Error ? error.message : String(error)}` }, corsHeaders);
    return;
  }
  await pipeFetchResponse(response, upstreamResponse, corsHeaders);
};

const handleFalAssetFetch = async (requestUrl, response, env, fetchImpl, corsHeaders) => {
  if (!env.FAL_API_KEY?.trim()) {
    sendJson(response, 503, { detail: 'FAL_API_KEY must be set on the Node backend.' }, corsHeaders);
    return;
  }
  const assetUrlValue = requestUrl.searchParams.get('url') ?? '';
  let assetUrl;
  try {
    assetUrl = new URL(assetUrlValue);
  } catch {
    sendJson(response, 400, { detail: 'Fal asset URL is invalid.' }, corsHeaders);
    return;
  }
  if (!isAllowedFalTarget(assetUrl)) {
    sendJson(response, 400, { detail: 'Fal asset URL is not allowed.' }, corsHeaders);
    return;
  }
  let upstreamResponse;
  try {
    upstreamResponse = await fetchImpl(assetUrl.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Key ${env.FAL_API_KEY}`,
        Accept: '*/*',
      },
    });
  } catch (error) {
    sendJson(response, 502, { detail: `Fal asset fetch failed: ${error instanceof Error ? error.message : String(error)}` }, corsHeaders);
    return;
  }
  await pipeFetchResponse(response, upstreamResponse, corsHeaders);
};

export const createSecureBackendServer = ({ env = process.env, fetchImpl = fetch, devConfigState = buildSecureBackendConfigState(repoRoot, env) } = {}) => http.createServer(async (request, response) => {
  const { headers: corsHeaders, originAllowed } = resolveCors(request, env);
  if (!originAllowed) {
    sendJson(response, 403, { detail: 'Origin is not allowed for the secure backend.' }, corsHeaders);
    return;
  }
  if (request.method === 'OPTIONS') {
    sendEmpty(response, 204, corsHeaders);
    return;
  }
  const requestUrl = new URL(request.url ?? '/', 'http://localhost');
  if (isKeyBearingPath(requestUrl) && shouldRequireDesktopAuth(request, env) && !hasValidDesktopAuthToken(request, env)) {
    sendJson(response, 403, { detail: 'Desktop authorization is required for this secure backend route.' }, corsHeaders);
    return;
  }
  try {
    if (requestUrl.pathname === '/health' && request.method === 'GET') {
      const isDevServiceProbe = getHeaderValue(request, DEV_SERVICE_HEALTH_PROBE_HEADER) === DEV_SERVICE_HEALTH_PROBE_VALUE && hasValidDevServiceHealthToken(request, env);
      sendJson(response, 200, isDevServiceProbe ? {
        protocolVersion: DEV_SERVICE_HEALTH_PROTOCOL_VERSION,
        status: 'ok',
        service: SECURE_BACKEND_SERVICE_NAME,
        workspaceRoot: repoRoot,
        capabilities: SECURE_BACKEND_CAPABILITIES,
        readiness: devConfigState.readiness,
        auth: { desktopTokenRequired: hasConfiguredDesktopAuthToken(env) },
        configState: devConfigState,
        reuseContract: devConfigState.reuseContract,
      } : { status: 'ok' }, corsHeaders);
      return;
    }
    if (requestUrl.pathname === MOONSHOT_INTENT_PATH && request.method === 'POST') {
      await handleMoonshotIntent(request, response, env, fetchImpl, corsHeaders);
      return;
    }
    if (requestUrl.pathname === OPENROUTER_CHAT_PATH && request.method === 'POST') {
      await handleOpenRouterChat(request, response, env, fetchImpl, corsHeaders);
      return;
    }
    if (requestUrl.pathname === '/api/fal/proxy') {
      await handleFalProxy(request, response, env, fetchImpl, corsHeaders);
      return;
    }
    if (requestUrl.pathname === '/api/fal/fetch-asset' && request.method === 'GET') {
      await handleFalAssetFetch(requestUrl, response, env, fetchImpl, corsHeaders);
      return;
    }
    sendJson(response, 404, { detail: 'Not found.' }, corsHeaders);
  } catch (error) {
    sendJson(response, 500, { detail: error instanceof Error ? error.message : String(error) }, corsHeaders);
  }
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const shellEnv = { ...process.env };
  loadEnvFiles();
  const { port, host } = getSecureBackendListenOptions();
  const devConfigState = buildSecureBackendConfigState(repoRoot, process.env, shellEnv);
  const server = createSecureBackendServer({ devConfigState });
  server.listen(port, host, () => {
    const displayHost = host === '127.0.0.1' ? 'localhost' : host;
    console.log(`Secure Node backend listening on http://${displayHost}:${port}`);
  });
}
