import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import OpenAI from 'openai';

import { buildSecureBackendConfigState, createSecureBackendServer } from './server.mjs';
import { createTokenHubNanoBananaClient, TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL } from './tokenhub-google.mjs';

const TRUSTED_ORIGIN = 'http://localhost:3000';
const DESKTOP_AUTH_TOKEN = 'desktop-test-token';
const FLARE_MODEL = 'og-image-2-5-flare-standard';
const SUNBURST_MODEL = 'og-image-2-5-sunburst-standard';

const listenOnRandomPort = async server => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
};

const createFakeClient = (calls, method, result) => ({
  images: {
    generate: async (payload, options) => {
      calls.push({ method, payload, options });
      return result;
    },
    edit: async (payload, options) => {
      calls.push({ method, payload, options });
      return result;
    },
  },
});

const withServer = async (options, run) => {
  const server = createSecureBackendServer(options);
  const baseUrl = await listenOnRandomPort(server);
  try {
    await run(baseUrl);
  } finally {
    server.close();
  }
};

const postJson = (baseUrl, path, body, headers = {}) => fetch(`${baseUrl}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: TRUSTED_ORIGIN, ...headers },
  body: JSON.stringify(body),
});

test('TokenHub generation uses the official client contract and returns Images API JSON', async () => {
  const calls = [];
  const clientOptions = [];
  const upstream = { created: 123, data: [{ b64_json: 'cG5nLWJ5dGVz' }] };
  await withServer({
    env: { TOKENHUB_API_KEY: 'tokenhub-test-key' },
    openAIClientFactory: options => {
      clientOptions.push(options);
      return createFakeClient(calls, 'generate', upstream);
    },
  }, async baseUrl => {
    const response = await postJson(baseUrl, '/api/tokenhub/images/generations', {
      model: FLARE_MODEL,
      prompt: 'A precise product render',
      size: '1536x1024',
      quality: 'high',
      background: 'transparent',
      n: 2,
      output_format: 'jpeg',
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), TRUSTED_ORIGIN);
    assert.deepEqual(await response.json(), upstream);
  });
  assert.deepEqual(clientOptions, [{
    apiKey: 'tokenhub-test-key',
    baseURL: 'https://tokenhub.ctclouds.com/v1',
  }]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].payload, {
    model: FLARE_MODEL,
    prompt: 'A precise product render',
    size: '1536x1024',
    quality: 'high',
    background: 'transparent',
    n: 2,
    output_format: 'png',
  });
  assert.ok(calls[0].options.signal instanceof AbortSignal);
});

test('TokenHub edits send source images and transparent markup as separate uploads without a mask', async () => {
  const calls = [];
  const clientOptions = [];
  const upstream = { created: 456, data: [{ b64_json: 'ZWRpdGVk' }] };
  await withServer({
    env: { TOKENHUB_API_KEY: 'tokenhub-test-key', TOKENHUB_BASE_URL: 'https://tokenhub.example/v1/' },
    openAIClientFactory: options => {
      clientOptions.push(options);
      return createFakeClient(calls, 'edit', upstream);
    },
  }, async baseUrl => {
    const response = await postJson(baseUrl, '/api/tokenhub/images/edits', {
      model: SUNBURST_MODEL,
      prompt: 'Apply the marked changes',
      images: [
        `data:image/png;base64,${Buffer.from('source-one').toString('base64')}`,
        `data:image/webp;base64,${Buffer.from('source-two').toString('base64')}`,
      ],
      markup: `data:image/png;base64,${Buffer.from('transparent-markup').toString('base64')}`,
      size: '1024x1024',
      quality: 'medium',
      background: 'auto',
      n: 1,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), upstream);
  });
  assert.deepEqual(clientOptions, [{ apiKey: 'tokenhub-test-key', baseURL: 'https://tokenhub.example/v1' }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.model, SUNBURST_MODEL);
  assert.equal(calls[0].payload.output_format, 'png');
  assert.equal(calls[0].payload.mask, undefined);
  assert.equal(calls[0].payload.image.length, 2);
  assert.deepEqual(calls[0].payload.image.map(upload => upload.name), ['image-1.png', 'image-2.webp']);
  assert.deepEqual(calls[0].payload.image.map(upload => upload.type), ['image/png', 'image/webp']);
  assert.equal(calls[0].payload.markup.name, 'markup.png');
  assert.equal(calls[0].payload.markup.type, 'image/png');
  const contents = await Promise.all(calls[0].payload.image.map(async upload => Buffer.from(await upload.arrayBuffer()).toString()));
  assert.deepEqual(contents, ['source-one', 'source-two']);
  assert.equal(Buffer.from(await calls[0].payload.markup.arrayBuffer()).toString(), 'transparent-markup');
});

test('TokenHub edits accept JSON media larger than the default one MiB request limit', async () => {
  const calls = [];
  const source = Buffer.alloc(1024 * 1024 + 256, 7);
  await withServer({
    env: { TOKENHUB_API_KEY: 'tokenhub-test-key' },
    openAIClientFactory: () => createFakeClient(calls, 'edit', { data: [] }),
  }, async baseUrl => {
    const response = await postJson(baseUrl, '/api/tokenhub/images/edits', {
      model: FLARE_MODEL,
      prompt: 'Edit a large source',
      images: [`data:image/png;base64,${source.toString('base64')}`],
    });
    assert.equal(response.status, 200);
  });
  assert.equal(calls.length, 1);
  assert.equal((await calls[0].payload.image[0].arrayBuffer()).byteLength, source.length);
});

test('TokenHub bounds generation bodies and admits one large edit at a time', async () => {
  const editStarted = Promise.withResolvers();
  const finishEdit = Promise.withResolvers();
  let editCalls = 0;
  await withServer({
    env: { TOKENHUB_API_KEY: 'test-key' },
    openAIClientFactory: () => ({ images: {
      generate: async () => ({ data: [] }),
      edit: async () => {
        editCalls += 1;
        editStarted.resolve();
        await finishEdit.promise;
        return { data: [] };
      },
    } }),
  }, async baseUrl => {
    const generationPath = '/api/tokenhub/images/generations';
    const editPath = '/api/tokenhub/images/edits';
    const largeText = { model: FLARE_MODEL, prompt: 'x'.repeat(1024 * 1024) };
    const largeEdit = {
      model: FLARE_MODEL, prompt: 'Edit a large source',
      images: [`data:image/png;base64,${'YWFh'.repeat(300_000)}`],
    };
    assert.equal((await postJson(baseUrl, generationPath, largeText)).status, 413);
    const streamed = await fetch(`${baseUrl}${generationPath}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: TRUSTED_ORIGIN },
      body: new Blob([JSON.stringify(largeText)]).stream(), duplex: 'half',
    });
    assert.equal(streamed.status, 413);
    const firstEdit = postJson(baseUrl, editPath, largeEdit);
    try {
      await editStarted.promise;
      const busy = await postJson(baseUrl, editPath, { model: FLARE_MODEL, prompt: 'Second edit' });
      assert.equal(busy.status, 429);
      assert.match((await busy.json()).detail, /edit is already running/);
      assert.equal((await postJson(baseUrl, generationPath, { model: FLARE_MODEL, prompt: 'Small text run' })).status, 200);
    } finally {
      finishEdit.resolve();
      assert.equal((await firstEdit).status, 200);
    }
    assert.equal(editCalls, 1);
    assert.equal((await postJson(baseUrl, editPath, largeEdit)).status, 200);
  });
});

