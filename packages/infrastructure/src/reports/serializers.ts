/// <reference lib="dom" />
import { chromium } from 'playwright';
import type { ReportFormat, ReportLocale, ReportPage } from '@gestschool/contracts';
import { localFonts } from '../documents/renderer.js';

const labels: Record<ReportLocale, Record<string, string>> = {
  fr: { report: 'Rapport', generated: 'Généré le' },
  en: { report: 'Report', generated: 'Generated on' },
  ar: { report: 'تقرير', generated: 'تاريخ الإنشاء' },
};
export function neutralizeSpreadsheetCell(value: string): string {
  return /^[\t\r ]*[=+\-@]/.test(value) ? `'${value}` : value;
}
const csvCell = (value: string) => `"${neutralizeSpreadsheetCell(value).replaceAll('"', '""')}"`;
export function serializeCsv(page: ReportPage): Buffer {
  const rows = [
    page.columns.map(csvCell).join(','),
    ...page.items.map((row) =>
      page.columns.map((column) => csvCell(String(row[column] ?? ''))).join(','),
    ),
  ];
  return Buffer.from(`\uFEFF${rows.join('\r\n')}\r\n`, 'utf8');
}
const xml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] ?? c,
  );
function columnName(index: number): string {
  let output = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26))
    output = String.fromCharCode(65 + ((value - 1) % 26)) + output;
  return output;
}
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(entries: { name: string; data: Buffer }[]): Buffer {
  const local: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name),
      crc = crc32(entry.data),
      header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(entry.data.length, 18);
    header.writeUInt32LE(entry.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, entry.data);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x800, 8);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(entry.data.length, 20);
    directory.writeUInt32LE(entry.data.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, name);
    offset += header.length + name.length + entry.data.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
function xlsxCell(reference: string, value: string | number | null, header = false): string {
  if (typeof value === 'number' && Number.isFinite(value))
    return `<c r="${reference}" s="${header ? 1 : 0}"><v>${value}</v></c>`;
  const text = neutralizeSpreadsheetCell(String(value ?? ''));
  return `<c r="${reference}" t="inlineStr" s="${header ? 1 : 0}"><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
}
export function serializeXlsx(page: ReportPage): Buffer {
  const all = [
    page.columns,
    ...page.items.map((row) => page.columns.map((column) => row[column] ?? null)),
  ];
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${all.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => xlsxCell(`${columnName(columnIndex)}${rowIndex + 1}`, value, rowIndex === 0)).join('')}</row>`).join('')}</sheetData><autoFilter ref="A1:${columnName(Math.max(page.columns.length - 1, 0))}${Math.max(all.length, 1)}"/></worksheet>`;
  const entries = [
    {
      name: '[Content_Types].xml',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      ),
    },
    {
      name: '_rels/.rels',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      ),
    },
    {
      name: 'xl/workbook.xml',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="GestSchool" sheetId="1" r:id="rId1"/></sheets></workbook>',
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      ),
    },
    {
      name: 'xl/styles.xml',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0" xfId="0"/><xf fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>',
      ),
    },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheet) },
  ];
  return zip(entries);
}
export async function serializePdf(page: ReportPage, locale: ReportLocale): Promise<Buffer> {
  if (page.items.length > 1000) throw new Error('REPORT_PDF_ROW_LIMIT');
  const direction = locale === 'ar' ? 'rtl' : 'ltr',
    rows = page.items;
  const html = `<!doctype html><html lang="${locale}" dir="${direction}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none';font-src data:;style-src 'unsafe-inline'"><style>${await localFonts()}@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:'GS Latin','GS Arabic',sans-serif;color:#172033;font-size:9px}html[dir=rtl] body{font-family:'GS Arabic','GS Latin',sans-serif}h1{font-size:18px}table{border-collapse:collapse;width:100%;table-layout:auto}thead{display:table-header-group}tr{break-inside:avoid}th,td{border:1px solid #cbd5e1;padding:4px;text-align:start;overflow-wrap:anywhere}th{background:#eef2f7}footer{margin-top:8px;color:#64748b}</style></head><body><h1>${xml(labels[locale]['report'] ?? 'Report')} · ${xml(page.type)}</h1><table><thead><tr>${page.columns.map((column) => `<th>${xml(column)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${page.columns.map((column) => `<td>${xml(String(row[column] ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody></table><footer>${xml(labels[locale]['generated'] ?? 'Generated')} ${new Date().toISOString()} · ${page.total}</footer></body></html>`;
  const browser = await chromium.launch({ headless: true, timeout: 15_000 });
  const deadline = setTimeout(() => void browser.close(), 30_000);
  try {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      serviceWorkers: 'block',
      offline: true,
    });
    await context.route('**/*', (route) => route.abort('blockedbyclient'));
    const tab = await context.newPage();
    await tab.setContent(html, { waitUntil: 'load', timeout: 15_000 });
    await tab.evaluate(() => document.fonts.ready);
    const bytes = await tab.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      tagged: true,
    });
    if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('REPORT_PDF_INVALID');
    return bytes;
  } finally {
    clearTimeout(deadline);
    await browser.close();
  }
}
export async function serializeReport(
  page: ReportPage,
  format: ReportFormat,
  locale: ReportLocale,
): Promise<{ bytes: Buffer; mimeType: string; extension: string }> {
  if (format === 'CSV')
    return { bytes: serializeCsv(page), mimeType: 'text/csv; charset=utf-8', extension: 'csv' };
  if (format === 'XLSX')
    return {
      bytes: serializeXlsx(page),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: 'xlsx',
    };
  return { bytes: await serializePdf(page, locale), mimeType: 'application/pdf', extension: 'pdf' };
}
