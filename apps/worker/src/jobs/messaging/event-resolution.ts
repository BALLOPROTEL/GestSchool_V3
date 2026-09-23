import type { GestSchoolPrismaClient, OutboxEvent } from '@gestschool/database';
import { financeCurrency } from '@gestschool/contracts';
import type { MessagingTemplateKey, TemplateValues } from '@gestschool/infrastructure';
import { formatMinorAmount } from './money.js';
import { memberRecipient, studentRecipients, type MessageRecipient } from './recipients.js';

export interface ResolvedMessagingEvent {
  key: MessagingTemplateKey;
  path: string;
  values: TemplateValues;
  recipients: MessageRecipient[];
  category: 'SCHOOL' | 'ACADEMIC' | 'FINANCE' | 'IAM';
  authTokenId?: string;
  senderMembershipId?: string;
  requestedChannels?: ('EMAIL' | 'WHATSAPP' | 'IN_APP')[];
}

export async function resolveMessagingEvent(
  db: GestSchoolPrismaClient,
  event: OutboxEvent,
): Promise<ResolvedMessagingEvent | null> {
  const tenantId = event.tenantId;
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  if (!tenant) return null;
  const values: TemplateValues = { 'school.name': tenant.name };

  if (
    event.eventType === 'iam.account.activation.requested.v1' ||
    event.eventType === 'iam.password.reset.requested.v1'
  ) {
    const token = await db.authToken.findFirst({
      where: {
        id: event.aggregateId,
        purpose:
          event.eventType === 'iam.account.activation.requested.v1'
            ? 'ACTIVATION'
            : 'PASSWORD_RESET',
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!token?.encryptedSecret || !token.membershipId) return null;
    const recipient = await memberRecipient(db, tenantId, token.userId);
    // Auth tokens are scoped to the membership selected when issued. A user can
    // belong to several tenants, so matching only userId would risk misdelivery.
    if (!recipient || recipient.membershipId !== token.membershipId) return null;
    return {
      key: token.purpose === 'ACTIVATION' ? 'account.activation' : 'password.reset',
      path: token.purpose === 'ACTIVATION' ? '/activation' : '/reset-password',
      values,
      recipients: [recipient],
      category: 'IAM',
      authTokenId: token.id,
    };
  }

  if (event.eventType === 'communications.manual.requested.v1') {
    const request = await db.communicationRequest.findFirst({
      where: { tenantId, id: event.aggregateId },
    });
    if (!request || !Array.isArray(request.channels)) return null;
    const requestedChannels = request.channels.filter(
      (channel): channel is 'EMAIL' | 'WHATSAPP' | 'IN_APP' =>
        channel === 'EMAIL' || channel === 'WHATSAPP' || channel === 'IN_APP',
    );
    if (!requestedChannels.length) return null;
    const kind = request.category === 'FINANCE' ? 'FINANCE' : 'SCHOOL';
    const studentIds =
      request.audienceType === 'STUDENT'
        ? [request.audienceId]
        : request.audienceType === 'CLASS'
          ? (
              await db.enrollment.findMany({
                where: {
                  tenantId,
                  schoolClassId: request.audienceId,
                  status: 'ACTIVE',
                  student: { status: 'ACTIVE' },
                },
                select: { studentId: true },
                take: 201,
              })
            ).map((item) => item.studentId)
          : [];
    if (!studentIds.length || studentIds.length > 200) return null;
    const recipientMap = new Map<string, MessageRecipient>();
    for (const id of studentIds) {
      const result = await studentRecipients(db, tenantId, id, kind);
      for (const recipient of result.recipients) recipientMap.set(recipient.reference, recipient);
    }
    if (!recipientMap.size || recipientMap.size > 200) return null;
    return {
      key: 'manual.school_notice',
      path: '/communications',
      values,
      recipients: [...recipientMap.values()],
      category: request.category as 'SCHOOL' | 'ACADEMIC' | 'FINANCE',
      senderMembershipId: request.senderMembershipId,
      requestedChannels,
    };
  }

  let studentId: string | null = null;
  let kind: 'SCHOOL' | 'FINANCE' = 'SCHOOL';
  let key: MessagingTemplateKey;
  let path: string;
  if (
    event.eventType === 'enrollments.confirmed.v1' ||
    event.eventType === 'enrollments.transferred.v1'
  ) {
    const enrollment = await db.enrollment.findFirst({
      where: { tenantId, id: event.aggregateId },
      select: { studentId: true, status: true },
    });
    if (!enrollment || !['ACTIVE', 'TRANSFERRED'].includes(enrollment.status)) return null;
    studentId = enrollment.studentId;
    key =
      event.eventType === 'enrollments.confirmed.v1'
        ? 'enrollment.confirmed'
        : 'enrollment.transferred';
    path = '/enrollments';
  } else if (event.eventType === 'finance.invoice.created.v1') {
    const invoice = await db.invoice.findFirst({
      where: {
        tenantId,
        id: event.aggregateId,
        status: { in: ['ISSUED', 'PARTIALLY_PAID', 'PAID'] },
      },
    });
    if (!invoice) return null;
    studentId = invoice.studentId;
    kind = 'FINANCE';
    key = 'invoice.created';
    path = '/finance';
    values['invoice.reference'] = invoice.invoiceNumber;
  } else if (event.eventType === 'finance.payment.validated.v1') {
    const payment = await db.payment.findFirst({
      where: { tenantId, id: event.aggregateId, status: 'COMPLETED' },
    });
    if (!payment?.studentId) return null;
    studentId = payment.studentId;
    kind = 'FINANCE';
    key = 'payment.validated';
    path = '/finance';
    const currency = financeCurrency.safeParse(payment.currency);
    if (!currency.success) return null;
    values['payment.amount'] = formatMinorAmount(payment.amountMinor, currency.data);
  } else if (event.eventType === 'finance.receipt.ready.v1') {
    const receipt = await db.receipt.findFirst({
      where: { tenantId, id: event.aggregateId },
      include: { payment: true },
    });
    if (!receipt?.payment.studentId || receipt.payment.status !== 'COMPLETED') return null;
    studentId = receipt.payment.studentId;
    kind = 'FINANCE';
    key = 'receipt.ready';
    path = '/finance';
  } else if (
    event.eventType === 'report_card.published.v1' ||
    event.eventType === 'grades.results.published.v1'
  ) {
    const card = await db.reportCard.findFirst({
      where: { tenantId, id: event.aggregateId, status: { in: ['PUBLISHED', 'LOCKED'] } },
    });
    if (!card) return null;
    studentId = card.studentId;
    key =
      event.eventType === 'report_card.published.v1'
        ? 'report_card.published'
        : 'results.published';
    path = '/grades';
  } else if (event.eventType === 'documents.ready.v1') {
    const document = await db.document.findFirst({
      where: { tenantId, id: event.aggregateId, generationStatus: 'READY', status: 'ACTIVE' },
    });
    if (!document?.studentId) return null;
    studentId = document.studentId;
    key = 'document.ready';
    path = '/documents';
    values['document.reference'] = document.reference;
  } else return null;

  const resolved = await studentRecipients(db, tenantId, studentId, kind);
  values['student.firstName'] = resolved.studentName;
  return {
    key,
    path,
    values,
    recipients: resolved.recipients,
    category:
      kind === 'FINANCE'
        ? 'FINANCE'
        : key.startsWith('enrollment.') || key === 'document.ready'
          ? 'SCHOOL'
          : 'ACADEMIC',
  };
}
