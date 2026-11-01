import { z } from 'zod';

export const auditPermissionCodes = ['audit.read'] as const;

const auditDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'AUDIT_DATE_INVALID')
  .optional();

export const auditListQuery = z
  .strictObject({
    q: z.string().trim().max(120).optional().default(''),
    action: z.string().trim().max(120).optional(),
    entityType: z.string().trim().max(120).optional(),
    from: auditDate,
    to: auditDate,
    page: z.coerce.number().int().min(1).max(100000).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(25),
  })
  .superRefine((value, context) => {
    if (value.from && value.to && value.from > value.to)
      context.addIssue({
        code: 'custom',
        message: 'AUDIT_DATE_RANGE_INVALID',
        path: ['to'],
      });
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
