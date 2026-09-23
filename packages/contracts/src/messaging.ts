import { z } from 'zod';

export const messagingEventTypes = [
  'iam.account.activation.requested.v1',
  'iam.password.reset.requested.v1',
  'enrollments.confirmed.v1',
  'enrollments.transferred.v1',
  'finance.invoice.created.v1',
  'finance.payment.validated.v1',
  'finance.receipt.ready.v1',
  'grades.results.published.v1',
  'report_card.published.v1',
  'documents.ready.v1',
  'communications.manual.requested.v1',
] as const;

export const messagingJobData = z.strictObject({
  tenantId: z.uuid(),
  eventId: z.uuid(),
});

export const MESSAGING_QUEUE = 'messaging.send';
export type MessagingEventType = (typeof messagingEventTypes)[number];
export const messagingTemplateKeys = [
  'account.activation',
  'password.reset',
  'enrollment.confirmed',
  'enrollment.transferred',
  'invoice.created',
  'payment.validated',
  'receipt.ready',
  'results.published',
  'report_card.published',
  'document.ready',
  'manual.school_notice',
] as const;
export type MessagingTemplateKey = (typeof messagingTemplateKeys)[number];

export const communicationPermissionCodes = [
  'communications.read',
  'communications.send',
  'communications.retry',
  'notification-templates.read',
  'notification-templates.manage',
] as const;
