import { setTimeout } from 'node:timers/promises';
import { Logger, type OnModuleDestroy } from '@nestjs/common';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { DOCUMENT_GENERATION_EVENT } from '@gestschool/contracts';
import { createPrismaClient } from '@gestschool/database';
import {
  createDocumentQueue,
  createDocumentWorker,
  S3StorageAdapter,
} from '@gestschool/infrastructure';
import { DocumentsGeneration, workerDocumentAudit } from './documents-generation.js';

export class DocumentsRuntime implements OnModuleDestroy {
  private readonly config = loadInfrastructureConfig();
  private readonly db = createPrismaClient(this.config.databaseUrl);
  private readonly storage = new S3StorageAdapter(this.config.storage);
  private readonly queue = createDocumentQueue(this.config.redisUrl);
  private readonly generation = new DocumentsGeneration(this.db, this.storage);
  private worker: ReturnType<typeof createDocumentWorker> | undefined;
  private stopped = false;
  private loop: Promise<void> | undefined;
  private readonly logger = new Logger('DocumentsWorker');

  async start() {
    this.queue.on('error', () => this.logger.error('DOCUMENT_QUEUE_UNAVAILABLE'));
    await this.queue.waitUntilReady();
    this.worker = createDocumentWorker(this.config.redisUrl, (data) => this.generation.run(data));
    this.worker.on('error', () => this.logger.error('DOCUMENT_WORKER_UNAVAILABLE'));
    this.worker.on('failed', (job) => {
      this.logger.warn(
        JSON.stringify({
          event: 'document.job.failed',
          documentId: job?.id,
          attempt: job?.attemptsMade,
        }),
      );
    });
    await this.worker.waitUntilReady();
    this.loop = this.dispatchLoop();
    this.logger.log('Document queue and transactional outbox ready');
  }
  async dispatchOnce(): Promise<number> {
    // The event was already committed with the document. Holding its row lock across
    // enqueue permits multiple dispatchers; a crash rolls back only the delivery mark.
    return this.db.$transaction(
      async (db) => {
        const events = await db.$queryRaw<
          { id: string; tenant_id: string; aggregate_id: string; event_type: string }[]
        >`
        SELECT id,tenant_id,aggregate_id,event_type FROM outbox_events
        WHERE status='PENDING' AND event_type IN (${DOCUMENT_GENERATION_EVENT},'finance.payment.reversed.v1')
        ORDER BY occurred_at,id LIMIT 10 FOR UPDATE SKIP LOCKED`;
        for (const event of events) {
          if (event.event_type === DOCUMENT_GENERATION_EVENT) {
            await this.queue.add(
              DOCUMENT_GENERATION_EVENT,
              { tenantId: event.tenant_id, documentId: event.aggregate_id },
              { jobId: event.aggregate_id },
            );
          } else {
            const rows = await db.document.findMany({
              where: {
                tenantId: event.tenant_id,
                generationStatus: 'READY',
                receipt: { paymentId: event.aggregate_id },
              },
            });
            for (const row of rows) {
              const changed = await db.document.updateMany({
                where: { id: row.id, tenantId: event.tenant_id, generationStatus: 'READY' },
                data: {
                  generationStatus: 'REVOKED',
                  revokedAt: new Date(),
                  revocationReason: 'PAYMENT_REVERSED',
                },
              });
              if (changed.count)
                await workerDocumentAudit(db, event.tenant_id, row.id, 'document.revoked', {
                  reason: 'PAYMENT_REVERSED',
                });
            }
          }
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
  private async dispatchLoop() {
    while (!this.stopped) {
      try {
        await this.dispatchOnce();
        await this.reconcile();
      } catch {
        this.logger.error('DOCUMENT_OUTBOX_RETRY');
      }
      if (!this.stopped) await setTimeout(1000);
    }
  }
  async reconcile() {
    // Recover a lost Redis job from durable PostgreSQL state; never reset a terminal issuance.
    const rows = await this.db.document.findMany({
      where: {
        OR: [
          { generationStatus: 'PENDING' },
          { generationStatus: 'PROCESSING', leaseUntil: { lt: new Date() } },
        ],
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
          eventType: DOCUMENT_GENERATION_EVENT,
          status: 'PROCESSED',
        },
        select: { id: true },
      });
      if (!dispatched) continue;
      const job = await this.queue.getJob(row.id);
      if (!job)
        await this.queue.add(
          DOCUMENT_GENERATION_EVENT,
          { tenantId: row.tenantId, documentId: row.id },
          { jobId: row.id },
        );
      else if (await job.isFailed()) {
        await this.db.$transaction(async (db) => {
          const changed = await db.document.updateMany({
            where: {
              tenantId: row.tenantId,
              id: row.id,
              OR: [
                { generationStatus: 'PENDING' },
                { generationStatus: 'PROCESSING', leaseUntil: { lt: new Date() } },
              ],
            },
            data: {
              generationStatus: 'FAILED',
              failureCode: 'DOCUMENT_QUEUE_EXHAUSTED',
              leaseToken: null,
              leaseUntil: null,
            },
          });
          if (changed.count)
            await workerDocumentAudit(db, row.tenantId, row.id, 'document.failed', {
              code: 'DOCUMENT_QUEUE_EXHAUSTED',
            });
        });
      }
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
