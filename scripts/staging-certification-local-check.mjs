import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { bootstrapPlan, applyBootstrap } from './staging-bootstrap.mjs';
import { roleGrants } from '../packages/contracts/dist/iam.js';
import { Passwords } from '../apps/api/dist/modules/iam/infrastructure/crypto.js';
const { Client } = createRequire(
  new URL('../packages/infrastructure/package.json', import.meta.url),
)('pg');
let url;
try {
  if (process.env.LOT14_CERTIFICATION_LOCAL_TEST !== '1') throw new Error();
  if (
    process.env.APP_ENV !== 'test' ||
    process.env.NODE_ENV !== 'test' ||
    process.env.IAM_ENV !== 'local'
  )
    throw new Error();
  url = new URL(process.env.DATABASE_URL ?? '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error();
} catch {
  process.stdout.write(
    '{"check":"LOT14_CERTIFICATION_LOCAL_HTTP","status":"FAIL","code":"LOCAL_TEST_REQUIRED"}\n',
  );
  process.exit(64);
}
const name = 'gestschool_lot14_http_' + randomUUID().replaceAll('-', '');
assert(/^gestschool_lot14_http_[a-f0-9]{32}$/.test(name));
const admin = new Client({
  connectionString: url.href,
  connectionTimeoutMillis: 5000,
  query_timeout: 10000,
});
admin.on('error', () => undefined);
let client,
  application,
  created = false,
  stage = 'connect';
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  created = true;
  url.pathname = '/' + name;
  client = new Client({
    connectionString: url.href,
    connectionTimeoutMillis: 5000,
    query_timeout: 10000,
  });
  client.on('error', () => undefined);
  await client.connect();
  stage = 'migrations-local-only';
  const dir = new URL('../packages/database/prisma/migrations/', import.meta.url);
  const dirs = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .toSorted();
  assert.equal(dirs.length, 14);
  for (const migration of dirs)
    await client.query(readFileSync(new URL(`${migration}/migration.sql`, dir), 'utf8'));
  stage = 'prepare-ephemeral-hashes';
  const passwords = new Passwords();
  const hashes = {},
    raw = {};
  for (const user of bootstrapPlan().flatMap((t) => t.users)) {
    raw[user.passwordVariable] = randomBytes(24).toString('base64url');
    hashes[user.passwordVariable] = await passwords.hash(raw[user.passwordVariable]);
  }
  stage = 'apply-bootstrap-local-only';
  const verifyIdentity = (user, hash) => passwords.verify(hash, raw[user.passwordVariable]);
  const first = await applyBootstrap(client, { grants: roleGrants, hashes, verifyIdentity });
  assert.equal(first.created, true);
  const accounts = [],
    sessions = [];

  // The production entry and flag remain unused. Exercise its HTTP/auth/fixture components
  // against a new disposable local database only; never point this harness at Render.
  process.env.DATABASE_URL = url.href;
  process.env.IAM_ENV = 'local';
  process.env.IAM_ALLOWED_ORIGINS = 'https://gestschool-v3-staging.vercel.app';
  process.env.IAM_REDIS_PREFIX = 'gestschool:lot14:http:local:' + randomUUID();
  const { NestFactory } = await import('../apps/api/node_modules/@nestjs/core/index.js');
  const { AppModule } = await import('../apps/api/dist/app.module.js');
  const { IamRuntime } = await import('../apps/api/dist/modules/iam/infrastructure/iam-runtime.js');
  const { configureIamHttp } =
    await import('../apps/api/dist/modules/iam/presentation/http/security.js');
  const { authenticate } =
    await import('../apps/api/dist/infrastructure/lot14-certification/authentication.js');
  const { readAuthState } =
    await import('../apps/api/dist/infrastructure/lot14-certification/auth-state.js');
  const { fixtures, scenario } =
    await import('../apps/api/dist/infrastructure/lot14-certification/fixtures.js');
  stage = 'local-nest';
  application = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  const iam = application.get(IamRuntime);
  // Local test server emits the production cookie names without changing deployed policy.
  iam.config.secure = true;
  configureIamHttp(application);
  await application.listen(0, '127.0.0.1');
  const port = application.getHttpServer().address().port;
  const signal = AbortSignal.timeout(180000);
  const dependencies = {
    port,
    environment: raw,
    crypto: iam.crypto,
    accounts,
    sessions,
    async readMfa(email, tenantId) {
      return (
        await client.query(
          'SELECT u.id,a.mfa_secret,a.mfa_last_counter FROM users u JOIN auth_identities a ON a.user_id=u.id JOIN memberships m ON m.user_id=u.id WHERE u.email=$1 AND m.tenant_id=$2',
          [email, tenantId],
        )
      ).rows;
    },
  };
  const tenants = (await client.query('SELECT id,slug FROM tenants')).rows;
  const initialState = await readAuthState(
    client,
    tenants.map((row) => row.id),
  );
  assert.equal(initialState.adminMfaEnrolled, 0);
  assert.equal(initialState.activeSessions, 0);
  assert.equal(initialState.unusedMfaChallenges, 0);
  const groups = [];
  stage = 'real-http-login-enroll-refresh';
  for (const label of ['A', 'B']) {
    const group = {};
    const tenantId = tenants.find(
      (row) => row.slug === 'lot14-certification-' + label.toLowerCase(),
    ).id;
    for (const role of ['SCHOOL_ADMIN', 'TEACHER', 'PARENT', 'STUDENT'])
      group[role] = await authenticate(label, role, tenantId, signal, dependencies);
    groups.push(group);
  }
  stage = 'http-fixtures-a';
  const a = await fixtures('A', groups[0]);
  stage = 'http-fixtures-b';
  const b = await fixtures('B', groups[1]);
  for (let i = 0; i < 14; i++) {
    stage = 'http-case-' + (i + 1);
    await scenario(i, a, b);
  }
  stage = 'http-fixtures-idempotence';
  await fixtures('A', groups[0]);
  await fixtures('B', groups[1]);
  stage = 'http-mfa-rerun-normal-replay-protection';
  await authenticate('A', 'SCHOOL_ADMIN', groups[0].SCHOOL_ADMIN.tenantId, signal, dependencies);
  const enrolledState = await readAuthState(
    client,
    tenants.map((row) => row.id),
  );
  assert.equal(enrolledState.adminMfaEnrolled, 2);
  assert.equal(enrolledState.activeSessions, 9);
  assert.equal(enrolledState.unusedMfaChallenges, 0);
  assert.equal(enrolledState.usedMfaChallenges, 5);
  stage = 'http-session-cleanup';
  for (const account of accounts) {
    assert.equal((await account.http.send('auth/logout', 'POST', {})).status, 201);
    assert.equal((await account.http.send('auth/me')).status, 401);
    account.http.clear();
  }
  assert.equal(
    (
      await client.query(
        "SELECT count(*)::int AS active FROM sessions WHERE status='ACTIVE' AND revoked_at IS NULL",
      )
    ).rows[0].active,
    0,
  );
  // Enrollment domain events exist, but no report/document job was requested before the gate.
  assert.equal(
    (
      await client.query(
        "SELECT count(*)::int AS jobs FROM outbox_events WHERE aggregate_type IN ('report_export','document')",
      )
    ).rows[0].jobs,
    0,
  );
  process.stdout.write(
    JSON.stringify({
      check: 'LOT14_CERTIFICATION_LOCAL_HTTP',
      status: 'PASS',
      pass: 14,
      fail: 0,
      skip: 0,
      fixtureRerun: true,
      mfaEnrollmentAndRerun: true,
      sessionsRevoked: true,
      remoteRun: false,
    }) + '\n',
  );
} catch {
  process.stdout.write(
    JSON.stringify({ check: 'LOT14_CERTIFICATION_LOCAL_HTTP', status: 'FAIL', stage }) + '\n',
  );
  process.exitCode = 1;
} finally {
  await application?.close().catch(() => {
    process.exitCode = 1;
  });
  await client?.end().catch(() => {
    process.exitCode = 1;
  });
  if (created)
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`).catch(() => {
      process.exitCode = 1;
    });
  await admin.end().catch(() => {
    process.exitCode = 1;
  });
}
