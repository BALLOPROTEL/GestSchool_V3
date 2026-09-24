/// <reference lib="dom" />
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import QRCode from 'qrcode';
import {
  documentSnapshotSchema,
  type DocumentSnapshot,
  type OfficialDocumentType,
  currencyDecimals,
  type FinanceCurrency,
} from '@gestschool/contracts';

const labels = {
  fr: {
    REPORT_CARD: 'Bulletin scolaire',
    TRANSCRIPT: 'Relevé de notes',
    SCHOOL_CERTIFICATE: 'Certificat de scolarité',
    ENROLLMENT_CERTIFICATE: 'Certificat d’inscription',
    STUDENT_CARD: 'Carte élève',
    RECEIPT: 'Reçu de paiement',
    student: 'Élève',
    number: 'Matricule',
    year: 'Année scolaire',
    period: 'Période',
    class: 'Classe',
    issued: 'Émis le',
    subject: 'Matière',
    coefficient: 'Coefficient',
    average: 'Moyenne',
    rank: 'Rang / effectif',
    remarks: 'Appréciation',
    certificate:
      'L’établissement certifie que cet élève est régulièrement scolarisé dans la classe et l’année indiquées.',
    enrollment: 'L’établissement atteste l’inscription ci-dessous.',
    type: 'Type',
    status: 'Statut',
    date: 'Date d’inscription',
    amount: 'Montant',
    method: 'Mode de paiement',
    payment: 'Paiement',
    invoices: 'Factures',
    verify: 'Vérifier ce document',
    photo: 'Photo indisponible',
    reference: 'Référence',
    receipt: 'Reçu',
  },
  en: {
    REPORT_CARD: 'Report card',
    TRANSCRIPT: 'Academic transcript',
    SCHOOL_CERTIFICATE: 'School attendance certificate',
    ENROLLMENT_CERTIFICATE: 'Enrollment certificate',
    STUDENT_CARD: 'Student card',
    RECEIPT: 'Payment receipt',
    student: 'Student',
    number: 'Student number',
    year: 'Academic year',
    period: 'Period',
    class: 'Class',
    issued: 'Issued on',
    subject: 'Subject',
    coefficient: 'Coefficient',
    average: 'Average',
    rank: 'Rank / cohort',
    remarks: 'Comment',
    certificate:
      'The school certifies that this student attends the class and academic year indicated.',
    enrollment: 'The school certifies the enrollment below.',
    type: 'Type',
    status: 'Status',
    date: 'Enrollment date',
    amount: 'Amount',
    method: 'Payment method',
    payment: 'Payment',
    invoices: 'Invoices',
    verify: 'Verify this document',
    photo: 'Photo unavailable',
    reference: 'Reference',
    receipt: 'Receipt',
  },
  ar: {
    REPORT_CARD: 'كشف النتائج الدراسية',
    TRANSCRIPT: 'كشف الدرجات',
    SCHOOL_CERTIFICATE: 'شهادة مدرسية',
    ENROLLMENT_CERTIFICATE: 'شهادة التسجيل',
    STUDENT_CARD: 'بطاقة الطالب',
    RECEIPT: 'إيصال الدفع',
    student: 'الطالب',
    number: 'رقم الطالب',
    year: 'السنة الدراسية',
    period: 'الفترة',
    class: 'الفصل',
    issued: 'تاريخ الإصدار',
    subject: 'المادة',
    coefficient: 'المعامل',
    average: 'المعدل',
    rank: 'الترتيب / العدد',
    remarks: 'الملاحظة',
    certificate: 'تشهد المؤسسة بأن هذا الطالب يدرس بانتظام في الفصل والسنة الدراسية المبينين.',
    enrollment: 'تشهد المؤسسة بتسجيل الطالب وفق البيانات التالية.',
    type: 'النوع',
    status: 'الحالة',
    date: 'تاريخ التسجيل',
    amount: 'المبلغ',
    method: 'طريقة الدفع',
    payment: 'الدفع',
    invoices: 'الفواتير',
    verify: 'التحقق من الوثيقة',
    photo: 'الصورة غير متوفرة',
    reference: 'المرجع',
    receipt: 'الإيصال',
  },
} as const;
export function escapeDocumentText(value: string | number | null): string {
  return String(value ?? '—').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}
