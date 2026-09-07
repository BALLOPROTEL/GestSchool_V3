import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@gestschool/database';
import type { TeacherCreate, TeacherUpdate, PeopleQuery } from '@gestschool/contracts';
import { TeacherRepository } from '../domain/teacher.repository.js';
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

export function teacherReadWhere(context: RequestContext): Prisma.TeacherWhereInput {
  if (tenantPermission(context, 'teachers.read')) return { tenantId: context.tenantId };
  const allowed: Prisma.TeacherWhereInput[] = [];
  if (hasScope(context, 'teachers', 'OWN')) allowed.push({ userId: context.userId });
  return { tenantId: context.tenantId, OR: allowed.length ? allowed : [{ id: { in: [] } }] };
}
@Injectable()
export class PrismaTeacherRepository extends TeacherRepository {
  constructor(@Inject(PeopleDatabase) private readonly database: PeopleDatabase) {
    super();
  }
  override async list(context: RequestContext, query: PeopleQuery) {
    const where: Prisma.TeacherWhereInput = {
      AND: [
        teacherReadWhere(context),
        query.status === 'ALL' ? {} : { status: query.status },
        query.search
          ? {
              OR: [
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
                { employeeNumber: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };
    const direction = query.sort.startsWith('-') ? 'desc' : 'asc';
    const sort = query.sort.replace('-', '');
    const orderBy: Prisma.TeacherOrderByWithRelationInput[] =
      sort === 'name'
        ? [{ lastName: direction }, { firstName: direction }, { id: 'asc' }]
        : [
            sort === 'reference' ? { employeeNumber: direction } : { createdAt: direction },
            { id: 'asc' },
          ];
    const [rows, total] = await this.database.client.$transaction(
      [
        this.database.client.teacher.findMany({
          where,
          orderBy,
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.database.client.teacher.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items: rows.map(personView), total, page: query.page, pageSize: query.pageSize };
  }
  override async get(context: RequestContext, id: string) {
    return personView(
      found(
        await this.database.client.teacher.findFirst({
          where: { AND: [teacherReadWhere(context), { id }] },
        }),
      ),
    );
  }
  override create(context: RequestContext, input: TeacherCreate) {
    return this.database.write(context, async (db) => {
      const row = await db.teacher.create({
        data: {
          tenantId: context.tenantId,
          firstName: input.firstName,
          lastName: input.lastName,
          employeeNumber:
            input.employeeNumber ?? (await nextReference(db, context.tenantId, 'teachers')),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });
      const result = personView(row);
      await audit(db, context, 'teacher.created', row.id, null, result);
      return result;
    });
  }
  override update(context: RequestContext, id: string, input: TeacherUpdate) {
    return this.database.write(context, async (db) => {
      const before = found(
        await db.teacher.findFirst({ where: { id, tenantId: context.tenantId } }),
      );
      editable(before.status);
      const after = await db.teacher.update({
        where: { tenantId_id: { tenantId: context.tenantId, id } },
        data: {
          ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
          ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
          ...(input.employeeNumber !== undefined ? { employeeNumber: input.employeeNumber } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });
      await audit(db, context, 'teacher.updated', id, personView(before), personView(after));
      return personView(after);
    });
  }
  override archive(context: RequestContext, id: string, restore: boolean) {
    return this.database.write(context, async (db) => {
      const before = found(
        await db.teacher.findFirst({ where: { id, tenantId: context.tenantId } }),
      );
      if ((before.status === 'ARCHIVED') === !restore) return personView(before);
      const after = await db.teacher.update({
        where: { tenantId_id: { tenantId: context.tenantId, id } },
        data: { status: restore ? 'ACTIVE' : 'ARCHIVED', archivedAt: restore ? null : new Date() },
      });
      await audit(
        db,
        context,
        restore ? 'teacher.restored' : 'teacher.archived',
        id,
        personView(before),
        personView(after),
      );
      return personView(after);
    });
  }
}
