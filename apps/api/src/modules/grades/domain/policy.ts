import type { AccessScope, AssessmentAction, ResultStatus } from '@gestschool/contracts';
import { IamError, type RequestContext } from '../../iam/domain/context.js';
import { ScopePolicy } from '../../iam/domain/scope-policy.js';

export const resultReadScopes: AccessScope[] = [
  'TENANT',
  'PLATFORM',
  'ASSIGNED',
  'OWN',
  'CHILDREN',
];
export const resultWriteScopes: AccessScope[] = ['TENANT', 'PLATFORM', 'ASSIGNED'];
export const resultAdminScopes: AccessScope[] = ['TENANT', 'PLATFORM'];
export function resultError(code: string, status = 409): never {
  throw new IamError(code, status);
}
export function resultFound<T>(value: T | null | undefined): T {
  if (value == null) resultError('RESULT_NOT_FOUND', 404);
  return value;
}
export function resultTenant(context: RequestContext, permission: string): boolean {
  return new ScopePolicy().allows(context, permission, { tenantId: context.tenantId });
}
export function resultAccess(
  context: RequestContext,
  permission: string,
  scopes = resultReadScopes,
): void {
  if (resultTenant(context, permission)) return;
  if (
    context.grants.some(
      (grant) =>
        grant.permission === permission &&
        grant.scope !== 'PLATFORM' &&
        scopes.includes(grant.scope),
    )
  )
    return;
  resultError('AUTH_FORBIDDEN', 403);
}
export const resultActionPermission: Record<AssessmentAction, string> = {
  submit: 'grades.submit',
  validate: 'grades.validate',
  publish: 'grades.publish',
  lock: 'grades.lock',
  reopen: 'grades.validate',
  archive: 'assessments.update',
};
export function transition(status: ResultStatus, action: AssessmentAction): ResultStatus {
  if (status === 'LOCKED') resultError('ASSESSMENT_LOCKED');
  const rules: Partial<Record<AssessmentAction, readonly [ResultStatus, ResultStatus]>> = {
    submit: ['DRAFT', 'SUBMITTED'],
    validate: ['SUBMITTED', 'VALIDATED'],
    publish: ['VALIDATED', 'PUBLISHED'],
    lock: ['PUBLISHED', 'LOCKED'],
    reopen: ['SUBMITTED', 'DRAFT'],
  };
  if (action === 'archive' && status === 'DRAFT') return status;
  const rule = rules[action];
  if (!rule || rule[0] !== status) resultError('ASSESSMENT_INVALID_TRANSITION');
  return rule[1];
}
export function draftOnly(status: ResultStatus, archivedAt: Date | null): void {
  if (status === 'LOCKED') resultError('ASSESSMENT_LOCKED');
  if (status !== 'DRAFT' || archivedAt) resultError('ASSESSMENT_NOT_EDITABLE');
}
