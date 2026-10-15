import type { Server } from 'node:http';

export interface WorkspaceBackendOptions {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  devConfigState?: Record<string, unknown> | null;
}

export function createSecureBackendServer(options?: WorkspaceBackendOptions): Server;
export function getSecureBackendListenOptions(env?: Record<string, string | undefined>): { host: string; port: number };
export function loadEnvFiles(rootDir?: string): void;
export function buildSecureBackendConfigState(rootDir: string, env?: Record<string, string | undefined>, shellEnv?: Record<string, string | undefined>): Record<string, unknown>;
export const pythonBackendSourcePath: string;
