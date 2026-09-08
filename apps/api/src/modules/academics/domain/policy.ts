import type { AcademicEntity, AcademicStatus, AcademicPeriodCreate } from '@gestschool/contracts';
import { deny, IamError, type RequestContext } from '../../iam/domain/context.js';
import { ScopePolicy } from '../../iam/domain/scope-policy.js';

export const academicReadScopes = ['TENANT', 'PLATFORM', 'ASSIGNED'] as const;
export const academicWriteScopes = ['TENANT', 'PLATFORM'] as const;
export const permissionEntity = (entity: AcademicEntity) =>
  entity === 'class-subjects' ? 'classes' : entity;
export function academicTenant(
  context: RequestContext,
  entity: AcademicEntity,
  action = 'read',
): boolean {
  return new ScopePolicy().allows(context, `${permissionEntity(entity)}.${action}`, {
    tenantId: context.tenantId,
  });
}
export function academicAccess(
  context: RequestContext,
  entity: AcademicEntity,
  action = 'read',
): void {
  if (academicTenant(context, entity, action)) return;
  if (
    action === 'read' &&
    context.grants.some(
      (grant) =>
        grant.permission === `${permissionEntity(entity)}.read` && grant.scope === 'ASSIGNED',
    )
  )
    return;
  deny();
}
export function conflict(code: string): never {
  throw new IamError(code, 409);
}
export function required<T>(value: T | null): T {
  if (!value) throw new IamError('ACADEMIC_NOT_FOUND', 404);
  return value;
}
export function writableYear(status: AcademicStatus): void {
  if (status === 'CLOSED' || status === 'ARCHIVED') conflict('ACADEMIC_YEAR_CLOSED');
}
export function activeRecord(status: string): void {
  if (status !== 'ACTIVE') conflict('ACADEMIC_ARCHIVED');
}
export function yearTransition(
  status: AcademicStatus,
  action: 'activate' | 'close' | 'archive',
): AcademicStatus {
  if (status === 'DRAFT' && action === 'activate') return 'ACTIVE';
  if (status === 'ACTIVE' && action === 'close') return 'CLOSED';
  if (status === 'CLOSED' && action === 'archive') return 'ARCHIVED';
  return conflict('ACADEMIC_INVALID_TRANSITION');
}
export function validPeriod(
  input: AcademicPeriodCreate,
  year: { startsOn: string; endsOn: string },
  siblings: readonly AcademicPeriodCreate[],
): void {
  if (
    input.startsOn >= input.endsOn ||
    input.startsOn < year.startsOn ||
    input.endsOn > year.endsOn
  )
    conflict('ACADEMIC_PERIOD_DATES');
  if (input.ordinal > (input.type === 'TRIMESTER' ? 3 : 2)) conflict('ACADEMIC_PERIOD_SEQUENCE');
  for (const other of siblings) {
    if (other.type !== input.type) conflict('ACADEMIC_PERIOD_TYPE');
    if (other.ordinal === input.ordinal) conflict('ACADEMIC_PERIOD_SEQUENCE');
    if (input.startsOn <= other.endsOn && input.endsOn >= other.startsOn)
      conflict('ACADEMIC_PERIOD_OVERLAP');
    if (
      (other.ordinal < input.ordinal && other.startsOn >= input.startsOn) ||
      (other.ordinal > input.ordinal && other.startsOn <= input.startsOn)
    )
      conflict('ACADEMIC_PERIOD_SEQUENCE');
  }
}
