import type {
  AttendanceBulkWrite,
  AttendanceSheetView,
  AttendanceStatus,
} from '@gestschool/contracts';

export type AttendanceDraftRow = { status: AttendanceStatus | ''; note: string };
export type AttendanceDraft = Record<string, AttendanceDraftRow>;

export function attendanceDraftFromSheet(sheet: AttendanceSheetView): AttendanceDraft {
  return Object.fromEntries(
    sheet.students.map((student) => [
      student.studentId,
      { status: student.status ?? '', note: student.note ?? '' },
    ]),
  );
}

export function attendancePendingEntries(
  sheet: AttendanceSheetView,
  draft: AttendanceDraft,
): AttendanceBulkWrite['entries'] {
  return sheet.students.flatMap((student) => {
    const row = draft[student.studentId] ?? {
      status: student.status ?? '',
      note: student.note ?? '',
    };
    const status = row.status;
    const note = status === '' ? null : row.note.trim() || null;
    const originalStatus = student.status ?? '';
    const originalNote = student.status ? (student.note ?? null) : null;
    if (status === originalStatus && note === originalNote) return [];
    return [
      {
        studentId: student.studentId,
        status: status === '' ? null : status,
        note,
        expectedUpdatedAt: student.updatedAt,
      },
    ];
  });
}

export function attendanceSheetAfterCommittedBatch(
  baseline: AttendanceSheetView,
  saved: AttendanceSheetView,
  studentIds: readonly string[],
): AttendanceSheetView {
  const committed = new Set(studentIds);
  const savedByStudent = new Map(saved.students.map((student) => [student.studentId, student]));
  const students = baseline.students.map((student) =>
    committed.has(student.studentId) ? (savedByStudent.get(student.studentId) ?? student) : student,
  );
  const count = (status: AttendanceStatus) =>
    students.filter((student) => student.status === status).length;

  return {
    ...baseline,
    students,
    summary: {
      total: students.length,
      unmarked: students.filter((student) => student.status == null).length,
      present: count('PRESENT'),
      absent: count('ABSENT'),
      late: count('LATE'),
      excused: count('EXCUSED'),
    },
  };
}
