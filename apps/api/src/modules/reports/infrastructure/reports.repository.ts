import { createHash } from 'node:crypto';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import {
  REPORT_EXPORT_EVENT,
  REPORT_EXPORT_TTL_HOURS,
  reportQuery,
  type CreateReportExportInput,
  type ReportActor,
  type ReportExportView,
  type ReportType,
} from '@gestschool/contracts';
import { Prisma } from '@gestschool/database';
import { ReportDataEngine, S3StorageAdapter, assertReportAccess } from '@gestschool/infrastructure';
import { ReportsRepository } from '../domain/reports.repository.js';
import { ReportsDatabase } from './database.js';

function view(row: {
  id: string;
  reportType: ReportType;
  format: 'CSV' | 'XLSX' | 'PDF';
  locale: string;
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED' | 'EXPIRED';
  rowCount: number | null;
  checksum: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  expiresAt: Date;
  safeErrorCode: string | null;
  requestedBy: { user: { displayName: string } };
}): ReportExportView {
  return {
    id: row.id,
    reportType: row.reportType,
    format: row.format,
    locale: row.locale as 'fr' | 'en' | 'ar',
    status: row.status,
    requestedBy: row.requestedBy.user.displayName,
    rowCount: row.rowCount,
    checksum: row.checksum,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
    safeErrorCode: row.safeErrorCode,
  };
}
const include = { requestedBy: { include: { user: true } } } as const;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
const requestDigest = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
@Injectable()
export class PrismaReportsRepository extends ReportsRepository implements OnModuleDestroy {
  private readonly engine: ReportDataEngine;
  private readonly storage = new S3StorageAdapter(loadInfrastructureConfig().storage);
  constructor(@Inject(ReportsDatabase) private readonly database: ReportsDatabase) {
    super();
    this.engine = new ReportDataEngine(database.client);
  }
  onModuleDestroy() {
    this.storage.close();
  }
  override page(
    type: ReportType,
    actor: ReportActor,
    query: Parameters<ReportsRepository['page']>[2],
  ) {
    return this.engine.page(type, actor, query);
  }
  override async create(
    actor: ReportActor,
    input: CreateReportExportInput,
    idempotencyKey: string,
  ) {
    assertReportAccess(actor, input.reportType, 'export');
    const formats: Record<ReportType, readonly ('CSV' | 'XLSX' | 'PDF')[]> = {
      STUDENTS: ['CSV', 'XLSX'],
      ENROLLMENTS: ['CSV', 'XLSX'],
      ACADEMIC: ['CSV', 'XLSX'],
      RESULTS: ['XLSX', 'PDF'],
      FINANCE: ['CSV', 'XLSX', 'PDF'],
      PAYMENTS: ['CSV', 'XLSX'],
      OUTSTANDING_BALANCES: ['CSV', 'XLSX', 'PDF'],
      DOCUMENTS: ['CSV', 'XLSX'],
      COMMUNICATIONS: ['CSV', 'XLSX'],
    };
    if (!formats[input.reportType].includes(input.format))
      throw new Error('REPORT_FORMAT_UNSUPPORTED');
    const filters = reportQuery.parse({ ...input.filters, page: 1, pageSize: 100 });
    const digest = requestDigest({
      reportType: input.reportType,
      format: input.format,
      locale: input.locale,
      filters,
    });
    return this.database.client.$transaction(
      async (db) => {
        await db.$queryRaw`SELECT id FROM tenants WHERE id=${actor.tenantId}::uuid FOR UPDATE`;
        const previous = await db.reportExport.findUnique({
          where: { tenantId_idempotencyKey: { tenantId: actor.tenantId, idempotencyKey } },
          include,
        });
        if (previous) {
          const oldDigest = requestDigest({
            reportType: previous.reportType,
            format: previous.format,
            locale: previous.locale,
            filters: previous.filters,
          });
          if (oldDigest !== digest) throw new Error('REPORT_IDEMPOTENCY_CONFLICT');
          return view(previous);
        }
        const active = await db.reportExport.count({
          where: {
            tenantId: actor.tenantId,
            requestedByMembershipId: actor.membershipId,
            status: { in: ['PENDING', 'PROCESSING'] },
          },
        });
        if (active >= 3) throw new Error('REPORT_CONCURRENCY_LIMIT');
        const row = await db.reportExport.create({
          data: {
            tenantId: actor.tenantId,
            requestedByMembershipId: actor.membershipId,
            idempotencyKey,
            reportType: input.reportType,
            format: input.format,
            locale: input.locale,
            filters: JSON.parse(JSON.stringify(filters)) as Prisma.InputJsonObject,
            actorSnapshot: JSON.parse(JSON.stringify(actor)) as Prisma.InputJsonObject,
            expiresAt: new Date(Date.now() + REPORT_EXPORT_TTL_HOURS * 3_600_000),
          },
          include,
        });
        await db.outboxEvent.create({
          data: {
            tenantId: actor.tenantId,
            aggregateType: 'report_export',
            aggregateId: row.id,
            eventType: REPORT_EXPORT_EVENT,
            payload: { schemaVersion: 1, exportId: row.id },
          },
        });
        await db.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            actorMembershipId: actor.membershipId,
            action: 'report.export.requested',
            entityType: 'report_export',
            entityId: row.id,
            metadata: { reportType: input.reportType, format: input.format },
          },
        });
        return view(row);
      },
      { maxWait: 30_000, timeout: 30_000 },
    );
  }
  override async history(actor: ReportActor, page: number, pageSize: number) {
    const where = { tenantId: actor.tenantId, requestedByMembershipId: actor.membershipId };
    const [total, rows] = await this.database.client.$transaction([
      this.database.client.reportExport.count({ where }),
      this.database.client.reportExport.findMany({
        where,
        include,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: rows.map(view), total, page, pageSize };
  }
  override async download(actor: ReportActor, id: string) {
    const row = await this.database.client.reportExport.findFirst({
      where: { id, tenantId: actor.tenantId, requestedByMembershipId: actor.membershipId },
      include,
    });
    if (!row) throw new Error('REPORT_EXPORT_NOT_FOUND');
    assertReportAccess(actor, row.reportType, 'export');
    if (row.expiresAt.getTime() <= Date.now()) {
      if (row.status === 'READY')
        await this.database.client.reportExport.update({
          where: { id: row.id },
          data: { status: 'EXPIRED' },
        });
      throw new Error('REPORT_EXPORT_EXPIRED');
    }
    if (row.status !== 'READY' || !row.storageKey || !row.checksum)
      throw new Error('REPORT_EXPORT_NOT_READY');
    const mime =
      row.format === 'CSV'
        ? 'text/csv; charset=utf-8'
        : row.format === 'XLSX'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf';
    const bytes = await this.storage.getReport(row.storageKey, mime);
    if (createHash('sha256').update(bytes).digest('hex') !== row.checksum)
      throw new Error('REPORT_CHECKSUM_MISMATCH');
    await this.database.client.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        actorMembershipId: actor.membershipId,
        action: 'report.export.downloaded',
        entityType: 'report_export',
        entityId: row.id,
        metadata: { format: row.format },
      },
    });
    return {
      bytes,
      fileName: `gestschool-${row.reportType.toLowerCase()}-${row.id}.${row.format.toLowerCase()}`,
      mimeType: mime,
    };
  }
}
