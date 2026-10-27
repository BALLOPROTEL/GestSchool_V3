import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { bootstrapPlan, applyBootstrap } from './staging-bootstrap.mjs';
import { roleGrants } from '../packages/contracts/dist/iam.js';
import { Passwords } from '../apps/api/dist/modules/iam/infrastructure/crypto.js';
import { IamRepository } from '../apps/api/dist/modules/iam/infrastructure/iam.repository.js';
import {
  MembershipsService,
  resolveMembership,
} from '../apps/api/dist/modules/iam/application/memberships.service.js';
const { Client } = createRequire(
  new URL('../packages/infrastructure/package.json', import.meta.url),
)('pg');
let url;
try {
  if (process.env.LOT14_BOOTSTRAP_LOCAL_TEST !== '1') throw new Error();
  url = new URL(process.env.DATABASE_URL ?? '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error();
} catch {
  process.stdout.write(
    '{"check":"LOT14_BOOTSTRAP_LOCAL_INTEGRATION","status":"FAIL","code":"LOCAL_TEST_REQUIRED"}\n',
  );
  process.exit(64);
}
const name = 'gestschool_lot14_bootstrap_' + randomUUID().replaceAll('-', '');
assert(/^gestschool_lot14_bootstrap_[a-f0-9]{32}$/.test(name));
const admin = new Client({
  connectionString: url.href,
  connectionTimeoutMillis: 5000,
  query_timeout: 10000,
});
admin.on('error', () => undefined);
let client,
  repository,
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
  repository = IamRepository.connect(url.href);
  const memberships = new MembershipsService(repository);
  const tenantIds = new Set();
  stage = 'normal-iam-password-mfa-isolation';
  for (const tenant of bootstrapPlan())
    for (const spec of tenant.users) {
      const user = await repository.userByEmail(spec.email);
      assert(user?.identity?.activatedAt);
      assert(await passwords.verify(user.identity.passwordHash, raw[spec.passwordVariable]));
      assert.equal(user.identity.mfaSecret, null);
      assert.equal(user.identity.mfaEnabledAt, null);
      assert.equal(await memberships.requiresMfa(user.id), spec.role === 'SCHOOL_ADMIN');
      const rows = await repository.memberships(user.id);
      assert.equal(rows.length, 1);
      tenantIds.add(rows[0].tenantId);
      assert.equal(rows[0].tenant.slug, tenant.slug);
      const resolved = resolveMembership(rows[0]);
      assert.deepEqual(resolved.roles, [spec.role]);
      assert.equal(resolved.grants.length, roleGrants[spec.role].length);
      assert(!resolved.grants.some((g) => g.scope === 'PLATFORM'));
    }
  assert.equal(tenantIds.size, 2);
  const counts = await client.query(`SELECT
 (SELECT count(*)::int FROM tenants) AS tenants,
 (SELECT count(*)::int FROM users) AS users,
 (SELECT count(*)::int FROM roles WHERE scope='SYSTEM' OR is_system OR code='SUPER_ADMIN') AS system_roles,
 (SELECT count(*)::int FROM memberships m JOIN membership_roles b ON b.membership_id=m.id JOIN roles r ON r.id=b.role_id WHERE m.tenant_id<>r.tenant_id OR b.tenant_id<>r.tenant_id) AS crossed_roles,
 (SELECT count(*)::int FROM iam_audit_logs) AS audit,
 (SELECT count(*)::int FROM sessions) AS sessions,
 (SELECT count(*)::int FROM outbox_events) AS outbox`);
  assert.deepEqual(counts.rows[0], {
    tenants: 2,
    users: 8,
    system_roles: 0,
    crossed_roles: 0,
    audit: 8,
    sessions: 0,
    outbox: 0,
  });
  stage = 'idempotence-and-collision-no-reset';
  const before = await client.query(
    'SELECT user_id,password_hash FROM auth_identities ORDER BY user_id',
  );
  const second = await applyBootstrap(client, { grants: roleGrants, hashes, verifyIdentity });
  assert.equal(second.created, false);
  await client.query(
    "UPDATE tenant_settings SET values='{}'::jsonb WHERE tenant_id=(SELECT id FROM tenants WHERE slug=$1)",
    [bootstrapPlan()[0].slug],
  );
  await assert.rejects(
    applyBootstrap(client, { grants: roleGrants, hashes, verifyIdentity }),
    /BOOTSTRAP_COLLISION/,
  );
  const after = await client.query(
    'SELECT user_id,password_hash FROM auth_identities ORDER BY user_id',
  );
  assert(JSON.stringify(before.rows) === JSON.stringify(after.rows));
  process.stdout.write(
    JSON.stringify({
      check: 'LOT14_BOOTSTRAP_LOCAL_INTEGRATION',
      status: 'PASS',
      localMigrations: 14,
      tenants: 2,
      users: 8,
      normalPasswordVerification: true,
      normalAdminMfaRequired: true,
      noCrossTenantRoles: true,
      noSystemRoles: true,
      noSessionsOrOutbox: true,
      collisionRefusedWithoutReset: true,
      idempotentVerifiedRerun: true,
    }) + '\n',
  );
} catch {
  process.stdout.write(
    JSON.stringify({ check: 'LOT14_BOOTSTRAP_LOCAL_INTEGRATION', status: 'FAIL', stage }) + '\n',
  );
  process.exitCode = 1;
} finally {
  await repository?.close().catch(() => undefined);
  await client?.end().catch(() => undefined);
  if (created)
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`).catch(() => {
      process.exitCode = 1;
    });
  await admin.end().catch(() => undefined);
}
