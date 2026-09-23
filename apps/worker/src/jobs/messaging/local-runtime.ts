import { setTimeout } from 'node:timers/promises';
import { Logger, type OnModuleDestroy } from '@nestjs/common';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { loadMessagingConfig } from '@gestschool/config/messaging';
import { createPrismaClient } from '@gestschool/database';
import {
  createMessagingQueue,
  createMessagingProvider,
  createMessagingWorker,
} from '@gestschool/infrastructure';
import { MessagingOutboxDispatcher } from './dispatch.js';
import { MessagingDelivery } from './local-delivery.js';

export class LocalMessagingRuntime implements OnModuleDestroy {
  private readonly infrastructure = loadInfrastructureConfig();
  private readonly db = createPrismaClient(this.infrastructure.databaseUrl);
  private readonly logger = new Logger('LocalMessagingWorker');
  private queue: ReturnType<typeof createMessagingQueue> | undefined;
  private worker: ReturnType<typeof createMessagingWorker> | undefined;
  private loop: Promise<void> | undefined;
  private stopped = false;

  async start(): Promise<void> {
    const config = loadMessagingConfig();
    const schema = await this.db.$queryRaw<{ table_name: string | null }[]>`
      SELECT to_regclass('public.message_templates')::text AS table_name
    `;
    if (!schema[0]?.table_name) {
      this.logger.warn('Messaging migration is not applied; local delivery remains disabled');
      return;
    }
    const queue = createMessagingQueue(this.infrastructure.redisUrl);
    queue.on('error', () => this.logger.error('MESSAGING_QUEUE_UNAVAILABLE'));
    await queue.waitUntilReady();
    const provider = createMessagingProvider(config);
    const delivery = new MessagingDelivery(this.db, config, provider);
    const dispatcher = new MessagingOutboxDispatcher(this.db, queue);
    const worker = createMessagingWorker(
      this.infrastructure.redisUrl,
      ({ tenantId, eventId }, job) => delivery.process(tenantId, eventId, job),
    );
    worker.on('error', () => this.logger.error('MESSAGING_WORKER_UNAVAILABLE'));
    worker.on('failed', (job) =>
      this.logger.warn(
        JSON.stringify({
          event: 'messaging.job.failed',
          eventId: job?.id,
          attempt: job?.attemptsMade,
        }),
      ),
    );
    await worker.waitUntilReady();
    this.queue = queue;
    this.worker = worker;
    this.loop = this.dispatchLoop(dispatcher);
    this.logger.log(`Messaging queue and outbox ready (provider=${provider.name})`);
  }

  private async dispatchLoop(dispatcher: MessagingOutboxDispatcher): Promise<void> {
    while (!this.stopped) {
      try {
        await dispatcher.dispatchOnce();
        await dispatcher.reconcileOnce();
      } catch {
        this.logger.error('MESSAGING_OUTBOX_RETRY');
      }
      if (!this.stopped) await setTimeout(1000);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    await this.loop;
    await this.worker?.close();
    await this.queue?.close();
    await this.db.$disconnect();
  }
}
