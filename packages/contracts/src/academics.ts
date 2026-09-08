import { z } from 'zod';

export const academicPermissionCodes = [
  'academic-years.read',
  'academic-years.create',
  'academic-years.update',
  'academic-years.activate',
  'academic-years.close',
  'academic-years.archive',
  'academic-periods.read',
  'academic-periods.create',
  'academic-periods.update',
  'academic-periods.archive',
  'levels.read',
  'levels.create',
  'levels.update',
  'levels.archive',
  'classes.read',
  'classes.create',
  'classes.update',
  'classes.archive',
  'subjects.read',
  'subjects.create',
  'subjects.update',
  'subjects.archive',
  'teaching-assignments.read',
  'teaching-assignments.create',
  'teaching-assignments.update',
  'teaching-assignments.archive',
] as const;
export const academicReadPermissions = academicPermissionCodes.filter((code) =>
  code.endsWith('.read'),
);
export const academicEntities = [
  'academic-years',
  'academic-periods',
  'levels',
  'classes',
  'subjects',
  'class-subjects',
  'teaching-assignments',
] as const;
export type AcademicEntity = (typeof academicEntities)[number];
export type AcademicStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
export const academicId = z.uuid();
const code = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[\p{L}\p{N}._-]+$/u);
const name = (max: number) => z.string().trim().min(1).max(max);
const date = z.iso.date().refine((value) => value >= '1900-01-01' && value <= '2199-12-31');
const nonempty = (value: object) => Object.keys(value).length > 0;
const dates = (value: { startsOn?: string | undefined; endsOn?: string | undefined }) =>
  !value.startsOn || !value.endsOn || value.startsOn < value.endsOn;
const yearFields = z.strictObject({
  code: code(30),
  name: name(100),
  startsOn: date,
  endsOn: date,
});
export const academicYearCreate = yearFields.refine(dates);
export const academicYearUpdate = yearFields.partial().refine(nonempty).refine(dates);
const periodFields = z.strictObject({
  name: name(100),
  type: z.enum(['TRIMESTER', 'SEMESTER']),
  ordinal: z.number().int().min(1).max(3),
  startsOn: date,
  endsOn: date,
});
const periodOrdinal = (value: { type?: string | undefined; ordinal?: number | undefined }) =>
  value.type !== 'SEMESTER' || value.ordinal !== 3;
export const academicPeriodCreate = periodFields.refine(dates).refine(periodOrdinal);
export const academicPeriodUpdate = periodFields
  .partial()
  .refine(nonempty)
  .refine(dates)
  .refine(periodOrdinal);
export const levelCreate = z.strictObject({
  code: code(30),
  name: name(100),
  position: z.number().int().min(0).max(32767).optional(),
});
export const levelUpdate = levelCreate.partial().refine(nonempty);
export const schoolClassCreate = z.strictObject({
  academicYearId: academicId,
  levelId: academicId,
  code: code(40),
  name: name(120),
  capacity: z.number().int().positive().max(10000).nullable().optional(),
});
// The academic year is identity/history, not an editable field of an existing class.
export const schoolClassUpdate = schoolClassCreate
  .omit({ academicYearId: true })
  .partial()
  .refine(nonempty);
export const subjectCreate = z.strictObject({ code: code(30), name: name(120) });
export const subjectUpdate = subjectCreate.partial().refine(nonempty);
export const coefficient = z
  .union([
    z.string().regex(/^\d{1,3}(?:\.\d{1,2})?$/),
    z.number().positive().max(999.99).multipleOf(0.01),
  ])
  .transform((value) => (typeof value === 'number' ? value.toFixed(2) : value))
  .refine((value) => Number(value) > 0);
export const classSubjectCreate = z.strictObject({
  subjectId: academicId,
  coefficient: coefficient.default('1.00'),
});
export const classSubjectUpdate = z.strictObject({ coefficient });
export const teachingAssignmentCreate = z.strictObject({
  classSubjectId: academicId,
  teacherId: academicId,
  academicPeriodId: academicId,
});
export const teachingAssignmentUpdate = teachingAssignmentCreate.partial().refine(nonempty);
const integer = (max: number) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().max(max));
const queryFields = {
  page: integer(10000).default(1),
  pageSize: integer(100).default(25),
  search: z.string().trim().max(100).default(''),
  status: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).default('ACTIVE'),
  sort: z.enum(['name', '-name', 'code', '-code', 'createdAt', '-createdAt']).default('name'),
};
export const academicQueries = {
  'academic-years': z.strictObject({
    ...queryFields,
    status: z.enum(['DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED', 'ALL']).default('ALL'),
  }),
  'academic-periods': z.strictObject({ ...queryFields }),
  levels: z.strictObject({ ...queryFields }),
  classes: z.strictObject({
    ...queryFields,
    academicYearId: academicId.optional(),
    levelId: academicId.optional(),
  }),
  subjects: z.strictObject({
    ...queryFields,
    academicYearId: academicId.optional(),
    classId: academicId.optional(),
  }),
  'class-subjects': z.strictObject({ ...queryFields, subjectId: academicId.optional() }),
  'teaching-assignments': z.strictObject({
    ...queryFields,
    academicYearId: academicId.optional(),
    classId: academicId.optional(),
    levelId: academicId.optional(),
    teacherId: academicId.optional(),
    subjectId: academicId.optional(),
    academicPeriodId: academicId.optional(),
  }),
} as const;
export interface AcademicQuery {
  page: number;
  pageSize: number;
  search: string;
  status: AcademicStatus | 'ALL';
  sort: string;
  academicYearId?: string | undefined;
  levelId?: string | undefined;
  classId?: string | undefined;
  subjectId?: string | undefined;
  teacherId?: string | undefined;
  academicPeriodId?: string | undefined;
}
export interface AcademicView {
  id: string;
  name: string;
  status: AcademicStatus;
  createdAt: string;
  updatedAt?: string;
  archivedAt: string | null;
  code?: string;
  startsOn?: string;
  endsOn?: string;
  type?: 'TRIMESTER' | 'SEMESTER';
  ordinal?: number;
  position?: number;
  capacity?: number | null;
  academicYearId?: string;
  academicYearName?: string;
  academicYearStatus?: AcademicStatus;
  levelId?: string;
  levelName?: string;
  classId?: string;
  className?: string;
  subjectId?: string;
  subjectName?: string;
  coefficient?: string;
  classSubjectId?: string;
  teacherId?: string;
  teacherName?: string;
  academicPeriodId?: string;
  academicPeriodName?: string;
}
export type AcademicYearCreate = z.infer<typeof academicYearCreate>;
export type AcademicYearUpdate = z.infer<typeof academicYearUpdate>;
export type AcademicPeriodCreate = z.infer<typeof academicPeriodCreate>;
export type AcademicPeriodUpdate = z.infer<typeof academicPeriodUpdate>;
export type LevelCreate = z.infer<typeof levelCreate>;
export type LevelUpdate = z.infer<typeof levelUpdate>;
export type SchoolClassCreate = z.infer<typeof schoolClassCreate>;
export type SchoolClassUpdate = z.infer<typeof schoolClassUpdate>;
export type SubjectCreate = z.infer<typeof subjectCreate>;
export type SubjectUpdate = z.infer<typeof subjectUpdate>;
export type ClassSubjectCreate = z.infer<typeof classSubjectCreate>;
export type ClassSubjectUpdate = z.infer<typeof classSubjectUpdate>;
export type TeachingAssignmentCreate = z.infer<typeof teachingAssignmentCreate>;
export type TeachingAssignmentUpdate = z.infer<typeof teachingAssignmentUpdate>;
