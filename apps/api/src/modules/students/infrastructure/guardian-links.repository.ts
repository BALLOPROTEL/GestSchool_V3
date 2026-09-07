import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, StudentGuardian, Student, Guardian } from '@gestschool/database';
import type { GuardianLinkCreate, GuardianLinkUpdate, PeopleQuery } from '@gestschool/contracts';
import { GuardianLinksRepository } from '../domain/guardian-links.repository.js';
import { studentReadWhere } from './student.repository.js';
import { guardianReadWhere } from '../../guardians/infrastructure/guardian.repository.js';
import {
  PeopleDatabase,
  audit,
  editable,
  found,
  personView,
} from '../../people/infrastructure/people-database.js';
import type { RequestContext } from '../../iam/domain/context.js';

function linkView(link: StudentGuardian, person: Student | Guardian) {
  return {
    studentId: link.studentId,
    guardianId: link.guardianId,
    relationship: link.relationship,
    isPrimary: link.isPrimary,
    isFinancialContact: link.isFinancialContact,
    receivesNotifications: link.receivesNotifications,
    person: personView(person),
  };
}
@Injectable()
export class PrismaGuardianLinksRepository extends GuardianLinksRepository {
  constructor(@Inject(PeopleDatabase) private readonly database: PeopleDatabase) {
    super();
  }
  override async list(
    context: RequestContext,
    id: string,
    side: 'student' | 'guardian',
    query: PeopleQuery,
  ) {
    const db = this.database.client;
    if (side === 'student')
      found(await db.student.findFirst({ where: { AND: [studentReadWhere(context), { id }] } }));
    else
      found(await db.guardian.findFirst({ where: { AND: [guardianReadWhere(context), { id }] } }));
    const where: Prisma.StudentGuardianWhereInput = {
      tenantId: context.tenantId,
      ...(side === 'student' ? { studentId: id } : { guardianId: id }),
      student: studentReadWhere(context),
      guardian: guardianReadWhere(context),
      ...(query.status !== 'ALL'
        ? side === 'student'
          ? { guardian: { AND: [guardianReadWhere(context), { status: query.status }] } }
          : { student: { AND: [studentReadWhere(context), { status: query.status }] } }
        : {}),
    };
    const [rows, total] = await db.$transaction(
      [
        db.studentGuardian.findMany({
          where,
          include: { student: true, guardian: true },
          orderBy: [{ studentId: 'asc' }, { guardianId: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        db.studentGuardian.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items: rows.map((row) => linkView(row, side === 'student' ? row.guardian : row.student)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
  override link(context: RequestContext, studentId: string, input: GuardianLinkCreate) {
    return this.database.write(context, async (db) => {
      const student = found(
        await db.student.findFirst({ where: { id: studentId, tenantId: context.tenantId } }),
      );
      const guardian = found(
        await db.guardian.findFirst({
          where: { id: input.guardianId, tenantId: context.tenantId },
        }),
      );
      editable(student.status);
      editable(guardian.status);
      const link = await db.studentGuardian.create({
        data: { tenantId: context.tenantId, studentId, ...input },
      });
      const result = linkView(link, guardian);
      await audit(db, context, 'student.guardian.linked', studentId, null, result);
      return result;
    });
  }
  override update(
    context: RequestContext,
    studentId: string,
    guardianId: string,
    input: GuardianLinkUpdate | null,
  ) {
    return this.database.write(context, async (db) => {
      const where = {
        tenantId_studentId_guardianId: { tenantId: context.tenantId, studentId, guardianId },
      };
      const before = found(
        await db.studentGuardian.findUnique({ where, include: { student: true, guardian: true } }),
      );
      // Unlinking remains possible after archive; updating a link requires active profiles.
      if (input) {
        editable(before.student.status);
        editable(before.guardian.status);
      }
      const after = input
        ? await db.studentGuardian.update({
            where,
            data: {
              ...(input.relationship !== undefined ? { relationship: input.relationship } : {}),
              ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
              ...(input.isFinancialContact !== undefined
                ? { isFinancialContact: input.isFinancialContact }
                : {}),
              ...(input.receivesNotifications !== undefined
                ? { receivesNotifications: input.receivesNotifications }
                : {}),
            },
          })
        : null;
      if (!input) await db.studentGuardian.delete({ where });
      await audit(
        db,
        context,
        input ? 'student.guardian.updated' : 'student.guardian.unlinked',
        studentId,
        linkView(before, before.guardian),
        after ? linkView(after, before.guardian) : null,
      );
      return { ok: true as const };
    });
  }
}
