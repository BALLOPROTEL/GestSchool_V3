import { describe, expect, it } from 'vitest';
import { attendancePdfHtml, renderAttendancePdf, type AttendancePdfSheet } from './pdf.js';

const sheet: AttendancePdfSheet = {
  className: 'Sixième <A>',
  academicYearName: '2026-2027',
  date: '2026-11-05',
  students: [
    {
      studentName: 'Awa <script>alert(1)</script>',
      matricule: 'MAT-001',
      status: 'ABSENT',
      note: '<img src="http://127.0.0.1/private">',
    },
  ],
  summary: { total: 1, unmarked: 0, present: 0, absent: 1, late: 0, excused: 0 },
};

describe('attendance PDF', () => {
  it.each(['fr', 'en', 'ar'] as const)('renders safe localized HTML for %s', async (locale) => {
    const html = await attendancePdfHtml(sheet, locale);
    expect(html).toContain('lang="' + locale + '" dir="' + (locale === 'ar' ? 'rtl' : 'ltr') + '"');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('Awa &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('src="http');
  });

  it('produces a real printable PDF', async () => {
    const pdf = await renderAttendancePdf(sheet, 'fr');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1_000);
  }, 20_000);
});
