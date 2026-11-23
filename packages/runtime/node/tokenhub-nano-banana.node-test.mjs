import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { Readable } from 'node:stream';
import test from 'node:test';
import OpenAI from 'openai';

import { createSecureBackendServer } from './server.mjs';
import { createTokenHubImageHandlers } from './tokenhub.mjs';
import { TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL } from './tokenhub-nano-banana.mjs';

const payload = overrides => ({
  model: TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL,
  prompt: 'Edit the source',
  images: ['data:image/png;base64,eA=='],
  ...overrides,
});
const completion = (base64 = '/9j/2Q==') => ({
  created: 123, choices: [{ message: { content: `![image](data:image/jpeg;base64,${base64})` } }],
});
const withServer = async (options, run) => {
  const server = createSecureBackendServer({ env: { TOKENHUB_API_KEY: 'test-key' }, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const post = body => fetch(`http://127.0.0.1:${server.address().port}/api/tokenhub/images/edits`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' }, body: JSON.stringify(body),
  });
  try {
    await run(post);
  } finally {
    server.close();
  }
};

test('Nano Banana edit count defaults to one and accepts one through four serial n:1 calls', async () => {
  const requests = [];
  let active = 0;
  await withServer({ fetchImpl: async (_url, init) => {
    active += 1;
    assert.equal(active, 1);
    requests.push(JSON.parse(init.body));
    await new Promise(resolve => setImmediate(resolve));
    active -= 1;
    return Response.json(completion());
  } }, async post => {
    for (const n of [undefined, 1, 2, 3, 4]) {
      const response = await post(payload({ n }));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).data.length, n ?? 1);
    }
  });
  assert.equal(requests.length, 11);
  assert.ok(requests.every(request => request.n === 1));
  assert.ok(requests.every(request => request.extra_body === undefined));
});

test('Nano Banana edits validate count, controls, and canonical inline media before provider calls', async () => {
  let calls = 0;
  await withServer({ fetchImpl: async () => {
    calls += 1;
    return Response.json(completion());
  } }, async post => {
    const invalid = [
      ...[0, -1, 1.5, 5, '2', null].map(n => ({ n })),
      ...[undefined, [], 'data:image/png;base64,eA==', [null], [7], ['https://example.com/image.png'],
        ['data:image/gif;base64,eA=='], ['data:image/png;base64,'], ['data:image/png;base64,eA='],
        ['data:image/png;base64,eA==='], ['data:image/png;base64,ab=c'], ['data:image/png;base64,eB=='],
        ['data:image/png;base64,eAF='], ['data:image/png;base64,eA==\n']].map(images => ({ images })),
      { resolution: '8K' }, { thinking_level: 'low' }, { aspect_ratio: 'auto' },
    ];
    for (const fields of invalid) {
      const response = await post(payload(fields));
      assert.equal(response.status, 400, JSON.stringify(fields));
    }
    for (const type of ['png', 'jpeg', 'webp']) {
      const response = await post(payload({ images: [`data:image/${type};base64,eA==`], enable_web_search: 'obsolete', output_format: 'png' }));
      assert.equal(response.status, 200);
    }
  });
  assert.equal(calls, 3);
});

test('Nano Banana edit slots continue after failures and return successful JPEGs in slot order', async () => {
  let calls = 0;
  await withServer({ fetchImpl: async () => {
    calls += 1;
    if (calls === 1) return Response.json({ error: { message: 'First slot failed' } }, { status: 429 });
    if (calls === 3) return Response.json({ choices: [{ message: { content: 'No image' } }] });
    return Response.json(completion(calls === 2 ? '/9j/2Q==' : '/9j/4AAQ'), { headers: { 'x-request-id': `request-${calls}` } });
  } }, async post => {
    const response = await post(payload({ n: 4 }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      created: 123, request_id: 'request-2', data: [{ b64_json: '/9j/2Q==' }, { b64_json: '/9j/4AAQ' }],
    });
  });
  assert.equal(calls, 4);
});

test('Nano Banana edits surface the first provider error after every slot fails without retries or secrets', async () => {
  let calls = 0;
  await withServer({ fetchImpl: async () => {
    calls += 1;
    return Response.json({ error: { code: 'test-key', message: `${calls === 1 ? 'First' : 'Later'} failure for test-key` } }, {
      status: calls === 1 ? 422 : 429, headers: { 'x-request-id': 'request-test-key' },
    });
  } }, async post => {
    const response = await post(payload({ n: 3 }));
    assert.equal(response.status, 422);
    const result = await response.json();
    assert.match(result.detail, /First failure/);
    assert.equal(JSON.stringify(result).includes('test-key'), false);
    assert.equal(result.error.code, '[redacted]');
    assert.equal(result.error.requestID, 'request-[redacted]');
  });
  assert.equal(calls, 3);
});

test('Nano Banana edits normalize missing JPEG responses as useful errors', async () => {
  let calls = 0;
  await withServer({ fetchImpl: async () => {
    calls += 1;
    return Response.json({ choices: [{ message: { content: '![image](data:image/png;base64,eA==)' } }] }, {
      headers: { 'x-request-id': 'missing-image' },
    });
  } }, async post => {
    const response = await post(payload());
    assert.equal(response.status, 502);
    const result = await response.json();
    assert.equal(result.detail, 'TokenHub did not return a JPEG image in the chat response.');
    assert.equal(result.error.requestID, 'missing-image');
  });
  assert.equal(calls, 1);
});

test('Nano Banana keeps a single edit admission guard across all serial slots', async () => {
  const started = Promise.withResolvers();
  const release = Promise.withResolvers();
  let calls = 0;
  await withServer({ fetchImpl: async () => {
    calls += 1;
    if (calls === 2) {
      started.resolve();
      await release.promise;
    }
    return Response.json(completion());
  } }, async post => {
    const first = post(payload({ n: 3 }));
    await started.promise;
    try {
      assert.equal((await post(payload())).status, 429);
    } finally {
      release.resolve();
    }
    assert.equal((await first).status, 200);
    assert.equal((await post(payload())).status, 200);
  });
  assert.equal(calls, 4);
});

test('Nano Banana client cancellation aborts the active call, stops queued slots, and releases admission', async () => {
  const started = Promise.withResolvers();
  const release = Promise.withResolvers();
  let calls = 0;
  let providerSignal;
  const handlers = createTokenHubImageHandlers({
    clientFactory: options => new OpenAI({ ...options, fetch: async (_url, init) => {
      calls += 1;
      providerSignal = init.signal;
      started.resolve();
      await release.promise;
      return Response.json(completion());
    } }),
    sendJson: (response, status, body) => { response.status = status; response.body = body; },
  });
  const request = Readable.from([Buffer.from(JSON.stringify(payload({ n: 4 })))]);
  request.headers = {};
  const response = new EventEmitter();
  const running = handlers.handleEdit(request, response, { TOKENHUB_API_KEY: 'test-key' }, {});
  await started.promise;
  response.destroyed = true;
  response.emit('close');
  assert.equal(providerSignal.aborted, true);
  release.resolve();
  await running;
  assert.equal(calls, 1);
  const nextResponse = new EventEmitter();
  const nextRequest = Readable.from([Buffer.from(JSON.stringify(payload()))]);
  nextRequest.headers = {};
  await handlers.handleEdit(nextRequest, nextResponse, { TOKENHUB_API_KEY: 'test-key' }, {});
  assert.equal(nextResponse.status, 200);
  assert.equal(calls, 2);
});
