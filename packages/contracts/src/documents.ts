import { z } from 'zod';
import { reportSnapshotSchema } from './results.js';

export const documentTypes = [
  'REPORT_CARD',
  'TRANSCRIPT',
  'SCHOOL_CERTIFICATE',
  'ENROLLMENT_CERTIFICATE',
  'STUDENT_CARD',
  'RECEIPT',
] as const;
export type OfficialDocumentType = (typeof documentTypes)[number];
export const documentStates = ['PENDING', 'PROCESSING', 'READY', 'FAILED', 'REVOKED'] as const;
export const documentLocales = ['fr', 'en', 'ar'] as const;
export const documentPermissionCodes = [
  'documents.read',
  'documents.generate',
  'documents.download',
  'documents.revoke',
  'documents.reissue',
  'document-templates.read',
  'document-templates.manage',
] as const;
export const documentReadPermissions = ['documents.read', 'documents.download'] as const;
export const documentOperations = documentPermissionCodes.filter((p) => p.startsWith('documents.'));
export const generateDocumentInput = z.strictObject({
  documentType: z.enum(documentTypes),
  sourceId: z.uuid(),
  locale: z.enum(documentLocales),
});
export type GenerateDocumentInput = z.infer<typeof generateDocumentInput>;
export const documentQuery = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).default(''),
  studentId: z.uuid().optional(),
  sourceId: z.uuid().optional(),
  documentType: z.enum(documentTypes).optional(),
  status: z.enum(documentStates).optional(),
});
export type DocumentQuery = z.infer<typeof documentQuery>;
export const documentSourceQuery = z.strictObject({
  documentType: z.enum(documentTypes),
  search: z.string().trim().max(120).default(''),
  studentId: z.uuid().optional(),
});
export type DocumentSourceQuery = z.infer<typeof documentSourceQuery>;
export interface DocumentSourceView {
  id: string;
  label: string;
}
export const documentReasonInput = z.strictObject({ reason: z.string().trim().min(5).max(500) });
// A closed, data-only template format. No user-supplied HTML, CSS, URL or JavaScript.
export const documentTemplateLayout = z.strictObject({
  renderer: z.literal('gestschool-v1'),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  footer: z.string().trim().max(240),
});
export const documentTemplateInput = z.strictObject({
  documentType: z.enum(documentTypes),
  locale: z.enum(documentLocales),
  name: z.string().trim().min(1).max(140),
  layout: documentTemplateLayout,
});
export type DocumentTemplateInput = z.infer<typeof documentTemplateInput>;
export const documentSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(1),
  documentType: z.enum(documentTypes),
  locale: z.enum(documentLocales),
  school: z.strictObject({ name: z.string().max(160), publicAddress: z.string().max(240) }),
  holder: z.strictObject({ name: z.string().max(220), matricule: z.string().max(40) }),
  academicYear: z.string().max(160),
  academicPeriod: z.string().max(160),
  className: z.string().max(160),
  issuedAt: z.iso.datetime(),
  template: documentTemplateLayout,
  report: reportSnapshotSchema.nullable(),
  enrollment: z
    .strictObject({ type: z.string(), status: z.string(), enrolledOn: z.iso.date() })
    .nullable(),
  receipt: z
    .strictObject({
      reference: z.string(),
      paymentReference: z.string(),
      amountMinor: z.string().regex(/^\d+$/),
      currency: z.string().length(3),
      method: z.string(),
      paidAt: z.iso.datetime(),
      invoices: z.array(z.string()),
    })
    .nullable(),
});
export type DocumentSnapshot = z.infer<typeof documentSnapshotSchema>;
export interface DocumentView {
  id: string;
  reference: string;
  documentType: OfficialDocumentType;
  status: (typeof documentStates)[number];
  locale: (typeof documentLocales)[number];
  studentId: string;
  sourceId: string;
  holder: string;
  academicYear: string;
  className: string;
  matricule: string;
  createdAt: string;
  issuedAt: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  checksum: string | null;
  sizeBytes: string;
  templateVersion: number;
  supersedesId: string | null;
}
export interface DocumentList {
  items: DocumentView[];
  total: number;
  page: number;
  pageSize: number;
}
export interface DocumentTemplateView {
  id: string;
  documentType: OfficialDocumentType;
  locale: (typeof documentLocales)[number];
  version: number;
  name: string;
  layout: z.infer<typeof documentTemplateLayout>;
  publishedAt: string;
}
export type DocumentVerification =
  | { status: 'INVALID' }
  | {
      status: 'VALID' | 'REVOKED';
      documentType: OfficialDocumentType;
      reference: string;
      school: string;
      holder: string;
      academicYear: string;
      academicPeriod: string;
      issuedAt: string;
    };
export const DOCUMENT_GENERATION_EVENT = 'documents.generation.requested.v1';
export const DOCUMENT_QUEUE = 'documents.generate';
export const documentJobData = z.strictObject({ tenantId: z.uuid(), documentId: z.uuid() });
