import type { Prisma } from '@gestschool/database';
import type {
  AcademicEntity,
  AcademicQuery,
  AcademicView,
  PageResult,
} from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
import { required } from '../domain/policy.js';
import { academicScopes, assignedWhere } from './read-scopes.js';
import { assignmentView, catalogView, classView, linkView, periodView, yearView } from './views.js';
import { classRelations, linkRelations, assignmentRelations } from './relations.js';

export async function readAcademic(
  db: Prisma.TransactionClient,
  context: RequestContext,
  entity: AcademicEntity,
  query: AcademicQuery,
  parentId?: string,
  own = false,
  id?: string,
): Promise<PageResult<AcademicView>> {
  const scopes = academicScopes(context);
  const identity = id ? { id } : {};
  const paging = { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
  const state =
    query.status === 'ACTIVE' || query.status === 'ARCHIVED' ? { status: query.status } : {};
  const search = { contains: query.search, mode: 'insensitive' as const };
  const direction = query.sort.startsWith('-') ? ('desc' as const) : ('asc' as const);
  const sort = query.sort.replace('-', '');
  const order =
    sort === 'createdAt'
      ? { createdAt: direction }
      : sort === 'code'
        ? { code: direction }
        : { name: direction };
  const result = (items: AcademicView[], total: number) => ({
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
  });
  switch (entity) {
    case 'academic-years': {
      const where: Prisma.AcademicYearWhereInput = {
        AND: [
          scopes.years,
          identity,
          query.status === 'ALL' ? {} : { status: query.status },
          { OR: [{ name: search }, { code: search }] },
        ],
      };
      const rows = await db.academicYear.findMany({
        where,
        ...paging,
        orderBy: [order, { id: 'asc' }],
      });
      return result(rows.map(yearView), await db.academicYear.count({ where }));
    }
    case 'academic-periods': {
      if (parentId)
        required(
          await db.academicYear.findFirst({ where: { AND: [scopes.years, { id: parentId }] } }),
        );
      const where: Prisma.AcademicPeriodWhereInput = {
        AND: [
          scopes.periods,
          identity,
          state,
          { name: search },
          parentId ? { academicYearId: parentId } : {},
        ],
      };
      const rows = await db.academicPeriod.findMany({
        where,
        ...paging,
        include: { academicYear: true },
        orderBy: [
          sort === 'createdAt'
            ? { createdAt: direction }
            : sort === 'code'
              ? { ordinal: direction }
              : { name: direction },
          { id: 'asc' },
        ],
      });
      return result(rows.map(periodView), await db.academicPeriod.count({ where }));
    }
    case 'levels': {
      const where: Prisma.LevelWhereInput = {
        AND: [scopes.levels, identity, state, { OR: [{ name: search }, { code: search }] }],
      };
      const rows = await db.level.findMany({ where, ...paging, orderBy: [order, { id: 'asc' }] });
      return result(rows.map(catalogView), await db.level.count({ where }));
    }
    case 'classes': {
      const where: Prisma.SchoolClassWhereInput = {
        AND: [
          scopes.classes,
          identity,
          state,
          { OR: [{ name: search }, { code: search }] },
          query.academicYearId ? { academicYearId: query.academicYearId } : {},
          query.levelId ? { levelId: query.levelId } : {},
        ],
      };
      const rows = await classRelations(
        db,
        context.tenantId,
        await db.schoolClass.findMany({ where, ...paging, orderBy: [order, { id: 'asc' }] }),
      );
      return result(rows.map(classView), await db.schoolClass.count({ where }));
    }
    case 'subjects': {
      const where: Prisma.SubjectWhereInput = {
        AND: [
          scopes.subjects,
          identity,
          state,
          { OR: [{ name: search }, { code: search }] },
          query.classId || query.academicYearId
            ? {
                classes: {
                  some: {
                    AND: [
                      scopes.links,
                      query.classId ? { schoolClassId: query.classId } : {},
                      query.academicYearId
                        ? { schoolClass: { academicYearId: query.academicYearId } }
                        : {},
                    ],
                  },
                },
              }
            : {},
        ],
      };
      const rows = await db.subject.findMany({ where, ...paging, orderBy: [order, { id: 'asc' }] });
      return result(rows.map(catalogView), await db.subject.count({ where }));
    }
    case 'class-subjects': {
      if (parentId)
        required(
          await db.schoolClass.findFirst({ where: { AND: [scopes.classes, { id: parentId }] } }),
        );
      const where: Prisma.ClassSubjectWhereInput = {
        AND: [
          scopes.links,
          identity,
          { subject: { ...state, OR: [{ name: search }, { code: search }] } },
          parentId ? { schoolClassId: parentId } : {},
          query.subjectId ? { subjectId: query.subjectId } : {},
        ],
      };
      const rows = await linkRelations(
        db,
        context.tenantId,
        await db.classSubject.findMany({
          where,
          ...paging,
          orderBy: [
            sort === 'createdAt'
              ? { createdAt: direction }
              : { subject: sort === 'code' ? { code: direction } : { name: direction } },
            { id: 'asc' },
          ],
        }),
      );
      return result(rows.map(linkView), await db.classSubject.count({ where }));
    }
    case 'teaching-assignments': {
      const where: Prisma.TeachingAssignmentWhereInput = {
        AND: [
          own ? assignedWhere(context) : scopes.assignments,
          identity,
          state,
          {
            OR: [
              { teacher: { firstName: search } },
              { teacher: { lastName: search } },
              { teacher: { employeeNumber: search } },
              { classSubject: { subject: { name: search } } },
              { classSubject: { schoolClass: { name: search } } },
            ],
          },
          query.teacherId ? { teacherId: query.teacherId } : {},
          query.academicPeriodId ? { academicPeriodId: query.academicPeriodId } : {},
          {
            classSubject: {
              ...(query.subjectId ? { subjectId: query.subjectId } : {}),
              ...(query.classId ? { schoolClassId: query.classId } : {}),
              schoolClass: {
                ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
                ...(query.levelId ? { levelId: query.levelId } : {}),
              },
            },
          },
        ],
      };
      const rows = await assignmentRelations(
        db,
        context.tenantId,
        await db.teachingAssignment.findMany({
          where,
          ...paging,
          orderBy: [
            sort === 'createdAt'
              ? { createdAt: direction }
              : {
                  teacher:
                    sort === 'code' ? { employeeNumber: direction } : { lastName: direction },
                },
            { id: 'asc' },
          ],
        }),
      );
      return result(rows.map(assignmentView), await db.teachingAssignment.count({ where }));
    }
  }
}
