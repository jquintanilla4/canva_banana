import { createBuildVariantMetadata } from '../build-variant.mjs';

export const parseBuildVariantArgs = (args, { nowMs = Date.now() } = {}) => {
  let isTrial = false;
  let expiresAt;
  const passthroughArgs = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--trial') {
      isTrial = true;
      continue;
    }
    if (arg === '--expires-at') {
      const value = args[index + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('--expires-at requires a timestamp value.');
      }
      expiresAt = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--expires-at=')) {
      expiresAt = arg.slice('--expires-at='.length);
      if (!expiresAt) {
        throw new Error('--expires-at requires a timestamp value.');
      }
      continue;
    }
    passthroughArgs.push(arg);
  }

  if (!isTrial && expiresAt !== undefined) {
    throw new Error('--expires-at can only be used with a trial build.');
  }
  const metadata = createBuildVariantMetadata({
    variant: isTrial ? 'trial' : 'regular',
    expiresAt,
    nowMs,
  });
  return { metadata, passthroughArgs };
};

export const assertTrialBuildTargetPlatform = (metadata, targetPlatform) => {
  if (metadata.variant === 'trial' && targetPlatform !== 'darwin') {
    throw new Error('Trial desktop builds are only supported for macOS (--platform=darwin).');
  }
};

export const getBuildVariantArgs = metadata => (
  metadata.variant === 'trial'
    ? ['--trial', `--expires-at=${metadata.expiresAt}`]
    : []
);
