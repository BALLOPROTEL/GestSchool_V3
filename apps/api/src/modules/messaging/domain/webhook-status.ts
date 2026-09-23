import type { MessageStatus } from '@gestschool/database';

export type DeliveryWebhookStatus = 'SENT' | 'DELIVERED' | 'BOUNCED' | 'REJECTED';

export function webhookStatus(event: string): DeliveryWebhookStatus | null {
  switch (event.toLowerCase()) {
    case 'request':
    case 'sent':
      return 'SENT';
    case 'delivered':
      return 'DELIVERED';
    case 'hard_bounce':
    case 'soft_bounce':
      return 'BOUNCED';
    case 'invalid_email':
    case 'blocked':
    case 'error':
    case 'rejected':
      return 'REJECTED';
    default:
      return null;
  }
}

export function mayAdvanceStatus(current: MessageStatus, next: DeliveryWebhookStatus): boolean {
  if (
    current === 'DELIVERED' ||
    current === 'BOUNCED' ||
    current === 'REJECTED' ||
    current === 'CANCELLED'
  )
    return false;
  if (next === 'SENT')
    return current === 'SENDING' || current === 'QUEUED' || current === 'PENDING';
  return current === 'SENT' || current === 'SENDING' || current === 'FAILED';
}
