import { GoogleGenAI } from '@google/genai';
import { TokenHubImageError, normalizeTokenHubBaseURL, normalizeTokenHubProviderError, safeTokenHubProviderText } from './tokenhub-gateway.mjs';

export const TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL = 'gg-nano-banana-2-1-standard';

const VALID_RESOLUTIONS = new Set(['1K', '2K', '4K']);
const VALID_THINKING_LEVELS = new Set(['minimal', 'medium', 'high']);
const VALID_ASPECT_RATIOS = new Set(['21:9', '1:1', '4:3', '3:2', '2:3', '5:4', '4:5', '3:4', '16:9', '9:16', '4:1', '1:4', '8:1', '1:8']);
const IMAGE_DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;
const assertPayload = payload => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TokenHubImageError('Request body must be a JSON object.', { status: 400 });
  }
  if (payload.model !== TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL) {
    throw new TokenHubImageError('TokenHub Nano Banana model is not supported.', { status: 400 });
  }
  if (typeof payload.prompt !== 'string' || !payload.prompt.trim()) {
    throw new TokenHubImageError('prompt must be a non-empty string.', { status: 400 });
  }
  if (!VALID_RESOLUTIONS.has(payload.resolution)) {
    throw new TokenHubImageError('resolution must be 1K, 2K, or 4K.', { status: 400 });
  }
  if (!VALID_THINKING_LEVELS.has(payload.thinking_level)) {
    throw new TokenHubImageError('thinking_level is not supported.', { status: 400 });
  }
  if (typeof payload.enable_web_search !== 'boolean') {
    throw new TokenHubImageError('enable_web_search must be a boolean.', { status: 400 });
  }
  if (!Number.isInteger(payload.n) || payload.n < 1 || payload.n > 4) {
    throw new TokenHubImageError('n must be an integer between 1 and 4.', { status: 400 });
  }
  if (payload.aspect_ratio !== undefined && !VALID_ASPECT_RATIOS.has(payload.aspect_ratio)) {
    throw new TokenHubImageError('aspect_ratio is not supported.', { status: 400 });
  }
  if (payload.images !== undefined && (!Array.isArray(payload.images) || payload.images.length === 0)) {
    throw new TokenHubImageError('images must contain base64 image data URLs.', { status: 400 });
  }
};

const readInteractionBody = async (input, init) => {
  if (typeof init?.body === 'string') {
    return init.body;
  }
  if (init?.body instanceof Uint8Array) {
    return new TextDecoder().decode(init.body);
  }
  if (input instanceof Request) {
    return input.clone().text();
  }
  throw new TokenHubImageError('Google SDK interaction request did not contain JSON.', { status: 500 });
};

const parseUpstreamError = text => {
  try {
    const parsed = JSON.parse(text);
    return { message: parsed?.error?.message ?? parsed?.detail, code: parsed?.error?.code };
  } catch {
    return {};
  }
};

const toInteractionResponse = (result, model, requestID) => {
  if (!Array.isArray(result?.data) || result.data.length === 0 || result.data.some(item => typeof item?.b64_json !== 'string' || !item.b64_json)) {
    throw new TokenHubImageError('TokenHub returned no base64 image data.');
  }
  const createdDate = new Date(typeof result.created === 'number' ? result.created * 1000 : Date.now());
  const created = Number.isFinite(createdDate.valueOf()) ? createdDate.toISOString() : new Date().toISOString();
  return {
    id: requestID ?? crypto.randomUUID(),
    created,
    updated: created,
    model,
    status: 'completed',
    steps: result.data.map(item => ({
      type: 'model_output',
      content: [
        ...(typeof item.revised_prompt === 'string' && item.revised_prompt ? [{ type: 'text', text: item.revised_prompt }] : []),
        { type: 'image', data: item.b64_json, mime_type: 'image/png' },
      ],
    })),
  };
};

