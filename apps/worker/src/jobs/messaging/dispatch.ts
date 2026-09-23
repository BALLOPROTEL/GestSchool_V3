import { messagingEventTypes } from '@gestschool/contracts';
import type { GestSchoolPrismaClient } from '@gestschool/database';
import { createMessagingQueue } from '@gestschool/infrastructure';

const types: readonly string[] = messagingEventTypes;

export class MessagingOutboxDispatcher {
  constructor(
    private readonly db: GestSchoolPrismaClient,
    private readonly queue: ReturnType<typeof createMessagingQueue>,
  ) {}

  async dispatchOnce(): Promise<number> {
    return this.db.$transaction(
      async (transaction) => {
        const events = await transaction.$queryRaw<
          { id: string; tenant_id: string; event_type: string }[]
        >`
          SELECT id, tenant_id, event_type FROM outbox_events
          WHERE status='PENDING' AND event_type = ANY(${types}::text[])
          ORDER BY occurred_at, id LIMIT 20 FOR UPDATE SKIP LOCKED
        `;
        for (const event of events) {
          await this.queue.add(
            event.event_type,
            { tenantId: event.tenant_id, eventId: event.id },
            { jobId: event.id },
          );
          await transaction.outboxEvent.update({
            where: { id: event.id },
            data: { status: 'PROCESSED', processedAt: new Date(), attempts: { increment: 1 } },
          });
        }
        return events.length;
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
  }

  // A Redis loss after the PostgreSQL commit is recovered from the same durable
  // event. The cursor sweeps all processed messaging events, not just recent ones.
  private cursor: string | undefined;
  async reconcileOnce(): Promise<number> {
    const rows = await this.db.outboxEvent.findMany({
      where: {
        status: 'PROCESSED',
        eventType: { in: [...types] },
        ...(this.cursor ? { id: { gt: this.cursor } } : {}),
      },
      select: { id: true, tenantId: true, eventType: true },
      orderBy: { id: 'asc' },
      take: 100,
    });
    for (const event of rows) {
      if (!(await this.queue.getJob(event.id)))
        await this.queue.add(
          event.eventType,
          { tenantId: event.tenantId, eventId: event.id },
          { jobId: event.id },
        );
    }
    this.cursor = rows.length === 100 ? rows[99]?.id : undefined;
    return rows.length;
  }
}
