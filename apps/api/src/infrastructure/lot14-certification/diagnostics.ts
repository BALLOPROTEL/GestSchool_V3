import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import type { CertificationHttp, Reply } from './http.js';
import { roles } from './config.js';

export const rootCodes = [
  'AUTH_CSRF_UNAVAILABLE',
  'AUTH_LOGIN_UNAVAILABLE',
  'AUTH_MFA_UNAVAILABLE',
  'AUTH_REFRESH_UNAVAILABLE',
  'AUTH_PROFILE_UNAVAILABLE',
  'AUTH_HTTP_TIMEOUT',
  'AUTH_HTTP_ABORTED',
  'AUTH_HTTP_TRANSPORT_ERROR',
  'AUTH_HTTP_RESPONSE_INVALID',
  'AUTH_REQUEST_REJECTED',
  'AUTH_FIXTURE_MISMATCH',
  'AUTH_MFA_STATE_UNAVAILABLE',
  'AUTH_BOOTSTRAP_DB_UNAVAILABLE',
  'AUTH_BOOTSTRAP_INSPECTION_FAILED',
  'AUTH_PREREQUISITE_UNHEALTHY',
  'AUTH_API_UNAVAILABLE',
] as const;
export const authOperations = [
  'CSRF',
  'LOGIN',
  'MFA_ENROLL',
  'MFA_CONFIRM',
  'MFA_VERIFY',
  'MFA_STATE_READ',
  'MFA_TOTP',
  'REFRESH',
  'PROFILE',
  'BOOTSTRAP_DB_CONNECT',
  'BOOTSTRAP_TARGET',
  'BOOTSTRAP_INSPECT',
  'BOOTSTRAP_STATE',
  'BOOTSTRAP_TENANTS',
  'PREREQUISITE_HEALTH',
  'READINESS',
  'API_REQUEST',
  'FIXTURES_A',
  'FIXTURES_B',
] as const;
const publicCodes = [
  'AUTH_UNAVAILABLE',
  'AUTH_TOKEN_INVALID',
  'AUTH_MFA_INVALID',
  'AUTH_SESSION_EXPIRED',
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_RATE_LIMITED',
  'AUTH_MFA_REQUIRED',
  'AUTH_ORIGIN_REJECTED',
  'AUTH_CSRF_REJECTED',
  'AUTH_INVALID_REQUEST',
] as const;
export const authFailureSchema = z.object({
  code: z.enum(rootCodes),
  operation: z.enum(authOperations),
  httpStatus: z.number().int().min(100).max(599).optional(),
  requestId: z.uuid().optional(),
  responseCode: z.enum(publicCodes).optional(),
  durationMs: z.number().int().min(0).max(86_400_000).optional(),
  tenant: z.enum(['A', 'B']).optional(),
  role: z.enum(roles).optional(),
});
export const authStateSchema = z.object({
  check: z.literal('LOT14_AUTH_STATE'),
  status: z.literal('PASS'),
  tenants: z.literal(2),
  users: z.literal(8),
  memberships: z.literal(8),
  adminMfaEnrolled: z.number().int().min(0).max(2),
  activeSessions: z.number().int().min(0).max(1_000_000),
  expiredSessions: z.number().int().min(0).max(1_000_000),
  unusedMfaChallenges: z.number().int().min(0).max(1_000_000),
  usedMfaChallenges: z.number().int().min(0).max(1_000_000),
  expiredMfaChallenges: z.number().int().min(0).max(1_000_000),
});
export type AuthFailureDetails = z.infer<typeof authFailureSchema>;

