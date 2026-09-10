import type { CashSession, FeeType, Prisma, Receipt } from '@gestschool/database';
import type {
  CashSessionView,
  FeeScheduleView,
  FeeTypeView,
  InvoiceView,
  PaymentView,
  ReceiptView,
} from '@gestschool/contracts';
export const date = (value: Date) => value.toISOString().slice(0, 10);
export const feeTypeView = (row: FeeType): FeeTypeView => ({
  kind: 'fee-types',
  id: row.id,
  code: row.code,
  name: row.name,
  archivedAt: row.archivedAt?.toISOString() ?? null,
});
export const scheduleInclude = {
  academicYear: true,
  items: {
    include: { feeType: true, installments: { orderBy: { ordinal: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.FeeScheduleInclude;
export function scheduleView(
  row: Prisma.FeeScheduleGetPayload<{ include: typeof scheduleInclude }>,
): FeeScheduleView {
  return {
    kind: 'fee-schedules',
    id: row.id,
    code: row.code,
    name: row.name,
    academicYearId: row.academicYearId,
    yearName: row.academicYear.name,
    levelId: row.levelId,
    classId: row.schoolClassId,
    currency: row.currency,
    items: row.items.map((item) => ({
      id: item.id,
      feeTypeId: item.feeTypeId,
      name: item.feeType.name,
      amountMinor: String(item.amountMinor),
      currency: row.currency,
      dueOn: item.dueOn ? date(item.dueOn) : null,
      installments: item.installments.map((i) => ({
        id: i.id,
        amountMinor: String(i.amountMinor),
        currency: row.currency,
        dueOn: date(i.dueOn),
        ordinal: i.ordinal,
      })),
    })),
  };
}
export const invoiceInclude = {
  student: true,
  lines: { orderBy: [{ dueOn: 'asc' }, { ordinal: 'asc' }, { id: 'asc' }] },
  adjustments: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.InvoiceInclude;
export function invoiceView(
  row: Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>,
  paid: bigint,
): InvoiceView {
  const subtotal = row.lines.reduce((s, l) => s + l.totalAmountMinor, 0n);
  const adjustments = row.adjustments.reduce((s, l) => s + l.amountMinor, 0n);
  const today = date(new Date());
  let consumed = paid + (adjustments < 0n ? -adjustments : 0n);
  const lines = row.lines.map((line) => {
    const covered = consumed > line.totalAmountMinor ? line.totalAmountMinor : consumed;
    consumed -= covered;
    return {
      id: line.id,
      description: line.description,
      quantity: line.quantity,
      unitAmountMinor: String(line.unitAmountMinor),
      totalAmountMinor: String(line.totalAmountMinor),
      currency: row.currency,
      dueOn: line.dueOn ? date(line.dueOn) : row.dueOn ? date(row.dueOn) : null,
      ordinal: line.ordinal,
      balanceMinor: row.status === 'VOID' ? '0' : String(line.totalAmountMinor - covered),
    };
  });
  const matured = row.lines
    .filter((l) => (l.dueOn ? date(l.dueOn) : row.dueOn ? date(row.dueOn) : '9999-12-31') < today)
    .reduce((s, l) => s + l.totalAmountMinor, 0n);
  const adjusted =
    matured + (adjustments < 0n || (row.dueOn && date(row.dueOn) < today) ? adjustments : 0n);
  const due = (adjusted > row.totalAmountMinor ? row.totalAmountMinor : adjusted) - paid;
  return {
    kind: 'invoices',
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    studentId: row.studentId,
    studentName: row.studentName ?? `${row.student.firstName} ${row.student.lastName}`,
    className: row.className,
    yearName: row.yearName,
    enrollmentId: row.enrollmentId,
    academicYearId: row.academicYearId,
    currency: row.currency,
    status: row.status,
    issuedOn: date(row.issuedOn),
    dueOn: row.dueOn ? date(row.dueOn) : null,
    subtotalMinor: String(subtotal),
    adjustmentsMinor: String(adjustments),
    totalAmountMinor: String(row.totalAmountMinor),
    paidMinor: String(paid),
    balanceMinor: row.status === 'VOID' ? '0' : String(row.totalAmountMinor - paid),
    overdueMinor: row.status === 'VOID' || row.status === 'DRAFT' || due < 0n ? '0' : String(due),
    lines,
    adjustments: row.adjustments.map((a) => ({
      id: a.id,
      kind: a.kind,
      amountMinor: String(a.amountMinor),
      currency: row.currency,
      reason: a.reason,
      createdAt: a.createdAt.toISOString(),
      actorMembershipId: a.createdByMembershipId,
    })),
  };
}
export const paymentInclude = {
  allocations: true,
  reversals: true,
  receipts: true,
} satisfies Prisma.PaymentInclude;
export const receiptView = (r: Receipt, status: string): ReceiptView => ({
  kind: 'receipts',
  id: r.id,
  paymentId: r.paymentId,
  receiptNumber: r.receiptNumber,
  amountMinor: String(r.amountMinor),
  currency: r.currency,
  issuedAt: r.issuedAt.toISOString(),
  paymentStatus: status,
});
export function paymentView(
  p: Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>,
): PaymentView {
  return {
    kind: 'payments',
    id: p.id,
    studentId: p.studentId,
    paymentReference: p.paymentReference,
    status: p.status,
    method: p.method,
    amountMinor: String(p.amountMinor),
    currency: p.currency,
    paidAt: p.paidAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    cashSessionId: p.cashSessionId,
    cancellationRequestedAt: p.cancellationRequestedAt?.toISOString() ?? null,
    cancellationReason: p.cancellationReason,
    allocations: p.allocations.map((a) => ({
      invoiceId: a.invoiceId,
      amountMinor: String(a.amountMinor),
      currency: p.currency,
    })),
    reversals: p.reversals.map((r) => ({
      id: r.id,
      reversalReference: r.reversalReference,
      amountMinor: String(r.amountMinor),
      currency: p.currency,
      reason: r.reason,
      reversedAt: r.reversedAt.toISOString(),
      actorMembershipId: r.actorMembershipId,
    })),
    receipts: p.receipts.map((r) => receiptView(r, p.status)),
  };
}
export function cashView(row: CashSession, expected: bigint): CashSessionView {
  return {
    kind: 'cash-sessions',
    id: row.id,
    openedByMembershipId: row.openedByMembershipId,
    status: row.status,
    currency: row.currency,
    openingAmountMinor: String(row.openingAmountMinor),
    closingAmountMinor: row.closingAmountMinor === null ? null : String(row.closingAmountMinor),
    expectedClosingAmountMinor: String(row.expectedClosingAmountMinor ?? expected),
    differenceAmountMinor:
      row.differenceAmountMinor === null ? null : String(row.differenceAmountMinor),
    closingReason: row.closingReason,
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
  };
}
export async function invoicePaid(db: Prisma.TransactionClient, tenantId: string, ids: string[]) {
  const sums = await db.paymentAllocation.groupBy({
    by: ['invoiceId'],
    where: { tenantId, invoiceId: { in: ids }, payment: { status: 'COMPLETED' } },
    _sum: { amountMinor: true },
  });
  return new Map(sums.map((row) => [row.invoiceId, row['_sum'].amountMinor ?? 0n]));
}
export async function cashExpected(
  db: Prisma.TransactionClient,
  tenantId: string,
  rows: CashSession[],
) {
  const ids = rows.map((r) => r.id);
  const payments = await db.payment.groupBy({
    by: ['cashSessionId'],
    where: { tenantId, cashSessionId: { in: ids }, status: { in: ['COMPLETED', 'REVERSED'] } },
    _sum: { amountMinor: true },
  });
  const reversals = await db.paymentReversal.groupBy({
    by: ['cashSessionId'],
    where: { tenantId, cashSessionId: { in: ids } },
    _sum: { amountMinor: true },
  });
  const gross = new Map(payments.map((p) => [p.cashSessionId, p['_sum'].amountMinor ?? 0n]));
  const refunded = new Map(reversals.map((p) => [p.cashSessionId, p['_sum'].amountMinor ?? 0n]));
  return new Map(
    rows.map((r) => [
      r.id,
      r.openingAmountMinor + (gross.get(r.id) ?? 0n) - (refunded.get(r.id) ?? 0n),
    ]),
  );
}
