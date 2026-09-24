import { describe, expect, it } from 'vitest';
import type { ReportPage } from '@gestschool/contracts';
import { neutralizeSpreadsheetCell, serializeCsv, serializeXlsx } from './serializers.js';
const page: ReportPage = {
  type: 'STUDENTS',
  columns: ['firstName', 'amountMinor'],
  items: [
    { firstName: '=HYPERLINK("https://invalid.invalid")', amountMinor: '9223372036854775807' },
    { firstName: 'Normal, "quoted"', amountMinor: '0' },
  ],
  total: 2,
  page: 1,
  pageSize: 2,
};
describe('LOT 12 report serializers', () => {
  it.each(['=1+1', '+SUM(A1)', '-2+3', '@cmd', '  =hidden'])(
    'neutralizes spreadsheet formula input %s',
    (value) => expect(neutralizeSpreadsheetCell(value).startsWith("'")).toBe(true),
  );
  it('writes UTF-8 CSV with escaped cells and no executable formula', () => {
    const text = serializeCsv(page).toString('utf8');
    expect(text.startsWith('\uFEFF')).toBe(true);
    expect(text).toContain("'=HYPERLINK");
    expect(text).toContain('Normal, ""quoted""');
    expect(text).not.toContain('passwordHash');
  });
  it('writes a real OpenXML ZIP workbook with inline, non-formula user cells', () => {
    const bytes = serializeXlsx(page),
      text = bytes.toString('utf8');
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    expect(text).toContain('xl/worksheets/sheet1.xml');
    expect(text).toContain('&apos;=HYPERLINK');
    expect(text).not.toContain('<f>');
    expect(text).toContain('9223372036854775807');
  });
});
