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
  logoUrl: null,
  primaryColor: '#1D4ED8',
  activeAcademicYearId: null,
  gradingScale: '20',
  automaticReports: true,
  parentPortal: true,
  notifications: {
    email: true,
    sms: false,
    paymentReminders: true,
    absenceAlerts: true,
  },
} as const;

function objectValue(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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
}): TenantSettingsView {
  const values = objectValue(row.setting?.values);
  return tenantSettingsUpdate
    .extend({
      tenantId: tenantSettingsUpdate.shape.schoolName.transform(() => row.tenant.id),
      tenantSlug: tenantSettingsUpdate.shape.schoolName.transform(() => row.tenant.slug),
      updatedAt: tenantSettingsUpdate.shape.schoolName
        .transform(() => row.setting?.updatedAt.toISOString() ?? null)
        .nullable(),
    })
    .parse({
      schoolName: row.tenant.name,
      schoolCode: values['schoolCode'] ?? defaults.schoolCode,
      email: values['email'] ?? defaults.email,
      phone: values['phone'] ?? defaults.phone,
      address: values['address'] ?? defaults.address,
      logoUrl: values['logoUrl'] ?? defaults.logoUrl,
      primaryColor: values['primaryColor'] ?? defaults.primaryColor,
      defaultCurrency: row.setting?.defaultCurrency ?? 'XOF',
      defaultLocale: row.setting?.defaultLocale ?? 'fr',
      timezone: row.setting?.timezone ?? 'Africa/Abidjan',
      activeAcademicYearId: values['activeAcademicYearId'] ?? defaults.activeAcademicYearId,
      gradingScale: values['gradingScale'] ?? defaults.gradingScale,
      automaticReports: values['automaticReports'] ?? defaults.automaticReports,
      parentPortal: values['parentPortal'] ?? defaults.parentPortal,
      notifications: values['notifications'] ?? defaults.notifications,
      tenantId: row.tenant.id,
      tenantSlug: row.tenant.slug,
      updatedAt: row.setting?.updatedAt.toISOString() ?? null,
    });
}

@Injectable()
export class PrismaSettingsRepository extends SettingsRepository {
  constructor(@Inject(SettingsDatabase) private readonly database: SettingsDatabase) {
    super();
  }

  override async read(context: RequestContext) {
    const tenant = await this.database.client.tenant.findUnique({
      where: { id: context.tenantId },
      include: { settings: true },
    });
    if (!tenant) throw new IamError('SETTINGS_TENANT_NOT_FOUND', 404);
    return view({ tenant, setting: tenant.settings });
  }

  override update(context: RequestContext, input: TenantSettingsUpdate) {
    return this.database.transaction(async (db) => {
      const tenant = await db.tenant.findUnique({
        where: { id: context.tenantId },
        include: { settings: true },
      });
      if (!tenant) throw new IamError('SETTINGS_TENANT_NOT_FOUND', 404);

      if (input.activeAcademicYearId) {
        const year = await db.academicYear.findFirst({
          where: {
            tenantId: context.tenantId,
            id: input.activeAcademicYearId,
            archivedAt: null,
          },
          select: { id: true },
        });
        if (!year) throw new IamError('SETTINGS_ACADEMIC_YEAR_INVALID', 409);
      }

      const values = {
        schoolCode: input.schoolCode,
        email: input.email,
        phone: input.phone,
        address: input.address,
        logoUrl: input.logoUrl,
        primaryColor: input.primaryColor.toUpperCase(),
        activeAcademicYearId: input.activeAcademicYearId,
        gradingScale: input.gradingScale,
        automaticReports: input.automaticReports,
        parentPortal: input.parentPortal,
        notifications: input.notifications,
      };

      const [updatedTenant, setting] = await Promise.all([
        db.tenant.update({
          where: { id: context.tenantId },
          data: { name: input.schoolName },
        }),
        db.tenantSetting.upsert({
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
        }),
      ]);

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
            activeAcademicYearId: input.activeAcademicYearId,
            defaultLocale: input.defaultLocale,
            defaultCurrency: input.defaultCurrency,
            timezone: input.timezone,
          },
        },
      });

      return view({ tenant: updatedTenant, setting });
    });
  }
}
