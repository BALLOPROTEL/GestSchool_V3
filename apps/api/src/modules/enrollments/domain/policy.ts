import type { EnrollmentStatus } from '@gestschool/contracts';
import { deny, IamError, type RequestContext } from '../../iam/domain/context.js';
import { ScopePolicy } from '../../iam/domain/scope-policy.js';

export const enrollmentReadScopes = ['TENANT', 'PLATFORM', 'OWN', 'CHILDREN'] as const;
export const enrollmentWriteScopes = ['TENANT', 'PLATFORM'] as const;
export function enrollmentTenant(context: RequestContext, action = 'read'): boolean {
  return new ScopePolicy().allows(context, `enrollments.${action}`, { tenantId: context.tenantId });
}
export function enrollmentAccess(context: RequestContext, action = 'read'): void {
  if (enrollmentTenant(context, action)) return;
  if (
    action === 'read' &&
    context.grants.some(
      (grant) =>
        grant.permission === 'enrollments.read' &&
        (grant.scope === 'OWN' || grant.scope === 'CHILDREN'),
    )
  )
    return;
  deny();
}
export function enrollmentConflict(code: string): never {
  throw new IamError(code, 409);
}
export function enrollmentFound<T>(value: T | null | undefined): T {
  if (!value) throw new IamError('ENROLLMENT_NOT_FOUND', 404);
  return value;
}
export function enrollmentWritableYear(status: string): void {
  if (status !== 'DRAFT' && status !== 'ACTIVE') enrollmentConflict('ENROLLMENT_YEAR_CLOSED');
}
export function enrollmentTransition(
  status: EnrollmentStatus,
  action: 'confirm' | 'cancel' | 'transfer' | 'complete' | 'update',
): EnrollmentStatus {
  if (action === 'update' && status === 'PENDING') return 'PENDING';
  if (action === 'confirm' && status === 'PENDING') return 'ACTIVE';
  if (action === 'transfer' && status === 'ACTIVE') return 'ACTIVE';
  if (action === 'cancel' && (status === 'PENDING' || status === 'ACTIVE')) return 'WITHDRAWN';
  if (action === 'complete' && status === 'ACTIVE') return 'COMPLETED';
  return enrollmentConflict('ENROLLMENT_INVALID_TRANSITION');
}
export function enrollmentCapacity(
  capacity: number | null,
  occupied: number,
  additional = 1,
): void {
  if (capacity !== null && occupied + additional > capacity)
    enrollmentConflict('ENROLLMENT_CLASS_FULL');
}
export function enrollmentEffectiveDate(
  value: string,
  year: { startsOn: string; endsOn: string },
  minimum?: string,
): void {
  if (value < year.startsOn || value > year.endsOn || (minimum !== undefined && value < minimum))
    enrollmentConflict('ENROLLMENT_INVALID_DATE');
}
