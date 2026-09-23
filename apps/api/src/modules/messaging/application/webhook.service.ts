import { Inject, Injectable } from '@nestjs/common';
import { loadMessagingConfig } from '@gestschool/config/messaging';
import { IamError } from '../../iam/domain/context.js';
import { MessagingDatabase } from '../infrastructure/messaging.database.js';
import { validBrevoBearer, validateBrevoEvent } from '../domain/webhook-auth.js';
import { webhookStatus } from '../domain/webhook-status.js';

@Injectable()
export class MessagingWebhookService {
  constructor(@Inject(MessagingDatabase) private readonly database: MessagingDatabase) {}

  async accept(authorization: string | undefined, payload: unknown) {
    const secret = loadMessagingConfig().webhookSecret;
    if (!secret || !validBrevoBearer(authorization, secret))
      throw new IamError('WEBHOOK_UNAUTHORIZED', 401);
    let event: ReturnType<typeof validateBrevoEvent>;
    try {
      event = validateBrevoEvent(payload);
    } catch {
      throw new IamError('WEBHOOK_INVALID', 400);
    }
    const next = webhookStatus(event.event);
    if (!next) return { accepted: true, updated: false };

    return this.database.client.$transaction(async (db) => {
      const message = await db.message.findFirst({
        where: { provider: 'BREVO', providerMessageId: event['message-id'] },
        select: { id: true, tenantId: true },
      });
      if (!message) throw new IamError('WEBHOOK_MESSAGE_UNKNOWN', 404);
      const inserted = await db.providerWebhookEvent.createMany({
        data: [
          {
            tenantId: message.tenantId,
            messageId: message.id,
            eventKey: event.key,
            eventType: event.event,
            occurredAt: new Date(event.ts_event * 1000),
          },
        ],
        skipDuplicates: true,
      });
      if (!inserted.count) return { accepted: true, updated: false };

      // The conditional UPDATE makes concurrent callbacks monotonic even if both
      // read an old status. Terminal statuses are never overwritten by an older one.
      const prior =
        next === 'SENT'
          ? (['PENDING', 'QUEUED', 'SENDING'] as const)
          : (['SENDING', 'SENT', 'FAILED'] as const);
      const changed = await db.message.updateMany({
        where: { id: message.id, tenantId: message.tenantId, status: { in: [...prior] } },
        data: {
          status: next,
          ...(next === 'SENT' ? { sentAt: new Date() } : {}),
          ...(next === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
          ...(['BOUNCED', 'REJECTED'].includes(next)
            ? { failedAt: new Date(), lastErrorCode: `BREVO_${next}` }
            : {}),
        },
      });
      if (changed.count)
        await db.auditLog.create({
          data: {
            tenantId: message.tenantId,
            action: next === 'DELIVERED' ? 'message.delivered' : 'message.provider_status',
            entityType: 'message',
            entityId: message.id,
            metadata: { status: next },
          },
        });
      return { accepted: true, updated: changed.count === 1 };
    });
  }
}
