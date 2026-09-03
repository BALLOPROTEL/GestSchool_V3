import { describe, expect, it } from 'vitest';

import { WorkerModule } from './worker.module.js';

describe('WorkerModule', () => {
  it('defines the worker application context', () => {
    expect(WorkerModule).toBeDefined();
  });
});
