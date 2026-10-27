import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import pg from 'pg';

const POSTGRES_IMAGE =
  'postgres:18.6-trixie@sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6';

const sourceValue = process.env['DATABASE_URL'];
if (process.env['NODE_ENV'] !== 'test' || !sourceValue)
  throw new Error('Backup/restore certification is restricted to NODE_ENV=test');

const sourceUrl = new URL(sourceValue);
if (
  sourceUrl.protocol !== 'postgresql:' ||
  !['127.0.0.1', 'localhost'].includes(sourceUrl.hostname)
)
  throw new Error('Backup/restore certification is restricted to local PostgreSQL');

const sourceDatabase = sourceUrl.pathname.slice(1);
if (!/^gestschool(?:_[a-z0-9_]+)?$/.test(sourceDatabase))
  throw new Error('Backup/restore certification requires a GestSchool test database');

const username = decodeURIComponent(sourceUrl.username);
const password = decodeURIComponent(sourceUrl.password);
if (!username || !password) throw new Error('Local PostgreSQL credentials are required');

const port = sourceUrl.port || '5432';
const targetDatabase = `gestschool_lot15_restore_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const targetUrl = new URL(sourceUrl);
targetUrl.pathname = `/${targetDatabase}`;
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = '/postgres';

const workdir = await mkdtemp(join(tmpdir(), 'gestschool-lot15-pg-'));
const dumpPath = join(workdir, 'backup.dump');
const source = new pg.Client({ connectionString: sourceUrl.toString() });
const target = new pg.Client({ connectionString: targetUrl.toString() });
const admin = new pg.Client({ connectionString: adminUrl.toString() });

const quote = (value) => '"' + value.replaceAll('"', '""') + '"';

function runPostgresTool(command, args, input) {
  const result = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--network',
      'host',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges:true',
      '-e',
      'PGPASSWORD',
      '--entrypoint',
      command,
      POSTGRES_IMAGE,
      ...args,
    ],
    {
      encoding: null,
      env: { ...process.env, PGPASSWORD: password },
      input,
      maxBuffer: 64 * 1024 * 1024,
      timeout: 120_000,
    },
  );
  if (result.status !== 0) throw new Error(`PostgreSQL ${command} certification step failed`);
  return result.stdout ?? Buffer.alloc(0);
}

async function fingerprintRows(client) {
  const tables = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name",
  );
  const output = [];
  for (const { table_name: table } of tables.rows) {
    const rows = await client.query(
      `SELECT row_to_json(t)::text AS row FROM (SELECT * FROM public.${quote(
        table,
      )}) t ORDER BY row_to_json(t)::text`,
    );
    const hash = createHash('sha256');
    for (const row of rows.rows) hash.update(String(row.row) + '\n');
    output.push({ table, count: rows.rowCount ?? 0, hash: hash.digest('hex') });
  }
  return output;
}

async function fingerprintSchema(client) {
  const queries = [
    `SELECT table_name,column_name,ordinal_position,is_nullable,data_type,udt_name,
       coalesce(column_default,'') AS column_default
       FROM information_schema.columns
       WHERE table_schema='public'
       ORDER BY table_name,ordinal_position`,
    `SELECT c.relname AS table_name,con.conname,
       pg_get_constraintdef(con.oid,true) AS definition
       FROM pg_constraint con
       JOIN pg_class c ON c.oid=con.conrelid
       JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public'
       ORDER BY c.relname,con.conname`,
    `SELECT tablename,indexname,indexdef
       FROM pg_indexes
       WHERE schemaname='public'
       ORDER BY tablename,indexname`,
    `SELECT sequencename,data_type,start_value,min_value,max_value,increment_by,cycle
       FROM pg_sequences
       WHERE schemaname='public'
       ORDER BY sequencename`,
  ];
  const hash = createHash('sha256');
  for (const query of queries) {
    const rows = await client.query(query);
    hash.update(JSON.stringify(rows.rows));
  }
  return hash.digest('hex');
}

const started = performance.now();
let backupMs = 0;
let restoreMs = 0;
let verifyMs = 0;
let targetCreated = false;

try {
  await source.connect();
  await admin.connect();

  const backupStarted = performance.now();
  const dump = runPostgresTool('pg_dump', [
    '-h',
    sourceUrl.hostname,
    '-p',
    port,
    '-U',
    username,
    '-d',
    sourceDatabase,
    '-Fc',
    '--no-owner',
    '--no-privileges',
  ]);
  backupMs = performance.now() - backupStarted;

  if (dump.length <= 5 || dump.subarray(0, 5).toString('ascii') !== 'PGDMP')
    throw new Error('PostgreSQL backup artifact is invalid');
  await writeFile(dumpPath, dump, { mode: 0o600 });
  const backup = await stat(dumpPath);
  if (backup.size !== dump.length) throw new Error('PostgreSQL backup artifact size mismatch');

  await admin.query(
    `CREATE DATABASE ${quote(targetDatabase)} TEMPLATE template0 ENCODING 'UTF8'`,
  );
  targetCreated = true;

  const restoreStarted = performance.now();
  runPostgresTool(
    'pg_restore',
    [
      '-h',
      sourceUrl.hostname,
      '-p',
      port,
      '-U',
      username,
      '-d',
      targetDatabase,
      '--no-owner',
      '--no-privileges',
      '--exit-on-error',
    ],
    dump,
  );
  restoreMs = performance.now() - restoreStarted;

  await target.connect();
  const verifyStarted = performance.now();
  const [sourceRows, targetRows, sourceSchema, targetSchema] = await Promise.all([
    fingerprintRows(source),
    fingerprintRows(target),
    fingerprintSchema(source),
    fingerprintSchema(target),
  ]);
  verifyMs = performance.now() - verifyStarted;

  if (JSON.stringify(sourceRows) !== JSON.stringify(targetRows))
    throw new Error('Restored PostgreSQL row fingerprints do not match source');
  if (sourceSchema !== targetSchema)
    throw new Error('Restored PostgreSQL schema fingerprint does not match source');

  const migrationProof = targetRows.find((item) => item.table === '_prisma_migrations');
  if (!migrationProof || migrationProof.count === 0)
    throw new Error('Restored PostgreSQL database is missing migration history');

  process.stdout.write(
    JSON.stringify({
      check: 'LOT15_POSTGRES_BACKUP_RESTORE',
      status: 'PASS',
      tables: targetRows.length,
      backupBytes: backup.size,
      durationMs: {
        backup: Math.round(backupMs),
        restore: Math.round(restoreMs),
        verify: Math.round(verifyMs),
        total: Math.round(performance.now() - started),
      },
    }) + '\n',
  );
} finally {
  await target.end().catch(() => undefined);
  if (targetCreated) {
    await admin
      .query(`DROP DATABASE IF EXISTS ${quote(targetDatabase)} WITH (FORCE)`)
      .catch(() => undefined);
  }
  await source.end().catch(() => undefined);
  await admin.end().catch(() => undefined);
  await rm(workdir, { recursive: true, force: true });
}
