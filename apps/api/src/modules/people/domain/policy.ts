import type { PeopleKind } from '@gestschool/contracts';
import { deny, type RequestContext } from '../../iam/domain/context.js';
import { ScopePolicy } from '../../iam/domain/scope-policy.js';

export const readScopes = ['TENANT', 'PLATFORM', 'OWN', 'CHILDREN', 'ASSIGNED'] as const;
export const writeScopes = ['TENANT', 'PLATFORM'] as const;
export function tenantPermission(context: RequestContext, permission: string): boolean {
  return new ScopePolicy().allows(context, permission, { tenantId: context.tenantId });
}
export function requireWrite(context: RequestContext, kind: PeopleKind, action: string): void {
  if (!tenantPermission(context, `${kind}.${action}`)) deny();
}
export function hasScope(context: RequestContext, kind: PeopleKind, scope: string): boolean {
  return context.grants.some(
    (grant) => grant.permission === `${kind}.read` && grant.scope === scope,
  );
}
