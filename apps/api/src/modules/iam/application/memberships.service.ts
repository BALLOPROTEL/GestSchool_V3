import { privilegedRoles } from '@gestschool/contracts';
import { deny, type RequestContext, type RequestMetadata } from '../domain/context.js';
import type { IamRepository, MembershipRecord } from '../infrastructure/iam.repository.js';

export function activeMembership(record: MembershipRecord | null): MembershipRecord {
  if (!record || record.status !== 'ACTIVE' || record.tenant.status !== 'ACTIVE')
    deny('AUTH_INVALID_CREDENTIALS', 401);
  return record;
}
export function resolveMembership(record: MembershipRecord) {
  const roles = record.roles
    .map((binding) => binding.role)
    .filter(
      (role) =>
        role.tenantId === record.tenantId ||
        (role.tenantId === null && role.isSystem && role.scope === 'SYSTEM'),
    );
  return {
    roles: roles.map((role) => role.code),
    grants: roles.flatMap((role) =>
      role.permissions
        .filter(
          (binding) =>
            binding.tenantId === role.tenantId &&
            (binding.scope !== 'PLATFORM' ||
              (role.code === 'SUPER_ADMIN' && role.tenantId === null)),
        )
        .map((binding) => ({ permission: binding.permission.code, scope: binding.scope })),
    ),
  };
}
export class MembershipsService {
  constructor(private readonly repository: IamRepository) {}
  async select(userId: string, id?: string): Promise<MembershipRecord> {
    if (id) return activeMembership(await this.repository.membership(id, userId));
    const memberships = await this.repository.memberships(userId);
    return activeMembership(
      memberships.find((item) => item.status === 'ACTIVE' && item.tenant.status === 'ACTIVE') ??
        null,
    );
  }
  async requiresMfa(userId: string): Promise<boolean> {
    return (await this.repository.memberships(userId)).some(
      (item) =>
        item.status === 'ACTIVE' &&
        resolveMembership(item).roles.some((role) => privilegedRoles.includes(role)),
    );
  }
  async list(userId: string) {
    return (await this.repository.memberships(userId))
      .filter((item) => item.status === 'ACTIVE' && item.tenant.status === 'ACTIVE')
      .map((item) => ({
        membershipId: item.id,
        tenant: { id: item.tenantId, name: item.tenant.name },
      }));
  }
  context(
    membership: MembershipRecord,
    sessionId: string,
    metadata: RequestMetadata,
  ): RequestContext {
    return {
      ...metadata,
      userId: membership.userId,
      sessionId,
      membershipId: membership.id,
      tenantId: membership.tenantId,
      ...resolveMembership(membership),
    };
  }
}
