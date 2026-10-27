import { performance } from 'node:perf_hooks';
import { Prisma } from '@gestschool/database';
import { HttpException } from '@nestjs/common';
import {
  ClientClosedError,
  ClientOfflineError,
  ConnectionTimeoutError,
  ErrorReply,
  SocketClosedUnexpectedlyError,
} from 'redis';
import { IamError } from '../domain/context.js';

export type IamDatabaseOperation =
  | 'USER_LOOKUP'
  | 'MEMBERSHIPS_LOOKUP'
  | 'MEMBERSHIP_LOOKUP'
  | 'SESSION_LOOKUP'
  | 'TOKEN_LOOKUP'
  | 'MFA_WRITE'
  | 'SESSION_REVOKE'
  | 'REFRESH_LOOKUP'
  | 'MFA_CHALLENGE_CREATE'
  | 'TOKEN_CREATE'
  | 'SESSION_CREATE'
  | 'LOGIN_FAILURE_AUDIT'
  | 'AUDIT'
  | 'TRANSACTION';
export interface IamDiagnostic {
  diagnostic:
    | 'LOT14_AUTH_REDIS_UNAVAILABLE'
    | 'LOT14_AUTH_DB_UNAVAILABLE'
    | 'LOT14_AUTH_TRANSACTION_ERROR'
    | 'LOT14_AUTH_HTTP_EXCEPTION'
    | 'LOT14_AUTH_INTERNAL_ERROR';
  reason:
    | 'CLIENT_CLOSED'
    | 'CLIENT_OFFLINE'
    | 'CONNECT_TIMEOUT'
    | 'SOCKET_CLOSED'
    | 'COMMAND_REJECTED'
    | 'TLS_ERROR'
    | 'CONNECTION_ERROR'
    | 'POOL_TIMEOUT'
    | 'OPERATION_TIMEOUT'
    | 'TRANSACTION_API_ERROR'
    | 'DB_OPERATION_ERROR'
    | 'DB_VALIDATION_ERROR'
    | 'HTTP_EXCEPTION'
    | 'UNKNOWN';
  databaseOperation?: IamDatabaseOperation;
  databaseDurationMs?: number;
  transactionDurationMs?: number;
}
const observations = new WeakMap<object, Partial<IamDiagnostic>>();
export const elapsed = (start: number): number =>
  Math.min(86_400_000, Math.max(0, Math.round(performance.now() - start)));

// Keep the original exception/status/transaction semantics. Only bounded constants and
// timings are retained here; no message, cause, SQL, URL or driver metadata is logged.
export async function observeIamDatabase<T>(
  operation: IamDatabaseOperation,
  run: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  try {
    return await run();
  } catch (error) {
    if (error && typeof error === 'object') {
      const previous = observations.get(error);
      observations.set(
        error,
        operation === 'TRANSACTION'
          ? { ...previous, transactionDurationMs: elapsed(start) }
          : { ...previous, databaseOperation: operation, databaseDurationMs: elapsed(start) },
      );
    }
    throw error;
  }
}

export class IamRedisUnavailable extends IamError {
  readonly diagnostic: IamDiagnostic;
  constructor(error: unknown) {
    super('AUTH_UNAVAILABLE', 503);
    let reason: IamDiagnostic['reason'] = 'UNKNOWN';
    try {
      if (error instanceof ClientClosedError) reason = 'CLIENT_CLOSED';
      else if (error instanceof ClientOfflineError) reason = 'CLIENT_OFFLINE';
      else if (error instanceof ConnectionTimeoutError) reason = 'CONNECT_TIMEOUT';
      else if (error instanceof SocketClosedUnexpectedlyError) reason = 'SOCKET_CLOSED';
      else if (error instanceof ErrorReply) reason = 'COMMAND_REJECTED';
      else if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        typeof error.code === 'string'
      ) {
        if (
          [
            'ERR_TLS_CERT_ALTNAME_INVALID',
            'CERT_HAS_EXPIRED',
            'DEPTH_ZERO_SELF_SIGNED_CERT',
            'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
          ].includes(error.code)
        )
          reason = 'TLS_ERROR';
        else if (
          ['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT'].includes(
            error.code,
          )
        )
          reason = 'CONNECTION_ERROR';
      }
    } catch {
      reason = 'UNKNOWN';
    }
    this.diagnostic = { diagnostic: 'LOT14_AUTH_REDIS_UNAVAILABLE', reason };
  }
}

export function iamDiagnostic(error: unknown): IamDiagnostic {
  if (error instanceof IamRedisUnavailable) return { ...error.diagnostic };
  let diagnostic: IamDiagnostic['diagnostic'] = 'LOT14_AUTH_INTERNAL_ERROR';
  let reason: IamDiagnostic['reason'] = 'UNKNOWN';
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    diagnostic =
      error.code === 'P2028' ? 'LOT14_AUTH_TRANSACTION_ERROR' : 'LOT14_AUTH_DB_UNAVAILABLE';
    reason =
      (
        {
          P2028: 'TRANSACTION_API_ERROR',
          P2024: 'POOL_TIMEOUT',
          P1002: 'CONNECT_TIMEOUT',
          P1008: 'OPERATION_TIMEOUT',
        } as Record<string, IamDiagnostic['reason']>
      )[error.code] ?? 'DB_OPERATION_ERROR';
    // P2028 includes several transaction API failures: it alone does NOT prove a timeout.
  } else if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientRustPanicError
  ) {
    diagnostic = 'LOT14_AUTH_DB_UNAVAILABLE';
    reason = 'DB_OPERATION_ERROR';
  } else if (error instanceof Prisma.PrismaClientValidationError) {
    diagnostic = 'LOT14_AUTH_DB_UNAVAILABLE';
    reason = 'DB_VALIDATION_ERROR';
  } else if (error instanceof HttpException) {
    diagnostic = 'LOT14_AUTH_HTTP_EXCEPTION';
    reason = 'HTTP_EXCEPTION';
  }
  const context = error && typeof error === 'object' ? observations.get(error) : undefined;
  if (diagnostic === 'LOT14_AUTH_INTERNAL_ERROR' && context?.databaseOperation) {
    diagnostic = 'LOT14_AUTH_DB_UNAVAILABLE';
    reason = 'DB_OPERATION_ERROR';
  }
  return { diagnostic, reason, ...context };
}

export function iamHttpOperation(path: string): string {
  return (
    (
      {
        '/api/v1/auth/login': 'LOGIN',
        '/api/v1/auth/refresh': 'REFRESH',
        '/api/v1/auth/mfa/enroll': 'MFA_ENROLL',
        '/api/v1/auth/mfa/confirm': 'MFA_CONFIRM',
        '/api/v1/auth/mfa/verify': 'MFA_VERIFY',
        '/api/v1/auth/mfa/setup': 'MFA_SETUP',
        '/api/v1/auth/mfa/disable': 'MFA_DISABLE',
        '/api/v1/auth/me': 'PROFILE',
        '/api/v1/auth/csrf': 'CSRF',
        '/api/v1/auth/logout': 'LOGOUT',
        '/health/ready': 'READINESS',
        '/health/live': 'LIVENESS',
      } as Record<string, string>
    )[path] ?? 'OTHER'
  );
}
