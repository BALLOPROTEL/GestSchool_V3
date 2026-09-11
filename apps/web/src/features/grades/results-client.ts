import type { GradeOutcome, SessionView } from '@gestschool/contracts';
import { PeopleError } from '../directory/people-client';
export { peopleRequest as resultsRequest } from '../directory/people-client';
export function canResults(
  session: SessionView | undefined,
  permission: string,
  scope: 'read' | 'write' | 'tenant' = 'read',
) {
  return Boolean(
    session?.grants.some(
      (grant) =>
        grant.permission === permission &&
        (grant.scope === 'TENANT' ||
          (grant.scope === 'PLATFORM' && session.roles.includes('SUPER_ADMIN')) ||
          (scope !== 'tenant' && grant.scope === 'ASSIGNED') ||
          (scope === 'read' && ['OWN', 'CHILDREN'].includes(grant.scope))),
    ),
  );
}
export function scoreInput(value: string): string {
  return value.trim().replace(',', '.');
}
function units(text: string) {
  const [whole = '0', fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
export function validScore(value: string, outcome: GradeOutcome, maximum: string): boolean {
  if (outcome !== 'SCORED') return true;
  const score = scoreInput(value);
  if (!/^(0|[1-9]\d{0,4})(\.\d{1,2})?$/.test(score)) return false;
  return units(score) <= units(maximum);
}
export const resultErrors = {
  RESULT_DUPLICATE: 'conflict',
  RESULT_CONTEXT_ARCHIVED: 'closed',
  ASSESSMENT_ARCHIVED: 'closed',
  GRADE_NOT_PUBLISHED: 'invalidTransition',
  GRADE_UNCHANGED: 'invalid',
  REPORT_CLASS_MISMATCH: 'invalidContext',
  REPORT_NOT_PUBLISHED: 'invalidTransition',
  RESULT_NO_STUDENTS: 'emptyRoster',
  RESULT_POPULATION_LIMIT: 'limit',
  RESULT_SCALE_INVALID: 'invalidContext',
  AUTH_INVALID_REQUEST: 'invalid',
  AUTH_FORBIDDEN: 'forbidden',
  AUTH_SESSION_EXPIRED: 'expired',
  RESULT_NOT_FOUND: 'notFound',
  RESULT_CONFLICT: 'conflict',
  RESULT_STALE_VERSION: 'conflict',
  ASSESSMENT_CONFLICT: 'conflict',
  ASSESSMENT_LOCKED: 'locked',
  ASSESSMENT_NOT_EDITABLE: 'notEditable',
  ASSESSMENT_INVALID_TRANSITION: 'invalidTransition',
  ASSESSMENT_SELF_VALIDATION: 'selfValidation',
  ASSESSMENT_DATE_INVALID: 'invalidDate',
  ASSESSMENT_CONTEXT_MISMATCH: 'invalidContext',
  GRADE_OUT_OF_RANGE: 'outOfRange',
  GRADE_STUDENT_INELIGIBLE: 'ineligible',
  GRADES_INCOMPLETE: 'incomplete',
  RESULT_REASON_REQUIRED: 'reasonRequired',
  REPORT_IMMUTABLE: 'immutable',
  REPORT_ALREADY_PUBLISHED: 'alreadyPublished',
  RESULT_YEAR_CLOSED: 'closed',
  RESULT_PERIOD_CLOSED: 'closed',
  RESULT_CONTEXT_CLOSED: 'closed',
  RESULT_LIMIT_EXCEEDED: 'limit',
  RESULT_CONFIGURATION_INVALID: 'invalidContext',
} as const;
export function resultErrorKey(error: unknown) {
  return error instanceof PeopleError && Object.hasOwn(resultErrors, error.code)
    ? resultErrors[error.code as keyof typeof resultErrors]
    : 'unavailable';
}
