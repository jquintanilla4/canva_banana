import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL,
  createTokenHubNanoBananaClient,
  runTokenHubNanoBananaInteraction,
} from './tokenhub-google.mjs';
import { TokenHubImageError } from './tokenhub-gateway.mjs';

const createPayload = (overrides = {}) => ({
  model: TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL,
  prompt: 'A precise product render',
  resolution: '1K',
  enable_web_search: false,
  thinking_level: 'medium',
  n: 1,
  output_format: 'png',
  ...overrides,
});

const imageResponse = (items = [{ b64_json: 'cG5nLWJ5dGVz', revised_prompt: 'Revised' }]) => new Response(JSON.stringify({
  created: 123,
  request_id: 'request-123',
  data: items,
}), { status: 200, headers: { 'Content-Type': 'application/json' } });

const captureRequest = async (payload, response = imageResponse()) => {
  const calls = [];
  const client = createTokenHubNanoBananaClient({
    apiKey: 'tokenhub-test-key',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return response.clone();
    },
  });
  const result = await runTokenHubNanoBananaInteraction(client, payload);
  return { calls, result };
};

test('Google SDK generation adapts to TokenHub Images URL, Bearer auth, and fields', async () => {
  const { calls, result } = await captureRequest(createPayload({ aspect_ratio: '16:9', resolution: '2K', n: 2 }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://tokenhub.ctclouds.com/v1/images/generations');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.get('authorization'), 'Bearer tokenhub-test-key');
  assert.equal(calls[0].init.headers.get('x-goog-api-key'), null);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    model: TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL,
    prompt: 'A precise product render',
    aspect_ratio: '16:9',
    resolution: '2K',
    enable_web_search: false,
    thinking_level: 'medium',
    n: 2,
    output_format: 'png',
  });
  assert.deepEqual(result, {
    created: 123,
    request_id: 'request-123',
    data: [{ b64_json: 'cG5nLWJ5dGVz', revised_prompt: 'Revised' }],
  });
});

test('Google SDK edits translate image blocks to TokenHub JSON and preserve output order', async () => {
  const images = [
    'data:image/jpeg;base64,cmVmZXJlbmNl',
    'data:image/png;base64,YW5ub3RhdGlvbg==',
    'data:image/png;base64,c291cmNl',
  ];
  const { calls, result } = await captureRequest(createPayload({
    images,
    enable_web_search: true,
    thinking_level: 'high',
  }), imageResponse([{ b64_json: 'Zmlyc3Q=' }, { b64_json: 'c2Vjb25k' }]));
  assert.equal(calls[0].url, 'https://tokenhub.ctclouds.com/v1/images/edits');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    model: TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL,
    prompt: 'A precise product render',
    resolution: '1K',
    enable_web_search: true,
    thinking_level: 'high',
    n: 1,
    output_format: 'png',
    images,
  });
  assert.deepEqual(result.data.map(item => item.b64_json), ['Zmlyc3Q=', 'c2Vjb25k']);
});

test('TokenHub Google adapter preserves field errors and redacts credentials', async () => {
  const client = createTokenHubNanoBananaClient({
    apiKey: 'tokenhub-test-key',
    fetchImpl: async () => Response.json({
      error: {
        code: 'unsupported_field',
        message: 'thinking_level is unavailable for tokenhub-test-key (Bearer upstream-secret)',
      },
    }, { status: 422, headers: { 'x-request-id': 'tokenhub-test-key' } }),
  });
  await assert.rejects(runTokenHubNanoBananaInteraction(client, createPayload()), {
    status: 422,
    code: 'unsupported_field',
    message: 'thinking_level is unavailable for [redacted] (Bearer [redacted])',
    requestID: '[redacted]',
  });
  await assert.rejects(captureRequest(createPayload(), new Response('invalid JSON')), {
    status: 502,
    message: 'TokenHub did not return valid image JSON.',
  });
});

test('TokenHub Google adapter sanitizes gateway errors and preserves provider metadata', async () => {
  const client = createTokenHubNanoBananaClient({
    apiKey: 'tokenhub-test-key',
    baseURL: 'https://tokenhub.example/v1/',
    fetchImpl: async () => new Response('<html><title>502 Bad Gateway</title></html>', {
      status: 502,
      headers: { 'x-request-id': 'gateway-request' },
    }),
  });
  await assert.rejects(runTokenHubNanoBananaInteraction(client, createPayload()), error => {
    assert.ok(error instanceof TokenHubImageError);
    assert.equal(error.status, 502);
    assert.equal(error.requestID, 'gateway-request');
    assert.equal(error.message, 'TokenHub gateway returned HTTP 502. The provider did not return an image; try again or check TokenHub model availability.');
    return true;
  });
});

test('TokenHub Google adapter validates input and forwards abort signals', async () => {
  const controller = new AbortController();
  let signal;
  const client = createTokenHubNanoBananaClient({
    apiKey: 'tokenhub-test-key',
    fetchImpl: async (_url, init) => {
      signal = init.signal;
      return imageResponse();
    },
  });
  await runTokenHubNanoBananaInteraction(client, createPayload(), { signal: controller.signal });
  assert.ok(signal instanceof AbortSignal);
  assert.equal(signal.aborted, false);
  controller.abort();
  assert.equal(signal.aborted, true);
  await assert.rejects(runTokenHubNanoBananaInteraction(client, createPayload({ model: 'wrong-model' })), error => {
    assert.ok(error instanceof TokenHubImageError);
    assert.equal(error.status, 400);
    return true;
  });
});
