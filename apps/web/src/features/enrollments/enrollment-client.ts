import type { EnrollmentClassView, EnrollmentView, SessionView } from '@gestschool/contracts';
import { PeopleError } from '../directory/people-client';
export { peopleRequest as enrollmentRequest } from '../directory/people-client';
export function canEnrollment(session: SessionView | undefined, action = 'read'): boolean {
  return Boolean(
    session?.grants.some(
      (grant) =>
        grant.permission === `enrollments.${action}` &&
        (grant.scope === 'TENANT' ||
          (grant.scope === 'PLATFORM' && session.roles.includes('SUPER_ADMIN')) ||
          (action === 'read' && (grant.scope === 'OWN' || grant.scope === 'CHILDREN'))),
    ),
  );
}
export function canEnrollmentAction(
  row: EnrollmentView,
  action: 'update' | 'confirm' | 'cancel' | 'transfer' | 'complete',
): boolean {
  if (row.academicYearStatus === 'CLOSED' || row.academicYearStatus === 'ARCHIVED') return false;
  return action === 'cancel'
    ? row.status === 'PENDING' || row.status === 'ACTIVE'
    : action === 'update' || action === 'confirm'
      ? row.status === 'PENDING'
      : row.status === 'ACTIVE';
}
export function hasEnrollmentPlace(
  classroom: EnrollmentClassView,
  current?: EnrollmentView,
): boolean {
  const credit = current?.status === 'PENDING' && current.classId === classroom.id ? 1 : 0;
  return classroom.availablePlaces === null || classroom.availablePlaces + credit > 0;
}
export function enrollmentErrorKey(error: unknown) {
  if (!(error instanceof PeopleError))
    return error instanceof Error && error.name === 'ZodError' ? 'invalid' : 'unavailable';
  const keys = {
    ENROLLMENT_NOT_FOUND: 'notFound',
    ENROLLMENT_DUPLICATE: 'duplicate',
    ENROLLMENT_CONFLICT: 'conflict',
    ENROLLMENT_CLASS_FULL: 'classFull',
    ENROLLMENT_YEAR_CLOSED: 'yearClosed',
    ENROLLMENT_INVALID_TRANSITION: 'invalidTransition',
    ENROLLMENT_INVALID_DATE: 'invalidDate',
    ENROLLMENT_HISTORY_REQUIRED: 'historyRequired',
    ENROLLMENT_STUDENT_ARCHIVED: 'studentArchived',
    ENROLLMENT_CLASS_ARCHIVED: 'classArchived',
    ENROLLMENT_CLASS_YEAR_MISMATCH: 'classYearMismatch',
    ENROLLMENT_SAME_CLASS: 'sameClass',
    AUTH_INVALID_REQUEST: 'invalid',
    AUTH_FORBIDDEN: 'forbidden',
    AUTH_SESSION_EXPIRED: 'expired',
  } as const;
  return Object.hasOwn(keys, error.code) ? keys[error.code as keyof typeof keys] : 'unavailable';
}
