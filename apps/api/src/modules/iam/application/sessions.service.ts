import type { LoginResult } from '@gestschool/contracts';
import {
  deny,
  type AccessClaims,
  type RequestContext,
  type RequestMetadata,
} from '../domain/context.js';
import { IamCrypto, opaqueToken, tokenHash } from '../infrastructure/crypto.js';
import type { IamRepository, MembershipRecord } from '../infrastructure/iam.repository.js';
import { MembershipsService, resolveMembership } from './memberships.service.js';

export interface SessionResult {
  body: Extract<LoginResult, { kind: 'session' }>;
  refresh: string;
  expiresAt: Date;
}
export class SessionsService {
  constructor(
    private readonly repository: IamRepository,
    private readonly crypto: IamCrypto,
  ) {}
  async create(
    repository: IamRepository,
    userId: string,
    membership: MembershipRecord,
    metadata: RequestMetadata,
    mfa: boolean,
  ): Promise<SessionResult> {
    const user = await repository.user(userId);
    if (!user?.identity?.activatedAt || user.disabledAt) deny('AUTH_INVALID_CREDENTIALS', 401);
    const refresh = opaqueToken();
    const expiresAt = new Date(Date.now() + this.crypto.config.sessionSeconds * 1000);
    const session = await repository.createSession(
      userId,
      membership.tenantId,
      membership.id,
      tokenHash(refresh),
      expiresAt,
      metadata,
      mfa,
    );
    return this.response(repository, session.id, membership, refresh, expiresAt);
  }
  private async response(
    repository: IamRepository,
    sessionId: string,
    membership: MembershipRecord,
    refresh: string,
    expiresAt: Date,
  ): Promise<SessionResult> {
    const user = await repository.user(membership.userId);
    if (!user) deny();
    const accessToken = await this.crypto.sign({
      sub: user.id,
      sid: sessionId,
      tid: membership.tenantId,
      mid: membership.id,
    });
    return {
      refresh,
      expiresAt,
      body: {
        kind: 'session',
        accessToken,
        expiresIn: this.crypto.config.accessSeconds,
        session: {
          user: { id: user.id, displayName: user.displayName },
          sessionId,
          membershipId: membership.id,
          tenant: { id: membership.tenantId, name: membership.tenant.name },
          ...resolveMembership(membership),
        },
      },
    };
  }
  async context(claims: AccessClaims, metadata: RequestMetadata): Promise<RequestContext> {
    const session = await this.repository.session(claims.sid);
    if (
      !session ||
      session.userId !== claims.sub ||
      session.tenantId !== claims.tid ||
      session.membershipId !== claims.mid ||
      session.status !== 'ACTIVE' ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    )
      deny('AUTH_SESSION_EXPIRED', 401);
    const user = await this.repository.user(claims.sub);
    if (!user?.identity?.activatedAt || user.disabledAt) deny('AUTH_SESSION_EXPIRED', 401);
    const memberships = new MembershipsService(this.repository);
    const membership = await memberships.select(claims.sub, claims.mid);
    if (
      (user.identity.mfaEnabledAt || (await memberships.requiresMfa(user.id))) &&
      !session.mfaVerifiedAt
    )
      deny('AUTH_MFA_REQUIRED', 401);
    return memberships.context(membership, session.id, metadata);
  }
  async refresh(token: string, metadata: RequestMetadata): Promise<SessionResult> {
    const record = await this.repository.refresh(tokenHash(token));
    if (!record) deny('AUTH_SESSION_EXPIRED', 401);
    const result = await this.repository.atomic(record.session.userId, async (repository) => {
      const current = await repository.refresh(tokenHash(token));
      if (!current) return null;
      if (current.consumedAt) {
        await repository.revoke(current.session.userId, current.sessionId);
        await repository.audit(
          'refresh.reuse_detected',
          metadata,
          current.session.userId,
          current.session.tenantId ?? undefined,
          current.sessionId,
        );
        return null; // Commit revocation before returning the public error.
      }
      const session = current.session;
      if (
        session.status !== 'ACTIVE' ||
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        current.expiresAt <= new Date() ||
        !session.membershipId
      )
        return null;
      const user = await repository.user(session.userId);
      if (!user?.identity?.activatedAt || user.disabledAt) return null;
      const memberships = new MembershipsService(repository);
      const membership = await memberships.select(user.id, session.membershipId);
      if (
        (user.identity.mfaEnabledAt || (await memberships.requiresMfa(user.id))) &&
        !session.mfaVerifiedAt
      )
        return null;
      const refresh = opaqueToken();
      await repository.rotate(session.id, current.id, tokenHash(refresh), session.expiresAt);
      return this.response(repository, session.id, membership, refresh, session.expiresAt);
    });
    if (!result) deny('AUTH_SESSION_EXPIRED', 401);
    return result;
  }
  async revoke(context: RequestContext, id?: string): Promise<void> {
    await this.repository.atomic(context.userId, async (repository) => {
      const result = await repository.revoke(context.userId, id);
      if (id && !result.count) deny('AUTH_SESSION_NOT_FOUND', 404);
      await repository.audit(
        id ? 'session.revoked' : 'session.logout_all',
        context,
        context.userId,
        context.tenantId,
        id,
      );
    });
  }
  list(context: RequestContext) {
    return this.repository.listSessions(context.userId);
  }
  async switch(context: RequestContext, membershipId: string): Promise<SessionResult> {
    return this.repository.atomic(context.userId, async (repository) => {
      const old = await repository.session(context.sessionId);
      if (!old || old.status !== 'ACTIVE' || old.revokedAt || old.expiresAt <= new Date())
        deny('AUTH_SESSION_EXPIRED', 401);
      const memberships = new MembershipsService(repository);
      const membership = await memberships.select(context.userId, membershipId);
      if ((await memberships.requiresMfa(context.userId)) && !old.mfaVerifiedAt)
        deny('AUTH_MFA_REQUIRED', 401);
      await repository.revoke(context.userId, old.id);
      const result = await this.create(
        repository,
        context.userId,
        membership,
        context,
        Boolean(old.mfaVerifiedAt),
      );
      await repository.audit(
        'tenant.switched',
        context,
        context.userId,
        membership.tenantId,
        membership.id,
      );
      return result;
    });
  }
}
