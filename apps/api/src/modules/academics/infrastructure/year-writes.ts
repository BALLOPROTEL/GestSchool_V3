import type { Prisma } from '@gestschool/database';
import type { AcademicPeriodCreate } from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
import type { AcademicCommand } from '../domain/academic.repository.js';
import {
  activeRecord,
  conflict,
  required,
  validPeriod,
  writableYear,
  yearTransition,
} from '../domain/policy.js';
import { audit } from './database.js';
import { civilDate, periodView, yearView } from './views.js';

type YearCommand = Extract<
  AcademicCommand,
  { type: 'year.create' | 'year.update' | 'year.transition' }
>;
export async function writeYear(
  db: Prisma.TransactionClient,
  context: RequestContext,
  command: YearCommand,
) {
  const tenantId = context.tenantId;
  if (command.type === 'year.create') {
    const row = await db.academicYear.create({
      data: {
        tenantId,
        ...command.input,
        startsOn: new Date(command.input.startsOn),
        endsOn: new Date(command.input.endsOn),
      },
    });
    const result = yearView(row);
    await audit(db, context, 'academic_year.created', row.id, null, result);
    return result;
  }
  const before = required(await db.academicYear.findFirst({ where: { tenantId, id: command.id } }));
  if (command.type === 'year.transition') {
    const status = yearTransition(before.status, command.action);
    if (
      status === 'ACTIVE' &&
      (await db.academicYear.count({
        where: { tenantId, status: 'ACTIVE', id: { not: before.id } },
      }))
    )
      conflict('ACADEMIC_ACTIVE_YEAR_EXISTS');
    const after = await db.academicYear.update({
      where: { tenantId_id: { tenantId, id: before.id } },
      data: { status, archivedAt: status === 'ARCHIVED' ? new Date() : null },
    });
    const actions = {
      activate: 'academic_year.activated',
      close: 'academic_year.closed',
      archive: 'academic_year.archived',
    } as const;
    await audit(db, context, actions[command.action], before.id, yearView(before), yearView(after));
    return yearView(after);
  }
  writableYear(before.status);
  const startsOn = new Date(command.input.startsOn ?? civilDate(before.startsOn));
  const endsOn = new Date(command.input.endsOn ?? civilDate(before.endsOn));
  if (startsOn >= endsOn) conflict('ACADEMIC_PERIOD_DATES');
  if (
    await db.academicPeriod.count({
      where: {
        tenantId,
        academicYearId: before.id,
        OR: [{ startsOn: { lt: startsOn } }, { endsOn: { gt: endsOn } }],
      },
    })
  )
    conflict('ACADEMIC_PERIOD_DATES');
  const after = await db.academicYear.update({
    where: { tenantId_id: { tenantId, id: before.id } },
    data: {
      code: command.input.code ?? before.code,
      name: command.input.name ?? before.name,
      startsOn,
      endsOn,
    },
  });
  await audit(db, context, 'academic_year.updated', before.id, yearView(before), yearView(after));
  return yearView(after);
}

type PeriodCommand = Extract<
  AcademicCommand,
  { type: 'period.create' | 'period.update' | 'period.archive' }
>;
export async function writePeriod(
  db: Prisma.TransactionClient,
  context: RequestContext,
  command: PeriodCommand,
) {
  const tenantId = context.tenantId;
  const before =
    command.type === 'period.create'
      ? null
      : required(
          await db.academicPeriod.findFirst({
            where: { tenantId, id: command.id },
            include: { academicYear: true },
          }),
        );
  const academicYearId =
    command.type === 'period.create' ? command.yearId : required(before).academicYearId;
  const year = required(
    await db.academicYear.findFirst({ where: { tenantId, id: academicYearId } }),
  );
  writableYear(year.status);
  if (command.type === 'period.archive') {
    const existing = required(before);
    if (existing.status === 'ARCHIVED') return periodView(existing);
    const after = await db.academicPeriod.update({
      where: { tenantId_id: { tenantId, id: existing.id } },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
      include: { academicYear: true },
    });
    await audit(
      db,
      context,
      'academic_period.archived',
      existing.id,
      periodView(existing),
      periodView(after),
    );
    return periodView(after);
  }
  if (before) activeRecord(before.status);
  const input: AcademicPeriodCreate =
    command.type === 'period.create'
      ? command.input
      : {
          name: command.input.name ?? required(before).name,
          type: command.input.type ?? required(before).type,
          ordinal: command.input.ordinal ?? required(before).ordinal,
          startsOn: command.input.startsOn ?? civilDate(required(before).startsOn),
          endsOn: command.input.endsOn ?? civilDate(required(before).endsOn),
        };
  const siblings = await db.academicPeriod.findMany({
    where: {
      tenantId,
      academicYearId,
      status: 'ACTIVE',
      ...(before ? { id: { not: before.id } } : {}),
    },
  });
  validPeriod(
    input,
    { startsOn: civilDate(year.startsOn), endsOn: civilDate(year.endsOn) },
    siblings.map((row) => ({
      name: row.name,
      type: row.type,
      ordinal: row.ordinal,
      startsOn: civilDate(row.startsOn),
      endsOn: civilDate(row.endsOn),
    })),
  );
  // Ordinals remain reserved after archiving, matching the historical UNIQUE constraint.
  const data = { ...input, startsOn: new Date(input.startsOn), endsOn: new Date(input.endsOn) };
  const after = before
    ? await db.academicPeriod.update({
        where: { tenantId_id: { tenantId, id: before.id } },
        data,
        include: { academicYear: true },
      })
    : await db.academicPeriod.create({
        data: { tenantId, academicYearId, ...data },
        include: { academicYear: true },
      });
  await audit(
    db,
    context,
    before ? 'academic_period.updated' : 'academic_period.created',
    after.id,
    before ? periodView(before) : null,
    periodView(after),
  );
  return periodView(after);
}