test('TokenHub rejects missing keys, unsupported models, and invalid media before SDK calls', async () => {
  let factoryCalls = 0;
  const openAIClientFactory = () => {
    factoryCalls += 1;
    return createFakeClient([], 'generate', { data: [] });
  };
  await withServer({ env: {}, openAIClientFactory }, async baseUrl => {
    const response = await postJson(baseUrl, '/api/tokenhub/images/generations', { model: FLARE_MODEL, prompt: 'test' });
    assert.equal(response.status, 503);
    assert.match((await response.json()).detail, /TOKENHUB_API_KEY/);
  });
  await withServer({ env: { TOKENHUB_API_KEY: 'tokenhub-test-key' }, openAIClientFactory }, async baseUrl => {
    const unsupported = await postJson(baseUrl, '/api/tokenhub/images/generations', { model: 'gpt-image-1', prompt: 'test' });
    assert.equal(unsupported.status, 400);
    const invalid = await postJson(baseUrl, '/api/tokenhub/images/edits', {
      model: FLARE_MODEL,
      prompt: 'test',
      images: ['not-a-data-url'],
    });
    assert.equal(invalid.status, 400);
    const invalidMarkup = await postJson(baseUrl, '/api/tokenhub/images/edits', {
      model: FLARE_MODEL,
      prompt: 'test',
      images: [`data:image/png;base64,${Buffer.from('source').toString('base64')}`],
      markup: `data:image/webp;base64,${Buffer.from('markup').toString('base64')}`,
    });
    assert.equal(invalidMarkup.status, 400);
  });
  assert.equal(factoryCalls, 0);
});

