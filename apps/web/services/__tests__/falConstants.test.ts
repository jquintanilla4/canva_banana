import { describe, expect, it } from 'vitest';
import { buildFalDisplayError } from '../falConstants';

describe('fal error formatting', () => {
  it('treats HTTP 408 as a provider timeout', () => {
    expect(buildFalDisplayError('Request failed with HTTP 408.')).toBe(
      'The generation server is responding slowly on the provider side. Please try again in a moment.',
    );
  });

  it('treats upload timeouts as upload failures', () => {
    expect(buildFalDisplayError('Request timed out.', undefined, { phase: 'uploading' })).toBe(
      'Upload to Fal storage is taking too long. Check your upload connection or try smaller media.',
    );
  });

  it('treats pre-queue submit timeouts as missing queue status', () => {
    expect(buildFalDisplayError('Request failed with HTTP 408.', undefined, { phase: 'submitting', hasRequestId: false })).toBe(
      'Fal did not return queue status before timing out. Please try again in a moment.',
    );
  });

  it('keeps accepted request timeouts as provider-side failures', () => {
    expect(buildFalDisplayError('Request failed with HTTP 504.', undefined, { phase: 'processing', hasRequestId: true })).toBe(
      'The generation server is responding slowly on the provider side. Please try again in a moment.',
    );
  });
});
