import { createHash, timingSafeEqual } from 'node:crypto';
import { roleGrants, type SystemRole } from '@gestschool/contracts';
import { z } from 'zod';
import { IamError, type RequestMetadata } from '../domain/context.js';
import type { Passwords } from '../infrastructure/crypto.js';
import type { IamRepository } from '../infrastructure/iam.repository.js';

const v2BaseUrl = 'https://gestschool-ylik.onrender.com/api/v1';
const roleMap: Readonly<Record<string, SystemRole>> = {
  ADMIN: 'SCHOOL_ADMIN',
  SCOLARITE: 'ACADEMIC_STAFF',
  ENSEIGNANT: 'TEACHER',
  COMPTABLE: 'ACCOUNTANT',
  PARENT: 'PARENT',
  STUDENT: 'STUDENT',
};

const v2Login = z.object({
  accessToken: z.string().min(20),
  refreshToken: z.string().min(20),
  user: z.object({
    id: z.string().min(1),
    username: z.string().min(1).max(150),
    role: z.string().min(1),
    tenantId: z.string().min(1),
  }),
});

const v2Profile = z.object({
  user: z.object({
    id: z.string().min(1),
    tenantId: z.string().min(1),
    username: z.string().min(1).max(150),
    role: z.string().min(1),
    email: z.string().email().nullable().optional(),
    displayName: z.string().max(160).nullable().optional(),
    firstName: z.string().max(160).nullable().optional(),
    lastName: z.string().max(160).nullable().optional(),
    isActive: z.boolean(),
  }),
  context: z.object({
    tenantId: z.string().min(1),
    tenantName: z.string().min(1).max(160),
  }),
});

type Repository = Pick<IamRepository, 'importLegacyV2Owner'>;
type PasswordHasher = Pick<Passwords, 'hash'>;
type Fetcher = typeof fetch;

const digest = (value: string): Buffer =>
  Buffer.from(createHash('sha256').update(value).digest('hex'), 'hex');

const codeHash = (environment: NodeJS.ProcessEnv): Buffer | null => {
  const value = environment['LEGACY_V2_OWNER_MIGRATION_CODE_SHA256'];
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) return null;
  return Buffer.from(value, 'hex');
};

const enabled = (environment: NodeJS.ProcessEnv): boolean =>
  environment['LEGACY_V2_OWNER_MIGRATION_ENABLED'] === 'true' &&
  environment['APP_ENV'] === 'staging' &&
  environment['NODE_ENV'] === 'production' &&
  environment['IAM_ENV'] === 'staging' &&
  environment['APP_PUBLIC_ORIGIN'] === 'https://gestschool-v3-staging.vercel.app';

const sourceTenantSlug = (tenantId: string): string =>
  `v2-${createHash('sha256').update(tenantId).digest('hex').slice(0, 24)}`;

const emailFromProfile = (profile: z.infer<typeof v2Profile>): string | null => {
  const explicit = profile.user.email?.trim().toLowerCase();
  if (explicit) return explicit;
  const username = profile.user.username.trim().toLowerCase();
  return z.string().email().safeParse(username).success ? username : null;
};

export class LegacyV2OwnerMigrationService {
  constructor(
    private readonly repository: Repository,
    private readonly passwords: PasswordHasher,
    private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  private verifyCode(value: string): void {
    const expected = codeHash(this.environment);
    if (!enabled(this.environment) || !expected)
      throw new IamError('LEGACY_V2_MIGRATION_DISABLED', 404);
    const actual = digest(value);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new IamError('LEGACY_V2_MIGRATION_INVALID', 401);
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetcher(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
        headers: {
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
      });
    } catch {
      throw new IamError('LEGACY_V2_MIGRATION_UNAVAILABLE', 503);
    }
  }

  async migrate(
    identifier: string,
    password: string,
    migrationCode: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    this.verifyCode(migrationCode);

    let refreshToken = '';
    const loginResponse = await this.request(`${v2BaseUrl}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ username: identifier.trim(), password }),
    });
    if (loginResponse.status === 401) throw new IamError('LEGACY_V2_MIGRATION_INVALID', 401);
    if (loginResponse.status === 429) throw new IamError('AUTH_RATE_LIMITED', 429);
    if (!loginResponse.ok) throw new IamError('LEGACY_V2_MIGRATION_UNAVAILABLE', 503);

    let login: z.infer<typeof v2Login>;
    try {
      login = v2Login.parse(await loginResponse.json());
      refreshToken = login.refreshToken;
    } catch {
      throw new IamError('LEGACY_V2_MIGRATION_UNAVAILABLE', 503);
    }

    try {
      const profileResponse = await this.request(`${v2BaseUrl}/users/me`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${login.accessToken}`,
          'x-tenant-id': login.user.tenantId,
        },
      });
      if (!profileResponse.ok) throw new IamError('LEGACY_V2_MIGRATION_UNAVAILABLE', 503);

      let profile: z.infer<typeof v2Profile>;
      try {
        profile = v2Profile.parse(await profileResponse.json());
      } catch {
        throw new IamError('LEGACY_V2_MIGRATION_UNAVAILABLE', 503);
      }

      if (
        !profile.user.isActive ||
        profile.user.id !== login.user.id ||
        profile.user.tenantId !== login.user.tenantId ||
        profile.context.tenantId !== login.user.tenantId ||
        profile.user.username !== login.user.username ||
        profile.user.role !== login.user.role
      )
        throw new IamError('LEGACY_V2_MIGRATION_INVALID', 401);

      const targetRole = roleMap[profile.user.role.toUpperCase()];
      if (!targetRole) throw new IamError('LEGACY_V2_MIGRATION_UNSUPPORTED', 409);
      const email = emailFromProfile(profile);
      if (!email) throw new IamError('LEGACY_V2_MIGRATION_EMAIL_REQUIRED', 409);

      const displayName =
        profile.user.displayName?.trim() ||
        [profile.user.firstName, profile.user.lastName].filter(Boolean).join(' ').trim() ||
        profile.user.username;
      const passwordHash = await this.passwords.hash(password);

      await this.repository.importLegacyV2Owner({
        email,
        displayName: displayName.slice(0, 160),
        legacyUsername: profile.user.username,
        passwordHash,
        tenantSlug: sourceTenantSlug(login.user.tenantId),
        tenantName: profile.context.tenantName,
        roleCode: targetRole,
        grants: roleGrants[targetRole],
        requestId: metadata.requestId,
      });
    } finally {
      if (refreshToken) {
        await this.request(`${v2BaseUrl}/auth/logout`, {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        }).catch(() => undefined);
      }
      refreshToken = '';
    }
  }
}
