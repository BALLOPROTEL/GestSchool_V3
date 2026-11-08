import { describe, expect, it, vi } from 'vitest';

import type { IamRepository } from '../modules/iam/infrastructure/iam.repository.js';
import {
  provisionStagingRoleFixtures,
  stagingRoleFixtures,
} from './staging-role-fixtures-startup.js';

const tenant = { id: 'tenant-1', status: 'ACTIVE' };
const systemSuperAdmin = {
  id: 'role-super-admin',
  code: 'SUPER_ADMIN',
  name: 'SUPER_ADMIN',
  scope: 'SYSTEM',
  isSystem: true,
  tenantId: null,
} as const;

const tenantRoles = stagingRoleFixtures
  .filter((fixture) => fixture.role !== 'SUPER_ADMIN')
  .map((fixture, index) => ({
    id: `role-tenant-${index + 1}`,
    code: fixture.role,
    name: fixture.role,
    scope: 'TENANT',
    isSystem: false,
    tenantId: tenant.id,
  }));

function fixtureRole(role: string) {
  return role === 'SUPER_ADMIN'
    ? systemSuperAdmin
    : tenantRoles.find((item) => item.code === role);
}

function membership(id: string, userId: string, role: string, status: 'ACTIVE' | 'INVITED') {
  return {
    id,
    userId,
    tenantId: tenant.id,
    status,
    tenant,
    roles: [
      {
        role: {
          id: fixtureRole(role)?.id ?? 'wrong-role',
          code: role,
        },
      },
    ],
  };
}

interface FakeUser {
  id: string;
  email: string;
  displayName?: string;
  disabledAt: null;
  identity: { activatedAt: Date | null };
}

type FakeMembership = ReturnType<typeof membership>;

function fakeRepository(existing = false) {
  const users = new Map<string, FakeUser>();
  const membershipsByUser = new Map<string, FakeMembership[]>();
  const owner: FakeUser = {
    id: 'owner-1',
    email: 'owner@example.com',
    disabledAt: null,
    identity: { activatedAt: new Date() },
  };

  users.set(owner.email, owner);
  membershipsByUser.set(owner.id, [
    membership('owner-membership', owner.id, 'SCHOOL_ADMIN', 'ACTIVE'),
  ]);

  if (existing) {
    for (const [index, fixture] of stagingRoleFixtures.entries()) {
      const user: FakeUser = {
        id: `user-${index + 1}`,
        email: fixture.email,
        disabledAt: null,
        identity: { activatedAt: null },
      };
      users.set(fixture.email, user);
      membershipsByUser.set(user.id, [
        membership(`membership-${index + 1}`, user.id, fixture.role, 'INVITED'),
      ]);
    }
  }

  let repository!: IamRepository;
  const raw = {
    userByEmail: vi.fn(async (email: string) => users.get(email) ?? null),
    memberships: vi.fn(async (userId: string) => membershipsByUser.get(userId) ?? []),
    ensureSystemRole: vi.fn(async (code: string) => {
      if (code !== 'SUPER_ADMIN') throw new Error('unexpected system role');
      return { id: systemSuperAdmin.id, code: systemSuperAdmin.code };
    }),
    ensureTenantRole: vi.fn(async (_tenantId: string, code: string) => {
      const role = tenantRoles.find((item) => item.code === code);
      if (!role) throw new Error('missing role');
      return { id: role.id, code: role.code };
    }),
    replaceRole: vi.fn(async (membershipId: string, _tenantId: string, roleId: string) => {
      if (membershipId !== 'owner-membership') return;
      const current = membershipsByUser.get(owner.id)?.[0];
      if (!current) throw new Error('missing owner membership');
      const role = [systemSuperAdmin, ...tenantRoles].find((item) => item.id === roleId);
      if (!role) throw new Error('missing role');
      current.roles = [{ role: { id: role.id, code: role.code } }];
    }),
    revokeMembershipSessions: vi.fn(async () => ({ count: 1 })),
    invalidateMembershipTokens: vi.fn(async () => ({ count: 1 })),
    audit: vi.fn(async () => undefined),
    atomic: vi.fn(async (_userId: string, run: (current: IamRepository) => Promise<unknown>) =>
      run(repository),
    ),
    invite: vi.fn(async (email: string, displayName: string, _tenantId: string, roleId: string) => {
      const index = users.size;
      const user: FakeUser = {
        id: `created-${index}`,
        email,
        displayName,
        disabledAt: null,
        identity: { activatedAt: null },
      };
      const role = [systemSuperAdmin, ...tenantRoles].find((item) => item.id === roleId);
      if (!role) throw new Error('missing role');

      const created = membership(`created-membership-${index}`, user.id, role.code, 'INVITED');
      users.set(email, user);
      membershipsByUser.set(user.id, [created]);
      return { user, membership: created, activationRequired: true };
    }),
  };

  repository = raw as unknown as IamRepository;
  return { repository, raw, users, membershipsByUser };
}

describe('staging role fixtures provisioning', () => {
  it('promotes the owner and creates eight invitation memberships', async () => {
    const { repository, raw } = fakeRepository();
    const issue = vi.fn(
      async (_membershipId: string, _tenantId: string, _metadata: unknown) => undefined,
    );

    const result = await provisionStagingRoleFixtures(repository, 'owner@example.com', issue, {
      requestId: 'request-1',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
    });

    expect(result).toEqual({ created: 8, existing: 0, ownerPromoted: true });
    expect(raw.ensureSystemRole).toHaveBeenCalledTimes(1);
    expect(raw.ensureTenantRole).toHaveBeenCalledTimes(7);
    expect(raw.replaceRole).toHaveBeenCalledTimes(1);
    expect(raw.revokeMembershipSessions).toHaveBeenCalledWith('owner-1', 'owner-membership');
    expect(raw.invalidateMembershipTokens).toHaveBeenCalledWith('owner-1', 'owner-membership');
    expect(raw.invite).toHaveBeenCalledTimes(8);
    expect(issue).toHaveBeenCalledTimes(8);
  });

  it('is idempotent for existing invited fixtures', async () => {
    const { repository, raw } = fakeRepository(true);
    const issue = vi.fn(
      async (_membershipId: string, _tenantId: string, _metadata: unknown) => undefined,
    );

    const result = await provisionStagingRoleFixtures(repository, 'owner@example.com', issue, {
      requestId: 'request-2',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
    });

    expect(result).toEqual({ created: 0, existing: 8, ownerPromoted: true });
    expect(raw.invite).not.toHaveBeenCalled();
    expect(issue).toHaveBeenCalledTimes(8);
  });

  it('refuses an existing fixture bound to the wrong role', async () => {
    const { repository, users, membershipsByUser } = fakeRepository(true);
    const target = users.get(stagingRoleFixtures[0].email);
    if (!target) throw new Error('missing fixture user');

    const bound = membershipsByUser.get(target.id)?.[0];
    if (!bound) throw new Error('missing fixture membership');
    bound.roles = [{ role: { id: 'wrong-role', code: stagingRoleFixtures[0].role } }];

    await expect(
      provisionStagingRoleFixtures(
        repository,
        'owner@example.com',
        vi.fn(async (_membershipId: string, _tenantId: string, _metadata: unknown) => undefined),
        { requestId: 'request-3', ipAddress: '127.0.0.1', userAgent: 'test' },
      ),
    ).rejects.toThrow('STAGING_ROLE_FIXTURES_STARTUP_FAILED');
  });
});
