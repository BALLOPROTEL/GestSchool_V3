import { describe, expect, it } from 'vitest';
import { validBrevoBearer, validateBrevoEvent } from './webhook-auth.js';

describe('Brevo callback security', () => {
  const secret = 'test-only-webhook-secret-32-bytes-long';
  it('accepts only the configured bearer token', () => {
    expect(validBrevoBearer(`Bearer ${secret}`, secret)).toBe(true);
    expect(validBrevoBearer('Bearer wrong', secret)).toBe(false);
    expect(validBrevoBearer(undefined, secret)).toBe(false);
  });
  it('rejects malformed and stale callbacks with stable replay identities', () => {
    const now = Date.now();
    const valid = {
      event: 'delivered',
      'message-id': 'provider-id',
      ts_event: Math.floor(now / 1000),
    };
    expect(validateBrevoEvent(valid, now).key).toBe(validateBrevoEvent(valid, now).key);
    expect(() => validateBrevoEvent({ event: 'delivered' }, now)).toThrow();
    expect(() => validateBrevoEvent({ ...valid, ts_event: 1 }, now)).toThrow('BREVO_WEBHOOK_STALE');
  });
});
