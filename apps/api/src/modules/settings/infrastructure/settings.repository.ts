import { Inject, Injectable } from '@nestjs/common';
import {
  tenantSettingsUpdate,
  type TenantSettingsUpdate,
  type TenantSettingsView,
} from '@gestschool/contracts';
import type { Prisma } from '@gestschool/database';
import type { RequestContext } from '../../iam/domain/context.js';
import { IamError } from '../../iam/domain/context.js';
import { SettingsRepository } from '../domain/settings.repository.js';
import { SettingsDatabase } from './database.js';

const defaults = {
  schoolCode: 'GESTSCHOOL',
  email: null,
  phone: null,
  address: null,
  primaryColor: '#1D4ED8',
} as const;

function objectValue(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function civilDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function view(row: {
  tenant: { id: string; slug: string; name: string };
  setting: {
    defaultCurrency: string;
    defaultLocale: string;
    timezone: string;
    values: Prisma.JsonValue;
    updatedAt: Date;
  } | null;
  activeAcademicYear: {
    id: string;
    name: string;
    startsOn: Date;
    endsOn: Date;
  } | null;
}): TenantSettingsView {
  const values = objectValue(row.setting?.values);
  const parsed = tenantSettingsUpdate.parse({
    schoolName: row.tenant.name,
    schoolCode: values['schoolCode'] ?? defaults.schoolCode,
    email: values['email'] ?? defaults.email,
    phone: values['phone'] ?? defaults.phone,
    address: values['address'] ?? values['publicAddress'] ?? defaults.address,
    primaryColor: values['primaryColor'] ?? defaults.primaryColor,
    defaultCurrency: row.setting?.defaultCurrency ?? 'XOF',
    defaultLocale: row.setting?.defaultLocale ?? 'fr',
    timezone: row.setting?.timezone ?? 'Africa/Abidjan',
  });
  return {
    ...parsed,
    tenantId: row.tenant.id,
    tenantSlug: row.tenant.slug,
    updatedAt: row.setting?.updatedAt.toISOString() ?? null,
    activeAcademicYear: row.activeAcademicYear
      ? {
          id: row.activeAcademicYear.id,
          name: row.activeAcademicYear.name,
          startsOn: civilDate(row.activeAcademicYear.startsOn),
          endsOn: civilDate(row.activeAcademicYear.endsOn),
        }
      : null,
  };
}

async function activeYear(
  db: SettingsDatabase['client'] | Prisma.TransactionClient,
  tenantId: string,
) {
  return db.academicYear.findFirst({
    where: { tenantId, status: 'ACTIVE', archivedAt: null },
    orderBy: [{ startsOn: 'desc' }, { id: 'desc' }],
    select: { id: true, name: true, startsOn: true, endsOn: true },
  });
}

@Injectable()
export class PrismaSettingsRepository extends SettingsRepository {
  constructor(@Inject(SettingsDatabase) private readonly database: SettingsDatabase) {
    super();
  }

  override async read(context: RequestContext) {
    const [tenant, currentAcademicYear] = await Promise.all([
      this.database.client.tenant.findUnique({
        where: { id: context.tenantId },
        include: { settings: true },
      }),
      activeYear(this.database.client, context.tenantId),
    ]);
    if (!tenant) throw new IamError('SETTINGS_TENANT_NOT_FOUND', 404);
    return view({
      tenant,
      setting: tenant.settings,
      activeAcademicYear: currentAcademicYear,
    });
  }

  override update(context: RequestContext, input: TenantSettingsUpdate) {
    return this.database.transaction(async (db) => {
      const tenant = await db.tenant.findUnique({
        where: { id: context.tenantId },
        include: { settings: true },
      });
      if (!tenant) throw new IamError('SETTINGS_TENANT_NOT_FOUND', 404);

      const existingValues = objectValue(tenant.settings?.values);
      const values = {
        ...existingValues,
        schoolCode: input.schoolCode,
        email: input.email,
        phone: input.phone,
        address: input.address,
        publicAddress: input.address,
        primaryColor: input.primaryColor.toUpperCase(),
      };

      const updatedTenant = await db.tenant.update({
        where: { id: context.tenantId },
        data: { name: input.schoolName },
      });
      const setting = await db.tenantSetting.upsert({
        where: { tenantId: context.tenantId },
        update: {
          defaultCurrency: input.defaultCurrency,
          defaultLocale: input.defaultLocale,
          timezone: input.timezone,
          values,
        },
        create: {
          tenantId: context.tenantId,
          defaultCurrency: input.defaultCurrency,
          defaultLocale: input.defaultLocale,
          timezone: input.timezone,
          values,
        },
      });
      const currentAcademicYear = await activeYear(db, context.tenantId);

      await db.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorMembershipId: context.membershipId,
          action: 'settings.tenant.updated',
          entityType: 'tenant',
          entityId: context.tenantId,
          metadata: {
            requestId: context.requestId,
            schoolName: input.schoolName,
            defaultLocale: input.defaultLocale,
            defaultCurrency: input.defaultCurrency,
            timezone: input.timezone,
          },
        },
      });

      return view({
        tenant: updatedTenant,
        setting,
        activeAcademicYear: currentAcademicYear,
      });
    });
  }
}
