import { z } from 'zod';

export const auditPermissionCodes = ['audit.read'] as const;

export const auditListQuery = z.strictObject({
  q: z.string().trim().max(120).optional().default(''),
  action: z.string().trim().max(120).optional(),
  entityType: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).max(100000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(25),
});

export type AuditListQuery = z.infer<typeof auditListQuery>;

export interface AuditRecordView {
  id: string;
  occurredAt: string;
  actor: {
    membershipId: string;
    displayName: string;
  } | null;
  action: string;
  entityType: string;
  entityId: string | null;
}

export interface AuditListView {
  items: AuditRecordView[];
  total: number;
  page: number;
  pageSize: number;
}
