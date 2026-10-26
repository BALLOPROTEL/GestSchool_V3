import { performance } from 'node:perf_hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@gestschool/database';
import {
  ClientClosedError,
  ClientOfflineError,
  ConnectionTimeoutError,
  ErrorReply,
  SocketClosedUnexpectedlyError,
} from 'redis';
import { IamError } from '../domain/context.js';
import {
  iamDiagnostic,
  iamHttpOperation,
  IamRedisUnavailable,
  observeIamDatabase,
} from './operational-diagnostics.js';
const canary = 'PRIVATE_DRIVER_CANARY';
afterEach(() => vi.restoreAllMocks());
describe('safe IAM operational diagnostics', () => {
  it.each([
    [new ClientClosedError(), 'CLIENT_CLOSED'],
    [new ClientOfflineError(), 'CLIENT_OFFLINE'],
    [new ConnectionTimeoutError(), 'CONNECT_TIMEOUT'],
    [new SocketClosedUnexpectedlyError(), 'SOCKET_CLOSED'],
    [new ErrorReply(canary), 'COMMAND_REJECTED'],
    [Object.assign(new Error(canary), { code: 'CERT_HAS_EXPIRED' }), 'TLS_ERROR'],
    [Object.assign(new Error(canary), { code: 'ECONNRESET' }), 'CONNECTION_ERROR'],
    [new Error(canary), 'UNKNOWN'],
  ])('retains a Redis reason without retaining the driver exception %#', (error, reason) => {
    const wrapped = new IamRedisUnavailable(error);
    expect(wrapped).toBeInstanceOf(IamError);
    expect(wrapped.code).toBe('AUTH_UNAVAILABLE');
    expect(wrapped.status).toBe(503);
    expect(iamDiagnostic(wrapped)).toEqual({ diagnostic: 'LOT14_AUTH_REDIS_UNAVAILABLE', reason });
    expect(wrapped).not.toHaveProperty('cause');
    expect(JSON.stringify(wrapped)).not.toContain(canary);
  });
  it.each([
    ['P2028', 'LOT14_AUTH_TRANSACTION_ERROR', 'TRANSACTION_API_ERROR'],
    ['P2024', 'LOT14_AUTH_DB_UNAVAILABLE', 'POOL_TIMEOUT'],
    ['P1002', 'LOT14_AUTH_DB_UNAVAILABLE', 'CONNECT_TIMEOUT'],
    ['P1008', 'LOT14_AUTH_DB_UNAVAILABLE', 'OPERATION_TIMEOUT'],
    ['P2002', 'LOT14_AUTH_DB_UNAVAILABLE', 'DB_OPERATION_ERROR'],
  ])(
    'classifies the typed Prisma %s error without inspecting message/meta',
    (code, diagnostic, reason) => {
      const error = new Prisma.PrismaClientKnownRequestError(canary, {
        code,
        clientVersion: '7.10.0',
        meta: { secret: canary },
      });
      expect(iamDiagnostic(error)).toEqual({ diagnostic, reason });
      expect(JSON.stringify(iamDiagnostic(error))).not.toContain(canary);
      if (code === 'P2028') expect(JSON.stringify(iamDiagnostic(error))).not.toContain('TIMEOUT');
    },
  );
  it('does not infer a subsystem/timeout from an arbitrary error code or message', () => {
    expect(
      iamDiagnostic(
        Object.assign(new Error(canary), { code: 'P2028', name: 'PrismaClientKnownRequestError' }),
      ),
    ).toEqual({ diagnostic: 'LOT14_AUTH_INTERNAL_ERROR', reason: 'UNKNOWN' });
  });
  it('does not let an unexpected error accessor change the Redis 503 contract', () => {
    const error = Object.defineProperty(new Error(canary), 'code', {
      get() {
        throw new Error(canary);
      },
    });
    const wrapped = new IamRedisUnavailable(error);
    expect(wrapped.status).toBe(503);
    expect(iamDiagnostic(wrapped)).toEqual({
      diagnostic: 'LOT14_AUTH_REDIS_UNAVAILABLE',
      reason: 'UNKNOWN',
    });
    expect(JSON.stringify(wrapped)).not.toContain(canary);
  });
  it('retains the original exception and measures leaf query and enclosing transaction separately', async () => {
    vi.spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(15000);
    const error = new Prisma.PrismaClientKnownRequestError(canary, {
      code: 'P2028',
      clientVersion: '7.10.0',
    });
    await expect(
      observeIamDatabase('TRANSACTION', () =>
        observeIamDatabase('USER_LOOKUP', async () => {
          throw error;
        }),
      ),
    ).rejects.toBe(error);
    expect(iamDiagnostic(error)).toEqual({
      diagnostic: 'LOT14_AUTH_TRANSACTION_ERROR',
      reason: 'TRANSACTION_API_ERROR',
      databaseOperation: 'USER_LOOKUP',
      databaseDurationMs: 99,
      transactionDurationMs: 15000,
    });
  });
  it('attributes an adapter exception only when observed at a database-only operation boundary', async () => {
    const error = new Error(canary);
    await expect(
      observeIamDatabase('TOKEN_LOOKUP', async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(iamDiagnostic(error)).toMatchObject({
      diagnostic: 'LOT14_AUTH_DB_UNAVAILABLE',
      reason: 'DB_OPERATION_ERROR',
      databaseOperation: 'TOKEN_LOOKUP',
    });
    expect(JSON.stringify(iamDiagnostic(error))).not.toContain(canary);
  });
  it('does not claim that every failure inside a transaction is a database failure', async () => {
    const error = new Error(canary);
    await expect(
      observeIamDatabase('TRANSACTION', async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(iamDiagnostic(error)).toMatchObject({
      diagnostic: 'LOT14_AUTH_INTERNAL_ERROR',
      reason: 'UNKNOWN',
    });
  });
  it('records only known HTTP operation labels, never the arbitrary path', () => {
    expect(iamHttpOperation('/api/v1/auth/login')).toBe('LOGIN');
    expect(iamHttpOperation('/api/v1/auth/mfa/verify')).toBe('MFA_VERIFY');
    expect(iamHttpOperation(`/api/v1/${canary}`)).toBe('OTHER');
  });
});
