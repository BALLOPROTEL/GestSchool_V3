import 'reflect-metadata';
import { mkdir, open, chmod } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { createPrismaClient } from '@gestschool/database';
import { privilegedRoles, type LoginResult, type SystemRole } from '@gestschool/contracts';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { AppModule } from '../../../app.module.js';
import { configureIamHttp } from '../presentation/http/security.js';
import { loadIamConfig } from './iam-config.js';
import { IamRuntime } from './iam-runtime.js';
import { opaqueToken } from './crypto.js';
import { prepareAcademicDemo } from '../../academics/infrastructure/dev-fixtures.js';
import { prepareEnrollmentDemo } from '../../enrollments/infrastructure/dev-fixtures.js';
import { prepareFinanceDemo } from '../../finance/finance.dev.js';
import { prepareResultsDemo } from '../../grades/grades.dev.js';

const config = loadIamConfig();
const infrastructure = loadInfrastructureConfig();
if (
  !config.local ||
  !['development', 'test'].includes(process.env['NODE_ENV'] ?? '') ||
  !['localhost', '127.0.0.1', '[::1]'].includes(new URL(infrastructure.databaseUrl).hostname)
)
  throw new Error(
    'DEV access requires IAM_ENV=local, NODE_ENV=development|test and a loopback PostgreSQL host',
  );
