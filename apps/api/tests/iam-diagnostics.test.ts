import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { createPrismaClient, Prisma, type GestSchoolPrismaClient } from '@gestschool/database';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { InfrastructureHealthService } from '../src/infrastructure/infrastructure-health.service.js';
import { IamRuntime } from '../src/modules/iam/infrastructure/iam-runtime.js';
import { opaqueToken } from '../src/modules/iam/infrastructure/crypto.js';
import { configureIamHttp } from '../src/modules/iam/presentation/http/security.js';
import { CertificationHttp } from '../src/infrastructure/lot14-certification/http.js';
import { authenticate } from '../src/infrastructure/lot14-certification/authentication.js';
import { authRequest, rootFailure } from '../src/infrastructure/lot14-certification/diagnostics.js';
import {
  certify,
  type CertificationTasks,
  type SafeRecord,
} from '../src/infrastructure/lot14-certification/orchestrator.js';
const canary = 'PRIVATE_IAM_DRIVER_CANARY';
let app: INestApplication, iam: IamRuntime, port: number, db: GestSchoolPrismaClient;
const logs: Record<string, unknown>[] = [];
beforeAll(async () => {
  process.env.IAM_REDIS_PREFIX = `gestschool:iam-diagnostics:test:${randomUUID()}`;
  db = createPrismaClient(loadInfrastructureConfig().databaseUrl);
  app = await NestFactory.create(AppModule, {
    abortOnError: false,
    logger: {
      log() {},
      warn() {},
      error(message: unknown) {
        if (typeof message === 'string' && message.startsWith('{'))
          logs.push(JSON.parse(message) as Record<string, unknown>);
      },
    },
  });
  iam = app.get(IamRuntime);
  // Local HTTP harness emits the real production cookie names and accepts the staging Origin.
  iam.config.secure = true;
  iam.config.origins.splice(
    0,
    iam.config.origins.length,
    'https://gestschool-v3-staging.vercel.app',
  );
  configureIamHttp(app);
  await app.listen(0, '127.0.0.1');
  port = (app.getHttpServer().address() as AddressInfo).port;
}, 60000);
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});
async function browser() {
  const http = new CertificationHttp(port, AbortSignal.timeout(10000));
  expect((await http.send('auth/csrf')).status).toBe(200);
  return http;
}
describe('real Nest HTTP AUTH_UNAVAILABLE reproductions (local injected faults, not Render attribution)', () => {
  it('also reproduces AUTH_UNAVAILABLE on readiness: the global IAM filter does not prove an auth request', async () => {
    vi.spyOn(app.get(InfrastructureHealthService), 'check').mockResolvedValueOnce({
      postgres: 'down',
      redis: 'up',
      storage: 'up',
    });
    const http = new CertificationHttp(port, AbortSignal.timeout(10000));
    let captured: unknown;
    try {
      await authRequest(http, 'READINESS', 'health/ready', 200);
    } catch (error) {
      captured = error;
    } finally {
      http.clear();
    }
    const details = rootFailure(captured)!;
    expect(details).toMatchObject({
      code: 'AUTH_PREREQUISITE_UNHEALTHY',
      operation: 'READINESS',
      httpStatus: 503,
      responseCode: 'AUTH_UNAVAILABLE',
    });
    expect(logs.at(-1)).toMatchObject({
      diagnostic: 'LOT14_AUTH_HTTP_EXCEPTION',
      reason: 'HTTP_EXCEPTION',
      operation: 'READINESS',
      requestId: details.requestId,
    });
  });
  it('reproduces a Redis rate-limiter failure before login, preserves 14 FAIL and correlates both diagnostics', async () => {
    const records: SafeRecord[] = [],
      sessions: CertificationHttp[] = [];
    const userLookup = vi.spyOn(iam.repository, 'userByEmail');
    const task: CertificationTasks = {
      async prepare(signal) {
        await authenticate('A', 'SCHOOL_ADMIN', randomUUID(), signal, {
          port,
          environment: { LOT14_BOOTSTRAP_A_SCHOOL_ADMIN_PASSWORD: opaqueToken() },
          crypto: iam.crypto,
          sessions,
          accounts: [],
          readMfa: async () => {
            throw new Error('UNEXPECTED_MFA_READ');
          },
        });
      },
      scenario: vi.fn(async () => {}),
      worker: vi.fn(async () => {}),
      async close() {
        for (const session of sessions) session.clear();
      },
    };
    const start = logs.length;
    await iam.limiter.close();
    try {
      await expect(certify(task, (record) => records.push(record))).rejects.toMatchObject({
        details: { code: 'AUTH_LOGIN_UNAVAILABLE', operation: 'LOGIN', httpStatus: 503 },
      });
      expect(userLookup).not.toHaveBeenCalled();
      const root = records.find((row) => row.check === 'LOT14_CERTIFICATION')!;
      expect(logs.slice(start)).toEqual([
        expect.objectContaining({
          code: 'AUTH_UNAVAILABLE',
          status: 503,
          operation: 'LOGIN',
          diagnostic: 'LOT14_AUTH_REDIS_UNAVAILABLE',
          reason: 'CLIENT_CLOSED',
          requestId: root.requestId,
        }),
      ]);
      expect(records.find((row) => row.check === 'LOT14_TENANT_AB')).toMatchObject({
        pass: 0,
        fail: 14,
        skip: 0,
      });
      expect(
        records.filter((row) => row.check === 'LOT14_TENANT_AB_CASE' && row.status === 'FAIL'),
      ).toHaveLength(14);
      expect(task.scenario).not.toHaveBeenCalled();
      expect(task.worker).not.toHaveBeenCalled();
      expect(records.find((row) => row.check === 'LOT14_WORKER_E2E')).toMatchObject({
        status: 'SKIP',
      });
    } finally {
      await iam.limiter.open();
    }
  });
  it('reproduces a Prisma transaction error in the real login path without calling it a proven timeout', async () => {
    const password = opaqueToken(),
      email = `${randomUUID()}@example.invalid`;
    await db.user.create({
      data: {
        email,
        displayName: 'IAM diagnostics fixture',
        identity: {
          create: { passwordHash: await iam.passwords.hash(password), activatedAt: new Date() },
        },
      },
    });
    const root = (iam.repository as unknown as { root: GestSchoolPrismaClient }).root;
    const error = new Prisma.PrismaClientKnownRequestError(canary, {
      code: 'P2028',
      clientVersion: '7.10.0',
      meta: { private: canary },
    });
    vi.spyOn(root, '$transaction').mockRejectedValueOnce(error);
    const http = await browser();
    let captured: unknown;
    try {
      await authRequest(http, 'LOGIN', 'auth/login', 201, 'POST', { email, password });
    } catch (failure) {
      captured = failure;
    } finally {
      http.clear();
    }
    const details = rootFailure(captured)!;
    expect(details).toMatchObject({
      code: 'AUTH_LOGIN_UNAVAILABLE',
      operation: 'LOGIN',
      httpStatus: 500,
      responseCode: 'AUTH_UNAVAILABLE',
    });
    expect(logs.at(-1)).toMatchObject({
      diagnostic: 'LOT14_AUTH_TRANSACTION_ERROR',
      reason: 'TRANSACTION_API_ERROR',
      operation: 'LOGIN',
      status: 500,
      requestId: details.requestId,
      transactionDurationMs: expect.any(Number),
    });
    expect(JSON.stringify(logs.at(-1))).not.toMatch(/TIMEOUT|PRIVATE_IAM_DRIVER_CANARY/);
  });
  it.each([
    [
      'MFA_ENROLL',
      'auth/mfa/enroll',
      { challenge: opaqueToken() },
      'token',
      'AUTH_MFA_UNAVAILABLE',
    ],
    ['REFRESH', 'auth/refresh', {}, 'refresh', 'AUTH_REFRESH_UNAVAILABLE'],
  ] as const)(
    'attributes a typed DB failure to the actual %s route while preserving the public contract',
    async (operation, path, input, method, code) => {
      vi.spyOn(iam.repository, method).mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError(canary, {
          code: 'P1002',
          clientVersion: '7.10.0',
        }),
      );
      const http = await browser();
      let captured: unknown;
      try {
        await authRequest(http, operation, path, 201, 'POST', input);
      } catch (error) {
        captured = error;
      } finally {
        http.clear();
      }
      const details = rootFailure(captured)!;
      expect(details).toMatchObject({
        code,
        operation,
        httpStatus: 500,
        responseCode: 'AUTH_UNAVAILABLE',
      });
      expect(logs.at(-1)).toMatchObject({
        diagnostic: 'LOT14_AUTH_DB_UNAVAILABLE',
        reason: 'CONNECT_TIMEOUT',
        operation,
        requestId: details.requestId,
      });
      expect(JSON.stringify(logs)).not.toContain(canary);
      expect(JSON.stringify(details)).not.toContain(canary);
    },
  );
});
