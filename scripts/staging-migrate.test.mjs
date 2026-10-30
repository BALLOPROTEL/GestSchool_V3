import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { migrationManifest, runStagingMigrations } from './staging-migrate.mjs';

const environment = {
  APP_ENV: 'staging',
  NODE_ENV: 'production',
  IAM_ENV: 'staging',
  APP_PUBLIC_ORIGIN: 'https://gestschool-v3-staging.vercel.app',
  DATABASE_URL:
    'postgresql://fixture:fixture_not_real@dpg-dbei7tqvcj2c73d1qukg-a.frankfurt-postgres.render.com/gestschool_v3_postgres_staging?sslmode=verify-full',
  BREVO_API_KEY: 'fixture-brevo-private',
  IAM_JWT_PRIVATE_KEY: 'fixture-iam-private',
  S3_SECRET_ACCESS_KEY: 'fixture-s3-private',
};

function fixture(overrides = {}) {
  const output = [];
  const calls = [];
  const options = {
    apply: true,
    run: async () => {
      calls.push('run');
      return { status: 0, stdout: environment.DATABASE_URL, stderr: '' };
    },
    inspect: async () => {
      calls.push('inspect');
      return migrationManifest();
    },
    emit: (line) => output.push(line),
    ...overrides,
  };
  return { output, calls, options };
}

test('rejects missing apply, production, V2, localhost, wrong database and ambiguous TLS before executing', async () => {
  for (const extra of [
    { APP_ENV: 'production' },
    { NODE_ENV: 'development' },
    { IAM_ENV: 'local' },
    { APP_PUBLIC_ORIGIN: 'https://gestschool.vercel.app' },
    {
      DATABASE_URL: environment.DATABASE_URL.replace(
        'dpg-dbei7tqvcj2c73d1qukg-a.frankfurt-postgres.render.com',
        'localhost',
      ),
    },
    { DATABASE_URL: environment.DATABASE_URL.replace('dpg-dbei7tqvcj2c73d1qukg-a', 'dpg-other') },
    {
      DATABASE_URL: environment.DATABASE_URL.replace('/gestschool_v3_postgres_staging?', '/other?'),
    },
    { DATABASE_URL: environment.DATABASE_URL.replace('verify-full', 'require') },
    { DATABASE_URL: `${environment.DATABASE_URL}&sslmode=verify-full` },
  ]) {
    const f = fixture();
    assert.equal(await runStagingMigrations({ ...environment, ...extra }, f.options), 64);
    assert.deepEqual(f.calls, []);
    assert.ok(!f.output.join('\n').includes(environment.DATABASE_URL));
  }
  const f = fixture({ apply: false });
  assert.equal(await runStagingMigrations(environment, f.options), 64);
  assert.deepEqual(f.calls, []);
});

test('only deploys the pinned 16 migrations and keeps the application URL unchanged', async () => {
  const f = fixture({
    run: async (request) => {
      assert.deepEqual(request.args, [
        'node_modules/prisma/build/index.js',
        'migrate',
        'deploy',
        '--config',
        'prisma.config.ts',
      ]);
      const url = new URL(request.env.DATABASE_URL);
      assert.equal(url.searchParams.get('sslmode'), 'require');
      assert.equal(url.searchParams.get('sslaccept'), 'strict');
      assert.equal(url.hostname, new URL(environment.DATABASE_URL).hostname);
      for (const name of ['BREVO_API_KEY', 'IAM_JWT_PRIVATE_KEY', 'S3_SECRET_ACCESS_KEY'])
        assert.equal(request.env[name], undefined);
      return { status: 0, stdout: environment.DATABASE_URL, stderr: '' };
    },
  });
  const original = environment.DATABASE_URL;
  assert.equal(await runStagingMigrations(Object.freeze({ ...environment }), f.options), 0);
  assert.equal(environment.DATABASE_URL, original);
  assert.deepEqual(
    f.output.map((s) => JSON.parse(s)),
    [{ check: 'LOT14_MIGRATIONS', status: 'PASS', applied: 16, checksumsVerified: true }],
  );
});

test('refuses modified migration history before any child or database inspection', async () => {
  const entries = migrationManifest();
  entries[0] = { ...entries[0], checksum: 'changed' };
  const f = fixture({ manifest: () => entries });
  assert.equal(await runStagingMigrations(environment, f.options), 64);
  assert.deepEqual(f.calls, []);
  assert.equal(JSON.parse(f.output[0]).code, 'MIGRATION_MANIFEST_CHANGED');
});

test('filters child output to Prisma codes without echoing credentials or running post-verification', async () => {
  const f = fixture({
    run: async () => ({
      status: 1,
      stdout: environment.DATABASE_URL,
      stderr: `Error: P1011\n${environment.BREVO_API_KEY}`,
    }),
  });
  assert.equal(await runStagingMigrations(environment, f.options), 1);
  assert.deepEqual(f.calls, []);
  assert.deepEqual(JSON.parse(f.output[0]), {
    check: 'LOT14_MIGRATIONS',
    status: 'FAIL',
    code: 'MIGRATION_DEPLOY_FAILED',
    prismaCodes: ['P1011'],
  });
  assert.ok(!f.output.join('\n').includes('fixture'));
});

test('does not claim PASS when stored migration checksums or count differ', async () => {
  for (const inspect of [
    async () => [],
    async () => migrationManifest().map((row) => ({ ...row, checksum: 'wrong' })),
    async () => {
      throw new Error(environment.DATABASE_URL);
    },
  ]) {
    const f = fixture({ inspect });
    assert.equal(await runStagingMigrations(environment, f.options), 1);
    assert.equal(JSON.parse(f.output[0]).status, 'FAIL');
    assert.ok(!f.output.join('\n').includes(environment.DATABASE_URL));
  }
});

test('reports migration timeout without leaking error or child environment', async () => {
  const f = fixture({
    run: async () => ({
      status: null,
      error: { code: 'ETIMEDOUT', message: environment.DATABASE_URL },
    }),
  });
  assert.equal(await runStagingMigrations(environment, f.options), 1);
  assert.equal(JSON.parse(f.output[0]).code, 'MIGRATION_TIMEOUT');
  assert.ok(!f.output.join('\n').includes(environment.DATABASE_URL));
});

test('CLI rejects production and reset/seed arguments without executing migrations', () => {
  for (const args of [['--apply'], ['--reset'], ['--apply', '--seed']]) {
    const result = spawnSync(process.execPath, ['scripts/staging-migrate.mjs', ...args], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, ...environment, APP_ENV: 'production' },
      encoding: 'utf8',
    });
    assert.equal(result.status, 64);
    assert.equal(result.stderr, '');
    assert.ok(!result.stdout.includes(environment.DATABASE_URL));
  }
});
