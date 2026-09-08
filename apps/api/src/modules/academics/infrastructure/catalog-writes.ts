import type { Prisma } from '@gestschool/database';
import type { RequestContext } from '../../iam/domain/context.js';
import type { AcademicCommand } from '../domain/academic.repository.js';
import { activeRecord, required, writableYear } from '../domain/policy.js';
import { audit } from './database.js';
import { catalogView, classView } from './views.js';

import { classRelation } from './relations.js';

type CatalogCommand = Extract<
  AcademicCommand,
  { type: 'catalog.create' | 'catalog.update' | 'catalog.archive' }
>;
export async function writeCatalog(
  db: Prisma.TransactionClient,
  context: RequestContext,
  command: CatalogCommand,
) {
  const tenantId = context.tenantId;
  const level = command.entity === 'levels';
  const entityType = level ? 'level' : 'subject';
  if (command.type === 'catalog.create') {
    const data = { tenantId, code: command.input.code, name: command.input.name };
    const row = level
      ? await db.level.create({ data: { ...data, position: command.input.position ?? 0 } })
      : await db.subject.create({ data });
    await audit(db, context, `${entityType}.created`, row.id, null, catalogView(row));
    return catalogView(row);
  }
  const where = { tenantId, id: command.id };
  const before = required(
    level ? await db.level.findFirst({ where }) : await db.subject.findFirst({ where }),
  );
  const key = { tenantId_id: { tenantId, id: before.id } };
  if (command.type === 'catalog.archive') {
    if ((before.status === 'ARCHIVED') === !command.restore) return catalogView(before);
    const data = {
      status: command.restore ? ('ACTIVE' as const) : ('ARCHIVED' as const),
      archivedAt: command.restore ? null : new Date(),
    };
    const after = level
      ? await db.level.update({ where: key, data })
      : await db.subject.update({ where: key, data });
    await audit(
      db,
      context,
      `${entityType}.${command.restore ? 'restored' : 'archived'}`,
      before.id,
      catalogView(before),
      catalogView(after),
    );
    return catalogView(after);
  }
  activeRecord(before.status);
  const data = { code: command.input.code ?? before.code, name: command.input.name ?? before.name };
  const after = level
    ? await db.level.update({
        where: key,
        data: {
          ...data,
          ...(command.input.position !== undefined ? { position: command.input.position } : {}),
        },
      })
    : await db.subject.update({ where: key, data });
  await audit(
    db,
    context,
    `${entityType}.updated`,
    before.id,
    catalogView(before),
    catalogView(after),
  );
  return catalogView(after);
}

type ClassCommand = Extract<
  AcademicCommand,
  { type: 'class.create' | 'class.update' | 'class.archive' }
>;
export async function writeClass(
  db: Prisma.TransactionClient,
  context: RequestContext,
  command: ClassCommand,
) {
  const tenantId = context.tenantId;
  const before =
    command.type === 'class.create'
      ? null
      : required(
          await classRelation(
            db,
            await db.schoolClass.findFirst({ where: { tenantId, id: command.id } }),
          ),
        );
  const academicYearId =
    command.type === 'class.create'
      ? command.input.academicYearId
      : required(before).academicYearId;
  const year = required(
    await db.academicYear.findFirst({ where: { tenantId, id: academicYearId } }),
  );
  writableYear(year.status);
  if (command.type === 'class.archive') {
    const existing = required(before);
    if ((existing.status === 'ARCHIVED') === !command.restore) return classView(existing);
    if (command.restore) activeRecord(existing.level.status);
    const after = await classRelation(
      db,
      await db.schoolClass.update({
        where: { tenantId_id: { tenantId, id: existing.id } },
        data: {
          status: command.restore ? 'ACTIVE' : 'ARCHIVED',
          archivedAt: command.restore ? null : new Date(),
        },
      }),
    );
    await audit(
      db,
      context,
      command.restore ? 'class.restored' : 'class.archived',
      existing.id,
      classView(existing),
      classView(after),
    );
    return classView(after);
  }
  if (before) activeRecord(before.status);
  const levelId = command.input.levelId ?? required(before).levelId;
  activeRecord(required(await db.level.findFirst({ where: { tenantId, id: levelId } })).status);
  const data = {
    levelId,
    code: command.input.code ?? required(before).code,
    name: command.input.name ?? required(before).name,
    capacity:
      command.input.capacity !== undefined ? command.input.capacity : (before?.capacity ?? null),
  };
  const after = before
    ? await classRelation(
        db,
        await db.schoolClass.update({ where: { tenantId_id: { tenantId, id: before.id } }, data }),
      )
    : await classRelation(
        db,
        await db.schoolClass.create({ data: { tenantId, academicYearId, ...data } }),
      );
  await audit(
    db,
    context,
    before ? 'class.updated' : 'class.created',
    after.id,
    before ? classView(before) : null,
    classView(after),
  );
  return classView(after);
}
