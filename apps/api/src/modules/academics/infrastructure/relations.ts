import type { Prisma, SchoolClass, ClassSubject, TeachingAssignment } from '@gestschool/database';
import { required } from '../domain/policy.js';

const index = <T extends { id: string }>(rows: T[]) => new Map(rows.map((row) => [row.id, row]));
// Prisma 7's multi-include plan can dispatch concurrent queries on one pg transaction
// (prisma/prisma#29407). Read bounded page relations sequentially, without Preview features.
// Every lookup remains tenant-scoped; pagination happens in SQL before enrichment.
export async function classRelations(
  db: Prisma.TransactionClient,
  tenantId: string,
  rows: SchoolClass[],
) {
  if (!rows.length) return [];
  const years = index(
    await db.academicYear.findMany({
      where: { tenantId, id: { in: rows.map((row) => row.academicYearId) } },
    }),
  );
  const levels = index(
    await db.level.findMany({ where: { tenantId, id: { in: rows.map((row) => row.levelId) } } }),
  );
  return rows.map((row) => ({
    ...row,
    academicYear: required(years.get(row.academicYearId) ?? null),
    level: required(levels.get(row.levelId) ?? null),
  }));
}
export async function linkRelations(
  db: Prisma.TransactionClient,
  tenantId: string,
  rows: ClassSubject[],
) {
  if (!rows.length) return [];
  const subjects = index(
    await db.subject.findMany({
      where: { tenantId, id: { in: rows.map((row) => row.subjectId) } },
    }),
  );
  const classes = index(
    await classRelations(
      db,
      tenantId,
      await db.schoolClass.findMany({
        where: { tenantId, id: { in: rows.map((row) => row.schoolClassId) } },
      }),
    ),
  );
  return rows.map((row) => ({
    ...row,
    subject: required(subjects.get(row.subjectId) ?? null),
    schoolClass: required(classes.get(row.schoolClassId) ?? null),
  }));
}
export async function assignmentRelations(
  db: Prisma.TransactionClient,
  tenantId: string,
  rows: TeachingAssignment[],
) {
  if (!rows.length) return [];
  const teachers = index(
    await db.teacher.findMany({
      where: { tenantId, id: { in: rows.map((row) => row.teacherId) } },
    }),
  );
  const periods = index(
    await db.academicPeriod.findMany({
      where: { tenantId, id: { in: rows.map((row) => row.academicPeriodId) } },
    }),
  );
  const links = index(
    await linkRelations(
      db,
      tenantId,
      await db.classSubject.findMany({
        where: { tenantId, id: { in: rows.map((row) => row.classSubjectId) } },
      }),
    ),
  );
  return rows.map((row) => ({
    ...row,
    teacher: required(teachers.get(row.teacherId) ?? null),
    academicPeriod: required(periods.get(row.academicPeriodId) ?? null),
    classSubject: required(links.get(row.classSubjectId) ?? null),
  }));
}
export async function classRelation(db: Prisma.TransactionClient, row: SchoolClass | null) {
  const found = required(row);
  return required((await classRelations(db, found.tenantId, [found]))[0] ?? null);
}
export async function linkRelation(db: Prisma.TransactionClient, row: ClassSubject | null) {
  const found = required(row);
  return required((await linkRelations(db, found.tenantId, [found]))[0] ?? null);
}
export async function assignmentRelation(
  db: Prisma.TransactionClient,
  row: TeachingAssignment | null,
) {
  const found = required(row);
  return required((await assignmentRelations(db, found.tenantId, [found]))[0] ?? null);
}
