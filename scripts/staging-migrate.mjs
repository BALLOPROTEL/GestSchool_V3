import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const databaseDirectory = new URL('../packages/database/', import.meta.url);
const migrationsDirectory = new URL('prisma/migrations/', databaseDirectory);
const manifestHash = '8c04cc7459470ea54a1e851e6ee2b976e309c883f0fe976ce3a957eb6b517259';
const expectedHost = 'dpg-dbei7tqvcj2c73d1qukg-a.frankfurt-postgres.render.com';
const expectedDatabase = 'gestschool_v3_postgres_staging';

export function migrationManifest() {
  return readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      checksum: createHash('sha256')
        .update(readFileSync(new URL(`${entry.name}/migration.sql`, migrationsDirectory)))
        .digest('hex'),
    }))
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

function targetUrl(environment) {
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
    url.hostname !== expectedHost ||
    Number(url.port || 5432) !== 5432 ||
    decodeURIComponent(url.pathname) !== `/${expectedDatabase}` ||
    !url.username ||
    !url.password ||
    url.hash ||
    url.searchParams.getAll('sslmode').length !== 1 ||
    url.searchParams.get('sslmode') !== 'verify-full'
  )
    throw new Error();
  return url;
}

function execute(options) {
  return spawnSync(process.execPath, options.args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
    maxBuffer: 1_048_576,
  });
}

async function verify(databaseUrl) {
  const { Client } = createRequire(
    new URL('../packages/infrastructure/package.json', import.meta.url),
  )('pg');
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
    query_timeout: 5_000,
  });
  try {
    await client.connect();
    const result = await client.query(`SELECT migration_name AS name, checksum
      FROM public._prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`);
    return result.rows;
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function runStagingMigrations(
  environment = process.env,
  {
    apply = false,
    manifest = migrationManifest,
    run = execute,
    inspect = verify,
    emit = (line) => process.stdout.write(`${line}\n`),
  } = {},
) {
  const report = (status, detail) =>
    emit(JSON.stringify({ check: 'LOT14_MIGRATIONS', status, ...detail }));
  if (!apply) {
    report('FAIL', { code: 'APPLY_FLAG_REQUIRED' });
    return 64;
  }
  let original;
  try {
    original = targetUrl(environment);
  } catch {
    report('FAIL', { code: 'STAGING_TARGET_REQUIRED' });
    return 64;
  }
  let expected;
  try {
    expected = manifest();
    const actualHash = createHash('sha256').update(JSON.stringify(expected)).digest('hex');
    if (expected.length !== 18 || actualHash !== manifestHash) throw new Error();
  } catch {
    report('FAIL', { code: 'MIGRATION_MANIFEST_CHANGED' });
    return 64;
  }

  // Prisma's schema engine supports require + strict, not the pg driver's verify-full.
  // Enforce encryption, CA and hostname validation for that child only. The stored URL
  // and the application environment retain verify-full, including during post-verification.
  const prismaUrl = new URL(original);
  prismaUrl.searchParams.set('sslmode', 'require');
  prismaUrl.searchParams.set('sslaccept', 'strict');
  const childEnvironment = {};
  for (const name of [
    'PATH',
    'HOME',
    'TMPDIR',
    'LANG',
    'TZ',
    'LD_LIBRARY_PATH',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
    'NODE_EXTRA_CA_CERTS',
  ])
    if (environment[name]) childEnvironment[name] = environment[name];
  Object.assign(childEnvironment, {
    DATABASE_URL: prismaUrl.href,
    NODE_ENV: 'production',
    CI: 'true',
    CHECKPOINT_DISABLE: '1',
  });
  let result;
  try {
    result = await run({
      args: [
        'node_modules/prisma/build/index.js',
        'migrate',
        'deploy',
        '--config',
        'prisma.config.ts',
      ],
      cwd: fileURLToPath(databaseDirectory),
      env: childEnvironment,
    });
    if (result.status !== 0) {
      const allowed = new Set([
        'P1000',
        'P1001',
        'P1002',
        'P1010',
        'P1011',
        'P1013',
        'P1014',
        'P1017',
        'P3000',
        'P3001',
        'P3002',
        'P3003',
        'P3004',
        'P3005',
        'P3006',
        'P3007',
        'P3008',
        'P3009',
        'P3010',
        'P3011',
        'P3012',
        'P3013',
        'P3014',
        'P3015',
        'P3016',
        'P3017',
        'P3018',
        'P3019',
        'P3020',
        'P3021',
        'P3022',
      ]);
      const raw = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
      const codes = [
        ...new Set(
          [...raw.matchAll(/\bP\d{4}\b/g)]
            .map((match) => match[0])
            .filter((code) => allowed.has(code)),
        ),
      ].toSorted();
      report('FAIL', {
        code: result.error?.code === 'ETIMEDOUT' ? 'MIGRATION_TIMEOUT' : 'MIGRATION_DEPLOY_FAILED',
        prismaCodes: codes,
      });
      return 1;
    }
  } catch {
    report('FAIL', { code: 'MIGRATION_EXECUTION_FAILED' });
    return 1;
  } finally {
    childEnvironment.DATABASE_URL = '';
    if (result) {
      result.stdout = '';
      result.stderr = '';
    }
  }

  try {
    const applied = await inspect(original.href);
    if (
      applied.length !== expected.length ||
      expected.some(
        (entry) => applied.find((row) => row.name === entry.name)?.checksum !== entry.checksum,
      )
    ) {
      report('FAIL', { code: 'MIGRATION_HISTORY_MISMATCH' });
      return 1;
    }
  } catch {
    report('FAIL', { code: 'MIGRATION_VERIFICATION_FAILED' });
    return 1;
  }
  report('PASS', { applied: expected.length, checksumsVerified: true });
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  const code = await runStagingMigrations(process.env, {
    apply: args.length === 1 && args[0] === '--apply',
  });
  process.stdout.write('', () => process.exit(code));
}
