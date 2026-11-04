import { z } from 'zod';

export const profileLocales = ['fr', 'en', 'ar'] as const;
export type ProfileLocale = (typeof profileLocales)[number];

export const profileUpdate = z.strictObject({
  displayName: z.string().trim().min(2).max(160),
  preferredLocale: z.enum(profileLocales),
});
export type ProfileUpdate = z.infer<typeof profileUpdate>;

export const profilePasswordChange = z
  .strictObject({
    currentPassword: z.string().min(1).max(256),
    newPassword: z.string().min(12).max(128),
    confirmPassword: z.string().min(12).max(128),
  })
  .superRefine((value, context) => {
    if (value.newPassword !== value.confirmPassword)
      context.addIssue({
        code: 'custom',
        message: 'AUTH_PASSWORD_MISMATCH',
        path: ['confirmPassword'],
      });
  });
export type ProfilePasswordChange = z.infer<typeof profilePasswordChange>;

export const profileNotificationPreferences = z.strictObject({
  EMAIL: z.boolean(),
  WHATSAPP: z.boolean(),
});
export type ProfileNotificationPreferences = z.infer<typeof profileNotificationPreferences>;

export interface ProfileView {
  user: {
    id: string;
    displayName: string;
    email: string;
    preferredLocale: ProfileLocale;
  };
  membership: {
    id: string;
    tenantId: string;
    tenantName: string;
    roles: string[];
  };
  security: {
    passwordChangedAt: string | null;
    mfaEnabled: boolean;
    mfaEnabledAt: string | null;
  };
  notifications: ProfileNotificationPreferences;
}

export interface ProfileSessionView {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
}

export const avatarMimeTypes = ['image/jpeg', 'image/png'] as const;
export type AvatarMimeType = (typeof avatarMimeTypes)[number];

export const avatarUpload = z.strictObject({
  mimeType: z.enum(avatarMimeTypes),
  base64: z
    .string()
    .min(4)
    .max(2_800_000)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
});
export type AvatarUpload = z.infer<typeof avatarUpload>;
