import { finished } from 'node:stream/promises';
import OpenAI, { toFile } from 'openai';
import { RequestBodyTooLargeError, readJsonBody } from './http-request-body.mjs';
import { TokenHubImageError, normalizeTokenHubBaseURL, normalizeTokenHubProviderError, safeTokenHubProviderText } from './tokenhub-gateway.mjs';
import {
  TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL,
  assertTokenHubNanoBananaAspectRatio,
  assertTokenHubNanoBananaResolution,
  assertTokenHubNanoBananaThinkingLevel,
} from './tokenhub-nano-banana.mjs';

export const TOKENHUB_IMAGE_GENERATIONS_PATH = '/api/tokenhub/images/generations';
export const TOKENHUB_IMAGE_EDITS_PATH = '/api/tokenhub/images/edits';

const TOKENHUB_IMAGE_MODELS = new Set([
  'og-image-2-5-flare-standard',
  'og-image-2-5-sunburst-standard',
  TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL,
]);

const DATA_URL_PATTERN = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})$/;
const CHAT_JPEG_PATTERN = /!\[[^\]\r\n]*\]\(data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})\)/gi;

class TokenHubRequestValidationError extends Error {}

const validateCommonPayload = payload => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TokenHubRequestValidationError('Request body must be a JSON object.');
  }
  const model = typeof payload.model === 'string' ? payload.model.trim() : '';
  if (!TOKENHUB_IMAGE_MODELS.has(model)) {
    throw new TokenHubRequestValidationError('TokenHub image model is not supported.');
  }
  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';
  if (!prompt) {
    throw new TokenHubRequestValidationError('prompt must be a non-empty string.');
  }
  for (const key of ['size', 'quality', 'background']) {
    if (payload[key] !== undefined && (typeof payload[key] !== 'string' || !payload[key].trim())) {
      throw new TokenHubRequestValidationError(`${key} must be a non-empty string when provided.`);
    }
  }
  if (payload.n !== undefined && (!Number.isInteger(payload.n) || payload.n < 1)) {
    throw new TokenHubRequestValidationError('n must be a positive integer when provided.');
  }
  return { model, prompt };
};

const decodeImageDataUrl = (value, fieldName) => {
  if (typeof value !== 'string') {
    throw new TokenHubRequestValidationError(`${fieldName} must be a base64 image data URL.`);
  }
  const match = DATA_URL_PATTERN.exec(value);
  if (!match || match[2].length === 0 || match[2].length % 4 !== 0) {
    throw new TokenHubRequestValidationError(`${fieldName} must be a valid PNG, JPEG, or WebP base64 data URL.`);
  }
  const data = Buffer.from(match[2], 'base64');
  if (data.length === 0 || data.toString('base64') !== match[2]) {
    throw new TokenHubRequestValidationError(`${fieldName} contains invalid base64 image data.`);
  }
  return { data, type: match[1] };
};

const imageExtension = type => type === 'image/jpeg' ? 'jpg' : type.slice('image/'.length);

