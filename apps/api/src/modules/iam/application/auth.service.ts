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
  async login(
    email: string,
    password: string,
    metadata: RequestMetadata,
  ): Promise<SessionResult | { body: Extract<LoginResult, { kind: 'mfa' }> }> {
    const user = await this.repository.userByEmail(email);
    const valid = await this.passwords.verify(user?.identity?.passwordHash, password);
    if (!valid || !user?.identity?.activatedAt || user.disabledAt) {
      await this.repository.audit('login.failed', metadata);
      deny('AUTH_INVALID_CREDENTIALS', 401);
    }
    try {
      return await this.repository.atomic(user.id, async (repository) => {
        const current = await repository.user(user.id);
        if (current?.disabledAt || current?.identity?.passwordHash !== user.identity?.passwordHash)
          deny('AUTH_INVALID_CREDENTIALS', 401);
        const memberships = new MembershipsService(repository);
        const membership = await memberships.select(user.id);
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
