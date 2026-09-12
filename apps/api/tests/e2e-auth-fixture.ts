import { randomUUID } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { createPrismaClient } from '@gestschool/database';
import { opaqueToken } from '../src/modules/iam/infrastructure/crypto.js';
import { loadIamConfig } from '../src/modules/iam/infrastructure/iam-config.js';
import { IamRuntime } from '../src/modules/iam/infrastructure/iam-runtime.js';

// One-shot TEST preparation, not an HTTP endpoint or part of the application runtime.
if (process.env['NODE_ENV'] !== 'test') throw new Error('E2E auth fixtures require NODE_ENV=test');
const config = loadIamConfig();
if (!config.local) throw new Error('E2E auth fixtures require local IAM');
const infrastructure = loadInfrastructureConfig();
const database = createPrismaClient(infrastructure.databaseUrl);
const iam = new IamRuntime(config, infrastructure.databaseUrl, infrastructure.redisUrl);
try {
  const directory = new URL('../../../.local/', import.meta.url);
  let bootstrap: { studentId: string };
  try {
    bootstrap = JSON.parse(await readFile(new URL('iam-e2e.json', directory), 'utf8')) as {
      studentId: string;
    };
  } catch {
    throw new Error('Cannot read private E2E bootstrap fixture');
  }
  const student = await database.student.findUniqueOrThrow({
    where: { id: bootstrap.studentId },
    select: { tenant: { select: { id: true, slug: true } } },
  });
  if (!student.tenant.slug.startsWith('iam-e2e-'))
    throw new Error('Auth fixture preparation requires an isolated E2E tenant');
  const role = await database.role.findFirstOrThrow({
    where: { code: 'STUDENT', tenantId: null },
  });
  const password = `E2E passphrase ${opaqueToken()}`;
  const passwordHash = await iam.passwords.hash(password);
  const create = async (purpose: 'ACTIVATION' | 'PASSWORD_RESET') => {
    const email = `${randomUUID()}@example.invalid`;
    const user = await database.user.create({
      data: {
        email,
        displayName: 'Utilisateur E2E',
        identity: {
          create: purpose === 'ACTIVATION' ? {} : { passwordHash, activatedAt: new Date() },
        },
      },
    });
    await database.membership.create({
      data: {
        tenantId: student.tenant.id,
        userId: user.id,
        roles: { create: { roleId: role.id } },
      },
    });
    const token = await iam.credentials.issue(email, purpose, {
      requestId: randomUUID(),
      ipAddress: 'e2e-auth-setup',
      userAgent: 'e2e-auth-setup',
    });
    if (!token) throw new Error('Cannot issue a fresh E2E auth token');
    return { email, password, token };
  };
  // Fresh users on EVERY attempt: neither a consumed activation nor an expired reset is reused.
  const fixture = { activation: await create('ACTIVATION'), reset: await create('PASSWORD_RESET') };
  const file = new URL('iam-e2e-auth.json', directory);
  await writeFile(file, JSON.stringify(fixture), { mode: 0o600 });
  await chmod(file, 0o600);
} finally {
  await database.$disconnect();
  await iam.repository.close();
}
