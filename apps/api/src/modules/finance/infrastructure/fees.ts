import type { Prisma } from '@gestschool/database';
import type { FinanceCommand } from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
import { financeConflict, financeFound, installmentPolicy } from '../domain/policy.js';
import { audit } from './database.js';
import { financeDetail } from './reads.js';
import { date } from './views.js';
import { hydrateSchedules } from './hydration.js';
type FeeCommand = Extract<
  FinanceCommand,
  { action: `fee-type.${string}` | `schedule.${string}` | `item.${string}` }
>;
async function scheduleTarget(
  db: Prisma.TransactionClient,
  tenantId: string,
  data: { academicYearId: string; levelId: string | null; classId: string | null },
) {
  const year = financeFound(
    await db.academicYear.findFirst({ where: { tenantId, id: data.academicYearId } }),
  );
  if (['CLOSED', 'ARCHIVED'].includes(year.status)) financeConflict('FINANCE_YEAR_CLOSED');
  if (data.levelId) {
    const level = financeFound(await db.level.findFirst({ where: { tenantId, id: data.levelId } }));
    if (level.status !== 'ACTIVE') financeConflict('FINANCE_CLASS_ARCHIVED');
  }
  if (data.classId) {
    const row = financeFound(
      await db.schoolClass.findFirst({ where: { tenantId, id: data.classId } }),
    );
    if (row.academicYearId !== year.id || (data.levelId && row.levelId !== data.levelId))
      financeConflict('FINANCE_CLASS_YEAR_MISMATCH');
    if (row.status !== 'ACTIVE') financeConflict('FINANCE_CLASS_ARCHIVED');
  }
  return year;
}
export async function writeFees(
  db: Prisma.TransactionClient,
  context: RequestContext,
  command: FeeCommand,
) {
  const tenantId = context.tenantId;
  if (command.action === 'fee-type.create') {
    const row = await db.feeType.create({ data: { tenantId, ...command.input } });
    const after = await financeDetail(db, context, 'fee-types', row.id, true);
    await audit(db, context, 'fee_type.created', row.id, null, after);
    return after;
  }
  if (
    command.action === 'fee-type.update' ||
    command.action === 'fee-type.archive' ||
    command.action === 'fee-type.restore'
  ) {
    const before = await financeDetail(db, context, 'fee-types', command.id, true);
    const data: Prisma.FeeTypeUpdateInput =
      command.action === 'fee-type.update'
        ? {
            ...(command.input.code === undefined ? {} : { code: command.input.code }),
            ...(command.input.name === undefined ? {} : { name: command.input.name }),
          }
        : { archivedAt: command.action === 'fee-type.archive' ? new Date() : null };
    await db.feeType.update({ where: { tenantId_id: { tenantId, id: command.id } }, data });
    const after = await financeDetail(db, context, 'fee-types', command.id, true);
    await audit(db, context, 'fee_type.updated', command.id, before, after);
    return after;
  }
  if (command.action === 'schedule.create') {
    const { classId, ...data } = command.input;
    await scheduleTarget(db, tenantId, command.input);
    const row = await db.feeSchedule.create({
      data: { tenantId, ...data, schoolClassId: classId },
    });
    const after = await financeDetail(db, context, 'fee-schedules', row.id, true);
    await audit(db, context, 'fee_schedule.created', row.id, null, after);
    return after;
  }
  const base = financeFound(
    await db.feeSchedule.findFirst({
      where: { tenantId, id: command.id },
    }),
  );
  const row = financeFound((await hydrateSchedules(db, tenantId, [base]))[0]);
  const before = await financeDetail(db, context, 'fee-schedules', row.id, true);
  if (command.action === 'schedule.update') {
    const merged = {
      academicYearId: command.input.academicYearId ?? row.academicYearId,
      levelId: command.input.levelId === undefined ? row.levelId : command.input.levelId,
      classId: command.input.classId === undefined ? row.schoolClassId : command.input.classId,
    };
    const year = await scheduleTarget(db, tenantId, merged);
    for (const item of row.items) {
      if (item.dueOn && (item.dueOn < year.startsOn || item.dueOn > year.endsOn))
        financeConflict('FINANCE_INSTALLMENTS_INVALID');
      installmentPolicy(
        item.amountMinor,
        { startsOn: date(year.startsOn), endsOn: date(year.endsOn) },
        item.installments.map((i) => ({
          amountMinor: String(i.amountMinor),
          dueOn: date(i.dueOn),
          ordinal: i.ordinal,
        })),
      );
    }
    const input = command.input;
    await db.feeSchedule.update({
      where: { tenantId_id: { tenantId, id: row.id } },
      data: {
        academicYearId: merged.academicYearId,
        levelId: merged.levelId,
        schoolClassId: merged.classId,
        ...(input.code === undefined ? {} : { code: input.code }),
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.currency === undefined ? {} : { currency: input.currency }),
      },
    });
  } else {
    const year = await scheduleTarget(db, tenantId, {
      academicYearId: row.academicYearId,
      levelId: row.levelId,
      classId: row.schoolClassId,
    });
    if (command.action === 'item.delete' || command.action === 'item.update')
      financeFound(row.items.find((item) => item.id === command.itemId));
    if (command.action === 'item.delete') {
      await db.feeInstallment.deleteMany({
        where: { tenantId, feeScheduleItemId: command.itemId },
      });
      await db.feeScheduleItem.delete({ where: { tenantId_id: { tenantId, id: command.itemId } } });
    } else {
      const { installments, ...input } = command.input;
      const feeType = financeFound(
        await db.feeType.findFirst({ where: { tenantId, id: input.feeTypeId } }),
      );
      if (feeType.archivedAt) financeConflict('FINANCE_FEE_TYPE_ARCHIVED');
      if (input.dueOn < date(year.startsOn) || input.dueOn > date(year.endsOn))
        financeConflict('FINANCE_INSTALLMENTS_INVALID');
      installmentPolicy(
        BigInt(input.amountMinor),
        { startsOn: date(year.startsOn), endsOn: date(year.endsOn) },
        installments,
      );
      if (installments.some((i) => i.dueOn > input.dueOn))
        financeConflict('FINANCE_INSTALLMENTS_INVALID');
      if (command.action === 'item.create' && row.items.length >= 100)
        financeConflict('FINANCE_ITEM_LIMIT');
      const data = {
        feeTypeId: input.feeTypeId,
        amountMinor: BigInt(input.amountMinor),
        dueOn: new Date(input.dueOn),
      };
      const item =
        command.action === 'item.create'
          ? await db.feeScheduleItem.create({ data: { tenantId, feeScheduleId: row.id, ...data } })
          : await db.feeScheduleItem.update({
              where: { tenantId_id: { tenantId, id: command.itemId } },
              data,
            });
      await db.feeInstallment.deleteMany({ where: { tenantId, feeScheduleItemId: item.id } });
      if (installments.length)
        await db.feeInstallment.createMany({
          data: installments.map((i) => ({
            tenantId,
            feeScheduleItemId: item.id,
            amountMinor: BigInt(i.amountMinor),
            dueOn: new Date(i.dueOn),
            ordinal: i.ordinal,
          })),
        });
    }
  }
  const after = await financeDetail(db, context, 'fee-schedules', row.id, true);
  await audit(db, context, 'fee_schedule.updated', row.id, before, after);
  return after;
}
