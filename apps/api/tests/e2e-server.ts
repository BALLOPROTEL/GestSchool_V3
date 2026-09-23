import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { createPrismaClient } from '@gestschool/database';
import {
  academicReadPermissions,
  financeReadPermissions,
  resultPublishedPermissions,
} from '@gestschool/contracts';
import { academicFixture } from './academic-e2e-fixtures.js';
import { enrollmentFixture } from './enrollment-e2e-fixtures.js';
import { prepareFinanceDemo } from '../src/modules/finance/finance.dev.js';
import { prepareResultsDemo } from '../src/modules/grades/grades.dev.js';
import { IamRuntime } from '../src/modules/iam/infrastructure/iam-runtime.js';
import { loadIamConfig } from '../src/modules/iam/infrastructure/iam-config.js';
import { opaqueToken } from '../src/modules/iam/infrastructure/crypto.js';

const config = loadIamConfig();
if (!config.local || process.env['NODE_ENV'] !== 'test')
  throw new Error('E2E fixtures require local IAM and NODE_ENV=test');
const infrastructure = loadInfrastructureConfig();
const database = createPrismaClient(infrastructure.databaseUrl);
const iam = new IamRuntime(config, infrastructure.databaseUrl, infrastructure.redisUrl);
const password = `E2E passphrase ${opaqueToken()}`;
try {
  const passwordHash = await iam.passwords.hash(password);
  const tenant = await database.tenant.create({
    data: { slug: `iam-e2e-${randomUUID()}`, name: 'École E2E' },
  });
  // Explicit read-only fixture role: real tenant grants, no administrative CRUD or MFA bypass.
  const reader = await database.role.create({
    data: {
      tenantId: tenant.id,
      scope: 'TENANT',
      code: 'VISUAL_READER',
      name: 'Visual certification reader',
    },
  });
  for (const code of [
    'session.read',
    'session.revoke',
    'membership.read',
    'tenant.switch',
    'mfa.manage',
    'students.read',
    'guardians.read',
    'teachers.read',
    'enrollments.read',
    ...academicReadPermissions,
    ...financeReadPermissions,
    ...resultPublishedPermissions,
  ]) {
    const permission = await database.permission.findUniqueOrThrow({ where: { code } });
    await database.rolePermission.create({
      data: {
        tenantId: tenant.id,
        roleId: reader.id,
        permissionId: permission.id,
        scope: [
          'students.read',
          'guardians.read',
          'teachers.read',
          'enrollments.read',
          ...academicReadPermissions,
          ...financeReadPermissions,
          ...resultPublishedPermissions,
        ].includes(code)
          ? 'TENANT'
          : 'OWN',
      },
    });
  }
  const create = async (
    code:
      | 'STUDENT'
      | 'SCHOOL_ADMIN'
      | 'DIRECTOR'
      | 'VISUAL_READER'
      | 'TEACHER'
      | 'PARENT'
      | 'ACCOUNTANT',
    activated = true,
    tenantId = tenant.id,
    preEnrollMfa = false,
  ) => {
    const email = `${randomUUID()}@example.invalid`;
    const role =
      code === 'VISUAL_READER'
        ? reader
        : await database.role.findFirstOrThrow({ where: { code, tenantId: null } });
    const user = await database.user.create({
      data: {
        email,
        displayName: 'Utilisateur E2E',
        identity: { create: activated ? { passwordHash, activatedAt: new Date() } : {} },
      },
    });
    await database.membership.create({
      data: {
        tenantId,
        userId: user.id,
        roles: { create: { roleId: role.id } },
      },
    });
    const mfa = preEnrollMfa ? iam.crypto.newTotp() : undefined;
    if (mfa) await iam.repository.setMfa(user.id, iam.crypto.encrypt(mfa.secret, user.id), -1n);
    return { email, password, ...(mfa ? { mfaSecret: mfa.secret } : {}) };
  };
  const visual: Record<string, { email: string; password: string }> = {};
  for (const viewport of [
    '360x800',
    '414x896',
    '768x1024',
    '1024x768',
    '1366x768',
    '1440x900',
    '1920x1080',
  ])
    visual[viewport] = await create('VISUAL_READER');
  const student = await database.student.create({
    data: {
      tenantId: tenant.id,
      matricule: 'VISUAL-001',
      firstName: 'Aminata',
      lastName: 'Diallo',
      birthDate: new Date('2010-03-15'),
    },
  });
  const guardian = await database.guardian.create({
    data: {
      tenantId: tenant.id,
      guardianReference: 'VISUAL-PAR-001',
      firstName: 'Mariam',
      lastName: 'Diallo',
      email: 'visual-parent@example.invalid',
    },
  });
  await database.studentGuardian.create({
    data: {
      tenantId: tenant.id,
      studentId: student.id,
      guardianId: guardian.id,
      relationship: 'parent',
      isPrimary: true,
    },
  });
  await database.teacher.create({
    data: {
      tenantId: tenant.id,
      employeeNumber: 'VISUAL-EMP-001',
      firstName: 'Moussa',
      lastName: 'Koné',
    },
  });
  const people: Record<
    string,
    {
      crud: { email: string; password: string; mfaSecret?: string };
      locales: { email: string; password: string; mfaSecret?: string };
      denied: { email: string; password: string };
    }
  > = {};
  for (const viewport of Object.keys(visual))
    people[viewport] = {
      // Deterministic reusable TEST identities; production MFA still verifies real TOTP codes.
      crud: await create('SCHOOL_ADMIN', true, tenant.id, true),
      locales: await create('SCHOOL_ADMIN', true, tenant.id, true),
      denied: await create('STUDENT'),
    };
  await academicFixture(database, tenant.id);
  const academics: Record<
    string,
    {
      crud: { email: string; password: string };
      locales: { email: string; password: string };
      teacher: { email: string; password: string };
      classId: string;
      yearId: string;
      teacherName: string;
    }
  > = {};
  for (const viewport of Object.keys(visual)) {
    const academicTenant = await database.tenant.create({
      data: { slug: `academic-e2e-${randomUUID()}`, name: 'École académique E2E' },
    });
    const teacher = await create('TEACHER', true, academicTenant.id);
    academics[viewport] = {
      crud: await create('SCHOOL_ADMIN', true, academicTenant.id),
      locales: await create('SCHOOL_ADMIN', true, academicTenant.id),
      teacher,
      ...(await academicFixture(database, academicTenant.id, teacher.email)),
    };
  }
  const enrollments: Record<
    string,
    Awaited<ReturnType<typeof enrollmentFixture>> & {
      crud: { email: string; password: string };
      locales: { email: string; password: string };
      student: { email: string; password: string };
      parent: { email: string; password: string };
      denied: { email: string; password: string };
    }
  > = {};
  for (const viewport of Object.keys(visual)) {
    const enrollmentTenant = await database.tenant.create({
      data: { slug: `enrollment-e2e-${randomUUID()}`, name: 'École inscriptions E2E' },
    });
    const crud = await create('SCHOOL_ADMIN', true, enrollmentTenant.id);
    const studentAccount = await create('STUDENT', true, enrollmentTenant.id);
    const parent = await create('PARENT', true, enrollmentTenant.id);
    enrollments[viewport] = {
      crud,
      student: studentAccount,
      parent,
      locales: await create('SCHOOL_ADMIN', true, enrollmentTenant.id),
      denied: await create('TEACHER', true, enrollmentTenant.id),
      ...(await enrollmentFixture(
        database,
        enrollmentTenant.id,
        crud.email,
        studentAccount.email,
        parent.email,
      )),
    };
  }
  const finance: Record<
    string,
    Awaited<ReturnType<typeof enrollmentFixture>> & {
      accountant: { email: string; password: string };
      locales: { email: string; password: string };
      parent: { email: string; password: string };
      student: { email: string; password: string };
      teacher: { email: string; password: string };
      invoiceIds: string[];
      scheduleId: string;
      cashSessionId: string;
    }
  > = {};
  for (const viewport of [...Object.keys(visual), 'workflow-360x800', 'workflow-1440x900']) {
    const financialTenant = await database.tenant.create({
      data: { slug: `finance-e2e-${randomUUID()}`, name: 'École Finance E2E' },
    });
    const administrator = await create('SCHOOL_ADMIN', true, financialTenant.id);
    const accountant = await create('ACCOUNTANT', true, financialTenant.id),
      studentAccount = await create('STUDENT', true, financialTenant.id),
      parent = await create('PARENT', true, financialTenant.id);
    const graph = await enrollmentFixture(
      database,
      financialTenant.id,
      administrator.email,
      studentAccount.email,
      parent.email,
    );
    const demo = await prepareFinanceDemo(
      database,
      financialTenant.id,
      accountant.email,
      studentAccount.email,
    );
    if (!demo.created || !demo.invoiceIds || !demo.scheduleId || !demo.cashSessionId)
      throw new Error('Missing Finance E2E fixture');
    finance[viewport] = {
      ...graph,
      accountant,
      student: studentAccount,
      parent,
      locales: await create('ACCOUNTANT', true, financialTenant.id),
      teacher: await create('TEACHER', true, financialTenant.id),
      invoiceIds: demo.invoiceIds,
      scheduleId: demo.scheduleId,
      cashSessionId: demo.cashSessionId,
    };
  }
  const results: Record<
    string,
    Extract<Awaited<ReturnType<typeof prepareResultsDemo>>, { created: true }> & {
      teacher: { email: string; password: string };
      director: { email: string; password: string };
      parent: { email: string; password: string };
      student: { email: string; password: string };
      accountant: { email: string; password: string };
    }
  > = {};
  for (const viewport of [...Object.keys(visual), 'workflow-360x800', 'workflow-1440x900']) {
    const resultTenant = await database.tenant.create({
      data: { slug: `results-e2e-${randomUUID()}`, name: 'École Résultats E2E' },
    });
    const administrator = await create('SCHOOL_ADMIN', true, resultTenant.id);
    const director = await create('DIRECTOR', true, resultTenant.id),
      teacher = await create('TEACHER', true, resultTenant.id),
      parent = await create('PARENT', true, resultTenant.id),
      studentAccount = await create('STUDENT', true, resultTenant.id),
      accountant = await create('ACCOUNTANT', true, resultTenant.id);
    await enrollmentFixture(
      database,
      resultTenant.id,
      administrator.email,
      studentAccount.email,
      parent.email,
    );
    const demo = await prepareResultsDemo(database, resultTenant.id, {
      teacher: teacher.email,
      validator: director.email,
      student: studentAccount.email,
    });
    if (!demo.created) throw new Error('Missing Results E2E fixture');
    results[viewport] = { ...demo, director, teacher, parent, student: studentAccount, accountant };
  }
  const documents: Record<
    string,
    {
      admin: Awaited<ReturnType<typeof create>>;
      accountant: Awaited<ReturnType<typeof create>>;
      parent: Awaited<ReturnType<typeof create>>;
      student: Awaited<ReturnType<typeof create>>;
      studentId: string;
      enrollmentId: string;
      otherEnrollmentId: string;
      reportId: string;
      receiptId: string;
    }
  > = {};
  for (const viewport of Object.keys(visual)) {
    const documentTenant = await database.tenant.create({
      data: { slug: `documents-e2e-${randomUUID()}`, name: 'École Documents E2E' },
    });
    const admin = await create('SCHOOL_ADMIN', true, documentTenant.id, true),
      accountant = await create('ACCOUNTANT', true, documentTenant.id, true),
      teacher = await create('TEACHER', true, documentTenant.id),
      parent = await create('PARENT', true, documentTenant.id),
      documentStudent = await create('STUDENT', true, documentTenant.id);
    const enrollment = await enrollmentFixture(
      database,
      documentTenant.id,
      admin.email,
      documentStudent.email,
      parent.email,
    );
    await database.academicYear.update({
      where: { id: enrollment.yearId },
      data: { status: 'ACTIVE' },
    });
    const documentResults = await prepareResultsDemo(database, documentTenant.id, {
      teacher: teacher.email,
      validator: admin.email,
      student: documentStudent.email,
    });
    if (!documentResults.created || !documentResults.reportIds[0])
      throw new Error('Missing published document source');
    await prepareFinanceDemo(database, documentTenant.id, accountant.email, documentStudent.email);
    const receipt = await database.receipt.findFirstOrThrow({
      where: {
        tenantId: documentTenant.id,
        payment: { studentId: enrollment.ownStudentId, status: 'COMPLETED' },
      },
    });
    documents[viewport] = {
      admin,
      accountant,
      parent,
      student: documentStudent,
      studentId: enrollment.ownStudentId,
      enrollmentId: enrollment.ownEnrollmentId,
      otherEnrollmentId: enrollment.otherEnrollmentId,
      reportId: documentResults.reportIds[0],
      receiptId: receipt.id,
    };
  }
  const messaging: Record<
    string,
    {
      admin: Awaited<ReturnType<typeof create>>;
      teacher: Awaited<ReturnType<typeof create>>;
      parent: Awaited<ReturnType<typeof create>>;
      student: Awaited<ReturnType<typeof create>>;
      studentId: string;
      unassignedStudentId: string;
      classId: string;
    }
  > = {};
  for (const viewport of Object.keys(visual)) {
    const messagingTenant = await database.tenant.create({
      data: { slug: `messaging-e2e-${randomUUID()}`, name: 'École Messagerie E2E' },
    });
    const admin = await create('SCHOOL_ADMIN', true, messagingTenant.id, true);
    const teacher = await create('TEACHER', true, messagingTenant.id, true);
    const parent = await create('PARENT', true, messagingTenant.id, true);
    const studentAccount = await create('STUDENT', true, messagingTenant.id, true);
    const academic = await academicFixture(database, messagingTenant.id, teacher.email);
    const studentUser = await database.user.findUniqueOrThrow({
      where: { email: studentAccount.email },
    });
    const parentUser = await database.user.findUniqueOrThrow({ where: { email: parent.email } });
    const messagingStudent = await database.student.create({
      data: {
        tenantId: messagingTenant.id,
        userId: studentUser.id,
        matricule: `MSG-${randomUUID()}`,
        firstName: 'Élève',
        lastName: 'Messagerie',
      },
    });
    const messagingGuardian = await database.guardian.create({
      data: {
        tenantId: messagingTenant.id,
        userId: parentUser.id,
        guardianReference: `MSG-${randomUUID()}`,
        firstName: 'Parent',
        lastName: 'Messagerie',
        email: parent.email,
      },
    });
    await database.studentGuardian.create({
      data: {
        tenantId: messagingTenant.id,
        studentId: messagingStudent.id,
        guardianId: messagingGuardian.id,
        relationship: 'parent',
        isPrimary: true,
        receivesNotifications: true,
      },
    });
    await database.enrollment.create({
      data: {
        tenantId: messagingTenant.id,
        studentId: messagingStudent.id,
        schoolClassId: academic.classId,
        academicYearId: academic.yearId,
        type: 'NEW',
        status: 'ACTIVE',
        enrolledOn: new Date('2026-09-01'),
      },
    });
    const unassigned = await database.student.create({
      data: {
        tenantId: messagingTenant.id,
        matricule: `MSG-OTHER-${randomUUID().slice(-20)}`,
        firstName: 'Hors',
        lastName: 'Affectation',
      },
    });
    for (const email of [parent.email, studentAccount.email]) {
      const membership = await database.membership.findFirstOrThrow({
        where: { tenantId: messagingTenant.id, user: { email } },
      });
      await database.notification.createMany({
        data: [
          {
            tenantId: messagingTenant.id,
            membershipId: membership.id,
            type: 'finance.payment.validated.v1',
            title: 'Paiement validé',
            body: 'Votre paiement a été validé.',
          },
          {
            tenantId: messagingTenant.id,
            membershipId: membership.id,
            type: 'report_card.published.v1',
            title: 'Bulletin disponible',
            body: 'Votre bulletin est disponible dans GestSchool.',
          },
          {
            tenantId: messagingTenant.id,
            membershipId: membership.id,
            type: 'documents.ready.v1',
            title: 'Document disponible',
            body: 'Votre document est disponible dans GestSchool.',
          },
        ],
      });
    }
    const adminMembership = await database.membership.findFirstOrThrow({
      where: { tenantId: messagingTenant.id, user: { email: admin.email } },
    });
    await database.message.create({
      data: {
        tenantId: messagingTenant.id,
        senderMembershipId: adminMembership.id,
        channel: 'IN_APP',
        category: 'SCHOOL',
        templateKey: 'manual.school_notice',
        templateVersion: 1,
        eventType: 'communications.manual.requested.v1',
        locale: 'fr',
        provider: 'IN_APP',
        recipientMasked: 'In-app',
        subject: 'Historique réel E2E',
        body: 'Communication de certification.',
        status: 'DELIVERED',
        attempts: 1,
        sentAt: new Date(),
        deliveredAt: new Date(),
      },
    });
    messaging[viewport] = {
      admin,
      teacher,
      parent,
      student: studentAccount,
      studentId: messagingStudent.id,
      unassignedStudentId: unassigned.id,
      classId: academic.classId,
    };
  }
  const mfa = await create('SCHOOL_ADMIN');
  const directory = new URL('../../../.local/', import.meta.url);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(
    new URL('iam-e2e.json', directory),
    JSON.stringify({
      visual,
      studentId: student.id,
      people,
      academics,
      enrollments,
      finance,
      results,
      documents,
      messaging,
      mfa,
    }),
    { mode: 0o600 },
  );
} finally {
  await database.$disconnect();
  await iam.repository.close();
}
await import('../src/main.js');
