import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import { createSecureBackendServer, getSecureBackendListenOptions } from './server.mjs';

const TRUSTED_ORIGIN = 'http://localhost:3000';
const UNTRUSTED_ORIGIN = 'https://evil.example';
const DESKTOP_AUTH_TOKEN = 'desktop-test-token';
const OPENROUTER_MODEL = 'google/gemini-3.5-flash';
const DEV_SERVICE_HEALTH_PROBE_HEADER = 'x-canva-banana-dev-service-probe'; // Matches the dev launcher probe.
const DEV_SERVICE_HEALTH_PROBE_VALUE = 'canva-banana-dev-service-health'; // Lets tests request dev identity.
const DEV_SERVICE_HEALTH_TOKEN_HEADER = 'x-canva-banana-dev-service-token'; // Authenticates detailed dev health.
const DEV_SERVICE_HEALTH_TOKEN = 'dev-health-token';
const DEV_HEALTH_ALLOWED_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000', 'file://', 'null'];

const buildDevHealthConfigState = () => {
  const envFiles = [
    { fileName: '.env.local', exists: false },
    { fileName: '.env', exists: false },
  ];
  const readiness = {
    falProxy: true,
    falAssetFetch: true,
    moonshotIntent: false,
    openrouterChat: true,
  };
  const reuseContract = {
    version: 1,
    workspaceRoot: 'test-workspace',
    capabilities: {
      falProxy: true,
      falAssetFetch: true,
      moonshotIntent: true,
      openrouterChat: true,
    },
    readiness,
    config: {
      FAL_API_KEY: { present: true },
      MOONSHOT_API_KEY: { present: false },
      OPENROUTER_API_KEY: { present: true },
      SECURE_BACKEND_ALLOWED_ORIGINS: DEV_HEALTH_ALLOWED_ORIGINS,
      CANVA_BANANA_DESKTOP_AUTH_TOKEN: { present: false },
    },
    envFiles,
  };
  return {
    verifiable: true,
    shellProvidedKeys: [],
    shellProvidedUnverifiableKeys: [],
    envFiles,
    readiness,
    allowedOrigins: DEV_HEALTH_ALLOWED_ORIGINS,
    auth: { desktopTokenRequired: false },
    reuseContract,
  };
};

const listenOnRandomPort = async (server) => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
};

test('Moonshot intent endpoint sends the prompt to Kimi with the server key', async () => {
  const calls = [];
  const server = createSecureBackendServer({
    env: { MOONSHOT_API_KEY: 'moonshot-secret', FAL_API_KEY: 'fal-secret' },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"start_time": 3.5, "end_time": 9.25}' } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  const baseUrl = await listenOnRandomPort(server);
  try {
    const response = await fetch(`${baseUrl}/api/moonshot/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: TRUSTED_ORIGIN },
      body: JSON.stringify({ prompt: 'sync from 3.5s to 9.25s', video_duration_seconds: 12 }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), TRUSTED_ORIGIN);
    assert.deepEqual(await response.json(), { start_time: 3.5, end_time: 9.25 });
    assert.equal(calls[0].url, 'https://api.moonshot.ai/v1/chat/completions');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer moonshot-secret');
    assert.equal(JSON.parse(calls[0].options.body).model, 'kimi-k2.6');
  } finally {
    server.close();
  }
});

test('OpenRouter chat endpoint sends allowed chat requests with the server key', async () => {
  const calls = [];
  const server = createSecureBackendServer({
    env: { OPENROUTER_API_KEY: 'openrouter-secret' },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({
        model: OPENROUTER_MODEL,
        choices: [{ message: { content: 'Try this improved prompt.' } }],
        usage: { total_tokens: 42 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  const baseUrl = await listenOnRandomPort(server);
  try {
    const response = await fetch(`${baseUrl}/api/openrouter/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: TRUSTED_ORIGIN },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{ role: 'user', content: 'Improve this prompt.' }],
      }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), TRUSTED_ORIGIN);
    assert.deepEqual(await response.json(), {
      message: { role: 'assistant', content: 'Try this improved prompt.' },
      model: OPENROUTER_MODEL,
      usage: { total_tokens: 42 },
    });
    assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer openrouter-secret');
    const upstreamPayload = JSON.parse(calls[0].options.body);
    assert.equal(upstreamPayload.model, OPENROUTER_MODEL);
    assert.equal(upstreamPayload.messages[0].role, 'system');
    assert.deepEqual(upstreamPayload.messages[1], { role: 'user', content: 'Improve this prompt.' });
  } finally {
    server.close();
  }
});

