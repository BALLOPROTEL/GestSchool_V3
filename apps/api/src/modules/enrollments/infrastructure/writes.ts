import type { Enrollment, EnrollmentEventKind, Prisma } from '@gestschool/database';
import type { EnrollmentCreate } from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
import type { EnrollmentCommand } from '../domain/enrollment.repository.js';
import {
  enrollmentCapacity,
  enrollmentConflict,
  enrollmentEffectiveDate,
  enrollmentFound,
  enrollmentTransition,
  enrollmentWritableYear,
} from '../domain/policy.js';
import { audit } from './database.js';
import { civilDate, enrollmentViews } from './views.js';

async function target(
  db: Prisma.TransactionClient,
  tenantId: string,
  studentId: string,
  academicYearId: string,
  classId: string,
) {
  const student = enrollmentFound(
    await db.student.findFirst({ where: { tenantId, id: studentId } }),
  );
  const year = enrollmentFound(
    await db.academicYear.findFirst({ where: { tenantId, id: academicYearId } }),
  );
  const classroom = enrollmentFound(
    await db.schoolClass.findFirst({ where: { tenantId, id: classId } }),
  );
  const level = enrollmentFound(
    await db.level.findFirst({ where: { tenantId, id: classroom.levelId } }),
  );
  if (student.status === 'ARCHIVED') enrollmentConflict('ENROLLMENT_STUDENT_ARCHIVED');
  enrollmentWritableYear(year.status);
  if (classroom.academicYearId !== year.id) enrollmentConflict('ENROLLMENT_CLASS_YEAR_MISMATCH');
  if (classroom.status !== 'ACTIVE' || level.status !== 'ACTIVE')
    enrollmentConflict('ENROLLMENT_CLASS_ARCHIVED');
  return { year, classroom };
}
async function available(
  db: Prisma.TransactionClient,
  tenantId: string,
  classroom: { id: string; capacity: number | null },
  excluded?: string,
) {
  const occupied = await db.enrollment.count({
    where: {
      tenantId,
      schoolClassId: classroom.id,
      status: { in: ['PENDING', 'ACTIVE'] },
      ...(excluded ? { id: { not: excluded } } : {}),
    },
  });
  enrollmentCapacity(classroom.capacity, occupied);
}
async function reenrollment(
  db: Prisma.TransactionClient,
  tenantId: string,
  studentId: string,
  year: { id: string; startsOn: Date },
  type: string | null,
) {
  if (type !== 'RE_ENROLLMENT') return;
  const prior = await db.enrollment.findFirst({
    where: {
      tenantId,
      studentId,
      academicYearId: { not: year.id },
      status: { in: ['ACTIVE', 'COMPLETED', 'TRANSFERRED'] },
      schoolClass: { academicYear: { endsOn: { lt: year.startsOn } } },
    },
  });
  if (!prior) enrollmentConflict('ENROLLMENT_HISTORY_REQUIRED');
}
async function event(
  db: Prisma.TransactionClient,
  context: RequestContext,
  before: Enrollment | null,
  after: Enrollment,
  kind: EnrollmentEventKind,
  effectiveDate: string,
  reason: string | null,
) {
  const tenantId = context.tenantId;
  const from = before
    ? enrollmentFound(
        await db.schoolClass.findFirst({ where: { tenantId, id: before.schoolClassId } }),
      )
    : null;
  const to = enrollmentFound(
    await db.schoolClass.findFirst({ where: { tenantId, id: after.schoolClassId } }),
  );
  const actor = enrollmentFound(await db.user.findUnique({ where: { id: context.userId } }));
  await db.enrollmentEvent.create({
    data: {
      tenantId,
      enrollmentId: after.id,
      academicYearId: after.academicYearId,
      kind,
      fromClassId: from?.id ?? null,
      fromClassName: from?.name ?? null,
      toClassId: to.id,
      toClassName: to.name,
      fromStatus: before?.status ?? null,
      toStatus: after.status,
      type: after.type,
      effectiveDate: new Date(effectiveDate),
      reason,
      actorMembershipId: context.membershipId,
      actorName: actor.displayName,
      requestId: context.requestId,
    },
  });
}
async function create(
  db: Prisma.TransactionClient,
  context: RequestContext,
  input: EnrollmentCreate,
) {
  const tenantId = context.tenantId;
  const { year, classroom } = await target(
    db,
    tenantId,
    input.studentId,
    input.academicYearId,
    input.classId,
  );
  if (
    await db.enrollment.findUnique({
      where: {
        tenantId_studentId_academicYearId: {
          tenantId,
          studentId: input.studentId,
          academicYearId: year.id,
        },
      },
    })
  )
    enrollmentConflict('ENROLLMENT_DUPLICATE');
  enrollmentEffectiveDate(input.enrolledOn, {
    startsOn: civilDate(year.startsOn),
    endsOn: civilDate(year.endsOn),
  });
  await reenrollment(db, tenantId, input.studentId, year, input.type);
  await available(db, tenantId, classroom);
  const row = await db.enrollment.create({
    data: {
      tenantId,
      studentId: input.studentId,
      academicYearId: year.id,
      schoolClassId: classroom.id,
      type: input.type,
      status: 'PENDING',
      enrolledOn: new Date(input.enrolledOn),
    },
  });
  await event(db, context, null, row, 'CREATED', input.enrolledOn, null);
  const view = enrollmentFound((await enrollmentViews(db, tenantId, [row]))[0]);
  await audit(db, context, 'enrollment.created', row.id, null, view);
  return view;
}
export async function writeEnrollment(
  db: Prisma.TransactionClient,
  context: RequestContext,
  command: EnrollmentCommand,
) {
  if (command.action === 'create') return create(db, context, command.input);
  const tenantId = context.tenantId;
  const before = enrollmentFound(
    await db.enrollment.findFirst({ where: { tenantId, id: command.id } }),
  );
  const year = enrollmentFound(
    await db.academicYear.findFirst({ where: { tenantId, id: before.academicYearId } }),
  );
  enrollmentWritableYear(year.status);
  const status = enrollmentTransition(before.status, command.action);
  let effectiveDate = civilDate(before.enrolledOn);
  let reason: string | null = null;
  let kind: EnrollmentEventKind;
  const data: Prisma.EnrollmentUpdateInput = { status };
  if (command.action === 'update') {
    const classroomId = command.input.classId ?? before.schoolClassId;
    const { classroom } = await target(db, tenantId, before.studentId, year.id, classroomId);
    await available(db, tenantId, classroom, before.id);
    await reenrollment(db, tenantId, before.studentId, year, command.input.type ?? before.type);
    effectiveDate = command.input.enrolledOn ?? effectiveDate;
    enrollmentEffectiveDate(effectiveDate, {
      startsOn: civilDate(year.startsOn),
      endsOn: civilDate(year.endsOn),
    });
    data.schoolClass = {
      connect: {
        tenantId_id_academicYearId: { tenantId, id: classroom.id, academicYearId: year.id },
      },
    };
    data.enrolledOn = new Date(effectiveDate);
    if (command.input.type !== undefined) data.type = command.input.type;
    kind = 'UPDATED';
  } else if (command.action === 'confirm') {
    const { classroom } = await target(
      db,
      tenantId,
      before.studentId,
      year.id,
      before.schoolClassId,
    );
    await available(db, tenantId, classroom, before.id);
    await reenrollment(db, tenantId, before.studentId, year, before.type);
    enrollmentEffectiveDate(effectiveDate, {
      startsOn: civilDate(year.startsOn),
      endsOn: civilDate(year.endsOn),
    });
    kind = 'CONFIRMED';
  } else {
    effectiveDate = command.input.effectiveDate;
    reason = command.input.reason;
    const latest = await db.enrollmentEvent.findFirst({
      where: { tenantId, enrollmentId: before.id },
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
    });
    enrollmentEffectiveDate(
      effectiveDate,
      { startsOn: civilDate(year.startsOn), endsOn: civilDate(year.endsOn) },
      latest ? civilDate(latest.effectiveDate) : civilDate(before.enrolledOn),
    );
    if (command.action === 'transfer') {
      if (command.input.targetClassId === before.schoolClassId)
        enrollmentConflict('ENROLLMENT_SAME_CLASS');
      const { classroom } = await target(
        db,
        tenantId,
        before.studentId,
        year.id,
        command.input.targetClassId,
      );
      await available(db, tenantId, classroom);
      data.schoolClass = {
        connect: {
          tenantId_id_academicYearId: { tenantId, id: classroom.id, academicYearId: year.id },
        },
      };
      kind = 'TRANSFERRED';
    } else {
      data.endedOn = new Date(effectiveDate);
      kind = command.action === 'cancel' ? 'CANCELLED' : 'COMPLETED';
    }
  }
  const previousView = enrollmentFound((await enrollmentViews(db, tenantId, [before]))[0]);
  const after = await db.enrollment.update({
    where: { tenantId_id: { tenantId, id: before.id } },
    data,
  });
  await event(db, context, before, after, kind, effectiveDate, reason);
  const nextView = enrollmentFound((await enrollmentViews(db, tenantId, [after]))[0]);
  const action = {
    update: 'updated',
    confirm: 'confirmed',
    cancel: 'cancelled',
    transfer: 'transferred',
    complete: 'completed',
  }[command.action];
  await audit(db, context, `enrollment.${action}`, before.id, previousView, {
    ...nextView,
    oldClassId: before.schoolClassId,
    newClassId: after.schoolClassId,
    reason,
    effectiveDate,
    actor: context.membershipId,
    requestId: context.requestId,
  });
  return nextView;
}
