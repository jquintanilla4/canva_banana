import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const BUILD_VARIANT_SCHEMA_VERSION = 1;
export const BUILD_VARIANT_FILE_NAME = 'build-variant.json';

const timezoneQualifiedTimestampPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:Z|[+-]\d{2}:\d{2})$/;

export const normalizeTimestamp = (value, label) => {
  const match = typeof value === 'string' ? timezoneQualifiedTimestampPattern.exec(value) : null;
  if (!match) {
    throw new Error(`${label} must be an ISO-8601 timestamp with a timezone, such as 2026-09-30T23:59:59-07:00.`);
  }
  const [, year, month, day, hour, minute, second = '0', milliseconds = '0'] = match;
  const localDate = new Date(0);
  localDate.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
  localDate.setUTCHours(Number(hour), Number(minute), Number(second), Number(milliseconds.padEnd(3, '0')));
  const hasValidCalendarFields = localDate.getUTCFullYear() === Number(year)
    && localDate.getUTCMonth() === Number(month) - 1
    && localDate.getUTCDate() === Number(day)
    && localDate.getUTCHours() === Number(hour)
    && localDate.getUTCMinutes() === Number(minute)
    && localDate.getUTCSeconds() === Number(second);
  const timestampMs = Date.parse(value);
  if (!hasValidCalendarFields || !Number.isFinite(timestampMs)) {
    throw new Error(`${label} is not a valid timestamp.`);
  }
  return new Date(timestampMs).toISOString();
};

export const createBuildVariantMetadata = ({ variant, expiresAt, nowMs = Date.now() }) => {
  if (variant === 'regular') {
    return { schemaVersion: BUILD_VARIANT_SCHEMA_VERSION, variant: 'regular' };
  }
  if (variant !== 'trial') {
    throw new Error(`Unknown desktop build variant "${variant}".`);
  }

  const normalizedExpiresAt = normalizeTimestamp(expiresAt, '--expires-at');
  if (Date.parse(normalizedExpiresAt) <= nowMs) {
    throw new Error('--expires-at must be later than the current time.');
  }
  return {
    schemaVersion: BUILD_VARIANT_SCHEMA_VERSION,
    variant: 'trial',
    expiresAt: normalizedExpiresAt,
    builtAt: new Date(nowMs).toISOString(),
  };
};

export const parseBuildVariantMetadata = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Desktop build metadata must be an object.');
  }
  if (value.schemaVersion !== BUILD_VARIANT_SCHEMA_VERSION) {
    throw new Error(`Unsupported desktop build metadata schema "${String(value.schemaVersion)}".`);
  }
  if (value.variant === 'regular') {
    if ('expiresAt' in value || 'builtAt' in value) {
      throw new Error('Regular desktop build metadata must not contain trial timestamps.');
    }
    return { schemaVersion: BUILD_VARIANT_SCHEMA_VERSION, variant: 'regular' };
  }
  if (value.variant !== 'trial') {
    throw new Error(`Unknown desktop build variant "${String(value.variant)}".`);
  }

  const expiresAt = normalizeTimestamp(value.expiresAt, 'Trial expiration');
  const builtAt = normalizeTimestamp(value.builtAt, 'Trial build time');
  if (Date.parse(builtAt) >= Date.parse(expiresAt)) {
    throw new Error('Trial expiration must be later than its build time.');
  }
  return {
    schemaVersion: BUILD_VARIANT_SCHEMA_VERSION,
    variant: 'trial',
    expiresAt,
    builtAt,
  };
};

export const readBuildVariantMetadata = async metadataPath => {
  const content = await readFile(metadataPath, 'utf8');
  let value;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error('Desktop build metadata is not valid JSON.');
  }
  return parseBuildVariantMetadata(value);
};

export const writeBuildVariantMetadata = async (metadataPath, value) => {
  const metadata = parseBuildVariantMetadata(value);
  await mkdir(dirname(metadataPath), { recursive: true });
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o644 });
};
