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
import { assignedWhere } from '../../academics/infrastructure/read-scopes.js';
import type { RequestContext } from '../../iam/domain/context.js';
import { ScopePolicy } from '../../iam/domain/scope-policy.js';
import { AttendanceRepository } from '../domain/attendance.repository.js';
import { attendanceError, attendanceFound, attendanceTenant } from '../domain/policy.js';
import { AttendanceDatabase } from './database.js';

type Db = Prisma.TransactionClient | AttendanceDatabase['client'];

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const dateValue = (value: Date) => value.toISOString().slice(0, 10);

async function classResource(
  db: Db,
  context: RequestContext,
  classId: string,
  permission: 'attendance.read' | 'attendance.write' | 'attendance.export',
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

  const assignment = await db.teachingAssignment.findFirst({
    where: {
      AND: [assignedWhere(context), { classSubject: { schoolClassId: classId } }],
    },
    select: { id: true },
  });
  if (!assignment) attendanceError('AUTH_FORBIDDEN', 403);
  return schoolClass;
}

async function studentResource(db: Db, context: RequestContext, studentId: string) {
  const student = attendanceFound(
    await db.student.findFirst({
      where: { tenantId: context.tenantId, id: studentId },
      include: {
        guardians: {
          include: { guardian: { select: { userId: true, status: true } } },
        },
        enrollments: {
          where: { status: 'ACTIVE' },
          select: { schoolClassId: true },
        },
      },
    }),
  );
  const guardianUserIds = student.guardians
    .filter((link) => link.guardian.status === 'ACTIVE' && link.guardian.userId)
    .map((link) => link.guardian.userId as string);
  const classIds = [...new Set(student.enrollments.map((enrollment) => enrollment.schoolClassId))];
  const assigned =
    classIds.length > 0 &&
    Boolean(
      await db.teachingAssignment.findFirst({
        where: {
          AND: [assignedWhere(context), { classSubject: { schoolClassId: { in: classIds } } }],
        },
        select: { id: true },
      }),
    );
  if (
    !new ScopePolicy().allows(context, 'attendance.read', {
      tenantId: context.tenantId,
      ...(student.userId ? { ownerUserId: student.userId } : {}),
      guardianUserIds,
      assignedUserIds: assigned ? [context.userId] : [],
    })
  )
    attendanceError('AUTH_FORBIDDEN', 403);
  return student;
}

async function historicalRoster(
  db: Db,
  context: RequestContext,
  classId: string,
  academicYearId: string,
  targetDate: Date,
) {
  const [eventCandidates, currentCandidates] = await Promise.all([
    db.enrollmentEvent.findMany({
      where: {
        tenantId: context.tenantId,
        academicYearId,
        effectiveDate: { lte: targetDate },
        OR: [{ toClassId: classId }, { fromClassId: classId }],
      },
      select: { enrollmentId: true },
    }),
    db.enrollment.findMany({
      where: {
        tenantId: context.tenantId,
        academicYearId,
        schoolClassId: classId,
        enrolledOn: { lte: targetDate },
      },
      select: { id: true },
    }),
  ]);
  const enrollmentIds = [
    ...new Set([
      ...eventCandidates.map((row) => row.enrollmentId),
      ...currentCandidates.map((row) => row.id),
    ]),
  ];
  if (!enrollmentIds.length) return [];

  const [events, enrollments] = await Promise.all([
    db.enrollmentEvent.findMany({
      where: {
        tenantId: context.tenantId,
        enrollmentId: { in: enrollmentIds },
        effectiveDate: { lte: targetDate },
      },
      orderBy: [
        { enrollmentId: 'asc' },
        { effectiveDate: 'desc' },
        { recordedAt: 'desc' },
        { id: 'desc' },
      ],
    }),
    db.enrollment.findMany({
      where: {
        tenantId: context.tenantId,
        id: { in: enrollmentIds },
        academicYearId,
        enrolledOn: { lte: targetDate },
      },
      include: { student: true },
    }),
  ]);
  const latest = new Map<string, (typeof events)[number]>();
  for (const event of events)
    if (!latest.has(event.enrollmentId)) latest.set(event.enrollmentId, event);

  return enrollments
    .filter((enrollment) => {
      if (enrollment.student.archivedAt && enrollment.student.archivedAt <= targetDate)
        return false;
      const event = latest.get(enrollment.id);
      if (event) return event.toClassId === classId && event.toStatus === 'ACTIVE';
      return (
        enrollment.schoolClassId === classId &&
        enrollment.status === 'ACTIVE' &&
        (!enrollment.endedOn || targetDate < enrollment.endedOn)
      );
    })
    .toSorted(
      (left, right) =>
        left.student.lastName.localeCompare(right.student.lastName) ||
        left.student.firstName.localeCompare(right.student.firstName) ||
        left.id.localeCompare(right.id),
    );
}

async function buildSheet(
  db: Db,
  context: RequestContext,
  query: AttendanceSheetQuery,
  permission: 'attendance.read' | 'attendance.write' | 'attendance.export' = 'attendance.read',
): Promise<AttendanceSheetView> {
  const schoolClass = await classResource(db, context, query.classId, permission);
  const targetDate = day(query.date);
  const startsOn = dateValue(schoolClass.academicYear.startsOn);
  const endsOn = dateValue(schoolClass.academicYear.endsOn);
  if (query.date < startsOn || query.date > endsOn) attendanceError('ATTENDANCE_DATE_OUTSIDE_YEAR');

  const enrollments = await historicalRoster(
    db,
    context,
    query.classId,
    schoolClass.academicYearId,
    targetDate,
  );
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
  const count = (status: AttendanceStatus) =>
    students.filter((item) => item.status === status).length;
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

  override sheet(
    context: RequestContext,
    query: AttendanceSheetQuery,
    permission: 'attendance.read' | 'attendance.write' | 'attendance.export' = 'attendance.read',
  ) {
    return buildSheet(this.database.client, context, query, permission);
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
      const sheet = await buildSheet(
        db,
        context,
        { classId: input.classId, date: input.date },
        'attendance.write',
      );
      const targetDate = day(input.date);
      const roster = new Set(sheet.students.map((student) => student.studentId));
      if (input.entries.some((entry) => !roster.has(entry.studentId)))
        attendanceError('ATTENDANCE_STUDENT_NOT_ENROLLED');

      const studentIds = input.entries.map((entry) => entry.studentId);
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
        if (entry.status === null) {
          await db.attendanceRecord.deleteMany({
            where: {
              tenantId: context.tenantId,
              studentId: entry.studentId,
              schoolClassId: input.classId,
              date: targetDate,
            },
          });
          continue;
        }
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
            cleared: input.entries.filter((entry) => entry.status === null).length,
            statusCounts,
          },
        },
      });

      return buildSheet(
        db,
        context,
        { classId: input.classId, date: input.date },
        'attendance.write',
      );
    });
  }
}
