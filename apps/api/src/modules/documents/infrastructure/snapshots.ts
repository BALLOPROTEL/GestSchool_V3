import {
  documentSnapshotSchema,
  reportSnapshotSchema,
  type GenerateDocumentInput,
  type DocumentSnapshot,
} from '@gestschool/contracts';
import { Prisma } from '@gestschool/database';
import type { RequestContext } from '../../iam/domain/context.js';
import { documentConflict, documentFound } from '../domain/policy.js';

export async function captureDocumentSource(
  db: Prisma.TransactionClient,
  context: RequestContext,
  input: GenerateDocumentInput,
): Promise<{
  snapshot: DocumentSnapshot;
  studentId: string;
  enrollmentId?: string;
  reportCardId?: string;
  receiptId?: string;
}> {
  const tenantId = context.tenantId;
  const tenant = documentFound(
    await db.tenant.findFirst({
      where: { id: tenantId, status: 'ACTIVE' },
      include: { settings: true },
    }),
  );
  const settings = tenant.settings?.values;
  const publicAddress =
    settings &&
    typeof settings === 'object' &&
    !Array.isArray(settings) &&
    typeof settings['publicAddress'] === 'string'
      ? settings['publicAddress'].slice(0, 240)
      : '';
  const base: DocumentSnapshot = {
    schemaVersion: 1,
    documentType: input.documentType,
    locale: input.locale,
    school: { name: tenant.name, publicAddress },
    holder: { name: '', matricule: '' },
    academicYear: '',
    academicPeriod: '',
    className: '',
    issuedAt: new Date().toISOString(),
    template: { renderer: 'gestschool-v1', accent: '#3157a4', footer: 'GestSchool' },
    report: null,
    receipt: null,
    enrollment: null,
  };
  if (input.documentType === 'REPORT_CARD' || input.documentType === 'TRANSCRIPT') {
    const report = documentFound(
      await db.reportCard.findFirst({
        where: { id: input.sourceId, tenantId, status: { in: ['PUBLISHED', 'LOCKED'] } },
        include: { lines: true },
      }),
    );
    const value = reportSnapshotSchema.safeParse(report.snapshot);
    if (!value.success || !value.data.publishedAt) documentConflict('DOCUMENT_SOURCE_INELIGIBLE');
    const r = value.data;
    // Both immutable LOT 9 representations must agree; never recalculate from live grades.
    if (
      report.lines.length !== r.student.subjects.length ||
      report.lines.some((line) => {
        const s = r.student.subjects.find((subject) => subject.subjectId === line.subjectId);
        return (
          !s ||
          s.name !== line.subjectName ||
          Number(s.coefficient) !== Number(line.coefficient) ||
          (s.average === null ? line.average !== null : Number(s.average) !== Number(line.average))
        );
      })
    )
      documentConflict('DOCUMENT_SNAPSHOT_INVALID');
    return {
      studentId: report.studentId,
      reportCardId: report.id,
      snapshot: documentSnapshotSchema.parse({
        ...base,
        holder: {
          name: `${r.student.firstName} ${r.student.lastName}`,
          matricule: r.student.matricule,
        },
        academicYear: r.academicYear.name,
        academicPeriod: r.academicPeriod.name,
        className: r.schoolClass.name,
        report: r,
      }),
    };
  }
  if (input.documentType === 'RECEIPT') {
    const receipt = documentFound(
      await db.receipt.findFirst({
        where: { tenantId, id: input.sourceId },
        include: {
          payment: { include: { student: true, allocations: { include: { invoice: true } } } },
        },
      }),
    );
    const payment = receipt.payment,
      student = documentFound(payment.student);
    if (
      payment.status !== 'COMPLETED' ||
      !payment.paidAt ||
      receipt.amountMinor !== payment.amountMinor ||
      receipt.currency !== payment.currency
    )
      documentConflict('DOCUMENT_SOURCE_INELIGIBLE');
    return {
      studentId: student.id,
      receiptId: receipt.id,
      snapshot: documentSnapshotSchema.parse({
        ...base,
        holder: { name: `${student.firstName} ${student.lastName}`, matricule: student.matricule },
        receipt: {
          reference: receipt.receiptNumber,
          paymentReference: payment.paymentReference,
          amountMinor: receipt.amountMinor.toString(),
          currency: receipt.currency,
          method: payment.method,
          paidAt: payment.paidAt.toISOString(),
          invoices: payment.allocations.map((a) => a.invoice.invoiceNumber),
        },
      }),
    };
  }
  const enrollment = documentFound(
    await db.enrollment.findFirst({
      where: { tenantId, id: input.sourceId },
      include: { student: true, schoolClass: { include: { academicYear: true } } },
    }),
  );
  const year = enrollment.schoolClass.academicYear;
  if (
    enrollment.status !== 'ACTIVE' ||
    enrollment.student.status !== 'ACTIVE' ||
    year.status !== 'ACTIVE' ||
    enrollment.endedOn
  )
    documentConflict('DOCUMENT_SOURCE_INELIGIBLE');
  const student = enrollment.student;
  return {
    studentId: student.id,
    enrollmentId: enrollment.id,
    snapshot: documentSnapshotSchema.parse({
      ...base,
      holder: { name: `${student.firstName} ${student.lastName}`, matricule: student.matricule },
      academicYear: year.name,
      className: enrollment.schoolClass.name,
      enrollment: {
        type: enrollment.type ?? 'LEGACY',
        status: enrollment.status,
        enrolledOn: enrollment.enrolledOn.toISOString().slice(0, 10),
      },
    }),
  };
}
