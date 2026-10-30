import { randomUUID } from 'node:crypto';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { createPrismaClient } from '@gestschool/database';
import { afterAll, describe, expect, it } from 'vitest';
import { AttendanceDatabase } from '../src/modules/attendance/infrastructure/database.js';
import { PrismaAttendanceRepository } from '../src/modules/attendance/infrastructure/attendance.repository.js';
import type { RequestContext } from '../src/modules/iam/domain/context.js';

const database = createPrismaClient(loadInfrastructureConfig().databaseUrl);
const attendanceDatabase = new AttendanceDatabase();
const repository = new PrismaAttendanceRepository(attendanceDatabase);

async function fixture() {
  const suffix = randomUUID().slice(0, 8);
  const tenant = await database.tenant.create({
    data: { slug: `attendance-${suffix}`, name: `Attendance ${suffix}` },
  });
  const user = await database.user.create({
    data: {
      email: `attendance-${suffix}@example.invalid`,
      displayName: 'Attendance Admin',
    },
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
  const enrollment = await database.enrollment.create({
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
  await database.enrollmentEvent.create({
    data: {
      tenantId: tenant.id,
      enrollmentId: enrollment.id,
      academicYearId: year.id,
      kind: 'CONFIRMED',
      fromClassId: null,
      toClassId: schoolClass.id,
      fromClassName: null,
      toClassName: schoolClass.name,
      fromStatus: 'PENDING',
      toStatus: 'ACTIVE',
      type: enrollment.type,
      effectiveDate: new Date('2026-09-01T00:00:00.000Z'),
      reason: null,
      actorMembershipId: membership.id,
      actorName: user.displayName,
      requestId: randomUUID(),
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
  return {
    tenant,
    user,
    membership,
    year,
    level,
    schoolClass,
    student,
    enrollment,
    context,
  };
}

afterAll(async () => {
  await attendanceDatabase.onModuleDestroy();
  await database.$disconnect();
});

describe('LOT17 attendance repository', () => {
  it('loads, writes, clears and reads history from PostgreSQL', async () => {
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
      entries: [
        {
          studentId: data.student.id,
          status: 'ABSENT',
          note: 'Justificatif attendu',
        },
      ],
    });
    expect(saved.summary.absent).toBe(1);
    expect(saved.summary.unmarked).toBe(0);

    const history = await repository.history(data.context, {
      studentId: data.student.id,
      page: 1,
      pageSize: 25,
    });
    expect(history.total).toBe(1);
    expect(history.page).toBe(1);
    expect(history.pageSize).toBe(25);
    expect(history.items[0]).toMatchObject({
      studentId: data.student.id,
      classId: data.schoolClass.id,
      status: 'ABSENT',
      note: 'Justificatif attendu',
    });

    const cleared = await repository.write(data.context, {
      classId: data.schoolClass.id,
      date: '2026-10-30',
      entries: [{ studentId: data.student.id, status: null, note: null }],
    });
    expect(cleared.summary.unmarked).toBe(1);
    expect(
      await database.attendanceRecord.count({
        where: { tenantId: data.tenant.id, studentId: data.student.id },
      }),
    ).toBe(0);
    expect(
      (
        await repository.history(data.context, {
          studentId: data.student.id,
          page: 1,
          pageSize: 25,
        })
      ).total,
    ).toBe(0);
  });

  it('preserves historical class membership across a dated transfer', async () => {
    const data = await fixture();
    const targetClass = await database.schoolClass.create({
      data: {
        tenantId: data.tenant.id,
        academicYearId: data.year.id,
        levelId: data.level.id,
        code: `C2-${randomUUID().slice(0, 8)}`,
        name: 'Sixième B',
      },
    });

    await repository.write(data.context, {
      classId: data.schoolClass.id,
      date: '2026-10-30',
      entries: [{ studentId: data.student.id, status: 'PRESENT', note: null }],
    });
    await database.enrollment.update({
      where: {
        tenantId_id: { tenantId: data.tenant.id, id: data.enrollment.id },
      },
      data: { schoolClassId: targetClass.id },
    });
    await database.enrollmentEvent.create({
      data: {
        tenantId: data.tenant.id,
        enrollmentId: data.enrollment.id,
        academicYearId: data.year.id,
        kind: 'TRANSFERRED',
        fromClassId: data.schoolClass.id,
        toClassId: targetClass.id,
        fromClassName: data.schoolClass.name,
        toClassName: targetClass.name,
        fromStatus: 'ACTIVE',
        toStatus: 'ACTIVE',
        type: data.enrollment.type,
        effectiveDate: new Date('2026-11-01T00:00:00.000Z'),
        reason: 'Changement de classe',
        actorMembershipId: data.membership.id,
        actorName: data.user.displayName,
        requestId: randomUUID(),
      },
    });

    const oldBefore = await repository.sheet(data.context, {
      classId: data.schoolClass.id,
      date: '2026-10-30',
    });
    expect(oldBefore.students).toHaveLength(1);
    expect(oldBefore.students[0]?.status).toBe('PRESENT');

    const oldAfter = await repository.sheet(data.context, {
      classId: data.schoolClass.id,
      date: '2026-11-02',
    });
    expect(oldAfter.students).toHaveLength(0);

    const newBefore = await repository.sheet(data.context, {
      classId: targetClass.id,
      date: '2026-10-30',
    });
    expect(newBefore.students).toHaveLength(0);

    const newAfter = await repository.sheet(data.context, {
      classId: targetClass.id,
      date: '2026-11-02',
    });
    expect(newAfter.students).toHaveLength(1);
    expect(newAfter.students[0]?.status).toBeNull();
  });

  it('preserves past attendance after a student is archived', async () => {
    const data = await fixture();
    await repository.write(data.context, {
      classId: data.schoolClass.id,
      date: '2026-10-30',
      entries: [{ studentId: data.student.id, status: 'PRESENT', note: null }],
    });
    await database.student.update({
      where: {
        tenantId_id: { tenantId: data.tenant.id, id: data.student.id },
      },
      data: {
        status: 'ARCHIVED',
        archivedAt: new Date('2026-11-01T00:00:00.000Z'),
      },
    });

    const past = await repository.sheet(data.context, {
      classId: data.schoolClass.id,
      date: '2026-10-30',
    });
    expect(past.students).toHaveLength(1);
    expect(past.students[0]?.status).toBe('PRESENT');

    const afterArchive = await repository.sheet(data.context, {
      classId: data.schoolClass.id,
      date: '2026-11-02',
    });
    expect(afterArchive.students).toHaveLength(0);

    const history = await repository.history(data.context, {
      studentId: data.student.id,
      page: 1,
      pageSize: 25,
    });
    expect(history.total).toBe(1);
    expect(history.items[0]?.status).toBe('PRESENT');
  });

  it('revokes assigned attendance access when the academic assignment is no longer eligible', async () => {
    const data = await fixture();
    const teacherUser = await database.user.create({
      data: {
        email: `teacher-${randomUUID()}@example.invalid`,
        displayName: 'Teacher Test',
      },
    });
    const teacherMembership = await database.membership.create({
      data: { tenantId: data.tenant.id, userId: teacherUser.id },
    });
    const teacher = await database.teacher.create({
      data: {
        tenantId: data.tenant.id,
        userId: teacherUser.id,
        employeeNumber: `EMP-${randomUUID().slice(0, 8)}`,
        firstName: 'Moussa',
        lastName: 'Test',
      },
    });
    const period = await database.academicPeriod.create({
      data: {
        tenantId: data.tenant.id,
        academicYearId: data.year.id,
        name: 'Premier trimestre',
        type: 'TRIMESTER',
        ordinal: 1,
        startsOn: new Date('2026-09-01T00:00:00.000Z'),
        endsOn: new Date('2026-12-18T00:00:00.000Z'),
      },
    });
    const subject = await database.subject.create({
      data: {
        tenantId: data.tenant.id,
        code: `SUB-${randomUUID().slice(0, 8)}`,
        name: 'Mathématiques',
      },
    });
    const classSubject = await database.classSubject.create({
      data: {
        tenantId: data.tenant.id,
        schoolClassId: data.schoolClass.id,
        subjectId: subject.id,
      },
    });
    await database.teachingAssignment.create({
      data: {
        tenantId: data.tenant.id,
        classSubjectId: classSubject.id,
        teacherId: teacher.id,
        academicPeriodId: period.id,
      },
    });
    const teacherContext: RequestContext = {
      ...data.context,
      userId: teacherUser.id,
      membershipId: teacherMembership.id,
      roles: ['TEACHER'],
      grants: [
        { permission: 'attendance.read', scope: 'ASSIGNED' },
        { permission: 'attendance.write', scope: 'ASSIGNED' },
      ],
    };

    expect(
      (
        await repository.sheet(teacherContext, {
          classId: data.schoolClass.id,
          date: '2026-10-30',
        })
      ).students,
    ).toHaveLength(1);

    await database.subject.update({
      where: { tenantId_id: { tenantId: data.tenant.id, id: subject.id } },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    await expect(
      repository.sheet(teacherContext, {
        classId: data.schoolClass.id,
        date: '2026-10-30',
      }),
    ).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN', status: 403 });
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
