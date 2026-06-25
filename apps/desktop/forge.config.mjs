import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = dirname(fileURLToPath(import.meta.url));
const entitlementsPath = resolve(desktopDir, 'entitlements.mac.plist');
const iconPath = resolve(desktopDir, 'assets/icon.icns'); // Points macOS packaging at the app icon.

export default {
  outDir: '../../out',
  packagerConfig: {
    name: 'The Institute',
    executableName: 'TheInstitute',
    icon: iconPath, // Uses the generated macOS ICNS file.
    appBundleId: 'com.theinstitute.app',
    appCategoryType: 'public.app-category.graphics-design',
    asar: true,
    osxSign: {
      identity: '-',
      identityValidation: false,
      optionsForFile: () => ({
        entitlements: entitlementsPath,
        hardenedRuntime: true,
      }),
      continueOnError: false,
    },
    extraResource: [
      'resources/web',
      'resources/python-backend',
    ],
    extendInfo: {
      CFBundleDisplayName: 'The Institute',
      NSMicrophoneUsageDescription: 'The Institute uses the microphone to record audio prompts.',
    },
    ignore: [
      /^\/resources(?:\/|$)/,
    ],
  },
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {
        name: 'The Institute',
        format: 'ULFO',
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
};
