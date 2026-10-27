import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { bootstrapPlan, runStagingBootstrap } from './staging-bootstrap.mjs';

function fixture() {
  const emitted = [],
    queries = [];
  const counts = { open: 0, end: 0, destroy: 0 };
  const state = { occupied: false, tamper: false, mfa: false };
  const plan = bootstrapPlan(),
    storedHashes = new Map(),
    hashValues = new Map();
  const tenantIds = new Map(plan.map((tenant) => [tenant.slug, randomUUID()]));
  const userIds = new Map(
    plan.flatMap((tenant) => tenant.users.map((user) => [user.email, randomUUID()])),
  );
  const membershipIds = new Map(
    plan.flatMap((tenant) => tenant.users.map((user) => [user.email, randomUUID()])),
  );
  const url = new URL(
    'postgresql://fixture@dpg-dbei7tqvcj2c73d1qukg-a.frankfurt-postgres.render.com/gestschool_v3_postgres_staging?sslmode=verify-full',
  );
  url.password = randomBytes(24).toString('base64url');
  const environment = {
    APP_ENV: 'staging',
    NODE_ENV: 'production',
    IAM_ENV: 'staging',
    APP_PUBLIC_ORIGIN: 'https://gestschool-v3-staging.vercel.app',
    DATABASE_URL: url.href,
  };
  for (const user of plan.flatMap((tenant) => tenant.users))
    environment[user.passwordVariable] = randomBytes(24).toString('base64url');
  const runtime = {
    grants: {
      SCHOOL_ADMIN: [{ permission: 'students.create', scope: 'TENANT' }],
      TEACHER: [{ permission: 'students.read', scope: 'ASSIGNED' }],
      PARENT: [{ permission: 'students.read', scope: 'CHILDREN' }],
      STUDENT: [{ permission: 'students.read', scope: 'OWN' }],
    },
    validatePassword() {},
    async hash(value) {
      const hash = randomBytes(32).toString('hex');
      hashValues.set(hash, value);
      return hash;
    },
    async verify(hash, value) {
      return hashValues.get(hash) === value;
    },
    async open() {
      counts.open++;
      return client;
    },
  };
  const client = {
    connection: {
      stream: {
        destroy() {
          counts.destroy++;
        },
      },
    },
    async end() {
      counts.end++;
    },
    async query(sql, args = []) {
      queries.push({ sql, args });
      if (sql.startsWith('SELECT current_database'))
        return { rows: [{ name: 'gestschool_v3_postgres_staging' }] };
      if (sql.includes('pg_try_advisory')) return { rows: [{ acquired: true }] };
      if (sql.includes('AS occupied')) return { rows: [{ occupied: state.occupied }] };
      if (sql.startsWith('SELECT t.id'))
        return {
          rows: plan.map((t) => ({
            id: tenantIds.get(t.slug),
            slug: t.slug,
            name: t.name,
            status: 'ACTIVE',
            values: { lot14Bootstrap: state.tamper ? 'other' : 'ab-v1' },
          })),
        };
      if (sql.startsWith('SELECT u.id')) {
        const tenant = plan.find((t) => tenantIds.get(t.slug) === args[0]);
        return {
          rows: tenant.users.map((u) => ({
            id: userIds.get(u.email),
            email: u.email,
            enabled: true,
            activated: true,
            password_hash: storedHashes.get(u.email),
            has_mfa_secret: state.mfa,
            mfa_enabled: state.mfa,
            status: 'ACTIVE',
            membership_count: 1,
            membership_id: membershipIds.get(u.email),
          })),
        };
      }
      if (sql.startsWith('SELECT count(*)::int AS count')) return { rows: [{ count: 4 }] };
      if (sql.startsWith('SELECT r.code')) {
        const tenant = plan.find((t) =>
          t.users.some((u) => membershipIds.get(u.email) === args[0]),
        );
        const user = tenant.users.find((u) => membershipIds.get(u.email) === args[0]);
        return {
          rows: [
            {
              code: user.role,
              scope: 'TENANT',
              is_system: false,
              tenant_id: tenantIds.get(tenant.slug),
              binding_tenant_id: tenantIds.get(tenant.slug),
              grants: runtime.grants[user.role],
              grant_count: runtime.grants[user.role].length,
            },
          ],
        };
      }
      if (sql.startsWith('INSERT INTO tenants')) {
        state.occupied = true;
        return { rows: [{ id: tenantIds.get(args[0]) }], rowCount: 1 };
      }
      if (sql.startsWith('INSERT INTO users'))
        return { rows: [{ id: userIds.get(args[0]) }], rowCount: 1 };
      if (sql.startsWith('INSERT INTO auth_identities')) {
        const email = [...userIds].find(([, id]) => id === args[0])[0];
        storedHashes.set(email, args[1]);
      }
      if (sql.startsWith('INSERT INTO role_permissions'))
        return { rows: [], rowCount: JSON.parse(args[2]).length };
      return { rows: [{ id: randomUUID() }], rowCount: 1 };
    },
  };
  const proof = {
    source_head: 'eb0d3654551f39ba3b6d7a01b71bd003c693e7a9',
    all_valid_ready: true,
    checks: 21,
    interval_seconds: 30,
    duration_seconds: 600.76,
    http_200: 21,
    http_503: 0,
    other_or_transport_failures: 0,
  };
  const options = {
    apply: true,
    loadRuntime: async () => runtime,
    loadStability: () => proof,
    emit: (line) => emitted.push(JSON.parse(line)),
  };
  const safe = () => {
    const output = JSON.stringify(emitted);
    assert(!output.includes(environment.DATABASE_URL));
    for (const user of plan.flatMap((t) => t.users))
      assert(!output.includes(environment[user.passwordVariable]));
    for (const hash of storedHashes.values()) assert(!output.includes(hash));
    assert(!output.includes('DRIVER_ERROR_CANARY'));
  };
  return {
    environment,
    runtime,
    options,
    proof,
    client,
    counts,
    queries,
    emitted,
    safe,
    state,
    storedHashes,
  };
}

