import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupSession } from './cleanup.js';
import type { Account } from './fixtures.js';
import { CertificationHttp } from './http.js';
import { certify, type SafeRecord } from './orchestrator.js';

let server: Server | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  }
  server = undefined;
});

// Real loopback transport; only this fake IAM server's clock advances. No wall-clock wait.
async function authenticated(
  options: {
    ageMs?: number;
    fault?: 'refresh' | 'kind' | 'session' | 'access' | 'logout' | 'me' | 'code';
  } = {},
) {
  let now = 0;
  let revoked = false;
  let refresh = 'PRIVATE_REFRESH_BEFORE';
  const calls: { path: string; status: number }[] = [];
  const controller = new AbortController();
  const account: Account = {
    http: undefined!,
    userId: 'user',
    tenantId: 'tenant',
    membershipId: 'membership',
    sessionId: 'session',
  };
  server = createServer((req, res) => {
    const path = req.url!.replace('/api/v1/', '');
    let status = 200;
    let body: unknown = {};
    const cookie = req.headers.cookie ?? '';
    const validCsrf =
      cookie.includes('__Host-gs_csrf=PRIVATE_CSRF') &&
      req.headers['x-csrf-token'] === 'PRIVATE_CSRF';
    const validAccess =
      req.headers.authorization === 'Bearer PRIVATE_ACCESS_FRESH' ||
      (now < 300_000 && req.headers.authorization === 'Bearer PRIVATE_ACCESS_INITIAL');
    if (path === 'auth/csrf') {
      res.setHeader('Set-Cookie', '__Host-gs_csrf=PRIVATE_CSRF; Path=/; Secure; HttpOnly');
      body = { csrfToken: 'PRIVATE_CSRF' };
    } else if (path === 'auth/login') {
      status = 201;
      res.setHeader(
        'Set-Cookie',
        `__Secure-gs_refresh=${refresh}; Path=/api/v1/auth; Secure; HttpOnly`,
      );
    } else if (path === 'auth/refresh') {
      if (options.fault === 'refresh' || !validCsrf || !cookie.includes(`=${refresh}`)) {
        status = 401;
        body = { code: 'AUTH_SESSION_EXPIRED', private: 'PRIVATE_RESPONSE' };
      } else {
        status = 201;
        refresh = 'PRIVATE_REFRESH_ROTATED';
        res.setHeader(
          'Set-Cookie',
          `__Secure-gs_refresh=${refresh}; Path=/api/v1/auth; Secure; HttpOnly`,
        );
        body = {
          kind: options.fault === 'kind' ? 'challenge' : 'session',
          accessToken: options.fault === 'access' ? '' : 'PRIVATE_ACCESS_FRESH',
          session: {
            sessionId: options.fault === 'session' ? 'other-session' : account.sessionId,
            membershipId: account.membershipId,
            user: { id: account.userId },
            tenant: { id: account.tenantId },
          },
        };
      }
    } else if (path === 'auth/logout') {
      // Require the rotated cookie as well as fresh access, so dropping rotation fails.
      if (
        options.fault === 'logout' ||
        !validAccess ||
        !validCsrf ||
        !cookie.includes(`=${refresh}`)
      ) {
        status = 401;
      } else {
        revoked = true;
        status = 201;
        res.setHeader('Set-Cookie', '__Secure-gs_refresh=; Path=/api/v1/auth; Secure; HttpOnly');
      }
    } else if (path === 'auth/me') {
      if (options.fault !== 'me' && (revoked || !validAccess)) {
        status = 401;
        body = { code: options.fault === 'code' ? 'WRONG_CODE' : 'AUTH_SESSION_EXPIRED' };
      }
    }
    calls.push({ path, status });
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  account.http = new CertificationHttp((server.address() as AddressInfo).port, controller.signal);
  await account.http.send('auth/csrf');
  await account.http.send('auth/login', 'POST', {});
  account.http.access = 'PRIVATE_ACCESS_INITIAL';
  now = options.ageMs ?? 0;
  return { account, controller, calls, revoked: () => revoked };
}

describe('certification session cleanup', () => {
  it.each([0, 301_000, 480_000])(
    'refreshes then revokes an access token aged %s ms',
    async (ageMs) => {
      const state = await authenticated({ ageMs });
      expect((await state.account.http.send('auth/me')).status).toBe(ageMs ? 401 : 200);
      await cleanupSession(state.account, AbortSignal.timeout(5000));
      expect(state.calls.slice(-4)).toEqual([
        { path: 'auth/csrf', status: 200 },
        { path: 'auth/refresh', status: 201 },
        { path: 'auth/logout', status: 201 },
        { path: 'auth/me', status: 401 },
      ]);
      expect(state.revoked()).toBe(true);
      state.account.http.clear();
    },
  );
  it('uses an independent cleanup signal after the main signal has expired', async () => {
    const state = await authenticated({ ageMs: 480_000 });
    state.controller.abort();
    await expect(state.account.http.send('auth/me')).rejects.toThrow('LOT14_HTTP_FAILED');
    await cleanupSession(state.account, AbortSignal.timeout(5000));
    expect(state.revoked()).toBe(true);
    state.account.http.clear();
  });
  it.each(['refresh', 'kind', 'session', 'access', 'logout', 'me', 'code'] as const)(
    'fails closed on %s failure and emits only a generic cleanup diagnostic',
    async (fault) => {
      const state = await authenticated({ ageMs: 480_000, fault });
      const logs = [
        vi.spyOn(console, 'log').mockImplementation(() => {}),
        vi.spyOn(console, 'warn').mockImplementation(() => {}),
        vi.spyOn(console, 'error').mockImplementation(() => {}),
      ];
      const fork = vi.spyOn(state.account.http, 'fork');
      const records: SafeRecord[] = [];
      await expect(
        certify(
          {
            prepare: async () => {},
            scenario: async () => {},
            worker: async () => {},
            close: () => cleanupSession(state.account, AbortSignal.timeout(5000)),
          },
          (record) => records.push(record),
        ),
      ).rejects.toThrow('LOT14_CERTIFICATION_FAILED');
      expect(records.at(-1)).toEqual({
        check: 'LOT14_CERTIFICATION',
        status: 'FAIL',
        code: 'CLEANUP_FAILED',
      });
      expect(JSON.stringify(records)).not.toContain('PRIVATE_');
      for (const log of logs) expect(log).not.toHaveBeenCalled();
      const cleared = fork.mock.results[0]!.value as CertificationHttp;
      expect(cleared.access).toBe('');
      if (['refresh', 'kind', 'session', 'access'].includes(fault))
        expect(state.calls.some((call) => call.path === 'auth/logout')).toBe(false);
      state.account.http.clear();
    },
  );
});