const validateNanoBananaImages = images => {
  if (!Array.isArray(images) || images.length === 0) {
    throw new TokenHubRequestValidationError('images must include at least one base64 image data URL.');
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (const [index, image] of images.entries()) {
    const match = typeof image === 'string' ? DATA_URL_PATTERN.exec(image) : null;
    if (!match || !match[2].length || match[2].length % 4 !== 0) {
      throw new TokenHubRequestValidationError(`images[${index}] must be a valid PNG, JPEG, or WebP base64 data URL.`);
    }
    const base64 = match[2];
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    if (padding && alphabet.indexOf(base64.at(-padding - 1)) % (padding === 2 ? 16 : 4) !== 0) {
      throw new TokenHubRequestValidationError(`images[${index}] contains invalid base64 image data.`);
    }
  }
};

const generateNanoBananaFromChat = async (client, { model, prompt, images, aspectRatio, resolution, thinkingLevel }, { apiKey, signal }) => {
  const imageConfig = {
    ...(aspectRatio !== undefined ? { aspect_ratio: aspectRatio } : {}),
    ...(resolution !== undefined && resolution !== '1K' ? { image_size: resolution } : {}),
  };
  const googleConfig = {
    ...(Object.keys(imageConfig).length > 0 ? { image_config: imageConfig } : {}),
    ...(thinkingLevel !== undefined ? { thinking_config: { thinking_level: thinkingLevel } } : {}),
  };
  const content = images
    ? [{ type: 'text', text: prompt }, ...images.map(url => ({ type: 'image_url', image_url: { url } }))]
    : prompt;
  const completion = await client.chat.completions.create({
    model, messages: [{ role: 'user', content }], n: 1,
    ...(Object.keys(googleConfig).length > 0 ? { extra_body: { google: googleConfig } } : {}),
  }, { signal, maxRetries: 0, fetchOptions: { redirect: 'error' } });
  const requestId = safeTokenHubProviderText(completion?._request_id, apiKey) ?? safeTokenHubProviderText(completion?.id, apiKey);
  const choices = Array.isArray(completion?.choices) ? completion.choices : [];
  const data = choices.flatMap(choice => {
    const content = choice?.message?.content;
    if (typeof content !== 'string') return [];
    return Array.from(content.matchAll(CHAT_JPEG_PATTERN), ([, base64]) => base64)
      .filter(base64 => base64.startsWith('/9j/') && base64.length % 4 === 0)
      .map(base64 => ({ b64_json: base64 }));
  });
  if (!data.length) throw new TokenHubImageError('TokenHub did not return a JPEG image in the chat response.', { requestID: requestId });
  return { created: completion.created, request_id: requestId, data };
};

const createRequestAbortSignal = (request, response) => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.once('aborted', abort);
  response.once('close', () => {
    if (!response.writableEnded) {
      abort();
    }
  });
  return controller.signal;
};

