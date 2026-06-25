import { describe, expect, it } from 'vitest';
import { getDevRendererUrl, isAllowedAudioPermissionRequest } from './security.mjs';

describe('desktop security helpers', () => {
  it('ignores dev renderer overrides in packaged builds', () => {
    const env = { ELECTRON_RENDERER_URL: 'https://renderer.example.test' };

    expect(getDevRendererUrl(env, true)).toBeUndefined();
    expect(getDevRendererUrl(env, false)).toBe('https://renderer.example.test');
  });

  it('allows only audio media permission requests', () => {
    expect(isAllowedAudioPermissionRequest('media', { mediaTypes: ['audio'] })).toBe(true);
    expect(isAllowedAudioPermissionRequest('media', { mediaTypes: ['video'] })).toBe(false);
    expect(isAllowedAudioPermissionRequest('media', { mediaTypes: ['audio', 'video'] })).toBe(false);
    expect(isAllowedAudioPermissionRequest('notifications', { mediaTypes: ['audio'] })).toBe(false);
  });
});
