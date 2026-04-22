import { fal } from '@fal-ai/client'; // Fal SDK client.
import { getFalProxyUrl } from '../secureBackendService'; // Secure Node proxy URL.

let falConfigured = false; // Track one-time SDK config.

export const ensureFalClientConfigured = () => { // Configure Fal client once.
  if (!falConfigured) {
    fal.config({
      credentials: undefined, // Keep the Fal key out of browser bundles.
      proxyUrl: getFalProxyUrl(),
      suppressLocalCredentialsWarning: true,
    });
    falConfigured = true; // Flip guard after config.
  }
};
