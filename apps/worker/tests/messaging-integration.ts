import { randomBytes, createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { loadMessagingConfig } from '@gestschool/config/messaging';
import { createPrismaClient } from '@gestschool/database';
import {
  createMessagingQueue,
  createMessagingWorker,
  encryptMessagingToken,
  LocalMessagingProvider,
  type ProviderReceipt,
} from '@gestschool/infrastructure';
import { MessagingOutboxDispatcher } from '../src/jobs/messaging/dispatch.js';
import { MessagingDelivery } from '../src/jobs/messaging/local-delivery.js';

const infrastructure = loadInfrastructureConfig();
const databaseUrl = new URL(infrastructure.databaseUrl);
const redisUrl = new URL(infrastructure.redisUrl);
if (
  process.env['NODE_ENV'] !== 'test' ||
  !['localhost', '127.0.0.1', '[::1]'].includes(databaseUrl.hostname) ||
  !databaseUrl.pathname.startsWith('/gestschool_lot11_') ||
  !['localhost', '127.0.0.1', '[::1]'].includes(redisUrl.hostname) ||
  redisUrl.pathname !== '/15'
)
  throw new Error('Messaging integration requires an isolated local test database and Redis DB 15');
const config = loadMessagingConfig();
if (config.mode !== 'local')
  throw new Error('Messaging integration cannot use an external provider');

const db = createPrismaClient(infrastructure.databaseUrl);
const queue = createMessagingQueue(infrastructure.redisUrl);
const temporary = await mkdtemp(join(tmpdir(), 'gestschool-messaging-integration-'));
const capture = new URL(`file://${temporary}/delivery.jsonl`);
const delivery = new MessagingDelivery(db, config, new LocalMessagingProvider(capture));
const dispatcher = new MessagingOutboxDispatcher(db, queue);
const worker = createMessagingWorker(infrastructure.redisUrl, ({ tenantId, eventId }, job) =>
  delivery.process(tenantId, eventId, job),
);

async function expectProviderFailure(operation: Promise<void>): Promise<void> {
  try {
    await operation;
  } catch {
    return;
  }
  throw new Error('Unavailable provider unexpectedly succeeded');
}

try {
  const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: 'ecole-demo-locale' } });
  const membership = await db.membership.findFirstOrThrow({
    where: {
      tenantId: tenant.id,
      status: 'ACTIVE',
      user: { email: 'school-admin@example.invalid' },
    },
  });
  const pending = await db.outboxEvent.count({
    where: { status: 'PENDING', eventType: 'iam.password.reset.requested.v1' },
  });
  if (pending) throw new Error('Isolated test database contains unexpected pending IAM events');

  const rawToken = randomBytes(32).toString('base64url');
  const issued = await db.$transaction(async (transaction) => {
    const token = await transaction.authToken.create({
      data: {
        userId: membership.userId,
        membershipId: membership.id,
        purpose: 'PASSWORD_RESET',
        tokenHash: createHash('sha256').update(rawToken).digest('hex'),
        encryptedSecret: encryptMessagingToken(
          rawToken,
          membership.userId,
          'PASSWORD_RESET',
          config.tokenKey,
        ),
        expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    });
    const event = await transaction.outboxEvent.create({
      data: {
        tenantId: tenant.id,
        aggregateType: 'auth_token',
        aggregateId: token.id,
        eventType: 'iam.password.reset.requested.v1',
        payload: { schemaVersion: 1 },
      },
    });
    return event;
  });

  await queue.waitUntilReady();
  await worker.waitUntilReady();
  if ((await dispatcher.dispatchOnce()) !== 1) throw new Error('Outbox event was not dispatched');
  let message = await db.message.findFirst({ where: { tenantId: tenant.id, eventId: issued.id } });
  for (let attempt = 0; attempt < 100 && message?.status !== 'SENT'; attempt += 1) {
    await setTimeout(100);
    message = await db.message.findFirst({ where: { tenantId: tenant.id, eventId: issued.id } });
  }
  if (!message || message.status !== 'SENT') throw new Error('Local delivery did not complete');

  // Ten concurrent replays of the same event must not produce another capture.
  await Promise.all(Array.from({ length: 10 }, () => delivery.process(tenant.id, issued.id)));
  const messages = await db.message.findMany({
    where: { tenantId: tenant.id, eventId: issued.id },
  });
  const lines = (await readFile(capture, 'utf8')).trim().split('\n');
  const stored = messages[0];
  if (!stored || messages.length !== 1 || lines.length !== 1)
    throw new Error('Duplicate logical delivery');
  if (
    !lines[0]?.includes(rawToken) ||
    stored.subject.includes(rawToken) ||
    stored.body.includes(rawToken) ||
    JSON.stringify(stored).includes(rawToken)
  )
    throw new Error('IAM token crossed the wrong storage boundary');
  if (
    await db.notification.count({
      where: { tenantId: tenant.id, idempotencyKey: stored.idempotencyKey },
    })
  )
    throw new Error('IAM reset token was exposed as an in-app notification');

  const foreignTenant = await db.tenant.create({
    data: { slug: `messaging-isolation-${randomBytes(6).toString('hex')}`, name: 'Isolation' },
  });
  await db.membership.create({
    data: { tenantId: foreignTenant.id, userId: membership.userId },
  });
  const forged = await db.outboxEvent.create({
    data: {
      tenantId: foreignTenant.id,
      aggregateType: 'auth_token',
      aggregateId: issued.aggregateId,
      eventType: 'iam.password.reset.requested.v1',
      payload: { schemaVersion: 1 },
      status: 'PROCESSED',
      processedAt: new Date(),
    },
  });
  await delivery.process(foreignTenant.id, forged.id);
  if (await db.message.count({ where: { tenantId: foreignTenant.id, eventId: forged.id } }))
    throw new Error('Cross-tenant IAM token delivery');

  const fixtureId = randomBytes(6).toString('hex');
  const schoolClass = await db.schoolClass.findFirstOrThrow({
    where: { tenantId: tenant.id, code: '6E-A' },
  });
  const schoolEvent = await db.$transaction(async (transaction) => {
    const studentUser = await transaction.user.create({
      data: {
        email: `student-messaging-${fixtureId}@example.invalid`,
        displayName: 'Test Élève Messagerie',
        preferredLocale: 'ar',
      },
    });
    await transaction.membership.create({
      data: { tenantId: tenant.id, userId: studentUser.id },
    });
    const student = await transaction.student.create({
      data: {
        tenantId: tenant.id,
        userId: studentUser.id,
        matricule: `MSG-${fixtureId}`,
        firstName: 'Test',
        lastName: 'Messagerie',
      },
    });
    const enrollment = await transaction.enrollment.create({
      data: {
        tenantId: tenant.id,
        studentId: student.id,
        schoolClassId: schoolClass.id,
        academicYearId: schoolClass.academicYearId,
        type: 'NEW',
        status: 'ACTIVE',
        enrolledOn: new Date('2026-09-21T00:00:00.000Z'),
      },
    });
    return transaction.outboxEvent.create({
      data: {
        tenantId: tenant.id,
        aggregateType: 'enrollment',
        aggregateId: enrollment.id,
        eventType: 'enrollments.confirmed.v1',
        payload: { schemaVersion: 1 },
        status: 'PROCESSED',
        processedAt: new Date(),
      },
    });
  });
  await Promise.all(Array.from({ length: 10 }, () => delivery.process(tenant.id, schoolEvent.id)));
  const schoolMessages = await db.message.findMany({
    where: { tenantId: tenant.id, eventId: schoolEvent.id },
  });
  const inApp = schoolMessages.find((item) => item.channel === 'IN_APP');
  const schoolEmail = schoolMessages.find((item) => item.channel === 'EMAIL');
  if (
    schoolMessages.length !== 2 ||
    inApp?.status !== 'DELIVERED' ||
    schoolEmail?.status !== 'SENT' ||
    inApp.locale !== 'ar' ||
    schoolEmail.locale !== 'ar' ||
    (await db.notification.count({
      where: { tenantId: tenant.id, idempotencyKey: inApp.idempotencyKey },
    })) !== 1
  )
    throw new Error('In-app and Arabic email delivery must each be idempotent');
  if ((await readFile(capture, 'utf8')).trim().split('\n').length !== 2)
    throw new Error('Concurrent school event replay produced duplicate external captures');

  const failedToken = randomBytes(32).toString('base64url');
  const failedEvent = await db.$transaction(async (transaction) => {
    const token = await transaction.authToken.create({
      data: {
        userId: membership.userId,
        membershipId: membership.id,
        purpose: 'PASSWORD_RESET',
        tokenHash: createHash('sha256').update(failedToken).digest('hex'),
        encryptedSecret: encryptMessagingToken(
          failedToken,
          membership.userId,
          'PASSWORD_RESET',
          config.tokenKey,
        ),
        expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    });
    return transaction.outboxEvent.create({
      data: {
        tenantId: tenant.id,
        aggregateType: 'auth_token',
        aggregateId: token.id,
        eventType: 'iam.password.reset.requested.v1',
        payload: { schemaVersion: 1 },
        status: 'PROCESSED',
        processedAt: new Date(),
      },
    });
  });
  const unavailableProvider = new (class extends LocalMessagingProvider {
    override sendEmail(): Promise<ProviderReceipt> {
      return Promise.reject(new Error('LOCAL_TEST_PROVIDER_UNAVAILABLE'));
    }
  })(capture);
  await expectProviderFailure(
    new MessagingDelivery(db, config, unavailableProvider).process(tenant.id, failedEvent.id, {
      attempt: 1,
      maxAttempts: 2,
    }),
  );
  const pendingRetry = await db.message.findFirstOrThrow({
    where: { tenantId: tenant.id, eventId: failedEvent.id },
  });
  if (pendingRetry.status !== 'PENDING' || pendingRetry.attempts !== 1 || pendingRetry.failedAt)
    throw new Error('Non-final provider failure was not scheduled for retry');
  await expectProviderFailure(
    new MessagingDelivery(db, config, unavailableProvider).process(tenant.id, failedEvent.id, {
      attempt: 2,
      maxAttempts: 2,
    }),
  );
  const failedMessage = await db.message.findFirstOrThrow({
    where: { tenantId: tenant.id, eventId: failedEvent.id },
  });
  if (
    failedMessage.status !== 'FAILED' ||
    failedMessage.attempts !== 2 ||
    failedMessage.body.includes(failedToken) ||
    (await db.outboxEvent.findUniqueOrThrow({ where: { id: failedEvent.id } })).status !==
      'PROCESSED' ||
    (await readFile(capture, 'utf8')).trim().split('\n').length !== 2
  )
    throw new Error('Provider failure must preserve the business event and protect IAM token');

  process.stdout.write('outbox → BullMQ → worker → private local email = PASS\n');
  process.stdout.write('10 concurrent replays → 1 captured delivery = PASS\n');
  process.stdout.write('IAM token absent from messages and notifications = PASS\n');
  process.stdout.write('cross-tenant IAM delivery = BLOCKED\n');
  process.stdout.write('Arabic enrollment → 1 in-app notification + 1 local email = PASS\n');
  process.stdout.write(
    'provider retry → backoff state then final FAILED without token leak = PASS\n',
  );
} finally {
  await worker.close();
  await queue.close();
  await db.$disconnect();
  await rm(temporary, { recursive: true, force: true });
}
