import { randomUUID } from 'node:crypto';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { createPrismaClient } from '@gestschool/database';
import { afterAll, describe, expect, it } from 'vitest';
import type { RequestContext } from '../src/modules/iam/domain/context.js';
import { AuditDatabase } from '../src/modules/audit/infrastructure/database.js';
import { PrismaAuditRepository } from '../src/modules/audit/infrastructure/audit.repository.js';
import { auditAccess } from '../src/modules/audit/domain/policy.js';

const database = createPrismaClient(loadInfrastructureConfig().databaseUrl);
const auditDatabase = new AuditDatabase();
const repository = new PrismaAuditRepository(auditDatabase);

function context(input: {
  tenantId: string;
  userId: string;
  membershipId: string;
  grants?: RequestContext['grants'];
}): RequestContext {
  return {
    userId: input.userId,
    sessionId: randomUUID(),
    membershipId: input.membershipId,
    tenantId: input.tenantId,
    roles: ['SCHOOL_ADMIN'],
    grants: input.grants ?? [{ permission: 'audit.read', scope: 'TENANT' }],
    requestId: randomUUID(),
    ipAddress: '127.0.0.1',
    userAgent: 'audit-test',
  };
}

async function actorFixture(label: string) {
  const suffix = randomUUID().slice(0, 8);
  const tenant = await database.tenant.create({
    data: { slug: `audit-${label}-${suffix}`, name: `Audit ${label} ${suffix}` },
  });
  const user = await database.user.create({
    data: {
      email: `audit-${label}-${suffix}@example.invalid`,
      displayName: `Audit Actor ${label}`,
    },
  });
  const membership = await database.membership.create({
    data: { tenantId: tenant.id, userId: user.id },
  });
  return { tenant, user, membership };
}

afterAll(async () => {
  await auditDatabase.onModuleDestroy();
  await database.$disconnect();
});

describe('LOT17.4 real audit repository', () => {
  it('returns only the current tenant and resolves the real actor', async () => {
    const own = await actorFixture('own');
    const foreign = await actorFixture('foreign');

    await database.auditLog.createMany({
      data: [
        {
          tenantId: own.tenant.id,
          actorMembershipId: own.membership.id,
          action: 'settings.tenant.updated',
          entityType: 'tenant',
          entityId: own.tenant.id,
        },
        {
          tenantId: foreign.tenant.id,
          actorMembershipId: foreign.membership.id,
          action: 'finance.payment.created',
          entityType: 'payment',
          entityId: randomUUID(),
        },
      ],
    });

    const view = await repository.list(
      context({
        tenantId: own.tenant.id,
        userId: own.user.id,
        membershipId: own.membership.id,
      }),
      { q: '', page: 1, pageSize: 25 },
    );

    expect(view.total).toBe(1);
    expect(view.items).toHaveLength(1);
    expect(view.items[0]).toMatchObject({
      action: 'settings.tenant.updated',
      entityType: 'tenant',
      actor: {
        membershipId: own.membership.id,
        displayName: 'Audit Actor own',
      },
    });
    expect(view.items.some((item) => item.action === 'finance.payment.created')).toBe(false);
  });

  it('searches by actor or action inside the current tenant', async () => {
    const own = await actorFixture('search');
    await database.auditLog.create({
      data: {
        tenantId: own.tenant.id,
        actorMembershipId: own.membership.id,
        action: 'users.membership.suspended',
        entityType: 'membership',
        entityId: own.membership.id,
      },
    });

    const ctx = context({
      tenantId: own.tenant.id,
      userId: own.user.id,
      membershipId: own.membership.id,
    });
    const byActor = await repository.list(ctx, { q: 'Actor search', page: 1, pageSize: 25 });
    const byAction = await repository.list(ctx, { q: 'suspended', page: 1, pageSize: 25 });

    expect(byActor.items).toHaveLength(1);
    expect(byAction.items).toHaveLength(1);
  });

  it('rejects audit access without audit.read', () => {
    const tenantId = randomUUID();
    expect(() =>
      auditAccess(
        context({
          tenantId,
          userId: randomUUID(),
          membershipId: randomUUID(),
          grants: [],
        }),
      ),
    ).toThrowError('AUTH_FORBIDDEN');
  });
});
