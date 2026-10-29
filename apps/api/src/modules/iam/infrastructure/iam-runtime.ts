import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { loadMessagingConfig } from '@gestschool/config/messaging';
import { AuthService } from '../application/auth.service.js';
import { CredentialsService } from '../application/credentials.service.js';
import { MembershipsService } from '../application/memberships.service.js';
import { SessionsService } from '../application/sessions.service.js';
import { MfaService } from '../application/mfa.service.js';
import { UsersService } from '../application/users.service.js';
import { LegacyV2OwnerMigrationService } from '../application/legacy-v2-owner-migration.service.js';
import { IamCrypto, Passwords } from './crypto.js';
import type { IamConfig } from './iam-config.js';
import { IamRepository } from './iam.repository.js';
import { RateLimiter } from './rate-limiter.js';

export class IamRuntime implements OnModuleInit, OnModuleDestroy {
  readonly repository: IamRepository;
  readonly crypto: IamCrypto;
  readonly passwords = new Passwords();
  readonly limiter: RateLimiter;
  readonly sessions: SessionsService;
  readonly memberships: MembershipsService;
  readonly auth: AuthService;
  readonly credentials: CredentialsService;
  readonly mfa: MfaService;
  readonly users: UsersService;
  readonly legacyV2OwnerMigration: LegacyV2OwnerMigrationService;
  constructor(
    readonly config: IamConfig,
    databaseUrl: string,
    redisUrl: string,
  ) {
    if (process.env['NODE_ENV'] === 'production') loadMessagingConfig();
    this.repository = IamRepository.connect(databaseUrl);
    this.crypto = new IamCrypto(config);
    this.limiter = new RateLimiter(redisUrl, config.redisPrefix);
    this.sessions = new SessionsService(this.repository, this.crypto);
    this.memberships = new MembershipsService(this.repository);
    this.auth = new AuthService(this.repository, this.passwords, this.sessions);
    this.credentials = new CredentialsService(this.repository, this.passwords);
    this.mfa = new MfaService(this.repository, this.crypto, this.passwords, this.sessions);
    this.users = new UsersService(this.repository, this.credentials);
    this.legacyV2OwnerMigration = new LegacyV2OwnerMigrationService(
      this.repository,
      this.passwords,
    );
  }
  async onModuleInit(): Promise<void> {
    await this.limiter.open();
  }
  async onModuleDestroy(): Promise<void> {
    await this.limiter.close();
    await this.repository.close();
  }
}
