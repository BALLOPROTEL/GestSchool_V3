import { z } from 'zod';

export const settingsPermissionCodes = ['settings.read', 'settings.write'] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value ? value : null));

export const tenantSettingsUpdate = z.strictObject({
  schoolName: z.string().trim().min(1).max(160),
  schoolCode: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[\p{L}\p{N}._-]+$/u),
  email: z.email().max(254).nullable(),
  phone: optionalText(30),
  address: optionalText(500),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  defaultCurrency: z.string().regex(/^[A-Z]{3}$/),
  defaultLocale: z.enum(['fr', 'en', 'ar']),
  timezone: z.string().trim().min(1).max(80),
});

export type TenantSettingsUpdate = z.infer<typeof tenantSettingsUpdate>;

export interface TenantSettingsView extends TenantSettingsUpdate {
  tenantId: string;
  tenantSlug: string;
  updatedAt: string | null;
  activeAcademicYear: {
    id: string;
    name: string;
    startsOn: string;
    endsOn: string;
  } | null;
}
