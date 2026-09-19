import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from '@playwright/test';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import {
  documentSnapshotSchema,
  type DocumentView,
  type DocumentList,
  type OfficialDocumentType,
  type DocumentVerification,
  type DocumentTemplateView,
} from '@gestschool/contracts';
import { DocumentsGeneration } from '@gestschool/worker/documents';
import { DocumentsRuntime } from '@gestschool/worker/documents-runtime';
import {
  S3StorageAdapter,
  createDocumentQueue,
  documentHtml,
  renderDocumentPdf,
} from '@gestschool/infrastructure';
import { createServer } from 'node:http';
import {
  financeHarness,
  scheduleFixture,
  invoiceFixture,
  capture,
  validate,
  type FinanceHarness,
  type FinanceGraph,
  type FinanceAccount,
} from './finance-helpers.js';
import { pdfEvidence } from './pdf-evidence.js';
import { prepareResultsDemo } from '../src/modules/grades/grades.dev.js';

let h: FinanceHarness, a: FinanceGraph, b: FinanceGraph;
let admin: FinanceAccount,
  foreign: FinanceAccount,
  accountant: FinanceAccount,
  parent: FinanceAccount,
  pupil: FinanceAccount,
  stranger: FinanceAccount,
  teacher: FinanceAccount;
let storage: S3StorageAdapter,
  pipeline: DocumentsGeneration,
  reportId: string,
  receiptId: string,
  paymentId: string;
