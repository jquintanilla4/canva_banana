import { logFalEvent } from './logging'; // Fal debug logger.
import { FalPhaseError } from './errors'; // Phase-aware error wrapper.
import type { FalGeneratedImageMetadata } from './types'; // Shared result metadata.
import { getFalAssetFetchUrl, getSecureBackendAuthHeadersForUrl } from '../secureBackendService'; // Secure Fal asset proxy helpers.

const FAL_HOSTED_URL_REGEX = /^https?:\/\/[^/]*fal\.(ai|run|media)\b/i; // Detect Fal-hosted URLs.
const FAL_ASSET_RETRY_DELAYS_MS = [400, 900, 1800] as const; // Retry transient downloads for 3.1 seconds total.
const RETRYABLE_DOWNLOAD_STATUSES = new Set([408, 429, 502, 503, 504]); // Retry only temporary HTTP failures.

type FalImageFile = {
  url: string; // Provider image URL.
  content_type?: string; // Provider MIME type.
  file_name?: string; // Provider file name.
  file_size?: number; // Provider file byte size.
  width?: number; // Provider output width.
  height?: number; // Provider output height.
}; // Fal image output shape.

export const normalizeFalImageMetadata = (image: FalImageFile): FalGeneratedImageMetadata => ({
  url: image.url,
  ...(typeof image.content_type === 'string' ? { contentType: image.content_type } : {}),
  ...(typeof image.file_name === 'string' ? { fileName: image.file_name } : {}),
  ...(typeof image.file_size === 'number' ? { fileSize: image.file_size } : {}),
  ...(typeof image.width === 'number' ? { width: image.width } : {}),
  ...(typeof image.height === 'number' ? { height: image.height } : {}),
}); // Normalize snake_case Fal fields.

const wait = (delayMs: number): Promise<void> => new Promise(resolve => {
  window.setTimeout(resolve, delayMs);
}); // Pause between transient download attempts.

const discardResponseBody = async (response: Response): Promise<void> => {
  try {
    await response.body?.cancel();
  } catch {
    return; // Cleanup failures must not replace the download result or stop a retry.
  }
}; // Release connections for HTTP responses whose bodies will not be read.

const fetchImageWithRetry = async (requestUrl: string, hostedByFal: boolean): Promise<Response> => {
  const headers = getSecureBackendAuthHeadersForUrl(requestUrl); // Reuse scoped desktop authentication on every attempt.

  for (let attempt = 0; attempt <= FAL_ASSET_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(requestUrl, { headers });
      const retryDelayMs = FAL_ASSET_RETRY_DELAYS_MS[attempt];
      if (!RETRYABLE_DOWNLOAD_STATUSES.has(response.status) || retryDelayMs === undefined) {
        return response; // Return success and permanent or exhausted failures immediately.
      }
      await discardResponseBody(response); // Do not leave the failed request buffering during backoff.
      if (hostedByFal) {
        logFalEvent('info', 'fal-storage', 'Retrying hosted image download', {
          hosted: true,
          attempt: attempt + 2,
          maxAttempts: FAL_ASSET_RETRY_DELAYS_MS.length + 1,
          status: response.status,
          delayMs: retryDelayMs,
        });
      }
      await wait(retryDelayMs);
    } catch (error) {
      const retryDelayMs = FAL_ASSET_RETRY_DELAYS_MS[attempt];
      if (retryDelayMs === undefined) {
        throw error; // Preserve the final network error for the existing message.
      }
      if (hostedByFal) {
        logFalEvent('info', 'fal-storage', 'Retrying hosted image download', {
          hosted: true,
          attempt: attempt + 2,
          maxAttempts: FAL_ASSET_RETRY_DELAYS_MS.length + 1,
          error: error instanceof Error ? error.message : String(error),
          delayMs: retryDelayMs,
        });
      }
      await wait(retryDelayMs);
    }
  }

  throw new Error('Fal image download retry loop ended unexpectedly.'); // Keep TypeScript aware that every path returns or throws.
};

export const extractInlineData = async (url: string): Promise<string> => { // Convert URLs to data URIs.
  if (url.startsWith('data:')) { // Data URLs are already inline.
    return url; // Skip network fetch.
  }

  let requestUrl = url; // Fetch target, proxied when Fal-hosted.
  const hostedByFal = FAL_HOSTED_URL_REGEX.test(url); // Reuse host detection for proxying and diagnostics.

  if (hostedByFal) { // Keep Fal asset auth server-side.
    requestUrl = getFalAssetFetchUrl(url);
    logFalEvent('outbound', 'fal-storage', 'Fetching hosted image', { hosted: true });
  }

  let response: Response; // Track fetch response.
  try {
    response = await fetchImageWithRetry(requestUrl, hostedByFal);
  } catch (error) {
    if (hostedByFal) {
      logFalEvent('error', 'fal-storage', 'Failed to fetch hosted image', {
        hosted: true,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch image from Fal.ai response. ${message}`);
  }

  if (!response.ok) {
    if (hostedByFal) {
      logFalEvent('error', 'fal-storage', 'Failed to fetch hosted image', {
        hosted: true,
        status: response.status,
      });
    }
    await discardResponseBody(response); // The error path does not inspect the response payload.
    throw new Error(`Failed to download image from Fal.ai response. HTTP ${response.status}`);
  }
  if (hostedByFal) {
    logFalEvent('inbound', 'fal-storage', 'Fetched hosted image', {
      hosted: true,
      status: response.status,
    });
  }
  const blob = await response.blob(); // Convert to blob for FileReader.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Unable to read image blob.'));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error('Failed to read image blob.'));
    reader.readAsDataURL(blob);
  });
};

export const runFalDownloadStep = async <T>(
  requestId: string | undefined,
  action: () => Promise<T>,
): Promise<T> => {
  try {
    return await action();
  } catch (error) {
    throw new FalPhaseError('downloading', error, requestId);
  }
}; // Preserve download phase when response parsing fails.