test('plan is offline, contains only fictitious identities and preserves administrator MFA', async () => {
  const f = fixture();
  f.options.apply = false;
  f.options.loadRuntime = () => {
    throw new Error('must not load runtime');
  };
  assert.equal(await runStagingBootstrap(f.environment, f.options), 0);
  assert.equal(f.emitted[0].status, 'PLAN');
  assert.equal(f.emitted[0].tenants.length, 2);
  assert.equal(f.counts.open, 0);
  for (const tenant of bootstrapPlan()) {
    assert.equal(tenant.users.length, 4);
    assert(tenant.users.every((user) => user.email.endsWith('@example.invalid')));
    assert.equal(
      tenant.users.find((user) => user.role === 'SCHOOL_ADMIN').mfaEnrollmentRequired,
      true,
    );
    assert(!tenant.users.some((user) => user.role === 'SUPER_ADMIN'));
  }
  f.safe();
});

test('environment and exact TLS staging target are fail-closed before runtime loading', async () => {
  const changes = [
    { APP_ENV: 'production' },
    { NODE_ENV: 'test' },
    { IAM_ENV: 'development' },
    { APP_PUBLIC_ORIGIN: 'https://gestschool.vercel.app' },
    { DATABASE_URL: 'not-a-url' },
    ...[
      'sslmode=require',
      'sslmode=disable',
      'sslmode=verify-full&sslmode=verify-full',
      'sslmode=verify-full&hostaddr=127.0.0.1',
    ].map((query) => ({
      DATABASE_URL: `postgresql://fixture:fixture@dpg-dbei7tqvcj2c73d1qukg-a.frankfurt-postgres.render.com/gestschool_v3_postgres_staging?${query}`,
    })),
    {
      DATABASE_URL:
        'postgresql://fixture:fixture@localhost/gestschool_v3_postgres_staging?sslmode=verify-full',
    },
    {
      DATABASE_URL:
        'postgresql://fixture:fixture@dpg-dbei7tqvcj2c73d1qukg-a.frankfurt-postgres.render.com/gestschool_v2BD?sslmode=verify-full',
    },
  ];
  for (const change of changes) {
    const f = fixture();
    f.options.loadRuntime = () => {
      throw new Error('must not load runtime');
    };
    assert.equal(await runStagingBootstrap({ ...f.environment, ...change }, f.options), 64);
    assert.equal(f.emitted[0].code, 'STAGING_TARGET_REQUIRED');
    assert.equal(f.counts.open, 0);
    f.safe();
  }
});

