import { describe, expect, it } from 'vitest';
import { renderAttendancePdf, type AttendancePdfSheet } from './pdf.js';

const sheet: AttendancePdfSheet = {
  className: 'Sixième A',
  academicYearName: '2026-2027',
  date: '2026-11-05',
  students: [
    {
      studentName: 'Awa Traoré',
      matricule: 'MAT-001',
      status: 'ABSENT',
      note: 'Justificatif attendu',
    },
    {
      studentName: 'أمين',
      matricule: 'MAT-002',
      status: 'PRESENT',
      note: null,
    },
  ],
  summary: { total: 2, unmarked: 0, present: 1, absent: 1, late: 0, excused: 0 },
};

describe('attendance PDF', () => {
  it.each(['fr', 'en', 'ar'] as const)(
    'produces a real printable PDF for %s without a browser',
    async (locale) => {
      const pdf = await renderAttendancePdf(sheet, locale);
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.length).toBeGreaterThan(2_000);
      expect(pdf.length).toBeLessThan(10_000_000);
    },
  );
});
