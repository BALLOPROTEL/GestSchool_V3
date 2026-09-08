import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@gestschool/database';
import type { StudentCreate, StudentUpdate, PeopleQuery } from '@gestschool/contracts';
import { StudentRepository } from '../domain/student.repository.js';
import type { RequestContext } from '../../iam/domain/context.js';
import { hasScope, tenantPermission } from '../../people/domain/policy.js';
import { assignedWhere } from '../../academics/infrastructure/read-scopes.js';
import {
  PeopleDatabase,
  audit,
  editable,
  found,
  nextReference,
  personView,
} from '../../people/infrastructure/people-database.js';

export function studentReadWhere(context: RequestContext): Prisma.StudentWhereInput {
  if (tenantPermission(context, 'students.read')) return { tenantId: context.tenantId };
  const allowed: Prisma.StudentWhereInput[] = [];
  if (hasScope(context, 'students', 'OWN')) allowed.push({ userId: context.userId });
  if (hasScope(context, 'students', 'CHILDREN'))
    allowed.push({
      guardians: {
        some: {
          tenantId: context.tenantId,
          guardian: { userId: context.userId, status: 'ACTIVE' },
        },
      },
    });
  // LOT 6 lifecycle applies to the existing LOT 5 ASSIGNED student lookup too.
  if (hasScope(context, 'students', 'ASSIGNED'))
    allowed.push({
      enrollments: {
        some: {
          tenantId: context.tenantId,
          status: 'ACTIVE',
          schoolClass: {
            subjects: {
              some: {
                assignments: {
                  some: assignedWhere(context),
                },
              },
            },
          },
        },
      },
    });

  return { tenantId: context.tenantId, OR: allowed.length ? allowed : [{ id: { in: [] } }] };
}
@Injectable()
export class PrismaStudentRepository extends StudentRepository {
  constructor(@Inject(PeopleDatabase) private readonly database: PeopleDatabase) {
    super();
  }
  override async list(context: RequestContext, query: PeopleQuery) {
    const where: Prisma.StudentWhereInput = {
      AND: [
        studentReadWhere(context),
        query.status === 'ALL' ? {} : { status: query.status },
        query.search
          ? {
              OR: [
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
                { matricule: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };
    const direction = query.sort.startsWith('-') ? 'desc' : 'asc';
    const sort = query.sort.replace('-', '');
    const orderBy: Prisma.StudentOrderByWithRelationInput[] =
      sort === 'name'
        ? [{ lastName: direction }, { firstName: direction }, { id: 'asc' }]
        : [
            sort === 'reference' ? { matricule: direction } : { createdAt: direction },
            { id: 'asc' },
          ];
    const [rows, total] = await this.database.client.$transaction(
      [
        this.database.client.student.findMany({
          where,
          orderBy,
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.database.client.student.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items: rows.map(personView), total, page: query.page, pageSize: query.pageSize };
  }
  override async get(context: RequestContext, id: string) {
    return personView(
      found(
        await this.database.client.student.findFirst({
          where: { AND: [studentReadWhere(context), { id }] },
        }),
      ),
    );
  }
  override create(context: RequestContext, input: StudentCreate) {
    return this.database.write(context, async (db) => {
      const row = await db.student.create({
        data: {
          tenantId: context.tenantId,
          firstName: input.firstName,
          lastName: input.lastName,
          matricule: input.matricule ?? (await nextReference(db, context.tenantId, 'students')),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.birthDate !== undefined
            ? { birthDate: input.birthDate ? new Date(input.birthDate) : null }
            : {}),
        },
      });
      const result = personView(row);
      await audit(db, context, 'student.created', row.id, null, result);
      return result;
    });
  }
  override update(context: RequestContext, id: string, input: StudentUpdate) {
    return this.database.write(context, async (db) => {
      const before = found(
        await db.student.findFirst({ where: { id, tenantId: context.tenantId } }),
      );
      editable(before.status);
      const after = await db.student.update({
        where: { tenantId_id: { tenantId: context.tenantId, id } },
        data: {
          ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
          ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
          ...(input.matricule !== undefined ? { matricule: input.matricule } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.birthDate !== undefined
            ? { birthDate: input.birthDate ? new Date(input.birthDate) : null }
            : {}),
        },
      });
      await audit(db, context, 'student.updated', id, personView(before), personView(after));
      return personView(after);
    });
  }
  override archive(context: RequestContext, id: string, restore: boolean) {
    return this.database.write(context, async (db) => {
      const before = found(
        await db.student.findFirst({ where: { id, tenantId: context.tenantId } }),
      );
      if ((before.status === 'ARCHIVED') === !restore) return personView(before);
      const after = await db.student.update({
        where: { tenantId_id: { tenantId: context.tenantId, id } },
        data: { status: restore ? 'ACTIVE' : 'ARCHIVED', archivedAt: restore ? null : new Date() },
      });
      await audit(
        db,
        context,
        restore ? 'student.restored' : 'student.archived',
        id,
        personView(before),
        personView(after),
      );
      return personView(after);
    });
  }
}
