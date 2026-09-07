import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@gestschool/database';
import type { GuardianCreate, GuardianUpdate, PeopleQuery } from '@gestschool/contracts';
import { GuardianRepository } from '../domain/guardian.repository.js';
import type { RequestContext } from '../../iam/domain/context.js';
import { hasScope, tenantPermission } from '../../people/domain/policy.js';
import {
  PeopleDatabase,
  audit,
  editable,
  found,
  nextReference,
  personView,
} from '../../people/infrastructure/people-database.js';

export function guardianReadWhere(context: RequestContext): Prisma.GuardianWhereInput {
  if (tenantPermission(context, 'guardians.read')) return { tenantId: context.tenantId };
  const allowed: Prisma.GuardianWhereInput[] = [];
  if (hasScope(context, 'guardians', 'OWN')) allowed.push({ userId: context.userId });
  return { tenantId: context.tenantId, OR: allowed.length ? allowed : [{ id: { in: [] } }] };
}
@Injectable()
export class PrismaGuardianRepository extends GuardianRepository {
  constructor(@Inject(PeopleDatabase) private readonly database: PeopleDatabase) {
    super();
  }
  override async list(context: RequestContext, query: PeopleQuery) {
    const where: Prisma.GuardianWhereInput = {
      AND: [
        guardianReadWhere(context),
        query.status === 'ALL' ? {} : { status: query.status },
        query.search
          ? {
              OR: [
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
                { guardianReference: { contains: query.search, mode: 'insensitive' } },
                { email: { contains: query.search, mode: 'insensitive' } },
                { phone: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };
    const direction = query.sort.startsWith('-') ? 'desc' : 'asc';
    const sort = query.sort.replace('-', '');
    const orderBy: Prisma.GuardianOrderByWithRelationInput[] =
      sort === 'name'
        ? [{ lastName: direction }, { firstName: direction }, { id: 'asc' }]
        : [
            sort === 'reference' ? { guardianReference: direction } : { createdAt: direction },
            { id: 'asc' },
          ];
    const [rows, total] = await this.database.client.$transaction(
      [
        this.database.client.guardian.findMany({
          where,
          orderBy,
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.database.client.guardian.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items: rows.map(personView), total, page: query.page, pageSize: query.pageSize };
  }
  override async get(context: RequestContext, id: string) {
    return personView(
      found(
        await this.database.client.guardian.findFirst({
          where: { AND: [guardianReadWhere(context), { id }] },
        }),
      ),
    );
  }
  override create(context: RequestContext, input: GuardianCreate) {
    return this.database.write(context, async (db) => {
      const row = await db.guardian.create({
        data: {
          tenantId: context.tenantId,
          firstName: input.firstName,
          lastName: input.lastName,
          guardianReference:
            input.guardianReference ?? (await nextReference(db, context.tenantId, 'guardians')),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
        },
      });
      const result = personView(row);
      await audit(db, context, 'guardian.created', row.id, null, result);
      return result;
    });
  }
  override update(context: RequestContext, id: string, input: GuardianUpdate) {
    return this.database.write(context, async (db) => {
      const before = found(
        await db.guardian.findFirst({ where: { id, tenantId: context.tenantId } }),
      );
      editable(before.status);
      const after = await db.guardian.update({
        where: { tenantId_id: { tenantId: context.tenantId, id } },
        data: {
          ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
          ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
          ...(input.guardianReference !== undefined
            ? { guardianReference: input.guardianReference }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
        },
      });
      await audit(db, context, 'guardian.updated', id, personView(before), personView(after));
      return personView(after);
    });
  }
  override archive(context: RequestContext, id: string, restore: boolean) {
    return this.database.write(context, async (db) => {
      const before = found(
        await db.guardian.findFirst({ where: { id, tenantId: context.tenantId } }),
      );
      if ((before.status === 'ARCHIVED') === !restore) return personView(before);
      const after = await db.guardian.update({
        where: { tenantId_id: { tenantId: context.tenantId, id } },
        data: { status: restore ? 'ACTIVE' : 'ARCHIVED', archivedAt: restore ? null : new Date() },
      });
      await audit(
        db,
        context,
        restore ? 'guardian.restored' : 'guardian.archived',
        id,
        personView(before),
        personView(after),
      );
      return personView(after);
    });
  }
}
