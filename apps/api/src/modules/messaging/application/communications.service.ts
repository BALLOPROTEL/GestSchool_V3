import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@gestschool/database';
import { z } from 'zod';
import { IamError, type RequestContext } from '../../iam/domain/context.js';
import { MessagingDatabase } from '../infrastructure/messaging.database.js';

const filters = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  channel: z.enum(['EMAIL', 'WHATSAPP', 'IN_APP']).optional(),
  status: z
    .enum([
      'DRAFT',
      'PENDING',
      'QUEUED',
      'SENDING',
      'SENT',
      'DELIVERED',
      'FAILED',
      'BOUNCED',
      'REJECTED',
      'CANCELLED',
    ])
    .optional(),
  eventType: z.string().max(160).optional(),
  dateFrom: z.iso.datetime().optional(),
  dateTo: z.iso.datetime().optional(),
  search: z.string().max(80).optional(),
});
const manualSend = z.strictObject({
  category: z.enum(['SCHOOL', 'ACADEMIC', 'FINANCE']),
  audience: z.strictObject({ type: z.enum(['STUDENT', 'CLASS']), id: z.uuid() }),
  channels: z
    .array(z.enum(['EMAIL', 'WHATSAPP', 'IN_APP']))
    .min(1)
    .max(3),
  confirmedRecipientCount: z.number().int().min(1).max(200),
});
const audiencePreview = manualSend.pick({ category: true, audience: true });

@Injectable()
export class CommunicationsService {
  constructor(@Inject(MessagingDatabase) private readonly database: MessagingDatabase) {}

  private scope(context: RequestContext): Prisma.MessageWhereInput {
    const grant = context.grants.find(
      (item) => item.permission === 'communications.read' && item.scope !== 'NONE',
    );
    if (!grant) throw new IamError('AUTH_FORBIDDEN', 403);
    if (grant.scope === 'ASSIGNED')
      return {
        tenantId: context.tenantId,
        senderMembershipId: context.membershipId,
        category: 'ACADEMIC',
      };
    if (
      grant.scope === 'TENANT' ||
      (grant.scope === 'PLATFORM' && context.roles.includes('SUPER_ADMIN'))
    ) {
      if (context.roles.some((role) => role === 'SCHOOL_ADMIN' || role === 'SUPER_ADMIN'))
        return { tenantId: context.tenantId };
      const categories = [
        ...(context.roles.includes('DIRECTOR') ? ['SCHOOL', 'ACADEMIC'] : []),
        ...(context.roles.includes('ACADEMIC_STAFF') ? ['ACADEMIC'] : []),
        ...(context.roles.includes('ACCOUNTANT') ? ['FINANCE'] : []),
      ];
      if (categories.length)
        return { tenantId: context.tenantId, category: { in: [...new Set(categories)] } };
    }
    throw new IamError('AUTH_FORBIDDEN', 403);
  }

