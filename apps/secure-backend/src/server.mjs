import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSecureBackendServer, getSecureBackendListenOptions, buildSecureBackendConfigState, resolveEnvWithFiles } from '@canva-banana/runtime';

export * from '@canva-banana/runtime';

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
if (import.meta.url === `file://${process.argv[1]}`) {
  const shellEnv = { ...process.env };
  const getEnv = () => resolveEnvWithFiles(repoRoot, shellEnv);
  const env = getEnv();
  const getDevConfigState = currentEnv => buildSecureBackendConfigState(repoRoot, currentEnv, shellEnv);
  const { port, host } = getSecureBackendListenOptions(env);
  const server = createSecureBackendServer({ env, getEnv, getDevConfigState });
  server.listen(port, host, () => {
    const displayHost = host === '127.0.0.1' ? 'localhost' : host;
    console.log(`Secure Node backend listening on http://${displayHost}:${port}`);
  });
}
