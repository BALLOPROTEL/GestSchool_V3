import { randomUUID } from 'node:crypto';
import type { GestSchoolPrismaClient } from '@gestschool/database';
import { loadInfrastructureConfig } from '@gestschool/config/environment';

// Called exclusively by the explicit local access command; no production seed or HTTP route.
export async function prepareAcademicDemo(
  database: GestSchoolPrismaClient,
  tenantId: string,
  renewCompletedStudent = false,
) {
  if (
    process.env['IAM_ENV'] !== 'local' ||
    !['development', 'test'].includes(process.env['NODE_ENV'] ?? '') ||
    !['localhost', '127.0.0.1', '[::1]'].includes(
      new URL(loadInfrastructureConfig().databaseUrl).hostname,
    )
  )
    throw new Error('Academic demo requires a local/test database');
  return database.$transaction(async (db) => {
    await db.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId}::uuid FOR UPDATE`;
    const teacher = await db.teacher.findFirstOrThrow({
      where: { tenantId, status: 'ACTIVE', user: { email: 'teacher@example.invalid' } },
    });
    let calendarYear = new Date().getUTCFullYear();
    let existing = await db.academicYear.findFirst({
      where: {
        tenantId,
        code: { startsWith: 'DEV-ACADEMIC-' },
        status: { in: ['DRAFT', 'ACTIVE'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing && renewCompletedStudent) {
      const enrollment = await db.enrollment.findFirst({
        where: {
          tenantId,
          academicYearId: existing.id,
          student: { user: { email: 'student@example.invalid' } },
          status: { in: ['COMPLETED', 'WITHDRAWN', 'TRANSFERRED'] },
        },
      });
      if (enrollment) {
        // A user-completed demo is historical: create a following cycle, never reopen it.
        calendarYear = Math.max(calendarYear, existing.endsOn.getUTCFullYear());
        existing = null;
      }
    }
    const year =
      existing ??
      (await db.academicYear.create({
        data: {
          tenantId,
          code: `DEV-ACADEMIC-${randomUUID().slice(0, 8)}`,
          name: `Démo académique ${calendarYear}–${calendarYear + 1}`,
          startsOn: new Date(`${calendarYear}-09-01`),
          endsOn: new Date(`${calendarYear + 1}-06-30`),
          status: (await db.academicYear.count({ where: { tenantId, status: 'ACTIVE' } }))
            ? 'DRAFT'
            : 'ACTIVE',
        },
      }));
    // Existing fixture edits and archived structures are preserved. A closed year is never reopened.
    if (existing) return { academicYearId: year.id, created: false };
    const suffix = year.code.slice(-8);
    const level = await db.level.create({
      data: { tenantId, code: `DEV-6E-${suffix}`, name: 'Sixième — Démo', position: 1 },
    });
    const classroom = await db.schoolClass.create({
      data: {
        tenantId,
        academicYearId: year.id,
        levelId: level.id,
        code: 'DEMO-6E-A',
        name: 'Sixième A — Démo',
        capacity: 36,
      },
    });
    const subject = await db.subject.create({
      data: { tenantId, code: `DEV-MATH-${suffix}`, name: 'Mathématiques — Démo' },
    });
    const link = await db.classSubject.create({
      data: { tenantId, schoolClassId: classroom.id, subjectId: subject.id, coefficient: 4 },
    });
    const periods = [
      { ordinal: 1, startsOn: `${calendarYear}-09-01`, endsOn: `${calendarYear}-12-18` },
      { ordinal: 2, startsOn: `${calendarYear + 1}-01-04`, endsOn: `${calendarYear + 1}-03-26` },
      { ordinal: 3, startsOn: `${calendarYear + 1}-04-05`, endsOn: `${calendarYear + 1}-06-30` },
    ];
    for (const data of periods) {
      const period = await db.academicPeriod.create({
        data: {
          tenantId,
          academicYearId: year.id,
          name: `Trimestre ${data.ordinal} — Démo`,
          type: 'TRIMESTER',
          ordinal: data.ordinal,
          startsOn: new Date(data.startsOn),
          endsOn: new Date(data.endsOn),
        },
      });
      await db.teachingAssignment.create({
        data: {
          tenantId,
          classSubjectId: link.id,
          teacherId: teacher.id,
          academicPeriodId: period.id,
        },
      });
    }
    await db.iamAuditLog.create({
      data: {
        tenantId,
        requestId: randomUUID(),
        action: 'dev.academics.prepared',
        subjectId: year.id,
      },
    });
    return { academicYearId: year.id, created: true };
  });
}
