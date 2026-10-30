import { z } from 'zod';
import type { PageResult } from './people.js';

export const attendancePermissionCodes = [
  'attendance.read',
  'attendance.write',
  'attendance.export',
] as const;

export const attendanceStatuses = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;
export type AttendanceStatus = (typeof attendanceStatuses)[number];

export const attendanceDate = z.iso
  .date()
  .refine((value) => value >= '1900-01-01' && value <= '2199-12-31');

const attendanceNote = z.string().trim().max(500).nullable().optional();
const positiveInteger = (max: number) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().max(max));

export const attendanceSheetQuery = z.strictObject({
  classId: z.uuid(),
  date: attendanceDate,
});

export const attendanceEntry = z.strictObject({
  studentId: z.uuid(),
  status: z.enum([...attendanceStatuses]),
  note: attendanceNote,
});

export const attendanceBulkWrite = z
  .strictObject({
    classId: z.uuid(),
    date: attendanceDate,
    entries: z.array(attendanceEntry).min(1).max(500),
  })
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.entries.forEach((entry, index) => {
      if (seen.has(entry.studentId))
        context.addIssue({
          code: 'custom',
          message: 'ATTENDANCE_DUPLICATE_STUDENT',
          path: ['entries', index, 'studentId'],
        });
      seen.add(entry.studentId);
    });
  });

export const attendanceHistoryQuery = z
  .strictObject({
    studentId: z.uuid(),
    from: attendanceDate.optional(),
    to: attendanceDate.optional(),
    page: positiveInteger(10000).default(1),
    pageSize: positiveInteger(100).default(25),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to);

export type AttendanceBulkWrite = z.infer<typeof attendanceBulkWrite>;
export type AttendanceSheetQuery = z.infer<typeof attendanceSheetQuery>;
export type AttendanceHistoryQuery = z.infer<typeof attendanceHistoryQuery>;

export interface AttendanceRecordView {
  id: string;
  studentId: string;
  studentName: string;
  matricule: string;
  classId: string;
  className: string;
  date: string;
  status: AttendanceStatus;
  note: string | null;
  recordedByMembershipId: string;
  recordedByName: string | null;
  updatedAt: string;
}

export interface AttendanceSheetStudent {
  studentId: string;
  enrollmentId: string;
  studentName: string;
  matricule: string;
  status: AttendanceStatus | null;
  note: string | null;
  recordId: string | null;
  updatedAt: string | null;
}

export interface AttendanceSheetView {
  classId: string;
  className: string;
  academicYearId: string;
  academicYearName: string;
  date: string;
  students: AttendanceSheetStudent[];
  summary: {
    total: number;
    unmarked: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
  };
}

export interface AttendanceHistoryView extends PageResult<AttendanceRecordView> {
  summary: {
    present: number;
    absent: number;
    late: number;
    excused: number;
  };
}
