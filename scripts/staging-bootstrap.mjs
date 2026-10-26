import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const host = 'dpg-dbei7tqvcj2c73d1qukg-a.frankfurt-postgres.render.com';
const database = 'gestschool_v3_postgres_staging';
const stabilitySha = 'eb0d3654551f39ba3b6d7a01b71bd003c693e7a9';
const roles = ['SCHOOL_ADMIN', 'TEACHER', 'PARENT', 'STUDENT'];
const accountLabel = (role) => (role === 'SCHOOL_ADMIN' ? 'admin' : role.toLowerCase());

export function bootstrapPlan() {
  return ['A', 'B'].map((label) => ({
    label,
    slug: `lot14-certification-${label.toLowerCase()}`,
    name: `LOT14 — École fictive ${label}`,
    users: roles.map((role) => ({
      role,
      email: `lot14-${label.toLowerCase()}-${accountLabel(role)}@example.invalid`,
      passwordVariable: `LOT14_BOOTSTRAP_${label}_${role}_PASSWORD`,
      mfaEnrollmentRequired: role === 'SCHOOL_ADMIN',
    })),
  }));
}

function target(environment) {
  if (
    environment.APP_ENV !== 'staging' ||
    environment.NODE_ENV !== 'production' ||
    environment.IAM_ENV !== 'staging' ||
    environment.APP_PUBLIC_ORIGIN !== 'https://gestschool-v3-staging.vercel.app'
  )
    throw new Error();
  const url = new URL(environment.DATABASE_URL ?? '');
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== host ||
    Number(url.port || 5432) !== 5432 ||
    decodeURIComponent(url.pathname) !== `/${database}` ||
    !url.username ||
    !url.password ||
    url.hash ||
    [...url.searchParams.keys()].length !== 1 ||
    url.searchParams.get('sslmode') !== 'verify-full'
  )
    throw new Error();
  return url.href;
}

function stable(report) {
  return (
    report.source_head === stabilitySha &&
    report.all_valid_ready === true &&
    report.checks >= 21 &&
    report.interval_seconds === 30 &&
    report.duration_seconds >= 600 &&
    report.http_200 === report.checks &&
    report.http_503 === 0 &&
    report.other_or_transport_failures === 0
  );
}

async function productionRuntime() {
  const { roleGrants } = await import('../packages/contracts/dist/iam.js');
  const { Passwords, validatePassword } =
    await import('../apps/api/dist/modules/iam/infrastructure/crypto.js');
  const { Client } = createRequire(
    new URL('../packages/infrastructure/package.json', import.meta.url),
  )('pg');
  const passwords = new Passwords();
  return {
    grants: roleGrants,
    validatePassword,
    hash: (value) => passwords.hash(value),
    verify: (hash, value) => passwords.verify(hash, value),
    open: async (databaseUrl) => {
      const client = new Client({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 5_000,
        query_timeout: 5_000,
      });
      client.on('error', () => undefined);
      try {
        await client.connect();
        return client;
      } catch {
        client.connection.stream.destroy();
        throw new Error('BOOTSTRAP_CONNECTION_FAILED');
      }
    },
  };
}

function sortedGrants(items) {
  return items.map((item) => `${item.permission}:${item.scope}`).toSorted();
}
function sameGrants(actual, expected) {
  return JSON.stringify(sortedGrants(actual)) === JSON.stringify(sortedGrants(expected));
}

