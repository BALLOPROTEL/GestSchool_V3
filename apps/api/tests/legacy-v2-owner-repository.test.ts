import { randomUUID } from 'node:crypto';
import { createPrismaClient } from '@gestschool/database';
import { roleGrants } from '@gestschool/contracts';
import { afterAll, describe, expect, it } from 'vitest';
import { IamRepository } from '../src/modules/iam/infrastructure/iam.repository.js';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) throw new Error('DATABASE_URL_REQUIRED');

const database = createPrismaClient(databaseUrl);
const repository = IamRepository.connect(databaseUrl);

afterAll(async () => {
  await repository.close();
  await database.$disconnect();
});

describe('LOT16 owner repository migration', () => {
  it('imports a full SCHOOL_ADMIN identity on a migrated database', async () => {
    const suffix = randomUUID();
    const requestId = randomUUID();
    const email = `lot16-${suffix}@example.invalid`;
    const legacyUsername = `legacy-${suffix}`;
    const tenantSlug = `lot16-${suffix}`;
    const passwordHash = '$argon2id$v=19$m=19456,t=2,p=1$lot16$repository-test';

    const result = await repository.importLegacyV2Owner({
      email,
      displayName: 'LOT16 Repository Test',
      legacyUsername,
      passwordHash,
      tenantSlug,
      tenantName: 'LOT16 Test Tenant',
      roleCode: 'SCHOOL_ADMIN',
      grants: roleGrants.SCHOOL_ADMIN,
      requestId,
    });

    const membership = await database.membership.findUniqueOrThrow({
      where: { id: result.membershipId },
    });
    expect(membership.userId).toBe(result.userId);
    expect(membership.tenantId).toBe(result.tenantId);
    expect(membership.legacyUsername).toBe(legacyUsername);

    const identity = await database.authIdentity.findUniqueOrThrow({
      where: { userId: result.userId },
    });
    expect(identity.passwordHash).toBe(passwordHash);

    const binding = await database.membershipRole.findFirstOrThrow({
      where: { membershipId: result.membershipId, tenantId: result.tenantId },
      include: { role: true },
    });
    expect(binding.role.code).toBe('SCHOOL_ADMIN');
    expect(binding.role.tenantId).toBe(result.tenantId);

    const expectedPermissions = new Set(roleGrants.SCHOOL_ADMIN.map((grant) => grant.permission));
    const grantCount = await database.rolePermission.count({
      where: { roleId: binding.roleId, tenantId: result.tenantId },
    });
    expect(grantCount).toBe(expectedPermissions.size);

    const audit = await database.iamAuditLog.findFirstOrThrow({
      where: {
        requestId,
        action: 'legacy.v2.owner.migrated',
        userId: result.userId,
        tenantId: result.tenantId,
      },
    });
    expect(audit.subjectId).toBe(result.userId);
  });
});
