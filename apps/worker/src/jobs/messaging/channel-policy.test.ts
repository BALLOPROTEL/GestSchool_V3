import { describe, expect, it } from 'vitest';
import { eligibleChannels, maskedDestination, messagingIdempotencyKey } from './channel-policy.js';
import type { MessageRecipient } from './recipients.js';

const recipient: MessageRecipient = {
  reference: 'guardian:00000000-0000-7000-8000-000000000001',
  membershipId: '00000000-0000-7000-8000-000000000002',
  guardianId: '00000000-0000-7000-8000-000000000001',
  firstName: 'Aïcha',
  locale: 'fr',
  email: 'aicha@example.invalid',
  phone: '+33612345678',
};

describe('transactional channel policy', () => {
  it('never puts activation or reset links into in-app or WhatsApp notices', () => {
    expect(
      eligibleChannels('iam.password.reset.requested.v1', recipient, [
        { channel: 'WHATSAPP', enabled: true },
      ]),
    ).toEqual(['EMAIL']);
  });

  it('requires an explicit enabled preference for WhatsApp and respects email opt-out', () => {
    expect(eligibleChannels('finance.payment.validated.v1', recipient, [])).toEqual([
      'IN_APP',
      'EMAIL',
    ]);
    expect(
      eligibleChannels('finance.payment.validated.v1', recipient, [
        { channel: 'EMAIL', enabled: false },
        { channel: 'WHATSAPP', enabled: true },
      ]),
    ).toEqual(['IN_APP', 'WHATSAPP']);
    expect(
      eligibleChannels('finance.payment.validated.v1', { ...recipient, membershipId: null }, [
        { channel: 'WHATSAPP', enabled: true },
      ]),
    ).toEqual(['EMAIL']);
  });

  it('uses stable identities and never reveals complete destinations in history', () => {
    expect(messagingIdempotencyKey('event', recipient, 'EMAIL')).toBe(
      'event:guardian:00000000-0000-7000-8000-000000000001:EMAIL',
    );
    expect(maskedDestination('EMAIL', recipient)).toBe('a***@example.invalid');
    expect(maskedDestination('WHATSAPP', recipient)).toBe('***5678');
  });
});
