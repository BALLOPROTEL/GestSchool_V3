import { z } from 'zod';

export const userAdminPermissionCodes = [
  'users.read',
  'users.status',
  'users.credentials',
] as const;

export const userAdminStatuses = ['INVITED', 'ACTIVE', 'SUSPENDED'] as const;

export const userAdminListQuery = z.strictObject({
  q: z.string().trim().max(160).optional().default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type UserAdminListQuery = z.infer<typeof userAdminListQuery>;

export interface UserAdminRoleView {
  id: string;
  code: string;
  name: string;
  system: boolean;
}

export interface UserAdminRecord {
  membershipId: string;
  userId: string;
  displayName: string;
  email: string;
  membershipStatus: (typeof userAdminStatuses)[number];
  activated: boolean;
  mfaEnabled: boolean;
  role: UserAdminRoleView | null;
  lastLoginAt: string | null;
  joinedAt: string;
}

export interface UserAdminListView {
  items: UserAdminRecord[];
  page: number;
  pageSize: number;
  total: number;
}

export const userAdminInvite = z.strictObject({
  email: z
    .email()
    .max(254)
    .transform((value) => value.trim().toLowerCase()),
  displayName: z.string().trim().min(1).max(160),
  roleId: z.uuid(),
});

export const userAdminRoleUpdate = z.strictObject({
  roleId: z.uuid(),
});

export const userAdminStatusUpdate = z.strictObject({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});

export const userAdminCredentialAction = z.strictObject({
  purpose: z.enum(['ACTIVATION', 'PASSWORD_RESET']),
});
