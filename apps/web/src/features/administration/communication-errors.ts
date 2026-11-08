import { PeopleError } from '../directory/people-client';

export type CommunicationErrorKey =
  | 'error'
  | 'forbidden'
  | 'sessionExpired'
  | 'unavailable'
  | 'audienceForbidden'
  | 'audienceEmpty'
  | 'audienceTooLarge'
  | 'audienceChanged';

export function communicationErrorKey(
  error: unknown,
  context: 'load' | 'action' = 'load',
): CommunicationErrorKey {
  if (!(error instanceof PeopleError)) return 'error';
  if (error.code === 'AUTH_SESSION_EXPIRED') return 'sessionExpired';
  if (error.code === 'AUTH_FORBIDDEN') return 'forbidden';
  if (context === 'action') {
    if (
      error.code === 'COMMUNICATION_CATEGORY_FORBIDDEN' ||
      error.code === 'COMMUNICATION_AUDIENCE_FORBIDDEN'
    )
      return 'audienceForbidden';
    if (error.code === 'COMMUNICATION_AUDIENCE_EMPTY') return 'audienceEmpty';
    if (error.code === 'COMMUNICATION_AUDIENCE_TOO_LARGE') return 'audienceTooLarge';
    if (error.code === 'COMMUNICATION_AUDIENCE_CHANGED') return 'audienceChanged';
  }
  if (error.code === 'AUTH_UNAVAILABLE') return 'unavailable';
  return 'error';
}

export function brevoHttpStatus(code: string | null): string | null {
  const match = code?.match(/^BREVO_HTTP_(\d{3})$/);
  return match?.[1] ?? null;
}

export type DeliveryErrorKey =
  | 'providerUnavailable'
  | 'recipientNotAuthorized'
  | 'channelNotAuthorized'
  | 'deliveryRetrying'
  | 'deliveryBounced'
  | 'deliveryRejected'
  | 'deliveryFailed';

export function deliveryErrorKey(code: string | null, status: string): DeliveryErrorKey {
  if (code === 'BREVO_CONNECTION_UNCERTAIN' || code === 'BREVO_RESPONSE_UNCERTAIN')
    return 'providerUnavailable';
  if (code === 'STAGING_RECIPIENT_NOT_AUTHORIZED') return 'recipientNotAuthorized';
  if (
    code === 'STAGING_CHANNEL_NOT_AUTHORIZED' ||
    code === 'WHATSAPP_NOT_AUTHORIZED' ||
    code === 'BREVO_WHATSAPP_SENDER_MISSING' ||
    code === 'BREVO_WHATSAPP_TEMPLATE_MISSING'
  )
    return 'channelNotAuthorized';
  if (status === 'BOUNCED') return 'deliveryBounced';
  if (status === 'REJECTED') return 'deliveryRejected';
  return status === 'FAILED' ? 'deliveryFailed' : 'deliveryRetrying';
}
