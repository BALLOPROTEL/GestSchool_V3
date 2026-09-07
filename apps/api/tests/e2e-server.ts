import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { createPrismaClient } from '@gestschool/database';
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
  ]) {
    const permission = await database.permission.findUniqueOrThrow({ where: { code } });
    await database.rolePermission.create({
      data: {
        tenantId: tenant.id,
        roleId: reader.id,
        permissionId: permission.id,
        scope: ['students.read', 'guardians.read', 'teachers.read'].includes(code)
          ? 'TENANT'
          : 'OWN',
      },
    });
  }
  const create = async (code: 'STUDENT' | 'SCHOOL_ADMIN' | 'VISUAL_READER', activated = true) => {
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
        tenantId: tenant.id,
        userId: user.id,
        roles: { create: { roleId: role.id } },
      },
    });
    return { email, password };
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
      crud: { email: string; password: string };
      locales: { email: string; password: string };
      denied: { email: string; password: string };
    }
  > = {};
  for (const viewport of Object.keys(visual))
    people[viewport] = {
      crud: await create('SCHOOL_ADMIN'),
      locales: await create('SCHOOL_ADMIN'),
      denied: await create('STUDENT'),
    };
  const activation = await create('STUDENT', false);
  const reset = await create('STUDENT');
  const mfa = await create('SCHOOL_ADMIN');
  const metadata = { requestId: randomUUID(), ipAddress: 'e2e-setup', userAgent: 'e2e-setup' };
  const activationToken = await iam.credentials.issue(activation.email, 'ACTIVATION', metadata);
  const resetToken = await iam.credentials.issue(reset.email, 'PASSWORD_RESET', metadata);
  const directory = new URL('../../../.local/', import.meta.url);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(
    new URL('iam-e2e.json', directory),
    JSON.stringify({
      visual,
      studentId: student.id,
      people,
      activation: { ...activation, token: activationToken },
      reset: { ...reset, token: resetToken },
      mfa,
    }),
    { mode: 0o600 },
  );
} finally {
  await database.$disconnect();
  await iam.repository.close();
}
await import('../src/main.js');