export async function inspectBootstrap(client, { grants, verifyIdentity }) {
  const plan = bootstrapPlan();
  const tenants = await client.query(
    `SELECT t.id, t.slug, t.name, t.status, s.values
    FROM tenants t LEFT JOIN tenant_settings s ON s.tenant_id=t.id
    WHERE lower(t.slug)=ANY($1::text[])`,
    [plan.map((tenant) => tenant.slug)],
  );
  if (tenants.rows.length !== 2) throw new Error('BOOTSTRAP_COLLISION');
  for (const spec of plan) {
    const tenant = tenants.rows.find((row) => row.slug === spec.slug);
    if (
      !tenant ||
      tenant.name !== spec.name ||
      tenant.status !== 'ACTIVE' ||
      tenant.values?.lot14Bootstrap !== 'ab-v1'
    )
      throw new Error('BOOTSTRAP_COLLISION');
    const users = await client.query(
      `SELECT u.id, u.email, u.disabled_at IS NULL AS enabled,
      a.password_hash, a.activated_at IS NOT NULL AS activated,
      a.mfa_secret IS NOT NULL AS has_mfa_secret, a.mfa_enabled_at IS NOT NULL AS mfa_enabled,
      m.id AS membership_id, m.status,
      (SELECT count(*)::int FROM memberships other WHERE other.user_id=u.id) AS membership_count
      FROM memberships m JOIN users u ON u.id=m.user_id
      LEFT JOIN auth_identities a ON a.user_id=u.id WHERE m.tenant_id=$1`,
      [tenant.id],
    );
    const roleCount = await client.query(
      'SELECT count(*)::int AS count FROM roles WHERE tenant_id=$1',
      [tenant.id],
    );
    if (users.rows.length !== spec.users.length || roleCount.rows[0]?.count !== roles.length)
      throw new Error('BOOTSTRAP_COLLISION');
    for (const user of spec.users) {
      const found = users.rows.find((row) => row.email === user.email);
      if (
        !found ||
        !found.enabled ||
        !found.activated ||
        found.status !== 'ACTIVE' ||
        found.membership_count !== 1 ||
        found.has_mfa_secret !== found.mfa_enabled ||
        typeof found.password_hash !== 'string' ||
        !(await verifyIdentity(user, found.password_hash))
      )
        throw new Error('BOOTSTRAP_COLLISION');
      const bindings = await client.query(
        `SELECT r.code, r.scope, r.is_system, r.tenant_id,
        b.tenant_id AS binding_tenant_id,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('permission',p.code,'scope',rp.scope))
          FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
          WHERE rp.role_id=r.id AND rp.tenant_id=r.tenant_id),'[]'::jsonb) AS grants,
        (SELECT count(*)::int FROM role_permissions rp WHERE rp.role_id=r.id) AS grant_count
        FROM membership_roles b JOIN roles r ON r.id=b.role_id WHERE b.membership_id=$1`,
        [found.membership_id],
      );
      const role = bindings.rows[0];
      if (
        bindings.rows.length !== 1 ||
        role.code !== user.role ||
        role.scope !== 'TENANT' ||
        role.is_system ||
        role.tenant_id !== tenant.id ||
        role.binding_tenant_id !== tenant.id ||
        role.grant_count !== grants[user.role].length ||
        !sameGrants(role.grants, grants[user.role])
      )
        throw new Error('BOOTSTRAP_COLLISION');
    }
  }
  return { tenants: 2, users: 8, memberships: 8, tenantRoles: 8, mfaBypassed: false };
}

