import type { LoginResult } from '@gestschool/contracts';
import { deny, type RequestMetadata } from '../domain/context.js';
import { opaqueToken, Passwords, tokenHash } from '../infrastructure/crypto.js';
import type { IamRepository } from '../infrastructure/iam.repository.js';
import { MembershipsService } from './memberships.service.js';
import { SessionsService, type SessionResult } from './sessions.service.js';

export class AuthService {
  constructor(
    private readonly repository: IamRepository,
    private readonly passwords: Passwords,
    private readonly sessions: SessionsService,
  ) {}

  private async resolveIdentifier(identifier: string) {
    const value = identifier.trim();
    if (!value) return null;

    if (value.includes('@')) {
      const user = await this.repository.userByEmail(value.toLowerCase());
      if (user) return { user, membershipId: undefined as string | undefined };
    }

    const candidates = await this.repository.legacyLoginCandidates(value);
    if (!candidates.length) return null;
    const userIds = new Set(candidates.map((candidate) => candidate.user.id));
    if (userIds.size !== 1) return null;

    const candidate = candidates[0];
    if (!candidate) return null;
    return { user: candidate.user, membershipId: candidate.id };
  }

  async login(
    identifier: string,
    password: string,
    metadata: RequestMetadata,
  ): Promise<SessionResult | { body: Extract<LoginResult, { kind: 'mfa' }> }> {
    const resolved = await this.resolveIdentifier(identifier);
    const user = resolved?.user;
    const verification = await this.passwords.verifyForLogin(user?.identity?.passwordHash, password);

    if (!verification.valid || !user?.identity?.activatedAt || user.disabledAt) {
      await this.repository.audit('login.failed', metadata);
      deny('AUTH_INVALID_CREDENTIALS', 401);
    }

    const expectedHash = user.identity.passwordHash;
    try {
      return await this.repository.atomic(user.id, async (repository) => {
        const current = await repository.user(user.id);
        if (current?.disabledAt || current?.identity?.passwordHash !== expectedHash)
          deny('AUTH_INVALID_CREDENTIALS', 401);

        const memberships = new MembershipsService(repository);
        const membership = await memberships.select(user.id, resolved?.membershipId);

        if (verification.upgradedHash) {
          const upgraded = await repository.upgradeLegacyPasswordHash(
            user.id,
            expectedHash,
            verification.upgradedHash,
          );
          if (!upgraded) deny('AUTH_INVALID_CREDENTIALS', 401);
          await repository.audit(
            'login.password_hash_upgraded',
            metadata,
            user.id,
            membership.tenantId,
          );
        }

        if (current?.identity?.mfaEnabledAt || (await memberships.requiresMfa(user.id))) {
          const challenge = opaqueToken();
          const enrollmentRequired = !current?.identity?.mfaEnabledAt;
          await repository.createToken(
            user.id,
            tokenHash(challenge),
            enrollmentRequired ? 'MFA_ENROLL' : 'MFA_LOGIN',
            new Date(Date.now() + 300000),
            membership.id,
          );
          return { body: { kind: 'mfa', challenge, enrollmentRequired } };
        }

        const result = await this.sessions.create(repository, user.id, membership, metadata, false);
        await repository.audit(
          'login.succeeded',
          metadata,
          user.id,
          membership.tenantId,
          result.body.session.sessionId,
        );
        return result;
      });
    } catch (error) {
      await this.repository.audit('login.failed', metadata);
      throw error;
    }
  }
}