test('TokenHub surfaces safe OpenAI API errors and hides unexpected error internals', async () => {
  const apiError = new OpenAI.APIError(429, { code: 'rate_limited', message: 'Provider rate limit reached' }, undefined, new Headers({ 'x-request-id': 'request-123' }));
  await withServer({
    env: { TOKENHUB_API_KEY: 'tokenhub-test-key' },
    openAIClientFactory: () => ({ images: { generate: async () => { throw apiError; } } }),
  }, async baseUrl => {
    const response = await postJson(baseUrl, '/api/tokenhub/images/generations', { model: FLARE_MODEL, prompt: 'test' });
    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), {
      detail: '429 Provider rate limit reached',
      error: {
        status: 429,
        code: 'rate_limited',
        requestID: 'request-123',
        message: '429 Provider rate limit reached',
      },
    });
  });
  const gatewayError = new OpenAI.APIError(502, { message: '<html><title>502 Bad Gateway</title></html>' }, undefined, new Headers());
  await withServer({
    env: { TOKENHUB_API_KEY: 'tokenhub-test-key' },
    openAIClientFactory: () => ({ images: { generate: async () => { throw gatewayError; } } }),
  }, async baseUrl => {
    const response = await postJson(baseUrl, '/api/tokenhub/images/generations', { model: FLARE_MODEL, prompt: 'test' });
    assert.equal(response.status, 502);
    const result = await response.json();
    assert.equal(result.detail, 'TokenHub gateway returned HTTP 502. The provider did not return an image; try again or check TokenHub model availability.');
    assert.equal(JSON.stringify(result).includes('<html>'), false);
  });
  await withServer({
    env: { TOKENHUB_API_KEY: 'tokenhub-test-key' },
    openAIClientFactory: () => ({ images: { generate: async () => { throw new Error('private connection detail'); } } }),
  }, async baseUrl => {
    const response = await postJson(baseUrl, '/api/tokenhub/images/generations', { model: FLARE_MODEL, prompt: 'test' });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { detail: 'TokenHub image request failed.' });
  });
});

test('TokenHub sends one paid GPT Image request and redacts credentials from all error fields', async () => {
  const apiKey = 'synthetic-private-tokenhub-key';
  let calls = 0;
  await withServer({
    env: { TOKENHUB_API_KEY: apiKey },
    openAIClientFactory: options => new OpenAI({
      ...options,
      fetch: async () => {
        calls += 1;
        if (calls > 1) return Response.json({ data: [] });
        return Response.json({
          error: { message: `Gateway timed out for ${apiKey}`, code: apiKey },
        }, { status: 504, headers: { 'x-request-id': `gateway-id-${apiKey}` } });
      },
    }),
  }, async baseUrl => {
    const response = await postJson(baseUrl, '/api/tokenhub/images/generations', { model: FLARE_MODEL, prompt: 'test' });
    assert.equal(response.status, 504);
    const result = await response.json();
    assert.equal(JSON.stringify(result).includes(apiKey), false);
    assert.match(result.detail, /Gateway timed out/);
    assert.match(result.error.requestID, /^gateway-id-/);
  });
  assert.equal(calls, 1);
});

test('TokenHub desktop routes require the launch nonce', async () => {
  const calls = [];
  await withServer({
    env: { TOKENHUB_API_KEY: 'tokenhub-test-key', CANVA_BANANA_DESKTOP_AUTH_TOKEN: DESKTOP_AUTH_TOKEN },
    openAIClientFactory: () => createFakeClient(calls, 'generate', { data: [] }),
  }, async baseUrl => {
    const body = { model: FLARE_MODEL, prompt: 'test' };
    const rejected = await postJson(baseUrl, '/api/tokenhub/images/generations', body, { Origin: 'null' });
    assert.equal(rejected.status, 403);
    const accepted = await postJson(baseUrl, '/api/tokenhub/images/generations', body, {
      Origin: 'null',
      'x-canva-banana-desktop-token': DESKTOP_AUTH_TOKEN,
    });
    assert.equal(accepted.status, 200);
  });
  assert.equal(calls.length, 1);
});

