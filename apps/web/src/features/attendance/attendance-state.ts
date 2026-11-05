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
