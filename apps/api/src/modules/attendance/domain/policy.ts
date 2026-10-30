import type { AccessScope } from '@gestschool/contracts';
import { IamError, type RequestContext } from '../../iam/domain/context.js';
import { ScopePolicy } from '../../iam/domain/scope-policy.js';

export const attendanceReadScopes: AccessScope[] = [
  'TENANT',
  'PLATFORM',
  'ASSIGNED',
  'CHILDREN',
  'OWN',
];
export const attendanceWriteScopes: AccessScope[] = ['TENANT', 'PLATFORM', 'ASSIGNED'];
export const attendanceExportScopes: AccessScope[] = ['TENANT', 'PLATFORM', 'ASSIGNED'];

export function attendanceError(code: string, status = 409): never {
  throw new IamError(code, status);
}

export function attendanceFound<T>(value: T | null | undefined): T {
  if (value == null) attendanceError('ATTENDANCE_NOT_FOUND', 404);
  return value;
}

export function attendanceTenant(context: RequestContext, permission: string): boolean {
  return new ScopePolicy().allows(context, permission, { tenantId: context.tenantId });
}

export function attendanceAccess(
  context: RequestContext,
  permission: string,
  scopes = attendanceReadScopes,
): void {
  if (attendanceTenant(context, permission)) return;
  if (
    context.grants.some(
      (grant) =>
        grant.permission === permission &&
        grant.scope !== 'PLATFORM' &&
        scopes.includes(grant.scope),
    )
  )
    return;
  attendanceError('AUTH_FORBIDDEN', 403);
}
