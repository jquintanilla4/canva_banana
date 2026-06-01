import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import { createSecureBackendServer, getSecureBackendListenOptions } from './server.mjs';

const TRUSTED_ORIGIN = 'http://localhost:3000';
const UNTRUSTED_ORIGIN = 'https://evil.example';

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

test('secure backend listens on localhost by default', () => {
  assert.deepEqual(getSecureBackendListenOptions({}), { port: 8787, host: '127.0.0.1' });
  assert.deepEqual(
    getSecureBackendListenOptions({ NODE_BACKEND_PORT: '9001', NODE_BACKEND_HOST: '0.0.0.0' }),
    { port: 9001, host: '0.0.0.0' },
  );
});
