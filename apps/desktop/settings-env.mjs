import { existsSync, renameSync, writeFileSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const DESKTOP_SETTING_KEYS = [
  'GEMINI_API_KEY',
  'FAL_API_KEY',
  'MOONSHOT_API_KEY',
  'OPENROUTER_API_KEY',
  'ARK_API_KEY',
  'VOLCENGINE_ACCESS_KEY',
  'VOLCENGINE_SECRET_KEY',
  'TOS_BUCKET_NAME',
  'TOS_REGION',
  'JIMENG_CLI_PATH',
];

export const REQUIRED_DESKTOP_SETTING_KEYS = DESKTOP_SETTING_KEYS.filter(key => key !== 'JIMENG_CLI_PATH' && key !== 'OPENROUTER_API_KEY');
export const SECRET_DESKTOP_SETTING_KEYS = DESKTOP_SETTING_KEYS.filter(key => key.endsWith('_KEY') || key === 'GEMINI_API_KEY' || key === 'FAL_API_KEY' || key === 'MOONSHOT_API_KEY' || key === 'ARK_API_KEY');

const DESKTOP_SETTING_KEY_SET = new Set(DESKTOP_SETTING_KEYS);

const unquoteDotenvValue = (value) => {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return trimmed;
  }
  const quote = trimmed[0];
  if ((quote !== '"' && quote !== "'") || trimmed[trimmed.length - 1] !== quote) {
    return trimmed;
  }
  const body = trimmed.slice(1, -1);
  if (quote === "'") {
    return body;
  }
  return body
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
};

export const parseDotenvEntry = (line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }
  const equalsIndex = trimmed.indexOf('=');
  if (equalsIndex === -1) {
    return null;
  }
  const key = trimmed.slice(0, equalsIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null;
  }
  return { key, value: unquoteDotenvValue(trimmed.slice(equalsIndex + 1)) };
};

export const parseDesktopEnvContent = (content) => {
  const values = {};
  const preservedLines = [];
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseDotenvEntry(line);
    if (parsed && DESKTOP_SETTING_KEY_SET.has(parsed.key)) {
      values[parsed.key] = parsed.value;
      continue;
    }
    preservedLines.push(line);
  }
  return { values, preservedLines };
};

export const quoteDotenvValue = (value) => JSON.stringify(value);

export const serializeDesktopEnvContent = (preservedLines, values) => {
  const keptLines = [...preservedLines];
  while (keptLines.length > 0 && keptLines[keptLines.length - 1] === '') {
    keptLines.pop();
  }
  const managedLines = DESKTOP_SETTING_KEYS
    .filter(key => Object.prototype.hasOwnProperty.call(values, key))
    .map(key => `${key}=${quoteDotenvValue(values[key] ?? '')}`);
  const lines = [...keptLines];
  if (lines.length > 0 && managedLines.length > 0) {
    lines.push('');
  }
  lines.push(...managedLines);
  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
};

const normalizeUpdateValue = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const applyDesktopSettings = (content, { updates = {}, clears = [] } = {}) => {
  const { values, preservedLines } = parseDesktopEnvContent(content);
  const nextValues = { ...values };
  for (const key of clears) {
    if (DESKTOP_SETTING_KEY_SET.has(key)) {
      delete nextValues[key];
    }
  }
  for (const [key, rawValue] of Object.entries(updates)) {
    const value = normalizeUpdateValue(rawValue);
    if (DESKTOP_SETTING_KEY_SET.has(key) && value !== null) {
      nextValues[key] = value;
    }
  }
  return {
    content: serializeDesktopEnvContent(preservedLines, nextValues),
    values: nextValues,
  };
};

export const readDesktopSettingsFile = async (envPath) => {
  if (!existsSync(envPath)) {
    return '';
  }
  return readFile(envPath, 'utf8');
};

export const writeDesktopSettingsFileAtomic = async (envPath, content) => {
  await mkdir(dirname(envPath), { recursive: true });
  const tmpPath = `${envPath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, content, { encoding: 'utf8', mode: 0o600 });
  renameSync(tmpPath, envPath);
};
