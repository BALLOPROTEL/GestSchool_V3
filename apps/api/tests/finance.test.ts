import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  CashSessionView,
  FeeTypeView,
  FinanceList,
  FinanceSummary,
  InvoiceView,
  PaymentView,
} from '@gestschool/contracts';
import {
  FinanceBrowser,
  capture,
  financeHarness,
  invoiceFixture,
  paymentInput,
  scheduleFixture,
  validate,
  type FinanceAccount,
  type FinanceGraph,
  type FinanceHarness,
} from './finance-helpers.js';
let h: FinanceHarness,
  admin: FinanceAccount,
  accountant: FinanceAccount,
  other: FinanceAccount,
  parent: FinanceAccount,
  pupil: FinanceAccount,
  teacher: FinanceAccount,
  director: FinanceAccount,
  staff: FinanceAccount,
  denied: FinanceAccount;
let a: FinanceGraph,
  b: FinanceGraph,
  foreign: FinanceGraph,
  plan: Awaited<ReturnType<typeof scheduleFixture>>,
  invoice: InvoiceView,
  first: PaymentView,
  second: PaymentView,
  cash: CashSessionView;
beforeAll(async () => {
  h = await financeHarness();
  const ta = await h.tenant(),
    tb = await h.tenant();
  admin = await h.account(ta.id, 'SCHOOL_ADMIN');
  accountant = await h.account(ta.id, 'ACCOUNTANT');
  other = await h.account(tb.id, 'SCHOOL_ADMIN');
  parent = await h.account(ta.id, 'PARENT');
  pupil = await h.account(ta.id, 'STUDENT');
  teacher = await h.account(ta.id, 'TEACHER');
  director = await h.account(ta.id, 'DIRECTOR');
  staff = await h.account(ta.id, 'ACADEMIC_STAFF');
  denied = await h.account(ta.id, null);
  a = await h.graph(ta.id, admin.browser, pupil.userId);
  b = await h.graph(ta.id, admin.browser);
  foreign = await h.graph(tb.id, other.browser);
  const guardian = await h.db.guardian.create({
    data: {
      tenantId: ta.id,
      userId: parent.userId,
      guardianReference: 'LOT8-PARENT',
      firstName: 'Finance',
      lastName: 'Parent',
    },
  });
  await h.db.studentGuardian.create({
    data: {
      tenantId: ta.id,
      studentId: a.student.id,
      guardianId: guardian.id,
      relationship: 'PARENT',
    },
  });
}, 120000);
afterAll(async () => {
  await h?.close();
});
async function detail(id = invoice.id) {
  return (await accountant.browser.send<InvoiceView>(`finance/invoices/${id}`)).body;
}
async function error(
  path: string,
  input: unknown,
  code: string,
  headers: Record<string, string> = {},
) {
  const reply = await accountant.browser.send<{ code: string }>(path, input, 'POST', headers);
  expect(reply.status).toBe(409);
  expect(reply.body.code).toBe(code);
}
describe('LOT 8 real HTTP financial workflow and isolation', () => {
  it('creates fee type, scoped schedule and three exact installments', async () => {
    plan = await scheduleFixture(accountant.browser, a);
    expect(plan.schedule.items[0]?.installments).toHaveLength(3);
  });
  it('archives and restores a fee type without deleting it', async () => {
    const path = `finance/fee-types/${plan.fee.id}`;
    expect(
      (await accountant.browser.send<FeeTypeView>(`${path}/archive`, {}, 'POST')).body.archivedAt,
    ).not.toBeNull();
    expect(
      (await accountant.browser.send<FeeTypeView>(`${path}/restore`, {}, 'POST')).body.archivedAt,
    ).toBeNull();
  });
  it('rejects a fee type from another tenant', async () => {
    const p = await scheduleFixture(other.browser, foreign);
    expect(
      (
        await accountant.browser.send(
          `finance/fee-schedules/${plan.schedule.id}/items`,
          { feeTypeId: p.fee.id, amountMinor: '1', dueOn: '2026-12-31' },
          'POST',
        )
      ).status,
    ).toBe(404);
  });
  it('rejects schedule A linked to class B', async () =>
    expect(
      (
        await accountant.browser.send(
          'finance/fee-schedules',
          {
            code: 'CROSS',
            name: 'Cross',
            academicYearId: a.year.id,
            classId: foreign.classroom.id,
            currency: 'XOF',
          },
          'POST',
        )
      ).status,
    ).toBe(404));
  it.each(['0', '-100', '1.5', '9223372036854775808'])(
    'rejects invalid fee amount %s',
    async (amountMinor) =>
      expect(
        (
          await accountant.browser.send(
            `finance/fee-schedules/${plan.schedule.id}/items`,
            { feeTypeId: plan.fee.id, amountMinor, dueOn: '2026-12-31' },
            'POST',
          )
        ).status,
      ).toBe(400),
  );
  it('rejects installment sum mismatch', async () =>
    await error(
      `finance/fee-schedules/${plan.schedule.id}/items`,
      {
        feeTypeId: plan.fee.id,
        amountMinor: '500',
        dueOn: '2026-12-31',
        installments: [{ amountMinor: '499', dueOn: '2026-12-31', ordinal: 1 }],
      },
      'FINANCE_INSTALLMENTS_INVALID',
    ));
  it('issues an enrollment-linked snapshot with exact backend totals', async () => {
    invoice = await invoiceFixture(accountant.browser, a, plan.schedule.id);
    expect(invoice).toMatchObject({
      status: 'ISSUED',
      totalAmountMinor: '300000',
      balanceMinor: '300000',
      enrollmentId: a.enrollment.id,
    });
    expect(invoice.lines).toHaveLength(3);
    expect(invoice.invoiceNumber).toMatch(/^FAC-\d{4}-\d{6}$/);
  });
  it('refuses a mismatched student/enrollment and cross-tenant enrollment', async () => {
    for (const [studentId, enrollmentId] of [
      [b.student.id, a.enrollment.id],
      [foreign.student.id, foreign.enrollment.id],
    ])
      expect(
        (
          await accountant.browser.send(
            'finance/invoices',
            { studentId, enrollmentId, feeScheduleId: plan.schedule.id, issuedOn: '2026-01-01' },
            'POST',
          )
        ).status,
      ).toBe(404);
  });
  it('keeps invoice snapshots unchanged after renaming fees, grid and class', async () => {
    await accountant.browser.send(
      `finance/fee-types/${plan.fee.id}`,
      { name: 'Renamed fee' },
      'PATCH',
    );
    await accountant.browser.send(
      `finance/fee-schedules/${plan.schedule.id}`,
      { name: 'Renamed grid' },
      'PATCH',
    );
    await h.db.schoolClass.update({
      where: { id: a.classroom.id },
      data: { name: 'Renamed class' },
    });
    expect(await detail()).toEqual(invoice);
  });
  it('captures and explicitly validates the first partial payment', async () => {
    first = await capture(accountant.browser, invoice);
    expect(first.status).toBe('PENDING');
    expect((await detail()).balanceMinor).toBe('300000');
    first = await validate(accountant.browser, first);
    expect(first.receipts).toHaveLength(1);
    expect((await detail()).balanceMinor).toBe('200000');
  });
  it('applies the second payment and restores exact remaining balance', async () => {
    second = await validate(
      accountant.browser,
      await capture(accountant.browser, invoice, '50000'),
    );
    expect(await detail()).toMatchObject({
      paidMinor: '150000',
      balanceMinor: '150000',
      status: 'PARTIALLY_PAID',
    });
  });
  it('rejects payment over remaining balance', async () =>
    await error('finance/payments', paymentInput(invoice, '150001'), 'FINANCE_OVERPAYMENT', {
      'Idempotency-Key': randomUUID(),
    }));
  it('rejects allocation greater than payment', async () =>
    await error(
      'finance/payments',
      { ...paymentInput(invoice, '1'), allocations: [{ invoiceId: invoice.id, amountMinor: '2' }] },
      'FINANCE_OVERPAYMENT',
      { 'Idempotency-Key': randomUUID() },
    ));
  it('rejects another currency', async () =>
    await error(
      'finance/payments',
      { ...paymentInput(invoice, '1'), currency: 'EUR' },
      'FINANCE_CURRENCY_MISMATCH',
      { 'Idempotency-Key': randomUUID() },
    ));
  it('rejects foreign invoice allocation without revealing it', async () =>
    expect(
      (
        await other.browser.send(
          'finance/payments',
          { ...paymentInput(invoice, '1'), studentId: foreign.student.id },
          'POST',
          { 'Idempotency-Key': randomUUID() },
        )
      ).status,
    ).toBe(404));
  it('requires an idempotency key', async () =>
    expect(
      (await accountant.browser.send('finance/payments', paymentInput(invoice, '1'), 'POST'))
        .status,
    ).toBe(400));
  it('creates exactly one payment for 10 simultaneous identical requests', async () => {
    const key = randomUUID(),
      input = paymentInput(invoice, '1000');
    const replies = await Promise.all(
      Array.from({ length: 10 }, () =>
        accountant.browser.send<PaymentView>('finance/payments', input, 'POST', {
          'Idempotency-Key': key,
        }),
      ),
    );
    expect(replies.every((r) => r.status === 201)).toBe(true);
    expect(new Set(replies.map((r) => r.body.id)).size).toBe(1);
    expect(
      await h.db.payment.count({
        where: { tenantId: a.tenantId, idempotencyKey: `payment:create:${key}` },
      }),
    ).toBe(1);
    await error(
      'finance/payments',
      paymentInput(invoice, '1001'),
      'FINANCE_DUPLICATE_IDEMPOTENCY_KEY',
      { 'Idempotency-Key': key },
    );
  });
  it('generates unique concurrent invoice references', async () => {
    const rows = await Promise.all([
      invoiceFixture(accountant.browser, a, plan.schedule.id),
      invoiceFixture(accountant.browser, a, plan.schedule.id),
    ]);
    expect(new Set(rows.map((r) => r.invoiceNumber)).size).toBe(2);
  });
  it('allows one concurrent validation and one coherent conflict', async () => {
    const inv = await invoiceFixture(accountant.browser, a, plan.schedule.id),
      p = await capture(accountant.browser, inv, '1');
    const replies = await Promise.all([
      accountant.browser.send(`finance/payments/${p.id}/validate`, {}, 'POST'),
      accountant.browser.send(`finance/payments/${p.id}/validate`, {}, 'POST'),
    ]);
    expect(replies.map((r) => r.status).toSorted()).toEqual([200, 409]);
    expect(await h.db.receipt.count({ where: { tenantId: a.tenantId, paymentId: p.id } })).toBe(1);
  });
  it('rejects the losing concurrent allocation on the last available balance', async () => {
    const inv = await invoiceFixture(accountant.browser, a, plan.schedule.id);
    const payments = await Promise.all([
      capture(accountant.browser, inv, '300000'),
      capture(accountant.browser, inv, '300000'),
    ]);
    const replies = await Promise.all(
      payments.map((p) => accountant.browser.send(`finance/payments/${p.id}/validate`, {}, 'POST')),
    );
    expect(replies.map((r) => r.status).toSorted()).toEqual([200, 409]);
    expect((await detail(inv.id)).balanceMinor).toBe('0');
  });
  it('generates distinct receipts during concurrent validations', async () => {
    const inv = await invoiceFixture(accountant.browser, a, plan.schedule.id);
    const payments = await Promise.all([
      capture(accountant.browser, inv, '1000'),
      capture(accountant.browser, inv, '2000'),
    ]);
    const rows = await Promise.all(payments.map((p) => validate(accountant.browser, p)));
    expect(new Set(rows.map((r) => r.receipts[0]?.receiptNumber)).size).toBe(2);
  });
  it('requires an explicit cancellation request', async () =>
    await error(
      `finance/payments/${first.id}/cancel`,
      { reason: 'Correction requested' },
      'FINANCE_CANCELLATION_REQUEST_REQUIRED',
    ));
  it('records cancellation request, a full reversal, original payment and receipt', async () => {
    expect(
      (
        await accountant.browser.send(
          `finance/payments/${first.id}/request-cancellation`,
          { reason: 'Duplicate collection' },
          'POST',
        )
      ).status,
    ).toBe(200);
    const reply = await accountant.browser.send<PaymentView>(
      `finance/payments/${first.id}/cancel`,
      { reason: 'Approved refund' },
      'POST',
    );
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ status: 'REVERSED', amountMinor: '100000' });
    expect(reply.body.receipts[0]?.id).toBe(first.receipts[0]?.id);
    expect(reply.body.reversals).toHaveLength(1);
    expect((await detail()).balanceMinor).toBe('250000');
  });
  it('rejects double cancellation', async () =>
    await error(
      `finance/payments/${first.id}/cancel`,
      { reason: 'Duplicate retry' },
      'FINANCE_PAYMENT_CANCELLED',
    ));
  it('serializes concurrent cancellations with one reversal', async () => {
    await accountant.browser.send(
      `finance/payments/${second.id}/request-cancellation`,
      { reason: 'Second refund' },
      'POST',
    );
    const rows = await Promise.all(
      [1, 2].map(() =>
        accountant.browser.send(
          `finance/payments/${second.id}/cancel`,
          { reason: 'Second approved refund' },
          'POST',
        ),
      ),
    );
    expect(rows.map((r) => r.status).toSorted()).toEqual([200, 409]);
    expect(
      await h.db.paymentReversal.count({ where: { tenantId: a.tenantId, paymentId: second.id } }),
    ).toBe(1);
  });
  it('adds a scholarship without mutating invoice lines', async () => {
    const before = await detail();
    const reply = await accountant.browser.send<InvoiceView>(
      `finance/invoices/${invoice.id}/adjustments`,
      { kind: 'SCHOLARSHIP', amountMinor: '-25000', reason: 'Approved scholarship' },
      'POST',
    );
    expect(reply.status).toBe(200);
    expect(reply.body.totalAmountMinor).toBe('275000');
    expect(reply.body.lines.map((l) => l.totalAmountMinor)).toEqual(
      before.lines.map((l) => l.totalAmountMinor),
    );
    expect(reply.body.adjustments[0]?.actorMembershipId).toBe(accountant.membershipId);
  });
  it('preserves BIGINT amounts larger than 2^53 through PostgreSQL and JSON', async () => {
    const p = await scheduleFixture(accountant.browser, a, '9007199254740993', 'EUR');
    const inv = await invoiceFixture(accountant.browser, a, p.schedule.id);
    expect(inv.totalAmountMinor).toBe('9007199254740993');
    const pay = await validate(accountant.browser, await capture(accountant.browser, inv, '1250'));
    expect(pay.receipts[0]?.amountMinor).toBe('1250');
    expect((await detail(inv.id)).balanceMinor).toBe('9007199254739743');
  });
  it('rejects cash collection without a cash session', async () =>
    await error(
      'finance/payments',
      paymentInput(invoice, '1000', 'CASH'),
      'FINANCE_CASH_SESSION_REQUIRED',
      { 'Idempotency-Key': randomUUID() },
    ));
  it('opens a cashier session and rejects a second open session', async () => {
    const r = await accountant.browser.send<CashSessionView>(
      'finance/cash-sessions/open',
      { currency: 'XOF', openingAmountMinor: '10000' },
      'POST',
    );
    expect(r.status).toBe(201);
    cash = r.body;
    await error(
      'finance/cash-sessions/open',
      { currency: 'XOF', openingAmountMinor: '0' },
      'FINANCE_CASH_SESSION_ALREADY_OPEN',
    );
  });
  it('rejects a foreign cash session', async () => {
    const foreignCash = (
      await other.browser.send<CashSessionView>(
        'finance/cash-sessions/open',
        { currency: 'XOF', openingAmountMinor: '0' },
        'POST',
      )
    ).body;
    expect(
      (
        await accountant.browser.send(
          'finance/payments',
          paymentInput(invoice, '1', 'CASH', foreignCash.id),
          'POST',
          { 'Idempotency-Key': randomUUID() },
        )
      ).status,
    ).toBe(404);
  });
  it('captures CASH, blocks premature closing and reconciles the declared closing balance', async () => {
    const p = await accountant.browser.send<PaymentView>(
      'finance/payments',
      paymentInput(invoice, '1000', 'CASH', cash.id),
      'POST',
      { 'Idempotency-Key': randomUUID() },
    );
    expect(p.status).toBe(201);
    await error(
      `finance/cash-sessions/${cash.id}/close`,
      { closingAmountMinor: '10000', reason: 'End of day' },
      'FINANCE_CASH_PENDING_PAYMENTS',
    );
    await validate(accountant.browser, p.body);
    const closed = await accountant.browser.send<CashSessionView>(
      `finance/cash-sessions/${cash.id}/close`,
      { closingAmountMinor: '10900', reason: 'Counted cash discrepancy' },
      'POST',
    );
    expect(closed.status).toBe(200);
    expect(closed.body).toMatchObject({
      expectedClosingAmountMinor: '11000',
      closingAmountMinor: '10900',
      differenceAmountMinor: '-100',
      status: 'CLOSED',
    });
  });
  it('filters parent and student lists, totals, invoices, payments and receipts before pagination', async () => {
    const bp = await scheduleFixture(accountant.browser, b),
      bi = await invoiceFixture(accountant.browser, b, bp.schedule.id),
      payment = await validate(accountant.browser, await capture(accountant.browser, bi, '500'));
    for (const user of [parent, pupil]) {
      expect((await user.browser.send(`finance/invoices/${invoice.id}`)).status).toBe(200);
      expect((await user.browser.send(`finance/invoices/${bi.id}`)).status).toBe(404);
      expect((await user.browser.send(`finance/payments/${payment.id}`)).status).toBe(404);
      expect((await user.browser.send(`finance/receipts/${payment.receipts[0]?.id}`)).status).toBe(
        404,
      );
      const list = await user.browser.send<FinanceList>('finance/invoices?pageSize=1');
      expect(list.status).toBe(200);
      expect(
        list.body.items.every((i) => i.kind === 'invoices' && i.studentId === a.student.id),
      ).toBe(true);
      expect(
        (await user.browser.send<FinanceSummary>(`finance/summary?studentId=${b.student.id}`)).body
          .currencies,
      ).toEqual([]);
      expect((await user.browser.send('finance/cash-sessions')).status).toBe(403);
    }
  });
  it('does not disclose cross-tenant receipts', async () =>
    expect((await other.browser.send(`finance/receipts/${first.receipts[0]?.id}`)).status).toBe(
      404,
    ));
  it('rejects teacher, academic staff, parent, student and director payment capture', async () => {
    for (const actor of [teacher, staff, parent, pupil, director])
      expect(
        (
          await actor.browser.send('finance/payments', paymentInput(invoice, '1'), 'POST', {
            'Idempotency-Key': randomUUID(),
          })
        ).status,
      ).toBe(403);
  });
  it('keeps accountant grades.update denied by the real permission guard', async () => {
    const result = await accountant.browser.send('finance-cert/grades');
    expect(result.status).toBe(403);
  });
  it('denies unauthenticated and missing-permission reads', async () => {
    expect((await new FinanceBrowser(h.base).send('finance/invoices')).status).toBe(401);
    expect((await denied.browser.send('finance/invoices')).status).toBe(403);
  });
  it('rejects body/query/header tenant injection', async () => {
    expect(
      (
        await accountant.browser.send(
          'finance/fee-types',
          { name: 'Injected', code: 'INJECT', tenantId: foreign.tenantId },
          'POST',
        )
      ).status,
    ).toBe(400);
    expect(
      (await accountant.browser.send(`finance/invoices?tenantId=${foreign.tenantId}`)).status,
    ).toBe(400);
    expect(
      (
        await accountant.browser.send('finance/invoices', undefined, 'GET', {
          'X-Tenant-ID': foreign.tenantId,
        })
      ).status,
    ).toBe(403);
  });
  it('protects validated payments, allocations, receipts, adjustments and audit against raw SQL mutations', async () => {
    const paid = await h.db.payment.findFirstOrThrow({
      where: { tenantId: a.tenantId, status: 'COMPLETED' },
      include: { allocations: true, receipts: true },
    });
    await expect(
      h.db.$executeRaw`UPDATE payments SET amount_minor=amount_minor+1 WHERE id=${paid.id}::uuid`,
    ).rejects.toThrow();
    await expect(
      h.db.$executeRaw`DELETE FROM payments WHERE id=${paid.id}::uuid`,
    ).rejects.toThrow();
    await expect(
      h.db
        .$executeRaw`UPDATE payment_allocations SET amount_minor=amount_minor+1 WHERE payment_id=${paid.id}::uuid`,
    ).rejects.toThrow();
    await expect(
      h.db.$executeRaw`DELETE FROM receipts WHERE payment_id=${paid.id}::uuid`,
    ).rejects.toThrow();
    await expect(
      h.db.$executeRaw`DELETE FROM invoice_adjustments WHERE invoice_id=${invoice.id}::uuid`,
    ).rejects.toThrow();
    await expect(
      h.db
        .$executeRaw`DELETE FROM audit_logs WHERE tenant_id=${a.tenantId}::uuid AND action='payment.validated'`,
    ).rejects.toThrow();
  });
  it('records all thirteen required financial audit actions with request and actor context', async () => {
    const rows = await h.db.auditLog.findMany({ where: { tenantId: a.tenantId } });
    for (const action of [
      'fee_type.created',
      'fee_type.updated',
      'fee_schedule.created',
      'fee_schedule.updated',
      'invoice.created',
      'invoice.adjusted',
      'payment.created',
      'payment.validated',
      'payment.cancellation_requested',
      'payment.cancelled',
      'receipt.created',
      'cash_session.opened',
      'cash_session.closed',
    ]) {
      const row = rows.find((r) => r.action === action);
      expect(row, action).toBeDefined();
      expect(row?.actorMembershipId).toBeTruthy();
      expect(row?.metadata).toHaveProperty('requestId');
    }
    expect(JSON.stringify(rows)).not.toContain('passwordHash');
  });
  it('rejects a pending payment explicitly and releases its cash session', async () => {
    const session = await accountant.browser.send<CashSessionView>(
      'finance/cash-sessions/open',
      { currency: 'XOF', openingAmountMinor: '0' },
      'POST',
    );
    expect(session.status).toBe(201);
    const p = await accountant.browser.send<PaymentView>(
      'finance/payments',
      paymentInput(invoice, '1', 'CASH', session.body.id),
      'POST',
      { 'Idempotency-Key': randomUUID() },
    );
    expect(p.status).toBe(201);
    const rejected = await accountant.browser.send<PaymentView>(
      `finance/payments/${p.body.id}/reject`,
      { reason: 'Saisie abandonnée' },
      'POST',
    );
    expect(rejected.status).toBe(200);
    expect(rejected.body.status).toBe('FAILED');
    expect(rejected.body.allocations).toHaveLength(1);
    expect(rejected.body.receipts).toHaveLength(0);
    expect(
      (
        await accountant.browser.send(
          `finance/cash-sessions/${session.body.id}/close`,
          { closingAmountMinor: '0', reason: 'Clôture après rejet' },
          'POST',
        )
      ).status,
    ).toBe(200);
  });
  it('allocates a single payment to multiple invoices of the same student', async () => {
    const one = await invoiceFixture(accountant.browser, a, plan.schedule.id),
      two = await invoiceFixture(accountant.browser, a, plan.schedule.id);
    const p = await accountant.browser.send<PaymentView>(
      'finance/payments',
      {
        ...paymentInput(one, '300'),
        allocations: [
          { invoiceId: one.id, amountMinor: '100' },
          { invoiceId: two.id, amountMinor: '200' },
        ],
      },
      'POST',
      { 'Idempotency-Key': randomUUID() },
    );
    expect(p.status).toBe(201);
    await validate(accountant.browser, p.body);
    expect((await detail(one.id)).paidMinor).toBe('100');
    expect((await detail(two.id)).paidMinor).toBe('200');
  });
  it('refuses a new invoice on a withdrawn enrollment', async () => {
    const g = await h.graph(a.tenantId, admin.browser),
      p = await scheduleFixture(accountant.browser, g);
    expect(
      (
        await admin.browser.send(
          `enrollments/${g.enrollment.id}/cancel`,
          { reason: 'Départ définitif', effectiveDate: '2026-02-01' },
          'POST',
        )
      ).status,
    ).toBe(200);
    await error(
      'finance/invoices',
      {
        studentId: g.student.id,
        enrollmentId: g.enrollment.id,
        feeScheduleId: p.schedule.id,
        issuedOn: '2026-01-01',
      },
      'FINANCE_ENROLLMENT_NOT_ACTIVE',
    );
  });
  it('collects historical invoices after academic closure without creating new ones', async () => {
    const g = await h.graph(a.tenantId, admin.browser),
      p = await scheduleFixture(accountant.browser, g),
      inv = await invoiceFixture(accountant.browser, g, p.schedule.id),
      payment = await capture(accountant.browser, inv, '100');
    expect(
      (
        await admin.browser.send(
          `enrollments/${g.enrollment.id}/complete`,
          { reason: 'Scolarité terminée', effectiveDate: '2026-12-31' },
          'POST',
        )
      ).status,
    ).toBe(200);
    await h.db.academicYear.update({ where: { id: g.year.id }, data: { status: 'CLOSED' } });
    await validate(accountant.browser, payment);
    expect((await detail(inv.id)).balanceMinor).toBe('299900');
    expect(
      (
        await accountant.browser.send(
          'finance/invoices',
          {
            studentId: g.student.id,
            enrollmentId: g.enrollment.id,
            feeScheduleId: p.schedule.id,
            issuedOn: '2026-01-01',
          },
          'POST',
        )
      ).status,
    ).toBe(409);
  });
  it('rejects reducing an invoice below its net collected amount', async () => {
    const inv = await invoiceFixture(accountant.browser, a, plan.schedule.id);
    await validate(accountant.browser, await capture(accountant.browser, inv, '200000'));
    await error(
      `finance/invoices/${inv.id}/adjustments`,
      { kind: 'DISCOUNT', amountMinor: '-100001', reason: 'Réduction excessive' },
      'FINANCE_OVERPAYMENT',
    );
  });
  it('checks SQL allocation limits at transaction commit, not only in application code', async () => {
    const inv = await invoiceFixture(accountant.browser, a, plan.schedule.id);
    await expect(
      h.db.$transaction(async (db) => {
        const p = await db.payment.create({
          data: {
            tenantId: a.tenantId,
            studentId: a.student.id,
            paymentReference: `RAW-${randomUUID()}`,
            idempotencyKey: randomUUID(),
            amountMinor: 1n,
          },
        });
        await db.paymentAllocation.create({
          data: { tenantId: a.tenantId, paymentId: p.id, invoiceId: inv.id, amountMinor: 2n },
        });
      }),
    ).rejects.toThrow();
  });
  it('rejects raw SQL cross-currency allocations', async () => {
    const inv = await invoiceFixture(accountant.browser, a, plan.schedule.id);
    await expect(
      h.db.$transaction(async (db) => {
        const p = await db.payment.create({
          data: {
            tenantId: a.tenantId,
            studentId: a.student.id,
            paymentReference: `RAW-${randomUUID()}`,
            idempotencyKey: randomUUID(),
            amountMinor: 1n,
            currency: 'EUR',
          },
        });
        await db.paymentAllocation.create({
          data: { tenantId: a.tenantId, paymentId: p.id, invoiceId: inv.id, amountMinor: 1n },
        });
      }),
    ).rejects.toThrow();
  });
  it('rejects raw SQL corruption of invoice total, paid status and historical lines', async () => {
    const inv = await invoiceFixture(accountant.browser, a, plan.schedule.id);
    await expect(
      h.db
        .$executeRaw`UPDATE invoices SET total_amount_minor=total_amount_minor+1 WHERE id=${inv.id}::uuid`,
    ).rejects.toThrow();
    await expect(
      h.db.$executeRaw`UPDATE invoices SET status='PAID' WHERE id=${inv.id}::uuid`,
    ).rejects.toThrow();
    await expect(
      h.db
        .$executeRaw`UPDATE invoice_lines SET description='Rewritten history' WHERE invoice_id=${inv.id}::uuid`,
    ).rejects.toThrow();
    await expect(
      h.db.$executeRaw`DELETE FROM payment_reversals WHERE payment_id=${first.id}::uuid`,
    ).rejects.toThrow();
  });
  it('reports no SQL money corruption, duplicate references or orphan financial links', async () => {
    const rows = await h.db.$queryRaw<{ violations: bigint }[]>`SELECT count(*) violations FROM (
      SELECT p.id FROM payments p WHERE p.amount_minor<(SELECT coalesce(sum(a.amount_minor),0) FROM payment_allocations a WHERE (a.tenant_id,a.payment_id)=(p.tenant_id,p.id))
      UNION ALL SELECT i.id FROM invoices i WHERE i.total_amount_minor<(SELECT coalesce(sum(a.amount_minor),0) FROM payment_allocations a JOIN payments p ON (p.tenant_id,p.id)=(a.tenant_id,a.payment_id) WHERE (a.tenant_id,a.invoice_id)=(i.tenant_id,i.id) AND p.status='COMPLETED')
      UNION ALL SELECT a.id FROM payment_allocations a LEFT JOIN payments p ON (p.tenant_id,p.id)=(a.tenant_id,a.payment_id) LEFT JOIN invoices i ON (i.tenant_id,i.id)=(a.tenant_id,a.invoice_id) WHERE p.id IS NULL OR i.id IS NULL OR p.currency<>i.currency
      UNION ALL SELECT r.id FROM receipts r LEFT JOIN payments p ON (p.tenant_id,p.id)=(r.tenant_id,r.payment_id) WHERE p.id IS NULL OR r.currency<>p.currency OR r.amount_minor<>p.amount_minor
      UNION ALL SELECT min(id::text)::uuid FROM invoices GROUP BY tenant_id,invoice_number HAVING count(*)>1
      UNION ALL SELECT min(id::text)::uuid FROM payments GROUP BY tenant_id,idempotency_key HAVING count(*)>1
      UNION ALL SELECT min(id::text)::uuid FROM receipts GROUP BY tenant_id,receipt_number HAVING count(*)>1
    ) violations`;
    expect(rows[0]?.violations).toBe(0n);
  });
  it('has no unexpected server errors', () => expect(h.errors).toEqual([]));
});
