import type { MessageChannel } from '@gestschool/database';
import type { MessageRecipient } from './recipients.js';

export interface ChannelPreference {
  channel: MessageChannel;
  enabled: boolean;
}

export function isIamDelivery(eventType: string): boolean {
  return (
    eventType === 'iam.account.activation.requested.v1' ||
    eventType === 'iam.password.reset.requested.v1'
  );
}

export function eligibleChannels(
  eventType: string,
  recipient: MessageRecipient,
  preferences: readonly ChannelPreference[],
  requestedChannels?: readonly MessageChannel[],
): MessageChannel[] {
  const enabled = (channel: MessageChannel): boolean =>
    preferences.find((item) => item.channel === channel)?.enabled !== false;
  if (isIamDelivery(eventType)) return recipient.email ? ['EMAIL'] : [];

  const channels: MessageChannel[] = [];
  // Required school/finance notices stay visible in-app even if optional
  // outbound channels are disabled. IAM one-time links are never in-app.
  if (recipient.membershipId) channels.push('IN_APP');
  if (recipient.email && enabled('EMAIL')) channels.push('EMAIL');
  // A missing preference is not WhatsApp consent. Guardian records without
  // membership cannot express this preference and therefore get no WhatsApp.
  if (
    recipient.phone &&
    recipient.membershipId &&
    preferences.some((item) => item.channel === 'WHATSAPP' && item.enabled)
  )
    channels.push('WHATSAPP');
  return requestedChannels
    ? channels.filter((channel) => requestedChannels.includes(channel))
    : channels;
}

export function messagingIdempotencyKey(
  eventId: string,
  recipient: MessageRecipient,
  channel: MessageChannel,
): string {
  // Content/version is frozen in the first Message row. A template publication
  // between retries must never turn the same event into another delivery.
  return `${eventId}:${recipient.reference}:${channel}`;
}

export function maskedDestination(channel: MessageChannel, recipient: MessageRecipient): string {
  if (channel === 'EMAIL') {
    const address = recipient.email ?? '';
    const at = address.indexOf('@');
    return at > 0 ? `${address.slice(0, 1)}***${address.slice(at)}` : '***';
  }
  if (channel === 'WHATSAPP') return `***${recipient.phone?.slice(-4) ?? ''}`;
  return 'In-app';
}
