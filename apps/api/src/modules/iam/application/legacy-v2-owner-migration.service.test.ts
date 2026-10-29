import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { IamError } from '../domain/context.js';
import { LegacyV2OwnerMigrationService } from './legacy-v2-owner-migration.service.js';

const migrationCode = 'owner-migration-code-2026-secure';
const environment = {
  LEGACY_V2_OWNER_MIGRATION_ENABLED: 'true',
  LEGACY_V2_OWNER_MIGRATION_CODE_SHA256: createHash('sha256').update(migrationCode).digest('hex'),
  APP_ENV: 'staging',
  NODE_ENV: 'production',
  IAM_ENV: 'staging',
  APP_PUBLIC_ORIGIN: 'https://gestschool-v3-staging.vercel.app',
};

const login = {
  accessToken: 'a'.repeat(43),
  refreshToken: 'b'.repeat(43),
  user: {
    id: 'v2-user',
    username: 'owner',
    role: 'ADMIN',
    tenantId: 'v2-tenant',
  },
};
const profile = {
  user: {
    id: 'v2-user',
    tenantId: 'v2-tenant',
    username: 'owner',
    role: 'ADMIN',
    email: 'owner@example.test',
    displayName: 'Owner Test',
    isActive: true,
  },
  context: { tenantId: 'v2-tenant', tenantName: 'École V2' },
};
const metadata = {
  requestId: '00000000-0000-4000-8000-000000000099',
  ipAddress: '127.0.0.1',
  userAgent: 'vitest',
};

describe('LegacyV2OwnerMigrationService', () => {
  it('rejects an invalid migration code before contacting V2', async () => {
    const fetcher = vi.fn();
    const service = new LegacyV2OwnerMigrationService(
      { importLegacyV2Owner: vi.fn() },
      { hash: vi.fn() },
      environment,
      fetcher as typeof fetch,
    );
    await expect(
      service.migrate('owner', 'secret', 'wrong-code-that-is-long-enough', metadata),
    ).rejects.toMatchObject({ code: 'LEGACY_V2_MIGRATION_INVALID', status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('imports one verified V2 identity and revokes the V2 refresh token', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(login))
      .mockResolvedValueOnce(Response.json(profile))
      .mockResolvedValueOnce(Response.json({}));
    const imported = vi.fn().mockResolvedValue({
      userId: 'v3-user',
      tenantId: 'v3-tenant',
      membershipId: 'v3-membership',
      roleCode: 'SCHOOL_ADMIN',
    });
    const hash = vi.fn().mockResolvedValue('$argon2id$test');
    const service = new LegacyV2OwnerMigrationService(
      { importLegacyV2Owner: imported },
      { hash },
      environment,
      fetcher as typeof fetch,
    );

    await service.migrate('owner', 'current-v2-password', migrationCode, metadata);

    expect(hash).toHaveBeenCalledWith('current-v2-password');
    expect(imported).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'owner@example.test',
        legacyUsername: 'owner',
        roleCode: 'SCHOOL_ADMIN',
        passwordHash: '$argon2id$test',
        requestId: metadata.requestId,
      }),
    );
    const importPayload = imported.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(importPayload).not.toHaveProperty('password');
    expect(importPayload).not.toHaveProperty('accessToken');
    expect(importPayload).not.toHaveProperty('refreshToken');
    expect(fetcher).toHaveBeenCalledTimes(3);
    const logoutBody = JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body)) as {
      refreshToken: string;
    };
    expect(logoutBody.refreshToken).toBe(login.refreshToken);
  });

  it('fails closed when V2 has no usable email and still logs out of V2', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(login))
      .mockResolvedValueOnce(
        Response.json({
          ...profile,
          user: { ...profile.user, email: null, username: 'owner-no-email' },
        }),
      )
      .mockResolvedValueOnce(Response.json({}));
    const service = new LegacyV2OwnerMigrationService(
      { importLegacyV2Owner: vi.fn() },
      { hash: vi.fn() },
      environment,
      fetcher as typeof fetch,
    );

    await expect(
      service.migrate('owner', 'current-v2-password', migrationCode, metadata),
    ).rejects.toBeInstanceOf(IamError);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('does not write V3 data when V2 is unavailable', async () => {
    const imported = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    const service = new LegacyV2OwnerMigrationService(
      { importLegacyV2Owner: imported },
      { hash: vi.fn() },
      environment,
      fetcher as typeof fetch,
    );

    await expect(
      service.migrate('owner', 'current-v2-password', migrationCode, metadata),
    ).rejects.toMatchObject({ code: 'LEGACY_V2_MIGRATION_UNAVAILABLE', status: 503 });
    expect(imported).not.toHaveBeenCalled();
  });
});
