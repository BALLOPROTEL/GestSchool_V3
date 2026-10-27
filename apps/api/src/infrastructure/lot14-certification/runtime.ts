import { readAuthState } from './auth-state.js';
import { authenticate } from './authentication.js';
import { cleanupSession } from './cleanup.js';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { roleGrants } from '@gestschool/contracts';
import { createPrismaClient } from '@gestschool/database';
import { createReportsQueue, S3StorageAdapter } from '@gestschool/infrastructure';
import { IamCrypto, Passwords } from '../../modules/iam/infrastructure/crypto.js';
import { loadIamConfig } from '../../modules/iam/infrastructure/iam-config.js';
import { certificationEnabled, failure, roles, type Role } from './config.js';
import { CertificationHttp, items, object, requireStatus, text } from './http.js';
import { fixtures, scenario, type Account, type Graph } from './fixtures.js';
import type { CertificationTasks, SafeRecord } from './orchestrator.js';
import { authRequest, CertificationAuthFailure, preparationStep } from './diagnostics.js';

interface Sql {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  connect(): Promise<void>;
  end(): Promise<void>;
  on(event: string, callback: () => void): void;
  connection: { stream: { destroy(): void } };
}
interface BootstrapModule {
  inspectBootstrap(
    client: Sql,
    input: {
      grants: typeof roleGrants;
      verifyIdentity(user: { passwordVariable: string }, hash: string): Promise<boolean>;
    },
  ): Promise<unknown>;
}

