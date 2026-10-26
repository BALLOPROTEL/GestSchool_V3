import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  authRequest,
  CertificationAuthFailure,
  CertificationHttpFailure,
  rootFailure,
} from './diagnostics.js';
import { certify, type CertificationTasks, type SafeRecord } from './orchestrator.js';
import type { CertificationHttp, Reply } from './http.js';
const canary = 'PRIVATE_AUTH_DIAGNOSTIC_CANARY';
const reply = (
  status: number,
  body: Record<string, unknown>,
  requestId: string = randomUUID(),
): Reply => ({
  status,
  body,
  data: body,
  bytes: Buffer.alloc(0),
  headers: { 'x-request-id': requestId },
});
const client = (send: () => Promise<Reply>) => ({ send }) as unknown as CertificationHttp;
describe('runner authentication root diagnostics', () => {
  it.each([
    ['LOGIN', 'AUTH_LOGIN_UNAVAILABLE'],
    ['MFA_ENROLL', 'AUTH_MFA_UNAVAILABLE'],
    ['MFA_CONFIRM', 'AUTH_MFA_UNAVAILABLE'],
    ['MFA_VERIFY', 'AUTH_MFA_UNAVAILABLE'],
    ['REFRESH', 'AUTH_REFRESH_UNAVAILABLE'],
    ['CSRF', 'AUTH_CSRF_UNAVAILABLE'],
    ['PROFILE', 'AUTH_PROFILE_UNAVAILABLE'],
  ] as const)(
    'records the exact failing HTTP step %s with a safe correlation ID',
    async (operation, code) => {
      const requestId: string = randomUUID();
      let captured: unknown;
      try {
        await authRequest(
          client(async () => reply(503, { code: 'AUTH_UNAVAILABLE', secret: canary }, requestId)),
          operation,
          'auth/login',
          201,
          'POST',
          { password: canary },
        );
      } catch (error) {
        captured = error;
      }
      expect(rootFailure(captured)).toMatchObject({
        code,
        operation,
        httpStatus: 503,
        responseCode: 'AUTH_UNAVAILABLE',
        requestId,
      });
      expect(JSON.stringify(rootFailure(captured))).not.toContain(canary);
      expect(captured).not.toHaveProperty('cause');
    },
  );
  it.each(['TIMEOUT', 'ABORTED', 'TRANSPORT_ERROR', 'RESPONSE_INVALID'] as const)(
    'keeps a transport %s separate from a server AUTH_UNAVAILABLE',
    async (reason) => {
      let captured: unknown;
      try {
        await authRequest(
          client(async () => {
            throw new CertificationHttpFailure(reason);
          }),
          'REFRESH',
          'auth/refresh',
          201,
          'POST',
          {},
        );
      } catch (error) {
        captured = error;
      }
      expect(rootFailure(captured)).toMatchObject({
        code: `AUTH_HTTP_${reason}`,
        operation: 'REFRESH',
      });
      expect(rootFailure(captured)).not.toHaveProperty('httpStatus');
    },
  );
  it('does not expose arbitrary public response fields or an unvalidated requestId', async () => {
    let captured: unknown;
    try {
      await authRequest(
        client(async () => reply(401, { code: canary, cookie: canary }, canary)),
        'LOGIN',
        'auth/login',
        201,
      );
    } catch (error) {
      captured = error;
    }
    expect(rootFailure(captured)).toMatchObject({
      code: 'AUTH_REQUEST_REJECTED',
      operation: 'LOGIN',
      httpStatus: 401,
    });
    expect(JSON.stringify(rootFailure(captured))).not.toContain(canary);
  });
  it('preserves 14 prerequisite FAIL and worker SKIP while emitting the safe root', async () => {
    const requestId: string = randomUUID();
    const error = new CertificationAuthFailure({
      code: 'AUTH_LOGIN_UNAVAILABLE',
      operation: 'LOGIN',
      httpStatus: 503,
      requestId,
    });
    const task: CertificationTasks = {
      prepare: vi.fn(async () => {
        throw error;
      }),
      scenario: vi.fn(async () => {}),
      worker: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    };
    const records: SafeRecord[] = [];
    await expect(certify(task, (record) => records.push(record))).rejects.toBeInstanceOf(
      CertificationAuthFailure,
    );
    expect(records.filter((row) => row.check === 'LOT14_TENANT_AB_CASE')).toHaveLength(14);
    expect(records.find((row) => row.check === 'LOT14_TENANT_AB')).toMatchObject({
      status: 'FAIL',
      pass: 0,
      fail: 14,
      skip: 0,
    });
    expect(records.find((row) => row.check === 'LOT14_CERTIFICATION')).toMatchObject({
      status: 'FAIL',
      code: 'AUTH_LOGIN_UNAVAILABLE',
      requestId,
    });
    expect(records.find((row) => row.check === 'LOT14_WORKER_E2E')).toMatchObject({
      status: 'SKIP',
    });
    expect(task.scenario).not.toHaveBeenCalled();
    expect(task.worker).not.toHaveBeenCalled();
    expect(task.close).toHaveBeenCalledOnce();
  });
});
