import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { RateLimiter } from '../src/modules/iam/infrastructure/rate-limiter.js';

const config = loadInfrastructureConfig();
const prefix = `gestschool:security:${randomUUID()}`;
const limiter = new RateLimiter(config.redisUrl, prefix);
beforeAll(async () => {
  await limiter.open();
});
afterAll(async () => {
  if (limiter.client.isOpen) {
    for await (const batch of limiter.client.scanIterator({ MATCH: `${prefix}:*`, COUNT: 100 }))
      if (batch.length) await limiter.client.del(batch);
    await limiter.close();
  }
});
describe('LOT13 distributed limits (local Redis only)', () => {
  it('returns 429 for a bounded tenant/user burst without penalizing another tenant/user', async () => {
    const tenant = randomUUID(),
      user = randomUUID();
    for (let i = 0; i < 20; i++) await limiter.checkTenantAction('report-exports', tenant, user);
    await expect(limiter.checkTenantAction('report-exports', tenant, user)).rejects.toMatchObject({
      status: 429,
    });
    await expect(
      limiter.checkTenantAction('report-exports', randomUUID(), user),
    ).resolves.toBeUndefined();
    await expect(
      limiter.checkTenantAction('report-exports', tenant, randomUUID()),
    ).resolves.toBeUndefined();
    await expect(
      limiter.checkTenantAction('communications', tenant, user),
    ).resolves.toBeUndefined();
  });
  it('enforces the previously inactive webhook limit', async () => {
    const outcomes = await Promise.allSettled(
      Array.from({ length: 41 }, () =>
        limiter.check('/api/v1/webhooks/brevo', 'local-webhook-probe'),
      ),
    );
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(40);
    expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const rejected = outcomes.find((result) => result.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason.status).toBe(429);
  });
  it('fails closed without a Redis memory fallback', async () => {
    const closed = new RateLimiter(config.redisUrl, `${prefix}:closed`);
    await expect(closed.check('/api/v1/auth/login', 'local')).rejects.toMatchObject({
      status: 503,
    });
    await expect(
      closed.checkTenantAction('exports', randomUUID(), randomUUID()),
    ).rejects.toMatchObject({ status: 503 });
  });
});