const createTokenHubFetch = ({ apiKey, baseURL, fetchImpl }) => async (input, init) => {
  const rawBody = await readInteractionBody(input, init);
  let interaction;
  try {
    interaction = JSON.parse(rawBody);
  } catch {
    throw new TokenHubImageError('Google SDK interaction request was not valid JSON.', { status: 500 });
  }
  const inputBlocks = Array.isArray(interaction.input) ? interaction.input : [];
  const images = inputBlocks
    .filter(block => block?.type === 'image' && typeof block.data === 'string')
    .map(block => `data:${block.mime_type || 'image/png'};base64,${block.data}`);
  const prompt = typeof interaction.input === 'string'
    ? interaction.input
    : inputBlocks.filter(block => block?.type === 'text' && typeof block.text === 'string').map(block => block.text).join('\n');
  const responseFormat = Array.isArray(interaction.response_format) ? interaction.response_format[0] : interaction.response_format;
  const tokenHubPayload = {
    model: interaction.model,
    prompt,
    ...(responseFormat?.aspect_ratio ? { aspect_ratio: responseFormat.aspect_ratio } : {}),
    resolution: responseFormat?.image_size,
    enable_web_search: Boolean(interaction.tools?.some(tool => tool?.type === 'google_search')),
    thinking_level: interaction.generation_config?.thinking_level,
    n: interaction.n,
    output_format: 'png',
    ...(images.length > 0 ? { images } : {}),
  };
  const path = images.length > 0 ? '/images/edits' : '/images/generations';
  const response = await fetchImpl(`${baseURL}${path}`, {
    method: 'POST',
    headers: new Headers({
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: JSON.stringify(tokenHubPayload),
    signal: init?.signal ?? (input instanceof Request ? input.signal : undefined),
    redirect: 'error',
  });
  const requestID = safeTokenHubProviderText(response.headers.get('x-request-id'), apiKey);
  if (!response.ok) {
    const rawBody = await response.text();
    throw normalizeTokenHubProviderError({
      apiKey, status: response.status, requestID, rawBody, ...parseUpstreamError(rawBody),
    });
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new TokenHubImageError('TokenHub did not return valid image JSON.', { requestID });
  }
  return new Response(JSON.stringify(toInteractionResponse(
    result, interaction.model, safeTokenHubProviderText(result?.request_id, apiKey) ?? requestID,
  )), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const createTokenHubNanoBananaClient = ({
  apiKey,
  baseURL,
  fetchImpl = fetch,
  clientFactory = options => new GoogleGenAI(options),
}) => {
  const normalizedBaseURL = normalizeTokenHubBaseURL(baseURL);
  return clientFactory({
    apiKey,
    enterprise: false,
    httpOptions: {
      baseUrl: normalizedBaseURL,
      fetch: createTokenHubFetch({ apiKey, baseURL: normalizedBaseURL, fetchImpl }),
    },
  });
};

export const runTokenHubNanoBananaInteraction = async (client, payload, { signal } = {}) => {
  signal?.throwIfAborted();
  assertPayload(payload);
  const input = [
    { type: 'text', text: payload.prompt.trim() },
    ...(payload.images ?? []).map(image => {
      const match = typeof image === 'string' ? IMAGE_DATA_URL.exec(image) : null;
      if (!match || match[2].length % 4 !== 0) {
        throw new TokenHubImageError('images must contain valid PNG, JPEG, or WebP base64 data URLs.', { status: 400 });
      }
      return { type: 'image', mime_type: match[1], data: match[2] };
    }),
  ];
  let interaction;
  try {
    interaction = await client.interactions.create({
      model: payload.model,
      input,
      response_format: {
        type: 'image',
        mime_type: 'image/png',
        ...(payload.aspect_ratio ? { aspect_ratio: payload.aspect_ratio } : {}),
        image_size: payload.resolution,
      },
      generation_config: { thinking_level: payload.thinking_level },
      ...(payload.enable_web_search ? { tools: [{ type: 'google_search' }] } : {}),
    }, { body: { n: payload.n }, fetch_options: { signal }, maxRetries: 0 });
  } catch (error) {
    signal?.throwIfAborted();
    let current = error;
    while (current) {
      if (current instanceof TokenHubImageError) {
        throw current;
      }
      current = current.cause;
    }
    throw new TokenHubImageError('TokenHub image request could not reach the provider.');
  }
  const data = interaction.steps?.flatMap(step => {
    if (step.type !== 'model_output') return [];
    const revisedPrompt = step.content?.find(item => item.type === 'text')?.text;
    return (step.content ?? []).filter(item => item.type === 'image' && typeof item.data === 'string').map(item => ({
      b64_json: item.data,
      ...(revisedPrompt ? { revised_prompt: revisedPrompt } : {}),
    }));
  }) ?? [];
  if (data.length === 0) {
    throw new TokenHubImageError('TokenHub returned no base64 image data.');
  }
  return {
    created: typeof interaction.created === 'string' ? Math.floor(Date.parse(interaction.created) / 1000) : undefined,
    data,
    request_id: interaction.id,
  };
};
