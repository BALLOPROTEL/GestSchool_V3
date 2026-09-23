import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { RequestContext } from '../../iam/domain/context.js';
import { IamError } from '../../iam/domain/context.js';
import { NotificationsDatabase } from '../infrastructure/notifications.database.js';

const querySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['UNREAD', 'READ']).optional(),
});

@Injectable()
export class NotificationsService {
  constructor(@Inject(NotificationsDatabase) private readonly database: NotificationsDatabase) {}

  async list(context: RequestContext, query: unknown) {
    const input = querySchema.parse(query);
    const where = {
      tenantId: context.tenantId,
      membershipId: context.membershipId,
      ...(input.status ? { status: input.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.database.client.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          locale: true,
          resourcePath: true,
          status: true,
          createdAt: true,
          readAt: true,
        },
      }),
      this.database.client.notification.count({ where }),
    ]);
    return { items, total, page: input.page, pageSize: input.pageSize };
  }

  unreadCount(context: RequestContext) {
    return this.database.client.notification
      .count({
        where: {
          tenantId: context.tenantId,
          membershipId: context.membershipId,
          status: 'UNREAD',
        },
      })
      .then((count) => ({ count }));
  }

  async read(context: RequestContext, id: string) {
    z.uuid().parse(id);
    return this.database.client.$transaction(async (db) => {
      const owned = await db.notification.findFirst({
        where: { tenantId: context.tenantId, membershipId: context.membershipId, id },
        select: { id: true },
      });
      if (!owned) throw new IamError('NOTIFICATION_NOT_FOUND', 404);
      const changed = await db.notification.updateMany({
        where: {
          id,
          tenantId: context.tenantId,
          membershipId: context.membershipId,
          status: 'UNREAD',
        },
        data: { status: 'READ', readAt: new Date() },
      });
      if (changed.count)
        await db.auditLog.create({
          data: {
            tenantId: context.tenantId,
            actorMembershipId: context.membershipId,
            action: 'notification.read',
            entityType: 'notification',
            entityId: id,
          },
        });
      return { ok: true };
    });
  }

  async readAll(context: RequestContext) {
    return this.database.client.$transaction(async (db) => {
      const changed = await db.notification.updateMany({
        where: {
          tenantId: context.tenantId,
          membershipId: context.membershipId,
          status: 'UNREAD',
        },
        data: { status: 'READ', readAt: new Date() },
      });
      if (changed.count)
        await db.auditLog.create({
          data: {
            tenantId: context.tenantId,
            actorMembershipId: context.membershipId,
            action: 'notification.read_all',
            entityType: 'notification',
            metadata: { count: changed.count },
          },
        });
      return { ok: true, count: changed.count };
    });
  }
}
