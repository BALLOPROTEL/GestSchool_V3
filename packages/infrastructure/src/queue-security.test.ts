import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  DOCUMENT_GENERATION_EVENT,
  DOCUMENT_QUEUE,
  REPORT_EXPORT_EVENT,
  REPORTS_QUEUE,
  MESSAGING_QUEUE,
  messagingEventTypes,
} from '@gestschool/contracts';
const processors = vi.hoisted(() => new Map<string, (job: unknown) => Promise<unknown>>());
vi.mock('bullmq', async () => {
  const original = await vi.importActual<typeof import('bullmq')>('bullmq');
  return {
    ...original,
    Worker: function Worker(name: string, process: (job: unknown) => Promise<unknown>) {
      processors.set(name, process);
    },
  };
});
import { createDocumentWorker } from './documents/queue.js';
import { createReportsWorker } from './reports/queue.js';
import { createMessagingWorker } from './messaging/queue.js';

describe('LOT13 queue entry guards, no network', () => {
  it.each([
    [DOCUMENT_QUEUE, DOCUMENT_GENERATION_EVENT, 'documentId'],
    [REPORTS_QUEUE, REPORT_EXPORT_EVENT, 'exportId'],
    [MESSAGING_QUEUE, messagingEventTypes[0], 'eventId'],
  ])(
    'rejects malformed and unknown %s jobs before business processing',
    async (queue, name, id) => {
      const run = vi.fn(async () => undefined);
      const url = 'redis://127.0.0.1:6379';
      if (queue === DOCUMENT_QUEUE) createDocumentWorker(url, run);
      else if (queue === REPORTS_QUEUE) createReportsWorker(url, run);
      else createMessagingWorker(url, run);
      const process = processors.get(queue)!;
      const data = { tenantId: randomUUID(), [id]: randomUUID() };
      await expect(
        Promise.resolve().then(() => process({ name: 'unknown.job', data })),
      ).rejects.toThrow();
      for (const payload of [
        {},
        { ...data, [id]: undefined },
        { ...data, value: 'x'.repeat(100_000) },
        { ...data, tenantId: 'foreign' },
      ])
        await expect(
          Promise.resolve().then(() => process({ name, data: payload })),
        ).rejects.toThrow();
      expect(run).not.toHaveBeenCalled();
      await process({ name, data, attemptsMade: 0, opts: { attempts: 3 } });
      expect(run).toHaveBeenCalledOnce();
    },
  );
});