export function productionTasks(
  port: number,
  environment: NodeJS.ProcessEnv,
  emit: (record: SafeRecord) => void = () => {},
): CertificationTasks {
  if (!certificationEnabled(environment)) throw failure();
  const infrastructure = loadInfrastructureConfig(environment);
  if (
    infrastructure.storage.endpoint !==
      'https://rwmuksaafbnphurxaofq.storage.supabase.co/storage/v1/s3' ||
    infrastructure.storage.bucket !== 'gestschool-v3-staging-private' ||
    infrastructure.storage.region !== 'eu-west-1' ||
    !infrastructure.storage.forcePathStyle
  )
    throw failure();
  const crypto = new IamCrypto(loadIamConfig(environment));
  const passwords = new Passwords();
  const { Client } = createRequire(
    new URL('../../../../../packages/infrastructure/package.json', import.meta.url),
  )('pg') as { Client: new (options: unknown) => Sql };
  const sql = new Client({
    connectionString: infrastructure.databaseUrl,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  });
  sql.on('error', () => undefined);
  const db = createPrismaClient(infrastructure.databaseUrl);
  const storage = new S3StorageAdapter(infrastructure.storage);
  const queue = createReportsQueue(infrastructure.redisUrl);
  queue.on('error', () => undefined);
  const sessions: CertificationHttp[] = [];
  const accounts: Account[] = [];
  let a: Graph, b: Graph;
  let locked = false;

  async function healthy(signal: AbortSignal) {
    const http = new CertificationHttp(port, signal);
    try {
      const api = await authRequest(http, 'READINESS', 'health/ready', 200);
      const dependencies = object(api.body.dependencies);
      if (
        api.body.status !== 'ok' ||
        ['postgres', 'redis', 'storage'].some((name) => dependencies[name] !== 'up')
      )
        throw failure();
      const workerHealth = await fetch(
        'https://gestschool-v3-worker-staging.onrender.com/health/ready',
        {
          redirect: 'manual',
          signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
        },
      );
      if (workerHealth.status !== 200 || object(await workerHealth.json()).status !== 'ok')
        throw failure();
    } finally {
      http.clear();
    }
  }

  const authentication = {
    port,
    environment,
    crypto,
    sessions,
    accounts,
    async readMfa(email: string, tenantId: string) {
      const { rows } = await sql.query(
        `SELECT u.id,a.mfa_secret,a.mfa_last_counter
          FROM users u JOIN auth_identities a ON a.user_id=u.id
          JOIN memberships m ON m.user_id=u.id
          WHERE u.email=$1 AND m.tenant_id=$2 AND m.status='ACTIVE' AND a.mfa_enabled_at IS NOT NULL`,
        [email, tenantId],
      );
      return rows;
    },
  };

  async function bindings(graph: Graph) {
    for (const [table, id, userId] of [
      ['students', graph.student, graph.accounts.STUDENT.userId],
      ['guardians', graph.guardian, graph.accounts.PARENT.userId],
      ['teachers', graph.teacher, graph.accounts.TEACHER.userId],
    ]) {
      // Table is a closed local literal, values remain bound. No business fixture SQL writes.
      const { rows } = await sql.query(
        `SELECT user_id FROM ${table} WHERE id=$1 AND tenant_id=$2`,
        [id, graph.accounts.SCHOOL_ADMIN.tenantId],
      );
      if (rows.length !== 1 || rows[0]?.user_id !== userId) throw failure();
    }
  }

  async function worker(signal: AbortSignal) {
    await healthy(signal);
    const http = a.accounts.SCHOOL_ADMIN.http;
    // Fresh key per run proves a new worker traversal. Retry of this same HTTP request is
    // deliberately repeated with the same key to verify idempotency without a second job.
    const key = randomUUID();
    const input = {
      reportType: 'STUDENTS',
      format: 'CSV',
      locale: 'fr',
      filters: { classId: a.classroom },
    };
    const created = await http.send('report-exports', 'POST', input, { 'Idempotency-Key': key });
    requireStatus(created, 202);
    const exportId = text(created.body.id);
    const duplicate = await http.send('report-exports', 'POST', input, { 'Idempotency-Key': key });
    requireStatus(duplicate, 202);
    if (duplicate.body.id !== exportId) throw failure();
    const deadline = Date.now() + 120_000;
    for (;;) {
      signal.throwIfAborted();
      const rows = items(await http.send('report-exports?pageSize=100'));
      const observed = rows.find((item) => item.id === exportId);
      if (!observed || ['FAILED', 'EXPIRED'].includes(String(observed.status))) throw failure();
      if (observed.status === 'READY') break;
      if (Date.now() >= deadline) throw failure();
      await delay(2000, undefined, { signal });
    }
    const tenantId = a.accounts.SCHOOL_ADMIN.tenantId;
    const row = await db.reportExport.findFirst({
      where: { id: exportId, tenantId, idempotencyKey: key },
    });
    const events = await db.outboxEvent.findMany({
      where: { tenantId, aggregateId: exportId, eventType: 'reports.export.requested.v1' },
    });
    const generated = await db.auditLog.count({
      where: { tenantId, entityId: exportId, action: 'report.export.generated' },
    });
    const job = await queue.getJob(exportId);
    // The DB may reach READY just before BullMQ acknowledges completion.
    let completed = false;
    for (let check = 0; check < 10; check++) {
      if (!job) break;
      if ((await job.getState()) === 'completed') {
        completed = true;
        break;
      }
      await delay(500, undefined, { signal });
    }
    // BullMQ Job instances are snapshots; reload attemptsMade after the completion ACK.
    const completedJob = await queue.getJob(exportId);
    if (
      !row ||
      row.status !== 'READY' ||
      !row.startedAt ||
      !row.completedAt ||
      row.attempts !== 1 ||
      !row.storageKey ||
      !row.checksum ||
      row.rowCount !== 1 ||
      generated !== 1 ||
      events.length !== 1 ||
      events[0]?.status !== 'PROCESSED' ||
      !events[0]?.processedAt ||
      events[0]?.attempts !== 1 ||
      !completedJob ||
      !completed ||
      completedJob.attemptsMade !== 1 ||
      completedJob.data.tenantId !== tenantId ||
      completedJob.data.exportId !== exportId
    )
      throw failure();
    const bytes = Buffer.from(await storage.getReport(row.storageKey, 'text/csv; charset=utf-8'));
    if (
      createHash('sha256').update(bytes).digest('hex') !== row.checksum ||
      BigInt(bytes.length) !== row.sizeBytes
    )
      throw failure();
    const download = await http.send(`report-exports/${exportId}/download`);
    requireStatus(download, 200);
    if (
      !download.bytes.equals(bytes) ||
      download.headers['cache-control'] !== 'private, no-store' ||
      !bytes.includes(Buffer.from('LOT14_RUN_V1_A_Student')) ||
      bytes.includes(Buffer.from('LOT14_RUN_V1_B_Student'))
    )
      throw failure();
    requireStatus(
      await b.accounts.SCHOOL_ADMIN.http.send(`report-exports/${exportId}/download`),
      404,
      'REPORT_EXPORT_NOT_FOUND',
    );
    const config = infrastructure.storage;
    if (
      config.endpoint !== 'https://rwmuksaafbnphurxaofq.storage.supabase.co/storage/v1/s3' ||
      config.bucket !== 'gestschool-v3-staging-private'
    )
      throw failure();
    for (const url of [
      `${config.endpoint}/${config.bucket}/${row.storageKey}`,
      `https://rwmuksaafbnphurxaofq.supabase.co/storage/v1/object/public/${config.bucket}/${row.storageKey}`,
    ]) {
      const anonymous = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      });
      await anonymous.body?.cancel();
      if (
        !(url.includes('/object/public/') ? [400, 401, 403, 404] : [401, 403]).includes(
          anonymous.status,
        )
      )
        throw failure();
    }
    // No explicit enqueue, dispatch, generation, email or WhatsApp call in this process.
  }

  return {
    async prepare(signal) {
      await preparationStep('PREREQUISITE_HEALTH', 'AUTH_PREREQUISITE_UNHEALTHY', () =>
        healthy(signal),
      );
      await preparationStep('BOOTSTRAP_DB_CONNECT', 'AUTH_BOOTSTRAP_DB_UNAVAILABLE', () =>
        sql.connect(),
      );
      const target = await preparationStep(
        'BOOTSTRAP_TARGET',
        'AUTH_BOOTSTRAP_DB_UNAVAILABLE',
        () =>
          sql.query(
            'SELECT current_database() AS name, pg_try_advisory_lock(hashtext($1)) AS locked',
            ['lot14-certification-v1'],
          ),
      );
      locked = target.rows[0]?.locked === true;
      if (!locked || target.rows[0]?.name !== 'gestschool_v3_postgres_staging')
        throw new CertificationAuthFailure({
          code: 'AUTH_FIXTURE_MISMATCH',
          operation: 'BOOTSTRAP_TARGET',
        });
      await preparationStep('BOOTSTRAP_INSPECT', 'AUTH_BOOTSTRAP_INSPECTION_FAILED', async () => {
        const moduleUrl = new URL('../../../../../scripts/staging-bootstrap.mjs', import.meta.url);
        const bootstrap = (await import(moduleUrl.href)) as BootstrapModule;
        try {
          await bootstrap.inspectBootstrap(sql, {
            grants: roleGrants,
            verifyIdentity: (user, hash) =>
              passwords.verify(hash, environment[user.passwordVariable] ?? ''),
          });
        } catch (error) {
          if (error instanceof Error && error.message === 'BOOTSTRAP_COLLISION')
            throw new CertificationAuthFailure({
              code: 'AUTH_FIXTURE_MISMATCH',
              operation: 'BOOTSTRAP_INSPECT',
            });
          throw error;
        }
      });
      const tenants = await preparationStep(
        'BOOTSTRAP_TENANTS',
        'AUTH_BOOTSTRAP_DB_UNAVAILABLE',
        () =>
          sql.query(
            "SELECT id,slug FROM tenants WHERE slug IN ('lot14-certification-a','lot14-certification-b')",
          ),
      );
      await preparationStep('BOOTSTRAP_STATE', 'AUTH_BOOTSTRAP_DB_UNAVAILABLE', async () => {
        emit(
          await readAuthState(
            sql,
            tenants.rows.map((row) => text(row.id)),
          ),
        );
      });
      const groups: Record<Role, Account>[] = [];
      for (const label of ['A', 'B'] as const) {
        const tenantId = text(
          tenants.rows.find((row) => row.slug === `lot14-certification-${label.toLowerCase()}`)?.id,
        );
        const group = {} as Record<Role, Account>;
        for (const role of roles)
          group[role] = await authenticate(label, role, tenantId, signal, authentication);
        groups.push(group);
      }
      a = await preparationStep('FIXTURES_A', 'AUTH_FIXTURE_MISMATCH', () =>
        fixtures('A', groups[0]!),
      );
      await preparationStep('FIXTURES_A', 'AUTH_FIXTURE_MISMATCH', () => bindings(a));
      b = await preparationStep('FIXTURES_B', 'AUTH_FIXTURE_MISMATCH', () =>
        fixtures('B', groups[1]!),
      );
      await preparationStep('FIXTURES_B', 'AUTH_FIXTURE_MISMATCH', () => bindings(b));
    },
    async scenario(index) {
      await scenario(index, a, b);
    },
    worker,
    async close() {
      let failed = false;
      // The run abort signal may already be expired. Use a separate bounded cleanup window.
      const cleanupSignal = AbortSignal.timeout(20_000);
      for (const account of accounts) {
        try {
          await cleanupSession(account, cleanupSignal);
        } catch {
          failed = true;
        }
      }
      for (const http of sessions) http.clear();
      // Closing the dedicated SQL connection releases its session advisory lock automatically.
      locked = false;
      const closed = await Promise.allSettled([queue.close(), db.$disconnect(), sql.end()]);
      storage.close();
      sql.connection.stream.destroy();
      if (failed || closed.some((result) => result.status === 'rejected')) throw failure();
    },
  };
}
