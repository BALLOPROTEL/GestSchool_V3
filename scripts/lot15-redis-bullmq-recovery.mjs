import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

import {
  createDocumentQueue,
  createDocumentWorker,
} from '../packages/infrastructure/dist/index.js';
import { DOCUMENT_GENERATION_EVENT } from '../packages/contracts/dist/index.js';

const REDIS_IMAGE =
  'redis:8.10.1-alpine3.23@sha256:ef216d85ec44f4fdf7c0e6df2d1757a4734ed32fbb278cabd3181b5a27353b79';
const password = 'gestschool-lot15-ci-only';
const port = '6381';
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const container = `gestschool-lot15-redis-${suffix}`;
const volume = `gestschool-lot15-redis-data-${suffix}`;
const redisUrl = `redis://:${password}@127.0.0.1:${port}/0`;

if (process.env['NODE_ENV'] !== 'test')
  throw new Error('Redis/BullMQ recovery certification is restricted to NODE_ENV=test');

function docker(args, allowFailure = false) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (!allowFailure && result.status !== 0)
    throw new Error('Redis/BullMQ Docker certification step failed');
  return result;
}

async function waitForRedis() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = docker(
      ['exec', container, 'redis-cli', '--no-auth-warning', '-a', password, 'PING'],
      true,
    );
    if (result.status === 0 && result.stdout.trim() === 'PONG') return;
    await setTimeout(250);
  }
  throw new Error('Redis did not become ready');
}

function redisConfig(name) {
  const result = docker([
    'exec',
    container,
    'redis-cli',
    '--no-auth-warning',
    '-a',
    password,
    'CONFIG',
    'GET',
    name,
  ]);
  return result.stdout.trim().split(/\s+/).at(-1);
}

async function waitForCount(counts, id, expected, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((counts.get(id) ?? 0) === expected) return;
    await setTimeout(100);
  }
  throw new Error('BullMQ worker did not reach the expected processing count');
}

async function addAfterReconnect(queue, name, data, jobId) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      return await queue.add(name, data, { jobId });
    } catch {
      await setTimeout(250);
    }
  }
  throw new Error('BullMQ producer did not recover after Redis restart');
}

let queue;
let worker;

try {
  docker(['volume', 'create', volume]);
  docker([
    'run',
    '-d',
    '--name',
    container,
    '-p',
    `127.0.0.1:${port}:6379`,
    '--mount',
    `source=${volume},target=/data`,
    REDIS_IMAGE,
    'redis-server',
    '--appendonly',
    'yes',
    '--appendfsync',
    'always',
    '--requirepass',
    password,
    '--protected-mode',
    'yes',
  ]);
  await waitForRedis();

  if (redisConfig('appendonly') !== 'yes' || redisConfig('appendfsync') !== 'always')
    throw new Error('Redis persistence configuration is not active');

  const tenantId = randomUUID();
  const firstId = randomUUID();
  queue = createDocumentQueue(redisUrl);
  queue.on('error', () => undefined);
  await queue.waitUntilReady();
  await queue.add(DOCUMENT_GENERATION_EVENT, { tenantId, documentId: firstId }, { jobId: firstId });
  await queue.close();
  queue = undefined;

  docker(['stop', container]);
  docker(['start', container]);
  await waitForRedis();

  queue = createDocumentQueue(redisUrl);
  queue.on('error', () => undefined);
  await queue.waitUntilReady();
  const recovered = await queue.getJob(firstId);
  if (!recovered) throw new Error('Queued BullMQ job did not survive Redis restart');

  const processed = new Map();
  worker = createDocumentWorker(redisUrl, async ({ documentId }) => {
    processed.set(documentId, (processed.get(documentId) ?? 0) + 1);
  });
  worker.on('error', () => undefined);
  await worker.waitUntilReady();
  await waitForCount(processed, firstId, 1);

  const completed = await queue.getJob(firstId);
  if (!completed || (await completed.getState()) !== 'completed')
    throw new Error('Recovered BullMQ job did not complete');

  await queue.add(DOCUMENT_GENERATION_EVENT, { tenantId, documentId: firstId }, { jobId: firstId });
  await setTimeout(750);
  if (processed.get(firstId) !== 1)
    throw new Error('BullMQ jobId deduplication allowed duplicate processing');

  docker(['stop', container]);
  docker(['start', container]);
  await waitForRedis();

  const secondId = randomUUID();
  await addAfterReconnect(
    queue,
    DOCUMENT_GENERATION_EVENT,
    { tenantId, documentId: secondId },
    secondId,
  );
  await waitForCount(processed, secondId, 1);

  const second = await queue.getJob(secondId);
  if (!second || (await second.getState()) !== 'completed')
    throw new Error('BullMQ worker did not recover after Redis restart');

  process.stdout.write(
    JSON.stringify({
      check: 'LOT15_REDIS_BULLMQ_RECOVERY',
      status: 'PASS',
      persistence: 'AOF_ALWAYS',
      queuedJobSurvivedRestart: true,
      duplicateProcessingBlocked: true,
      liveQueueRecoveredAfterRestart: true,
      liveWorkerRecoveredAfterRestart: true,
    }) + '\n',
  );
} finally {
  await worker?.close().catch(() => undefined);
  await queue?.close().catch(() => undefined);
  docker(['rm', '-f', container], true);
  docker(['volume', 'rm', '-f', volume], true);
}
