import type { SessionView } from '@gestschool/contracts';
import { csrfState, currentSession, restoreSession } from '../auth/auth-client';
import { PeopleError, peopleRequest } from '../directory/people-client';
export const reportingRequest = <T>(path: string, body?: unknown, method = 'GET', key?: string) =>
  peopleRequest<T>(path, body, method, true, key ? { 'Idempotency-Key': key } : {});
export function canReport(
  session: SessionView | undefined,
  permission: 'dashboards.read' | 'reports.read' | 'reports.export',
) {
  return Boolean(
    session?.grants.some(
      (grant) =>
        grant.permission === permission &&
        grant.scope !== 'NONE' &&
        (grant.scope !== 'PLATFORM' || session.roles.includes('SUPER_ADMIN')),
    ),
  );
}
export async function downloadReport(id: string, retry = true): Promise<void> {
  const session = currentSession();
  if (!session) throw new PeopleError('AUTH_SESSION_EXPIRED');
  const { csrfToken } = await csrfState(),
    response = await fetch(`/api/v1/report-exports/${id}/download`, {
      credentials: 'include',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${session.accessToken}`, 'X-CSRF-Token': csrfToken },
    });
  if (response.status === 401 && retry) {
    const renewed = await restoreSession();
    window.dispatchEvent(new Event('gestschool:session'));
    if (renewed) return downloadReport(id, false);
  }
  if (!response.ok) {
    const error = (await response.json()) as { code?: string };
    throw new PeopleError(error.code ?? 'REPORT_UNAVAILABLE');
  }
  const blob = await response.blob(),
    url = URL.createObjectURL(blob),
    anchor = document.createElement('a');
  anchor.href = url;
  anchor.download =
    response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ??
    `gestschool-report-${id}`;
  anchor.click();
  URL.revokeObjectURL(url);
}
