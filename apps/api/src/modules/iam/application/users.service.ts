import type { AccessScope } from '@gestschool/contracts';
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
    const user = await this.repository.atomic(context.userId, async (repository) => {
      const invited = await repository.invite(email, displayName, context.tenantId, roleId);
      await repository.audit('role.changed', context, context.userId, context.tenantId, invited.id);
      return invited;
    });
    await this.credentials.issue(user.email, 'ACTIVATION', context);
  }
  async assign(context: RequestContext, membershipId: string, roleId: string): Promise<void> {
    await this.assignable(roleId, context);
    const membership = await this.repository.membershipTarget(membershipId, context.tenantId);
    if (!membership) deny();
    await this.repository.atomic(membership.userId, async (repository) => {
      const current = await repository.membership(membership.id, membership.userId);
      if (
        current?.roles.some((binding) => binding.role.code === 'SUPER_ADMIN') &&
        !context.roles.includes('SUPER_ADMIN')
      )
        deny();
      await repository.replaceRole(membership.id, context.tenantId, roleId);
      await repository.revoke(membership.userId);
      await repository.invalidateTokens(membership.userId);
      await repository.audit(
        'role.changed',
        context,
        context.userId,
        context.tenantId,
        membership.id,
      );
    });
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
