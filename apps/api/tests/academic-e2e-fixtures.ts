import { randomUUID } from 'node:crypto';
import type { GestSchoolPrismaClient } from '@gestschool/database';

export async function academicFixture(
  db: GestSchoolPrismaClient,
  tenantId: string,
  teacherEmail?: string,
) {
  const year = await db.academicYear.create({
    data: {
      tenantId,
      code: 'REF-2026',
      name: 'Année témoin',
      startsOn: new Date('2026-09-01'),
      endsOn: new Date('2027-06-30'),
    },
  });
  const period = await db.academicPeriod.create({
    data: {
      tenantId,
      academicYearId: year.id,
      name: 'Trimestre témoin',
      type: 'TRIMESTER',
      ordinal: 1,
      startsOn: new Date('2026-09-01'),
      endsOn: new Date('2026-12-18'),
    },
  });
  const level = await db.level.create({
    data: { tenantId, code: 'REF-6E', name: `Niveau témoin ${'L'.repeat(80)}` },
  });
  const classroom = await db.schoolClass.create({
    data: {
      tenantId,
      academicYearId: year.id,
      levelId: level.id,
      code: 'REF-6E-A',
      name: 'Classe témoin',
      capacity: 36,
    },
  });
  const subject = await db.subject.create({
    data: { tenantId, code: 'REF-MATH', name: 'Matière témoin' },
  });
  const link = await db.classSubject.create({
    data: { tenantId, schoolClassId: classroom.id, subjectId: subject.id, coefficient: '4.00' },
  });
  const user = teacherEmail
    ? await db.user.findUniqueOrThrow({ where: { email: teacherEmail } })
    : null;
  const teacher = await db.teacher.create({
    data: {
      tenantId,
      employeeNumber: `REF-${randomUUID()}`,
      firstName: 'Enseignant',
      lastName: 'Témoin',
      userId: user?.id ?? null,
    },
  });
  await db.teachingAssignment.create({
    data: { tenantId, classSubjectId: link.id, academicPeriodId: period.id, teacherId: teacher.id },
  });
  return { classId: classroom.id, yearId: year.id, teacherName: 'Enseignant Témoin' };
}
