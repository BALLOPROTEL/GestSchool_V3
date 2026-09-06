import { randomUUID } from 'node:crypto';
import { permissionCodes, roleGrants, systemRoles } from '@gestschool/contracts';
import type { GestSchoolPrismaClient } from '../src/client.js';

export async function seedIam(prisma: GestSchoolPrismaClient): Promise<void> {
  await prisma.$transaction(async (db) => {
    const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: 'ecole-demo-locale' } });
    for (const code of permissionCodes) {
      await db.permission.upsert({
        where: { code },
        update: {},
        create: { code, description: code },
      });
    }
    for (const code of systemRoles) {
      const existing = await db.role.findFirst({ where: { code, tenantId: null } });
      const role =
        existing ??
        (await db.role.create({ data: { code, name: code, scope: 'SYSTEM', isSystem: true } }));
      const expected = roleGrants[code];
      const current = await db.rolePermission.findMany({
        where: { roleId: role.id },
        include: { permission: true },
      });
      const changed =
        current.length !== expected.length ||
        current.some(
          (item) =>
            !expected.some(
              (grant) => grant.permission === item.permission.code && grant.scope === item.scope,
            ),
        );
      if (changed) {
        await db.rolePermission.deleteMany({ where: { roleId: role.id } });
        for (const grant of expected) {
          const permission = await db.permission.findUniqueOrThrow({
            where: { code: grant.permission },
          });
          await db.rolePermission.create({
            data: { roleId: role.id, permissionId: permission.id, scope: grant.scope },
          });
        }
        await db.iamAuditLog.create({
          data: { requestId: randomUUID(), action: 'permission.changed', subjectId: role.id },
        });
      }
      // No default password or reusable activation token. Provision locally with iam:dev.
      const email = `${code.toLowerCase().replaceAll('_', '-')}@example.invalid`;
      const user = await db.user.upsert({
        where: { email },
        update: {},
        create: { email, displayName: `Démo ${code}` },
      });
      await db.authIdentity.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id },
      });
      const membership = await db.membership.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
        update: {},
        create: { tenantId: tenant.id, userId: user.id },
      });
      await db.membershipRole.upsert({
        where: { membershipId_roleId: { membershipId: membership.id, roleId: role.id } },
        update: {},
        create: { membershipId: membership.id, roleId: role.id, tenantId: tenant.id },
      });
    }
  });
}