// Also exercised against a disposable local schema in integration verification.
// No dev seed, global SYSTEM role mutation, credential reset, email, or business fixture creation.
export async function applyBootstrap(client, { grants, hashes, verifyIdentity }) {
  if (typeof verifyIdentity !== 'function') throw new Error('BOOTSTRAP_VERIFICATION_REQUIRED');
  const plan = bootstrapPlan();
  for (const role of roles) {
    if (
      !Array.isArray(grants[role]) ||
      grants[role].length === 0 ||
      grants[role].some(
        (grant) => !['TENANT', 'ASSIGNED', 'CHILDREN', 'OWN', 'NONE'].includes(grant.scope),
      ) ||
      new Set(grants[role].map((grant) => grant.permission)).size !== grants[role].length
    )
      throw new Error('BOOTSTRAP_GRANTS_INVALID');
  }
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL statement_timeout = '10s'");
    await client.query("SET LOCAL lock_timeout = '5s'");
    const lock = await client.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired', [
      'lot14-bootstrap-ab-v1',
    ]);
    if (lock.rows[0]?.acquired !== true) throw new Error('BOOTSTRAP_BUSY');
    const occupied = await client.query(
      `SELECT
      EXISTS(SELECT 1 FROM tenants WHERE lower(slug) = ANY($1::text[])) OR
      EXISTS(SELECT 1 FROM users WHERE lower(email) = ANY($2::text[])) AS occupied`,
      [
        plan.map((tenant) => tenant.slug),
        plan.flatMap((tenant) => tenant.users.map((user) => user.email)),
      ],
    );
    if (occupied.rows[0]?.occupied !== false) {
      const assertions = await inspectBootstrap(client, { grants, verifyIdentity });
      await client.query('COMMIT');
      return { ...assertions, created: false };
    }
    const permissions = [
      ...new Set(roles.flatMap((role) => grants[role].map((grant) => grant.permission))),
    ];
    await client.query(
      `INSERT INTO permissions (code, description)
      SELECT code, code FROM unnest($1::text[]) AS item(code)
      ON CONFLICT (code) DO NOTHING`,
      [permissions],
    );
    for (const tenant of plan) {
      const created = await client.query(
        'INSERT INTO tenants (slug, name, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) RETURNING id',
        [tenant.slug, tenant.name],
      );
      const tenantId = created.rows[0].id;
      await client.query(
        `INSERT INTO tenant_settings (tenant_id, values, updated_at)
        VALUES ($1, '{"lot14Bootstrap":"ab-v1"}'::jsonb, CURRENT_TIMESTAMP)`,
        [tenantId],
      );
      for (const user of tenant.users) {
        const role = await client.query(
          `INSERT INTO roles (tenant_id, code, name, scope, is_system, updated_at)
          VALUES ($1, $2, $2, 'TENANT', false, CURRENT_TIMESTAMP) RETURNING id`,
          [tenantId, user.role],
        );
        const roleId = role.rows[0].id;
        const bound = await client.query(
          `INSERT INTO role_permissions (role_id, permission_id, tenant_id, scope)
          SELECT $1, p.id, $2, g.scope::access_scope
          FROM jsonb_to_recordset($3::jsonb) AS g(permission text, scope text)
          JOIN permissions p ON p.code = g.permission`,
          [roleId, tenantId, JSON.stringify(grants[user.role])],
        );
        if (bound.rowCount !== grants[user.role].length)
          throw new Error('BOOTSTRAP_GRANTS_INVALID');
        const identity = await client.query(
          'INSERT INTO users (email, display_name, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) RETURNING id',
          [user.email, `LOT14 ${tenant.label} ${user.role}`],
        );
        const userId = identity.rows[0].id;
        await client.query(
          `INSERT INTO auth_identities (user_id, password_hash, activated_at, password_changed_at)
          VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [userId, hashes[user.passwordVariable]],
        );
        const membership = await client.query(
          'INSERT INTO memberships (tenant_id, user_id, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) RETURNING id',
          [tenantId, userId],
        );
        await client.query(
          'INSERT INTO membership_roles (tenant_id, membership_id, role_id) VALUES ($1, $2, $3)',
          [tenantId, membership.rows[0].id, roleId],
        );
        await client.query(
          `INSERT INTO iam_audit_logs (request_id, tenant_id, action, subject_id)
          VALUES ($1, $2, 'lot14.bootstrap.identity.created', $3)`,
          [randomUUID(), tenantId, userId],
        );
      }
    }
    const assertions = await inspectBootstrap(client, { grants, verifyIdentity });
    await client.query('COMMIT');
    return { ...assertions, created: true };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

export async function runStagingBootstrap(
  environment = process.env,
  {
    apply = false,
    loadRuntime = productionRuntime,
    loadStability = () =>
      JSON.parse(
        readFileSync(
          new URL('../docs/lot14-worker-stability-eb0d365.json', import.meta.url),
          'utf8',
        ),
      ),
    emit = (line) => process.stdout.write(`${line}\n`),
  } = {},
) {
  const report = (status, detail = {}) =>
    emit(JSON.stringify({ check: 'LOT14_BOOTSTRAP', status, ...detail }));
  if (!apply) {
    report('PLAN', { tenants: bootstrapPlan() });
    return 0;
  }
  let databaseUrl;
  try {
    databaseUrl = target(environment);
  } catch {
    report('FAIL', { code: 'STAGING_TARGET_REQUIRED' });
    return 64;
  }
  try {
    if (!stable(await loadStability())) throw new Error();
  } catch {
    report('FAIL', { code: 'STABILITY_PROOF_REQUIRED' });
    return 64;
  }
  let runtime;
  const hashes = {};
  let client;
  try {
    runtime = await loadRuntime();
    const seen = new Set();
    for (const user of bootstrapPlan().flatMap((tenant) => tenant.users)) {
      const value = environment[user.passwordVariable];
      if (typeof value !== 'string' || value.length < 20 || seen.has(value)) throw new Error();
      runtime.validatePassword(value);
      seen.add(value);
    }
    for (const user of bootstrapPlan().flatMap((tenant) => tenant.users))
      hashes[user.passwordVariable] = await runtime.hash(environment[user.passwordVariable]);
  } catch {
    report('FAIL', { code: 'BOOTSTRAP_CREDENTIALS_REQUIRED' });
    return 64;
  }
  try {
    client = await runtime.open(databaseUrl);
    const actual = await client.query('SELECT current_database() AS name');
    if (actual.rows[0]?.name !== database) throw new Error();
    const assertions = await applyBootstrap(client, {
      grants: runtime.grants,
      hashes,
      verifyIdentity: (user, hash) => runtime.verify(hash, environment[user.passwordVariable]),
    });
    report('PASS', assertions);
    return 0;
  } catch {
    report('FAIL', { code: 'BOOTSTRAP_FAILED_INSPECT_STATE' });
    return 1;
  } finally {
    for (const key of Object.keys(hashes)) hashes[key] = '';
    if (client) {
      // Force disposal before end() so an operator job cannot hang on an idle socket.
      try {
        client.connection.stream.destroy();
        await client.end();
      } catch {
        /* no raw errors */
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && !['--plan', '--apply'].includes(args[0]))) {
    process.stdout.write(
      '{"check":"LOT14_BOOTSTRAP","status":"FAIL","code":"INVALID_ARGUMENTS"}\n',
    );
    process.exitCode = 64;
  } else
    process.exitCode = await runStagingBootstrap(process.env, { apply: args[0] === '--apply' });
}
