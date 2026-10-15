import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSecureBackendServer, loadEnvFiles, getSecureBackendListenOptions, buildSecureBackendConfigState } from '@canva-banana/runtime';

export * from '@canva-banana/runtime';

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
if (import.meta.url === `file://${process.argv[1]}`) {
  const shellEnv = { ...process.env };
  loadEnvFiles(repoRoot);
  const { port, host } = getSecureBackendListenOptions();
  const devConfigState = buildSecureBackendConfigState(repoRoot, process.env, shellEnv);
  const server = createSecureBackendServer({ devConfigState });
  server.listen(port, host, () => {
    const displayHost = host === '127.0.0.1' ? 'localhost' : host;
    console.log(`Secure Node backend listening on http://${displayHost}:${port}`);
  });
}
