import type { LoginResult } from '@gestschool/contracts';

export class AuthClientError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
type Authenticated = Extract<LoginResult, { kind: 'session' }>;
let current: Authenticated | null = null;
let csrf: Promise<{ csrfToken: string; hasSession: boolean }> | undefined;
let refreshing: Promise<Authenticated | null> | undefined;
export function currentSession(): Authenticated | null {
  return current;
}
export function setSession(value: Authenticated | null): void {
  current = value;
}
export async function csrfState() {
  csrf ??= fetch('/api/v1/auth/csrf', { credentials: 'include', cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) throw new AuthClientError('AUTH_UNAVAILABLE');
      return (await response.json()) as { csrfToken: string; hasSession: boolean };
    })
    .catch((error: unknown) => {
      csrf = undefined;
      throw error;
    });
  return csrf;
}
export async function authRequest<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const { csrfToken } = await csrfState();
  const response = await fetch(`/api/v1/auth/${path}`, {
    method,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
      ...(current ? { Authorization: `Bearer ${current.accessToken}` } : {}),
    },
    ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
  if (!response.ok) {
    const error = (await response.json()) as { code?: string };
    throw new AuthClientError(error.code ?? 'AUTH_UNAVAILABLE');
  }
  return (await response.json()) as T;
}
export async function restoreSession(): Promise<Authenticated | null> {
  refreshing ??= (async () => {
    const run = async () => {
      csrf = undefined;
      const state = await csrfState();
      if (!state.hasSession) return null;
      return authRequest<Authenticated>('refresh');
    };
    try {
      // Serialize cookie rotation across tabs as well as within this JS instance.
      current = navigator.locks
        ? await navigator.locks.request('gestschool-refresh', run)
        : await run();
      return current;
    } catch {
      current = null;
      return null;
    } finally {
      refreshing = undefined;
    }
  })();
  return refreshing;
}
