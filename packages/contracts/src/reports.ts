import { z } from 'zod';

export const reportTypes = [
  'STUDENTS',
  'ENROLLMENTS',
  'ACADEMIC',
  'RESULTS',
  'FINANCE',
  'PAYMENTS',
  'OUTSTANDING_BALANCES',
  'DOCUMENTS',
  'COMMUNICATIONS',
] as const;
export type ReportType = (typeof reportTypes)[number];

export const reportFormats = ['CSV', 'XLSX', 'PDF'] as const;
export type ReportFormat = (typeof reportFormats)[number];
export const reportExportStates = ['PENDING', 'PROCESSING', 'READY', 'FAILED', 'EXPIRED'] as const;
export type ReportExportState = (typeof reportExportStates)[number];
export const reportLocales = ['fr', 'en', 'ar'] as const;
export type ReportLocale = (typeof reportLocales)[number];

export const reportPermissionCodes = ['dashboards.read', 'reports.read', 'reports.export'] as const;

const date = z.iso.date();
const reportQueryFields = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).default(''),
  dateFrom: date.optional(),
  dateTo: date.optional(),
  academicYearId: z.uuid().optional(),
  periodId: z.uuid().optional(),
  levelId: z.uuid().optional(),
  classId: z.uuid().optional(),
  subjectId: z.uuid().optional(),
  studentId: z.uuid().optional(),
  status: z.string().trim().max(40).optional(),
});
export const reportQuery = reportQueryFields.superRefine((value, context) => {
  if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo)
    context.addIssue({ code: 'custom', message: 'REPORT_DATE_RANGE_INVALID' });
  if (
    value.dateFrom &&
    value.dateTo &&
    Date.parse(value.dateTo) - Date.parse(value.dateFrom) > 366 * 86_400_000
  )
    context.addIssue({ code: 'custom', message: 'REPORT_DATE_RANGE_TOO_LARGE' });
});
export type ReportQuery = z.infer<typeof reportQuery>;

export const dashboardQuery = z
  .strictObject({
    academicYearId: z.uuid().optional(),
    periodId: z.uuid().optional(),
    dateFrom: date.optional(),
    dateTo: date.optional(),
  })
  .superRefine((value, context) => {
    if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo)
      context.addIssue({ code: 'custom', message: 'REPORT_DATE_RANGE_INVALID' });
    if (
      value.dateFrom &&
      value.dateTo &&
      Date.parse(value.dateTo) - Date.parse(value.dateFrom) > 366 * 86_400_000
    )
      context.addIssue({ code: 'custom', message: 'REPORT_DATE_RANGE_TOO_LARGE' });
  });
export type DashboardQuery = z.infer<typeof dashboardQuery>;

export const createReportExportInput = z.strictObject({
  reportType: z.enum(reportTypes),
  format: z.enum(reportFormats),
  locale: z.enum(reportLocales).default('fr'),
  filters: reportQueryFields.omit({ page: true, pageSize: true }).default({ search: '' }),
});
export type CreateReportExportInput = z.infer<typeof createReportExportInput>;

export interface ReportActor {
  tenantId: string;
  membershipId: string;
  userId: string;
  roles: string[];
  grants: { permission: string; scope: string }[];
}
export const reportActorSchema = z.strictObject({
  tenantId: z.uuid(),
  membershipId: z.uuid(),
  userId: z.uuid(),
  roles: z.array(z.string().max(80)).max(20),
  grants: z
    .array(z.strictObject({ permission: z.string().max(120), scope: z.string().max(20) }))
    .max(300),
});
export type ReportCell = string | number | null;
export interface ReportRow {
  [column: string]: ReportCell;
}
export interface ReportPage {
  type: ReportType;
  columns: string[];
  items: ReportRow[];
  total: number;
  page: number;
  pageSize: number;
}
export interface MoneyAggregate {
  currency: string;
  invoicedMinor: string;
  collectedMinor: string;
  reversedMinor: string;
  netCollectedMinor: string;
  outstandingMinor: string;
}
export interface DashboardSummary {
  role: string;
  reference: { academicYearId: string | null; periodId: string | null };
  counts: Record<string, number>;
  money: MoneyAggregate[];
  classEnrollment: { label: string; value: number }[];
  feeTypeBreakdown: { label: string; currency: string; amountMinor: string }[];
  academicAverages: { label: string; average: string }[];
  students: {
    id: string;
    name: string;
    matricule: string;
    className: string | null;
    academicYear: string | null;
  }[];
  messageDelivery: { label: string; value: number }[];
  recentPayments: { reference: string; amountMinor: string; currency: string; paidAt: string }[];
}
export interface ReportExportView {
  id: string;
  reportType: ReportType;
  format: ReportFormat;
  locale: ReportLocale;
  status: ReportExportState;
  requestedBy: string;
  rowCount: number | null;
  checksum: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  expiresAt: string;
  safeErrorCode: string | null;
}
export interface ReportExportList {
  items: ReportExportView[];
  total: number;
  page: number;
  pageSize: number;
}

export const REPORT_EXPORT_EVENT = 'reports.export.requested.v1';
export const REPORTS_QUEUE = 'reports.generate';
export const REPORT_EXPORT_MAX_ROWS = 25_000;
export const REPORT_EXPORT_ASYNC_THRESHOLD = 1_000;
export const REPORT_EXPORT_TTL_HOURS = 24;
export const reportJobData = z.strictObject({ tenantId: z.uuid(), exportId: z.uuid() });
