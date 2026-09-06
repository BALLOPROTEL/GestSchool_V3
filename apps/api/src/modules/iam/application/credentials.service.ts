import { deny, type RequestMetadata } from '../domain/context.js';
import { setTimeout } from 'node:timers/promises';
import { opaqueToken, Passwords, tokenHash, validatePassword } from '../infrastructure/crypto.js';
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
      await repository.invalidateTokens(user.id, purpose);
      const token = opaqueToken();
      await repository.createToken(
        user.id,
        tokenHash(token),
        purpose,
        new Date(Date.now() + (purpose === 'ACTIVATION' ? 86400000 : 900000)),
      );
      await repository.audit(
        purpose === 'ACTIVATION' ? 'activation.requested' : 'password.reset_requested',
        metadata,
        user.id,
      );
      return token;
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
