import { Inject, Injectable } from '@nestjs/common';
import type {
  AttendanceBulkWrite,
  AttendanceHistoryQuery,
  AttendanceRecordView,
  AttendanceSheetQuery,
  AttendanceSheetView,
  AttendanceStatus,
} from '@gestschool/contracts';
import type { Prisma } from '@gestschool/database';
import type { RequestContext } from '../../iam/domain/context.js';
import { ScopePolicy } from '../../iam/domain/scope-policy.js';
import { AttendanceRepository } from '../domain/attendance.repository.js';
import {
  attendanceError,
  attendanceFound,
  attendanceTenant,
} from '../domain/policy.js';
import { AttendanceDatabase } from './database.js';

type Db = Prisma.TransactionClient | AttendanceDatabase['client'];

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const dateValue = (value: Date) => value.toISOString().slice(0, 10);

async function classResource(
  db: Db,
  context: RequestContext,
  classId: string,
  permission: 'attendance.read' | 'attendance.write',
) {
  const schoolClass = attendanceFound(
    await db.schoolClass.findFirst({
      where: { tenantId: context.tenantId, id: classId, status: 'ACTIVE' },
      include: { academicYear: true },
    }),
  );
  if (attendanceTenant(context, permission)) return schoolClass;

  const assigned = context.grants.some(
    (grant) => grant.permission === permission && grant.scope === 'ASSIGNED',
  );
  if (!assigned) attendanceError('AUTH_FORBIDDEN', 403);

  const teacher = await db.teacher.findFirst({
    where: {
      tenantId: context.tenantId,
      userId: context.userId,
      status: 'ACTIVE',
      assignments: {
        some: {
          status: 'ACTIVE',
          classSubject: { schoolClassId: classId },
        },
      },
    },
    select: { id: true },
  });
  if (!teacher) attendanceError('AUTH_FORBIDDEN', 403);
  return schoolClass;
}

