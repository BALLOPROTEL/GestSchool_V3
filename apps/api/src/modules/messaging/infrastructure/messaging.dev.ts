import { loadInfrastructureConfig } from '@gestschool/config/environment';
import type { GestSchoolPrismaClient } from '@gestschool/database';

// Explicit local fixture only. It never runs from the production seed or an HTTP route.
export async function prepareMessagingDemo(db: GestSchoolPrismaClient, tenantId: string) {
  if (
    process.env['IAM_ENV'] !== 'local' ||
    !['development', 'test'].includes(process.env['NODE_ENV'] ?? '') ||
    !['localhost', '127.0.0.1', '[::1]'].includes(
      new URL(loadInfrastructureConfig().databaseUrl).hostname,
    )
  )
    throw new Error('Messaging fixtures require local DEV/TEST');

  const sender = await db.membership.findFirstOrThrow({
    where: { tenantId, user: { email: 'school-admin@example.invalid' } },
  });
  const parent = await db.membership.findFirstOrThrow({
    where: { tenantId, user: { email: 'parent@example.invalid' } },
  });
  const student = await db.membership.findFirstOrThrow({
    where: { tenantId, user: { email: 'student@example.invalid' } },
  });
  const guardian = await db.guardian.findFirstOrThrow({
    where: { tenantId, userId: parent.userId },
  });
  const now = new Date();
  const messages = [
    {
      key: 'dev:messaging:email-sent',
      channel: 'EMAIL' as const,
      status: 'SENT' as const,
      recipientMembershipId: parent.id,
      recipientGuardianId: null,
      recipientMasked: 'p***@example.invalid',
      providerMessageId: `dev:${tenantId}:email-sent`,
      subject: 'Information scolaire envoyée',
      sentAt: now,
      deliveredAt: null,
      failedAt: null,
      lastErrorCode: null,
    },
    {
      key: 'dev:messaging:whatsapp-delivered',
      channel: 'WHATSAPP' as const,
      status: 'DELIVERED' as const,
      recipientMembershipId: null,
      recipientGuardianId: guardian.id,
      recipientMasked: '+223 *** ** 01',
      providerMessageId: `dev:${tenantId}:whatsapp-delivered`,
      subject: 'Document disponible',
      sentAt: now,
      deliveredAt: now,
      failedAt: null,
      lastErrorCode: null,
    },
    {
      key: 'dev:messaging:email-failed',
      channel: 'EMAIL' as const,
      status: 'FAILED' as const,
      recipientMembershipId: parent.id,
      recipientGuardianId: null,
      recipientMasked: 'p***@example.invalid',
      providerMessageId: null,
      subject: 'Message en échec démonstration',
      sentAt: null,
      deliveredAt: null,
      failedAt: now,
      lastErrorCode: 'LOCAL_DELIVERY_UNAVAILABLE',
    },
  ];
  for (const message of messages)
    await db.message.upsert({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: message.key } },
      update: {},
      create: {
        tenantId,
        senderMembershipId: sender.id,
        recipientMembershipId: message.recipientMembershipId,
        recipientGuardianId: message.recipientGuardianId,
        channel: message.channel,
        category: 'SCHOOL',
        idempotencyKey: message.key,
        eventType: 'dev.messaging.fixture.v1',
        templateKey: 'manual.school_notice',
        templateVersion: 1,
        locale: 'fr',
        provider: 'LOCAL',
        providerMessageId: message.providerMessageId,
        recipientMasked: message.recipientMasked,
        subject: message.subject,
        body: 'Contenu de démonstration sans donnée sensible.',
        status: message.status,
        attempts: message.status === 'FAILED' ? 5 : 1,
        sentAt: message.sentAt,
        deliveredAt: message.deliveredAt,
        failedAt: message.failedAt,
        lastErrorCode: message.lastErrorCode,
      },
    });

  for (const membership of [parent, student]) {
    for (const item of [
      { suffix: 'unread', status: 'UNREAD' as const, readAt: null },
      { suffix: 'read', status: 'READ' as const, readAt: now },
    ])
      await db.notification.upsert({
        where: {
          tenantId_idempotencyKey: {
            tenantId,
            idempotencyKey: `dev:messaging:${membership.id}:${item.suffix}`,
          },
        },
        update: {},
        create: {
          tenantId,
          membershipId: membership.id,
          type: 'documents.ready.v1',
          title: item.status === 'UNREAD' ? 'Nouveau document' : 'Paiement validé',
          body: 'Une information est disponible dans GestSchool.',
          resourcePath: '/fr/documents',
          idempotencyKey: `dev:messaging:${membership.id}:${item.suffix}`,
          status: item.status,
          readAt: item.readAt,
        },
      });
  }
  return { messages: messages.length, notifications: 4 };
}
