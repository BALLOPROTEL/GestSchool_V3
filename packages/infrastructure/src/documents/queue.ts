import {
  DelayedError,
  Queue,
  Worker,
  RedisConnection,
  createNodeRedisClient,
  type ConnectionOptions,
} from 'bullmq';
import { createClient } from 'redis';
import { DOCUMENT_QUEUE, documentJobData } from '@gestschool/contracts';

export function bullmqConnection(url: string): ConnectionOptions {
  // BullMQ defaults to the optional ioredis peer. Reuse the existing node-redis
  // driver through its supported adapter, including worker-owned duplicate connections.
  RedisConnection.clientFactory = (options) =>
    createNodeRedisClient(
      createClient({
        socket: {
          host: options.host ?? '127.0.0.1',
          port: options.port ?? 6379,
          connectTimeout: 2000,
          ...(options.tls ? { tls: true as const } : {}),
        },
        ...(options.username ? { username: options.username } : {}),
        ...(options.password ? { password: options.password } : {}),
        database: options.db ?? 0,
        disableOfflineQueue: options.enableOfflineQueue === false,
      }),
    );
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
    db: Number(parsed.pathname.slice(1) || 0),
    maxRetriesPerRequest: null,
    connectTimeout: 2000,
  };
}
export function createDocumentQueue(url: string) {
  return new Queue(DOCUMENT_QUEUE, {
    connection: { ...bullmqConnection(url), maxRetriesPerRequest: 1, enableOfflineQueue: false },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      // Keep deduplication IDs. A future retention task must also respect the DB terminal state.
      removeOnComplete: false,
      removeOnFail: false,
    },
  });
}
export function createDocumentWorker(
  url: string,
  run: (data: { tenantId: string; documentId: string }) => Promise<void>,
) {
  return new Worker(
    DOCUMENT_QUEUE,
    async (job, token) => {
      try {
        await run(documentJobData.parse(job.data as unknown));
      } catch (error) {
        if (error instanceof Error && error.message === 'DOCUMENT_LEASE_BUSY') {
          await job.moveToDelayed(Date.now() + 90_000, token);
          throw new DelayedError();
        }
        throw error;
      }
    },
    { connection: bullmqConnection(url), concurrency: 2, lockDuration: 90_000, maxStalledCount: 2 },
  );
}
