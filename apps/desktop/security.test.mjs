import { describe, expect, it } from 'vitest';
import { getDevRendererUrl, isAllowedAudioPermissionRequest } from './security.mjs';

describe('desktop security helpers', () => {
  it('ignores dev renderer overrides in packaged builds', () => {
    const env = { ELECTRON_RENDERER_URL: 'https://renderer.example.test' };

    expect(getDevRendererUrl(env, true)).toBeUndefined();
  });

  it('allows only local dev renderer overrides in unpackaged builds', () => {
    expect(getDevRendererUrl({ ELECTRON_RENDERER_URL: 'http://localhost:3000' }, false)).toBe('http://localhost:3000');
    expect(getDevRendererUrl({ ELECTRON_RENDERER_URL: 'http://127.0.0.1:3000' }, false)).toBe('http://127.0.0.1:3000');
    expect(getDevRendererUrl({ ELECTRON_RENDERER_URL: 'http://[::1]:3000' }, false)).toBe('http://[::1]:3000');
    expect(getDevRendererUrl({ ELECTRON_RENDERER_URL: 'file:///tmp/canva-banana/index.html' }, false)).toBeUndefined();
    expect(getDevRendererUrl({ ELECTRON_RENDERER_URL: 'https://renderer.example.test' }, false)).toBeUndefined();
    expect(getDevRendererUrl({ ELECTRON_RENDERER_URL: 'notaurl' }, false)).toBeUndefined();
  });

  it('allows only audio media permission requests', () => {
    expect(isAllowedAudioPermissionRequest('media', { mediaTypes: ['audio'] })).toBe(true);
    expect(isAllowedAudioPermissionRequest('media', { mediaTypes: ['video'] })).toBe(false);
    expect(isAllowedAudioPermissionRequest('media', { mediaTypes: ['audio', 'video'] })).toBe(false);
    expect(isAllowedAudioPermissionRequest('notifications', { mediaTypes: ['audio'] })).toBe(false);
  });
});