test('a complete stable observation window is required before any connection', async () => {
  for (const change of [
    { source_head: 'other' },
    { all_valid_ready: false },
    { checks: 20 },
    { duration_seconds: 599 },
    { http_503: 1 },
    { other_or_transport_failures: 1 },
    { http_200: 20 },
  ]) {
    const f = fixture();
    Object.assign(f.proof, change);
    assert.equal(await runStagingBootstrap(f.environment, f.options), 64);
    assert.equal(f.emitted[0].code, 'STABILITY_PROOF_REQUIRED');
    assert.equal(f.counts.open, 0);
  }
});

test('missing, short or reused credentials never reach the database', async () => {
  for (const kind of ['missing', 'short', 'reuse', 'hash-failure']) {
    const f = fixture();
    const users = bootstrapPlan().flatMap((tenant) => tenant.users);
    if (kind === 'missing') delete f.environment[users[0].passwordVariable];
    if (kind === 'short') f.environment[users[0].passwordVariable] = '';
    if (kind === 'reuse')
      f.environment[users[1].passwordVariable] = f.environment[users[0].passwordVariable];
    if (kind === 'hash-failure')
      f.runtime.hash = () => {
        throw new Error(`DRIVER_ERROR_CANARY ${f.environment.DATABASE_URL}`);
      };
    assert.equal(await runStagingBootstrap(f.environment, f.options), 64);
    assert.equal(f.counts.open, 0);
    // Missing credentials are absent, not leaked; the other values must stay private.
    assert(!JSON.stringify(f.emitted).includes('DRIVER_ERROR_CANARY'));
  }
});

test('successful apply is atomic, creates tenant roles only, never pre-enrolls TOTP, and closes the client', async () => {
  const f = fixture();
  assert.equal(await runStagingBootstrap(f.environment, f.options), 0);
  assert.equal(f.queries.filter((q) => q.sql === 'BEGIN').length, 1);
  assert.equal(f.queries.filter((q) => q.sql === 'COMMIT').length, 1);
  assert.equal(f.queries.filter((q) => q.sql.startsWith('INSERT INTO users')).length, 8);
  assert.equal(f.queries.filter((q) => q.sql.startsWith('INSERT INTO roles')).length, 8);
  assert.equal(f.queries.filter((q) => q.sql.startsWith('INSERT INTO tenants')).length, 2);
  assert(
    !f.queries.some((q) =>
      /^(UPDATE |DELETE |TRUNCATE )|INSERT INTO (outbox_events|sessions)|SET mfa_secret/i.test(
        q.sql,
      ),
    ),
  );
  assert.equal(f.counts.end, 1);
  assert.equal(f.counts.destroy, 1);
  assert.deepEqual(f.emitted[0], {
    check: 'LOT14_BOOTSTRAP',
    status: 'PASS',
    tenants: 2,
    users: 8,
    memberships: 8,
    tenantRoles: 8,
    mfaBypassed: false,
    created: true,
  });
  f.safe();
});

