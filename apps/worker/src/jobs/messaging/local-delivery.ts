import type { MessagingConfig } from '@gestschool/config/messaging';
import type { MessageChannel, OutboxEvent, GestSchoolPrismaClient } from '@gestschool/database';
import {
  decryptMessagingToken,
  renderMessagingTemplate,
  systemTemplate,
  type MessagingProvider,
  type MessagingTemplateKey,
  type MessagingLocale,
  type TemplateValues,
} from '@gestschool/infrastructure';
import {
  eligibleChannels,
  isIamDelivery,
  maskedDestination,
  messagingIdempotencyKey,
} from './channel-policy.js';
import { resolveMessagingEvent } from './event-resolution.js';
import type { MessageRecipient } from './recipients.js';

interface SelectedTemplate {
  subject: string;
  body: string;
  version: number;
}

// Delivery remains provider-agnostic. Local/test captures privately; production
// selects the Brevo adapter from validated environment configuration.
export class MessagingDelivery {
  constructor(
    private readonly db: GestSchoolPrismaClient,
    private readonly config: MessagingConfig,
    private readonly provider: MessagingProvider,
  ) {}

  async process(
    tenantId: string,
    eventId: string,
    delivery: { attempt: number; maxAttempts: number } = { attempt: 1, maxAttempts: 1 },
  ): Promise<void> {
    const event = await this.db.outboxEvent.findFirst({
      where: { id: eventId, tenantId, status: 'PROCESSED' },
    });
    if (!event) throw new Error('MESSAGING_EVENT_NOT_READY');
    if (
      typeof event.payload !== 'object' ||
      event.payload === null ||
      Array.isArray(event.payload) ||
      event.payload['schemaVersion'] !== 1
    )
      throw new Error('MESSAGING_EVENT_VERSION_INVALID');
    const resolved = await resolveMessagingEvent(this.db, event);
    if (!resolved) return;
    for (const recipient of resolved.recipients) {
      const preferences = recipient.membershipId
        ? await this.db.notificationPreference.findMany({
            where: { tenantId, membershipId: recipient.membershipId },
            select: { channel: true, enabled: true },
          })
        : [];
      for (const channel of eligibleChannels(
        event.eventType,
        recipient,
        preferences,
        resolved.requestedChannels,
      )) {
        const template = await this.selectTemplate(
          tenantId,
          resolved.key,
          recipient.locale,
          channel,
        );
        const path = `/${recipient.locale}${resolved.path}`;
        const publicActionUrl = new URL(path, this.config.appPublicOrigin).toString();
        const values: TemplateValues = {
          ...resolved.values,
          'recipient.firstName': recipient.firstName,
          actionUrl: publicActionUrl,
        };
        const displayed = renderMessagingTemplate(template, values);
        const key = messagingIdempotencyKey(event.id, recipient, channel);
        if (channel === 'IN_APP') {
          await this.createInApp(
            event,
            recipient,
            resolved.key,
            template,
            displayed,
            key,
            path,
            resolved.senderMembershipId,
            resolved.category,
          );
          continue;
        }
        const existing = await this.db.message.findUnique({
          where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: key } },
          select: { status: true },
        });
        if (existing && !['PENDING', 'FAILED'].includes(existing.status)) continue;
        let privateHtml = displayed.html;
        let privateText = displayed.text;
        if (isIamDelivery(event.eventType)) {
          const token = await this.privateIamToken(resolved.authTokenId, event.eventType);
          const action = new URL(path, this.config.appPublicOrigin);
          action.searchParams.set('token', token);
          const privateContent = renderMessagingTemplate(template, {
            ...values,
            actionUrl: action.toString(),
          });
          privateHtml = privateContent.html;
          privateText = privateContent.text;
        }
        await this.captureExternal(
          event,
          recipient,
          channel,
          resolved.key,
          template,
          displayed,
          key,
          privateHtml,
          privateText,
          delivery,
          resolved.senderMembershipId,
          resolved.category,
        );
      }
    }
  }

  private async selectTemplate(
    tenantId: string,
    key: MessagingTemplateKey,
    locale: MessagingLocale,
    channel: MessageChannel,
  ): Promise<SelectedTemplate> {
    const where = { key, channel, locale, status: 'PUBLISHED' as const };
    const template =
      (await this.db.messageTemplate.findFirst({
        where: { ...where, tenantId },
        orderBy: { version: 'desc' },
      })) ??
      (await this.db.messageTemplate.findFirst({
        where: { ...where, tenantId: null },
        orderBy: { version: 'desc' },
      }));
    return template
      ? { subject: template.subject, body: template.body, version: template.version }
      : { ...systemTemplate(key, locale), version: 1 };
  }

  private async privateIamToken(tokenId: string | undefined, eventType: string): Promise<string> {
    if (!tokenId) throw new Error('MESSAGING_IAM_TOKEN_MISSING');
    const purpose =
      eventType === 'iam.account.activation.requested.v1' ? 'ACTIVATION' : 'PASSWORD_RESET';
    const token = await this.db.authToken.findFirst({
      where: { id: tokenId, purpose, usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!token?.encryptedSecret) throw new Error('MESSAGING_IAM_TOKEN_UNAVAILABLE');
    return decryptMessagingToken(
      token.encryptedSecret,
      token.userId,
      purpose,
      this.config.tokenKey,
    );
  }

  private async createInApp(
    event: OutboxEvent,
    recipient: MessageRecipient,
    templateKey: MessagingTemplateKey,
    template: SelectedTemplate,
    displayed: { subject: string; text: string },
    key: string,
    path: string,
    senderMembershipId: string | undefined,
    category: 'SCHOOL' | 'ACADEMIC' | 'FINANCE' | 'IAM',
  ): Promise<void> {
    const membershipId = recipient.membershipId;
    if (!membershipId) return;
    await this.db.$transaction(async (db) => {
      const inserted = await db.message.createMany({
        data: [
          {
            tenantId: event.tenantId,
            ...(senderMembershipId ? { senderMembershipId } : {}),
            recipientMembershipId: membershipId,
            channel: 'IN_APP',
            idempotencyKey: key,
            eventId: event.id,
            eventType: event.eventType,
            category,
            templateKey,
            templateVersion: template.version,
            locale: recipient.locale,
            provider: 'IN_APP',
            recipientMasked: 'In-app',
            subject: displayed.subject,
            body: displayed.text,
            status: 'DELIVERED',
            attempts: 1,
            sentAt: new Date(),
            deliveredAt: new Date(),
          },
        ],
        skipDuplicates: true,
      });
      if (!inserted.count) return;
      const message = await db.message.findUniqueOrThrow({
        where: { tenantId_idempotencyKey: { tenantId: event.tenantId, idempotencyKey: key } },
        select: { id: true },
      });
      await db.notification.createMany({
        data: [
          {
            tenantId: event.tenantId,
            membershipId,
            type: event.eventType,
            title: displayed.subject,
            body: displayed.text,
            locale: recipient.locale,
            resourcePath: path,
            idempotencyKey: key,
          },
        ],
        skipDuplicates: true,
      });
      await db.auditLog.create({
        data: {
          tenantId: event.tenantId,
          action: 'message.delivered',
          entityType: 'message',
          entityId: message.id,
          metadata: { eventId: event.id, channel: 'IN_APP' },
        },
      });
    });
  }

  private async captureExternal(
    event: OutboxEvent,
    recipient: MessageRecipient,
    channel: 'EMAIL' | 'WHATSAPP',
    templateKey: MessagingTemplateKey,
    template: SelectedTemplate,
    displayed: { subject: string; text: string },
    key: string,
    privateHtml: string,
    privateText: string,
    delivery: { attempt: number; maxAttempts: number },
    senderMembershipId: string | undefined,
    category: 'SCHOOL' | 'ACADEMIC' | 'FINANCE' | 'IAM',
  ): Promise<void> {
    const message = await this.db.$transaction(async (db) => {
      const inserted = await db.message.createMany({
        data: [
          {
            tenantId: event.tenantId,
            ...(senderMembershipId ? { senderMembershipId } : {}),
            recipientMembershipId: recipient.guardianId ? null : recipient.membershipId,
            recipientGuardianId: recipient.guardianId,
            channel,
            idempotencyKey: key,
            eventId: event.id,
            eventType: event.eventType,
            category,
            templateKey,
            templateVersion: template.version,
            locale: recipient.locale,
            provider: this.provider.name,
            recipientMasked: maskedDestination(channel, recipient),
            subject: displayed.subject,
            body: displayed.text,
            status: 'PENDING',
          },
        ],
        skipDuplicates: true,
      });
      const row = await db.message.findUniqueOrThrow({
        where: { tenantId_idempotencyKey: { tenantId: event.tenantId, idempotencyKey: key } },
        select: { id: true, status: true },
      });
      if (inserted.count)
        await db.auditLog.create({
          data: {
            tenantId: event.tenantId,
            action: 'message.requested',
            entityType: 'message',
            entityId: row.id,
            metadata: { channel },
          },
        });
      if (!['PENDING', 'FAILED'].includes(row.status)) return null;
      const reserved = await db.message.updateMany({
        where: { id: row.id, tenantId: event.tenantId, status: row.status },
        data: { status: 'SENDING', attempts: { increment: 1 }, failedAt: null },
      });
      if (reserved.count && delivery.attempt > 1)
        await db.auditLog.create({
          data: {
            tenantId: event.tenantId,
            action: 'message.retried',
            entityType: 'message',
            entityId: row.id,
          },
        });
      return reserved.count ? row.id : null;
    });
    if (!message) return;
    try {
      const destination = channel === 'EMAIL' ? recipient.email : recipient.phone;
      if (!destination) throw new Error('MESSAGING_DESTINATION_UNAVAILABLE');
      const receipt =
        channel === 'EMAIL'
          ? await this.provider.sendEmail({
              messageId: message,
              idempotencyKey: message,
              to: destination,
              subject: displayed.subject,
              html: privateHtml,
            })
          : await this.provider.sendWhatsApp({
              messageId: message,
              to: destination,
              text: privateText,
              locale: recipient.locale,
            });
      await this.db.$transaction(async (db) => {
        const updated = await db.message.updateMany({
          where: { id: message, tenantId: event.tenantId, status: 'SENDING' },
          data: {
            status: 'SENT',
            providerMessageId: receipt.providerMessageId,
            sentAt: new Date(),
          },
        });
        if (updated.count)
          await db.auditLog.create({
            data: {
              tenantId: event.tenantId,
              action: 'message.sent',
              entityType: 'message',
              entityId: message,
            },
          });
      });
    } catch (error) {
      const finalAttempt = delivery.attempt >= delivery.maxAttempts;
      await this.db.$transaction(async (db) => {
        const updated = await db.message.updateMany({
          where: { id: message, tenantId: event.tenantId, status: 'SENDING' },
          data: {
            status: finalAttempt ? 'FAILED' : 'PENDING',
            failedAt: finalAttempt ? new Date() : null,
            lastErrorCode: `${this.provider.name}_DELIVERY_UNAVAILABLE`,
          },
        });
        if (updated.count && finalAttempt)
          await db.auditLog.create({
            data: {
              tenantId: event.tenantId,
              action: 'message.failed',
              entityType: 'message',
              entityId: message,
              metadata: { code: `${this.provider.name}_DELIVERY_UNAVAILABLE` },
            },
          });
      });
      throw error;
    }
  }
}
