import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPythonBackendEnv } from './python-backend-env.mjs';

const buildEnv = (env = {}) => buildPythonBackendEnv({
  env,
  userDataDir: '/app-support',
  desktopAuthToken: 'launch-nonce',
  host: '127.0.0.1',
  port: 8123,
});

describe('managed Python backend environment', () => {
  it('keeps Canvas profile and recoverable jobs in their existing writable desktop locations', () => {
    expect(buildEnv()).toMatchObject({
      JIMENG_CANVAS_ROOT_DIR: '/app-support/.jimeng-canvas',
      JIMENG_CANVAS_WORK_DIR: '/app-support/.jimeng-canvas',
      DREAMINA_CANVAS_STATE_DIR: '/app-support/.jimeng-canvas/state',
      CANVA_BANANA_ENV_DIR: '/app-support',
      CANVA_BANANA_DESKTOP_AUTH_TOKEN: 'launch-nonce',
      CANVA_BANANA_PYTHON_HOST: '127.0.0.1',
      CANVA_BANANA_PYTHON_PORT: '8123',
    });
  });

  it('honors each explicit Canvas path independently', () => {
    expect(buildEnv({
      JIMENG_CANVAS_ROOT_DIR: ' /canvas/root ',
      JIMENG_CANVAS_WORK_DIR: ' /canvas/jobs ',
      DREAMINA_CANVAS_STATE_DIR: ' /canvas/login ',
      JIMENG_CANVAS_CLI_PATH: '/custom/dreamina-canvas',
      JIMENG_WORK_DIR: '/old/work',
      CANVA_BANANA_DESKTOP_AUTH_TOKEN: 'stale-nonce',
    })).toMatchObject({
      JIMENG_CANVAS_ROOT_DIR: '/canvas/root',
      JIMENG_CANVAS_WORK_DIR: '/canvas/jobs',
      DREAMINA_CANVAS_STATE_DIR: '/canvas/login',
      JIMENG_CANVAS_CLI_PATH: '/custom/dreamina-canvas',
      CANVA_BANANA_DESKTOP_AUTH_TOKEN: 'launch-nonce',
    });
  });

  it('uses a relocated Canvas root for default work and state paths', () => {
    expect(buildEnv({ JIMENG_CANVAS_ROOT_DIR: '~/canvas' })).toMatchObject({
      JIMENG_CANVAS_ROOT_DIR: '~/canvas',
      JIMENG_CANVAS_WORK_DIR: '~/canvas',
      DREAMINA_CANVAS_STATE_DIR: join(homedir(), 'canvas/state'),
    });
  });

  it('preserves the Canvas data location derived from a previous work directory', () => {
    expect(buildEnv({ JIMENG_WORK_DIR: '/old/project/work' })).toMatchObject({
      JIMENG_CANVAS_ROOT_DIR: '/old/project/.jimeng-canvas',
      JIMENG_CANVAS_WORK_DIR: '/old/project/.jimeng-canvas',
      DREAMINA_CANVAS_STATE_DIR: '/old/project/.jimeng-canvas/state',
    });
    expect(buildEnv({ JIMENG_WORK_DIR: '~/project/work' }).JIMENG_CANVAS_ROOT_DIR)
      .toBe(join(homedir(), 'project/.jimeng-canvas'));
  });

  it('never treats the retired executable override as a Canvas executable', () => {
    const result = buildEnv({ JIMENG_CLI_PATH: '/legacy/dreamina' });
    expect(result.JIMENG_CANVAS_CLI_PATH).toBeUndefined();
    expect(result.JIMENG_CANVAS_ROOT_DIR).toBe('/app-support/.jimeng-canvas');
  });
});
