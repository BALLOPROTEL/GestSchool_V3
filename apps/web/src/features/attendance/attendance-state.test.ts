import { describe, expect, it } from 'vitest';
import type { AttendanceSheetView } from '@gestschool/contracts';
import {
  attendanceDraftFromSheet,
  attendancePendingEntries,
  attendanceSheetAfterCommittedBatch,
} from './attendance-state';

const sheet: AttendanceSheetView = {
  classId: '00000000-0000-4000-8000-000000000001',
  className: 'Sixième A',
  academicYearId: '00000000-0000-4000-8000-000000000002',
  academicYearName: '2026-2027',
  date: '2026-11-05',
  students: [
    {
      studentId: '00000000-0000-4000-8000-000000000003',
      enrollmentId: '00000000-0000-4000-8000-000000000004',
      studentName: 'Awa Test',
      matricule: 'MAT-001',
      status: 'PRESENT',
      note: null,
      recordId: '00000000-0000-4000-8000-000000000005',
      updatedAt: '2026-11-05T08:00:00.000Z',
    },
    {
      studentId: '00000000-0000-4000-8000-000000000006',
      enrollmentId: '00000000-0000-4000-8000-000000000007',
      studentName: 'Moussa Test',
      matricule: 'MAT-002',
      status: null,
      note: null,
      recordId: null,
      updatedAt: null,
    },
  ],
  summary: { total: 2, unmarked: 1, present: 1, absent: 0, late: 0, excused: 0 },
};

describe('attendance draft state', () => {
  it('starts clean from the persisted sheet', () => {
    expect(attendancePendingEntries(sheet, attendanceDraftFromSheet(sheet))).toEqual([]);
  });

  it('reconciles only rows from a committed batch', () => {
    const saved: AttendanceSheetView = {
      ...sheet,
      students: [
        {
          ...sheet.students[0]!,
          status: 'ABSENT',
          note: 'Saved locally',
          updatedAt: '2026-11-05T09:00:00.000Z',
        },
        {
          ...sheet.students[1]!,
          status: 'PRESENT',
          note: 'Concurrent change',
          updatedAt: '2026-11-05T09:01:00.000Z',
        },
      ],
      summary: { total: 2, unmarked: 0, present: 1, absent: 1, late: 0, excused: 0 },
    };

    const reconciled = attendanceSheetAfterCommittedBatch(sheet, saved, [
      sheet.students[0]!.studentId,
    ]);

    expect(reconciled.students[0]).toMatchObject({
      status: 'ABSENT',
      note: 'Saved locally',
      updatedAt: '2026-11-05T09:00:00.000Z',
    });
    expect(reconciled.students[1]).toEqual(sheet.students[1]);
    expect(reconciled.summary).toEqual({
      total: 2,
      unmarked: 1,
      present: 0,
      absent: 1,
      late: 0,
      excused: 0,
    });
  });

  it('emits only dirty rows with the optimistic concurrency snapshot', () => {
    const draft = attendanceDraftFromSheet(sheet);
    draft[sheet.students[0]!.studentId] = {
      status: 'ABSENT',
      note: '  Justificatif attendu  ',
    };
    draft[sheet.students[1]!.studentId] = { status: 'LATE', note: '' };

    expect(attendancePendingEntries(sheet, draft)).toEqual([
      {
        studentId: sheet.students[0]!.studentId,
        status: 'ABSENT',
        note: 'Justificatif attendu',
        expectedUpdatedAt: '2026-11-05T08:00:00.000Z',
      },
      {
        studentId: sheet.students[1]!.studentId,
        status: 'LATE',
        note: null,
        expectedUpdatedAt: null,
      },
    ]);
  });
});
