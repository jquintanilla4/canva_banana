import { EventEmitter } from 'node:events';
import { createServer, get } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBoundedHttpServerShutdown } from './bounded-http-server-shutdown.mjs';

const openServers = new Set();
const openRequests = new Set();

afterEach(() => {
  for (const request of openRequests) request.destroy();
  for (const server of openServers) server.closeAllConnections?.();
  openRequests.clear();
  openServers.clear();
});

describe('createBoundedHttpServerShutdown', () => {
  it('closes an idle server gracefully and remains idempotent', async () => {
    const server = createServer((_request, response) => response.end('ok'));
    openServers.add(server);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const shutdown = createBoundedHttpServerShutdown(server, { graceMs: 100, forceWaitMs: 100 });

    const firstShutdown = shutdown();
    const secondShutdown = shutdown();

    expect(secondShutdown).toBe(firstShutdown);
    await expect(firstShutdown).resolves.toEqual({ forced: false, timedOut: false });
    openServers.delete(server);
  });

  it('forces a hung active connection closed after the grace period', async () => {
    let resolveRequestStarted = () => {};
    const requestStarted = new Promise(resolve => { resolveRequestStarted = resolve; });
    const server = createServer(() => resolveRequestStarted());
    openServers.add(server);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const request = get(`http://127.0.0.1:${address.port}/hung`);
    request.on('error', () => {}); // A forced shutdown intentionally resets this client request.
    const requestClosed = new Promise(resolve => request.once('close', resolve));
    openRequests.add(request);
    await requestStarted;
    const shutdown = createBoundedHttpServerShutdown(server, { graceMs: 10, forceWaitMs: 100 });

    await expect(shutdown()).resolves.toEqual({ forced: true, timedOut: false });
    await requestClosed;
    expect(request.destroyed).toBe(true);
    openRequests.delete(request);
    openServers.delete(server);
  });

  it('returns after the force wait even when a server never reports closed', async () => {
    const server = new EventEmitter();
    server.close = vi.fn();
    server.closeAllConnections = vi.fn();
    server.closeIdleConnections = vi.fn();
    const shutdown = createBoundedHttpServerShutdown(server, { graceMs: 5, forceWaitMs: 5 });

    await expect(shutdown()).resolves.toEqual({ forced: true, timedOut: true });
    expect(server.closeIdleConnections).toHaveBeenCalledTimes(1);
    expect(server.closeAllConnections).toHaveBeenCalledTimes(1);
  });
});
