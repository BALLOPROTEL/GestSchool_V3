import 'reflect-metadata';
import { generateKeyPairSync, randomBytes, randomUUID, createPrivateKey } from 'node:crypto';
import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Module,
  Logger,
  type INestApplication,
} from '@nestjs/common';
import { gzipSync } from 'node:zlib';
import type { Response } from 'express';
import { NestFactory } from '@nestjs/core';
import { SignJWT } from 'jose';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { loadIamConfig } from './modules/iam/infrastructure/iam-config.js';
import { IamCrypto } from './modules/iam/infrastructure/crypto.js';
import { IamRuntime } from './modules/iam/infrastructure/iam-runtime.js';
import { ReportsService } from './modules/reports/application/reports.service.js';
import type { ReportsRepository } from './modules/reports/domain/reports.repository.js';
import { DashboardService } from './modules/dashboard/application/dashboard.service.js';
import type { DashboardRepository } from './modules/dashboard/infrastructure/dashboard.repository.js';
import type { RequestContext } from './modules/iam/domain/context.js';
import {
  BrowserSecurityGuard,
  IamExceptionFilter,
  configureIamHttp,
  cookieOptions,
  type IamRequest,
} from './modules/iam/presentation/http/security.js';

const pair = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const keys = {
  ...pair,
  mfaKeys: { one: randomBytes(32).toString('base64') },
  mfaKeyId: 'one',
  csrfKey: randomBytes(32).toString('base64'),
};
const config = loadIamConfig({
  NODE_ENV: 'test',
  IAM_ENV: 'local',
  IAM_KEYS_JSON: JSON.stringify(keys),
});
const crypto = new IamCrypto(config);
const iam = {
  config,
  crypto,
  limiter: { check: vi.fn(async () => undefined) },
} as unknown as IamRuntime;
const canary = 'GESTSCHOOL_CANARY_SECRET_HTTP';
@Controller('api/v1/probe')
class Probe {
  @Get('ip') ip(@Req() request: IamRequest) {
    return { ip: request.metadata.ipAddress };
  }
  @Post() post() {
    return { ok: true };
  }
  @Get('error') error() {
    throw new Error(`postgresql://user:${canary}@internal/database`);
  }
  @Get('cookies') cookies(@Res({ passthrough: true }) response: Response) {
    const prod = { ...iam, config: { ...config, secure: true } } as IamRuntime;
    response.cookie('__Secure-gs_refresh', 'opaque-test-only', {
      ...cookieOptions(prod, true),
      maxAge: 60_000,
    });
    response.cookie('__Host-gs_csrf', 'opaque-test-only', cookieOptions(prod, false));
    return { ok: true };
  }
}
@Module({ controllers: [Probe], providers: [{ provide: IamRuntime, useValue: iam }] })
class ProbeModule {}
let app: INestApplication;
let base: string;
const origin = 'http://127.0.0.1:3000';
const csrf = crypto.csrf();
const headers = {
  Origin: origin,
  'Content-Type': 'application/json',
  'X-CSRF-Token': csrf,
  Cookie: `gs_csrf=${csrf}`,
};
beforeAll(async () => {
  app = await NestFactory.create(ProbeModule, { logger: false, bodyParser: false });
  const previousProxy = process.env['TRUST_PROXY'];
  process.env['TRUST_PROXY'] = 'direct';
  try {
    configureIamHttp(app);
  } finally {
    if (previousProxy === undefined) delete process.env['TRUST_PROXY'];
    else process.env['TRUST_PROXY'] = previousProxy;
  }
  app.useGlobalGuards(new BrowserSecurityGuard(iam));
  app.useGlobalFilters(new IamExceptionFilter());
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
afterAll(async () => {
  await app.close();
});
describe('LOT13 HTTP boundaries', () => {
  it('ignores forwarded IP/protocol/host from an untrusted direct peer', async () => {
    const response = await fetch(`${base}/api/v1/probe/ip`, {
      headers: {
        'X-Forwarded-For': '198.51.100.9',
        'X-Forwarded-Proto': 'https',
        'X-Forwarded-Host': 'evil.example',
      },
    });
    expect(await response.json()).toEqual({ ip: '127.0.0.1' });
  });
  it('rejects compressed JSON before inflating it', async () => {
    const response = await fetch(`${base}/api/v1/probe`, {
      method: 'POST',
      headers: { ...headers, 'Content-Encoding': 'gzip' },
      body: gzipSync(JSON.stringify({ value: 'x'.repeat(1000) })),
    });
    expect(response.status).toBe(415);
  });
  it('accepts trusted Origin and authentic CSRF', async () =>
    expect(
      (await fetch(`${base}/api/v1/probe`, { method: 'POST', headers, body: '{}' })).status,
    ).toBe(201));
  it.each([
    'https://evil.example',
    'null',
    'http://127.0.0.1:3000.attacker.com',
    'not an origin',
    '',
  ])('rejects foreign/malformed/missing Origin (%#)', async (value) => {
    const h: Record<string, string> = { ...headers };
    if (value) h['Origin'] = value;
    else delete h['Origin'];
    expect(
      (await fetch(`${base}/api/v1/probe`, { method: 'POST', headers: h, body: '{}' })).status,
    ).toBe(403);
  });
  it('rejects missing/mismatched CSRF and duplicate cookies', async () => {
    for (const changes of [
      { 'X-CSRF-Token': '' },
      { Cookie: 'gs_csrf=wrong' },
      { Cookie: `gs_csrf=${csrf}; gs_csrf=${csrf}` },
    ])
      expect(
        (
          await fetch(`${base}/api/v1/probe`, {
            method: 'POST',
            headers: { ...headers, ...changes },
            body: '{}',
          })
        ).status,
      ).toBe(403);
  });
  it.each(['?page=1&page=99999', '?__proto__=x', '?constructor=x'])(
    'rejects parameter pollution %s',
    async (query) =>
      expect(
        (await fetch(`${base}/api/v1/probe${query}`, { method: 'POST', headers, body: '{}' }))
          .status,
      ).toBe(400),
  );
  it.each([
    '{"__proto__":{"polluted":true}}',
    '{"nested":{"constructor":{}}}',
    '{"prototype":true}',
  ])('rejects dangerous nested property (%#)', async (body) =>
    expect((await fetch(`${base}/api/v1/probe`, { method: 'POST', headers, body })).status).toBe(
      400,
    ),
  );
  it('returns 413 for an oversized JSON body and never returns its content', async () => {
    const response = await fetch(`${base}/api/v1/probe`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ canary, value: 'x'.repeat(70_000) }),
    });
    expect(response.status).toBe(413);
    expect(await response.text()).not.toContain(canary);
  });
  it('sanitizes exceptions and logs without stack, host, credentials or canary', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error');
    const output = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const response = await fetch(`${base}/api/v1/probe/error`);
      const body = await response.text();
      expect(response.status).toBe(500);
      expect(body).not.toMatch(/postgres|internal|stack|GESTSCHOOL_CANARY/);
      expect(JSON.stringify([...output.mock.calls, ...stdout.mock.calls])).not.toContain(canary);
      expect(logged).toHaveBeenCalled();
      expect(JSON.stringify(logged.mock.calls)).not.toContain(canary);
      expect(response.headers.get('x-powered-by')).toBeNull();
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    } finally {
      output.mockRestore();
      stdout.mockRestore();
      logged.mockRestore();
    }
  });
  it('serializes production cookies with Secure, HttpOnly, Strict and minimal paths', async () => {
    const response = await fetch(`${base}/api/v1/probe/cookies`);
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    for (const value of cookies) {
      expect(value).toContain('HttpOnly');
      expect(value).toContain('Secure');
      expect(value).toContain('SameSite=Strict');
      expect(value).not.toContain('Domain=');
    }
    expect(cookies[0]).toContain('Path=/api/v1/auth');
    expect(cookies[0]).toContain('Expires=');
    expect(cookies[1]).toContain('Path=/;');
  });
});
describe('LOT13 JWT adversarial matrix', () => {
  const claims = { sub: randomUUID(), sid: randomUUID(), tid: randomUUID(), mid: randomUUID() };
  it.each(['broken', 'x'.repeat(5000), 'eyJhbGciOiJub25lIn0.e30.'])(
    'rejects malformed/oversized/none JWT (%#)',
    async (value) => {
      await expect(crypto.verify(value)).rejects.toThrow();
    },
  );
  it.each([
    'expired',
    'wrong-key',
    'wrong-issuer',
    'wrong-audience',
    'unexpected-header',
    'wrong-type',
  ])('rejects %s', async (mode) => {
    const other = generateKeyPairSync('ed25519');
    const jwt = new SignJWT(claims)
      .setProtectedHeader({
        alg: 'EdDSA',
        typ: mode === 'wrong-type' ? 'other' : 'JWT',
        ...(mode === 'unexpected-header' ? { jku: 'https://evil.example' } : {}),
      })
      .setIssuedAt()
      .setExpirationTime(mode === 'expired' ? '-10s' : '60s')
      .setIssuer(mode === 'wrong-issuer' ? 'other' : config.issuer)
      .setAudience(mode === 'wrong-audience' ? 'other' : config.audience);
    await expect(
      crypto.verify(
        await jwt.sign(mode === 'wrong-key' ? other.privateKey : createPrivateKey(keys.privateKey)),
      ),
    ).rejects.toThrow();
  });
  it('rejects symmetric algorithm confusion', async () => {
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt()
      .setExpirationTime('60s')
      .setIssuer(config.issuer)
      .setAudience(config.audience)
      .sign(randomBytes(32));
    await expect(crypto.verify(token)).rejects.toThrow();
  });
  it('fails closed for missing, mismatched, weak and local production IAM keys', () => {
    const env = {
      NODE_ENV: 'production',
      IAM_ENV: 'production',
      IAM_ALLOWED_ORIGINS: 'https://school.example.com',
      IAM_JWT_PRIVATE_KEY: keys.privateKey,
      IAM_JWT_PUBLIC_KEY: keys.publicKey,
      IAM_MFA_KEYS_JSON: JSON.stringify(keys.mfaKeys),
      IAM_MFA_KEY_ID: 'one',
      IAM_CSRF_KEY: keys.csrfKey,
    };
    for (const change of [
      { IAM_JWT_PRIVATE_KEY: undefined },
      {
        IAM_JWT_PUBLIC_KEY: generateKeyPairSync('ed25519')
          .publicKey.export({ type: 'spki', format: 'pem' })
          .toString(),
      },
      { IAM_CSRF_KEY: Buffer.alloc(32).toString('base64') },
      { IAM_CSRF_KEY: keys.mfaKeys.one },
      { IAM_ALLOWED_ORIGINS: 'https://localhost' },
      { IAM_ALLOWED_ORIGINS: '*' },
      { IAM_ENV: 'local' },
    ])
      expect(() => loadIamConfig({ ...env, ...change })).toThrow();
  });
});

describe('LOT13 domain errors do not turn arbitrary exceptions into public codes', () => {
  it('sanitizes Reports and Dashboard database/provider canaries', async () => {
    const context = {
      tenantId: randomUUID(),
      membershipId: randomUUID(),
      userId: randomUUID(),
      roles: [],
      grants: [],
    } as unknown as RequestContext;
    const failure = new Error(`SELECT password FROM database; ${canary}`);
    const reports = new ReportsService({
      page: vi.fn().mockRejectedValue(failure),
    } as unknown as ReportsRepository);
    const dashboards = new DashboardService({
      summary: vi.fn().mockRejectedValue(failure),
    } as unknown as DashboardRepository);
    await expect(reports.page(context, 'STUDENTS', {})).rejects.toMatchObject({
      code: 'REPORT_UNAVAILABLE',
      status: 503,
    });
    await expect(dashboards.summary(context, {})).rejects.toMatchObject({
      code: 'DASHBOARD_UNAVAILABLE',
      status: 503,
    });
  });
});
