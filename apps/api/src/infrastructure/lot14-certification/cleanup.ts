import { failure } from './config.js';
import type { Account } from './fixtures.js';
import { object, requireStatus, text } from './http.js';

/** Revoke through the normal IAM HTTP contract, even after the run's JWT/signal expires. */
export async function cleanupSession(account: Account, signal: AbortSignal): Promise<void> {
  const cleanup = account.http.fork(signal);
  try {
    requireStatus(await cleanup.send('auth/csrf'), 200);
    const refreshed = await cleanup.send('auth/refresh', 'POST', {});
    requireStatus(refreshed, 201);
    if (refreshed.body.kind !== 'session') throw failure();
    const session = object(refreshed.body.session);
    if (
      session.sessionId !== account.sessionId ||
      session.membershipId !== account.membershipId ||
      object(session.user).id !== account.userId ||
      object(session.tenant).id !== account.tenantId
    )
      throw failure();
    cleanup.access = text(refreshed.body.accessToken);
    requireStatus(await cleanup.send('auth/logout', 'POST', {}), 201);
    requireStatus(await cleanup.send('auth/me'), 401, 'AUTH_SESSION_EXPIRED');
  } catch {
    throw failure();
  } finally {
    cleanup.clear();
  }
}
