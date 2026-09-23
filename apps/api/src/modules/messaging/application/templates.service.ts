import { Inject, Injectable } from '@nestjs/common';
import { messagingTemplateKeys } from '@gestschool/contracts';
import { renderMessagingTemplate } from '@gestschool/infrastructure';
import { z } from 'zod';
import { IamError, type RequestContext } from '../../iam/domain/context.js';
import { MessagingDatabase } from '../infrastructure/messaging.database.js';

const draft = z.strictObject({
  key: z.enum(messagingTemplateKeys),
  channel: z.enum(['EMAIL', 'WHATSAPP', 'IN_APP']),
  locale: z.enum(['fr', 'en', 'ar']),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(2000),
});
const edit = draft.pick({ subject: true, body: true });
const dummy = {
  'recipient.firstName': 'Test',
  'school.name': 'GestSchool',
  'student.firstName': 'Test',
  'academicYear.name': '2026',
  'invoice.reference': 'INV-1',
  'payment.amount': '100 XOF',
  'document.reference': 'DOC-1',
  actionUrl: 'https://example.invalid/fr/communications',
};

function validateContent(subject: string, body: string) {
  if (/https?:\/\/|www\./i.test(`${subject} ${body}`))
    throw new IamError('MESSAGING_TEMPLATE_URL_DENIED', 400);
  renderMessagingTemplate({ subject, body }, dummy);
}

@Injectable()
export class TemplatesService {
  constructor(@Inject(MessagingDatabase) private readonly database: MessagingDatabase) {}

  async list(context: RequestContext) {
    return this.database.client.messageTemplate.findMany({
      where: { OR: [{ tenantId: context.tenantId }, { tenantId: null }] },
      select: {
        id: true,
        tenantId: true,
        key: true,
        channel: true,
        locale: true,
        version: true,
        subject: true,
        body: true,
        status: true,
        publishedAt: true,
        createdAt: true,
      },
      orderBy: [{ key: 'asc' }, { channel: 'asc' }, { locale: 'asc' }, { version: 'desc' }],
      take: 500,
    });
  }

  async create(context: RequestContext, input: unknown) {
    const value = draft.parse(input);
    validateContent(value.subject, value.body);
    return this.database.client.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM tenants WHERE id=${context.tenantId}::uuid FOR UPDATE`;
      const latest = await db.messageTemplate.findFirst({
        where: {
          tenantId: context.tenantId,
          key: value.key,
          channel: value.channel,
          locale: value.locale,
        },
        orderBy: { version: 'desc' },
      });
      const row = await db.messageTemplate.create({
        data: { tenantId: context.tenantId, ...value, version: (latest?.version ?? 0) + 1 },
      });
      await db.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorMembershipId: context.membershipId,
          action: 'template.created',
          entityType: 'message_template',
          entityId: row.id,
        },
      });
      return row;
    });
  }

  async update(context: RequestContext, id: string, input: unknown) {
    z.uuid().parse(id);
    const value = edit.parse(input);
    validateContent(value.subject, value.body);
    return this.database.client.$transaction(async (db) => {
      const row = await db.messageTemplate.findFirst({ where: { id, tenantId: context.tenantId } });
      if (!row) throw new IamError('MESSAGING_TEMPLATE_NOT_FOUND', 404);
      if (row.status !== 'DRAFT') throw new IamError('MESSAGING_TEMPLATE_IMMUTABLE', 409);
      const updated = await db.messageTemplate.update({ where: { id }, data: value });
      await db.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorMembershipId: context.membershipId,
          action: 'template.updated',
          entityType: 'message_template',
          entityId: id,
        },
      });
      return updated;
    });
  }

  async transition(context: RequestContext, id: string, target: 'PUBLISHED' | 'ARCHIVED') {
    z.uuid().parse(id);
    return this.database.client.$transaction(async (db) => {
      const row = await db.messageTemplate.findFirst({ where: { id, tenantId: context.tenantId } });
      if (!row) throw new IamError('MESSAGING_TEMPLATE_NOT_FOUND', 404);
      if (target === 'PUBLISHED' && row.status !== 'DRAFT')
        throw new IamError('MESSAGING_TEMPLATE_IMMUTABLE', 409);
      if (target === 'ARCHIVED' && row.status === 'ARCHIVED') return row;
      if (target === 'PUBLISHED') validateContent(row.subject, row.body);
      const updated = await db.messageTemplate.update({
        where: { id },
        data: { status: target, ...(target === 'PUBLISHED' ? { publishedAt: new Date() } : {}) },
      });
      await db.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorMembershipId: context.membershipId,
          action: target === 'PUBLISHED' ? 'template.published' : 'template.archived',
          entityType: 'message_template',
          entityId: id,
        },
      });
      return updated;
    });
  }
}