test('TokenHub Nano Banana uses the Google SDK adapter through existing local image routes', async () => {
  const upstreamCalls = [];
  await withServer({
    env: { TOKENHUB_API_KEY: 'tokenhub-test-key' },
    nanoBananaClientFactory: options => createTokenHubNanoBananaClient({
      ...options,
      fetchImpl: async (url, init) => {
        upstreamCalls.push({ url, init });
        return new Response(JSON.stringify({ created: 123, request_id: 'nano-request', data: [{ b64_json: 'bmFubw==' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    }),
  }, async baseUrl => {
    const noImages = await postJson(baseUrl, '/api/tokenhub/images/edits', {
      model: TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL,
      prompt: 'Edit the source',
    });
    assert.equal(noImages.status, 400);
    const largeImage = `data:image/png;base64,${'YWFh'.repeat(300_000)}`;
    const response = await postJson(baseUrl, '/api/tokenhub/images/edits', {
      model: TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL,
      prompt: 'Edit the source',
      images: [largeImage],
      aspect_ratio: '16:9',
      resolution: '2K',
      enable_web_search: true,
      thinking_level: 'high',
      n: 1,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { created: 123, request_id: 'nano-request', data: [{ b64_json: 'bmFubw==' }] });
  });
  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, 'https://tokenhub.ctclouds.com/v1/images/edits');
  assert.equal(upstreamCalls[0].init.headers.get('authorization'), 'Bearer tokenhub-test-key');
  assert.deepEqual(JSON.parse(upstreamCalls[0].init.body), {
    model: TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL,
    prompt: 'Edit the source',
    aspect_ratio: '16:9',
    resolution: '2K',
    enable_web_search: true,
    thinking_level: 'high',
    n: 1,
    output_format: 'png',
    images: [`data:image/png;base64,${'YWFh'.repeat(300_000)}`],
  });
});

test('TokenHub Nano Banana refreshes credentials and the gateway URL without restarting', async () => {
  let env = { TOKENHUB_API_KEY: 'first-key' };
  const requests = [];
  await withServer({
    getEnv: () => env,
    nanoBananaClientFactory: options => createTokenHubNanoBananaClient({
      ...options,
      fetchImpl: async (url, { headers }) => {
        requests.push([url, headers.get('authorization')]);
        return Response.json({ data: [{ b64_json: 'bmFubw==' }] });
      },
    }),
  }, async baseUrl => {
    const body = {
      model: TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL, prompt: 'A poster', resolution: '1K',
      enable_web_search: false, thinking_level: 'minimal', n: 1,
    };
    assert.equal((await postJson(baseUrl, '/api/tokenhub/images/generations', body)).status, 200);
    env = { TOKENHUB_API_KEY: 'replacement-key', TOKENHUB_BASE_URL: 'https://tokenhub.example/' };
    assert.equal((await postJson(baseUrl, '/api/tokenhub/images/generations', body)).status, 200);
  });
  assert.deepEqual(requests, [
    ['https://tokenhub.ctclouds.com/v1/images/generations', 'Bearer first-key'],
    ['https://tokenhub.example/v1/images/generations', 'Bearer replacement-key'],
  ]);
});

test('both TokenHub SDKs use the configured transport and preserve the gateway path', async () => {
  const baseURL = 'http://127.0.0.1:1/tenant/api';
  const calls = [];
  await withServer({
    env: { TOKENHUB_API_KEY: 'test-key', TOKENHUB_BASE_URL: `${baseURL}/` },
    fetchImpl: async (url, init) => {
      calls.push([String(url), new Headers(init.headers).get('authorization')]);
      return Response.json({ data: [{ b64_json: 'eA==' }] });
    },
  }, async baseUrl => {
    const path = '/api/tokenhub/images/generations';
    assert.equal((await postJson(baseUrl, path, { model: FLARE_MODEL, prompt: 'GPT test' })).status, 200);
    const nano = await postJson(baseUrl, path, {
      model: TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL, prompt: 'Nano test', resolution: '1K',
      enable_web_search: false, thinking_level: 'minimal', n: 1,
    });
    assert.equal(nano.status, 200);
  });
  assert.deepEqual(calls, [
    [`${baseURL}/images/generations`, 'Bearer test-key'],
    [`${baseURL}/images/generations`, 'Bearer test-key'],
  ]);
});

test('TokenHub retains the last usable key after a configuration read error and recovers', async () => {
  let settings = { TOKENHUB_API_KEY: 'startup-key' };
  const authorization = [];
  await withServer({
    env: settings,
    getEnv: () => {
      if (!settings) throw new Error('temporary settings read failure');
      return settings;
    },
    fetchImpl: async (_url, init) => {
      authorization.push(new Headers(init.headers).get('authorization'));
      return Response.json({ data: [] });
    },
  }, async baseUrl => {
    const path = '/api/tokenhub/images/generations';
    const body = { model: FLARE_MODEL, prompt: 'test' };
    settings = null;
    assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
    assert.equal((await postJson(baseUrl, path, body)).status, 200);
    settings = { TOKENHUB_API_KEY: 'replacement-key' };
    assert.equal((await postJson(baseUrl, path, body)).status, 200);
    settings = null;
    assert.equal((await postJson(baseUrl, path, body)).status, 200);
  });
  assert.deepEqual(authorization, ['Bearer startup-key', 'Bearer replacement-key', 'Bearer replacement-key']);
});

test('TokenHub applies refreshed backend settings without a server restart', async () => {
  let currentEnv = {};
  const clientOptions = [];
  const upstream = { data: [{ b64_json: 'cG5nLWJ5dGVz' }] };
  await withServer({
    getEnv: () => currentEnv,
    openAIClientFactory: options => {
      clientOptions.push(options);
      return createFakeClient([], 'generate', upstream);
    },
  }, async baseUrl => {
    const body = { model: SUNBURST_MODEL, prompt: 'A poster' };
    const missing = await postJson(baseUrl, '/api/tokenhub/images/generations', body);
    assert.equal(missing.status, 503);
    currentEnv = { TOKENHUB_API_KEY: 'first-key' };
    const first = await postJson(baseUrl, '/api/tokenhub/images/generations', body);
    assert.equal(first.status, 200);
    currentEnv = { TOKENHUB_API_KEY: 'replacement-key', TOKENHUB_BASE_URL: 'https://tokenhub.example/v1/' };
    const replacement = await postJson(baseUrl, '/api/tokenhub/images/generations', body);
    assert.equal(replacement.status, 200);
  });
  assert.deepEqual(clientOptions, [
    { apiKey: 'first-key', baseURL: 'https://tokenhub.ctclouds.com/v1' },
    { apiKey: 'replacement-key', baseURL: 'https://tokenhub.example/v1' },
  ]);
});

test('standalone env resolution reloads saved dotenv settings and preserves shell overrides', async () => {
  const { writeFileSync } = await import('node:fs');
  const { resolveEnvWithFiles } = await import('./server.mjs');
  const rootDir = mkdtempSync(join(tmpdir(), 'canva-banana-tokenhub-env-'));
  try {
    writeFileSync(join(rootDir, '.env'), 'TOKENHUB_API_KEY="base"\nFAL_API_KEY="file"\n');
    writeFileSync(join(rootDir, '.env.local'), 'TOKENHUB_API_KEY="saved"\n');
    assert.deepEqual(resolveEnvWithFiles(rootDir, { FAL_API_KEY: 'shell' }), {
      TOKENHUB_API_KEY: 'saved',
      FAL_API_KEY: 'shell',
    });
    writeFileSync(join(rootDir, '.env.local'), 'TOKENHUB_API_KEY="replacement"\n');
    assert.deepEqual(resolveEnvWithFiles(rootDir, { FAL_API_KEY: 'shell' }), {
      TOKENHUB_API_KEY: 'replacement',
      FAL_API_KEY: 'shell',
    });
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('TokenHub readiness and reuse config expose base URL identity and secret presence only', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'canva-banana-tokenhub-config-'));
  try {
    const configured = buildSecureBackendConfigState(rootDir, {
      TOKENHUB_API_KEY: 'tokenhub-private-value',
      TOKENHUB_BASE_URL: 'https://tokenhub.example/v1',
    }, {});
    assert.equal(configured.readiness.tokenhubImages, true);
    assert.equal(configured.reuseContract.capabilities.tokenhubImages, true);
    assert.deepEqual(configured.reuseContract.config.TOKENHUB_API_KEY, { present: true });
    assert.equal(configured.reuseContract.config.TOKENHUB_BASE_URL, 'https://tokenhub.example/v1');
    assert.equal(JSON.stringify(configured).includes('tokenhub-private-value'), false);
    const unconfigured = buildSecureBackendConfigState(rootDir, {}, {});
    assert.equal(unconfigured.readiness.tokenhubImages, false);
    assert.equal(unconfigured.reuseContract.config.TOKENHUB_BASE_URL, 'https://tokenhub.ctclouds.com/v1');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