const roles: readonly SystemRole[] = [
  'SCHOOL_ADMIN',
  'DIRECTOR',
  'ACADEMIC_STAFF',
  'ACCOUNTANT',
  'TEACHER',
  'PARENT',
  'STUDENT',
];
const database = createPrismaClient(infrastructure.databaseUrl);
const app = await NestFactory.create(AppModule, { logger: false });
configureIamHttp(app);
const iam = app.get(IamRuntime);
interface Access {
  role: SystemRole;
  email: string;
  password: string;
  mfaRequired: boolean;
  mfaSecret?: string;
  mfaUri?: string;
  loginVerified: boolean;
}
const accounts: Access[] = [];
try {
  const tenant = await database.tenant.findUniqueOrThrow({ where: { slug: 'ecole-demo-locale' } });
  await database.tenant.update({ where: { id: tenant.id }, data: { status: 'ACTIVE' } });
  for (const role of roles) {
    const email = `${role.toLowerCase().replaceAll('_', '-')}@example.invalid`;
    const password = opaqueToken();
    const passwordHash = await iam.passwords.hash(password);
    const mfa = privilegedRoles.includes(role) ? iam.crypto.newTotp() : null;
    await database.$transaction(async (db) => {
      const user = await db.user.upsert({
        where: { email },
        update: { disabledAt: null },
        create: { email, displayName: `Démo ${role}` },
      });
      await db.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
      const identity = {
        passwordHash,
        activatedAt: new Date(),
        passwordChangedAt: new Date(),
        mfaSecret: mfa ? iam.crypto.encrypt(mfa.secret, user.id) : null,
        mfaEnabledAt: mfa ? new Date() : null,
        mfaLastCounter: -1n,
      };
      await db.authIdentity.upsert({
        where: { userId: user.id },
        update: identity,
        create: { userId: user.id, ...identity },
      });
      await db.session.updateMany({
        where: { userId: user.id, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      await db.authToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      const membership = await db.membership.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
        update: { status: 'ACTIVE' },
        create: { tenantId: tenant.id, userId: user.id },
      });
      const systemRole = await db.role.findFirstOrThrow({ where: { code: role, tenantId: null } });
      await db.membershipRole.deleteMany({
        where: { membershipId: membership.id, tenantId: tenant.id },
      });
      await db.membershipRole.create({
        data: { membershipId: membership.id, roleId: systemRole.id, tenantId: tenant.id },
      });
      if (role === 'STUDENT')
        await db.student.upsert({
          where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
          update: { status: 'ACTIVE', archivedAt: null },
          create: {
            tenantId: tenant.id,
            userId: user.id,
            matricule: 'DEMO-STUDENT',
            firstName: 'Élève',
            lastName: 'Démo',
          },
        });
      if (role === 'PARENT')
        await db.guardian.upsert({
          where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
          update: { status: 'ACTIVE', archivedAt: null },
          create: {
            tenantId: tenant.id,
            userId: user.id,
            guardianReference: 'DEMO-PARENT',
            firstName: 'Parent',
            lastName: 'Démo',
            email,
          },
        });
      if (role === 'TEACHER')
        await db.teacher.upsert({
          where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
          update: { status: 'ACTIVE', archivedAt: null },
          create: {
            tenantId: tenant.id,
            userId: user.id,
            employeeNumber: 'DEMO-TEACHER',
            firstName: 'Enseignant',
            lastName: 'Démo',
          },
        });
      await db.iamAuditLog.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          subjectId: user.id,
          requestId: randomUUID(),
          action: 'dev.access.reset',
        },
      });
    });
    accounts.push({
      role,
      email,
      password,
      mfaRequired: Boolean(mfa),
      ...(mfa ? { mfaSecret: mfa.secret, mfaUri: mfa.uri } : {}),
      loginVerified: false,
    });
  }
  const student = await database.student.findFirstOrThrow({
    where: { tenantId: tenant.id, user: { email: 'student@example.invalid' } },
  });
  const guardian = await database.guardian.findFirstOrThrow({
    where: { tenantId: tenant.id, user: { email: 'parent@example.invalid' } },
  });
  await database.studentGuardian.upsert({
    where: {
      tenantId_studentId_guardianId: {
        tenantId: tenant.id,
        studentId: student.id,
        guardianId: guardian.id,
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      studentId: student.id,
      guardianId: guardian.id,
      relationship: 'parent',
      isPrimary: true,
    },
  });
  // Real HTTP authentication with the same global guards, Redis limiter and MFA as normal login.
  const academicDemo = await prepareAcademicDemo(database, tenant.id, true);
  const enrollmentDemo = await prepareEnrollmentDemo(database, tenant.id);
  await prepareFinanceDemo(database, tenant.id);
  await prepareResultsDemo(database, tenant.id);
  process.stdout.write(
    `Enrollment demo ${enrollmentDemo.created ? 'created' : 'preserved'}: ${enrollmentDemo.academicYearId}\n`,
  );
  process.stdout.write(
    `Academic demo ${academicDemo.created ? 'created' : 'preserved'}: ${academicDemo.academicYearId}\n`,
  );
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  for (const account of accounts) {
    const csrf = await fetch(`${base}/api/v1/auth/csrf`);
    const state = (await csrf.json()) as { csrfToken: string };
    const cookies = new Map<string, string>();
    const remember = (response: Response) => {
      for (const raw of response.headers.getSetCookie()) {
        const pair = raw.split(';')[0];
        if (pair) {
          const at = pair.indexOf('=');
          cookies.set(pair.slice(0, at), pair.slice(at + 1));
        }
      }
    };
    remember(csrf);
    const send = async (path: string, body: unknown, accessToken?: string) => {
      const response = await fetch(`${base}/api/v1/auth/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: config.origins[0] ?? 'http://localhost:3000',
          'X-CSRF-Token': state.csrfToken,
          Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(body),
      });
      remember(response);
      if (!response.ok)
        throw new Error(`DEV login check failed for ${account.role}: HTTP ${response.status}`);
      return (await response.json()) as LoginResult;
    };
    let result = await send('login', { email: account.email, password: account.password });
    if (account.mfaRequired) {
      if (result.kind !== 'mfa' || !account.mfaSecret || result.enrollmentRequired)
        throw new Error('MFA policy check failed');
      result = await send('mfa/verify', {
        challenge: result.challenge,
        code: iam.crypto.totp(account.mfaSecret).generate(),
      });
    }
    if (
      result.kind !== 'session' ||
      !result.session.roles.includes(account.role) ||
      result.session.tenant.id !== tenant.id
    )
      throw new Error('DEV session/role/tenant check failed');
    account.loginVerified = true;
    await send('logout', {}, result.accessToken);
  }
  const directory = new URL('../../../../../../.local/', import.meta.url);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const file = await open(new URL('test-access.json', directory), 'w', 0o600);
  try {
    await file.chmod(0o600);
    await file.writeFile(
      JSON.stringify(
        { tenantId: tenant.id, generatedAt: new Date().toISOString(), accounts },
        null,
        2,
      ),
    );
  } finally {
    await file.close();
  }
  for (const account of accounts)
    process.stdout.write(
      `ROLE: ${account.role}\nEMAIL: ${account.email}\nPASSWORD: ${account.password}\nMFA REQUIRED: ${account.mfaRequired ? 'YES' : 'NO'}\nHTTP LOGIN: OK\n\n`,
    );
  process.stdout.write(
    'Local access only: http://localhost:3000/fr/login\nMFA: import mfaUri from .local/test-access.json into your authenticator, or run pnpm dev:totp EMAIL.\nPasswords/MFA secrets are stored only in .local/test-access.json (0600). Re-running rotates credentials and revokes sessions.\n',
  );
} finally {
  await app.close();
  await database.$disconnect();
}
