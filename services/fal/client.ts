import { fal } from '@fal-ai/client'; // Fal SDK client.

export const ensureFalApiKey = () => { // Ensure we have credentials before calls.
  const key = process.env.FAL_API_KEY; // Read API key from env.
  if (!key) {
    throw new Error('FAL_API_KEY environment variable is not set'); // Fail fast when missing.
  }
  return key; // Return the usable key.
};

let falConfigured = false; // Track one-time SDK config.

export const ensureFalClientConfigured = () => { // Configure Fal client once.
  const key = ensureFalApiKey(); // Resolve credentials.
  if (!falConfigured) {
    const proxyUrl = process.env.FAL_API_URL; // Optional proxy override.
    fal.config({
      credentials: key,
      suppressLocalCredentialsWarning: true,
      ...(proxyUrl ? { proxyUrl } : {}),
    });
    falConfigured = true; // Flip guard after config.
  }
};