  async list(context: RequestContext, query: unknown) {
    const input = filters.parse(query);
    const where: Prisma.MessageWhereInput = {
      ...this.scope(context),
      ...(input.channel ? { channel: input.channel } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.eventType ? { eventType: input.eventType } : {}),
      ...(input.dateFrom || input.dateTo
        ? {
            createdAt: {
              ...(input.dateFrom ? { gte: new Date(input.dateFrom) } : {}),
              ...(input.dateTo ? { lte: new Date(input.dateTo) } : {}),
            },
          }
        : {}),
      ...(input.search
        ? {
            OR: [
              { subject: { contains: input.search, mode: 'insensitive' } },
              { recipientMasked: { contains: input.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.database.client.message.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: {
          id: true,
          channel: true,
          recipientMasked: true,
          templateKey: true,
          templateVersion: true,
          eventType: true,
          category: true,
          subject: true,
          status: true,
          attempts: true,
          lastErrorCode: true,
          createdAt: true,
          sentAt: true,
          deliveredAt: true,
          failedAt: true,
        },
      }),
      this.database.client.message.count({ where }),
    ]);
    return { items, total, page: input.page, pageSize: input.pageSize };
  }

  async get(context: RequestContext, id: string) {
    z.uuid().parse(id);
    const row = await this.database.client.message.findFirst({
      where: { ...this.scope(context), id },
      select: {
        id: true,
        channel: true,
        recipientMasked: true,
        templateKey: true,
        templateVersion: true,
        eventType: true,
        category: true,
        subject: true,
        body: true,
        status: true,
        attempts: true,
        lastErrorCode: true,
        createdAt: true,
        sentAt: true,
        deliveredAt: true,
        failedAt: true,
      },
    });
    if (!row) throw new IamError('COMMUNICATION_NOT_FOUND', 404);
    return row;
  }

  async summary(context: RequestContext) {
    const rows = await this.database.client.message.groupBy({
      by: ['status'],
      where: this.scope(context),
      _count: { _all: true },
    });
    return { counts: Object.fromEntries(rows.map((row) => [row.status, row['_count']['_all']])) };
  }

  private assertSendCategory(context: RequestContext, category: 'SCHOOL' | 'ACADEMIC' | 'FINANCE') {
    if (context.roles.includes('SCHOOL_ADMIN') || context.roles.includes('SUPER_ADMIN')) return;
    if (context.roles.includes('DIRECTOR') && category !== 'FINANCE') return;
    if (context.roles.includes('ACADEMIC_STAFF') && category === 'ACADEMIC') return;
    if (context.roles.includes('ACCOUNTANT') && category === 'FINANCE') return;
    if (context.roles.includes('TEACHER') && category === 'ACADEMIC') return;
    throw new IamError('COMMUNICATION_CATEGORY_FORBIDDEN', 403);
  }

  private async audienceStudentIds(
    context: RequestContext,
    audience: { type: 'STUDENT' | 'CLASS'; id: string },
  ): Promise<string[]> {
    const assigned = context.grants.some(
      (grant) => grant.permission === 'communications.send' && grant.scope === 'ASSIGNED',
    );
    const assignedClass = {
      subjects: {
        some: {
          assignments: {
            some: {
              tenantId: context.tenantId,
              status: 'ACTIVE' as const,
              teacher: {
                tenantId: context.tenantId,
                userId: context.userId,
                status: 'ACTIVE' as const,
              },
              academicPeriod: { status: 'ACTIVE' as const },
            },
          },
        },
      },
    };
    if (audience.type === 'STUDENT') {
      const student = await this.database.client.student.findFirst({
        where: {
          tenantId: context.tenantId,
          id: audience.id,
          status: 'ACTIVE',
          ...(assigned
            ? { enrollments: { some: { status: 'ACTIVE', schoolClass: assignedClass } } }
            : {}),
        },
        select: { id: true },
      });
      if (!student) throw new IamError('COMMUNICATION_AUDIENCE_FORBIDDEN', 403);
      return [student.id];
    }
    const classroom = await this.database.client.schoolClass.findFirst({
      where: {
        tenantId: context.tenantId,
        id: audience.id,
        status: 'ACTIVE',
        ...(assigned ? assignedClass : {}),
      },
      select: {
        enrollments: {
          where: { status: 'ACTIVE', student: { status: 'ACTIVE' } },
          select: { studentId: true },
          take: 201,
        },
      },
    });
    if (!classroom) throw new IamError('COMMUNICATION_AUDIENCE_FORBIDDEN', 403);
    const ids = [...new Set(classroom.enrollments.map((item) => item.studentId))];
    if (!ids.length) throw new IamError('COMMUNICATION_AUDIENCE_EMPTY', 409);
    if (ids.length > 200) throw new IamError('COMMUNICATION_AUDIENCE_TOO_LARGE', 409);
    return ids;
  }

  async send(context: RequestContext, input: unknown, idempotencyKey: unknown) {
    const value = manualSend.parse(input);
    const key = z.uuid().parse(idempotencyKey);
    this.assertSendCategory(context, value.category);
    const studentIds = await this.audienceStudentIds(context, value.audience);
    if (studentIds.length !== value.confirmedRecipientCount)
      throw new IamError('COMMUNICATION_AUDIENCE_CHANGED', 409);
    const channels = [...new Set(['IN_APP' as const, ...value.channels])];
    return this.database.client.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM tenants WHERE id=${context.tenantId}::uuid FOR UPDATE`;
      const existing = await db.communicationRequest.findUnique({
        where: { tenantId_idempotencyKey: { tenantId: context.tenantId, idempotencyKey: key } },
      });
      if (existing) return { id: existing.id, recipientCount: existing.recipientCount };
      const request = await db.communicationRequest.create({
        data: {
          tenantId: context.tenantId,
          senderMembershipId: context.membershipId,
          idempotencyKey: key,
          audienceType: value.audience.type,
          audienceId: value.audience.id,
          category: value.category,
          channels,
          recipientCount: studentIds.length,
        },
      });
      await db.outboxEvent.create({
        data: {
          tenantId: context.tenantId,
          aggregateType: 'communication_request',
          aggregateId: request.id,
          eventType: 'communications.manual.requested.v1',
          payload: { schemaVersion: 1 },
        },
      });
      await db.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorMembershipId: context.membershipId,
          action: 'communication.manual_send',
          entityType: 'communication_request',
          entityId: request.id,
          metadata: {
            category: value.category,
            audienceType: value.audience.type,
            recipientCount: studentIds.length,
            channels,
          },
        },
      });
      return { id: request.id, recipientCount: request.recipientCount };
    });
  }

  async preview(context: RequestContext, input: unknown) {
    const value = audiencePreview.parse(input);
    this.assertSendCategory(context, value.category);
    const studentIds = await this.audienceStudentIds(context, value.audience);
    return { recipientCount: studentIds.length, maximum: 200 };
  }
}
