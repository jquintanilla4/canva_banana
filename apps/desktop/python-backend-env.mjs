import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const configuredPath = (value) => typeof value === 'string' ? value.trim() : '';

const expandHomePath = (value) => value === '~' ? homedir() : value.startsWith('~/') ? join(homedir(), value.slice(2)) : value;

export const buildPythonBackendEnv = ({ env, userDataDir, desktopAuthToken, host, port }) => {
  const legacyWorkDir = configuredPath(env.JIMENG_WORK_DIR);
  const canvasRootDir = configuredPath(env.JIMENG_CANVAS_ROOT_DIR)
    || (legacyWorkDir ? join(dirname(expandHomePath(legacyWorkDir)), '.jimeng-canvas') : join(userDataDir, '.jimeng-canvas'));
  return {
    ...env,
    CANVA_BANANA_ENV_DIR: userDataDir,
    CANVA_BANANA_DESKTOP_AUTH_TOKEN: desktopAuthToken,
    CANVA_BANANA_PYTHON_HOST: host,
    CANVA_BANANA_PYTHON_PORT: String(port),
    JIMENG_CANVAS_ROOT_DIR: canvasRootDir,
    JIMENG_CANVAS_WORK_DIR: configuredPath(env.JIMENG_CANVAS_WORK_DIR) || canvasRootDir,
    DREAMINA_CANVAS_STATE_DIR: configuredPath(env.DREAMINA_CANVAS_STATE_DIR) || join(expandHomePath(canvasRootDir), 'state'),
  };
};
