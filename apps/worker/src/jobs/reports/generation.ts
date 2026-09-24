import { createHash, randomUUID } from 'node:crypto';
import { reportActorSchema, reportQuery, type ReportActor } from '@gestschool/contracts';
import { type GestSchoolPrismaClient, type Prisma } from '@gestschool/database';
import {
  ReportDataEngine,
  serializeReport,
  type S3StorageAdapter,
} from '@gestschool/infrastructure';

async function audit(
  db: Prisma.TransactionClient,
  tenantId: string,
  id: string,
  action: string,
  metadata: Prisma.InputJsonObject = {},
) {
  await db.auditLog.create({
    data: { tenantId, action, entityType: 'report_export', entityId: id, metadata },
  });
}
export class ReportsGeneration {
  private readonly engine: ReportDataEngine;
  constructor(
    private readonly db: GestSchoolPrismaClient,
    private readonly storage: S3StorageAdapter,
  ) {
    this.engine = new ReportDataEngine(db);
  }
  async run(data: { tenantId: string; exportId: string }) {
    const { tenantId, exportId: id } = data,
      leaseToken = randomUUID();
    const row = await this.db.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM report_exports WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid FOR UPDATE`;
      const current = await db.reportExport.findFirst({ where: { tenantId, id } });
      if (!current || ['READY', 'FAILED', 'EXPIRED'].includes(current.status)) return null;
      if (current.expiresAt.getTime() <= Date.now()) {
        await db.reportExport.update({
          where: { id },
          data: { status: 'EXPIRED', leaseToken: null, leaseUntil: null },
        });
        return null;
      }
      if (current.leaseUntil && current.leaseUntil.getTime() > Date.now())
        throw new Error('REPORT_LEASE_BUSY');
      if (current.attempts >= 3) {
        await db.reportExport.update({
          where: { id },
          data: {
            status: 'FAILED',
            failedAt: new Date(),
            safeErrorCode: 'REPORT_ATTEMPTS_EXHAUSTED',
            leaseToken: null,
            leaseUntil: null,
          },
        });
        await audit(db, tenantId, id, 'report.export.failed', {
          code: 'REPORT_ATTEMPTS_EXHAUSTED',
        });
        return null;
      }
      return db.reportExport.update({
        where: { id },
        data: {
          status: 'PROCESSING',
          attempts: { increment: 1 },
          startedAt: new Date(),
          leaseToken,
          leaseUntil: new Date(Date.now() + 300_000),
          safeErrorCode: null,
        },
      });
    });
    if (!row) return;
    let candidate: string | undefined;
    try {
      const actor = reportActorSchema.parse(row.actorSnapshot) as ReportActor,
        filters = reportQuery.parse(row.filters),
        page = await this.engine.snapshot(row.reportType, actor, filters),
        file = await serializeReport(page, row.format, row.locale as 'fr' | 'en' | 'ar'),
        checksum = createHash('sha256').update(file.bytes).digest('hex'),
        objectKey = `tenants/${tenantId}/reports/${id}/${checksum}.${file.extension}`;
      await this.storage.putReport(objectKey, file.bytes, file.mimeType);
      candidate = objectKey;
      await this.db.$transaction(async (db) => {
        const current = await db.reportExport.findFirst({
          where: { tenantId, id, status: 'PROCESSING', leaseToken },
        });
        if (!current) throw new Error('REPORT_LEASE_LOST');
        await db.reportExport.update({
          where: { id },
          data: {
            status: 'READY',
            storageKey: objectKey,
            checksum,
            rowCount: page.total,
            sizeBytes: BigInt(file.bytes.length),
            completedAt: new Date(),
            leaseToken: null,
            leaseUntil: null,
          },
        });
        await audit(db, tenantId, id, 'report.export.generated', {
          checksum,
          rowCount: page.total,
          format: row.format,
        });
      });
    } catch {
      let code = 'REPORT_GENERATION_FAILED';
      try {
        if (candidate) {
          const persisted = await this.db.reportExport.findFirst({
            where: { tenantId, id },
            select: { storageKey: true },
          });
          if (persisted && persisted.storageKey !== candidate)
            await this.storage.deleteUncommittedReport(candidate);
        }
      } catch {
        code = 'REPORT_STORAGE_CLEANUP_FAILED';
      }
      try {
        await this.db.$transaction(async (db) => {
          const changed = await db.reportExport.updateMany({
            where: { tenantId, id, status: 'PROCESSING', leaseToken },
            data: {
              status: row.attempts >= 3 ? 'FAILED' : 'PENDING',
              failedAt: row.attempts >= 3 ? new Date() : null,
              safeErrorCode: code,
              leaseToken: null,
              leaseUntil: null,
            },
          });
          if (changed.count)
            await audit(db, tenantId, id, 'report.export.failed', {
              attempt: row.attempts,
              terminal: row.attempts >= 3,
              code,
            });
        });
      } catch {
        throw new Error(code);
      }
      throw new Error(code);
    }
  }
}
