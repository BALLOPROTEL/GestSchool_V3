import { describe, expect, it } from 'vitest';
import { mayAdvanceStatus, webhookStatus } from './webhook-status.js';

describe('provider delivery ordering', () => {
  it('does not regress delivered or bounced messages under reordered callbacks', () => {
    expect(mayAdvanceStatus('DELIVERED', 'SENT')).toBe(false);
    expect(mayAdvanceStatus('DELIVERED', 'BOUNCED')).toBe(false);
    expect(mayAdvanceStatus('BOUNCED', 'SENT')).toBe(false);
    expect(mayAdvanceStatus('SENT', 'DELIVERED')).toBe(true);
  });
  it('rejects unknown provider events', () => {
    expect(webhookStatus('delivered')).toBe('DELIVERED');
    expect(webhookStatus('click')).toBeNull();
  });
});
