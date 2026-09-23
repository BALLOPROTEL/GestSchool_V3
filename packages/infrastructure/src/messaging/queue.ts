import { Queue, Worker } from 'bullmq';
import { MESSAGING_QUEUE, messagingJobData } from '@gestschool/contracts';
import { bullmqConnection } from '../documents/queue.js';

export const messagingRetryPolicy = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 5000 },
} as const;

export function createMessagingQueue(redisUrl: string) {
  return new Queue(MESSAGING_QUEUE, {
    connection: {
      ...bullmqConnection(redisUrl),
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    },
    defaultJobOptions: {
      ...messagingRetryPolicy,
      removeOnComplete: false,
      removeOnFail: false,
    },
  });
}

export function createMessagingWorker(
  redisUrl: string,
  send: (
    data: { tenantId: string; eventId: string },
    delivery: { attempt: number; maxAttempts: number },
  ) => Promise<void>,
) {
  return new Worker(
    MESSAGING_QUEUE,
    (job) =>
      send(messagingJobData.parse(job.data as unknown), {
        attempt: job.attemptsMade + 1,
        maxAttempts: typeof job.opts.attempts === 'number' ? job.opts.attempts : 1,
      }),
    {
      connection: bullmqConnection(redisUrl),
      concurrency: 2,
      maxStalledCount: 2,
    },
  );
}
