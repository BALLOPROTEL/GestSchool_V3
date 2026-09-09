import type { Prisma } from '@gestschool/database';
import type { EnrollmentQuery } from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
import { enrollmentTenant } from '../domain/policy.js';
export function enrollmentStudentScope(context: RequestContext): Prisma.StudentWhereInput {
  if (enrollmentTenant(context)) return { tenantId: context.tenantId };
  const allowed: Prisma.StudentWhereInput[] = [];
  if (
    context.grants.some((grant) => grant.permission === 'enrollments.read' && grant.scope === 'OWN')
  )
    allowed.push({ userId: context.userId });
  if (
    context.grants.some(
      (grant) => grant.permission === 'enrollments.read' && grant.scope === 'CHILDREN',
    )
  )
    allowed.push({
      guardians: {
        some: {
          tenantId: context.tenantId,
          guardian: { userId: context.userId, status: 'ACTIVE' },
        },
      },
    });
  return { tenantId: context.tenantId, OR: allowed.length ? allowed : [{ id: { in: [] } }] };
}
export function enrollmentScope(context: RequestContext): Prisma.EnrollmentWhereInput {
  return { tenantId: context.tenantId, student: enrollmentStudentScope(context) };
}
export function enrollmentWhere(
  context: RequestContext,
  query: EnrollmentQuery,
): Prisma.EnrollmentWhereInput {
  return {
    AND: [
      enrollmentScope(context),
      {
        ...(query.status === 'ALL' ? {} : { status: query.status }),
        ...(query.type === 'ALL' ? {} : { type: query.type === 'LEGACY' ? null : query.type }),
        ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
        ...(query.classId ? { schoolClassId: query.classId } : {}),
        ...(query.studentId ? { studentId: query.studentId } : {}),
        ...(query.levelId ? { schoolClass: { levelId: query.levelId } } : {}),
      },
      query.search
        ? {
            OR: [
              { student: { firstName: { contains: query.search, mode: 'insensitive' } } },
              { student: { lastName: { contains: query.search, mode: 'insensitive' } } },
              { student: { matricule: { contains: query.search, mode: 'insensitive' } } },
              { schoolClass: { name: { contains: query.search, mode: 'insensitive' } } },
              { schoolClass: { code: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {},
    ],
  };
}
