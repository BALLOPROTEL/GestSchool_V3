import type { AccessScope, UserAdminListQuery } from '@gestschool/contracts';
import { deny, type RequestContext } from '../domain/context.js';
import type { IamRepository } from '../infrastructure/iam.repository.js';
import { CredentialsService } from './credentials.service.js';

export class UsersService {
  constructor(
    private readonly repository: IamRepository,
    private readonly credentials: CredentialsService,
  ) {}
  async profile(context: RequestContext) {
    const user = await this.repository.user(context.userId);
    return {
      user: { id: context.userId, displayName: user?.displayName ?? '' },
      sessionId: context.sessionId,
      membershipId: context.membershipId,
      tenantId: context.tenantId,
      roles: context.roles,
      grants: context.grants,
    };
  }
  async list(context: RequestContext, query: UserAdminListQuery) {
    const result = await this.repository.listTenantUsers(
      context.tenantId,
      query.q,
      query.page,
      query.pageSize,
    );
    return {
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
      items: result.items.map((membership) => {
        const role = membership.roles[0]?.role ?? null;
        return {
          membershipId: membership.id,
          userId: membership.userId,
          displayName: membership.user.displayName,
          email: membership.user.email,
          membershipStatus: membership.status,
          activated: Boolean(membership.user.identity?.activatedAt),
          mfaEnabled: Boolean(membership.user.identity?.mfaEnabledAt),
          role: role
            ? { id: role.id, code: role.code, name: role.name, system: role.isSystem }
            : null,
          lastLoginAt: membership.authSessions[0]?.lastUsedAt.toISOString() ?? null,
          joinedAt: membership.joinedAt.toISOString(),
        };
      }),
    };
  }

  async roles(context: RequestContext) {
    const roles = await this.repository.assignableRoles(
      context.tenantId,
      context.roles.includes('SUPER_ADMIN'),
    );
    return roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      system: role.isSystem,
    }));
  }

  private async target(membershipId: string, context: RequestContext) {
    const membership = await this.repository.membershipAdminTarget(membershipId, context.tenantId);
    if (!membership) deny();
    if (
      membership.roles.some((binding) => binding.role.code === 'SUPER_ADMIN') &&
      !context.roles.includes('SUPER_ADMIN')
    )
      deny();
    return membership;
  }

  private async assignable(roleId: string, context: RequestContext) {
    const role = await this.repository.role(roleId);
    if (
      !role ||
      (role.tenantId !== null && role.tenantId !== context.tenantId) ||
      (role.code === 'SUPER_ADMIN' && !context.roles.includes('SUPER_ADMIN'))
    )
      deny();
    return role;
  }
  async invite(
    context: RequestContext,
    email: string,
    displayName: string,
    roleId: string,
  ): Promise<void> {
    await this.assignable(roleId, context);
    const invited = await this.repository.atomic(context.userId, async (repository) => {
      const result = await repository.invite(email, displayName, context.tenantId, roleId);
      await repository.audit(
        'user.invited',
        context,
        context.userId,
        context.tenantId,
        result.membership.id,
      );
      return result;
    });
    if (invited.activationRequired) {
      await this.credentials.issueForMembership(
        invited.membership.id,
        context.tenantId,
        'ACTIVATION',
        context.roles.includes('SUPER_ADMIN'),
        context,
      );
    }
  }
  async assign(context: RequestContext, membershipId: string, roleId: string): Promise<void> {
    await this.assignable(roleId, context);
    const membership = await this.target(membershipId, context);
    await this.repository.atomic(membership.userId, async (repository) => {
      const current = await repository.membership(membership.id, membership.userId);
      if (
        current?.roles.some((binding) => binding.role.code === 'SUPER_ADMIN') &&
        !context.roles.includes('SUPER_ADMIN')
      )
        deny();
      await repository.replaceRole(membership.id, context.tenantId, roleId);
      await repository.revokeMembershipSessions(membership.userId, membership.id);
      await repository.invalidateMembershipTokens(membership.userId, membership.id);
      await repository.audit(
        'role.changed',
        context,
        context.userId,
        context.tenantId,
        membership.id,
      );
    });
  }
  async status(
    context: RequestContext,
    membershipId: string,
    status: 'ACTIVE' | 'SUSPENDED',
  ): Promise<void> {
    const membership = await this.target(membershipId, context);
    if (membership.id === context.membershipId && status === 'SUSPENDED') deny();
    if (
      membership.status === 'INVITED' &&
      status === 'ACTIVE' &&
      !membership.user.identity?.activatedAt
    )
      deny('AUTH_INVALID_REQUEST', 409);

    await this.repository.atomic(membership.userId, async (repository) => {
      const current = await repository.membershipAdminTarget(membership.id, context.tenantId);
      if (!current) deny();
      if (
        current.roles.some((binding) => binding.role.code === 'SUPER_ADMIN') &&
        !context.roles.includes('SUPER_ADMIN')
      )
        deny();
      if (current.id === context.membershipId && status === 'SUSPENDED') deny();
      if (!current.user.identity?.activatedAt) deny('AUTH_INVALID_REQUEST', 409);
      if (current.status === 'INVITED' && status === 'SUSPENDED')
        deny('AUTH_INVALID_REQUEST', 409);

      await repository.setMembershipStatus(current.id, context.tenantId, status);
      if (status === 'SUSPENDED') {
        await repository.revokeMembershipSessions(current.userId, current.id);
        await repository.invalidateMembershipTokens(current.userId, current.id);
      }
      await repository.audit(
        status === 'ACTIVE' ? 'membership.reactivated' : 'membership.suspended',
        context,
        context.userId,
        context.tenantId,
        current.id,
      );
    });
  }

  async credential(
    context: RequestContext,
    membershipId: string,
    purpose: 'ACTIVATION' | 'PASSWORD_RESET',
  ): Promise<void> {
    await this.target(membershipId, context);
    await this.credentials.issueForMembership(
      membershipId,
      context.tenantId,
      purpose,
      context.roles.includes('SUPER_ADMIN'),
      context,
    );
  }

  async permission(
    context: RequestContext,
    roleId: string,
    permissionId: string,
    scope: AccessScope,
  ): Promise<void> {
    // Only platform administrators can change grants; global SYSTEM roles stay seed-owned.
    if (!context.roles.includes('SUPER_ADMIN')) deny();
    const role = await this.repository.role(roleId);
    if (
      !role ||
      role.isSystem ||
      role.tenantId !== context.tenantId ||
      !(await this.repository.permission(permissionId)) ||
      scope === 'PLATFORM'
    )
      deny();
    await this.repository.atomic(context.userId, async (repository) => {
      await repository.grantPermission(role.id, permissionId, role.tenantId, scope);
      await repository.audit(
        'permission.changed',
        context,
        context.userId,
        context.tenantId,
        role.id,
      );
    });
  }
}
