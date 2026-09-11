import { Prisma, type ReportCard } from '@gestschool/database';
import {
  reportSnapshotSchema,
  type ClassPeriodInput,
  type ReportCardView,
  type ReportSnapshot,
  type ResultQuery,
  type ReportRemarkInput,
} from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
import { resultError, resultFound, resultTenant } from '../domain/policy.js';
import { studentResultScope } from './scope.js';
import { auditData, resultAudit } from './database.js';
import { calculateClass } from './results.js';

function snapshot(row: ReportCard): ReportSnapshot | null {
  const parsed = reportSnapshotSchema.safeParse(row.snapshot);
  return parsed.success ? parsed.data : null;
}
async function reportViews(
  db: Prisma.TransactionClient,
  context: RequestContext,
  rows: ReportCard[],
): Promise<ReportCardView[]> {
  const locks = await db.auditLog.findMany({
    where: {
      tenantId: context.tenantId,
      action: 'report_card.locked',
      entityId: { in: rows.map((row) => row.id) },
    },
    select: { entityId: true, occurredAt: true },
  });
  const dates = new Map(locks.map((row) => [row.entityId, row.occurredAt.toISOString()]));
  return rows.map((row) => ({
    id: row.id,
    studentId: row.studentId,
    academicPeriodId: row.academicPeriodId,
    classId: row.schoolClassId,
    status: dates.has(row.id) ? 'LOCKED' : row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    lockedAt: dates.get(row.id) ?? null,
    snapshot: snapshot(row),
  }));
}
export async function listReports(
  db: Prisma.TransactionClient,
  context: RequestContext,
  q: ResultQuery,
  id?: string,
) {
  const where = Prisma.sql`r.tenant_id=${context.tenantId}::uuid AND ${studentResultScope(context, 'report-cards.read')}
    ${resultTenant(context, 'report-cards.read') ? Prisma.empty : Prisma.sql`AND r.status IN ('PUBLISHED','LOCKED')`}
    ${id ? Prisma.sql`AND r.id=${id}::uuid` : Prisma.empty}
    ${q.studentId ? Prisma.sql`AND r.student_id=${q.studentId}::uuid` : Prisma.empty}
    ${q.academicPeriodId ? Prisma.sql`AND r.academic_period_id=${q.academicPeriodId}::uuid` : Prisma.empty}
    ${q.academicYearId ? Prisma.sql`AND r.academic_year_id=${q.academicYearId}::uuid` : Prisma.empty}
    ${q.classId ? Prisma.sql`AND r.school_class_id=${q.classId}::uuid` : Prisma.empty}
    ${q.status === 'PUBLISHED' ? Prisma.sql`AND NOT EXISTS (SELECT 1 FROM audit_logs l WHERE l.tenant_id=r.tenant_id AND l.entity_id=r.id AND l.action='report_card.locked')` : Prisma.empty}
    ${q.status ? (q.status === 'LOCKED' ? Prisma.sql`AND (r.status='LOCKED' OR EXISTS (SELECT 1 FROM audit_logs l WHERE l.tenant_id=r.tenant_id AND l.entity_id=r.id AND l.action='report_card.locked'))` : Prisma.sql`AND r.status::text=${q.status}`) : Prisma.empty}`;
  const from = Prisma.sql`FROM report_cards r JOIN students s ON (s.tenant_id,s.id)=(r.tenant_id,r.student_id) WHERE ${where}`;
  const count = await db.$queryRaw<{ total: number }[]>(
    Prisma.sql`SELECT count(*)::integer total ${from}`,
  );
  const ids = await db.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT r.id ${from} ORDER BY r.created_at DESC,r.id DESC LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
  );
  const rows = await db.reportCard.findMany({
    where: { tenantId: context.tenantId, id: { in: ids.map((row) => row.id) } },
  });
  const views = await reportViews(db, context, rows),
    mapped = new Map(views.map((row) => [row.id, row]));
  return {
    items: ids.map((row) => resultFound(mapped.get(row.id))),
    total: count[0]?.total ?? 0,
    page: q.page,
    pageSize: q.pageSize,
  };
}
export async function generateReports(
  db: Prisma.TransactionClient,
  context: RequestContext,
  input: ClassPeriodInput,
  publish = false,
): Promise<ReportCardView[]> {
  const calculated = await calculateClass(db, context, input);
  const year = resultFound(
    await db.academicYear.findFirst({
      where: { tenantId: context.tenantId, id: calculated.academicYear.id },
    }),
  );
  const period = resultFound(
    await db.academicPeriod.findFirst({
      where: { tenantId: context.tenantId, id: input.academicPeriodId },
    }),
  );
  if (['CLOSED', 'ARCHIVED'].includes(year.status)) resultError('RESULT_YEAR_CLOSED');
  if (period.status !== 'ACTIVE') resultError('RESULT_PERIOD_CLOSED');
  if (!calculated.students.length) resultError('RESULT_NO_STUDENTS');
  if (publish && (calculated.warnings.length || calculated.students.some((row) => !row.complete)))
    resultError('GRADES_INCOMPLETE');
  const studentIds = calculated.students.map((row) => row.studentId);
  const existing = await db.reportCard.findMany({
    where: {
      tenantId: context.tenantId,
      academicPeriodId: input.academicPeriodId,
      studentId: { in: studentIds },
    },
  });
  if (existing.some((row) => row.status !== 'DRAFT')) resultError('REPORT_ALREADY_PUBLISHED');
  if (existing.some((row) => row.schoolClassId !== input.classId))
    resultError('REPORT_CLASS_MISMATCH');
  const previous = new Map(existing.map((row) => [row.studentId, snapshot(row)]));
  const publishedAt = publish ? new Date().toISOString() : null;
  const snapshots = calculated.students.map((student): ReportSnapshot => {
    const old = previous.get(student.studentId);
    const remarks = new Map(old?.student.subjects.map((row) => [row.subjectId, row.remark]));
    return {
      schemaVersion: 1,
      academicYear: calculated.academicYear,
      academicPeriod: calculated.academicPeriod,
      schoolClass: calculated.schoolClass,
      scale: calculated.scale,
      population: calculated.population,
      rankedPopulation: calculated.rankedPopulation,
      generalRemark: old?.generalRemark ?? null,
      publishedAt,
      student: {
        ...student,
        subjects: student.subjects.map((row) => ({
          ...row,
          remark: remarks.get(row.subjectId) ?? row.remark,
        })),
      },
      rounding: 'HALF_UP_2',
      ranking: 'COMPETITION_ON_DISPLAY_AVERAGE',
    };
  });
  // One statement for all students; no query per student or subject.
  const payload = JSON.stringify(
    snapshots.map((value) => ({
      studentId: value.student.studentId,
      average: value.student.overallAverage,
      rank: value.student.rank,
      snapshot: value,
    })),
  );
  await db.$executeRaw`INSERT INTO report_cards (tenant_id,student_id,academic_year_id,academic_period_id,school_class_id,overall_average,rank,snapshot,updated_at)
    SELECT ${context.tenantId}::uuid,x."studentId"::uuid,${calculated.academicYear.id}::uuid,${input.academicPeriodId}::uuid,${input.classId}::uuid,x.average::numeric,x.rank,x.snapshot,now()
    FROM jsonb_to_recordset(${payload}::jsonb) AS x("studentId" text,average text,rank integer,snapshot jsonb)
    ON CONFLICT (tenant_id,student_id,academic_period_id) DO UPDATE SET overall_average=excluded.overall_average,rank=excluded.rank,snapshot=excluded.snapshot,updated_at=now()
    WHERE report_cards.status='DRAFT'`;
  const rows = await db.reportCard.findMany({
    where: {
      tenantId: context.tenantId,
      academicPeriodId: input.academicPeriodId,
      schoolClassId: input.classId,
      studentId: { in: studentIds },
    },
  });
  const byStudent = new Map(rows.map((row) => [row.studentId, row]));
  await db.reportCardLine.deleteMany({
    where: { tenantId: context.tenantId, reportCardId: { in: rows.map((row) => row.id) } },
  });
  const lines = snapshots.flatMap((value) =>
    value.student.subjects.map((line) => ({
      tenantId: context.tenantId,
      reportCardId: resultFound(byStudent.get(value.student.studentId)).id,
      subjectId: line.subjectId,
      subjectName: line.name,
      coefficient: line.coefficient,
      average: line.average,
      outcome: line.outcome,
      teacherRemark: line.remark,
    })),
  );
  if (lines.length) await db.reportCardLine.createMany({ data: lines });
  await db.auditLog.createMany({
    data: rows.map((row) =>
      auditData(context, 'report_card.generated', row.id, null, {
        academicPeriodId: input.academicPeriodId,
        studentId: row.studentId,
      }),
    ),
  });
  if (publish) {
    await db.reportCard.updateMany({
      where: { tenantId: context.tenantId, id: { in: rows.map((row) => row.id) } },
      data: { status: 'PUBLISHED', publishedAt: new Date(resultFound(publishedAt)) },
    });
    await db.auditLog.createMany({
      data: rows.map((row) =>
        auditData(context, 'report_card.published', row.id, null, { snapshot: row.snapshot }),
      ),
    });
  }
  const after = await db.reportCard.findMany({
    where: { tenantId: context.tenantId, id: { in: rows.map((row) => row.id) } },
    orderBy: { studentId: 'asc' },
  });
  return reportViews(db, context, after);
}
export async function remarkReport(
  db: Prisma.TransactionClient,
  context: RequestContext,
  id: string,
  input: ReportRemarkInput,
) {
  const row = resultFound(
    await db.reportCard.findFirst({ where: { tenantId: context.tenantId, id } }),
  );
  if (row.status !== 'DRAFT') resultError('REPORT_IMMUTABLE');
  const value = resultFound(snapshot(row));
  const remarks = new Map(input.remarks.map((remark) => [remark.subjectId, remark.remark]));
  if (
    remarks.size !== input.remarks.length ||
    input.remarks.some(
      (remark) => !value.student.subjects.some((subject) => subject.subjectId === remark.subjectId),
    )
  )
    resultError('RESULT_NOT_FOUND', 404);
  const after: ReportSnapshot = {
    ...value,
    generalRemark: input.generalRemark,
    student: {
      ...value.student,
      subjects: value.student.subjects.map((subject) => ({
        ...subject,
        remark: remarks.has(subject.subjectId)
          ? (remarks.get(subject.subjectId) ?? null)
          : subject.remark,
      })),
    },
  };
  await db.reportCard.update({
    where: { tenantId_id: { tenantId: context.tenantId, id } },
    data: { snapshot: JSON.parse(JSON.stringify(after)) as Prisma.InputJsonObject },
  });
  if (input.remarks.length) {
    const payload = JSON.stringify(input.remarks);
    await db.$executeRaw`UPDATE report_card_lines l SET teacher_remark=x.remark FROM jsonb_to_recordset(${payload}::jsonb) AS x("subjectId" text,remark text) WHERE l.tenant_id=${context.tenantId}::uuid AND l.report_card_id=${id}::uuid AND l.subject_id=x."subjectId"::uuid`;
  }
  await resultAudit(db, context, 'report_card.updated', id, value, after);
  return resultFound((await listReports(db, context, { page: 1, pageSize: 1 }, id)).items[0]);
}
export async function lockReport(
  db: Prisma.TransactionClient,
  context: RequestContext,
  id: string,
) {
  const row = resultFound(
    await db.reportCard.findFirst({ where: { tenantId: context.tenantId, id } }),
  );
  if (!['PUBLISHED', 'LOCKED'].includes(row.status)) resultError('REPORT_NOT_PUBLISHED');
  const existing = await db.auditLog.findFirst({
    where: { tenantId: context.tenantId, action: 'report_card.locked', entityId: id },
  });
  if (!existing)
    await resultAudit(
      db,
      context,
      'report_card.locked',
      id,
      { status: row.status },
      { status: 'LOCKED' },
    );
  return resultFound((await reportViews(db, context, [row]))[0]);
}