export class CertificationAuthFailure extends Error {
  constructor(readonly details: AuthFailureDetails) {
    super('LOT14_AUTH_PREPARATION_FAILED');
  }
}
export function rootFailure(error: unknown): AuthFailureDetails | undefined {
  if (error instanceof CertificationHttpFailure)
    return { code: `AUTH_HTTP_${error.reason}`, operation: 'API_REQUEST' };
  if (!(error instanceof CertificationAuthFailure)) return undefined;
  const parsed = authFailureSchema.safeParse(error.details);
  return parsed.success ? parsed.data : undefined;
}
export class CertificationHttpFailure extends Error {
  constructor(readonly reason: 'TIMEOUT' | 'ABORTED' | 'TRANSPORT_ERROR' | 'RESPONSE_INVALID') {
    super('LOT14_HTTP_FAILED');
  }
}
const unavailable = {
  READINESS: 'AUTH_PREREQUISITE_UNHEALTHY',
  CSRF: 'AUTH_CSRF_UNAVAILABLE',
  LOGIN: 'AUTH_LOGIN_UNAVAILABLE',
  MFA_ENROLL: 'AUTH_MFA_UNAVAILABLE',
  MFA_CONFIRM: 'AUTH_MFA_UNAVAILABLE',
  MFA_VERIFY: 'AUTH_MFA_UNAVAILABLE',
  REFRESH: 'AUTH_REFRESH_UNAVAILABLE',
  PROFILE: 'AUTH_PROFILE_UNAVAILABLE',
} as const;

export function unavailableReply(
  path: string,
  reply: Reply,
  durationMs: number,
): CertificationAuthFailure | undefined {
  if (reply.status < 500 || reply.body.code !== 'AUTH_UNAVAILABLE') return undefined;
  const operations: Partial<Record<string, keyof typeof unavailable>> = {
    'auth/login': 'LOGIN',
    'auth/refresh': 'REFRESH',
    'auth/mfa/enroll': 'MFA_ENROLL',
    'auth/mfa/confirm': 'MFA_CONFIRM',
    'auth/mfa/verify': 'MFA_VERIFY',
    'auth/me': 'PROFILE',
    'auth/csrf': 'CSRF',
    'health/ready': 'READINESS',
  };
  const operation = operations[path] ?? 'API_REQUEST';
  const requestId = reply.headers['x-request-id'];
  return new CertificationAuthFailure({
    code: operation === 'API_REQUEST' ? 'AUTH_API_UNAVAILABLE' : unavailable[operation],
    operation,
    httpStatus: reply.status,
    responseCode: 'AUTH_UNAVAILABLE',
    durationMs,
    ...(typeof requestId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)
      ? { requestId }
      : {}),
  });
}
// No request body, token, cookie, response body or arbitrary exception string is retained.
export async function authRequest(
  http: CertificationHttp,
  operation: keyof typeof unavailable,
  path: string,
  status: number,
  method = 'GET',
  body?: unknown,
): Promise<Reply> {
  const start = performance.now();
  let reply: Reply;
  try {
    reply = await http.send(path, method, body);
  } catch (error) {
    if (error instanceof CertificationAuthFailure) throw error;
    const reason = error instanceof CertificationHttpFailure ? error.reason : 'TRANSPORT_ERROR';
    throw new CertificationAuthFailure({
      code: `AUTH_HTTP_${reason}`,
      operation,
      durationMs: Math.round(performance.now() - start),
    });
  }
  if (reply.status !== status) {
    const requestId = reply.headers['x-request-id'];
    const responseCode = publicCodes.find((code) => code === reply.body.code);
    throw new CertificationAuthFailure({
      code:
        reply.status >= 500 && responseCode === 'AUTH_UNAVAILABLE'
          ? unavailable[operation]
          : 'AUTH_REQUEST_REJECTED',
      operation,
      httpStatus: reply.status,
      durationMs: Math.round(performance.now() - start),
      ...(typeof requestId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)
        ? { requestId }
        : {}),
      ...(responseCode ? { responseCode } : {}),
    });
  }
  return reply;
}

export async function preparationStep<T>(
  operation: AuthFailureDetails['operation'],
  code: AuthFailureDetails['code'],
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof CertificationAuthFailure) throw error;
    throw new CertificationAuthFailure({
      code: error instanceof CertificationHttpFailure ? `AUTH_HTTP_${error.reason}` : code,
      operation,
    });
  }
}