let certificate: DocumentView, card: DocumentView, receipt: DocumentView;
const tokens = new Map<string, string>();
async function request(
  type: OfficialDocumentType = 'SCHOOL_CERTIFICATE',
  source = a.enrollment.id,
  actor = admin,
  key = randomUUID(),
) {
  return actor.browser.send<DocumentView>(
    'documents/generate',
    { documentType: type, sourceId: source, locale: 'fr' },
    'POST',
    { 'Idempotency-Key': key },
  );
}
async function issue(type: OfficialDocumentType = 'SCHOOL_CERTIFICATE', source = a.enrollment.id) {
  const reply = await request(type, source);
  expect(reply.status).toBe(202);
  await pipeline.run({ tenantId: a.tenantId, documentId: reply.body.id });
  const after = await admin.browser.send<DocumentView>(`documents/${reply.body.id}`);
  expect(after.body.status).toBe('READY');
  return after.body;
}
async function download(row: DocumentView, actor = admin) {
  return fetch(`${h.base}/api/v1/documents/${row.id}/download`, {
    headers: { Authorization: `Bearer ${actor.browser.access}` },
  });
}
async function tokenFrom(row: DocumentView) {
  const response = await download(row),
    bytes = new Uint8Array(await response.arrayBuffer());
  const evidence = await pdfEvidence(bytes);
  expect(Boolean(evidence.verificationUrl)).toBe(true);
  const url = new URL(evidence.verificationUrl ?? 'https://invalid.invalid');
  expect(url.pathname.startsWith('/fr/verify/')).toBe(true);
  const token = url.pathname.split('/').at(-1) ?? '';
  expect(/^[A-Za-z0-9_-]{43}$/.test(token)).toBe(true);
  tokens.set(row.id, token);
  return { bytes, evidence, token };
}
async function verify(token: string) {
  const response = await fetch(`${h.base}/api/v1/public/documents/verify/${token}`);
  return { status: response.status, body: (await response.json()) as DocumentVerification };
}
beforeAll(async () => {
  h = await financeHarness();
  const tenant = await h.tenant(),
    other = await h.tenant();
  admin = await h.account(tenant.id, 'SCHOOL_ADMIN');
  foreign = await h.account(other.id, 'SCHOOL_ADMIN');
  accountant = await h.account(tenant.id, 'ACCOUNTANT');
  parent = await h.account(tenant.id, 'PARENT');
  pupil = await h.account(tenant.id, 'STUDENT');
  stranger = await h.account(tenant.id, 'STUDENT');
  teacher = await h.account(tenant.id, 'TEACHER');
  a = await h.graph(tenant.id, admin.browser, pupil.userId);
  b = await h.graph(other.id, foreign.browser);
  await h.db.academicYear.update({ where: { id: a.year.id }, data: { status: 'ACTIVE' } });
  await h.db.academicYear.update({ where: { id: b.year.id }, data: { status: 'ACTIVE' } });
  const guardian = await h.db.guardian.create({
    data: {
      tenantId: tenant.id,
      userId: parent.userId,
      guardianReference: randomUUID(),
      firstName: 'Parent',
      lastName: 'Document',
    },
  });
  await h.db.studentGuardian.create({
    data: {
      tenantId: tenant.id,
      studentId: a.student.id,
      guardianId: guardian.id,
      relationship: 'parent',
    },
  });
  const period = await h.db.academicPeriod.create({
    data: {
      tenantId: tenant.id,
      academicYearId: a.year.id,
      name: 'Période figée',
      type: 'SEMESTER',
      ordinal: 1,
      startsOn: new Date('2026-01-01'),
      endsOn: new Date('2026-06-30'),
    },
  });
  const subject = await h.db.subject.create({
    data: { tenantId: tenant.id, code: 'DOC-MATH', name: 'Mathématiques figées' },
  });
  const snapshot = {
    schemaVersion: 1,
    academicYear: { id: a.year.id, name: a.year.name },
    academicPeriod: {
      id: period.id,
      name: period.name,
      startsOn: '2026-01-01',
      endsOn: '2026-06-30',
    },
    schoolClass: { id: a.classroom.id, name: a.classroom.name },
    scale: '20',
    population: 1,
    rankedPopulation: 1,
    generalRemark: 'Travail sérieux',
    publishedAt: new Date().toISOString(),
    rounding: 'HALF_UP_2',
    ranking: 'COMPETITION_ON_DISPLAY_AVERAGE',
    student: {
      studentId: a.student.id,
      enrollmentId: a.enrollment.id,
      matricule: a.student.matricule,
      firstName: a.student.firstName,
      lastName: a.student.lastName,
      overallAverage: '15',
      rank: 1,
      complete: true,
      warnings: [],
      subjects: [
        {
          classSubjectId: randomUUID(),
          subjectId: subject.id,
          name: subject.name,
          coefficient: '1',
          average: '15',
          outcome: 'SCORED',
          complete: true,
          remark: 'Très bien',
          assessments: 1,
          scored: 1,
          missing: 0,
        },
      ],
    },
  };
  const report = await h.db.reportCard.create({
    data: {
      tenantId: tenant.id,
      studentId: a.student.id,
      academicYearId: a.year.id,
      academicPeriodId: period.id,
      schoolClassId: a.classroom.id,
      snapshot,
      status: 'DRAFT',
      overallAverage: '15',
      rank: 1,
    },
  });
  reportId = report.id;
  await h.db.reportCardLine.create({
    data: {
      tenantId: tenant.id,
      reportCardId: report.id,
      subjectId: subject.id,
      subjectName: subject.name,
      coefficient: '1',
      average: '15',
      teacherRemark: 'Très bien',
    },
  });
  await h.db.reportCard.update({
    where: { id: reportId },
    data: { status: 'PUBLISHED', publishedAt: new Date() },
  });
  const { schedule } = await scheduleFixture(admin.browser, a);
  const invoice = await invoiceFixture(admin.browser, a, schedule.id);
  const payment = await capture(admin.browser, invoice);
  await validate(accountant.browser, payment);
  paymentId = payment.id;
  receiptId = (await h.db.receipt.findFirstOrThrow({ where: { tenantId: tenant.id, paymentId } }))
    .id;
  storage = new S3StorageAdapter(loadInfrastructureConfig().storage);
  pipeline = new DocumentsGeneration(h.db, storage);
}, 120000);
afterAll(async () => {
  storage?.close();
  await h?.close();
});

