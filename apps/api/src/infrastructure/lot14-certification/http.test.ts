import { createServer, type Server, type RequestListener } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { CertificationHttp } from './http.js';
let server: Server | undefined;
afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  }
  server = undefined;
});
async function listen(handler: RequestListener) {
  server = createServer(handler);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  return new CertificationHttp((server.address() as AddressInfo).port, AbortSignal.timeout(5000));
}
describe('private loopback HTTP transport', () => {
  it('keeps secure cookie paths, CSRF and access in memory and accepts normal rotation', async () => {
    const observed: { path: string; cookie?: string; csrf?: string; access?: string }[] = [];
    const client = await listen((req, res) => {
      observed.push({
        path: req.url!,
        ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
        ...(req.headers['x-csrf-token'] ? { csrf: String(req.headers['x-csrf-token']) } : {}),
        ...(req.headers.authorization ? { access: req.headers.authorization } : {}),
      });
      res.setHeader('Content-Type', 'application/json');
      if (req.url?.endsWith('csrf')) {
        res.setHeader(
          'Set-Cookie',
          '__Host-gs_csrf=in-memory-csrf; Path=/; Secure; HttpOnly; SameSite=Strict',
        );
        res.end(JSON.stringify({ csrfToken: 'in-memory-csrf' }));
      } else {
        res.setHeader(
          'Set-Cookie',
          '__Secure-gs_refresh=in-memory-refresh; Path=/api/v1/auth; Secure; HttpOnly; SameSite=Strict',
        );
        res.end('{}');
      }
    });
    await client.send('auth/csrf');
    await client.send('auth/login', 'POST', {});
    client.access = 'in-memory-access';
    await client.send('auth/refresh', 'POST', {});
    await client.send('students');
    expect(observed[2]).toMatchObject({
      cookie: '__Host-gs_csrf=in-memory-csrf; __Secure-gs_refresh=in-memory-refresh',
      csrf: 'in-memory-csrf',
      access: 'Bearer in-memory-access',
    });
    expect(observed[3]?.cookie).toBe('__Host-gs_csrf=in-memory-csrf');
    client.clear();
    await client.send('auth/me');
    expect(observed[4]).toEqual({ path: '/api/v1/auth/me' });
  });
  it('never follows redirects or accepts an arbitrary destination', async () => {
    const client = await listen((_req, res) => {
      res.writeHead(302, { Location: 'https://example.invalid' });
      res.end();
    });
    expect((await client.send('auth/me')).status).toBe(302);
    await expect(client.send('https://example.invalid')).rejects.toThrow(
      'LOT14_CERTIFICATION_FAILED',
    );
    await expect(client.send('../health')).rejects.toThrow('LOT14_CERTIFICATION_FAILED');
  });
  it('forks session state privately and keeps rotated refresh cookies isolated in memory', async () => {
    const observed: { path: string; cookie: string; csrf: string }[] = [];
    const client = await listen((req, res) => {
      observed.push({
        path: req.url!,
        cookie: req.headers.cookie ?? '',
        csrf: String(req.headers['x-csrf-token'] ?? ''),
      });
      res.setHeader('Content-Type', 'application/json');
      if (req.url?.endsWith('csrf')) {
        res.setHeader('Set-Cookie', '__Host-gs_csrf=PRIVATE_CSRF; Path=/; Secure');
        res.end(JSON.stringify({ csrfToken: 'PRIVATE_CSRF' }));
      } else {
        const rotated = req.url?.endsWith('refresh');
        res.setHeader(
          'Set-Cookie',
          `__Secure-gs_refresh=${rotated ? 'PRIVATE_ROTATED' : 'PRIVATE_INITIAL'}; Path=/api/v1/auth; Secure; HttpOnly`,
        );
        res.end('{}');
      }
    });
    await client.send('auth/csrf');
    await client.send('auth/login', 'POST', {});
    const continuation = client.fork(AbortSignal.timeout(5000));
    expect(continuation.signal).not.toBe(client.signal);
    await continuation.send('auth/refresh', 'POST', {});
    expect(observed.at(-1)).toMatchObject({
      cookie: '__Host-gs_csrf=PRIVATE_CSRF; __Secure-gs_refresh=PRIVATE_INITIAL',
      csrf: 'PRIVATE_CSRF',
    });
    await continuation.send('auth/refresh', 'POST', {});
    expect(observed.at(-1)?.cookie).toContain('__Secure-gs_refresh=PRIVATE_ROTATED');
    await client.send('auth/me');
    expect(observed.at(-1)?.cookie).toContain('__Secure-gs_refresh=PRIVATE_INITIAL');
    client.clear();
    await continuation.send('auth/refresh', 'POST', {});
    expect(observed.at(-1)?.cookie).toContain('__Secure-gs_refresh=PRIVATE_ROTATED');
    continuation.clear();
    await continuation.send('auth/me');
    expect(observed.at(-1)).toEqual({ path: '/api/v1/auth/me', cookie: '', csrf: '' });
  });
  it('sanitizes malformed responses and rejects unexpected cookies', async () => {
    const client = await listen((_req, res) => {
      res.setHeader('Set-Cookie', 'unsafe=private-canary; Path=/; Secure');
      res.end('private-driver-canary');
    });
    await expect(client.send('auth/me')).rejects.toThrow('LOT14_HTTP_FAILED');
  });
  it('aborts open HTTP requests and closes their sockets', async () => {
    const client = await listen(() => {});
    const controller = new AbortController();
    const bounded = new CertificationHttp(
      (server!.address() as AddressInfo).port,
      controller.signal,
    );
    const run = expect(bounded.send('auth/me')).rejects.toThrow('LOT14_HTTP_FAILED');
    controller.abort();
    await run;
    client.clear();
  });
  it('captures AUTH_UNAVAILABLE from a business API request with a safe correlation, without exposing its response', async () => {
    const requestId = randomUUID();
    const client = await listen((_req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json', 'X-Request-ID': requestId });
      res.end(JSON.stringify({ code: 'AUTH_UNAVAILABLE', private: 'PRIVATE_RESPONSE_CANARY' }));
    });
    await expect(client.send('students')).rejects.toMatchObject({
      details: {
        code: 'AUTH_API_UNAVAILABLE',
        operation: 'API_REQUEST',
        httpStatus: 500,
        requestId,
      },
    });
    client.clear();
  });
});
