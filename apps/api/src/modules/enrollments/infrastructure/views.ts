import type { Enrollment, EnrollmentEvent, Prisma, SchoolClass } from '@gestschool/database';
import type {
  EnrollmentClassView,
  EnrollmentEventView,
  EnrollmentView,
} from '@gestschool/contracts';
import { enrollmentFound } from '../domain/policy.js';
export const civilDate = (value: Date) => value.toISOString().slice(0, 10);
export async function enrollmentViews(
  db: Prisma.TransactionClient,
  tenantId: string,
  rows: Enrollment[],
): Promise<EnrollmentView[]> {
  if (!rows.length) return [];
  const students = await db.student.findMany({
    where: { tenantId, id: { in: rows.map((row) => row.studentId) } },
  });
  const classes = await db.schoolClass.findMany({
    where: { tenantId, id: { in: rows.map((row) => row.schoolClassId) } },
  });
  const years = await db.academicYear.findMany({
    where: { tenantId, id: { in: rows.map((row) => row.academicYearId) } },
  });
  const levels = await db.level.findMany({
    where: { tenantId, id: { in: classes.map((row) => row.levelId) } },
  });
  const studentMap = new Map(students.map((row) => [row.id, row]));
  const classMap = new Map(classes.map((row) => [row.id, row]));
  const yearMap = new Map(years.map((row) => [row.id, row]));
  const levelMap = new Map(levels.map((row) => [row.id, row]));
  return rows.map((row) => {
    const student = enrollmentFound(studentMap.get(row.studentId));
    const classroom = enrollmentFound(classMap.get(row.schoolClassId));
    const year = enrollmentFound(yearMap.get(row.academicYearId));
    const level = enrollmentFound(levelMap.get(classroom.levelId));
    return {
      id: row.id,
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`,
      matricule: student.matricule,
      academicYearId: year.id,
      academicYearName: year.name,
      academicYearStatus: year.status,
      classId: classroom.id,
      className: classroom.name,
      levelId: level.id,
      levelName: level.name,
      type: row.type,
      status: row.status,
      enrolledOn: civilDate(row.enrolledOn),
      endedOn: row.endedOn ? civilDate(row.endedOn) : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}
export async function enrollmentClassViews(
  db: Prisma.TransactionClient,
  tenantId: string,
  rows: SchoolClass[],
): Promise<EnrollmentClassView[]> {
  if (!rows.length) return [];
  const years = await db.academicYear.findMany({
    where: { tenantId, id: { in: rows.map((row) => row.academicYearId) } },
  });
  const levels = await db.level.findMany({
    where: { tenantId, id: { in: rows.map((row) => row.levelId) } },
  });
  const counts = await db.enrollment.groupBy({
    by: ['schoolClassId', 'status'],
    where: {
      tenantId,
      schoolClassId: { in: rows.map((row) => row.id) },
      status: { in: ['PENDING', 'ACTIVE'] },
    },
    _count: { _all: true },
  });
  return rows.map((row) => {
    const active =
      counts.find((count) => count.schoolClassId === row.id && count.status === 'ACTIVE')?.[
        '_count'
      ]['_all'] ?? 0;
    const pending =
      counts.find((count) => count.schoolClassId === row.id && count.status === 'PENDING')?.[
        '_count'
      ]['_all'] ?? 0;
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      academicYearId: row.academicYearId,
      academicYearName: enrollmentFound(years.find((year) => year.id === row.academicYearId)).name,
      levelId: row.levelId,
      levelName: enrollmentFound(levels.find((level) => level.id === row.levelId)).name,
      capacity: row.capacity,
      activeEnrollments: active,
      pendingEnrollments: pending,
      occupiedPlaces: active + pending,
      availablePlaces: row.capacity === null ? null : Math.max(0, row.capacity - active - pending),
    };
  });
}
export function enrollmentEventView(row: EnrollmentEvent): EnrollmentEventView {
  return {
    id: row.id,
    kind: row.kind,
    fromClassId: row.fromClassId,
    toClassId: row.toClassId,
    fromClassName: row.fromClassName,
    toClassName: row.toClassName,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    type: row.type,
    effectiveDate: civilDate(row.effectiveDate),
    reason: row.reason,
    actorName: row.actorName,
    actorMembershipId: row.actorMembershipId,
    requestId: row.requestId,
    recordedAt: row.recordedAt.toISOString(),
  };
}
