import { Prisma } from '@gestschool/database';
import type {
  AssessmentAction,
  AssessmentActionInput,
  GradeBulkInput,
  GradeCorrectionInput,
  GradePatchInput,
  GradeChangeView,
} from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
import { decimalUnits } from '../domain/calculations.js';
import {
  draftOnly,
  resultActionPermission,
  resultError,
  resultFound,
  transition,
} from '../domain/policy.js';
import {
  assessmentInclude,
  assessmentView,
  assignmentForWrite,
  checkVersion,
  day,
  loadAssessment,
  openAssessmentContext,
  readSheet,
} from './assessments.js';
import { auditData, resultAudit } from './database.js';

export async function enterGrades(
  db: Prisma.TransactionClient,
  context: RequestContext,
  id: string,
  input: GradeBulkInput,
) {
  const a = await loadAssessment(db, context, id, 'grades.update');
  checkVersion(a, input.expectedVersion);
  draftOnly(a.status, a.archivedAt);
  openAssessmentContext(a);
  await assignmentForWrite(db, context, 'grades.update', a.classSubjectId, a.academicPeriodId);
  if (
    input.grades.some(
      (row) => row.score !== null && decimalUnits(row.score) > decimalUnits(a.maxScore.toFixed(2)),
    )
  )
    resultError('GRADE_OUT_OF_RANGE');
  const ids = input.grades.map((row) => row.studentId);
  const eligible = await db.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT s.id FROM students s WHERE s.tenant_id=${context.tenantId}::uuid AND s.id IN (${Prisma.join(ids.map((studentId) => Prisma.sql`${studentId}::uuid`))}) AND gestschool_result_class_at(s.tenant_id,s.id,${a.academicPeriod.academicYearId}::uuid,${day(a.assessedOn)}::date)=${a.classSubject.schoolClassId}::uuid`,
  );
  if (eligible.length !== ids.length) resultError('GRADE_STUDENT_INELIGIBLE');
  const before = await db.grade.findMany({
    where: { tenantId: context.tenantId, assessmentId: id, studentId: { in: ids } },
  });
  const existing = new Map(before.map((row) => [row.studentId, row]));
  const payload = JSON.stringify(input.grades);
  await db.$executeRaw`INSERT INTO grades (tenant_id,assessment_id,student_id,score,outcome,comment,updated_at)
    SELECT ${context.tenantId}::uuid,${id}::uuid,x."studentId"::uuid,x.score::numeric,x.outcome::grade_outcome,x.comment,now()
    FROM jsonb_to_recordset(${payload}::jsonb) AS x("studentId" text,score text,outcome text,comment text)
    ON CONFLICT (tenant_id,assessment_id,student_id) DO UPDATE SET score=excluded.score,outcome=excluded.outcome,comment=excluded.comment,updated_at=now()`;
  const after = await db.grade.findMany({
    where: { tenantId: context.tenantId, assessmentId: id, studentId: { in: ids } },
  });
  await db.auditLog.createMany({
    data: after.map((row) =>
      auditData(
        context,
        existing.has(row.studentId) ? 'grade.updated' : 'grade.created',
        row.id,
        existing.get(row.studentId) ?? null,
        row,
      ),
    ),
  });
  const updated = await db.assessment.update({
    where: { tenantId_id: { tenantId: context.tenantId, id } },
    data: { version: { increment: 1 } },
    include: assessmentInclude,
  });
  return readSheet(db, context, updated);
}
export async function patchGrade(
  db: Prisma.TransactionClient,
  context: RequestContext,
  id: string,
  input: GradePatchInput,
) {
  const grade = resultFound(
    await db.grade.findFirst({ where: { tenantId: context.tenantId, id } }),
  );
  return enterGrades(db, context, grade.assessmentId, {
    expectedVersion: input.expectedVersion,
    grades: [
      {
        studentId: grade.studentId,
        score: input.score,
        outcome: input.outcome,
        comment: input.comment,
      },
    ],
  });
}
export async function correctGrade(
  db: Prisma.TransactionClient,
  context: RequestContext,
  id: string,
  input: GradeCorrectionInput,
) {
  const grade = resultFound(
    await db.grade.findFirst({ where: { tenantId: context.tenantId, id } }),
  );
  const a = await loadAssessment(db, context, grade.assessmentId, 'grades.correct');
  checkVersion(a, input.expectedVersion);
  openAssessmentContext(a);
  if (a.status === 'LOCKED' || grade.status === 'LOCKED') resultError('ASSESSMENT_LOCKED');
  if (a.status !== 'PUBLISHED' || grade.status !== 'PUBLISHED') resultError('GRADE_NOT_PUBLISHED');
  if (input.score !== null && decimalUnits(input.score) > decimalUnits(a.maxScore.toFixed(2)))
    resultError('GRADE_OUT_OF_RANGE');
  const score = input.score === null ? null : new Prisma.Decimal(input.score);
  if (
    grade.score?.toFixed(2) === score?.toFixed(2) &&
    grade.outcome === input.outcome &&
    grade.comment === input.comment
  )
    resultError('GRADE_UNCHANGED');
  const change = await db.gradeChange.create({
    data: {
      tenantId: context.tenantId,
      gradeId: id,
      previousScore: grade.score,
      newScore: score,
      previousOutcome: grade.outcome,
      newOutcome: input.outcome,
      previousComment: grade.comment,
      newComment: input.comment,
      changedByMembershipId: context.membershipId,
      requestId: context.requestId,
      reason: input.reason,
    },
  });
  await db.$queryRaw`SELECT set_config('gestschool.grade_change_id',${change.id},TRUE)`;
  const after = await db.grade.update({
    where: { tenantId_id: { tenantId: context.tenantId, id } },
    data: { score, outcome: input.outcome, comment: input.comment },
  });
  await resultAudit(db, context, 'grade.corrected', id, grade, {
    ...after,
    reason: input.reason,
    changeId: change.id,
  });
  const updated = await db.assessment.update({
    where: { tenantId_id: { tenantId: context.tenantId, id: a.id } },
    data: { version: { increment: 1 } },
    include: assessmentInclude,
  });
  return readSheet(db, context, updated);
}
export async function assessmentAction(
  db: Prisma.TransactionClient,
  context: RequestContext,
  id: string,
  action: AssessmentAction,
  input: AssessmentActionInput,
) {
  const a = await loadAssessment(db, context, id, resultActionPermission[action]);
  checkVersion(a, input.expectedVersion);
  if (action !== 'lock') openAssessmentContext(a);
  const status = transition(a.status, action);
  if (action === 'reopen' && !input.reason) resultError('RESULT_REASON_REQUIRED');
  if (action === 'validate' && context.membershipId === a.submittedByMembershipId)
    resultError('ASSESSMENT_SELF_VALIDATION', 403);
  if (action === 'submit' || action === 'archive')
    await assignmentForWrite(
      db,
      context,
      resultActionPermission[action],
      a.classSubjectId,
      a.academicPeriodId,
    );
  if (['submit', 'validate', 'publish'].includes(action)) {
    const sheet = await readSheet(db, context, a);
    if (!sheet.grades.length || sheet.grades.some((row) => !row.id || row.outcome === 'NOT_GRADED'))
      resultError('GRADES_INCOMPLETE');
  }
  const after = await db.assessment.update({
    where: { tenantId_id: { tenantId: context.tenantId, id } },
    data: {
      status,
      version: { increment: 1 },
      ...(action === 'submit' ? { submittedByMembershipId: context.membershipId } : {}),
      ...(action === 'archive' ? { archivedAt: new Date() } : {}),
    },
    include: assessmentInclude,
  });
  if (status !== a.status)
    await db.grade.updateMany({
      where: { tenantId: context.tenantId, assessmentId: id },
      data: { status },
    });
  const suffix = {
    submit: 'submitted',
    validate: 'validated',
    publish: 'published',
    lock: 'locked',
    reopen: 'reopened',
    archive: 'archived',
  }[action];
  await resultAudit(db, context, `assessment.${suffix}`, id, assessmentView(a), {
    ...assessmentView(after),
    reason: input.reason ?? null,
  });
  return assessmentView(after);
}
export async function gradeChanges(
  db: Prisma.TransactionClient,
  context: RequestContext,
  id: string,
): Promise<GradeChangeView[]> {
  const grade = resultFound(
    await db.grade.findFirst({ where: { tenantId: context.tenantId, id } }),
  );
  const a = await loadAssessment(db, context, grade.assessmentId, 'grades.read');
  const sheet = await readSheet(db, context, a);
  if (!sheet.grades.some((row) => row.id === id)) resultError('RESULT_NOT_FOUND', 404);
  const changes = await db.gradeChange.findMany({
    where: { tenantId: context.tenantId, gradeId: id },
    orderBy: [{ changedAt: 'asc' }, { id: 'asc' }],
  });
  return changes.map((row) => ({
    id: row.id,
    gradeId: row.gradeId,
    previousScore: row.previousScore?.toFixed(2) ?? null,
    newScore: row.newScore?.toFixed(2) ?? null,
    previousOutcome: row.previousOutcome,
    newOutcome: row.newOutcome,
    previousComment: row.previousComment,
    newComment: row.newComment,
    reason: row.reason,
    actorMembershipId: row.changedByMembershipId,
    requestId: row.requestId,
    changedAt: row.changedAt.toISOString(),
  }));
}