test('OpenRouter chat endpoint rejects missing keys and unsupported models', async () => {
  const server = createSecureBackendServer({
    env: {},
    fetchImpl: async () => {
      throw new Error('fetch should not be called');
    },
  });
  const baseUrl = await listenOnRandomPort(server);
  try {
    const missingKeyResponse = await fetch(`${baseUrl}/api/openrouter/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: TRUSTED_ORIGIN },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{ role: 'user', content: 'Improve this prompt.' }],
      }),
    });
    assert.equal(missingKeyResponse.status, 503);
  } finally {
    server.close();
  }

  const keyedServer = createSecureBackendServer({
    env: { OPENROUTER_API_KEY: 'openrouter-secret' },
    fetchImpl: async () => {
      throw new Error('fetch should not be called');
    },
  });
  const keyedBaseUrl = await listenOnRandomPort(keyedServer);
  try {
    const unsupportedModelResponse = await fetch(`${keyedBaseUrl}/api/openrouter/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: TRUSTED_ORIGIN },
      body: JSON.stringify({
        model: 'openrouter/unsupported',
        messages: [{ role: 'user', content: 'Improve this prompt.' }],
      }),
    });
    assert.equal(unsupportedModelResponse.status, 400);
    assert.match((await unsupportedModelResponse.json()).detail, /not supported/i);
  } finally {
    keyedServer.close();
  }
});

test('OpenRouter chat endpoint rejects non-object JSON bodies', async () => {
  const server = createSecureBackendServer({
    env: { OPENROUTER_API_KEY: 'openrouter-secret' },
    fetchImpl: async () => {
      throw new Error('fetch should not be called');
    },
  });
  const baseUrl = await listenOnRandomPort(server);
  try {
    for (const body of ['null', '[]']) {
      const response = await fetch(`${baseUrl}/api/openrouter/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: TRUSTED_ORIGIN },
        body,
      });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).detail, 'Request body must be a JSON object.');
    }
  } finally {
    server.close();
  }
});

test('OpenRouter chat endpoint maps upstream failures to backend errors', async () => {
  const server = createSecureBackendServer({
    env: { OPENROUTER_API_KEY: 'openrouter-secret' },
    fetchImpl: async () => new Response(JSON.stringify({
      error: { message: 'model unavailable' },
    }), { status: 429, headers: { 'Content-Type': 'application/json' } }),
  });
  const baseUrl = await listenOnRandomPort(server);
  try {
    const response = await fetch(`${baseUrl}/api/openrouter/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: TRUSTED_ORIGIN },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{ role: 'user', content: 'Improve this prompt.' }],
      }),
    });
    assert.equal(response.status, 502);
    assert.equal((await response.json()).detail, 'model unavailable');
  } finally {
    server.close();
  }
});

test('Fal proxy forwards allowed Fal targets with the server key', async () => {
  const calls = [];
  const server = createSecureBackendServer({
    env: { MOONSHOT_API_KEY: 'moonshot-secret', FAL_API_KEY: 'fal-secret' },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ request_id: 'abc123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'x-fal-request-id': 'abc123' },
      });
    },
  });
  const baseUrl = await listenOnRandomPort(server);
  try {
    const response = await fetch(`${baseUrl}/api/fal/proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: TRUSTED_ORIGIN,
        'x-fal-target-url': 'https://queue.fal.run/fal-ai/example',
      },
      body: JSON.stringify({ input: { prompt: 'test' } }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), TRUSTED_ORIGIN);
    assert.deepEqual(await response.json(), { request_id: 'abc123' });
    assert.equal(calls[0].url, 'https://queue.fal.run/fal-ai/example');
    assert.equal(calls[0].options.headers.get('Authorization'), 'Key fal-secret');
    assert.equal(calls[0].options.headers.get('x-fal-target-url'), null);
  } finally {
    server.close();
  }
});

test('Fal proxy strips upstream CORS headers before responding to the browser', async () => {
  const server = createSecureBackendServer({
    env: { MOONSHOT_API_KEY: 'moonshot-secret', FAL_API_KEY: 'fal-secret' },
    fetchImpl: async () => new Response(JSON.stringify({ request_id: 'abc123' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://fal.ai',
        'Access-Control-Allow-Credentials': 'true',
        Connection: 'keep-alive',
      },
    }),
  });
  const baseUrl = await listenOnRandomPort(server);
  try {
    const response = await fetch(`${baseUrl}/api/fal/proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: TRUSTED_ORIGIN,
        'x-fal-target-url': 'https://queue.fal.run/fal-ai/example',
      },
      body: '{}',
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), TRUSTED_ORIGIN);
    assert.equal(response.headers.get('access-control-allow-credentials'), null);
  } finally {
    server.close();
  }
});

