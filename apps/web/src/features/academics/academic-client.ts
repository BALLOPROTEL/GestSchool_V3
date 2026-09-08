import type { AcademicEntity, AcademicView, SessionView } from '@gestschool/contracts';
import { PeopleError } from '../directory/people-client';
export { peopleRequest as academicRequest } from '../directory/people-client';

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
