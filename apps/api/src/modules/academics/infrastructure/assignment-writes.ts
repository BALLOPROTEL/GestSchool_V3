import type { Prisma } from '@gestschool/database';
import type { RequestContext } from '../../iam/domain/context.js';
import type { AcademicCommand } from '../domain/academic.repository.js';
import { activeRecord, conflict, required, writableYear } from '../domain/policy.js';
import { audit } from './database.js';
import { assignmentView, linkView } from './views.js';

import { classRelation, linkRelation, assignmentRelation } from './relations.js';

type LinkCommand = Extract<
  AcademicCommand,
  { type: 'link.create' | 'link.update' | 'link.remove' }
>;
export async function writeLink(
  db: Prisma.TransactionClient,
  context: RequestContext,
  command: LinkCommand,
) {
  const tenantId = context.tenantId;
  const classroom = required(
    await classRelation(
      db,
      await db.schoolClass.findFirst({ where: { tenantId, id: command.classId } }),
    ),
  );
  writableYear(classroom.academicYear.status);
  activeRecord(classroom.status);
  if (command.type === 'link.create') {
    activeRecord(classroom.level.status);
    activeRecord(
      required(await db.subject.findFirst({ where: { tenantId, id: command.input.subjectId } }))
        .status,
    );
    const after = await linkRelation(
      db,
      await db.classSubject.create({
        data: {
          tenantId,
          schoolClassId: classroom.id,
          subjectId: command.input.subjectId,
          coefficient: command.input.coefficient,
        },
      }),
    );
    await audit(db, context, 'class_subject.created', after.id, null, linkView(after));
    return linkView(after);
  }
  const before = required(
    await linkRelation(
      db,
      await db.classSubject.findFirst({
        where: { tenantId, schoolClassId: classroom.id, subjectId: command.subjectId },
      }),
    ),
  );
  if (command.type === 'link.remove') {
    if (
      (await db.teachingAssignment.count({ where: { tenantId, classSubjectId: before.id } })) ||
      (await db.assessment.count({ where: { tenantId, classSubjectId: before.id } }))
    )
      conflict('ACADEMIC_HISTORY_PROTECTED');
    await db.classSubject.delete({ where: { tenantId_id: { tenantId, id: before.id } } });
    await audit(db, context, 'class_subject.removed', before.id, linkView(before), null);
    return linkView(before);
  }
  activeRecord(before.subject.status);
  if (await db.assessment.count({ where: { tenantId, classSubjectId: before.id } }))
    conflict('ACADEMIC_HISTORY_PROTECTED');
  const after = await linkRelation(
    db,
    await db.classSubject.update({
      where: { tenantId_id: { tenantId, id: before.id } },
      data: { coefficient: command.input.coefficient },
    }),
  );
  await audit(db, context, 'class_subject.updated', before.id, linkView(before), linkView(after));
  return linkView(after);
}

type AssignmentCommand = Extract<
  AcademicCommand,
  { type: 'assignment.create' | 'assignment.update' | 'assignment.archive' }
>;
export async function writeAssignment(
  db: Prisma.TransactionClient,
  context: RequestContext,
  command: AssignmentCommand,
) {
  const tenantId = context.tenantId;
  const before =
    command.type === 'assignment.create'
      ? null
      : required(
          await assignmentRelation(
            db,
            await db.teachingAssignment.findFirst({ where: { tenantId, id: command.id } }),
          ),
        );
  if (before) writableYear(before.classSubject.schoolClass.academicYear.status);
  if (command.type === 'assignment.archive') {
    const existing = required(before);
    if (existing.status === 'ARCHIVED') return assignmentView(existing);
    const after = await assignmentRelation(
      db,
      await db.teachingAssignment.update({
        where: { tenantId_id: { tenantId, id: existing.id } },
        data: { status: 'ARCHIVED', archivedAt: new Date() },
      }),
    );
    await audit(
      db,
      context,
      'teaching_assignment.archived',
      existing.id,
      assignmentView(existing),
      assignmentView(after),
    );
    return assignmentView(after);
  }
  if (before) {
    activeRecord(before.status);
    if (await db.assessment.count({ where: { tenantId, classSubjectId: before.classSubjectId } }))
      conflict('ACADEMIC_HISTORY_PROTECTED');
  }
  const data = {
    classSubjectId: command.input.classSubjectId ?? required(before).classSubjectId,
    teacherId: command.input.teacherId ?? required(before).teacherId,
    academicPeriodId: command.input.academicPeriodId ?? required(before).academicPeriodId,
  };
  const link = required(
    await linkRelation(
      db,
      await db.classSubject.findFirst({ where: { tenantId, id: data.classSubjectId } }),
    ),
  );
  const period = required(
    await db.academicPeriod.findFirst({ where: { tenantId, id: data.academicPeriodId } }),
  );
  const teacher = required(await db.teacher.findFirst({ where: { tenantId, id: data.teacherId } }));
  writableYear(link.schoolClass.academicYear.status);
  activeRecord(link.schoolClass.status);
  activeRecord(link.schoolClass.level.status);
  activeRecord(link.subject.status);
  activeRecord(period.status);
  activeRecord(teacher.status);
  if (period.academicYearId !== link.schoolClass.academicYearId)
    conflict('ACADEMIC_ASSIGNMENT_YEAR');
  if (before && before.classSubject.schoolClass.academicYearId !== link.schoolClass.academicYearId)
    conflict('ACADEMIC_ASSIGNMENT_YEAR');
  const after = before
    ? await assignmentRelation(
        db,
        await db.teachingAssignment.update({
          where: { tenantId_id: { tenantId, id: before.id } },
          data,
        }),
      )
    : await assignmentRelation(
        db,
        await db.teachingAssignment.create({ data: { tenantId, ...data } }),
      );
  await audit(
    db,
    context,
    before ? 'teaching_assignment.updated' : 'teaching_assignment.created',
    after.id,
    before ? assignmentView(before) : null,
    assignmentView(after),
  );
  return assignmentView(after);
}
