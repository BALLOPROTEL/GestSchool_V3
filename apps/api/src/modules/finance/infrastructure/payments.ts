import { createHash } from 'node:crypto';
import type { Prisma } from '@gestschool/database';
import type { FinanceCommand, FinancePaymentInput } from '@gestschool/contracts';
import { IamError, type RequestContext } from '../../iam/domain/context.js';
import { checkedMinor, financeConflict, financeFound } from '../domain/policy.js';
import { audit } from './database.js';
import { financeDetail } from './reads.js';
import { financeReference } from './references.js';
import { cashExpected, invoicePaid, receiptView } from './views.js';
import { hydratePayments } from './hydration.js';
import { refreshInvoice } from './invoices.js';
type PaymentCommand = Extract<FinanceCommand, { action: `payment.${string}` | `cash.${string}` }>;
export function paymentHash(input: FinancePaymentInput) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        ...input,
        allocations: input.allocations.toSorted((a, b) => a.invoiceId.localeCompare(b.invoiceId)),
      }),
    )
    .digest('hex');
}
async function cashSession(
  db: Prisma.TransactionClient,
  tenantId: string,
  id: string | null,
  currency: string,
  owner: string,
) {
  if (!id) financeConflict('FINANCE_CASH_SESSION_REQUIRED');
  const cash = financeFound(await db.cashSession.findFirst({ where: { tenantId, id } }));
  if (cash.openedByMembershipId !== owner) throw new IamError('AUTH_FORBIDDEN', 403);
  if (cash.status !== 'OPEN') financeConflict('FINANCE_CASH_SESSION_REQUIRED');
  if (cash.currency !== currency) financeConflict('FINANCE_CURRENCY_MISMATCH');
  return cash;
}
async function allocations(
  db: Prisma.TransactionClient,
  tenantId: string,
  input: {
    studentId: string | null;
    amountMinor: bigint;
    currency: string;
    allocations: { invoiceId: string; amountMinor: bigint }[];
  },
) {
  const ids = input.allocations.map((a) => a.invoiceId);
  if (new Set(ids).size !== ids.length) financeConflict('FINANCE_DUPLICATE_ALLOCATION');
  const sum = input.allocations.reduce((s, a) => s + a.amountMinor, 0n);
  if (sum > input.amountMinor) financeConflict('FINANCE_OVERPAYMENT');
  // LOT 8 does not introduce an unallocated-credit wallet: all captured money is allocated.
  if (sum !== input.amountMinor) financeConflict('FINANCE_ALLOCATION_REQUIRED');
  const rows = await db.invoice.findMany({ where: { tenantId, id: { in: ids } } });
  const paid = await invoicePaid(db, tenantId, ids);
  for (const allocation of input.allocations) {
    const invoice = financeFound(rows.find((r) => r.id === allocation.invoiceId));
    if (invoice.studentId !== input.studentId) financeConflict('FINANCE_STUDENT_MISMATCH');
    if (invoice.currency !== input.currency) financeConflict('FINANCE_CURRENCY_MISMATCH');
    if (invoice.status === 'PAID') financeConflict('FINANCE_INVOICE_ALREADY_PAID');
    if (['VOID', 'DRAFT'].includes(invoice.status)) financeConflict('FINANCE_INVOICE_NOT_PAYABLE');
    if (allocation.amountMinor > invoice.totalAmountMinor - (paid.get(invoice.id) ?? 0n))
      financeConflict('FINANCE_OVERPAYMENT');
  }
}
export async function writePayment(
  db: Prisma.TransactionClient,
  context: RequestContext,
  command: PaymentCommand,
) {
  const tenantId = context.tenantId;
  if (command.action === 'cash.open') {
    if (
      await db.cashSession.findFirst({
        where: { tenantId, openedByMembershipId: context.membershipId, status: 'OPEN' },
      })
    )
      financeConflict('FINANCE_CASH_SESSION_ALREADY_OPEN');
    const row = await db.cashSession.create({
      data: {
        tenantId,
        openedByMembershipId: context.membershipId,
        currency: command.input.currency,
        openingAmountMinor: BigInt(command.input.openingAmountMinor),
      },
    });
    const after = await financeDetail(db, context, 'cash-sessions', row.id, true);
    await audit(db, context, 'cash_session.opened', row.id, null, after);
    return after;
  }
  if (command.action === 'cash.close') {
    const row = financeFound(
      await db.cashSession.findFirst({ where: { tenantId, id: command.id } }),
    );
    await cashSession(db, tenantId, row.id, row.currency, context.membershipId);
    if (await db.payment.count({ where: { tenantId, cashSessionId: row.id, status: 'PENDING' } }))
      financeConflict('FINANCE_CASH_PENDING_PAYMENTS');
    const before = await financeDetail(db, context, 'cash-sessions', row.id, true);
    const expected = financeFound((await cashExpected(db, tenantId, [row])).get(row.id));
    const declared = BigInt(command.input.closingAmountMinor);
    if (
      expected < -9223372036854775807n ||
      expected > 9223372036854775807n ||
      declared - expected > 9223372036854775807n
    )
      financeConflict('FINANCE_AMOUNT_OUT_OF_RANGE');
    await db.cashSession.update({
      where: { tenantId_id: { tenantId, id: row.id } },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closedByMembershipId: context.membershipId,
        closingAmountMinor: declared,
        expectedClosingAmountMinor: expected,
        differenceAmountMinor: declared - expected,
        closingReason: command.input.reason,
      },
    });
    const after = await financeDetail(db, context, 'cash-sessions', row.id, true);
    await audit(db, context, 'cash_session.closed', row.id, before, after);
    return after;
  }
  if (command.action === 'payment.create') {
    const input = command.input,
      requestHash = paymentHash(input),
      idempotencyKey = `payment:create:${command.key}`;
    const existing = await db.payment.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
    });
    if (existing) {
      if (existing.requestHash !== requestHash)
        financeConflict('FINANCE_DUPLICATE_IDEMPOTENCY_KEY');
      return financeDetail(db, context, 'payments', existing.id, true);
    }
    financeFound(await db.student.findFirst({ where: { tenantId, id: input.studentId } }));
    if (input.method === 'CASH')
      await cashSession(db, tenantId, input.cashSessionId, input.currency, context.membershipId);
    else if (input.cashSessionId) financeConflict('FINANCE_CASH_SESSION_INVALID');
    const parts = input.allocations.map((a) => ({ ...a, amountMinor: BigInt(a.amountMinor) }));
    await allocations(db, tenantId, {
      ...input,
      amountMinor: BigInt(input.amountMinor),
      allocations: parts,
    });
    const row = await db.payment.create({
      data: {
        tenantId,
        studentId: input.studentId,
        amountMinor: BigInt(input.amountMinor),
        currency: input.currency,
        method: input.method,
        cashSessionId: input.cashSessionId,
        createdByMembershipId: context.membershipId,
        paymentReference: await financeReference(db, tenantId, 'payment'),
        idempotencyKey,
        requestHash,
      },
    });
    await db.paymentAllocation.createMany({
      data: parts.map((a) => ({ tenantId, paymentId: row.id, ...a })),
    });
    const after = await financeDetail(db, context, 'payments', row.id, true);
    await audit(db, context, 'payment.created', row.id, null, after);
    return after;
  }
  const base = financeFound(await db.payment.findFirst({ where: { tenantId, id: command.id } }));
  const row = financeFound((await hydratePayments(db, tenantId, [base]))[0]);
  const before = await financeDetail(db, context, 'payments', row.id, true);
  if (row.status === 'REVERSED') financeConflict('FINANCE_PAYMENT_CANCELLED');
  let action: string;
  if (command.action === 'payment.reject') {
    if (row.status !== 'PENDING') financeConflict('FINANCE_INVALID_TRANSITION');
    await db.payment.update({
      where: { tenantId_id: { tenantId, id: row.id } },
      data: { status: 'FAILED' },
    });
    const after = await financeDetail(db, context, 'payments', row.id, true);
    await audit(db, context, 'payment.rejected', row.id, before, {
      ...after,
      reason: command.input.reason,
    });
    return after;
  } else if (command.action === 'payment.validate') {
    if (row.status === 'COMPLETED') financeConflict('FINANCE_PAYMENT_ALREADY_VALIDATED');
    if (row.status !== 'PENDING') financeConflict('FINANCE_INVALID_TRANSITION');
    await allocations(db, tenantId, row);
    if (row.method === 'CASH')
      await cashSession(
        db,
        tenantId,
        row.cashSessionId,
        row.currency,
        financeFound(row.createdByMembershipId),
      );
    await db.payment.update({
      where: { tenantId_id: { tenantId, id: row.id } },
      data: {
        status: 'COMPLETED',
        paidAt: new Date(),
        validatedByMembershipId: context.membershipId,
      },
    });
    const receipt = await db.receipt.create({
      data: {
        tenantId,
        paymentId: row.id,
        receiptNumber: await financeReference(db, tenantId, 'receipt'),
        amountMinor: row.amountMinor,
        currency: row.currency,
      },
    });
    await audit(
      db,
      context,
      'receipt.created',
      receipt.id,
      null,
      receiptView(receipt, 'COMPLETED'),
    );
    for (const a of row.allocations) await refreshInvoice(db, tenantId, a.invoiceId);
    action = 'payment.validated';
  } else if (command.action === 'payment.request-cancellation') {
    if (row.status !== 'COMPLETED' || row.cancellationRequestedAt)
      financeConflict('FINANCE_INVALID_TRANSITION');
    await db.payment.update({
      where: { tenantId_id: { tenantId, id: row.id } },
      data: {
        cancellationRequestedAt: new Date(),
        cancellationRequestedByMembershipId: context.membershipId,
        cancellationReason: command.input.reason,
      },
    });
    action = 'payment.cancellation_requested';
  } else {
    if (row.status !== 'COMPLETED' || !row.cancellationRequestedAt)
      financeConflict('FINANCE_CANCELLATION_REQUEST_REQUIRED');
    if (row.method === 'CASH') {
      const cash = await cashSession(
        db,
        tenantId,
        command.input.cashSessionId,
        row.currency,
        context.membershipId,
      );
      const expected = financeFound((await cashExpected(db, tenantId, [cash])).get(cash.id));
      if (expected < row.amountMinor) financeConflict('FINANCE_INSUFFICIENT_BALANCE');
    } else if (command.input.cashSessionId) financeConflict('FINANCE_CASH_SESSION_INVALID');
    checkedMinor(row.amountMinor);
    await db.paymentReversal.create({
      data: {
        tenantId,
        paymentId: row.id,
        reversalReference: await financeReference(db, tenantId, 'reversal'),
        amountMinor: row.amountMinor,
        reason: command.input.reason,
        actorMembershipId: context.membershipId,
        cashSessionId: command.input.cashSessionId,
      },
    });
    await db.payment.update({
      where: { tenantId_id: { tenantId, id: row.id } },
      data: { status: 'REVERSED' },
    });
    for (const a of row.allocations) await refreshInvoice(db, tenantId, a.invoiceId);
    action = 'payment.cancelled';
  }
  const after = await financeDetail(db, context, 'payments', row.id, true);
  await audit(db, context, action, row.id, before, after);
  return after;
}
