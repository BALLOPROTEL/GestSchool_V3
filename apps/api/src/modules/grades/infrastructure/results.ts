import { Prisma } from '@gestschool/database';
import {
  resultPositiveDecimal,
  type ClassPeriodInput,
  type ClassResults,
  type StudentResult,
  type SubjectResult,
} from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
import { resultError, resultFound } from '../domain/policy.js';
import {
  competitionRanks,
  roundAverage,
  subjectAverage,
  weightedAverage,
  type CalculationGrade,
  type Fraction,
} from '../domain/calculations.js';
import { day } from './assessments.js';

export async function calculateClass(
  db: Prisma.TransactionClient,
  context: RequestContext,
  input: ClassPeriodInput,
): Promise<ClassResults> {
  const schoolClass = resultFound(
    await db.schoolClass.findFirst({
      where: { tenantId: context.tenantId, id: input.classId },
      include: {
        academicYear: true,
        subjects: { include: { subject: true }, orderBy: { id: 'asc' } },
      },
    }),
  );
  const period = resultFound(
    await db.academicPeriod.findFirst({
      where: { tenantId: context.tenantId, id: input.academicPeriodId },
    }),
  );
  if (period.academicYearId !== schoolClass.academicYearId)
    resultError('ASSESSMENT_CONTEXT_MISMATCH');
  const settings = await db.tenantSetting.findUnique({ where: { tenantId: context.tenantId } });
  const values = settings?.values;
  const configuredScale =
    values && typeof values === 'object' && !Array.isArray(values)
      ? values['gradingScale']
      : undefined;
  const parsedScale = resultPositiveDecimal.safeParse(configuredScale ?? '20');
  if (!parsedScale.success) resultError('RESULT_SCALE_INVALID');
  const scale = parsedScale.data;
  const roster = await db.$queryRaw<
    Omit<StudentResult, 'subjects' | 'overallAverage' | 'rank' | 'complete' | 'warnings'>[]
  >`
    SELECT s.id AS "studentId",e.id AS "enrollmentId",s.matricule,s.first_name AS "firstName",s.last_name AS "lastName"
    FROM students s JOIN enrollments e ON (e.tenant_id,e.student_id)=(s.tenant_id,s.id)
    WHERE s.tenant_id=${context.tenantId}::uuid AND e.academic_year_id=${period.academicYearId}::uuid
      AND gestschool_result_class_at(s.tenant_id,s.id,e.academic_year_id,${day(period.endsOn)}::date)=${schoolClass.id}::uuid
    ORDER BY s.last_name,s.first_name,s.id`;
  if (roster.length > 1000 || schoolClass.subjects.length > 100)
    resultError('RESULT_POPULATION_LIMIT');
  const assessments = await db.assessment.findMany({
    where: {
      tenantId: context.tenantId,
      academicPeriodId: period.id,
      classSubject: { schoolClassId: schoolClass.id },
      archivedAt: null,
    },
    select: { id: true, status: true },
  });
  const warnings: string[] = [];
  if (!roster.length) warnings.push('RESULT_NO_STUDENTS');
  if (!schoolClass.subjects.length) warnings.push('RESULT_NO_SUBJECTS');
  if (assessments.some((row) => !['PUBLISHED', 'LOCKED'].includes(row.status)))
    warnings.push('RESULT_UNPUBLISHED_ASSESSMENTS');
  type Cell = CalculationGrade & {
    studentId: string;
    classSubjectId: string;
    comment: string | null;
  };
  const cells = roster.length
    ? await db.$queryRaw<Cell[]>(Prisma.sql`
    SELECT s.id AS "studentId",a.class_subject_id AS "classSubjectId",g.score::text score,
      a.max_score::text AS "maxScore",a.weight::text weight,coalesce(g.outcome,'NOT_GRADED') AS outcome,g.comment
    FROM assessments a JOIN class_subjects cs ON (cs.tenant_id,cs.id)=(a.tenant_id,a.class_subject_id)
    JOIN students s ON s.tenant_id=a.tenant_id AND s.id IN (${Prisma.join(roster.map((row) => Prisma.sql`${row.studentId}::uuid`))})
    LEFT JOIN grades g ON (g.tenant_id,g.assessment_id,g.student_id)=(a.tenant_id,a.id,s.id)
    WHERE a.tenant_id=${context.tenantId}::uuid AND a.academic_period_id=${period.id}::uuid AND cs.school_class_id=${schoolClass.id}::uuid
      AND a.archived_at IS NULL AND a.status IN ('PUBLISHED','LOCKED')
      AND gestschool_result_class_at(s.tenant_id,s.id,${period.academicYearId}::uuid,a.assessed_on)=${schoolClass.id}::uuid
    ORDER BY a.assessed_on,a.id`)
    : [];
  const buckets = new Map<string, Cell[]>();
  for (const cell of cells) {
    const key = `${cell.studentId}:${cell.classSubjectId}`;
    const rows = buckets.get(key) ?? [];
    rows.push(cell);
    buckets.set(key, rows);
  }
  const students: StudentResult[] = roster.map((student) => {
    const weighted: { value: Fraction; weight: string }[] = [];
    const subjects: SubjectResult[] = schoolClass.subjects.map((link) => {
      const rows = buckets.get(`${student.studentId}:${link.id}`) ?? [];
      const result = subjectAverage(rows, scale);
      if (result.average)
        weighted.push({ value: result.average, weight: link.coefficient.toFixed(2) });
      return {
        classSubjectId: link.id,
        subjectId: link.subjectId,
        name: link.subject.name,
        coefficient: link.coefficient.toFixed(2),
        average: result.average ? roundAverage(result.average) : null,
        outcome: result.outcome,
        complete: result.complete,
        remark: rows.findLast((row) => row.comment !== null)?.comment ?? null,
        assessments: rows.length,
        scored: result.scored,
        missing: result.missing,
      };
    });
    const complete = subjects.length > 0 && subjects.every((subject) => subject.complete);
    const overall = complete ? weightedAverage(weighted) : null;
    return {
      ...student,
      subjects,
      complete: complete && overall !== null,
      overallAverage: overall ? roundAverage(overall) : null,
      rank: null,
      warnings: !complete
        ? ['GRADES_INCOMPLETE']
        : overall === null
          ? ['RESULT_NO_SCORED_SUBJECTS']
          : [],
    };
  });
  const ranks = competitionRanks(
    students.map((student) => ({
      id: student.studentId,
      average: student.overallAverage,
      complete: student.complete,
    })),
  );
  for (const student of students) student.rank = ranks.get(student.studentId) ?? null;
  return {
    academicYear: { id: schoolClass.academicYearId, name: schoolClass.academicYear.name },
    academicPeriod: {
      id: period.id,
      name: period.name,
      startsOn: day(period.startsOn),
      endsOn: day(period.endsOn),
    },
    schoolClass: { id: schoolClass.id, name: schoolClass.name },
    scale,
    population: roster.length,
    rankedPopulation: students.filter((row) => row.rank !== null).length,
    warnings,
    students,
  };
}
