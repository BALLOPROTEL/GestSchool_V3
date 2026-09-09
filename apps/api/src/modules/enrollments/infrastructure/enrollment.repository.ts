import { Inject, Injectable } from '@nestjs/common';
import type { EnrollmentClassQuery, EnrollmentPage, EnrollmentQuery } from '@gestschool/contracts';
import { Prisma } from '@gestschool/database';
import type { RequestContext } from '../../iam/domain/context.js';
import { EnrollmentRepository, type EnrollmentCommand } from '../domain/enrollment.repository.js';
import { enrollmentFound } from '../domain/policy.js';
import { EnrollmentDatabase } from './database.js';
import { enrollmentClassViews, enrollmentEventView, enrollmentViews } from './views.js';
import { enrollmentScope, enrollmentStudentScope, enrollmentWhere } from './reads.js';
import { writeEnrollment } from './writes.js';
@Injectable()
export class PrismaEnrollmentRepository extends EnrollmentRepository {
  constructor(@Inject(EnrollmentDatabase) private readonly database: EnrollmentDatabase) {
    super();
  }
  override list(context: RequestContext, query: EnrollmentQuery) {
    return this.database.client.$transaction(
      async (db) => {
        if (query.studentId)
          enrollmentFound(
            await db.student.findFirst({
              where: { AND: [enrollmentStudentScope(context), { id: query.studentId }] },
            }),
          );
        const where = enrollmentWhere(context, query);
        const direction = query.sort.startsWith('-') ? 'desc' : 'asc';
        const key = query.sort.replace('-', '');
        const orderBy: Prisma.EnrollmentOrderByWithRelationInput[] =
          key === 'name'
            ? [
                { student: { lastName: direction } },
                { student: { firstName: direction } },
                { id: 'asc' },
              ]
            : [
                key === 'createdAt' ? { createdAt: direction } : { enrolledOn: direction },
                { id: 'asc' },
              ];
        const rows = await db.enrollment.findMany({
          where,
          orderBy,
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        });
        const groups = await db.enrollment.groupBy({
          where,
          by: ['status'],
          _count: { _all: true },
        });
        const total = groups.reduce((sum, group) => sum + group['_count']['_all'], 0);
        const count = (status: string) =>
          groups.find((group) => group.status === status)?.['_count']['_all'] ?? 0;
        return {
          items: await enrollmentViews(db, context.tenantId, rows),
          total,
          page: query.page,
          pageSize: query.pageSize,
          summary: {
            total,
            active: count('ACTIVE'),
            pending: count('PENDING'),
            withdrawn: count('WITHDRAWN'),
          },
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  override get(context: RequestContext, id: string) {
    return this.database.client.$transaction(
      async (db) => {
        const row = enrollmentFound(
          await db.enrollment.findFirst({ where: { AND: [enrollmentScope(context), { id }] } }),
        );
        return enrollmentFound((await enrollmentViews(db, context.tenantId, [row]))[0]);
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  override history(context: RequestContext, id: string, query: EnrollmentPage) {
    return this.database.client.$transaction(
      async (db) => {
        enrollmentFound(
          await db.enrollment.findFirst({ where: { AND: [enrollmentScope(context), { id }] } }),
        );
        const where = { tenantId: context.tenantId, enrollmentId: id };
        const rows = await db.enrollmentEvent.findMany({
          where,
          orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        });
        const total = await db.enrollmentEvent.count({ where });
        return {
          items: rows.map(enrollmentEventView),
          total,
          page: query.page,
          pageSize: query.pageSize,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  override classes(context: RequestContext, query: EnrollmentClassQuery) {
    return this.database.client.$transaction(
      async (db) => {
        enrollmentFound(
          await db.academicYear.findFirst({
            where: { tenantId: context.tenantId, id: query.academicYearId },
          }),
        );
        const where: Prisma.SchoolClassWhereInput = {
          tenantId: context.tenantId,
          academicYearId: query.academicYearId,
          status: 'ACTIVE',
          academicYear: { status: { in: ['DRAFT', 'ACTIVE'] } },
          level: { status: 'ACTIVE' },
          ...(query.levelId ? { levelId: query.levelId } : {}),
          ...(query.classId ? { id: query.classId } : {}),
          ...(query.search
            ? {
                OR: [
                  { name: { contains: query.search, mode: 'insensitive' } },
                  { code: { contains: query.search, mode: 'insensitive' } },
                ],
              }
            : {}),
        };
        const rows = await db.schoolClass.findMany({
          where,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        });
        const total = await db.schoolClass.count({ where });
        return {
          items: await enrollmentClassViews(db, context.tenantId, rows),
          total,
          page: query.page,
          pageSize: query.pageSize,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  override write(context: RequestContext, command: EnrollmentCommand) {
    return this.database.write(context, (db) => writeEnrollment(db, context, command));
  }
}
