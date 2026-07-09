import { logFalEvent } from './logging'; // Fal debug logger.
import { FalPhaseError } from './errors'; // Phase-aware error wrapper.
import type { FalGeneratedImageMetadata } from './types'; // Shared result metadata.
import { getFalAssetFetchUrl, getSecureBackendAuthHeadersForUrl } from '../secureBackendService'; // Secure Fal asset proxy helpers.

const FAL_HOSTED_URL_REGEX = /^https?:\/\/[^/]*fal\.(ai|run|media)\b/i; // Detect Fal-hosted URLs.

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

export const extractInlineData = async (url: string): Promise<string> => { // Convert URLs to data URIs.
  if (url.startsWith('data:')) { // Data URLs are already inline.
    return url; // Skip network fetch.
  }

  let requestUrl = url; // Fetch target, proxied when Fal-hosted.

  if (FAL_HOSTED_URL_REGEX.test(url)) { // Keep Fal asset auth server-side.
    requestUrl = getFalAssetFetchUrl(url);
    logFalEvent('outbound', 'fal-storage', 'Fetching hosted image', { hosted: true });
  }

  let response: Response; // Track fetch response.
  try {
    response = await fetch(requestUrl, { headers: getSecureBackendAuthHeadersForUrl(requestUrl) });
  } catch (error) {
    if (FAL_HOSTED_URL_REGEX.test(url)) {
      logFalEvent('error', 'fal-storage', 'Failed to fetch hosted image', {
        hosted: true,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch image from Fal.ai response. ${message}`);
  }

  if (!response.ok) {
    if (FAL_HOSTED_URL_REGEX.test(url)) {
      logFalEvent('error', 'fal-storage', 'Failed to fetch hosted image', {
        hosted: true,
        status: response.status,
      });
    }
    throw new Error(`Failed to download image from Fal.ai response. HTTP ${response.status}`);
  }
  if (FAL_HOSTED_URL_REGEX.test(url)) {
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
