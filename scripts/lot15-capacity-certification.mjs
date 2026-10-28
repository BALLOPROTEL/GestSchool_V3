import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

import { DOCUMENT_GENERATION_EVENT } from '../packages/contracts/dist/index.js';
import { createPrismaClient } from '../packages/database/dist/index.js';
import {
  PostgresHealth,
  RedisHealth,
  createDocumentQueue,
  createDocumentWorker,
  serializeCsv,
  serializePdf,
  serializeXlsx,
} from '../packages/infrastructure/dist/index.js';

const REDIS_IMAGE =
  'redis:8.10.1-alpine3.23@sha256:ef216d85ec44f4fdf7c0e6df2d1757a4734ed32fbb278cabd3181b5a27353b79';
const API_PORT = 3199;
const REDIS_PORT = 6382;
const redisPassword = randomBytes(24).toString('base64url');
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const redisContainer = `gestschool-lot15-capacity-${suffix}`;
const redisUrl = `redis://:${redisPassword}@127.0.0.1:${REDIS_PORT}/0`;
const queueRedisUrl = `redis://:${redisPassword}@127.0.0.1:${REDIS_PORT}/13`;
const apiBase = `http://127.0.0.1:${API_PORT}`;
const databaseUrl = process.env['DATABASE_URL'];

if (process.env['NODE_ENV'] !== 'test' || !databaseUrl)
  throw new Error('LOT15 capacity certification requires the isolated CI environment');

function docker(args, allowFailure = false) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 30_000 });
  if (!allowFailure && result.status !== 0) throw new Error('LOT15 Docker step failed');
  return result;
}

async function waitForRedis(timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = docker(
      ['exec', redisContainer, 'redis-cli', '--no-auth-warning', '-a', redisPassword, 'PING'],
      true,
    );
    if (result.status === 0 && result.stdout.trim() === 'PONG') return;
    await delay(200);
  }
  throw new Error('LOT15 Redis did not become ready');
}

