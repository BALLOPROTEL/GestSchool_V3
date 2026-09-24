import { setTimeout } from 'node:timers/promises';
import { Logger, type OnModuleDestroy } from '@nestjs/common';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { REPORT_EXPORT_EVENT } from '@gestschool/contracts';
import { createPrismaClient } from '@gestschool/database';
import {
  createReportsQueue,
  createReportsWorker,
  S3StorageAdapter,
} from '@gestschool/infrastructure';
import { ReportsGeneration } from './generation.js';

export class ReportsRuntime implements OnModuleDestroy {
  private readonly config = loadInfrastructureConfig();
  private readonly db = createPrismaClient(this.config.databaseUrl);
  private readonly storage = new S3StorageAdapter(this.config.storage);
  private readonly queue = createReportsQueue(this.config.redisUrl);
  private readonly generation = new ReportsGeneration(this.db, this.storage);
  private readonly logger = new Logger('ReportsWorker');
  private worker: ReturnType<typeof createReportsWorker> | undefined;
  private stopped = false;
  private loop: Promise<void> | undefined;

  async start() {
    const schema = await this.db.$queryRaw<{ table_name: string | null }[]>`
      SELECT to_regclass('public.report_exports')::text table_name
    `;
    if (!schema[0]?.table_name) {
      this.logger.warn('Reports migration is not applied; reports worker remains disabled');
      return;
    }
    this.queue.on('error', () => this.logger.error('REPORT_QUEUE_UNAVAILABLE'));
    await this.queue.waitUntilReady();
    this.worker = createReportsWorker(this.config.redisUrl, (data) => this.generation.run(data));
    this.worker.on('error', () => this.logger.error('REPORT_WORKER_UNAVAILABLE'));
    this.worker.on('failed', (job) =>
      this.logger.warn(
        JSON.stringify({
          event: 'report.job.failed',
          exportId: job?.id,
          attempt: job?.attemptsMade,
        }),
      ),
    );
    await this.worker.waitUntilReady();
    this.loop = this.dispatchLoop();
    this.logger.log('Reports queue and transactional outbox ready');
  }

  async dispatchOnce() {
    return this.db.$transaction(
      async (db) => {
        const events = await db.$queryRaw<
          { id: string; tenant_id: string; aggregate_id: string }[]
        >`SELECT id,tenant_id,aggregate_id FROM outbox_events
          WHERE status='PENDING' AND event_type=${REPORT_EXPORT_EVENT}
          ORDER BY occurred_at,id LIMIT 10 FOR UPDATE SKIP LOCKED`;
        for (const event of events) {
          await this.queue.add(
            REPORT_EXPORT_EVENT,
            { tenantId: event.tenant_id, exportId: event.aggregate_id },
            { jobId: event.aggregate_id },
          );
          await db.outboxEvent.update({
            where: { id: event.id },
            data: { status: 'PROCESSED', processedAt: new Date(), attempts: { increment: 1 } },
          });
        }
        return events.length;
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
  }

  async reconcile() {
    const rows = await this.db.reportExport.findMany({
      where: {
        OR: [{ status: 'PENDING' }, { status: 'PROCESSING', leaseUntil: { lt: new Date() } }],
      },
      select: { id: true, tenantId: true },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });
    for (const row of rows) {
      const dispatched = await this.db.outboxEvent.findFirst({
        where: {
          tenantId: row.tenantId,
          aggregateId: row.id,
          eventType: REPORT_EXPORT_EVENT,
          status: 'PROCESSED',
        },
        select: { id: true },
      });
      if (!dispatched) continue;
      const job = await this.queue.getJob(row.id);
      if (!job)
        await this.queue.add(
          REPORT_EXPORT_EVENT,
          { tenantId: row.tenantId, exportId: row.id },
          { jobId: row.id },
        );
      else if (await job.isFailed())
        await this.db.$transaction(async (db) => {
          const changed = await db.reportExport.updateMany({
            where: {
              id: row.id,
              tenantId: row.tenantId,
              status: { in: ['PENDING', 'PROCESSING'] },
            },
            data: {
              status: 'FAILED',
              failedAt: new Date(),
              safeErrorCode: 'REPORT_QUEUE_EXHAUSTED',
              leaseToken: null,
              leaseUntil: null,
            },
          });
          if (changed.count)
            await db.auditLog.create({
              data: {
                tenantId: row.tenantId,
                action: 'report.export.failed',
                entityType: 'report_export',
                entityId: row.id,
                metadata: { code: 'REPORT_QUEUE_EXHAUSTED' },
              },
            });
        });
    }
  }

  private async dispatchLoop() {
    while (!this.stopped) {
      try {
        await this.dispatchOnce();
        await this.reconcile();
      } catch {
        this.logger.error('REPORT_OUTBOX_RETRY');
      }
      if (!this.stopped) await setTimeout(1000);
    }
  }

  async onModuleDestroy() {
    this.stopped = true;
    await this.loop;
    await this.worker?.close();
    await this.queue.close();
    this.storage.close();
    await this.db.$disconnect();
  }
}
