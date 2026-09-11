import { randomUUID } from 'node:crypto';
import { Prisma } from '@gestschool/database';
import type {
  AssessmentInput,
  AssessmentPatch,
  AssessmentView,
  ResultQuery,
  GradeSheet,
  GradeOutcome,
  ResultStatus,
} from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
import { draftOnly, resultError, resultFound, resultTenant } from '../domain/policy.js';
import {
  assessmentResultScope,
  assignedResultScope,
  hasScope,
  studentResultScope,
} from './scope.js';
import { resultAudit } from './database.js';

export const assessmentInclude = {
  academicPeriod: true,
  classSubject: {
    include: { subject: true, schoolClass: { include: { academicYear: true, level: true } } },
  },
} satisfies Prisma.AssessmentInclude;
export type AssessmentRow = Prisma.AssessmentGetPayload<{ include: typeof assessmentInclude }>;
export const day = (date: Date) => date.toISOString().slice(0, 10);
export function assessmentView(a: AssessmentRow): AssessmentView {
  return {
    id: a.id,
    reference: a.reference,
    title: a.title,
    classSubjectId: a.classSubjectId,
    academicPeriodId: a.academicPeriodId,
    academicYearId: a.academicPeriod.academicYearId,
    classId: a.classSubject.schoolClassId,
    className: a.classSubject.schoolClass.name,
    subjectId: a.classSubject.subjectId,
    subjectName: a.classSubject.subject.name,
    periodName: a.academicPeriod.name,
    assessedOn: day(a.assessedOn),
    maxScore: a.maxScore.toFixed(2),
    weight: a.weight.toFixed(2),
    coefficient: a.classSubject.coefficient.toFixed(2),
    status: a.status,
    version: a.version,
    archivedAt: a.archivedAt?.toISOString() ?? null,
    createdByMembershipId: a.createdByMembershipId,
    submittedByMembershipId: a.submittedByMembershipId,
  };
}
export async function loadAssessment(
  db: Prisma.TransactionClient,
  context: RequestContext,
  id: string,
  permission = 'assessments.read',
): Promise<AssessmentRow> {
  const ids = await db.$queryRaw<
    { id: string }[]
  >`SELECT a.id FROM assessments a WHERE a.tenant_id=${context.tenantId}::uuid AND a.id=${id}::uuid AND ${assessmentResultScope(context, permission)}`;
  resultFound(ids[0]);
  return resultFound(
    await db.assessment.findUnique({
      where: { tenantId_id: { tenantId: context.tenantId, id } },
      include: assessmentInclude,
    }),
  );
}
export function checkVersion(a: AssessmentRow, expectedVersion: number) {
  if (a.version !== expectedVersion) resultError('RESULT_STALE_VERSION');
}
export function openAssessmentContext(a: AssessmentRow) {
  const c = a.classSubject.schoolClass;
  if (['CLOSED', 'ARCHIVED'].includes(c.academicYear.status)) resultError('RESULT_YEAR_CLOSED');
  if (a.academicPeriod.status !== 'ACTIVE') resultError('RESULT_PERIOD_CLOSED');
  if (
    c.status !== 'ACTIVE' ||
    c.level.status !== 'ACTIVE' ||
    a.classSubject.subject.status !== 'ACTIVE'
  )
    resultError('RESULT_CONTEXT_ARCHIVED');
  if (a.archivedAt) resultError('ASSESSMENT_ARCHIVED');
}
export async function assignmentForWrite(
  db: Prisma.TransactionClient,
  context: RequestContext,
  permission: string,
  classSubjectId: string,
  academicPeriodId: string,
) {
  const tenant = resultTenant(context, permission);
  if (!tenant && !hasScope(context, permission, 'ASSIGNED')) resultError('AUTH_FORBIDDEN', 403);
  const count = await db.teachingAssignment.count({
    where: {
      tenantId: context.tenantId,
      classSubjectId,
      academicPeriodId,
      status: 'ACTIVE',
      teacher: {
        tenantId: context.tenantId,
        status: 'ACTIVE',
        ...(tenant ? {} : { userId: context.userId }),
      },
    },
  });
  if (!count)
    resultError(tenant ? 'ASSESSMENT_ASSIGNMENT_REQUIRED' : 'RESULT_NOT_FOUND', tenant ? 409 : 404);
}
export async function listAssessments(
  db: Prisma.TransactionClient,
  context: RequestContext,
  q: ResultQuery,
) {
  const where = Prisma.sql`a.tenant_id=${context.tenantId}::uuid AND a.archived_at IS NULL AND ${assessmentResultScope(context, 'assessments.read')}
    ${q.academicPeriodId ? Prisma.sql`AND a.academic_period_id=${q.academicPeriodId}::uuid` : Prisma.empty}
    ${q.classSubjectId ? Prisma.sql`AND a.class_subject_id=${q.classSubjectId}::uuid` : Prisma.empty}
    ${q.classId ? Prisma.sql`AND cs.school_class_id=${q.classId}::uuid` : Prisma.empty}
    ${q.academicYearId ? Prisma.sql`AND p.academic_year_id=${q.academicYearId}::uuid` : Prisma.empty}
    ${q.status ? Prisma.sql`AND a.status::text=${q.status}` : Prisma.empty}
    ${q.studentId ? Prisma.sql`AND EXISTS (SELECT 1 FROM grades g JOIN students s ON (s.tenant_id,s.id)=(g.tenant_id,g.student_id) WHERE g.tenant_id=a.tenant_id AND g.assessment_id=a.id AND g.student_id=${q.studentId}::uuid AND (${resultTenant(context, 'assessments.read')} OR ${assignedResultScope(context, 'assessments.read', Prisma.sql`a.class_subject_id`, Prisma.sql`a.academic_period_id`)} OR ${studentResultScope(context, 'assessments.read')}))` : Prisma.empty}`;
  const from = Prisma.sql`FROM assessments a JOIN class_subjects cs ON (cs.tenant_id,cs.id)=(a.tenant_id,a.class_subject_id) JOIN academic_periods p ON (p.tenant_id,p.id)=(a.tenant_id,a.academic_period_id) WHERE ${where}`;
  const count = await db.$queryRaw<{ total: number }[]>(
    Prisma.sql`SELECT count(*)::integer total ${from}`,
  );
  const ids = await db.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT a.id ${from} ORDER BY a.assessed_on DESC,a.id DESC LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
  );
  const rows = await db.assessment.findMany({
    where: { tenantId: context.tenantId, id: { in: ids.map((row) => row.id) } },
    include: assessmentInclude,
  });
  const map = new Map(rows.map((row) => [row.id, row]));
  return {
    items: ids.map((row) => assessmentView(resultFound(map.get(row.id)))),
    total: count[0]?.total ?? 0,
    page: q.page,
    pageSize: q.pageSize,
  };
}
export async function readSheet(
  db: Prisma.TransactionClient,
  context: RequestContext,
  a: AssessmentRow,
): Promise<GradeSheet> {
  const privileged = Prisma.sql`(${resultTenant(context, 'grades.read')} OR ${assignedResultScope(context, 'grades.read', Prisma.sql`${a.classSubjectId}::uuid`, Prisma.sql`${a.academicPeriodId}::uuid`)})`;
  const rows = await db.$queryRaw<
    {
      id: string | null;
      studentId: string;
      matricule: string;
      firstName: string;
      lastName: string;
      score: string | null;
      outcome: GradeOutcome | null;
      status: ResultStatus | null;
      comment: string | null;
    }[]
  >`SELECT g.id,s.id AS "studentId",s.matricule,s.first_name AS "firstName",s.last_name AS "lastName",
    g.score::text AS score,g.outcome,g.status,g.comment
    FROM students s JOIN enrollments e ON (e.tenant_id,e.student_id)=(s.tenant_id,s.id) AND e.academic_year_id=${a.academicPeriod.academicYearId}::uuid
    LEFT JOIN grades g ON (g.tenant_id,g.student_id)=(s.tenant_id,s.id) AND g.assessment_id=${a.id}::uuid
    WHERE s.tenant_id=${context.tenantId}::uuid AND (${privileged} OR ${studentResultScope(context, 'grades.read')})
      AND (g.id IS NOT NULL OR gestschool_result_class_at(s.tenant_id,s.id,e.academic_year_id,${day(a.assessedOn)}::date)=${a.classSubject.schoolClassId}::uuid)
      AND (${privileged} OR g.status IN ('PUBLISHED','LOCKED'))
    ORDER BY s.last_name,s.first_name,s.id`;
  return {
    assessment: assessmentView(a),
    grades: rows.map((row) => ({
      ...row,
      status: row.status ?? a.status,
      outcome: row.outcome ?? 'NOT_GRADED',
    })),
  };
}
export async function createAssessment(
  db: Prisma.TransactionClient,
  context: RequestContext,
  input: AssessmentInput,
) {
  const link = resultFound(
    await db.classSubject.findFirst({
      where: { tenantId: context.tenantId, id: input.classSubjectId },
      include: { subject: true, schoolClass: { include: { academicYear: true, level: true } } },
    }),
  );
  const period = resultFound(
    await db.academicPeriod.findFirst({
      where: { tenantId: context.tenantId, id: input.academicPeriodId },
    }),
  );
  if (link.schoolClass.academicYearId !== period.academicYearId)
    resultError('ASSESSMENT_CONTEXT_MISMATCH');
  if (input.assessedOn < day(period.startsOn) || input.assessedOn > day(period.endsOn))
    resultError('ASSESSMENT_DATE_INVALID');
  if (['CLOSED', 'ARCHIVED'].includes(link.schoolClass.academicYear.status))
    resultError('RESULT_YEAR_CLOSED');
  if (period.status !== 'ACTIVE') resultError('RESULT_PERIOD_CLOSED');
  if (
    link.subject.status !== 'ACTIVE' ||
    link.schoolClass.status !== 'ACTIVE' ||
    link.schoolClass.level.status !== 'ACTIVE'
  )
    resultError('RESULT_CONTEXT_ARCHIVED');
  await assignmentForWrite(db, context, 'assessments.create', link.id, period.id);
  const row = await db.assessment.create({
    data: {
      ...input,
      assessedOn: new Date(input.assessedOn),
      reference: input.reference ?? `EVAL-${randomUUID()}`,
      tenantId: context.tenantId,
      createdByMembershipId: context.membershipId,
    },
    include: assessmentInclude,
  });
  const view = assessmentView(row);
  await resultAudit(db, context, 'assessment.created', row.id, null, view);
  return view;
}
export async function updateAssessment(
  db: Prisma.TransactionClient,
  context: RequestContext,
  id: string,
  input: AssessmentPatch,
) {
  const before = await loadAssessment(db, context, id, 'assessments.update');
  checkVersion(before, input.expectedVersion);
  draftOnly(before.status, before.archivedAt);
  openAssessmentContext(before);
  await assignmentForWrite(
    db,
    context,
    'assessments.update',
    before.classSubjectId,
    before.academicPeriodId,
  );
  const assessedOn = input.assessedOn ?? day(before.assessedOn);
  if (
    assessedOn < day(before.academicPeriod.startsOn) ||
    assessedOn > day(before.academicPeriod.endsOn)
  )
    resultError('ASSESSMENT_DATE_INVALID');
  const invalid = await db.grade.count({
    where: {
      tenantId: context.tenantId,
      assessmentId: id,
      score: { gt: input.maxScore ?? before.maxScore },
    },
  });
  if (invalid) resultError('GRADE_OUT_OF_RANGE');
  const ineligible = await db.$queryRaw<
    { count: number }[]
  >`SELECT count(*)::integer count FROM grades g WHERE g.tenant_id=${context.tenantId}::uuid AND g.assessment_id=${id}::uuid AND gestschool_result_class_at(g.tenant_id,g.student_id,${before.academicPeriod.academicYearId}::uuid,${assessedOn}::date) IS DISTINCT FROM ${before.classSubject.schoolClassId}::uuid`;
  if (ineligible[0]?.count) resultError('GRADE_STUDENT_INELIGIBLE');
  const after = await db.assessment.update({
    where: { tenantId_id: { tenantId: context.tenantId, id } },
    data: {
      title: input.title ?? before.title,
      maxScore: input.maxScore ?? before.maxScore,
      weight: input.weight ?? before.weight,
      assessedOn: new Date(assessedOn),
      version: { increment: 1 },
    },
    include: assessmentInclude,
  });
  await resultAudit(
    db,
    context,
    'assessment.updated',
    id,
    assessmentView(before),
    assessmentView(after),
  );
  return assessmentView(after);
}