describe('LOT 10 — real official document pipeline', () => {
  it('commits one PENDING document and one versioned outbox event for ten concurrent requests', async () => {
    const key = randomUUID(),
      replies = await Promise.all(
        Array.from({ length: 10 }, () =>
          request('SCHOOL_CERTIFICATE', a.enrollment.id, admin, key),
        ),
      );
    expect(replies.every((r) => r.status === 202)).toBe(true);
    expect(new Set(replies.map((r) => r.body.id)).size).toBe(1);
    certificate = replies[0]!.body;
    expect(certificate.status).toBe('PENDING');
    expect(
      await h.db.outboxEvent.count({
        where: { aggregateId: certificate.id, eventType: 'documents.generation.requested.v1' },
      }),
    ).toBe(1);
    expect((await request('STUDENT_CARD', a.enrollment.id, admin, key)).status).toBe(409);
  });
  it('renders a private nonempty PDF with matching SHA-256 and a decodable 256-bit QR', async () => {
    await pipeline.run({ tenantId: a.tenantId, documentId: certificate.id });
    certificate = (await admin.browser.send<DocumentView>(`documents/${certificate.id}`)).body;
    expect(certificate.status).toBe('READY');
    const { bytes, token } = await tokenFrom(certificate);
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(1000);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(certificate.checksum);
    const row = await h.db.document.findUniqueOrThrow({ where: { id: certificate.id } });
    expect(row.verificationTokenHash === createHash('sha256').update(token).digest('hex')).toBe(
      true,
    );
    expect(
      JSON.stringify(row, (_, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)).includes(
        token,
      ),
    ).toBe(false);
    const config = loadInfrastructureConfig().storage;
    expect((await fetch(`${config.endpoint}/${config.bucket}/${row.objectKey}`)).status).toBe(403);
    expect((await download(certificate)).headers.get('content-type')).toContain('application/pdf');
  });
  it('verifies publicly with a minimal payload and no sensitive fields', async () => {
    const result = await verify(tokens.get(certificate.id) ?? '');
    expect(result.status).toBe(200);
    expect(result.body.status).toBe('VALID');
    expect(Object.keys(result.body).toSorted()).toEqual(
      [
        'academicPeriod',
        'academicYear',
        'documentType',
        'holder',
        'issuedAt',
        'reference',
        'school',
        'status',
      ].toSorted(),
    );
  });
  it('is a no-op when READY is replayed ten times', async () => {
    await Promise.all(
      Array.from({ length: 10 }, () =>
        pipeline.run({ tenantId: a.tenantId, documentId: certificate.id }),
      ),
    );
    const row = await h.db.document.findUniqueOrThrow({ where: { id: certificate.id } });
    expect(row.checksum).toBe(certificate.checksum);
    expect(row.attempts).toBe(1);
    expect(
      await h.db.auditLog.count({ where: { entityId: row.id, action: 'document.generated' } }),
    ).toBe(1);
  });
  it('allocates ten distinct official numbers atomically for concurrent independent requests', async () => {
    const replies = await Promise.all(Array.from({ length: 10 }, () => request()));
    expect(replies.every((reply) => reply.status === 202)).toBe(true);
    expect(new Set(replies.map((reply) => reply.body.reference)).size).toBe(10);
    expect(new Set(replies.map((reply) => reply.body.id)).size).toBe(10);
  });
  it('rejects a real unpublished report and a source belonging to another tenant', async () => {
    const period = await h.db.academicPeriod.create({
      data: {
        tenantId: a.tenantId,
        academicYearId: a.year.id,
        name: 'Unpublished',
        type: 'SEMESTER',
        ordinal: 2,
        startsOn: new Date('2026-07-01'),
        endsOn: new Date('2026-12-31'),
      },
    });
    const draft = await h.db.reportCard.create({
      data: {
        tenantId: a.tenantId,
        studentId: a.student.id,
        academicYearId: a.year.id,
        academicPeriodId: period.id,
        schoolClassId: a.classroom.id,
        status: 'DRAFT',
      },
    });
    expect((await request('REPORT_CARD', draft.id)).status).toBe(404);
    expect((await request('TRANSCRIPT', draft.id)).status).toBe(404);
    expect((await request('REPORT_CARD', reportId, foreign)).status).toBe(404);
  });
  it('recovers an expired worker lease without issuing twice', async () => {
    const reply = await request(),
      id = reply.body.id;
    await h.db.document.update({
      where: { id },
      data: {
        generationStatus: 'PROCESSING',
        attempts: 1,
        leaseToken: randomUUID(),
        leaseUntil: new Date(Date.now() - 1000),
      },
    });
    await pipeline.run({ tenantId: a.tenantId, documentId: id });
    await pipeline.run({ tenantId: a.tenantId, documentId: id });
    const row = await h.db.document.findUniqueOrThrow({ where: { id } });
    expect(row.generationStatus).toBe('READY');
    expect(row.attempts).toBe(2);
    expect(
      await h.db.auditLog.count({ where: { entityId: id, action: 'document.generated' } }),
    ).toBe(1);
  });
  it('does not steal a live worker lease or burn a retry', async () => {
    const reply = await request(),
      id = reply.body.id,
      leaseToken = randomUUID();
    await h.db.document.update({
      where: { id },
      data: {
        generationStatus: 'PROCESSING',
        attempts: 1,
        leaseToken,
        leaseUntil: new Date(Date.now() + 60000),
      },
    });
    await expect(pipeline.run({ tenantId: a.tenantId, documentId: id })).rejects.toThrow(
      'DOCUMENT_LEASE_BUSY',
    );
    const row = await h.db.document.findUniqueOrThrow({ where: { id } });
    expect(row.attempts).toBe(1);
    expect(row.leaseToken).toBe(leaseToken);
    await h.db.document.update({
      where: { id },
      data: { leaseUntil: new Date(Date.now() - 1000) },
    });
    await pipeline.run({ tenantId: a.tenantId, documentId: id });
  });
  it('renders injected markup as text without contacting a loopback HTTP trap', async () => {
    let requests = 0;
    const trap = createServer((_request, response) => {
      requests++;
      response.end('unsafe');
    });
    await new Promise<void>((resolve) => trap.listen(0, '127.0.0.1', resolve));
    try {
      const address = trap.address();
      if (!address || typeof address === 'string') throw new Error('Missing trap address');
      const row = await h.db.document.findUniqueOrThrow({ where: { id: certificate.id } });
      const snapshot = documentSnapshotSchema.parse(row.snapshot);
      snapshot.holder.name = `<img src="http://127.0.0.1:${address.port}/ssrf"><script>fetch('http://127.0.0.1:${address.port}/js')</script>`;
      snapshot.template.footer = '<iframe src="file:///etc/passwd"></iframe>';
      const bytes = await renderDocumentPdf(
        snapshot,
        row.reference,
        `http://127.0.0.1:3000/fr/verify/${'x'.repeat(43)}`,
      );
      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
      expect(requests).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) =>
        trap.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
  it.each([
    'ENROLLMENT_CERTIFICATE',
    'STUDENT_CARD',
    'REPORT_CARD',
    'TRANSCRIPT',
    'RECEIPT',
  ] as const)('issues %s from an eligible real source', async (type) => {
    const source =
      type === 'RECEIPT'
        ? receiptId
        : type === 'REPORT_CARD' || type === 'TRANSCRIPT'
          ? reportId
          : a.enrollment.id;
    const row = await issue(type, source);
    if (type === 'STUDENT_CARD') card = row;
    if (type === 'RECEIPT') receipt = row;
    const { evidence } = await tokenFrom(row);
    expect(evidence.pages.length).toBeGreaterThan(0);
    if (type === 'STUDENT_CARD') {
      expect(evidence.pages).toHaveLength(1);
      expect((evidence.pages[0]!.width * 25.4) / 72).toBeCloseTo(85.6, 0);
      expect((evidence.pages[0]!.height * 25.4) / 72).toBeCloseTo(53.98, 0);
    }
  });
  it.each(['fr', 'en', 'ar'] as const)(
    'keeps the complete printed card and QR inside ID-1 bounds in %s',
    async (locale) => {
      const stored = await h.db.document.findUniqueOrThrow({ where: { id: card.id } });
      const snapshot = documentSnapshotSchema.parse(stored.snapshot);
      snapshot.locale = locale;
      snapshot.school.name = locale === 'ar' ? 'مدرسة المستقبل' : 'École de démonstration';
      snapshot.holder.name = locale === 'ar' ? 'أمين عبد الرحمن' : 'Aminata Diop';
      snapshot.holder.matricule = 'DEMO-2026-001';
      snapshot.className = locale === 'ar' ? 'الصف السادس' : 'Sixième A';
      const target = `http://localhost:3000/${locale}/verify/${'x'.repeat(43)}`;
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.emulateMedia({ media: 'print' });
        await page.setContent(await documentHtml(snapshot, card.reference, target));
        await page.evaluate(() => document.fonts.ready);
        const layout = await page.evaluate(() => {
          const body = document.body.getBoundingClientRect();
          return {
            fontsLoaded: document.fonts.status === 'loaded',
            direction: document.documentElement.dir,
            contained: [...document.querySelectorAll('header, dt, dd, footer, footer img')].every(
              (element) => {
                const bounds = element.getBoundingClientRect();
                return (
                  bounds.left >= body.left &&
                  bounds.right <= body.right &&
                  bounds.bottom <= body.bottom
                );
              },
            ),
          };
        });
        expect(layout).toEqual({
          fontsLoaded: true,
          direction: locale === 'ar' ? 'rtl' : 'ltr',
          contained: true,
        });
      } finally {
        await browser.close();
      }
      const evidence = await pdfEvidence(await renderDocumentPdf(snapshot, card.reference, target));
      expect(evidence.pages).toHaveLength(1);
      expect((evidence.pages[0]!.width * 25.4) / 72).toBeCloseTo(85.6, 0);
      expect((evidence.pages[0]!.height * 25.4) / 72).toBeCloseTo(53.98, 0);
      expect(evidence.verificationUrl === target).toBe(true);
    },
  );
  it.each(['parent', 'pupil'] as const)('permits scoped %s downloads', async (role) => {
    expect((await download(certificate, role === 'parent' ? parent : pupil)).status).toBe(200);
  });
  it.each(['foreign', 'stranger', 'teacher', 'accountant'] as const)(
    'denies %s certificate downloads even with the UUID',
    async (role) => {
      const actor = { foreign, stranger, teacher, accountant }[role];
      const response = await download(certificate, actor);
      expect([403, 404].includes(response.status)).toBe(true);
    },
  );
  it('does not expose cross-tenant or unlinked documents in lists', async () => {
    for (const actor of [foreign, stranger]) {
      const list = await actor.browser.send<DocumentList>('documents');
      expect(list.body.items).toHaveLength(0);
    }
    expect((await request('SCHOOL_CERTIFICATE', b.enrollment.id)).status).toBe(404);
    expect((await request('RECEIPT', receiptId, foreign)).status).toBe(404);
  });
  it('denies generation to children/own/teacher and restricts accountants to receipts', async () => {
    for (const actor of [parent, pupil, teacher, accountant])
      expect((await request('SCHOOL_CERTIFICATE', a.enrollment.id, actor)).status).toBe(403);
    expect((await request('RECEIPT', receiptId, accountant)).status).toBe(202);
  });
  it('rejects arbitrary PDF payloads, invalid sources and missing idempotency keys', async () => {
    expect(
      (
        await admin.browser.send(
          'documents/generate',
          {
            documentType: 'SCHOOL_CERTIFICATE',
            sourceId: a.enrollment.id,
            locale: 'fr',
            html: '<script>alert(1)</script>',
          },
          'POST',
          { 'Idempotency-Key': randomUUID() },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.browser.send(
          'documents/generate',
          { documentType: 'SCHOOL_CERTIFICATE', sourceId: a.enrollment.id, locale: 'fr' },
          'POST',
        )
      ).status,
    ).toBe(400);
    expect((await request('REPORT_CARD', randomUUID())).status).toBe(404);
  });
  it('freezes certificate and card snapshots after student/class label changes', async () => {
    const before = await h.db.document.findMany({
      where: { id: { in: [certificate.id, card.id] } },
    });
    await h.db.student.update({
      where: { id: a.student.id },
      data: { firstName: 'Nouveau prénom' },
    });
    await h.db.schoolClass.update({
      where: { id: a.classroom.id },
      data: { name: 'Nouveau libellé' },
    });
    const after = await h.db.document.findMany({
      where: { id: { in: [certificate.id, card.id] } },
    });
    expect(after.map((r) => r.snapshot)).toEqual(before.map((r) => r.snapshot));
    for (const row of [certificate, card])
      expect(
        createHash('sha256')
          .update(new Uint8Array(await (await download(row)).arrayBuffer()))
          .digest('hex'),
      ).toBe(row.checksum);
  });
  it('uses only the historical published report snapshot after live names change', async () => {
    const report = await issue('REPORT_CARD', reportId);
    const row = await h.db.document.findUniqueOrThrow({ where: { id: report.id } }),
      s = documentSnapshotSchema.parse(row.snapshot);
    expect(s.holder.name).toBe(`${a.student.firstName} ${a.student.lastName}`);
    expect(s.className).toBe(a.classroom.name);
    const subject = s.report?.student.subjects[0];
    if (!subject) throw new Error('Missing historical report subject');
    await h.db.subject.update({
      where: { id: subject.subjectId },
      data: { name: 'Libellé futur autorisé' },
    });
    expect(
      createHash('sha256')
        .update(new Uint8Array(await (await download(report)).arrayBuffer()))
        .digest('hex'),
    ).toBe(row.checksum);
    expect((await h.db.document.findUniqueOrThrow({ where: { id: row.id } })).snapshot).toEqual(
      row.snapshot,
    );
  });
  it('rejects document mutations and destructive deletes at the database layer', async () => {
    await expect(
      h.db.document.update({
        where: { id: certificate.id },
        data: { snapshot: { tampered: true } },
      }),
    ).rejects.toThrow();
    await expect(
      h.db.document.update({ where: { id: certificate.id }, data: { checksum: 'a'.repeat(64) } }),
    ).rejects.toThrow();
    await expect(h.db.document.delete({ where: { id: certificate.id } })).rejects.toThrow();
  });
  it('publishes a new template version without changing existing documents', async () => {
    const response = await admin.browser.send<DocumentTemplateView>(
      'document-templates',
      {
        documentType: 'SCHOOL_CERTIFICATE',
        locale: 'fr',
        name: 'Version 2',
        layout: { renderer: 'gestschool-v1', accent: '#123456', footer: 'Nouveau pied' },
      },
      'POST',
    );
    expect(response.status).toBe(201);
    expect(response.body.version).toBe(2);
    const actions = await h.db.auditLog.findMany({
      where: { entityId: response.body.id },
      select: { action: true },
    });
    expect(actions.map((entry) => entry.action).toSorted()).toEqual([
      'template.created',
      'template.published',
      'template.updated',
    ]);
    expect(
      (await admin.browser.send<DocumentView>(`documents/${certificate.id}`)).body.templateVersion,
    ).toBe(1);
    const row = await h.db.document.findUniqueOrThrow({ where: { id: certificate.id } });
    await expect(
      h.db.documentTemplate.update({
        where: { id: row.documentTemplateId! },
        data: { body: '{}' },
      }),
    ).rejects.toThrow();
  });
  it.each([
    'http://127.0.0.1',
    'http://169.254.169.254',
    'file:///etc/passwd',
    'https://example.com',
  ])('rejects remote template resource %s', async (url) => {
    const result = await admin.browser.send(
      'document-templates',
      {
        documentType: 'STUDENT_CARD',
        locale: 'fr',
        name: 'Unsafe',
        layout: { renderer: 'gestschool-v1', accent: '#123456', footer: 'Footer', url },
      },
      'POST',
    );
    expect(result.status).toBe(400);
  });
  it('retries renderer failures, then records FAILED after exhaustion without leaking errors', async () => {
    const reply = await request(),
      id = reply.body.id;
    const failed = new DocumentsGeneration(h.db, storage, async () => {
      throw new Error('sensitive renderer payload');
    });
    for (let attempt = 1; attempt <= 3; attempt++) {
      await expect(failed.run({ tenantId: a.tenantId, documentId: id })).rejects.toThrow(
        'DOCUMENT_GENERATION_FAILED',
      );
      const row = await h.db.document.findUniqueOrThrow({ where: { id } });
      expect(row.attempts).toBe(attempt);
      expect(row.generationStatus).toBe(attempt === 3 ? 'FAILED' : 'PENDING');
    }
    const audits = await h.db.auditLog.findMany({ where: { entityId: id } });
    expect(JSON.stringify(audits).includes('sensitive renderer payload')).toBe(false);
  });
  it('revokes without deleting the PDF and makes its QR return REVOKED', async () => {
    expect(
      (await admin.browser.send(`documents/${certificate.id}/revoke`, { reason: 'x' }, 'POST'))
        .status,
    ).toBe(400);
    expect(
      (
        await admin.browser.send(
          `documents/${certificate.id}/revoke`,
          { reason: 'Émission remplacée' },
          'POST',
        )
      ).status,
    ).toBe(200);
    expect((await verify(tokens.get(certificate.id) ?? '')).body.status).toBe('REVOKED');
    expect(
      createHash('sha256')
        .update(new Uint8Array(await (await download(certificate)).arrayBuffer()))
        .digest('hex'),
    ).toBe(certificate.checksum);
  });
  it('reissues with a new number and token while retaining the revoked original', async () => {
    const reply = await admin.browser.send<DocumentView>(
      `documents/${certificate.id}/reissue`,
      {},
      'POST',
      { 'Idempotency-Key': randomUUID() },
    );
    expect(reply.status).toBe(202);
    await pipeline.run({ tenantId: a.tenantId, documentId: reply.body.id });
    const next = (await admin.browser.send<DocumentView>(`documents/${reply.body.id}`)).body;
    expect(next.reference).not.toBe(certificate.reference);
    const result = await tokenFrom(next);
    expect(result.token !== tokens.get(certificate.id)).toBe(true);
    expect((await verify(result.token)).body.status).toBe('VALID');
  });
  it('invalidates a reversed receipt immediately and retains the historic bytes', async () => {
    expect(
      (
        await accountant.browser.send(
          `finance/payments/${paymentId}/request-cancellation`,
          { reason: 'Annulation document' },
          'POST',
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await admin.browser.send(
          `finance/payments/${paymentId}/cancel`,
          { reason: 'Annulation confirmée' },
          'POST',
        )
      ).status,
    ).toBe(200);
    expect((await verify(tokens.get(receipt.id) ?? '')).body.status).toBe('REVOKED');
    expect((await request('RECEIPT', receiptId)).status).toBe(409);
    expect((await download(receipt, accountant)).status).toBe(200);
  });
  it('delivers the durable outbox through BullMQ and survives a clean worker restart', async () => {
    const next = await request();
    const runtime = new DocumentsRuntime();
    try {
      await runtime.start();
      await expect
        .poll(
          async () =>
            (await h.db.document.findUniqueOrThrow({ where: { id: next.body.id } }))
              .generationStatus,
          { timeout: 60000, interval: 500 },
        )
        .toBe('READY');
    } finally {
      await runtime.onModuleDestroy();
    }
    const queue = createDocumentQueue(loadInfrastructureConfig().redisUrl);
    try {
      const job = await queue.getJob(next.body.id);
      expect(Object.keys(job?.data as object).toSorted()).toEqual(['documentId', 'tenantId']);
    } finally {
      await queue.close();
    }
    const restarted = new DocumentsRuntime();
    try {
      await restarted.start();
      await restarted.dispatchOnce();
    } finally {
      await restarted.onModuleDestroy();
    }
    expect(
      await h.db.auditLog.count({
        where: { entityId: next.body.id, action: 'document.generated' },
      }),
    ).toBe(1);
    expect(
      (await h.db.document.findUniqueOrThrow({ where: { id: receipt.id } })).generationStatus,
    ).toBe('REVOKED');
  }, 90000);
  it('returns a generic INVALID result for random tokens and rate-limits the endpoint by IP', async () => {
    const random = await verify('x'.repeat(43));
    expect(random.body).toEqual({ status: 'INVALID' });
    let limited = false;
    for (let i = 0; i < 35; i++) {
      const response = await verify(randomUUID().replaceAll('-', '').padEnd(43, 'x'));
      if (response.status === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });
  it('preserves the prepared Results demo when Documents adds a newer enrollment', async () => {
    const tenant = await h.tenant();
    const validator = await h.account(tenant.id, 'SCHOOL_ADMIN');
    const instructor = await h.account(tenant.id, 'TEACHER');
    const learner = await h.account(tenant.id, 'STUDENT');
    const graph = await h.graph(tenant.id, validator.browser, learner.userId);
    const [validatorUser, instructorUser, learnerUser] = await Promise.all(
      [validator, instructor, learner].map((actor) =>
        h.db.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { email: true } }),
      ),
    );
    if (!validatorUser || !instructorUser || !learnerUser) throw new Error('Missing DEV actors');
    const emails = {
      validator: validatorUser.email,
      teacher: instructorUser.email,
      student: learnerUser.email,
    };
    const first = await prepareResultsDemo(h.db, tenant.id, emails);
    expect(first.created).toBe(true);
    const before = await h.db.reportCard.findMany({
      where: { tenantId: tenant.id },
      orderBy: { id: 'asc' },
    });
    expect(before.length).toBeGreaterThan(0);
    const year = await h.db.academicYear.create({
      data: {
        tenantId: tenant.id,
        code: 'NEXT-DOC',
        name: 'Documents next year',
        startsOn: new Date('2027-01-01'),
        endsOn: new Date('2027-12-31'),
        status: 'ACTIVE',
      },
    });
    const classroom = await h.db.schoolClass.create({
      data: {
        tenantId: tenant.id,
        academicYearId: year.id,
        levelId: graph.classroom.levelId,
        code: 'NEXT-DOC',
        name: 'Next documents class',
      },
    });
    await h.db.academicPeriod.create({
      data: {
        tenantId: tenant.id,
        academicYearId: year.id,
        name: 'Only one existing period',
        type: 'SEMESTER',
        ordinal: 1,
        startsOn: year.startsOn,
        endsOn: new Date('2027-06-30'),
      },
    });
    await h.db.enrollment.create({
      data: {
        tenantId: tenant.id,
        academicYearId: year.id,
        schoolClassId: classroom.id,
        studentId: graph.student.id,
        status: 'ACTIVE',
        enrolledOn: year.startsOn,
      },
    });
    expect(await prepareResultsDemo(h.db, tenant.id, emails)).toEqual({
      created: false,
      enrollmentId: graph.enrollment.id,
    });
    expect(
      await h.db.reportCard.findMany({ where: { tenantId: tenant.id }, orderBy: { id: 'asc' } }),
    ).toEqual(before);
    expect(
      await h.db.academicPeriod.count({ where: { tenantId: tenant.id, academicYearId: year.id } }),
    ).toBe(1);
  });
  it('retains zero orphan or cross-tenant official document relationships', async () => {
    const violations = await h.db.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM documents d
      LEFT JOIN students s ON s.id=d.student_id AND s.tenant_id=d.tenant_id
      LEFT JOIN document_templates t ON t.id=d.document_template_id AND t.tenant_id=d.tenant_id
      LEFT JOIN enrollments e ON e.id=d.enrollment_id AND e.tenant_id=d.tenant_id AND e.student_id=d.student_id
      LEFT JOIN report_cards r ON r.id=d.report_card_id AND r.tenant_id=d.tenant_id AND r.student_id=d.student_id
      LEFT JOIN receipts p ON p.id=d.receipt_id AND p.tenant_id=d.tenant_id
      WHERE d.document_type IS NOT NULL AND (s.id IS NULL OR t.id IS NULL
        OR (d.enrollment_id IS NOT NULL AND e.id IS NULL)
        OR (d.report_card_id IS NOT NULL AND r.id IS NULL)
        OR (d.receipt_id IS NOT NULL AND p.id IS NULL))`;
    expect(violations[0]?.count).toBe(0n);
    const audits = await h.db.auditLog.findMany({
      where: { tenantId: a.tenantId, entityType: 'document' },
    });
    const text = JSON.stringify(audits);
    for (const token of tokens.values()) expect(text.includes(token)).toBe(false);
  });
});
