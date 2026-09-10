import type { Prisma } from '@gestschool/database';
import type { FinanceCommand } from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
import {
  adjustmentPolicy,
  checkedMinor,
  financeConflict,
  financeFound,
  invoiceStatus,
} from '../domain/policy.js';
import { audit } from './database.js';
import { financeDetail } from './reads.js';
import { financeReference } from './references.js';
import { date, invoicePaid } from './views.js';
import { hydrateSchedules } from './hydration.js';
type InvoiceCommand = Extract<FinanceCommand, { action: `invoice.${string}` }>;
export async function refreshInvoice(db: Prisma.TransactionClient, tenantId: string, id: string) {
  const row = financeFound(await db.invoice.findFirst({ where: { tenantId, id } }));
  const paid = (await invoicePaid(db, tenantId, [id])).get(id) ?? 0n;
  await db.invoice.update({
    where: { tenantId_id: { tenantId, id } },
    data: { status: invoiceStatus(row.totalAmountMinor, paid) },
  });
}
export async function writeInvoice(
  db: Prisma.TransactionClient,
  context: RequestContext,
  command: InvoiceCommand,
) {
  const tenantId = context.tenantId;
  if (command.action === 'invoice.create') {
    const input = command.input;
    const enrollment = financeFound(
      await db.enrollment.findFirst({
        where: { tenantId, id: input.enrollmentId, studentId: input.studentId },
      }),
    );
    const scheduleBase = financeFound(
      await db.feeSchedule.findFirst({
        where: { tenantId, id: input.feeScheduleId },
      }),
    );
    const schedule = financeFound((await hydrateSchedules(db, tenantId, [scheduleBase]))[0]);
    const student = financeFound(
      await db.student.findFirst({ where: { tenantId, id: enrollment.studentId } }),
    );
    const classroom = financeFound(
      await db.schoolClass.findFirst({ where: { tenantId, id: enrollment.schoolClassId } }),
    );
    const year = financeFound(
      await db.academicYear.findFirst({ where: { tenantId, id: enrollment.academicYearId } }),
    );
    const level = financeFound(
      await db.level.findFirst({ where: { tenantId, id: classroom.levelId } }),
    );
    if (enrollment.status !== 'ACTIVE') financeConflict('FINANCE_ENROLLMENT_NOT_ACTIVE');
    if (student.status !== 'ACTIVE') financeConflict('FINANCE_STUDENT_ARCHIVED');
    if (['CLOSED', 'ARCHIVED'].includes(year.status)) financeConflict('FINANCE_YEAR_CLOSED');
    if (classroom.status !== 'ACTIVE' || level.status !== 'ACTIVE')
      financeConflict('FINANCE_CLASS_ARCHIVED');
    if (
      schedule.academicYearId !== enrollment.academicYearId ||
      (schedule.levelId && schedule.levelId !== classroom.levelId) ||
      (schedule.schoolClassId && schedule.schoolClassId !== classroom.id)
    )
      financeConflict('FINANCE_SCHEDULE_MISMATCH');
    if (!schedule.items.length || schedule.items.some((i) => i.feeType.archivedAt))
      financeConflict('FINANCE_SCHEDULE_INVALID');
    if (input.issuedOn < date(year.startsOn) || input.issuedOn > date(year.endsOn))
      financeConflict('FINANCE_DATE_INVALID');
    const lines = schedule.items.flatMap((item) => {
      const installments = item.installments.length
        ? item.installments
        : [{ amountMinor: item.amountMinor, dueOn: item.dueOn, ordinal: 1 }];
      return installments.map((part) => {
        if (!part.dueOn || date(part.dueOn) < input.issuedOn)
          financeConflict('FINANCE_DATE_INVALID');
        return {
          tenantId,
          feeTypeId: item.feeTypeId,
          description: item.feeType.name,
          quantity: 1,
          unitAmountMinor: part.amountMinor,
          totalAmountMinor: part.amountMinor,
          dueOn: part.dueOn,
          ordinal: part.ordinal,
        };
      });
    });
    const total = checkedMinor(lines.reduce((s, l) => s + l.totalAmountMinor, 0n));
    const due = lines.reduce(
      (last, l) => (l.dueOn > last ? l.dueOn : last),
      new Date(input.issuedOn),
    );
    const row = await db.invoice.create({
      data: {
        tenantId,
        studentId: input.studentId,
        enrollmentId: enrollment.id,
        academicYearId: year.id,
        feeScheduleId: schedule.id,
        studentName: `${student.firstName} ${student.lastName}`,
        className: classroom.name,
        yearName: year.name,
        currency: schedule.currency,
        invoiceNumber: await financeReference(db, tenantId, 'invoice'),
        totalAmountMinor: total,
        issuedOn: new Date(input.issuedOn),
        dueOn: due,
        status: 'DRAFT',
      },
    });
    await db.invoiceLine.createMany({
      data: lines.map((line) => ({ ...line, invoiceId: row.id })),
    });
    await db.invoice.update({
      where: { tenantId_id: { tenantId, id: row.id } },
      data: { status: 'ISSUED' },
    });
    const after = await financeDetail(db, context, 'invoices', row.id, true);
    await audit(db, context, 'invoice.created', row.id, null, after);
    return after;
  }
  const before = await financeDetail(db, context, 'invoices', command.id, true);
  if (before.kind !== 'invoices') throw new Error('Invoice view required');
  if (['DRAFT', 'VOID'].includes(before.status)) financeConflict('FINANCE_INVOICE_NOT_PAYABLE');
  if (command.action === 'invoice.void') {
    if (
      BigInt(before.paidMinor) > 0n ||
      (await db.paymentAllocation.count({
        where: { tenantId, invoiceId: command.id, payment: { status: 'PENDING' } },
      }))
    )
      financeConflict('FINANCE_INVOICE_HAS_PAYMENTS');
    await db.invoice.update({
      where: { tenantId_id: { tenantId, id: command.id } },
      data: { status: 'VOID' },
    });
  } else {
    const amount = BigInt(command.input.amountMinor);
    adjustmentPolicy(command.input.kind, amount);
    const total = checkedMinor(BigInt(before.totalAmountMinor) + amount);
    const status = invoiceStatus(total, BigInt(before.paidMinor));
    await db.invoiceAdjustment.create({
      data: {
        tenantId,
        invoiceId: command.id,
        createdByMembershipId: context.membershipId,
        amountMinor: amount,
        kind: command.input.kind,
        reason: command.input.reason,
      },
    });
    await db.invoice.update({
      where: { tenantId_id: { tenantId, id: command.id } },
      data: { totalAmountMinor: total, status },
    });
  }
  const after = await financeDetail(db, context, 'invoices', command.id, true);
  await audit(
    db,
    context,
    command.action === 'invoice.void' ? 'invoice.voided' : 'invoice.adjusted',
    command.id,
    before,
    { ...after, reason: command.input.reason },
  );
  return after;
}
