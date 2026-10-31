import { deny, type RequestMetadata } from '../domain/context.js';
import { setTimeout } from 'node:timers/promises';
import { opaqueToken, Passwords, tokenHash, validatePassword } from '../infrastructure/crypto.js';
import { loadMessagingConfig } from '@gestschool/config/messaging';
import { encryptMessagingToken } from '@gestschool/infrastructure';
import type { IamRepository } from '../infrastructure/iam.repository.js';

export class CredentialsService {
  constructor(
    private readonly repository: IamRepository,
    private readonly passwords: Passwords,
  ) {}
  async forgot(email: string, metadata: RequestMetadata): Promise<void> {
    // Apply the same minimum response time to eligible and unknown accounts.
    await Promise.all([this.issue(email, 'PASSWORD_RESET', metadata), setTimeout(350)]);
  }
  // This return value is for the local CLI only. HTTP always discards it.
  async issue(
    email: string,
    purpose: 'ACTIVATION' | 'PASSWORD_RESET',
    metadata: RequestMetadata,
  ): Promise<string | null> {
    const user = await this.repository.userByEmail(email);
    if (
      !user ||
      user.disabledAt ||
      (purpose === 'ACTIVATION' ? Boolean(user.identity?.activatedAt) : !user.identity?.activatedAt)
    )
      return null;
    return this.repository.atomic(user.id, async (repository) => {
      const membership = (await repository.memberships(user.id)).find(
        (entry) =>
          entry.status === (purpose === 'ACTIVATION' ? 'INVITED' : 'ACTIVE') &&
          entry.tenant.status === 'ACTIVE',
      );
      if (!membership) return null;
      if (purpose === 'ACTIVATION')
        await repository.invalidateMembershipTokens(user.id, membership.id, purpose);
      else await repository.invalidateTokens(user.id, purpose);
      const token = opaqueToken();
      const encrypted = encryptMessagingToken(
        token,
        user.id,
        purpose,
        loadMessagingConfig().tokenKey,
      );
      const record = await repository.createToken(
        user.id,
        tokenHash(token),
        purpose,
        new Date(Date.now() + (purpose === 'ACTIVATION' ? 86400000 : 900000)),
        membership.id,
        encrypted,
      );
      await repository.requestDelivery(membership.tenantId, record.id, purpose);
      await repository.audit(
        purpose === 'ACTIVATION' ? 'activation.requested' : 'password.reset_requested',
        metadata,
        user.id,
      );
      return token;
    });
  }
  async issueForMembership(
    membershipId: string,
    tenantId: string,
    purpose: 'ACTIVATION' | 'PASSWORD_RESET',
    canManageSuperAdmin: boolean,
    metadata: RequestMetadata,
  ): Promise<void> {
    const target = await this.repository.membershipAdminTarget(membershipId, tenantId);
    if (!target) deny();
    if (target.roles.some((binding) => binding.role.code === 'SUPER_ADMIN') && !canManageSuperAdmin)
      deny();
    const eligible =
      purpose === 'ACTIVATION'
        ? target.status === 'INVITED' && !target.user.identity?.activatedAt
        : target.status === 'ACTIVE' && Boolean(target.user.identity?.activatedAt);
    if (!eligible) deny('AUTH_INVALID_REQUEST', 409);

    await this.repository.atomic(target.userId, async (repository) => {
      const current = await repository.membershipAdminTarget(membershipId, tenantId);
      if (!current) deny();
      if (
        current.roles.some((binding) => binding.role.code === 'SUPER_ADMIN') &&
        !canManageSuperAdmin
      )
        deny();
      const stillEligible =
        purpose === 'ACTIVATION'
          ? current.status === 'INVITED' && !current.user.identity?.activatedAt
          : current.status === 'ACTIVE' && Boolean(current.user.identity?.activatedAt);
      if (!stillEligible) deny('AUTH_INVALID_REQUEST', 409);

      await repository.invalidateMembershipTokens(current.userId, membershipId, purpose);
      const token = opaqueToken();
      const encrypted = encryptMessagingToken(
        token,
        current.userId,
        purpose,
        loadMessagingConfig().tokenKey,
      );
      const record = await repository.createToken(
        current.userId,
        tokenHash(token),
        purpose,
        new Date(Date.now() + (purpose === 'ACTIVATION' ? 86400000 : 900000)),
        membershipId,
        encrypted,
      );
      await repository.requestDelivery(tenantId, record.id, purpose);
      await repository.audit(
        purpose === 'ACTIVATION' ? 'activation.requested' : 'password.reset_requested',
        metadata,
        current.userId,
        tenantId,
        membershipId,
      );
    });
  }

  async complete(
    token: string,
    password: string,
    purpose: 'ACTIVATION' | 'PASSWORD_RESET',
    metadata: RequestMetadata,
  ): Promise<void> {
    validatePassword(password);
    const record = await this.repository.token(tokenHash(token), purpose);
    if (!record) deny('AUTH_TOKEN_INVALID', 400);
    const hash = await this.passwords.hash(password);
    await this.repository.atomic(record.userId, async (repository) => {
      const current = await repository.token(tokenHash(token), purpose);
      const user = await repository.user(record.userId);
      if (
        !current ||
        !user ||
        user.disabledAt ||
        (purpose === 'ACTIVATION' && user.identity?.activatedAt)
      )
        deny('AUTH_TOKEN_INVALID', 400);
      await repository.useToken(current.id);
      await repository.password(user.id, hash);
      if (purpose === 'ACTIVATION') {
        if (!current.membershipId) deny('AUTH_TOKEN_INVALID', 400);
        const activated = await repository.activateMembership(current.membershipId, user.id);
        if (activated.count !== 1) deny('AUTH_TOKEN_INVALID', 400);
      }
      await repository.invalidateTokens(user.id);
      await repository.revoke(user.id);
      await repository.audit(
        purpose === 'ACTIVATION' ? 'account.activated' : 'password.reset',
        metadata,
        user.id,
      );
    });
  }
}
