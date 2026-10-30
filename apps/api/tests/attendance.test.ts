import { randomUUID } from 'node:crypto';
import { createPrismaClient } from '@gestschool/database';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { RequestContext } from '../src/modules/iam/domain/context.js';
import { AttendanceDatabase } from '../src/modules/attendance/infrastructure/database.js';
import { PrismaAttendanceRepository } from '../src/modules/attendance/infrastructure/attendance.repository.js';

const database = createPrismaClient(loadInfrastructureConfig().databaseUrl);
const attendanceDatabase = new AttendanceDatabase();
const repository = new PrismaAttendanceRepository(attendanceDatabase);

const createdTenants: string[] = [];

async function fixture() {
  const suffix = randomUUID().slice(0, 8);
  const tenant = await database.tenant.create({
    data: { slug: `attendance-${suffix}`, name: `Attendance ${suffix}` },
  });
  createdTenants.push(tenant.id);
  const user = await database.user.create({
    data: { email: `attendance-${suffix}@example.invalid`, displayName: 'Attendance Admin' },
  });
  const membership = await database.membership.create({
    data: { tenantId: tenant.id, userId: user.id },
  });
  const year = await database.academicYear.create({
    data: {
      tenantId: tenant.id,
      code: `Y-${suffix}`,
      name: '2026-2027',
      startsOn: new Date('2026-09-01T00:00:00.000Z'),
      endsOn: new Date('2027-06-30T00:00:00.000Z'),
      status: 'ACTIVE',
    },
  });
  const level = await database.level.create({
    data: { tenantId: tenant.id, code: `L-${suffix}`, name: 'Sixième' },
  });
  const schoolClass = await database.schoolClass.create({
    data: {
      tenantId: tenant.id,
      academicYearId: year.id,
      levelId: level.id,
      code: `C-${suffix}`,
      name: 'Sixième A',
    },
  });
  const student = await database.student.create({
    data: {
      tenantId: tenant.id,
      matricule: `MAT-${suffix}`,
      firstName: 'Awa',
      lastName: 'Test',
    },
  });
  await database.enrollment.create({
    data: {
      tenantId: tenant.id,
      studentId: student.id,
      schoolClassId: schoolClass.id,
      academicYearId: year.id,
      type: 'NEW',
      status: 'ACTIVE',
      enrolledOn: new Date('2026-09-01T00:00:00.000Z'),
    },
  });
  const context: RequestContext = {
    userId: user.id,
    sessionId: randomUUID(),
    membershipId: membership.id,
    tenantId: tenant.id,
    roles: ['SCHOOL_ADMIN'],
    grants: [
      { permission: 'attendance.read', scope: 'TENANT' },
      { permission: 'attendance.write', scope: 'TENANT' },
    ],
    requestId: randomUUID(),
    ipAddress: '127.0.0.1',
    userAgent: 'attendance-test',
  };
  return { tenant, user, membership, year, level, schoolClass, student, context };
}

beforeEach(async () => {
  for (const tenantId of createdTenants.splice(0)) {
    await database.auditLog.deleteMany({ where: { tenantId } });
    await database.attendanceRecord.deleteMany({ where: { tenantId } });
    await database.enrollmentEvent.deleteMany({ where: { tenantId } });
    await database.enrollment.deleteMany({ where: { tenantId } });
    await database.teachingAssignment.deleteMany({ where: { tenantId } });
    await database.classSubject.deleteMany({ where: { tenantId } });
    await database.studentGuardian.deleteMany({ where: { tenantId } });
    await database.student.deleteMany({ where: { tenantId } });
    await database.teacher.deleteMany({ where: { tenantId } });
    await database.guardian.deleteMany({ where: { tenantId } });
    await database.subject.deleteMany({ where: { tenantId } });
    await database.schoolClass.deleteMany({ where: { tenantId } });
    await database.academicPeriod.deleteMany({ where: { tenantId } });
    await database.level.deleteMany({ where: { tenantId } });
    await database.academicYear.deleteMany({ where: { tenantId } });
    const memberships = await database.membership.findMany({
      where: { tenantId },
      select: { userId: true },
    });
    await database.membershipRole.deleteMany({ where: { tenantId } });
    await database.membership.deleteMany({ where: { tenantId } });
    await database.tenant.delete({ where: { id: tenantId } });
    await database.user.deleteMany({ where: { id: { in: memberships.map((row) => row.userId) } } });
  }
});

afterAll(async () => {
  for (const tenantId of createdTenants.splice(0)) {
    await database.auditLog.deleteMany({ where: { tenantId } });
    await database.attendanceRecord.deleteMany({ where: { tenantId } });
    await database.enrollmentEvent.deleteMany({ where: { tenantId } });
    await database.enrollment.deleteMany({ where: { tenantId } });
    await database.teachingAssignment.deleteMany({ where: { tenantId } });
    await database.classSubject.deleteMany({ where: { tenantId } });
    await database.studentGuardian.deleteMany({ where: { tenantId } });
    await database.student.deleteMany({ where: { tenantId } });
    await database.teacher.deleteMany({ where: { tenantId } });
    await database.guardian.deleteMany({ where: { tenantId } });
    await database.subject.deleteMany({ where: { tenantId } });
    await database.schoolClass.deleteMany({ where: { tenantId } });
    await database.academicPeriod.deleteMany({ where: { tenantId } });
    await database.level.deleteMany({ where: { tenantId } });
    await database.academicYear.deleteMany({ where: { tenantId } });
    const memberships = await database.membership.findMany({
      where: { tenantId },
      select: { userId: true },
    });
    await database.membershipRole.deleteMany({ where: { tenantId } });
    await database.membership.deleteMany({ where: { tenantId } });
    await database.tenant.delete({ where: { id: tenantId } });
    await database.user.deleteMany({ where: { id: { in: memberships.map((row) => row.userId) } } });
  }
  await attendanceDatabase.onModuleDestroy();
  await database.$disconnect();
});

describe('LOT17 attendance repository', () => {
  it('loads, writes and reads history from PostgreSQL', async () => {
    const data = await fixture();
    const initial = await repository.sheet(data.context, {
      classId: data.schoolClass.id,
      date: '2026-10-30',
    });
    expect(initial.students).toHaveLength(1);
    expect(initial.students[0]?.status).toBeNull();

    const saved = await repository.write(data.context, {
      classId: data.schoolClass.id,
      date: '2026-10-30',
      entries: [{ studentId: data.student.id, status: 'ABSENT', note: 'Justificatif attendu' }],
    });
    expect(saved.summary.absent).toBe(1);
    expect(saved.summary.unmarked).toBe(0);

    const history = await repository.history(data.context, {
      studentId: data.student.id,
      page: 1,
      pageSize: 25,
    });
    expect(history.total).toBe(1);
    expect(history.items[0]).toMatchObject({
      studentId: data.student.id,
      classId: data.schoolClass.id,
      status: 'ABSENT',
      note: 'Justificatif attendu',
    });
    expect(history.summary.absent).toBe(1);

    const audit = await database.auditLog.findFirst({
      where: {
        tenantId: data.tenant.id,
        action: 'attendance.sheet.updated',
        entityId: data.schoolClass.id,
      },
    });
    expect(audit).not.toBeNull();
  });

  it('does not expose a class from another tenant', async () => {
    const first = await fixture();
    const second = await fixture();
    await expect(
      repository.sheet(first.context, {
        classId: second.schoolClass.id,
        date: '2026-10-30',
      }),
    ).rejects.toMatchObject({ code: 'ATTENDANCE_NOT_FOUND', status: 404 });
  });
});
