import { loadInfrastructureConfig } from '@gestschool/config/environment';

import { createPrismaClient } from '../src/client.js';
import { seedIam } from './iam-seed.js';

const config = loadInfrastructureConfig();
const prisma = createPrismaClient(config.databaseUrl);

await prisma.$transaction(async (database) => {
  const tenant = await database.tenant.upsert({
    where: { slug: 'ecole-demo-locale' },
    update: { name: 'École Démo Locale' },
    create: { slug: 'ecole-demo-locale', name: 'École Démo Locale' },
  });

  await database.tenantSetting.upsert({
    where: { tenantId: tenant.id },
    update: { values: { seedVersion: 1 } },
    create: { tenantId: tenant.id, values: { seedVersion: 1 } },
  });

  const permissionDefinitions = [
    ['students.read', 'Consulter les élèves'],
    ['grades.manage', 'Gérer les notes'],
    ['finance.read', 'Consulter les données financières'],
  ] as const;
  await Promise.all(
    permissionDefinitions.map(([code, description]) =>
      database.permission.upsert({
        where: { code },
        update: { description },
        create: { code, description },
      }),
    ),
  );

  const roleDefinitions = [
    ['SCHOOL_ADMIN', 'Administration scolaire'],
    ['TEACHER', 'Enseignant'],
  ] as const;
  let adminRoleId: string | undefined;

  for (const [code, name] of roleDefinitions) {
    const existingRole = await database.role.findFirst({ where: { tenantId: null, code } });
    const role = existingRole
      ? await database.role.update({ where: { id: existingRole.id }, data: { name } })
      : await database.role.create({
          data: { code, name, scope: 'SYSTEM', isSystem: true },
        });

    if (code === 'SCHOOL_ADMIN') adminRoleId = role.id;
  }

  if (!adminRoleId) throw new Error('Unable to seed the SCHOOL_ADMIN role');

  const user = await database.user.upsert({
    where: { email: 'admin@gestschool.invalid' },
    update: { displayName: 'Compte Démo GestSchool' },
    create: {
      email: 'admin@gestschool.invalid',
      displayName: 'Compte Démo GestSchool',
    },
  });
  const membership = await database.membership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    update: {},
    create: { tenantId: tenant.id, userId: user.id },
  });

  await database.membershipRole.upsert({
    where: { membershipId_roleId: { membershipId: membership.id, roleId: adminRoleId } },
    update: {},
    create: { tenantId: tenant.id, membershipId: membership.id, roleId: adminRoleId },
  });

  const academicYear = await database.academicYear.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: '2026-2027' } },
    update: { status: 'ACTIVE' },
    create: {
      tenantId: tenant.id,
      code: '2026-2027',
      name: 'Année 2026-2027',
      startsOn: new Date('2026-09-01T00:00:00.000Z'),
      endsOn: new Date('2027-06-30T00:00:00.000Z'),
      status: 'ACTIVE',
    },
  });

  await database.academicPeriod.upsert({
    where: {
      tenantId_academicYearId_ordinal: {
        tenantId: tenant.id,
        academicYearId: academicYear.id,
        ordinal: 1,
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      academicYearId: academicYear.id,
      name: 'Premier trimestre',
      type: 'TRIMESTER',
      ordinal: 1,
      startsOn: new Date('2026-09-01T00:00:00.000Z'),
      endsOn: new Date('2026-12-18T00:00:00.000Z'),
    },
  });

  const level = await database.level.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: '6E' } },
    update: { name: 'Sixième' },
    create: { tenantId: tenant.id, code: '6E', name: 'Sixième', position: 1 },
  });
  const schoolClass = await database.schoolClass.upsert({
    where: {
      tenantId_academicYearId_code: {
        tenantId: tenant.id,
        academicYearId: academicYear.id,
        code: '6E-A',
      },
    },
    update: { name: 'Sixième A' },
    create: {
      tenantId: tenant.id,
      academicYearId: academicYear.id,
      levelId: level.id,
      code: '6E-A',
      name: 'Sixième A',
      capacity: 36,
    },
  });
  const subject = await database.subject.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'MATH' } },
    update: { name: 'Mathématiques' },
    create: { tenantId: tenant.id, code: 'MATH', name: 'Mathématiques' },
  });

  await database.classSubject.upsert({
    where: {
      tenantId_schoolClassId_subjectId: {
        tenantId: tenant.id,
        schoolClassId: schoolClass.id,
        subjectId: subject.id,
      },
    },
    update: { coefficient: 4 },
    create: {
      tenantId: tenant.id,
      schoolClassId: schoolClass.id,
      subjectId: subject.id,
      coefficient: 4,
    },
  });

  const student = await database.student.upsert({
    where: {
      tenantId_matricule: { tenantId: tenant.id, matricule: 'MAT-2026-000001' },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      matricule: 'MAT-2026-000001',
      firstName: 'Awa',
      lastName: 'Démo',
    },
  });
  const guardian = await database.guardian.upsert({
    where: {
      tenantId_guardianReference: {
        tenantId: tenant.id,
        guardianReference: 'GRD-2026-000001',
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      guardianReference: 'GRD-2026-000001',
      firstName: 'Parent',
      lastName: 'Démo',
    },
  });

  await database.studentGuardian.upsert({
    where: {
      tenantId_studentId_guardianId: {
        tenantId: tenant.id,
        studentId: student.id,
        guardianId: guardian.id,
      },
    },
    update: { isPrimary: true },
    create: {
      tenantId: tenant.id,
      studentId: student.id,
      guardianId: guardian.id,
      relationship: 'Responsable légal',
      isPrimary: true,
    },
  });

  await database.teacher.upsert({
    where: {
      tenantId_employeeNumber: {
        tenantId: tenant.id,
        employeeNumber: 'EMP-2026-000001',
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      employeeNumber: 'EMP-2026-000001',
      firstName: 'Moussa',
      lastName: 'Démo',
    },
  });
});

await seedIam(prisma);
await prisma.$disconnect();
process.stdout.write('GestSchool local seed completed\n');
