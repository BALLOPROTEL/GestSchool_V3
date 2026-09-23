import { describe, expect, it } from 'vitest';
import { messagingRetryPolicy } from './queue.js';

describe('messaging retry policy', () => {
  it('uses five attempts with exponential backoff', () => {
    expect(messagingRetryPolicy).toEqual({
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
    });
  });
});
