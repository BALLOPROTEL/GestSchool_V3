import { z } from 'zod';

export const resultStatuses = ['DRAFT', 'SUBMITTED', 'VALIDATED', 'PUBLISHED', 'LOCKED'] as const;
export type ResultStatus = (typeof resultStatuses)[number];
export const gradeOutcomes = ['SCORED', 'ABSENT', 'EXCUSED', 'NOT_GRADED'] as const;
export type GradeOutcome = (typeof gradeOutcomes)[number];
export const resultPermissionCodes = [
  'assessments.read',
  'assessments.create',
  'assessments.update',
  'grades.read',
  'grades.create',
  'grades.update',
  'grades.submit',
  'grades.validate',
  'grades.publish',
  'grades.correct',
  'grades.lock',
  'report-cards.read',
  'report-cards.generate',
  'report-cards.publish',
  'report-cards.lock',
] as const;
export const resultTeacherPermissions = [
  'assessments.read',
  'assessments.create',
  'assessments.update',
  'grades.read',
  'grades.create',
  'grades.update',
  'grades.submit',
] as const;
export const resultPublishedPermissions = [
  'assessments.read',
  'grades.read',
  'report-cards.read',
] as const;
export const resultDecimal = z.string().regex(/^(0|[1-9]\d{0,4})(\.\d{1,2})?$/);
export const resultPositiveDecimal = resultDecimal.refine(
  (value) => !/^0(?:\.0{1,2})?$/.test(value),
);
export const assessmentInput = z.strictObject({
  reference: z.string().trim().min(1).max(50).optional(),
  classSubjectId: z.uuid(),
  academicPeriodId: z.uuid(),
  title: z.string().trim().min(1).max(160),
  assessedOn: z.iso.date(),
  maxScore: resultPositiveDecimal.default('20'),
  weight: resultPositiveDecimal.default('1'),
});
export const assessmentPatch = z.strictObject({
  expectedVersion: z.number().int().positive(),
  title: z.string().trim().min(1).max(160).optional(),
  assessedOn: z.iso.date().optional(),
  maxScore: resultPositiveDecimal.optional(),
  weight: resultPositiveDecimal.optional(),
});
export const gradeEntry = z
  .strictObject({
    studentId: z.uuid(),
    score: resultDecimal.nullable().default(null),
    outcome: z.enum(gradeOutcomes).default('SCORED'),
    comment: z.string().trim().max(500).nullable().default(null),
  })
  .refine((row) => (row.outcome === 'SCORED') === (row.score !== null), {
    message: 'A score is required only for SCORED results',
  });
export const gradeBulkInput = z.strictObject({
  expectedVersion: z.number().int().positive(),
  grades: z
    .array(gradeEntry)
    .min(1)
    .max(1000)
    .refine((rows) => new Set(rows.map((row) => row.studentId)).size === rows.length, {
      message: 'Duplicate student in grade batch',
    }),
});
export const gradePatchInput = z
  .strictObject({
    expectedVersion: z.number().int().positive(),
    score: resultDecimal.nullable(),
    outcome: z.enum(gradeOutcomes),
    comment: z.string().trim().max(500).nullable().default(null),
  })
  .refine((row) => (row.outcome === 'SCORED') === (row.score !== null));
export const gradeCorrectionInput = gradePatchInput.safeExtend({
  reason: z.string().trim().min(3).max(500),
});
export const assessmentActionInput = z.strictObject({
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500).optional(),
});
export const resultQuery = z.strictObject({
  academicYearId: z.uuid().optional(),
  academicPeriodId: z.uuid().optional(),
  classId: z.uuid().optional(),
  classSubjectId: z.uuid().optional(),
  studentId: z.uuid().optional(),
  status: z.enum(resultStatuses).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});
