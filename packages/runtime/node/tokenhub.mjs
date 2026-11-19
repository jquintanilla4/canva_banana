import { finished } from 'node:stream/promises';
import OpenAI, { toFile } from 'openai';
import { RequestBodyTooLargeError, readJsonBody } from './http-request-body.mjs';
import { TokenHubImageError, normalizeTokenHubBaseURL, normalizeTokenHubProviderError } from './tokenhub-gateway.mjs';
import {
  TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL,
  createTokenHubNanoBananaClient,
  runTokenHubNanoBananaInteraction,
} from './tokenhub-google.mjs';

export const TOKENHUB_IMAGE_GENERATIONS_PATH = '/api/tokenhub/images/generations';
export const TOKENHUB_IMAGE_EDITS_PATH = '/api/tokenhub/images/edits';

const TOKENHUB_IMAGE_MODELS = new Set([
  'og-image-2-5-flare-standard',
  'og-image-2-5-sunburst-standard',
  TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL,
]);

const DATA_URL_PATTERN = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})$/;

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
  nanoBananaClientFactory = options => createTokenHubNanoBananaClient({ ...options, fetchImpl }),
  sendJson,
  toFileImpl = toFile,
}) => {
  let client;
  let clientConfigKey;
  let nanoBananaClient;
  let nanoBananaClientConfigKey;
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

  const getNanoBananaClient = env => {
    const options = getClientOptions(env);
    const nextConfigKey = JSON.stringify(options);
    if (!nanoBananaClient || nanoBananaClientConfigKey !== nextConfigKey) {
      nanoBananaClient = nanoBananaClientFactory(options);
      nanoBananaClientConfigKey = nextConfigKey;
    }
    return nanoBananaClient;
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
        if (isEdit && (!Array.isArray(payload.images) || payload.images.length === 0)) {
          throw new TokenHubRequestValidationError('images must include at least one base64 image data URL.');
        }
        result = await runTokenHubNanoBananaInteraction(getNanoBananaClient(env), {
          model,
          prompt,
          images: isEdit ? payload.images : undefined,
          aspect_ratio: payload.aspect_ratio,
          resolution: payload.resolution,
          enable_web_search: payload.enable_web_search,
          thinking_level: payload.thinking_level,
          n: payload.n,
          output_format: 'png',
        }, { signal });
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
