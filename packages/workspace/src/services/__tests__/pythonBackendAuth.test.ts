import { afterEach, describe, expect, it } from 'vitest';
import { getPythonBackendAuthHeadersForUrl, PYTHON_BACKEND_DESKTOP_AUTH_TOKEN_HEADER } from '../pythonBackendAuth';

describe('pythonBackendAuth', () => {
  afterEach(() => {
    delete window.canvaBananaDesktop;
  });

  it('adds the desktop token only when the target matches the managed Python backend origin', () => {
    window.canvaBananaDesktop = {
      getRuntimeConfig: () => ({
        isDesktop: true,
        pythonBackendAuthToken: 'desktop-secret',
        pythonBackendAuthOrigin: 'http://localhost:8000/',
      }),
    };

    expect(getPythonBackendAuthHeadersForUrl('http://localhost:8000/api/jimeng/jobs')).toEqual({
      [PYTHON_BACKEND_DESKTOP_AUTH_TOKEN_HEADER]: 'desktop-secret',
    });
    expect(getPythonBackendAuthHeadersForUrl('https://remote-backend.example.test/api/jimeng/jobs')).toEqual({});
  });

  it('fails closed when the auth origin is missing or malformed', () => {
    window.canvaBananaDesktop = {
      getRuntimeConfig: () => ({
        isDesktop: true,
        pythonBackendAuthToken: 'desktop-secret',
        pythonBackendAuthOrigin: 'not a url',
      }),
    };

    expect(getPythonBackendAuthHeadersForUrl('http://localhost:8000/api/jimeng/jobs')).toEqual({});
    expect(getPythonBackendAuthHeadersForUrl('not a url')).toEqual({});
  });
});
