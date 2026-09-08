import type { AcademicView } from '@gestschool/contracts';
import type {
  AcademicYear,
  AcademicPeriod,
  Level,
  Subject,
  SchoolClass,
  ClassSubject,
  TeachingAssignment,
  Teacher,
} from '@gestschool/database';

export const civilDate = (date: Date) => date.toISOString().slice(0, 10);
function base(row: {
  id: string;
  createdAt: Date;
  updatedAt?: Date;
  archivedAt: Date | null;
  status: AcademicView['status'];
}) {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
    ...(row.updatedAt ? { updatedAt: row.updatedAt.toISOString() } : {}),
  };
}
export function yearView(row: AcademicYear): AcademicView {
  return {
    ...base(row),
    code: row.code,
    name: row.name,
    startsOn: civilDate(row.startsOn),
    endsOn: civilDate(row.endsOn),
  };
}
export function periodView(row: AcademicPeriod & { academicYear: AcademicYear }): AcademicView {
  return {
    ...base(row),
    name: row.name,
    type: row.type,
    ordinal: row.ordinal,
    startsOn: civilDate(row.startsOn),
    endsOn: civilDate(row.endsOn),
    academicYearId: row.academicYearId,
    academicYearName: row.academicYear.name,
    academicYearStatus: row.academicYear.status,
  };
}
export function catalogView(row: Level | Subject): AcademicView {
  return {
    ...base(row),
    code: row.code,
    name: row.name,
    ...('position' in row ? { position: row.position } : {}),
  };
}
export function classView(
  row: SchoolClass & { academicYear: AcademicYear; level: Level },
): AcademicView {
  return {
    ...base(row),
    name: row.name,
    code: row.code,
    capacity: row.capacity,
    levelId: row.levelId,
    levelName: row.level.name,
    academicYearId: row.academicYearId,
    academicYearName: row.academicYear.name,
    academicYearStatus: row.academicYear.status,
  };
}
type LinkRow = ClassSubject & {
  subject: Subject;
  schoolClass: SchoolClass & { academicYear: AcademicYear; level: Level };
};
export function linkView(row: LinkRow): AcademicView {
  return {
    id: row.id,
    name: row.subject.name,
    code: row.subject.code,
    status: row.subject.status,
    archivedAt: row.subject.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    subjectId: row.subjectId,
    subjectName: row.subject.name,
    classId: row.schoolClassId,
    className: row.schoolClass.name,
    academicYearId: row.schoolClass.academicYearId,
    academicYearName: row.schoolClass.academicYear.name,
    academicYearStatus: row.schoolClass.academicYear.status,
    coefficient: row.coefficient.toFixed(2),
  };
}
export function assignmentView(
  row: TeachingAssignment & {
    teacher: Teacher;
    academicPeriod: AcademicPeriod;
    classSubject: LinkRow;
  },
): AcademicView {
  return {
    ...base(row),
    name: `${row.teacher.firstName} ${row.teacher.lastName}`,
    teacherName: `${row.teacher.firstName} ${row.teacher.lastName}`,
    teacherId: row.teacherId,
    classSubjectId: row.classSubjectId,
    subjectId: row.classSubject.subjectId,
    subjectName: row.classSubject.subject.name,
    classId: row.classSubject.schoolClassId,
    className: row.classSubject.schoolClass.name,
    academicYearId: row.classSubject.schoolClass.academicYearId,
    academicYearName: row.classSubject.schoolClass.academicYear.name,
    academicYearStatus: row.classSubject.schoolClass.academicYear.status,
    academicPeriodId: row.academicPeriodId,
    academicPeriodName: row.academicPeriod.name,
    coefficient: row.classSubject.coefficient.toFixed(2),
  };
}
