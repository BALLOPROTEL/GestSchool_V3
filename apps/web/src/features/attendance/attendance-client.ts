import { csrfState, currentSession, restoreSession } from '../auth/auth-client';
import { PeopleError } from '../directory/people-client';

export async function downloadAttendance(
  classId: string,
  date: string,
  retry = true,
): Promise<void> {
  const session = currentSession();
  if (!session) throw new PeopleError('AUTH_SESSION_EXPIRED');
  const { csrfToken } = await csrfState();
  const response = await fetch(
    `/api/v1/attendance/export?classId=${encodeURIComponent(classId)}&date=${encodeURIComponent(date)}`,
    {
      credentials: 'include',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'X-CSRF-Token': csrfToken,
      },
    },
  );
  if (response.status === 401 && retry) {
    const renewed = await restoreSession();
    window.dispatchEvent(new Event('gestschool:session'));
    if (renewed) return downloadAttendance(classId, date, false);
  }
  if (!response.ok) {
    const error = (await response.json()) as { code?: string };
    throw new PeopleError(error.code ?? 'ATTENDANCE_UNAVAILABLE');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download =
    response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ??
    `gestschool-attendance-${date}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