async function studentResource(db: Db, context: RequestContext, studentId: string) {
  const student = attendanceFound(
    await db.student.findFirst({
      where: { tenantId: context.tenantId, id: studentId, status: 'ACTIVE' },
      include: {
        guardians: {
          include: { guardian: { select: { userId: true, status: true } } },
        },
        enrollments: {
          where: { status: 'ACTIVE' },
          include: {
            schoolClass: {
              include: {
                subjects: {
                  include: {
                    assignments: {
                      where: { status: 'ACTIVE' },
                      include: { teacher: { select: { userId: true, status: true } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
  );
  const guardianUserIds = student.guardians
    .filter((link) => link.guardian.status === 'ACTIVE' && link.guardian.userId)
    .map((link) => link.guardian.userId as string);
  const assignedUserIds = [
    ...new Set(
      student.enrollments.flatMap((enrollment) =>
        enrollment.schoolClass.subjects.flatMap((subject) =>
          subject.assignments
            .filter((assignment) => assignment.teacher.status === 'ACTIVE')
            .map((assignment) => assignment.teacher.userId)
            .filter((userId): userId is string => Boolean(userId)),
        ),
      ),
    ),
  ];
  if (
    !new ScopePolicy().allows(context, 'attendance.read', {
      tenantId: context.tenantId,
      ...(student.userId ? { ownerUserId: student.userId } : {}),
      guardianUserIds,
      assignedUserIds,
    })
  )
    attendanceError('AUTH_FORBIDDEN', 403);
  return student;
}

async function buildSheet(
  db: Db,
  context: RequestContext,
  query: AttendanceSheetQuery,
  permission: 'attendance.read' | 'attendance.write' = 'attendance.read',
): Promise<AttendanceSheetView> {
  const schoolClass = await classResource(db, context, query.classId, permission);
  const targetDate = day(query.date);
  const startsOn = dateValue(schoolClass.academicYear.startsOn);
  const endsOn = dateValue(schoolClass.academicYear.endsOn);
  if (query.date < startsOn || query.date > endsOn)
    attendanceError('ATTENDANCE_DATE_OUTSIDE_YEAR');

  const enrollments = await db.enrollment.findMany({
    where: {
      tenantId: context.tenantId,
      schoolClassId: query.classId,
      academicYearId: schoolClass.academicYearId,
      status: 'ACTIVE',
      student: { status: 'ACTIVE' },
    },
    include: { student: true },
    orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }, { id: 'asc' }],
  });
  const records = enrollments.length
    ? await db.attendanceRecord.findMany({
        where: {
          tenantId: context.tenantId,
          schoolClassId: query.classId,
          date: targetDate,
          studentId: { in: enrollments.map((enrollment) => enrollment.studentId) },
        },
      })
    : [];
  const recordByStudent = new Map(records.map((record) => [record.studentId, record]));
  const students = enrollments.map((enrollment) => {
    const record = recordByStudent.get(enrollment.studentId);
    return {
      studentId: enrollment.studentId,
      enrollmentId: enrollment.id,
      studentName: `${enrollment.student.firstName} ${enrollment.student.lastName}`.trim(),
      matricule: enrollment.student.matricule,
      status: record?.status ?? null,
      note: record?.note ?? null,
      recordId: record?.id ?? null,
      updatedAt: record?.updatedAt.toISOString() ?? null,
    };
  });
  const count = (status: AttendanceStatus) => students.filter((item) => item.status === status).length;
  return {
    classId: schoolClass.id,
    className: schoolClass.name,
    academicYearId: schoolClass.academicYearId,
    academicYearName: schoolClass.academicYear.name,
    date: query.date,
    students,
    summary: {
      total: students.length,
      unmarked: students.filter((item) => item.status === null).length,
      present: count('PRESENT'),
      absent: count('ABSENT'),
      late: count('LATE'),
      excused: count('EXCUSED'),
    },
  };
}

function recordView(record: {
  id: string;
  studentId: string;
  schoolClassId: string;
  date: Date;
  status: AttendanceStatus;
  note: string | null;
  recordedByMembershipId: string;
  updatedAt: Date;
  student: { firstName: string; lastName: string; matricule: string };
  schoolClass: { name: string };
  recordedBy: { user: { displayName: string } };
}): AttendanceRecordView {
  return {
    id: record.id,
    studentId: record.studentId,
    studentName: `${record.student.firstName} ${record.student.lastName}`.trim(),
    matricule: record.student.matricule,
    classId: record.schoolClassId,
    className: record.schoolClass.name,
    date: dateValue(record.date),
    status: record.status,
    note: record.note,
    recordedByMembershipId: record.recordedByMembershipId,
    recordedByName: record.recordedBy.user.displayName,
    updatedAt: record.updatedAt.toISOString(),
  };
}

@Injectable()
export class PrismaAttendanceRepository extends AttendanceRepository {
  constructor(@Inject(AttendanceDatabase) private readonly database: AttendanceDatabase) {
    super();
  }

  override sheet(context: RequestContext, query: AttendanceSheetQuery) {
    return buildSheet(this.database.client, context, query);
  }

  override async history(context: RequestContext, query: AttendanceHistoryQuery) {
    await studentResource(this.database.client, context, query.studentId);
    const where: Prisma.AttendanceRecordWhereInput = {
      tenantId: context.tenantId,
      studentId: query.studentId,
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: day(query.from) } : {}),
              ...(query.to ? { lte: day(query.to) } : {}),
            },
          }
        : {}),
    };
    const [rows, total, groups] = await this.database.client.$transaction([
      this.database.client.attendanceRecord.findMany({
        where,
        include: {
          student: true,
          schoolClass: true,
          recordedBy: { include: { user: true } },
        },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.database.client.attendanceRecord.count({ where }),
      this.database.client.attendanceRecord.groupBy({
        where,
        by: ['status'],
        _count: { _all: true },
      }),
    ]);
    const count = (status: AttendanceStatus) =>
      groups.find((group) => group.status === status)?.['_count']['_all'] ?? 0;
    return {
      items: rows.map(recordView),
      total,
      page: query.page,
      pageSize: query.pageSize,
      summary: {
        present: count('PRESENT'),
        absent: count('ABSENT'),
        late: count('LATE'),
        excused: count('EXCUSED'),
      },
    };
  }

  override write(context: RequestContext, input: AttendanceBulkWrite) {
    return this.database.write(context, async (db) => {
      await buildSheet(db, context, { classId: input.classId, date: input.date }, 'attendance.write');
      const targetDate = day(input.date);
      const studentIds = input.entries.map((entry) => entry.studentId);
      const enrollments = await db.enrollment.findMany({
        where: {
          tenantId: context.tenantId,
          schoolClassId: input.classId,
          status: 'ACTIVE',
          studentId: { in: studentIds },
        },
        select: { studentId: true },
      });
      const enrolled = new Set(enrollments.map((enrollment) => enrollment.studentId));
      if (studentIds.some((studentId) => !enrolled.has(studentId)))
        attendanceError('ATTENDANCE_STUDENT_NOT_ENROLLED');

      const existing = await db.attendanceRecord.findMany({
        where: {
          tenantId: context.tenantId,
          studentId: { in: studentIds },
          date: targetDate,
        },
        select: { studentId: true, schoolClassId: true },
      });
      if (existing.some((record) => record.schoolClassId !== input.classId))
        attendanceError('ATTENDANCE_CLASS_CONFLICT');

      for (const entry of input.entries) {
        await db.attendanceRecord.upsert({
          where: {
            tenantId_studentId_date: {
              tenantId: context.tenantId,
              studentId: entry.studentId,
              date: targetDate,
            },
          },
          update: {
            status: entry.status,
            note: entry.note ?? null,
            schoolClassId: input.classId,
            recordedByMembershipId: context.membershipId,
          },
          create: {
            tenantId: context.tenantId,
            studentId: entry.studentId,
            schoolClassId: input.classId,
            date: targetDate,
            status: entry.status,
            note: entry.note ?? null,
            recordedByMembershipId: context.membershipId,
          },
        });
      }

      const statusCounts = Object.fromEntries(
        ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'].map((status) => [
          status,
          input.entries.filter((entry) => entry.status === status).length,
        ]),
      );
      await db.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorMembershipId: context.membershipId,
          action: 'attendance.sheet.updated',
          entityType: 'attendance',
          entityId: input.classId,
          metadata: {
            requestId: context.requestId,
            date: input.date,
            count: input.entries.length,
            statusCounts,
          },
        },
      });

      return buildSheet(db, context, { classId: input.classId, date: input.date }, 'attendance.write');
    });
  }
}
