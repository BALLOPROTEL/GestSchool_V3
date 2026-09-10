import { Prisma } from '@gestschool/database';
import type {
  FinanceList,
  FinanceQuery,
  FinanceResource,
  FinanceSummary,
  FinanceView,
} from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
import { financeFound, resourcePermission } from '../domain/policy.js';
import { invoiceCte, paymentWhere, studentScope } from './scope.js';
import {
  cashExpected,
  cashView,
  feeTypeView,
  invoicePaid,
  invoiceView,
  paymentView,
  receiptView,
  scheduleView,
} from './views.js';
import { hydrateSchedules, hydrateInvoices, hydratePayments } from './hydration.js';
export async function financeDetail(
  db: Prisma.TransactionClient,
  context: RequestContext,
  resource: FinanceResource,
  id: string,
  trustedWrite = false,
): Promise<FinanceView> {
  const tenantId = context.tenantId;
  const student = trustedWrite ? { tenantId } : studentScope(context, resourcePermission[resource]);
  if (resource === 'fee-types')
    return feeTypeView(financeFound(await db.feeType.findFirst({ where: { tenantId, id } })));
  if (resource === 'fee-schedules') {
    const row = financeFound(await db.feeSchedule.findFirst({ where: { tenantId, id } }));
    return scheduleView(financeFound((await hydrateSchedules(db, tenantId, [row]))[0]));
  }
  if (resource === 'invoices') {
    const row = financeFound(await db.invoice.findFirst({ where: { tenantId, id, student } }));
    return invoiceView(
      financeFound((await hydrateInvoices(db, tenantId, [row]))[0]),
      (await invoicePaid(db, tenantId, [id])).get(id) ?? 0n,
    );
  }
  if (resource === 'payments') {
    const row = financeFound(
      await db.payment.findFirst({ where: { tenantId, id, student: { is: student } } }),
    );
    return paymentView(financeFound((await hydratePayments(db, tenantId, [row]))[0]));
  }
  if (resource === 'receipts') {
    const row = financeFound(
      await db.receipt.findFirst({
        where: { tenantId, id, payment: { student: { is: student } } },
        include: { payment: { select: { status: true } } },
      }),
    );
    return receiptView(row, row.payment.status);
  }
  const row = financeFound(await db.cashSession.findFirst({ where: { tenantId, id } }));
  return cashView(row, (await cashExpected(db, tenantId, [row])).get(id) ?? row.openingAmountMinor);
}
export async function financeList(
  db: Prisma.TransactionClient,
  context: RequestContext,
  resource: FinanceResource,
  q: FinanceQuery,
): Promise<FinanceList> {
  const tenantId = context.tenantId;
  const paging = { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
  const order = q.sort === 'oldest' ? 'asc' : 'desc';
  const output = (items: FinanceView[], total: number): FinanceList => ({
    items,
    total,
    page: q.page,
    pageSize: q.pageSize,
  });
  if (resource === 'fee-types') {
    const where: Prisma.FeeTypeWhereInput = {
      tenantId,
      ...(q.status === 'ARCHIVED'
        ? { archivedAt: { not: null } }
        : q.status === 'ACTIVE'
          ? { archivedAt: null }
          : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { code: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const rows = await db.feeType.findMany({
      where,
      ...paging,
      orderBy: [{ createdAt: order }, { id: order }],
    });
    const total = await db.feeType.count({ where });
    return output(rows.map(feeTypeView), total);
  }
  if (resource === 'fee-schedules') {
    const where: Prisma.FeeScheduleWhereInput = {
      tenantId,
      ...(q.academicYearId ? { academicYearId: q.academicYearId } : {}),
      ...(q.classId ? { schoolClassId: q.classId } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { code: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const rows = await db.feeSchedule.findMany({
      where,
      ...paging,
      orderBy: [{ createdAt: order }, { id: order }],
    });
    const total = await db.feeSchedule.count({ where });
    return output((await hydrateSchedules(db, tenantId, rows)).map(scheduleView), total);
  }
  if (resource === 'invoices') {
    const prefix = invoiceCte(context, q);
    const ordering = order === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const ids = await db.$queryRaw<{ id: string }[]>(
      Prisma.sql`${prefix} SELECT id FROM filtered ORDER BY created_at ${ordering},id ${ordering} LIMIT ${q.pageSize} OFFSET ${paging.skip}`,
    );
    const count = await db.$queryRaw<{ count: bigint }[]>(
      Prisma.sql`${prefix} SELECT count(*) FROM filtered`,
    );
    const rows = await db.invoice.findMany({
      where: { tenantId, id: { in: ids.map((row) => row.id) } },
    });
    const paid = await invoicePaid(
      db,
      tenantId,
      ids.map((row) => row.id),
    );
    const mapped = new Map(
      (await hydrateInvoices(db, tenantId, rows)).map((row) => [
        row.id,
        invoiceView(row, paid.get(row.id) ?? 0n),
      ]),
    );
    return output(
      ids.map((row) => financeFound(mapped.get(row.id))),
      Number(count[0]?.count ?? 0n),
    );
  }
  if (resource === 'payments') {
    const where = paymentWhere(context, q);
    const rows = await db.payment.findMany({
      where,
      ...paging,
      orderBy: [{ createdAt: order }, { id: order }],
    });
    const total = await db.payment.count({ where });
    return output((await hydratePayments(db, tenantId, rows)).map(paymentView), total);
  }
  if (resource === 'receipts') {
    const where: Prisma.ReceiptWhereInput = {
      tenantId,
      payment: paymentWhere(context, { ...q, search: '' }, 'receipts.read'),
      ...(q.search ? { receiptNumber: { contains: q.search, mode: 'insensitive' } } : {}),
    };
    const rows = await db.receipt.findMany({
      where,
      ...paging,
      orderBy: [{ issuedAt: order }, { id: order }],
      include: { payment: { select: { status: true } } },
    });
    const total = await db.receipt.count({ where });
    return output(
      rows.map((row) => receiptView(row, row.payment.status)),
      total,
    );
  }
  const where: Prisma.CashSessionWhereInput = {
    tenantId,
    ...(q.status === 'ALL'
      ? {}
      : { status: { in: (['OPEN', 'CLOSED'] as const).filter((s) => s === q.status) } }),
    ...(q.dateFrom || q.dateTo
      ? {
          openedAt: {
            ...(q.dateFrom ? { gte: new Date(q.dateFrom) } : {}),
            ...(q.dateTo ? { lt: new Date(new Date(q.dateTo).getTime() + 86400000) } : {}),
          },
        }
      : {}),
  };
  const rows = await db.cashSession.findMany({
    where,
    ...paging,
    orderBy: [{ openedAt: order }, { id: order }],
  });
  const total = await db.cashSession.count({ where });
  const expected = await cashExpected(db, tenantId, rows);
  return output(
    rows.map((row) => cashView(row, expected.get(row.id) ?? row.openingAmountMinor)),
    total,
  );
}
export async function financeSummary(
  db: Prisma.TransactionClient,
  context: RequestContext,
  q: FinanceQuery,
): Promise<FinanceSummary> {
  const rows = await db.$queryRaw<
    {
      currency: string;
      invoiced: string;
      collected: string;
      outstanding: string;
      today: string;
      unpaid: bigint;
      overdue: string;
    }[]
  >(Prisma.sql`${invoiceCte(context, q, 'finance.read')}
    SELECT currency, sum(total_amount_minor)::text invoiced,sum(paid)::text collected,sum(balance)::text outstanding,sum(today)::text today,count(*) FILTER (WHERE balance>0) unpaid,sum(overdue)::text overdue FROM filtered WHERE status NOT IN ('DRAFT','VOID') GROUP BY currency ORDER BY currency`);
  return {
    currencies: rows.map((r) => ({
      currency: r.currency,
      invoicedMinor: r.invoiced,
      collectedMinor: r.collected,
      outstandingMinor: r.outstanding,
      todayPaymentsMinor: r.today,
      unpaidInvoices: Number(r.unpaid),
      overdueMinor: r.overdue,
    })),
  };
}
