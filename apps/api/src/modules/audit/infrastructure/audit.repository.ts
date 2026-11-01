import { Inject, Injectable } from '@nestjs/common';
import type { AuditListQuery, AuditListView } from '@gestschool/contracts';
import type { Prisma } from '@gestschool/database';
import type { RequestContext } from '../../iam/domain/context.js';
import { AuditRepository } from '../domain/audit.repository.js';
import { AuditDatabase } from './database.js';

@Injectable()
export class PrismaAuditRepository extends AuditRepository {
  constructor(@Inject(AuditDatabase) private readonly database: AuditDatabase) {
    super();
  }

  override async list(context: RequestContext, query: AuditListQuery): Promise<AuditListView> {
    const search = query.q.trim();
    const occurredAt =
      query.from || query.to
        ? {
            ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
            ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
          }
        : undefined;
    const where: Prisma.AuditLogWhereInput = {
      tenantId: context.tenantId,
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(occurredAt ? { occurredAt } : {}),
      ...(search
        ? {
            OR: [
              { action: { contains: search, mode: 'insensitive' } },
              { entityType: { contains: search, mode: 'insensitive' } },
              {
                actor: {
                  user: {
                    displayName: { contains: search, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.database.client.auditLog.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          occurredAt: true,
          action: true,
          entityType: true,
          entityId: true,
          actor: {
            select: {
              id: true,
              user: { select: { displayName: true } },
            },
          },
        },
      }),
      this.database.client.auditLog.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        occurredAt: item.occurredAt.toISOString(),
        actor: item.actor
          ? {
              membershipId: item.actor.id,
              displayName: item.actor.user.displayName,
            }
          : null,
        action: item.action,
        entityType: item.entityType,
        entityId: item.entityId,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}
