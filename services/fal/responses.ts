import { ensureFalApiKey } from './client'; // Fal credentials helper.
import { logFalEvent } from './logging'; // Fal debug logger.

const FAL_HOSTED_URL_REGEX = /^https?:\/\/[^/]*fal\.(ai|run)\b/i; // Detect Fal-hosted URLs.

export const extractInlineData = async (url: string): Promise<string> => { // Convert URLs to data URIs.
  if (url.startsWith('data:')) { // Data URLs are already inline.
    return url; // Skip network fetch.
  }

  const requestOptions: RequestInit = {}; // Build fetch options.

  if (FAL_HOSTED_URL_REGEX.test(url)) { // Add auth for Fal-hosted assets.
    requestOptions.headers = {
      Authorization: `Key ${ensureFalApiKey()}`,
    };
    logFalEvent('outbound', 'fal-storage', 'Fetching hosted image', { url });
  }

  let response: Response; // Track fetch response.
  try {
    response = await fetch(url, requestOptions);
  } catch (error) {
    if (FAL_HOSTED_URL_REGEX.test(url)) {
      logFalEvent('error', 'fal-storage', 'Failed to fetch hosted image', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch image from Fal.ai response. ${message}`);
  }

  if (!response.ok) {
    if (FAL_HOSTED_URL_REGEX.test(url)) {
      logFalEvent('error', 'fal-storage', 'Failed to fetch hosted image', {
        url,
        status: response.status,
      });
    }
    throw new Error(`Failed to download image from Fal.ai response. HTTP ${response.status}`);
  }
  if (FAL_HOSTED_URL_REGEX.test(url)) {
    logFalEvent('inbound', 'fal-storage', 'Fetched hosted image', {
      url,
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
