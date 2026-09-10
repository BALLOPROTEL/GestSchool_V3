import type { PeopleKind, SessionView } from '@gestschool/contracts';
import { csrfState, currentSession, restoreSession } from '../auth/auth-client';

export class PeopleError extends Error {
  constructor(
    readonly code: string,
    readonly requestId = '',
  ) {
    super(code);
  }
}
export function canRead(session: SessionView | undefined, kind: PeopleKind): boolean {
  return Boolean(
    session?.grants.some(
      (grant) =>
        grant.permission === `${kind}.read` &&
        grant.scope !== 'NONE' &&
        (grant.scope !== 'PLATFORM' || session.roles.includes('SUPER_ADMIN')),
    ),
  );
}
export function canWrite(
  session: SessionView | undefined,
  kind: PeopleKind,
  action: string,
): boolean {
  return Boolean(
    session?.grants.some(
      (grant) =>
        grant.permission === `${kind}.${action}` &&
        (grant.scope === 'TENANT' ||
          (grant.scope === 'PLATFORM' && session.roles.includes('SUPER_ADMIN'))),
    ),
  );
}
export async function peopleRequest<T>(
  path: string,
  body?: unknown,
  method = 'GET',
  retry = true,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const session = currentSession();
  if (!session) throw new PeopleError('AUTH_SESSION_EXPIRED');
  const { csrfToken } = await csrfState();
  const response = await fetch(`/api/v1/${path}`, {
    method,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
      Authorization: `Bearer ${session.accessToken}`,
      ...extraHeaders,
    },
    ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
  if (response.status === 401 && retry) {
    const renewed = await restoreSession();
    window.dispatchEvent(new Event('gestschool:session'));
    if (renewed) return peopleRequest<T>(path, body, method, false, extraHeaders);
  }
  if (!response.ok) {
    const error = (await response.json()) as { code?: string; requestId?: string };
    throw new PeopleError(error.code ?? 'AUTH_UNAVAILABLE', error.requestId);
  }
  return (await response.json()) as T;
}
export function errorKey(
  error: unknown,
): 'notFound' | 'conflict' | 'invalid' | 'forbidden' | 'expired' | 'archivedError' | 'unavailable' {
  if (!(error instanceof PeopleError)) return 'unavailable';
  switch (error.code) {
    case 'PERSON_NOT_FOUND':
    case 'NOT_FOUND':
      return 'notFound';
    case 'PERSON_REFERENCE_CONFLICT':
    case 'PERSON_RELATION_CONFLICT':
      return 'conflict';
    case 'AUTH_INVALID_REQUEST':
      return 'invalid';
    case 'AUTH_FORBIDDEN':
      return 'forbidden';
    case 'AUTH_SESSION_EXPIRED':
      return 'expired';
    case 'PERSON_ARCHIVED':
      return 'archivedError';
    default:
      return 'unavailable';
  }
}
