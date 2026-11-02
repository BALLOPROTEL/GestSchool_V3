import type { AcademicEntity, AcademicView, SessionView } from '@gestschool/contracts';
import { PeopleError, peopleRequest } from '../directory/people-client';
import { notifyShellContextRefresh } from '../shell/shell-events';

export function academicYearAffectsShell(path: string, method: string): boolean {
  if (path === 'academic-years' && method === 'POST') return true;
  if (/^academic-years\/[^/]+$/.test(path) && method === 'PATCH') return true;
  return (
    /^academic-years\/[^/]+\/(activate|close|archive)$/.test(path) && method === 'POST'
  );
}

export async function academicRequest<T>(
  path: string,
  body?: unknown,
  method = 'GET',
  retry = true,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const result = await peopleRequest<T>(path, body, method, retry, extraHeaders);
  if (academicYearAffectsShell(path, method)) notifyShellContextRefresh();
  return result;
}

export const academicLabels = {
  'academic-years': 'years',
  'academic-periods': 'periods',
  levels: 'levels',
  classes: 'classes',
  subjects: 'subjects',
  'class-subjects': 'classSubjects',
  'teaching-assignments': 'assignments',
} as const;
export function canAcademic(
  session: SessionView | undefined,
  kind: AcademicEntity,
  action = 'read',
): boolean {
  const entity = kind === 'class-subjects' ? 'classes' : kind;
  return Boolean(
    session?.grants.some(
      (grant) =>
        grant.permission === `${entity}.${action}` &&
        (grant.scope === 'TENANT' ||
          (grant.scope === 'PLATFORM' && session.roles.includes('SUPER_ADMIN')) ||
          (action === 'read' && grant.scope === 'ASSIGNED')),
    ),
  );
}
export function academicWritable(row: AcademicView): boolean {
  return (
    row.status !== 'ARCHIVED' &&
    row.status !== 'CLOSED' &&
    row.academicYearStatus !== 'CLOSED' &&
    row.academicYearStatus !== 'ARCHIVED'
  );
}
export function academicErrorKey(error: unknown) {
  if (!(error instanceof PeopleError)) return 'unavailable';
  const keys = {
    ACADEMIC_NOT_FOUND: 'notFound',
    ACADEMIC_CONFLICT: 'conflict',
    ACADEMIC_HISTORY_PROTECTED: 'historyProtected',
    ACADEMIC_ACTIVE_YEAR_EXISTS: 'activeYearExists',
    ACADEMIC_INVALID_TRANSITION: 'invalidTransition',
    ACADEMIC_YEAR_CLOSED: 'yearClosed',
    ACADEMIC_CAPACITY_RESERVED: 'capacityReserved',
    ACADEMIC_ARCHIVED: 'archivedError',
    ACADEMIC_PERIOD_DATES: 'invalidDates',
    ACADEMIC_PERIOD_SEQUENCE: 'invalidSequence',
    ACADEMIC_PERIOD_OVERLAP: 'periodOverlap',
    ACADEMIC_PERIOD_TYPE: 'periodType',
    ACADEMIC_ASSIGNMENT_YEAR: 'assignmentYear',
    AUTH_INVALID_REQUEST: 'invalid',
    AUTH_FORBIDDEN: 'forbidden',
    AUTH_SESSION_EXPIRED: 'expired',
  } as const;
  return Object.hasOwn(keys, error.code) ? keys[error.code as keyof typeof keys] : 'unavailable';
}