test('Fal proxy rejects non-Fal targets', async () => {
  const server = createSecureBackendServer({
    env: { MOONSHOT_API_KEY: 'moonshot-secret', FAL_API_KEY: 'fal-secret' },
    fetchImpl: async () => {
      throw new Error('fetch should not be called');
    },
  });
  const baseUrl = await listenOnRandomPort(server);
  try {
    const response = await fetch(`${baseUrl}/api/fal/proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-fal-target-url': 'https://example.com/not-fal',
      },
      body: '{}',
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).detail, /not allowed/i);
  } finally {
    server.close();
  }
});

test('key-bearing routes reject untrusted browser origins before proxying', async () => {
  const calls = [];
  const server = createSecureBackendServer({
    env: { MOONSHOT_API_KEY: 'moonshot-secret', FAL_API_KEY: 'fal-secret' },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      throw new Error('fetch should not be called');
    },
  });
  const baseUrl = await listenOnRandomPort(server);
  try {
    const falResponse = await fetch(`${baseUrl}/api/fal/proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: UNTRUSTED_ORIGIN,
        'x-fal-target-url': 'https://queue.fal.run/fal-ai/example',
      },
      body: '{}',
    });
    const moonshotResponse = await fetch(`${baseUrl}/api/moonshot/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: UNTRUSTED_ORIGIN },
      body: JSON.stringify({ prompt: 'sync from 1s to 2s' }),
    });

    assert.equal(falResponse.status, 403);
    assert.equal(moonshotResponse.status, 403);
    assert.equal(falResponse.headers.get('access-control-allow-origin'), null);
    assert.equal(moonshotResponse.headers.get('access-control-allow-origin'), null);
    assert.equal(calls.length, 0);
  } finally {
    server.close();
  }
});

test('desktop-origin key-bearing routes require the launch token', async () => {
  const calls = [];
  const server = createSecureBackendServer({
    env: { MOONSHOT_API_KEY: 'moonshot-secret', FAL_API_KEY: 'fal-secret', CANVA_BANANA_DESKTOP_AUTH_TOKEN: DESKTOP_AUTH_TOKEN },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ request_id: 'abc123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  const baseUrl = await listenOnRandomPort(server);
  try {
    const rejectedResponse = await fetch(`${baseUrl}/api/fal/proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'null',
        'x-fal-target-url': 'https://queue.fal.run/fal-ai/example',
      },
      body: '{}',
    });
    const queryTokenResponse = await fetch(`${baseUrl}/api/fal/proxy?desktopAuthToken=${DESKTOP_AUTH_TOKEN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'null',
        'x-fal-target-url': 'https://queue.fal.run/fal-ai/example',
      },
      body: '{}',
    });
    const acceptedResponse = await fetch(`${baseUrl}/api/fal/proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'null',
        'x-fal-target-url': 'https://queue.fal.run/fal-ai/example',
        'x-canva-banana-desktop-token': DESKTOP_AUTH_TOKEN,
      },
      body: '{}',
    });

    assert.equal(rejectedResponse.status, 403);
    assert.equal(queryTokenResponse.status, 403);
    assert.equal(acceptedResponse.status, 200);
    assert.equal(acceptedResponse.headers.get('access-control-allow-origin'), 'null');
    assert.equal(calls.length, 1);
  } finally {
    server.close();
  }
});

