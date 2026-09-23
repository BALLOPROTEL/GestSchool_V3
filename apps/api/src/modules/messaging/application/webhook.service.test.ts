import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MessageStatus } from '@gestschool/database';
import { MessagingWebhookService } from './webhook.service.js';
import type { MessagingDatabase } from '../infrastructure/messaging.database.js';

const key = Buffer.alloc(32, 7).toString('base64');
const secret = createHmac('sha256', Buffer.from(key, 'base64'))
  .update('gestschool-local-webhook-v1')
  .digest('hex');

afterEach(() => vi.unstubAllEnvs());

function fixture(initialStatus: MessageStatus) {
  let status = initialStatus;
  const eventKeys = new Set<string>();
  let audits = 0;
  const transaction = {
    message: {
      findFirst: async ({ where }: { where: { providerMessageId: string } }) =>
        where.providerMessageId === 'brevo-1'
          ? {
              id: '00000000-0000-7000-8000-000000000001',
              tenantId: '00000000-0000-7000-8000-000000000002',
            }
          : null,
      updateMany: async ({
        where,
        data,
      }: {
        where: { status: { in: MessageStatus[] } };
        data: { status: MessageStatus };
      }) => {
        if (!where.status.in.includes(status)) return { count: 0 };
        status = data.status;
        return { count: 1 };
      },
    },
    providerWebhookEvent: {
      createMany: async ({ data }: { data: { eventKey: string }[] }) => {
        const eventKey = data[0]?.eventKey;
        if (!eventKey || eventKeys.has(eventKey)) return { count: 0 };
        eventKeys.add(eventKey);
        return { count: 1 };
      },
    },
    auditLog: {
      create: async () => {
        audits += 1;
      },
    },
  };
  const database = {
    client: {
      $transaction: async (operation: (db: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    },
  } as unknown as MessagingDatabase;
  return {
    service: new MessagingWebhookService(database),
    status: () => status,
    audits: () => audits,
    events: () => eventKeys.size,
  };
}

describe('Brevo webhook application', () => {
  it('rejects invalid authentication and unknown provider IDs', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('MESSAGING_TOKEN_KEY', key);
    vi.stubEnv('BREVO_WEBHOOK_SECRET', secret);
    const { service } = fixture('SENT');
    const event = {
      event: 'delivered',
      'message-id': 'brevo-1',
      ts_event: Math.floor(Date.now() / 1000),
    };
    await expect(service.accept('Bearer incorrect', event)).rejects.toMatchObject({ status: 401 });
    await expect(
      service.accept(`Bearer ${secret}`, { ...event, 'message-id': 'unknown' }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('records a duplicate once and never regresses DELIVERED to SENT', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('MESSAGING_TOKEN_KEY', key);
    vi.stubEnv('BREVO_WEBHOOK_SECRET', secret);
    const context = fixture('SENT');
    const event = {
      event: 'delivered',
      'message-id': 'brevo-1',
      ts_event: Math.floor(Date.now() / 1000),
    };
    expect(await context.service.accept(`Bearer ${secret}`, event)).toEqual({
      accepted: true,
      updated: true,
    });
    expect(await context.service.accept(`Bearer ${secret}`, event)).toEqual({
      accepted: true,
      updated: false,
    });
    expect(await context.service.accept(`Bearer ${secret}`, { ...event, event: 'sent' })).toEqual({
      accepted: true,
      updated: false,
    });
    expect(context.status()).toBe('DELIVERED');
    expect(context.events()).toBe(2);
    expect(context.audits()).toBe(1);
  });
});
