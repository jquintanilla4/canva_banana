import { join } from 'node:path';
import { BUILD_VARIANT_FILE_NAME, readBuildVariantMetadata } from './build-variant.mjs';
import {
  createTrialMonitor,
  evaluateTrial,
  readTrialState,
  writeTrialStateAtomic,
} from './trial-policy.mjs';

const formatRemainingTime = remainingMs => {
  const remainingMinutes = Math.max(1, Math.ceil(remainingMs / (60 * 1000)));
  if (remainingMinutes >= 48 * 60) return `${Math.ceil(remainingMinutes / (24 * 60))} days`;
  if (remainingMinutes >= 120) return `${Math.ceil(remainingMinutes / 60)} hours`;
  return `${remainingMinutes} ${remainingMinutes === 1 ? 'minute' : 'minutes'}`;
};

const getBlockDialogCopy = status => {
  if (status === 'expired') {
    return {
      message: 'This trial has expired.',
      detail: 'Contact the provider for a full version.',
    };
  }
  if (status === 'clockRollback' || status === 'stateError') {
    return {
      message: 'This trial cannot verify the current date.',
      detail: status === 'clockRollback'
        ? 'The system clock appears to have moved backward. Contact the provider for a full version.'
        : 'The saved trial clock is unavailable. Contact the provider for a new version.',
    };
  }
  return {
    message: 'This trial cannot verify its configuration.',
    detail: 'Contact the provider for a new version.',
  };
};

export const createDesktopTrialGate = ({
  isPackaged,
  desktopDir,
  getUserDataPath,
  showMessageBox,
  hideApp,
  quit,
  now = Date.now,
  onError = console.error,
}) => {
  const metadataPath = join(desktopDir, 'generated', BUILD_VARIANT_FILE_NAME);
  const statePath = () => join(getUserDataPath(), 'trial-state.json');
  let monitor = null;
  let blockPromise = null;
  let denied = false;

  const block = result => {
    denied = true; // Window-opening paths must fail closed before the native dialog finishes.
    if (blockPromise) return blockPromise;
    blockPromise = (async () => {
      monitor?.stop();
      try {
        try {
          hideApp();
        } catch (error) {
          onError('Trial app could not be hidden.', error);
        }
        try {
          await showMessageBox({
            type: 'warning',
            buttons: ['Quit'],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
            title: 'The Institute Trial',
            ...getBlockDialogCopy(result.status),
          });
        } catch (error) {
          onError('Trial blocking dialog could not be shown.', error);
        }
      } finally {
        quit(); // Dialog failure must not strand a denied single-instance process.
      }
      return false;
    })();
    return blockPromise;
  };

  const initialize = async () => {
    if (!isPackaged) return true; // Development builds never consume packaged trial metadata.

    let metadata;
    try {
      metadata = await readBuildVariantMetadata(metadataPath);
    } catch (error) {
      onError('Desktop build metadata could not be verified.', error);
      return block({ status: 'configurationError', error });
    }
    if (metadata.variant === 'regular') return true;

    let storedState;
    try {
      storedState = await readTrialState(statePath());
    } catch (error) {
      onError('Trial clock state could not be verified.', error);
      return block({ status: 'stateError', error });
    }

    const storedMaxSeenAtMs = storedState ? Date.parse(storedState.maxSeenAt) : null;
    let evaluation = evaluateTrial({ metadata, nowMs: now(), maxSeenAtMs: storedMaxSeenAtMs });
    if (evaluation.status !== 'active') return block(evaluation);

    try {
      await writeTrialStateAtomic(statePath(), evaluation.maxSeenAtMs);
    } catch (error) {
      onError('Trial clock state could not be saved.', error);
      return block({ status: 'stateError', error });
    }

    const formattedExpiration = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'full',
      timeStyle: 'long',
    }).format(new Date(evaluation.expiresAtMs));
    try {
      await showMessageBox({
        type: 'info',
        buttons: ['Continue'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
        title: 'The Institute Trial',
        message: 'This is a time-limited trial.',
        detail: `This trial expires on ${formattedExpiration}. ${formatRemainingTime(evaluation.expiresAtMs - now())} remaining. After that, contact the provider for a full version.`,
      });
    } catch (error) {
      onError('Trial launch notice could not be shown.', error);
      return block({ status: 'stateError', error });
    }

    evaluation = evaluateTrial({ metadata, nowMs: now(), maxSeenAtMs: evaluation.maxSeenAtMs });
    if (evaluation.status !== 'active') return block(evaluation);
    try {
      await writeTrialStateAtomic(statePath(), evaluation.maxSeenAtMs);
    } catch (error) {
      onError('Trial clock state could not be saved.', error);
      return block({ status: 'stateError', error });
    }

    monitor = createTrialMonitor({
      metadata,
      initialMaxSeenAtMs: evaluation.maxSeenAtMs,
      persistMaxSeenAt: maxSeenAtMs => writeTrialStateAtomic(statePath(), maxSeenAtMs),
      onBlocked: block,
      now,
    });
    monitor.start();
    return true;
  };

  return {
    initialize,
    check: async () => {
      if (denied) return false;
      try {
        const result = await monitor?.check();
        return !denied && (!result || result.status === 'active');
      } catch (error) {
        onError('Trial status could not be verified.', error);
        return block({ status: 'stateError', error });
      }
    },
    stop: () => monitor?.stop(),
    flush: () => monitor?.flush(),
  };
};
