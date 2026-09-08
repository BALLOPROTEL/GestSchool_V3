import type { Prisma } from '@gestschool/database';
import type { RequestContext } from '../../iam/domain/context.js';
import { academicTenant } from '../domain/policy.js';

// Applied inside SQL before filters, pagination and totals. Never accept userId from a request.
export function assignedWhere(context: RequestContext): Prisma.TeachingAssignmentWhereInput {
  return {
    tenantId: context.tenantId,
    status: 'ACTIVE',
    teacher: { tenantId: context.tenantId, userId: context.userId, status: 'ACTIVE' },
    academicPeriod: { status: 'ACTIVE' },
    classSubject: {
      subject: { status: 'ACTIVE' },
      schoolClass: {
        status: 'ACTIVE',
        level: { status: 'ACTIVE' },
        academicYear: { status: { not: 'ARCHIVED' } },
      },
    },
  };
}
export function academicScopes(context: RequestContext) {
  const tenant = { tenantId: context.tenantId };
  const assigned = assignedWhere(context);
  const links: Prisma.ClassSubjectWhereInput = { ...tenant, assignments: { some: assigned } };
  const classes: Prisma.SchoolClassWhereInput = { ...tenant, subjects: { some: links } };
  const years: Prisma.AcademicYearWhereInput = {
    ...tenant,
    periods: { some: { assignments: { some: assigned } } },
  };
  const periods: Prisma.AcademicPeriodWhereInput = { ...tenant, assignments: { some: assigned } };
  const levels: Prisma.LevelWhereInput = { ...tenant, classes: { some: classes } };
  const subjects: Prisma.SubjectWhereInput = { ...tenant, classes: { some: links } };
  return {
    years: academicTenant(context, 'academic-years') ? tenant : years,
    periods: academicTenant(context, 'academic-periods') ? tenant : periods,
    levels: academicTenant(context, 'levels') ? tenant : levels,
    classes: academicTenant(context, 'classes') ? tenant : classes,
    subjects: academicTenant(context, 'subjects') ? tenant : subjects,
    links: academicTenant(context, 'class-subjects') ? tenant : links,
    assignments: academicTenant(context, 'teaching-assignments') ? tenant : assigned,
  };
}