test('desktop-origin OpenRouter chat requires the launch token', async () => {
  const calls = [];
  const server = createSecureBackendServer({
    env: { OPENROUTER_API_KEY: 'openrouter-secret', CANVA_BANANA_DESKTOP_AUTH_TOKEN: DESKTOP_AUTH_TOKEN },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Improved prompt.' } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  const baseUrl = await listenOnRandomPort(server);
  const body = JSON.stringify({
    model: OPENROUTER_MODEL,
    messages: [{ role: 'user', content: 'Improve this prompt.' }],
  });
  try {
    const rejectedResponse = await fetch(`${baseUrl}/api/openrouter/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'null' },
      body,
    });
    const acceptedResponse = await fetch(`${baseUrl}/api/openrouter/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'null',
        'x-canva-banana-desktop-token': DESKTOP_AUTH_TOKEN,
      },
      body,
    });

    assert.equal(rejectedResponse.status, 403);
    assert.equal(acceptedResponse.status, 200);
    assert.equal(calls.length, 1);
  } finally {
    server.close();
  }
});

test('tokened desktop backend requires the launch token for local and no-origin key-bearing routes', async () => {
  const calls = [];
  const server = createSecureBackendServer({
    env: { MOONSHOT_API_KEY: 'moonshot-secret', FAL_API_KEY: 'fal-secret', CANVA_BANANA_DESKTOP_AUTH_TOKEN: DESKTOP_AUTH_TOKEN },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ request_id: 'abc123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  const baseUrl = await listenOnRandomPort(server);
  try {
    const localOriginResponse = await fetch(`${baseUrl}/api/fal/proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: TRUSTED_ORIGIN,
        'x-fal-target-url': 'https://queue.fal.run/fal-ai/example',
      },
      body: '{}',
    });
    const noOriginResponse = await fetch(`${baseUrl}/api/fal/proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-fal-target-url': 'https://queue.fal.run/fal-ai/example',
      },
      body: '{}',
    });
    const acceptedResponse = await fetch(`${baseUrl}/api/fal/proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: TRUSTED_ORIGIN,
        'x-fal-target-url': 'https://queue.fal.run/fal-ai/example',
        'x-canva-banana-desktop-token': DESKTOP_AUTH_TOKEN,
      },
      body: '{}',
    });

    assert.equal(localOriginResponse.status, 403);
    assert.equal(noOriginResponse.status, 403);
    assert.equal(acceptedResponse.status, 200);
    assert.equal(acceptedResponse.headers.get('access-control-allow-origin'), TRUSTED_ORIGIN);
    assert.equal(calls.length, 1);
  } finally {
    server.close();
  }
});

test('trusted local origins get preflight access', async () => {
  const server = createSecureBackendServer({
    env: { MOONSHOT_API_KEY: 'moonshot-secret', FAL_API_KEY: 'fal-secret' },
    fetchImpl: async () => {
      throw new Error('fetch should not be called');
    },
  });
  const baseUrl = await listenOnRandomPort(server);
  try {
    const response = await fetch(`${baseUrl}/api/fal/proxy`, {
      method: 'OPTIONS',
      headers: {
        Origin: TRUSTED_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type, x-fal-target-url',
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), TRUSTED_ORIGIN);
  } finally {
    server.close();
  }
});

test('Fal asset fetch proxies Fal media downloads with the server key', async () => {
  const calls = [];
  const server = createSecureBackendServer({
    env: { MOONSHOT_API_KEY: 'moonshot-secret', FAL_API_KEY: 'fal-secret' },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response('asset-bytes', {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      });
    },
  });
  const baseUrl = await listenOnRandomPort(server);
  try {
    const assetUrl = encodeURIComponent('https://v3.fal.media/files/example.png');
    const response = await fetch(`${baseUrl}/api/fal/fetch-asset?url=${assetUrl}`, {
      headers: { Origin: TRUSTED_ORIGIN },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), TRUSTED_ORIGIN);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(await response.text(), 'asset-bytes');
    assert.equal(calls[0].url, 'https://v3.fal.media/files/example.png');
    assert.equal(calls[0].options.headers.Authorization, 'Key fal-secret');
  } finally {
    server.close();
  }
});

test('public health endpoint does not expose local identity or key status', async () => {
  const server = createSecureBackendServer({
    env: { FAL_API_KEY: 'fal-secret', OPENROUTER_API_KEY: 'openrouter-secret' },
  });
  const baseUrl = await listenOnRandomPort(server);
  try {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { Origin: TRUSTED_ORIGIN },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  } finally {
    server.close();
  }
});

test('dev health probe advertises secure backend identity and capabilities', async () => {
  const server = createSecureBackendServer({
    env: { FAL_API_KEY: 'fal-secret', OPENROUTER_API_KEY: 'openrouter-secret', CANVA_BANANA_DEV_SERVICE_HEALTH_TOKEN: DEV_SERVICE_HEALTH_TOKEN },
    devConfigState: buildDevHealthConfigState(),
  });
  const baseUrl = await listenOnRandomPort(server);
  try {
    const response = await fetch(`${baseUrl}/health`, {
      headers: {
        [DEV_SERVICE_HEALTH_PROBE_HEADER]: DEV_SERVICE_HEALTH_PROBE_VALUE,
        [DEV_SERVICE_HEALTH_TOKEN_HEADER]: DEV_SERVICE_HEALTH_TOKEN,
      },
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.protocolVersion, 2);
    assert.equal(payload.status, 'ok');
    assert.equal(payload.service, 'canva-banana-secure-backend');
    assert.equal(typeof payload.workspaceRoot, 'string');
    assert.deepEqual(payload.capabilities, {
      falProxy: true,
      falAssetFetch: true,
      moonshotIntent: true,
      openrouterChat: true,
    });
    assert.deepEqual(payload.readiness, {
      falProxy: true,
      falAssetFetch: true,
      moonshotIntent: false,
      openrouterChat: true,
    });
    assert.deepEqual(payload.auth, { desktopTokenRequired: false });
    assert.deepEqual(payload.configState, {
      verifiable: true,
      shellProvidedKeys: [],
      shellProvidedUnverifiableKeys: [],
      envFiles: [
        { fileName: '.env.local', exists: false },
        { fileName: '.env', exists: false },
      ],
      readiness: {
        falProxy: true,
        falAssetFetch: true,
        moonshotIntent: false,
        openrouterChat: true,
      },
      allowedOrigins: DEV_HEALTH_ALLOWED_ORIGINS,
      auth: { desktopTokenRequired: false },
      reuseContract: {
        version: 1,
        workspaceRoot: 'test-workspace',
        capabilities: {
          falProxy: true,
          falAssetFetch: true,
          moonshotIntent: true,
          openrouterChat: true,
        },
        readiness: {
          falProxy: true,
          falAssetFetch: true,
          moonshotIntent: false,
          openrouterChat: true,
        },
        config: {
          FAL_API_KEY: { present: true },
          MOONSHOT_API_KEY: { present: false },
          OPENROUTER_API_KEY: { present: true },
          SECURE_BACKEND_ALLOWED_ORIGINS: DEV_HEALTH_ALLOWED_ORIGINS,
          CANVA_BANANA_DESKTOP_AUTH_TOKEN: { present: false },
        },
        envFiles: [
          { fileName: '.env.local', exists: false },
          { fileName: '.env', exists: false },
        ],
      },
    });
    assert.deepEqual(payload.reuseContract, payload.configState.reuseContract);
    assert.equal(payload.falConfigured, undefined);
    assert.equal(payload.openrouterConfigured, undefined);
  } finally {
    server.close();
  }
});

test('dev health probe does not expose config metadata without the dev token', async () => {
  const server = createSecureBackendServer({
    env: { FAL_API_KEY: 'fal-secret', OPENROUTER_API_KEY: 'openrouter-secret', CANVA_BANANA_DEV_SERVICE_HEALTH_TOKEN: DEV_SERVICE_HEALTH_TOKEN },
    devConfigState: buildDevHealthConfigState(),
  });
  const baseUrl = await listenOnRandomPort(server);
  try {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { [DEV_SERVICE_HEALTH_PROBE_HEADER]: DEV_SERVICE_HEALTH_PROBE_VALUE },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  } finally {
    server.close();
  }
});

test('secure backend listens on localhost by default', () => {
  assert.deepEqual(getSecureBackendListenOptions({}), { port: 8787, host: '127.0.0.1' });
  assert.deepEqual(
    getSecureBackendListenOptions({ NODE_BACKEND_PORT: '9001', NODE_BACKEND_HOST: '0.0.0.0' }),
    { port: 9001, host: '0.0.0.0' },
  );
});