async function waitForHttp(path, status, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${apiBase}${path}`, {
        signal: AbortSignal.timeout(8_000),
      });
      if (response.status === status) return response;
    } catch {
      // The process may still be starting or a dependency may be recovering.
    }
    await delay(200);
  }
  throw new Error('LOT15 API did not reach expected health state');
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? 0;
}

function summarize(durations, elapsedMs, errors = 0) {
  return {
    samples: durations.length,
    errors,
    p50Ms: Math.round(percentile(durations, 0.5)),
    p95Ms: Math.round(percentile(durations, 0.95)),
    p99Ms: Math.round(percentile(durations, 0.99)),
    throughputPerSec: Number(((durations.length / Math.max(elapsedMs, 1)) * 1000).toFixed(2)),
  };
}

async function benchmark(count, concurrency, operation) {
  const durations = [];
  let errors = 0;
  let cursor = 0;
  const started = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= count) return;
        const sampleStarted = performance.now();
        try {
          await operation(index);
        } catch {
          errors += 1;
        } finally {
          durations.push(performance.now() - sampleStarted);
        }
      }
    }),
  );
  return summarize(durations, performance.now() - started, errors);
}

function parseRedisInfo(text) {
  const values = new Map();
  for (const line of text.split('\n')) {
    const normalized = line.trim();
    if (!normalized || normalized.startsWith('#')) continue;
    const separator = normalized.indexOf(':');
    if (separator > 0) values.set(normalized.slice(0, separator), normalized.slice(separator + 1));
  }
  return values;
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(5_000).then(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }),
  ]);
}

let api;
let queue;
let worker;
let prisma;

try {
  docker([
    'run',
    '-d',
    '--name',
    redisContainer,
    '-p',
    `127.0.0.1:${REDIS_PORT}:6379`,
    REDIS_IMAGE,
    'redis-server',
    '--maxmemory',
    '64mb',
    '--maxmemory-policy',
    'noeviction',
    '--requirepass',
    redisPassword,
    '--protected-mode',
    'yes',
  ]);
  await waitForRedis();

  const apiEnvironment = {
    ...process.env,
    API_HOST: '127.0.0.1',
    API_PORT: String(API_PORT),
    REDIS_URL: redisUrl,
    S3_ACCESS_KEY_ID: 'gestschool-local',
    S3_SECRET_ACCESS_KEY: 'gestschool-local-secret',
    S3_BUCKET: 'gestschool-local-private',
    S3_ENDPOINT: 'http://127.0.0.1:9000',
    S3_FORCE_PATH_STYLE: 'true',
    S3_REGION: 'us-east-1',
    APP_PUBLIC_ORIGIN: 'http://127.0.0.1:3000',
    DOCUMENT_PUBLIC_ORIGIN: 'http://127.0.0.1:3000',
  };
  api = spawn(process.execPath, ['apps/api/dist/main.js'], {
    cwd: process.cwd(),
    env: apiEnvironment,
    stdio: 'ignore',
  });
  await waitForHttp('/health/ready', 200);

  const apiLive = await benchmark(300, 20, async () => {
    const response = await fetch(`${apiBase}/health/live`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (response.status !== 200) throw new Error('API live benchmark failed');
  });
  const apiReady = await benchmark(60, 6, async () => {
    const response = await fetch(`${apiBase}/health/ready`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status !== 200) throw new Error('API ready benchmark failed');
  });

  const postgres = new PostgresHealth(databaseUrl);
  const postgresHealth = await benchmark(100, 10, () => postgres.check());
  const redis = new RedisHealth(redisUrl);
  const redisHealth = await benchmark(150, 15, () => redis.check());

  queue = createDocumentQueue(queueRedisUrl);
  await queue.waitUntilReady();
  const enqueuedAt = new Map();
  const jobDurations = [];
  const jobCount = 100;
  let processed = 0;
  let finishWorker;
  const workerDone = new Promise((resolve) => {
    finishWorker = resolve;
  });
  worker = createDocumentWorker(queueRedisUrl, async ({ documentId }) => {
    const started = enqueuedAt.get(documentId);
    if (started !== undefined) jobDurations.push(performance.now() - started);
    processed += 1;
    if (processed === jobCount) finishWorker();
  });
  worker.on('error', () => undefined);
  await worker.waitUntilReady();

  const workerStarted = performance.now();
  for (let index = 0; index < jobCount; index += 1) {
    const tenantId = randomUUID();
    const documentId = randomUUID();
    enqueuedAt.set(documentId, performance.now());
    await queue.add(
      DOCUMENT_GENERATION_EVENT,
      { tenantId, documentId },
      { jobId: `lot15-capacity-${documentId}` },
    );
  }
  await Promise.race([
    workerDone,
    delay(20_000).then(() => {
      throw new Error('LOT15 BullMQ capacity timeout');
    }),
  ]);
  const workerElapsedMs = performance.now() - workerStarted;
  const bullmq = summarize(jobDurations, workerElapsedMs, jobCount - processed);

  const columns = ['id', 'student', 'class', 'status', 'amount', 'date', 'locale', 'note'];
  const reportPage = {
    type: 'STUDENTS',
    columns,
    items: Array.from({ length: 1000 }, (_, index) => ({
      id: index + 1,
      student: `Student ${index + 1}`,
      class: `C-${index % 20}`,
      status: index % 3 === 0 ? 'ACTIVE' : 'PENDING',
      amount: index * 100,
      date: '2026-10-28',
      locale: index % 2 === 0 ? 'fr' : 'en',
      note: `Synthetic row ${index + 1}`,
    })),
    page: 1,
    pageSize: 1000,
    total: 1000,
  };
  const csv = await benchmark(100, 1, async () => {
    const bytes = serializeCsv(reportPage);
    if (bytes.length < 1000) throw new Error('CSV capacity output invalid');
  });
  const xlsx = await benchmark(30, 1, async () => {
    const bytes = serializeXlsx(reportPage);
    if (!bytes.subarray(0, 2).equals(Buffer.from('PK')))
      throw new Error('XLSX capacity output invalid');
  });
  const pdfPage = {
    ...reportPage,
    items: reportPage.items.slice(0, 100),
    pageSize: 100,
    total: 100,
  };
  const pdfStarted = performance.now();
  const pdfBytes = await serializePdf(pdfPage, 'fr');
  const pdfMs = Math.round(performance.now() - pdfStarted);
  if (!pdfBytes.subarray(0, 5).equals(Buffer.from('%PDF-')))
    throw new Error('PDF capacity output invalid');

  prisma = createPrismaClient(databaseUrl);
  const [databaseSaturation] = await prisma.$queryRawUnsafe(
    "SELECT count(*)::int AS total, count(*) FILTER (WHERE state='active')::int AS active FROM pg_stat_activity WHERE datname=current_database()",
  );

  const memoryInfo = parseRedisInfo(
    docker([
      'exec',
      redisContainer,
      'redis-cli',
      '--no-auth-warning',
      '-a',
      redisPassword,
      'INFO',
      'memory',
    ]).stdout,
  );
  const clientInfo = parseRedisInfo(
    docker([
      'exec',
      redisContainer,
      'redis-cli',
      '--no-auth-warning',
      '-a',
      redisPassword,
      'INFO',
      'clients',
    ]).stdout,
  );
  const usedMemoryBytes = Number(memoryInfo.get('used_memory') ?? '0');
  const maxMemoryBytes = Number(memoryInfo.get('maxmemory') ?? '0');
  const redisMemoryPct =
    maxMemoryBytes > 0 ? Number(((usedMemoryBytes / maxMemoryBytes) * 100).toFixed(2)) : 0;

  docker(['stop', redisContainer]);
  const partialFailureStarted = performance.now();
  const liveDuringRedisFailure = await fetch(`${apiBase}/health/live`, {
    signal: AbortSignal.timeout(5_000),
  });
  const readyDuringRedisFailure = await fetch(`${apiBase}/health/ready`, {
    signal: AbortSignal.timeout(8_000),
  });
  const failureDetectionMs = Math.round(performance.now() - partialFailureStarted);

  docker(['start', redisContainer]);
  await waitForRedis();
  const recoveryStarted = performance.now();
  await waitForHttp('/health/ready', 200, 15_000);
  const recoveryMs = Math.round(performance.now() - recoveryStarted);

  const limits = {
    apiLiveP95Ms: 500,
    apiLiveP99Ms: 1000,
    apiReadyP95Ms: 2500,
    apiReadyP99Ms: 5000,
    postgresP95Ms: 1000,
    redisP95Ms: 1000,
    bullmqP95Ms: 5000,
    bullmqMinThroughputPerSec: 10,
    csvP95Ms: 250,
    xlsxP95Ms: 1000,
    pdfMaxMs: 30000,
    postgresMaxConnections: 80,
    redisMemoryMaxPct: 75,
    failureDetectionMaxMs: 7000,
    recoveryMaxMs: 15000,
  };

  const violations = [];
  const requireLimit = (condition, code) => {
    if (!condition) violations.push(code);
  };
  requireLimit(apiLive.errors === 0, 'API_LIVE_ERRORS');
  requireLimit(apiReady.errors === 0, 'API_READY_ERRORS');
  requireLimit(postgresHealth.errors === 0, 'POSTGRES_ERRORS');
  requireLimit(redisHealth.errors === 0, 'REDIS_ERRORS');
  requireLimit(bullmq.errors === 0, 'BULLMQ_ERRORS');
  requireLimit(csv.errors === 0 && xlsx.errors === 0, 'EXPORT_ERRORS');
  requireLimit(apiLive.p95Ms <= limits.apiLiveP95Ms, 'API_LIVE_P95');
  requireLimit(apiLive.p99Ms <= limits.apiLiveP99Ms, 'API_LIVE_P99');
  requireLimit(apiReady.p95Ms <= limits.apiReadyP95Ms, 'API_READY_P95');
  requireLimit(apiReady.p99Ms <= limits.apiReadyP99Ms, 'API_READY_P99');
  requireLimit(postgresHealth.p95Ms <= limits.postgresP95Ms, 'POSTGRES_P95');
  requireLimit(redisHealth.p95Ms <= limits.redisP95Ms, 'REDIS_P95');
  requireLimit(bullmq.p95Ms <= limits.bullmqP95Ms, 'BULLMQ_P95');
  requireLimit(bullmq.throughputPerSec >= limits.bullmqMinThroughputPerSec, 'BULLMQ_THROUGHPUT');
  requireLimit(csv.p95Ms <= limits.csvP95Ms, 'CSV_P95');
  requireLimit(xlsx.p95Ms <= limits.xlsxP95Ms, 'XLSX_P95');
  requireLimit(pdfMs <= limits.pdfMaxMs, 'PDF_DURATION');
  requireLimit(
    Number(databaseSaturation?.total ?? 0) <= limits.postgresMaxConnections,
    'POSTGRES_CONNECTIONS',
  );
  requireLimit(redisMemoryPct <= limits.redisMemoryMaxPct, 'REDIS_MEMORY');
  requireLimit(liveDuringRedisFailure.status === 200, 'PARTIAL_FAILURE_LIVENESS');
  requireLimit(readyDuringRedisFailure.status === 503, 'PARTIAL_FAILURE_READINESS');
  requireLimit(failureDetectionMs <= limits.failureDetectionMaxMs, 'FAILURE_DETECTION');
  requireLimit(recoveryMs <= limits.recoveryMaxMs, 'RECOVERY_TIME');

  const report = {
    check: 'LOT15_CAPACITY',
    status: violations.length ? 'NO_GO' : 'PASS',
    profile: {
      environment: 'LOCAL_CI_ONLY',
      apiLive: { requests: 300, concurrency: 20 },
      apiReady: { requests: 60, concurrency: 6 },
      postgresHealth: { checks: 100, concurrency: 10 },
      redisHealth: { checks: 150, concurrency: 15 },
      bullmq: { jobs: jobCount, workerConcurrency: 2 },
      exports: { csv: 100, xlsx: 30, pdfRows: 100 },
    },
    measurements: {
      apiLive,
      apiReady,
      postgresHealth,
      redisHealth,
      bullmq,
      csv,
      xlsx,
      pdfMs,
      postgresConnections: databaseSaturation,
      redis: {
        usedMemoryBytes,
        maxMemoryBytes,
        memoryPct: redisMemoryPct,
        connectedClients: Number(clientInfo.get('connected_clients') ?? '0'),
      },
      partialFailure: {
        liveStatus: liveDuringRedisFailure.status,
        readyStatus: readyDuringRedisFailure.status,
        failureDetectionMs,
        recoveryMs,
      },
    },
    limits,
    violations,
  };
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (violations.length) throw new Error('LOT15_CAPACITY_NO_GO');
} finally {
  await prisma?.$disconnect().catch(() => undefined);
  await worker?.close().catch(() => undefined);
  await queue?.close().catch(() => undefined);
  await stopProcess(api);
  docker(['rm', '-f', redisContainer], true);
}
