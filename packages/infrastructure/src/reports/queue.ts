import { DelayedError, Queue, Worker } from 'bullmq';
import { REPORTS_QUEUE, REPORT_EXPORT_EVENT, reportJobData } from '@gestschool/contracts';
import { bullmqConnection } from '../documents/queue.js';

export function createReportsQueue(url: string) {
  return new Queue(REPORTS_QUEUE, {
    connection: { ...bullmqConnection(url), maxRetriesPerRequest: 1, enableOfflineQueue: false },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: false,
      removeOnFail: false,
    },
  });
}
export function createReportsWorker(
  url: string,
  run: (data: { tenantId: string; exportId: string }) => Promise<void>,
) {
  return new Worker(
    REPORTS_QUEUE,
    async (job, token) => {
      try {
        await run(reportJobData.parse(job.data as unknown));
      } catch (error) {
        if (error instanceof Error && error.message === 'REPORT_LEASE_BUSY') {
          await job.moveToDelayed(Date.now() + 90_000, token);
          throw new DelayedError();
        }
        throw error;
      }
    },
    {
      connection: bullmqConnection(url),
      concurrency: 2,
      lockDuration: 180_000,
      maxStalledCount: 2,
    },
  );
}
export { REPORT_EXPORT_EVENT };