test('collisions and SQL failures rollback without credential reset or raw diagnostics', async () => {
  for (const kind of ['collision', 'sql', 'lock', 'database']) {
    const f = fixture();
    const query = f.client.query;
    f.client.query = async (sql, args) => {
      if (kind === 'collision' && sql.startsWith('SELECT t.id')) return { rows: [] };
      if (kind === 'collision' && sql.includes('AS occupied')) {
        f.queries.push({ sql, args });
        return { rows: [{ occupied: true }] };
      }
      if (kind === 'lock' && sql.includes('pg_try_advisory'))
        return { rows: [{ acquired: false }] };
      if (kind === 'database' && sql.startsWith('SELECT current_database'))
        return { rows: [{ name: 'other' }] };
      if (kind === 'sql' && sql.startsWith('INSERT INTO users'))
        throw new Error(`DRIVER_ERROR_CANARY ${f.environment.DATABASE_URL}`);
      return query(sql, args);
    };
    assert.equal(await runStagingBootstrap(f.environment, f.options), 1);
    assert(!f.queries.some((q) => q.sql === 'COMMIT'));
    if (kind !== 'database') assert(f.queries.some((q) => q.sql === 'ROLLBACK'));
    if (kind === 'collision') assert(!f.queries.some((q) => q.sql.startsWith('INSERT')));
    assert.equal(f.counts.end, 1);
    assert.equal(f.counts.destroy, 1);
    f.safe();
  }
});

test('platform grants are refused and never modify SYSTEM roles', async () => {
  const f = fixture();
  f.runtime.grants.SCHOOL_ADMIN[0].scope = 'PLATFORM';
  assert.equal(await runStagingBootstrap(f.environment, f.options), 1);
  assert(!f.queries.some((q) => q.sql === 'BEGIN'));
  f.safe();
});

test('CLI defaults to offline plan and rejects unexpected arguments', () => {
  const script = new URL('./staging-bootstrap.mjs', import.meta.url);
  const plan = spawnSync(process.execPath, [script.pathname, '--plan'], { encoding: 'utf8' });
  assert.equal(plan.status, 0);
  assert.equal(JSON.parse(plan.stdout).status, 'PLAN');
  const invalid = spawnSync(process.execPath, [script.pathname, '--apply', '--anything'], {
    encoding: 'utf8',
  });
  assert.equal(invalid.status, 64);
  assert.equal(JSON.parse(invalid.stdout).code, 'INVALID_ARGUMENTS');
});

test('a verified second application is an idempotent read-only success, preserving credentials and MFA', async () => {
  const f = fixture();
  assert.equal(await runStagingBootstrap(f.environment, f.options), 0);
  const hashes = JSON.stringify([...f.storedHashes]);
  f.state.mfa = true;
  f.queries.length = 0;
  assert.equal(await runStagingBootstrap(f.environment, f.options), 0);
  assert.equal(f.emitted.at(-1).created, false);
  assert(!f.queries.some((q) => /^(INSERT|UPDATE|DELETE|TRUNCATE)/.test(q.sql)));
  assert.equal(JSON.stringify([...f.storedHashes]), hashes);
  f.safe();
});
test('owned-looking collisions, changed credentials and crossed roles are never repaired or overwritten', async () => {
  for (const kind of ['marker', 'credentials', 'cross-role']) {
    const f = fixture();
    assert.equal(await runStagingBootstrap(f.environment, f.options), 0);
    f.queries.length = 0;
    if (kind === 'marker') f.state.tamper = true;
    if (kind === 'credentials')
      f.environment[bootstrapPlan()[0].users[0].passwordVariable] =
        randomBytes(24).toString('base64url');
    if (kind === 'cross-role') {
      const query = f.client.query;
      f.client.query = async (sql, args) => {
        const result = await query(sql, args);
        if (sql.startsWith('SELECT r.code')) result.rows[0].binding_tenant_id = randomUUID();
        return result;
      };
    }
    assert.equal(await runStagingBootstrap(f.environment, f.options), 1);
    assert(!f.queries.some((q) => /^(INSERT|UPDATE|DELETE|TRUNCATE)/.test(q.sql)));
    assert(f.queries.some((q) => q.sql === 'ROLLBACK'));
    f.safe();
  }
});
