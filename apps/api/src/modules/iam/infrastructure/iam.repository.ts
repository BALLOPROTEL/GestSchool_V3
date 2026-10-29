import {
  createPrismaClient,
  type GestSchoolPrismaClient,
  type Prisma,
  type AuthTokenPurpose,
  type AccessScope,
} from '@gestschool/database';
import { IamError, type RequestMetadata } from '../domain/context.js';
import { observeIamDatabase } from './operational-diagnostics.js';

const membershipInclude = {
  tenant: true,
  roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
} as const;
export class IamRepository {
  constructor(
    private readonly db: Prisma.TransactionClient,
    private readonly root?: GestSchoolPrismaClient,
  ) {}
  static connect(url: string): IamRepository {
    const db = createPrismaClient(url);
    return new IamRepository(db, db);
  }
  async close(): Promise<void> {
    await this.root?.$disconnect();
  }
  async atomic<T>(userId: string, run: (repository: IamRepository) => Promise<T>): Promise<T> {
    if (!this.root) return run(this);
    return observeIamDatabase('TRANSACTION', () =>
      this.root!.$transaction(
        async (transaction) => {
            await transaction.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
            return run(new IamRepository(transaction));
          },
          { timeout: 15000 },
        ),
      );
    }
    userByEmail(email: string) {
      return observeIamDatabase('USER_LOOKUP', () =>
        this.db.user.findUnique({ where: { email }, include: { identity: true } }),
      );
    }
    legacyLoginCandidates(username: string) {
      return observeIamDatabase('LEGACY_LOGIN_LOOKUP', () =>
        this.db.membership.findMany({
          where: {
            legacyUsername: username,
            status: 'ACTIVE',
            tenant: { is: { status: 'ACTIVE' } },
          },
          select: {
            id: true,
            user: { include: { identity: true } },
          },
          orderBy: { id: 'asc' },
        }),
      );
    }
    user(userId: string) {
      return observeIamDatabase('USER_LOOKUP', () =>
        this.db.user.findUnique({ where: { id: userId }, include: { identity: true } }),
      );
    }
    memberships(userId: string) {
      return observeIamDatabase('MEMBERSHIPS_LOOKUP', () =>
        this.db.membership.findMany({
          where: { userId },
          include: membershipInclude,
          orderBy: { id: 'asc' },
        }),
      );
    }
    membership(id: string, userId: string) {
      return observeIamDatabase('MEMBERSHIP_LOOKUP', () =>
        this.db.membership.findFirst({ where: { id, userId }, include: membershipInclude }),
      );
    }
    session(id: string) {
      return observeIamDatabase('SESSION_LOOKUP', () =>
        this.db.session.findUnique({ where: { id } }),
      );
    }
    listSessions(userId: string) {
      return this.db.session.findMany({
        where: { userId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
        select: {
          id: true,
          tenantId: true,
          userAgent: true,
          ipAddress: true,
          createdAt: true,
          lastUsedAt: true,
          expiresAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    }
    async createSession(
      userId: string,
      tenantId: string,
      membershipId: string,
      hash: string,
      expiresAt: Date,
      metadata: RequestMetadata,
      mfa: boolean,
    ) {
      return observeIamDatabase('SESSION_CREATE', () =>
        this.db.session.create({
          data: {
            userId,
            tenantId,
            membershipId,
            tokenHash: hash,
            expiresAt,
            userAgent: metadata.userAgent,
            ipAddress: metadata.ipAddress,
            mfaVerifiedAt: mfa ? new Date() : null,
            refreshTokens: { create: { tokenHash: hash, expiresAt } },
          },
        }),
      );
    }
    refresh(hash: string) {
      return observeIamDatabase('REFRESH_LOOKUP', () =>
        this.db.refreshToken.findUnique({
          where: { tokenHash: hash },
          include: { session: true },
        }),
      );
    }
    async rotate(sessionId: string, oldId: string, hash: string, expiresAt: Date): Promise<void> {
      await this.db.refreshToken.update({ where: { id: oldId }, data: { consumedAt: new Date() } });
      await this.db.refreshToken.create({ data: { sessionId, tokenHash: hash, expiresAt } });
      await this.db.session.update({
        where: { id: sessionId },
        data: { tokenHash: hash, lastUsedAt: new Date() },
      });
    }
    revoke(userId: string, sessionId?: string) {
      return observeIamDatabase('SESSION_REVOKE', () =>
        this.db.session.updateMany({
          where: { userId, ...(sessionId ? { id: sessionId } : {}), status: 'ACTIVE' },
          data: { status: 'REVOKED', revokedAt: new Date() },
        }),
      );
    }
    token(hash: string, purpose: AuthTokenPurpose) {
      return observeIamDatabase('TOKEN_LOOKUP', () =>
        this.db.authToken.findFirst({
          where: { tokenHash: hash, purpose, usedAt: null, expiresAt: { gt: new Date() } },
        }),
      );
    }
    async createToken(
      userId: string,
      hash: string,
      purpose: AuthTokenPurpose,
      expiresAt: Date,
      membershipId?: string,
      encryptedSecret?: string,
    ): Promise<{ id: string }> {
      return observeIamDatabase(
        purpose === 'MFA_ENROLL' || purpose === 'MFA_LOGIN' ? 'MFA_CHALLENGE_CREATE' : 'TOKEN_CREATE',
        () =>
          this.db.authToken.create({
            data: {
              userId,
              tokenHash: hash,
              purpose,
              expiresAt,
              ...(membershipId ? { membershipId } : {}),
              ...(encryptedSecret ? { encryptedSecret } : {}),
            },
            select: { id: true },
          }),
      );
    }
    requestDelivery(tenantId: string, tokenId: string, purpose: 'ACTIVATION' | 'PASSWORD_RESET') {
      return this.db.outboxEvent.create({
        data: {
          tenantId,
          aggregateType: 'auth_token',
          aggregateId: tokenId,
          eventType:
            purpose === 'ACTIVATION'
              ? 'iam.account.activation.requested.v1'
              : 'iam.password.reset.requested.v1',
          payload: { schemaVersion: 1 },
        },
      });
    }
    async useToken(id: string): Promise<void> {
      const result = await this.db.authToken.updateMany({
        where: { id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (result.count !== 1) throw new IamError('AUTH_TOKEN_INVALID');
    }
    invalidateTokens(userId: string, purpose?: AuthTokenPurpose) {
      return this.db.authToken.updateMany({
        where: { userId, usedAt: null, ...(purpose ? { purpose } : {}) },
        data: { usedAt: new Date() },
      });
    }
    async password(userId: string, hash: string): Promise<void> {
      await this.db.authIdentity.upsert({
        where: { userId },
        create: {
          userId,
          passwordHash: hash,
          activatedAt: new Date(),
          passwordChangedAt: new Date(),
        },
        update: { passwordHash: hash, activatedAt: new Date(), passwordChangedAt: new Date() },
      });
    }
    async upgradeLegacyPasswordHash(
      userId: string,
      expectedHash: string,
      nextHash: string,
    ): Promise<boolean> {
      const result = await observeIamDatabase('PASSWORD_HASH_UPGRADE', () =>
        this.db.authIdentity.updateMany({
          where: { userId, passwordHash: expectedHash },
          data: { passwordHash: nextHash },
        }),
      );
      return result.count === 1;
    }
    setMfa(userId: string, encrypted: string, counter: bigint) {
      return observeIamDatabase('MFA_WRITE', () =>
        this.db.authIdentity.update({
          where: { userId },
          data: { mfaSecret: encrypted, mfaEnabledAt: new Date(), mfaLastCounter: counter },
        }),
      );
    }
    advanceMfa(userId: string, counter: bigint) {
      return observeIamDatabase('MFA_WRITE', () =>
        this.db.authIdentity.updateMany({
          where: { userId, mfaLastCounter: { lt: counter } },
          data: { mfaLastCounter: counter },
        }),
      );
    }
    clearMfa(userId: string) {
      return this.db.authIdentity.update({
        where: { userId },
        data: { mfaSecret: null, mfaEnabledAt: null, mfaLastCounter: -1 },
      });
    }
    audit(
      action: string,
      metadata: Pick<RequestMetadata, 'requestId'>,
      userId?: string,
      tenantId?: string,
      subjectId?: string,
    ) {
      return observeIamDatabase(action === 'login.failed' ? 'LOGIN_FAILURE_AUDIT' : 'AUDIT', () =>
        this.db.iamAuditLog.create({
          data: {
            action,
            requestId: metadata.requestId,
            ...(userId ? { userId } : {}),
            ...(tenantId ? { tenantId } : {}),
            ...(subjectId ? { subjectId } : {}),
          },
        }),
      );
    }
    role(id: string) {
      return this.db.role.findUnique({ where: { id } });
    }
    permission(id: string) {
      return this.db.permission.findUnique({ where: { id } });
    }
    async assignRole(membershipId: string, tenantId: string, roleId: string): Promise<void> {
      await this.db.membershipRole.upsert({
        where: { membershipId_roleId: { membershipId, roleId } },
        update: {},
        create: { tenantId, membershipId, roleId },
      });
    }
    async replaceRole(membershipId: string, tenantId: string, roleId: string): Promise<void> {
      await this.db.membershipRole.deleteMany({ where: { membershipId, tenantId } });
      await this.assignRole(membershipId, tenantId, roleId);
    }
    async grantPermission(
      roleId: string,
      permissionId: string,
      tenantId: string | null,
      scope: AccessScope,
    ): Promise<void> {
      await this.db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId } },
        update: { scope },
        create: { roleId, permissionId, tenantId, scope },
      });
    }
    membershipTarget(id: string, tenantId: string) {
      return this.db.membership.findFirst({ where: { id, tenantId } });
    }
    async importLegacyV2Owner(input: {
    email: string;
    displayName: string;
    legacyUsername: string;
    passwordHash: string;
    tenantSlug: string;
    tenantName: string;
    roleCode: string;
    grants: readonly { permission: string; scope: AccessScope }[];
    requestId: string;
  }): Promise<{ userId: string; tenantId: string; membershipId: string; roleCode: string }> {
    if (!this.root) throw new IamError('LEGACY_V2_MIGRATION_UNAVAILABLE', 503);
    return this.root.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('lot16-owner-migration'))`;
        const alreadyUsed = await transaction.iamAuditLog.findFirst({
          where: { action: 'legacy.v2.owner.migrated' },
          select: { id: true },
        });
        if (alreadyUsed) throw new IamError('LEGACY_V2_MIGRATION_ALREADY_USED', 409);

        const [emailCollision, tenantCollision] = await Promise.all([
          transaction.user.findUnique({ where: { email: input.email }, select: { id: true } }),
          transaction.tenant.findUnique({ where: { slug: input.tenantSlug }, select: { id: true } }),
        ]);
        if (emailCollision || tenantCollision)
          throw new IamError('LEGACY_V2_MIGRATION_COLLISION', 409);

        const tenant = await transaction.tenant.create({
          data: { slug: input.tenantSlug, name: input.tenantName },
          select: { id: true },
        });
        const role = await transaction.role.create({
          data: {
            tenantId: tenant.id,
            code: input.roleCode,
            name: input.roleCode,
            scope: 'TENANT',
            isSystem: false,
          },
          select: { id: true },
        });
        for (const grant of input.grants) {
          const permission = await transaction.permission.upsert({
            where: { code: grant.permission },
            update: {},
            create: { code: grant.permission, description: grant.permission },
            select: { id: true },
          });
          await transaction.rolePermission.create({
            data: {
              roleId: role.id,
              permissionId: permission.id,
              tenantId: tenant.id,
              scope: grant.scope,
            },
          });
        }

        const user = await transaction.user.create({
          data: { email: input.email, displayName: input.displayName, preferredLocale: 'fr' },
          select: { id: true },
        });
        await transaction.authIdentity.create({
          data: {
            userId: user.id,
            passwordHash: input.passwordHash,
            activatedAt: new Date(),
            passwordChangedAt: null,
          },
        });
        const membership = await transaction.membership.create({
          data: {
            tenantId: tenant.id,
            userId: user.id,
            legacyUsername: input.legacyUsername,
            status: 'ACTIVE',
            preferredLocale: 'fr',
          },
          select: { id: true },
        });
        await transaction.membershipRole.create({
          data: { tenantId: tenant.id, membershipId: membership.id, roleId: role.id },
        });
        await transaction.iamAuditLog.create({
          data: {
            requestId: input.requestId,
            userId: user.id,
            tenantId: tenant.id,
            subjectId: user.id,
            action: 'legacy.v2.owner.migrated',
          },
        });
        return {
          userId: user.id,
          tenantId: tenant.id,
          membershipId: membership.id,
          roleCode: input.roleCode,
        };
      },
      {
        maxWait: 10_000,
        timeout: 30_000,
      },
    );
  }

  async invite(email: string, displayName: string, tenantId: string, roleId: string) {
    const user = await this.db.user.upsert({
      where: { email },
      update: {},
      create: { email, displayName },
    });
    await this.db.authIdentity.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });
    const membership = await this.db.membership.upsert({
      where: { tenantId_userId: { tenantId, userId: user.id } },
      update: {},
      create: { tenantId, userId: user.id },
    });
    await this.assignRole(membership.id, tenantId, roleId);
    return user;
  }
}
export type MembershipRecord = NonNullable<Awaited<ReturnType<IamRepository['membership']>>>;
