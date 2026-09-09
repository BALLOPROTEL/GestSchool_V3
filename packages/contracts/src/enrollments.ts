import { z } from 'zod';
import type { PageResult } from './people.js';

export const enrollmentPermissionCodes = [
  'enrollments.read',
  'enrollments.create',
  'enrollments.update',
  'enrollments.confirm',
  'enrollments.cancel',
  'enrollments.transfer',
  'enrollments.complete',
] as const;
export const enrollmentStatuses = [
  'PENDING',
  'ACTIVE',
  'TRANSFERRED',
  'WITHDRAWN',
  'COMPLETED',
] as const;
export const enrollmentTypes = ['NEW', 'RE_ENROLLMENT', 'TRANSFER'] as const;
export type EnrollmentStatus = (typeof enrollmentStatuses)[number];
export type EnrollmentType = (typeof enrollmentTypes)[number];
export const enrollmentDate = z.iso
  .date()
  .refine((value) => value >= '1900-01-01' && value <= '2199-12-31');
export const enrollmentCreate = z.strictObject({
  studentId: z.uuid(),
  academicYearId: z.uuid(),
  classId: z.uuid(),
  type: z.enum(['NEW', 'RE_ENROLLMENT']),
  enrolledOn: enrollmentDate,
});
export const enrollmentUpdate = enrollmentCreate
  .omit({ studentId: true, academicYearId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0);
export const enrollmentReason = z.string().trim().min(3).max(1000);
export const enrollmentEnd = z.strictObject({
  reason: enrollmentReason,
  effectiveDate: enrollmentDate,
});
export const enrollmentTransfer = enrollmentEnd.extend({ targetClassId: z.uuid() });
const integer = (max: number) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().max(max));
export const enrollmentPage = z.strictObject({
  page: integer(10000).default(1),
  pageSize: integer(100).default(25),
});
export const enrollmentQuery = enrollmentPage.extend({
  search: z.string().trim().max(100).default(''),
  status: z.enum([...enrollmentStatuses, 'ALL']).default('ALL'),
  type: z.enum([...enrollmentTypes, 'LEGACY', 'ALL']).default('ALL'),
  academicYearId: z.uuid().optional(),
  classId: z.uuid().optional(),
  levelId: z.uuid().optional(),
  studentId: z.uuid().optional(),
  sort: z
    .enum(['name', '-name', 'enrolledOn', '-enrolledOn', 'createdAt', '-createdAt'])
    .default('-enrolledOn'),
});
export const enrollmentClassQuery = enrollmentPage.extend({
  academicYearId: z.uuid(),
  classId: z.uuid().optional(),
  levelId: z.uuid().optional(),
  search: z.string().trim().max(100).default(''),
});
export type EnrollmentCreate = z.infer<typeof enrollmentCreate>;
export type EnrollmentUpdate = z.infer<typeof enrollmentUpdate>;
export type EnrollmentEnd = z.infer<typeof enrollmentEnd>;
export type EnrollmentTransfer = z.infer<typeof enrollmentTransfer>;
export type EnrollmentQuery = z.infer<typeof enrollmentQuery>;
export type EnrollmentPage = z.infer<typeof enrollmentPage>;
export type EnrollmentClassQuery = z.infer<typeof enrollmentClassQuery>;
export interface EnrollmentClassView {
  id: string;
  name: string;
  code: string;
  academicYearId: string;
  academicYearName: string;
  levelId: string;
  levelName: string;
  capacity: number | null;
  activeEnrollments: number;
  pendingEnrollments: number;
  occupiedPlaces: number;
  availablePlaces: number | null;
}
export interface EnrollmentView {
  id: string;
  studentId: string;
  studentName: string;
  matricule: string;
  academicYearId: string;
  academicYearName: string;
  academicYearStatus: 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
  classId: string;
  className: string;
  levelId: string;
  levelName: string;
  type: EnrollmentType | null;
  status: EnrollmentStatus;
  enrolledOn: string;
  endedOn: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface EnrollmentList extends PageResult<EnrollmentView> {
  summary: { total: number; active: number; pending: number; withdrawn: number };
}
export interface EnrollmentEventView {
  id: string;
  kind:
    'BASELINE' | 'CREATED' | 'UPDATED' | 'CONFIRMED' | 'CANCELLED' | 'TRANSFERRED' | 'COMPLETED';
  fromClassId: string | null;
  toClassId: string;
  fromClassName: string | null;
  toClassName: string;
  fromStatus: EnrollmentStatus | null;
  toStatus: EnrollmentStatus;
  type: EnrollmentType | null;
  effectiveDate: string;
  reason: string | null;
  actorName: string | null;
  actorMembershipId: string | null;
  requestId: string | null;
  recordedAt: string;
}