export const createTokenHubImageHandlers = ({
  fetchImpl = fetch,
  clientFactory = options => new OpenAI({ ...options, fetch: fetchImpl }),
  sendJson,
  toFileImpl = toFile,
}) => {
  let client;
  let clientConfigKey;
  let editInProgress = false;

  const getClientOptions = env => ({
    apiKey: env.TOKENHUB_API_KEY.trim(),
    baseURL: normalizeTokenHubBaseURL(env.TOKENHUB_BASE_URL?.trim() || undefined),
  });

  const getClient = env => {
    const options = getClientOptions(env);
    const nextConfigKey = JSON.stringify(options);
    if (!client || clientConfigKey !== nextConfigKey) {
      client = clientFactory(options);
      clientConfigKey = nextConfigKey;
    }
    return client;
  };

  const handle = async (request, response, env, corsHeaders, operation) => {
    const apiKey = env.TOKENHUB_API_KEY?.trim();
    if (!apiKey) {
      sendJson(response, 503, { detail: 'TOKENHUB_API_KEY must be set on the Node backend.' }, corsHeaders);
      return;
    }
    const isEdit = operation === 'edit';
    if (isEdit && editInProgress) {
      sendJson(response, 429, { detail: 'A TokenHub edit is already running. Retry after it finishes.' }, {
        ...corsHeaders, Connection: 'close',
      });
      return;
    }
    if (isEdit) editInProgress = true;
    const signal = createRequestAbortSignal(request, response);

    try {
      let payload;
      try {
        payload = await readJsonBody(request, isEdit ? Infinity : undefined);
      } catch (error) {
        if (response.destroyed || response.writableEnded) return;
        if (error instanceof RequestBodyTooLargeError) {
          sendJson(response, 413, { detail: error.message }, { ...corsHeaders, Connection: 'close' });
        } else {
          sendJson(response, 400, { detail: error instanceof SyntaxError ? 'Request body must be valid JSON.' : 'Unable to read request body.' }, corsHeaders);
        }
        return;
      }
      signal.throwIfAborted();
      const { model, prompt } = validateCommonPayload(payload);
      let result;
      if (model === TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL) {
        assertTokenHubNanoBananaAspectRatio(payload.aspect_ratio);
        if (payload.resolution !== undefined) assertTokenHubNanoBananaResolution(payload.resolution);
        if (payload.thinking_level !== undefined) assertTokenHubNanoBananaThinkingLevel(payload.thinking_level);
        const count = payload.n ?? 1;
        if (count > 4) throw new TokenHubRequestValidationError('n must be an integer between 1 and 4.');
        if (isEdit) validateNanoBananaImages(payload.images);
        let firstError;
        for (let index = 0; index < count; index += 1) {
          signal.throwIfAborted();
          try {
            const output = await generateNanoBananaFromChat(getClient(env), {
              model, prompt, images: isEdit ? payload.images : undefined,
              aspectRatio: payload.aspect_ratio, resolution: payload.resolution, thinkingLevel: payload.thinking_level,
            }, { apiKey, signal });
            signal.throwIfAborted();
            const data = isEdit ? output.data.slice(0, 1) : output.data;
            if (result) result.data.push(...data);
            else result = { ...output, data };
            if (result.data.length >= count) break;
          } catch (error) {
            signal.throwIfAborted();
            firstError ??= error;
          }
        }
        if (!result) throw firstError;
        if (count > 1 && result.data.length > count) result.data = result.data.slice(0, count);
      } else {
        const common = {
          model,
          prompt,
          size: payload.size,
          quality: payload.quality,
          background: payload.background,
          n: payload.n,
          output_format: 'png',
        };
        const requestOptions = { signal, maxRetries: 0 };
        if (!isEdit) {
          result = await getClient(env).images.generate(common, requestOptions);
        } else {
          if (!Array.isArray(payload.images) || payload.images.length === 0) {
            throw new TokenHubRequestValidationError('images must include at least one base64 image data URL.');
          }
          const decodedImages = payload.images.map((image, index) => decodeImageDataUrl(image, `images[${index}]`));
          const uploads = await Promise.all(decodedImages.map((image, index) => toFileImpl(
            image.data,
            `image-${index + 1}.${imageExtension(image.type)}`,
            { type: image.type },
          )));
          let markupUpload;
          if (payload.markup !== undefined) {
            const markup = decodeImageDataUrl(payload.markup, 'markup');
            if (markup.type !== 'image/png') {
              throw new TokenHubRequestValidationError('markup must be a PNG base64 data URL.');
            }
            markupUpload = await toFileImpl(markup.data, 'markup.png', { type: markup.type });
          }
          result = await getClient(env).images.edit({ ...common, image: uploads, markup: markupUpload }, requestOptions);
        }
      }
      if (!response.destroyed && !response.writableEnded) {
        sendJson(response, 200, result, corsHeaders);
      }
    } catch (error) {
      if (response.destroyed || response.writableEnded) return;
      const providerError = error instanceof OpenAI.APIError
        ? normalizeTokenHubProviderError({
          apiKey, status: error.status, message: error.message, code: error.code, requestID: error.requestID,
        })
        : error;
      if (providerError instanceof TokenHubImageError) {
        const { status, code, requestID, message } = providerError;
        sendJson(response, status, { detail: message, error: { status, code, requestID, message } }, corsHeaders);
      } else if (error instanceof TokenHubRequestValidationError) {
        sendJson(response, 400, { detail: error.message }, corsHeaders);
      } else {
        sendJson(response, 502, { detail: 'TokenHub image request failed.' }, corsHeaders);
      }
    } finally {
      if (isEdit) {
        if (response.writableEnded && !response.writableFinished) {
          await finished(response, { cleanup: true }).catch(() => {});
        }
        editInProgress = false;
      }
    }
  };

  return {
    handleGeneration: (request, response, env, corsHeaders) => handle(request, response, env, corsHeaders, 'generate'),
    handleEdit: (request, response, env, corsHeaders) => handle(request, response, env, corsHeaders, 'edit'),
  };
};
