import type { FeeSchedule, Invoice, Payment, Prisma } from '@gestschool/database';
import { financeFound } from '../domain/policy.js';
import type { scheduleInclude, invoiceInclude, paymentInclude } from './views.js';
function grouped<T>(rows: T[], key: (row: T) => string) {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row),
      bucket = result.get(id) ?? [];
    bucket.push(row);
    result.set(id, bucket);
  }
  return result;
}
// A bounded batch per relation avoids both N+1 and Prisma's parallel relation queries on
// a single pg transaction connection (deprecated by pg 8.23, unsupported by pg 9).
export async function hydrateSchedules(
  db: Prisma.TransactionClient,
  tenantId: string,
  rows: FeeSchedule[],
): Promise<Prisma.FeeScheduleGetPayload<{ include: typeof scheduleInclude }>[]> {
  if (!rows.length) return [];
  const years = await db.academicYear.findMany({
    where: { tenantId, id: { in: rows.map((r) => r.academicYearId) } },
  });
  const items = await db.feeScheduleItem.findMany({
    where: { tenantId, feeScheduleId: { in: rows.map((r) => r.id) } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const types = await db.feeType.findMany({
    where: { tenantId, id: { in: items.map((i) => i.feeTypeId) } },
  });
  const installments = await db.feeInstallment.findMany({
    where: { tenantId, feeScheduleItemId: { in: items.map((i) => i.id) } },
    orderBy: { ordinal: 'asc' },
  });
  const yearMap = new Map(years.map((r) => [r.id, r])),
    typeMap = new Map(types.map((r) => [r.id, r])),
    parts = grouped(installments, (r) => r.feeScheduleItemId);
  const children = grouped(
    items.map((i) => ({
      ...i,
      feeType: financeFound(typeMap.get(i.feeTypeId)),
      installments: parts.get(i.id) ?? [],
    })),
    (r) => r.feeScheduleId,
  );
  return rows.map((r) => ({
    ...r,
    academicYear: financeFound(yearMap.get(r.academicYearId)),
    items: children.get(r.id) ?? [],
  }));
}
export async function hydrateInvoices(
  db: Prisma.TransactionClient,
  tenantId: string,
  rows: Invoice[],
): Promise<Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const students = await db.student.findMany({
    where: { tenantId, id: { in: rows.map((r) => r.studentId) } },
  });
  const lines = await db.invoiceLine.findMany({
    where: { tenantId, invoiceId: { in: ids } },
    orderBy: [{ dueOn: 'asc' }, { ordinal: 'asc' }, { id: 'asc' }],
  });
  const adjustments = await db.invoiceAdjustment.findMany({
    where: { tenantId, invoiceId: { in: ids } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const studentMap = new Map(students.map((r) => [r.id, r])),
    lineMap = grouped(lines, (r) => r.invoiceId),
    adjustmentMap = grouped(adjustments, (r) => r.invoiceId);
  return rows.map((r) => ({
    ...r,
    student: financeFound(studentMap.get(r.studentId)),
    lines: lineMap.get(r.id) ?? [],
    adjustments: adjustmentMap.get(r.id) ?? [],
  }));
}
export async function hydratePayments(
  db: Prisma.TransactionClient,
  tenantId: string,
  rows: Payment[],
): Promise<Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const allocations = grouped(
    await db.paymentAllocation.findMany({
      where: { tenantId, paymentId: { in: ids } },
      orderBy: { id: 'asc' },
    }),
    (r) => r.paymentId,
  );
  const receipts = grouped(
    await db.receipt.findMany({ where: { tenantId, paymentId: { in: ids } } }),
    (r) => r.paymentId,
  );
  const reversals = grouped(
    await db.paymentReversal.findMany({
      where: { tenantId, paymentId: { in: ids } },
      orderBy: { reversedAt: 'asc' },
    }),
    (r) => r.paymentId,
  );
  return rows.map((r) => ({
    ...r,
    allocations: allocations.get(r.id) ?? [],
    receipts: receipts.get(r.id) ?? [],
    reversals: reversals.get(r.id) ?? [],
  }));
}
