import { randomUUID } from 'node:crypto';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { createPrismaClient } from '@gestschool/database';
import { afterAll, describe, expect, it } from 'vitest';
import type { TenantSettingsUpdate } from '@gestschool/contracts';
import type { RequestContext } from '../src/modules/iam/domain/context.js';
import { SettingsDatabase } from '../src/modules/settings/infrastructure/database.js';
import { PrismaSettingsRepository } from '../src/modules/settings/infrastructure/settings.repository.js';

const database = createPrismaClient(loadInfrastructureConfig().databaseUrl);
const settingsDatabase = new SettingsDatabase();
const repository = new PrismaSettingsRepository(settingsDatabase);

async function fixture() {
  const suffix = randomUUID().slice(0, 8);
  const tenant = await database.tenant.create({
    data: { slug: `settings-${suffix}`, name: `Settings ${suffix}` },
  });
  const user = await database.user.create({
    data: {
      email: `settings-${suffix}@example.invalid`,
      displayName: 'Settings Admin',
    },
  });
  const membership = await database.membership.create({
    data: { tenantId: tenant.id, userId: user.id },
  });
  const year = await database.academicYear.create({
    data: {
      tenantId: tenant.id,
      code: `Y-${suffix}`,
      name: '2026-2027',
      startsOn: new Date('2026-09-01T00:00:00.000Z'),
      endsOn: new Date('2027-06-30T00:00:00.000Z'),
      status: 'ACTIVE',
    },
  });
  const context: RequestContext = {
    userId: user.id,
    sessionId: randomUUID(),
    membershipId: membership.id,
    tenantId: tenant.id,
    roles: ['SCHOOL_ADMIN'],
    grants: [
      { permission: 'settings.read', scope: 'TENANT' },
      { permission: 'settings.write', scope: 'TENANT' },
    ],
    requestId: randomUUID(),
    ipAddress: '127.0.0.1',
    userAgent: 'settings-test',
  };
  return { tenant, user, membership, year, context };
}

function payload(schoolName: string): TenantSettingsUpdate {
  return {
    schoolName,
    schoolCode: 'GS-CI-001',
    email: 'direction@example.invalid',
    phone: '+225 01020304',
    address: 'Cocody, Abidjan',
    primaryColor: '#123ABC',
    defaultCurrency: 'XOF',
    defaultLocale: 'fr',
    timezone: 'Africa/Abidjan',
  };
}

afterAll(async () => {
  await settingsDatabase.onModuleDestroy();
  await database.$disconnect();
});

describe('LOT17 tenant settings repository', () => {
  it('reads the real active year and persists tenant settings with audit', async () => {
    const data = await fixture();
    const initial = await repository.read(data.context);
    expect(initial).toMatchObject({
      tenantId: data.tenant.id,
      schoolName: data.tenant.name,
      defaultCurrency: 'XOF',
      defaultLocale: 'fr',
      timezone: 'Africa/Abidjan',
      activeAcademicYear: {
        id: data.year.id,
        name: '2026-2027',
        startsOn: '2026-09-01',
        endsOn: '2027-06-30',
      },
    });

    const updated = await repository.update(data.context, payload('École GestSchool Test'));
    expect(updated).toMatchObject({
      tenantId: data.tenant.id,
      schoolName: 'École GestSchool Test',
      schoolCode: 'GS-CI-001',
      primaryColor: '#123ABC',
      activeAcademicYear: { id: data.year.id },
    });

    const audit = await database.auditLog.findFirst({
      where: {
        tenantId: data.tenant.id,
        action: 'settings.tenant.updated',
        entityId: data.tenant.id,
      },
    });
    expect(audit).not.toBeNull();
  });

  it('preserves unrelated JSON keys and synchronizes the public document address', async () => {
    const data = await fixture();
    await database.tenantSetting.create({
      data: {
        tenantId: data.tenant.id,
        values: {
          publicAddress: 'Ancienne adresse',
          customExistingKey: 'preserve-me',
        },
      },
    });

    const before = await repository.read(data.context);
    expect(before.address).toBe('Ancienne adresse');

    await repository.update(data.context, payload('École A'));
    const persisted = await database.tenantSetting.findUniqueOrThrow({
      where: { tenantId: data.tenant.id },
    });
    expect(persisted.values).toMatchObject({
      address: 'Cocody, Abidjan',
      publicAddress: 'Cocody, Abidjan',
      customExistingKey: 'preserve-me',
      primaryColor: '#123ABC',
    });
  });

  it('ignores draft years when reporting the active academic year', async () => {
    const data = await fixture();
    await database.academicYear.create({
      data: {
        tenantId: data.tenant.id,
        code: `D-${randomUUID().slice(0, 8)}`,
        name: '2027-2028',
        startsOn: new Date('2027-09-01T00:00:00.000Z'),
        endsOn: new Date('2028-06-30T00:00:00.000Z'),
        status: 'DRAFT',
      },
    });
    const view = await repository.read(data.context);
    expect(view.activeAcademicYear?.id).toBe(data.year.id);
  });
});
