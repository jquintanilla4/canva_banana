import { afterEach, describe, expect, it } from 'vitest';
import { DESKTOP_AUTH_TOKEN_HEADER, getFalAssetFetchUrl, getFalProxyUrl, getSecureBackendAuthHeaders } from '../secureBackendService';

describe('secureBackendService', () => {
  afterEach(() => {
    delete window.canvaBananaDesktop;
  });

  it('adds the desktop auth token to secure backend helper outputs', () => {
    window.canvaBananaDesktop = {
      getRuntimeConfig: () => ({
        isDesktop: true,
        secureBackendApiBaseUrl: 'http://localhost:9876/',
        secureBackendAuthToken: 'desktop-secret',
      }),
    };

    expect(getSecureBackendAuthHeaders()).toEqual({ [DESKTOP_AUTH_TOKEN_HEADER]: 'desktop-secret' });
    expect(getFalProxyUrl()).toBe('http://localhost:9876/api/fal/proxy');
    expect(getFalAssetFetchUrl('https://v3.fal.media/files/example.png')).toBe(
      'http://localhost:9876/api/fal/fetch-asset?url=https%3A%2F%2Fv3.fal.media%2Ffiles%2Fexample.png',
    );
  });

  it('does not add the desktop auth token to custom Fal proxy origins', () => {
    window.canvaBananaDesktop = {
      getRuntimeConfig: () => ({
        isDesktop: true,
        secureBackendApiBaseUrl: 'http://localhost:9876/',
        secureBackendAuthToken: 'desktop-secret',
        falApiUrl: 'https://fal-proxy.example.test/api/fal/proxy',
      }),
    };

    expect(getFalProxyUrl()).toBe('https://fal-proxy.example.test/api/fal/proxy');
  });

  it('leaves browser dev URLs unchanged when no desktop token exists', () => {
    expect(getSecureBackendAuthHeaders()).toEqual({});
    expect(getFalProxyUrl()).toBe('http://localhost:8787/api/fal/proxy');
  });
});
