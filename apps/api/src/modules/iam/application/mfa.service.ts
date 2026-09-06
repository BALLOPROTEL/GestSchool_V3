import { deny, type RequestContext, type RequestMetadata } from '../domain/context.js';
import { IamCrypto, opaqueToken, Passwords, tokenHash } from '../infrastructure/crypto.js';
import type { IamRepository } from '../infrastructure/iam.repository.js';
import { MembershipsService } from './memberships.service.js';
import { SessionsService } from './sessions.service.js';

export class MfaService {
  constructor(
    private readonly repository: IamRepository,
    private readonly crypto: IamCrypto,
    private readonly passwords: Passwords,
    private readonly sessions: SessionsService,
  ) {}
  async setup(context: RequestContext, password: string): Promise<{ challenge: string }> {
    const user = await this.repository.user(context.userId);
    if (
      !(await this.passwords.verify(user?.identity?.passwordHash, password)) ||
      user?.identity?.mfaEnabledAt
    )
      deny('AUTH_INVALID_CREDENTIALS', 401);
    return this.repository.atomic(context.userId, async (repository) => {
      const current = await repository.user(context.userId);
      const session = await repository.session(context.sessionId);
      if (
        !current?.identity?.activatedAt ||
        current.disabledAt ||
        current.identity.mfaEnabledAt ||
        current.identity.passwordHash !== user?.identity?.passwordHash ||
        !session ||
        session.userId !== context.userId ||
        session.status !== 'ACTIVE' ||
        session.revokedAt ||
        session.expiresAt <= new Date()
      )
        deny('AUTH_SESSION_EXPIRED', 401);
      await new MembershipsService(repository).select(context.userId, context.membershipId);
      const challenge = opaqueToken();
      await repository.createToken(
        context.userId,
        tokenHash(challenge),
        'MFA_ENROLL',
        new Date(Date.now() + 300000),
        context.membershipId,
      );
      return { challenge };
    });
  }
  async enroll(challenge: string): Promise<{ challenge: string; secret: string; uri: string }> {
    const token = await this.repository.token(tokenHash(challenge), 'MFA_ENROLL');
    if (!token) deny('AUTH_TOKEN_INVALID', 400);
    return this.repository.atomic(token.userId, async (repository) => {
      const current = await repository.token(tokenHash(challenge), 'MFA_ENROLL');
      const user = await repository.user(token.userId);
      if (
        !current ||
        current.encryptedSecret ||
        !current.membershipId ||
        !user?.identity?.activatedAt ||
        user.disabledAt ||
        user.identity.mfaEnabledAt
      )
        deny('AUTH_TOKEN_INVALID', 400);
      await new MembershipsService(repository).select(user.id, current.membershipId);
      await repository.useToken(current.id);
      const totp = this.crypto.newTotp();
      const next = opaqueToken();
      await repository.createToken(
        user.id,
        tokenHash(next),
        'MFA_ENROLL',
        current.expiresAt,
        current.membershipId,
        this.crypto.encrypt(totp.secret, user.id),
      );
      return { challenge: next, ...totp };
    });
  }
  async verify(challenge: string, code: string, enrollment: boolean, metadata: RequestMetadata) {
    const purpose = enrollment ? 'MFA_ENROLL' : 'MFA_LOGIN';
    const token = await this.repository.token(tokenHash(challenge), purpose);
    if (!token) deny('AUTH_TOKEN_INVALID', 400);
    return this.repository.atomic(token.userId, async (repository) => {
      const current = await repository.token(tokenHash(challenge), purpose);
      const user = await repository.user(token.userId);
      if (!current?.membershipId || !user?.identity?.activatedAt || user.disabledAt)
        deny('AUTH_TOKEN_INVALID', 400);
      const encrypted = enrollment ? current.encryptedSecret : user.identity.mfaSecret;
      if (!encrypted || (enrollment && user.identity.mfaEnabledAt)) deny('AUTH_MFA_INVALID', 401);
      const counter = this.crypto.counter(this.crypto.decrypt(encrypted, user.id), code);
      if (counter === null || (!enrollment && counter <= user.identity.mfaLastCounter))
        deny('AUTH_MFA_INVALID', 401);
      const membership = await new MembershipsService(repository).select(
        user.id,
        current.membershipId,
      );
      if (enrollment) {
        await repository.setMfa(user.id, encrypted, counter);
        await repository.revoke(user.id);
        await repository.audit('mfa.enabled', metadata, user.id, membership.tenantId);
      } else if ((await repository.advanceMfa(user.id, counter)).count !== 1)
        deny('AUTH_MFA_INVALID', 401);
      await repository.useToken(current.id);
      const result = await this.sessions.create(repository, user.id, membership, metadata, true);
      await repository.audit(
        'login.succeeded',
        metadata,
        user.id,
        membership.tenantId,
        result.body.session.sessionId,
      );
      return result;
    });
  }
  async disable(context: RequestContext, password: string, code: string): Promise<void> {
    const initial = await this.repository.user(context.userId);
    if (!(await this.passwords.verify(initial?.identity?.passwordHash, password)))
      deny('AUTH_INVALID_CREDENTIALS', 401);
    await this.repository.atomic(context.userId, async (repository) => {
      if (await new MembershipsService(repository).requiresMfa(context.userId))
        deny('AUTH_MFA_REQUIRED', 403);
      const user = await repository.user(context.userId);
      if (
        !user?.identity?.mfaSecret ||
        user.disabledAt ||
        user.identity.passwordHash !== initial?.identity?.passwordHash
      )
        deny('AUTH_MFA_INVALID', 401);
      const counter = this.crypto.counter(
        this.crypto.decrypt(user.identity.mfaSecret, user.id),
        code,
      );
      if (counter === null || counter <= user.identity.mfaLastCounter)
        deny('AUTH_MFA_INVALID', 401);
      await repository.clearMfa(user.id);
      await repository.invalidateTokens(user.id);
      await repository.revoke(user.id);
      await repository.audit('mfa.disabled', context, user.id, context.tenantId);
    });
  }
}
