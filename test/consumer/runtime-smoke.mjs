import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import { createSecureBackendServer, pythonBackendSourcePath } from '@canva-banana/runtime';

for (const file of ['pyproject.toml', 'uv.lock', 'src/uvpython_service/main.py']) await access(join(pythonBackendSourcePath, file));
let calls = 0;
const server = createSecureBackendServer({ env: { FAL_API_KEY: 'smoke-key', CANVA_BANANA_DESKTOP_AUTH_TOKEN: 'smoke-token' },
  fetchImpl: async (_input, init) => {
    calls += 1;
    assert.equal(new Headers(init.headers).get('authorization'), 'Key smoke-key');
    return new Response(JSON.stringify({ request_id: 'smoke-result' }), { headers: { 'content-type': 'application/json' } });
  },
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
try {
  const url = `http://127.0.0.1:${server.address().port}/api/fal/proxy`;
  const headers = { Origin: 'null', 'x-fal-target-url': 'https://fal.run/fal-ai/nano-banana-pro' };
  assert.equal((await fetch(url, { method: 'POST', headers })).status, 403);
  const response = await fetch(url, { method: 'POST', headers: { ...headers, 'x-canva-banana-desktop-token': 'smoke-token' }, body: '{}' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).request_id, 'smoke-result');
  assert.equal(calls, 1);
  console.log('Independent runtime smoke passed: explicit credentials, desktop authorization, provider transport and installed Python resources.');
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