export const classPeriodInput = z.strictObject({ classId: z.uuid(), academicPeriodId: z.uuid() });
export const reportRemarkInput = z.strictObject({
  generalRemark: z.string().trim().max(1000).nullable(),
  remarks: z
    .array(z.strictObject({ subjectId: z.uuid(), remark: z.string().trim().max(500).nullable() }))
    .max(100),
});
export type AssessmentInput = z.infer<typeof assessmentInput>;
export type AssessmentPatch = z.infer<typeof assessmentPatch>;
export type GradeEntry = z.infer<typeof gradeEntry>;
export type GradeBulkInput = z.infer<typeof gradeBulkInput>;
export type GradePatchInput = z.infer<typeof gradePatchInput>;
export type GradeCorrectionInput = z.infer<typeof gradeCorrectionInput>;
export type AssessmentActionInput = z.infer<typeof assessmentActionInput>;
export type ResultQuery = z.infer<typeof resultQuery>;
export type ClassPeriodInput = z.infer<typeof classPeriodInput>;
export type ReportRemarkInput = z.infer<typeof reportRemarkInput>;
export type AssessmentAction = 'submit' | 'validate' | 'publish' | 'lock' | 'reopen' | 'archive';
export interface AssessmentView {
  id: string;
  reference: string;
  title: string;
  classSubjectId: string;
  academicPeriodId: string;
  academicYearId: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  periodName: string;
  assessedOn: string;
  maxScore: string;
  weight: string;
  coefficient: string;
  status: ResultStatus;
  version: number;
  archivedAt: string | null;
  createdByMembershipId: string | null;
  submittedByMembershipId: string | null;
}
export interface ResultList<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface GradeView {
  id: string | null;
  studentId: string;
  matricule: string;
  firstName: string;
  lastName: string;
  score: string | null;
  outcome: GradeOutcome;
  status: ResultStatus;
  comment: string | null;
}
export interface GradeSheet {
  assessment: AssessmentView;
  grades: GradeView[];
}
export interface GradeChangeView {
  id: string;
  gradeId: string;
  previousScore: string | null;
  newScore: string | null;
  previousOutcome: GradeOutcome | null;
  newOutcome: GradeOutcome;
  previousComment: string | null;
  newComment: string | null;
  reason: string;
  actorMembershipId: string | null;
  requestId: string | null;
  changedAt: string;
}
export interface SubjectResult {
  classSubjectId: string;
  subjectId: string;
  name: string;
  coefficient: string;
  average: string | null;
  outcome: GradeOutcome;
  complete: boolean;
  remark: string | null;
  assessments: number;
  scored: number;
  missing: number;
}
export interface StudentResult {
  studentId: string;
  enrollmentId: string;
  matricule: string;
  firstName: string;
  lastName: string;
  subjects: SubjectResult[];
  overallAverage: string | null;
  rank: number | null;
  complete: boolean;
  warnings: string[];
}
export interface ClassResults {
  academicYear: { id: string; name: string };
  academicPeriod: { id: string; name: string; startsOn: string; endsOn: string };
  schoolClass: { id: string; name: string };
  scale: string;
  population: number;
  rankedPopulation: number;
  warnings: string[];
  students: StudentResult[];
}
export interface ReportSnapshot {
  schemaVersion: 1;
  academicYear: ClassResults['academicYear'];
  academicPeriod: ClassResults['academicPeriod'];
  schoolClass: ClassResults['schoolClass'];
  scale: string;
  population: number;
  rankedPopulation: number;
  student: StudentResult;
  generalRemark: string | null;
  publishedAt: string | null;
  rounding: 'HALF_UP_2';
  ranking: 'COMPETITION_ON_DISPLAY_AVERAGE';
}
export interface ReportCardView {
  id: string;
  studentId: string;
  academicPeriodId: string;
  classId: string;
  status: ResultStatus;
  publishedAt: string | null;
  lockedAt: string | null;
  snapshot: ReportSnapshot | null;
}

const resultIdentity = z.object({ id: z.uuid(), name: z.string() });
export const reportSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  academicYear: resultIdentity,
  academicPeriod: resultIdentity.extend({ startsOn: z.iso.date(), endsOn: z.iso.date() }),
  schoolClass: resultIdentity,
  scale: resultPositiveDecimal,
  population: z.number().int().nonnegative(),
  rankedPopulation: z.number().int().nonnegative(),
  student: z.object({
    studentId: z.uuid(),
    enrollmentId: z.uuid(),
    matricule: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    subjects: z.array(
      z.object({
        classSubjectId: z.uuid(),
        subjectId: z.uuid(),
        name: z.string(),
        coefficient: resultPositiveDecimal,
        average: resultDecimal.nullable(),
        outcome: z.enum(gradeOutcomes),
        complete: z.boolean(),
        remark: z.string().nullable(),
        assessments: z.number().int().nonnegative(),
        scored: z.number().int().nonnegative(),
        missing: z.number().int().nonnegative(),
      }),
    ),
    overallAverage: resultDecimal.nullable(),
    rank: z.number().int().positive().nullable(),
    complete: z.boolean(),
    warnings: z.array(z.string()),
  }),
  generalRemark: z.string().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  rounding: z.literal('HALF_UP_2'),
  ranking: z.literal('COMPETITION_ON_DISPLAY_AVERAGE'),
});
