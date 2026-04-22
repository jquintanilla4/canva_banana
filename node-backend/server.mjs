import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const DEFAULT_PORT = 8787;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];
const TARGET_URL_HEADER = 'x-fal-target-url';
const MOONSHOT_CHAT_COMPLETIONS_URL = 'https://api.moonshot.ai/v1/chat/completions';
const MOONSHOT_INTENT_PATH = '/api/moonshot/intent';
const MOONSHOT_INTENT_MODEL = 'kimi-k2.6';
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const MAX_JSON_BODY_BYTES = 1024 * 1024;
const CORS_ALLOWED_METHODS = 'GET,POST,PUT,DELETE,OPTIONS';
const CORS_ALLOWED_HEADERS = 'Content-Type, Authorization, x-fal-target-url, x-fal-queue-priority, x-fal-runner-hint';

const currentFilePath = fileURLToPath(import.meta.url);
const nodeBackendDir = dirname(currentFilePath);
const repoRoot = resolve(nodeBackendDir, '..');

const parseAllowedOrigins = (env) => {
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
    if (lowerName === 'content-length' || lowerName === 'content-encoding' || lowerName === 'transfer-encoding') {
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

export const createSecureBackendServer = ({ env = process.env, fetchImpl = fetch } = {}) => http.createServer(async (request, response) => {
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
  try {
    if (requestUrl.pathname === '/health' && request.method === 'GET') {
      sendJson(response, 200, {
        status: 'ok',
        falConfigured: Boolean(env.FAL_API_KEY?.trim()),
        moonshotConfigured: Boolean(env.MOONSHOT_API_KEY?.trim()),
      }, corsHeaders);
      return;
    }
    if (requestUrl.pathname === MOONSHOT_INTENT_PATH && request.method === 'POST') {
      await handleMoonshotIntent(request, response, env, fetchImpl, corsHeaders);
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
  loadEnvFiles();
  const { port, host } = getSecureBackendListenOptions();
  const server = createSecureBackendServer();
  server.listen(port, host, () => {
    const displayHost = host === '127.0.0.1' ? 'localhost' : host;
    console.log(`Secure Node backend listening on http://${displayHost}:${port}`);
  });
}