const esc = escapeDocumentText;
export function documentMoney(amount: string, currency: string, locale: string): string {
  if (!Object.hasOwn(currencyDecimals, currency)) throw new Error('DOCUMENT_CURRENCY_INVALID');
  const decimals = currencyDecimals[currency as FinanceCurrency],
    scale = 10n ** BigInt(decimals),
    value = BigInt(amount);
  const fraction = new Intl.NumberFormat(locale, {
    useGrouping: false,
    minimumIntegerDigits: Math.max(1, decimals),
  }).format(value % scale);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
    .formatToParts(value / scale)
    .map((part) => (part.type === 'fraction' ? fraction : part.value))
    .join('');
}
let fonts: Promise<string> | undefined;
export function localFonts(): Promise<string> {
  fonts ??= Promise.all(
    [
      ['GS Latin', '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff2'],
      ['GS Arabic', '@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff2'],
    ].map(async ([family, path]) => {
      if (!path) throw new Error('DOCUMENT_FONT_INVALID');
      const bytes = await readFile(new URL(import.meta.resolve(path)));
      return `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2');font-weight:100 900}`;
    }),
  ).then((css) => css.join(''));
  return fonts;
}
export async function documentHtml(
  value: DocumentSnapshot,
  reference: string,
  verificationUrl: string,
): Promise<string> {
  const s = documentSnapshotSchema.parse(value),
    l = labels[s.locale];
  // The caller supplies a server-built origin and a 256-bit URL-safe token, not a template URL.
  const url = new URL(verificationUrl);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !/^\/(fr|en|ar)\/verify\/[A-Za-z0-9_-]{43}$/.test(url.pathname) ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error('DOCUMENT_VERIFICATION_URL_INVALID');
  const qr = await QRCode.toDataURL(url.href, { errorCorrectionLevel: 'M', margin: 2, width: 300 });
  const item = (key: string, text: string | number | null) =>
    `<div><dt>${esc(key)}</dt><dd>${esc(text)}</dd></div>`;
  const card = s.documentType === 'STUDENT_CARD';
  let content = '';
  if (s.report) {
    const r = s.report;
    content = `<table><thead><tr>${[l.subject, l.coefficient, l.average, l.remarks].map((t) => `<th>${esc(t)}</th>`).join('')}</tr></thead><tbody>${r.student.subjects.map((line) => `<tr><td>${esc(line.name)}</td><td>${esc(line.coefficient)}</td><td>${esc(line.average)} / ${esc(r.scale)}</td><td>${esc(line.remark)}</td></tr>`).join('')}</tbody></table><dl>${item(l.average, r.student.overallAverage)}${item(l.rank, `${r.student.rank ?? '—'} / ${r.population}`)}${item(l.remarks, r.generalRemark)}</dl>`;
  } else if (s.receipt) {
    const r = s.receipt;
    content = `<dl>${item(l.receipt, r.reference)}${item(l.payment, r.paymentReference)}${item(l.amount, documentMoney(r.amountMinor, r.currency, s.locale))}${item(l.method, r.method)}${item(l.issued, r.paidAt.slice(0, 10))}${item(l.invoices, r.invoices.join(', '))}</dl>`;
  } else if (!card) {
    content = `<p class="attestation">${esc(s.documentType === 'SCHOOL_CERTIFICATE' ? l.certificate : l.enrollment)}</p>`;
    if (s.enrollment)
      content += `<dl>${item(l.type, s.enrollment.type)}${item(l.status, s.enrollment.status)}${item(l.date, s.enrollment.enrolledOn)}</dl>`;
  }
  return `<!doctype html><html lang="${s.locale}" dir="${s.locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>${await localFonts()}
    @page{size:${card ? '85.60mm 53.98mm' : 'A4'};margin:${card ? '0' : '16mm'}}
    *{box-sizing:border-box}body{margin:0;font-family:'GS Latin','GS Arabic',sans-serif;font-size:11px;color:#172033;overflow-wrap:anywhere}html[dir=rtl] body{font-family:'GS Arabic','GS Latin',sans-serif}
    header{border-bottom:2px solid ${s.template.accent};padding-bottom:10px}h1{font-size:23px;color:${s.template.accent};margin:8px 0}h2{font-size:16px;margin:4px 0}p{white-space:pre-wrap}dl{display:grid;grid-template-columns:1fr 1fr;gap:10px}dt{color:#526074;font-size:10px}dd{margin:0;font-weight:bold}table{border-collapse:collapse;width:100%;margin-top:20px}tr{break-inside:avoid}th,td{text-align:start;border:1px solid #cbd5e1;padding:7px}thead{display:table-header-group}footer{margin-top:24px;border-top:1px solid #cbd5e1;padding-top:8px;display:flex;align-items:center;gap:12px;font-size:9px}footer img{width:30mm;height:30mm}small{display:block;color:#526074}.attestation{line-height:1.8;margin:25px 0}
    .card{width:85.60mm;height:53.98mm;padding:3mm;overflow:hidden;font-size:8px;line-height:1.25}.card h1{font-size:11px;margin:1mm 0}.card h2{font-size:10px}.card header{padding-bottom:1mm}.card dl{margin:1mm 0;gap:1mm}.card dt{font-size:6px}.card footer{margin-top:1mm;padding:0;border:0;font-size:6px}.card footer img{width:18mm;height:18mm;flex-shrink:0}.card .identity{display:flex;gap:2mm}.photo{border:1px solid #cbd5e1;width:13mm;height:16mm;font-size:6px;padding:1mm;flex-shrink:0}
    </style></head><body class="${card ? 'card' : 'sheet'}"><header><h2>${esc(s.school.name)}</h2>${!card && s.school.publicAddress ? `<small>${esc(s.school.publicAddress)}</small>` : ''}<h1>${l[s.documentType as OfficialDocumentType]}</h1></header><div class="identity">${card ? `<div class="photo">${l.photo}</div>` : ''}<dl>${item(l.student, s.holder.name)}${item(l.number, s.holder.matricule)}${item(l.year, s.academicYear)}${item(l.class, s.className)}${!card && s.academicPeriod ? item(l.period, s.academicPeriod) : ''}</dl></div>${content}<footer><img alt="QR" src="${qr}"><div>${esc(l.reference)} : ${esc(reference)}<br>${esc(l.issued)} : ${esc(s.issuedAt.slice(0, 10))}<br>${esc(l.verify)}${!card ? `<p>${esc(s.template.footer)}</p>` : ''}</div></footer></body></html>`;
}
export async function renderDocumentPdf(
  snapshot: DocumentSnapshot,
  reference: string,
  verificationUrl: string,
): Promise<Buffer> {
  const html = await documentHtml(snapshot, reference, verificationUrl);
  const browser = await chromium.launch({ headless: true, timeout: 15_000 });
  const deadline = setTimeout(() => {
    void browser.close();
  }, 30_000);
  try {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      serviceWorkers: 'block',
      offline: true,
    });
    await context.route('**/*', (route) => route.abort('blockedbyclient'));
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 15_000 });
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, tagged: true });
    if (pdf.length > 10_000_000 || !pdf.subarray(0, 5).equals(Buffer.from('%PDF-')))
      throw new Error('DOCUMENT_PDF_INVALID');
    return pdf;
  } finally {
    clearTimeout(deadline);
    await browser.close();
  }
}
