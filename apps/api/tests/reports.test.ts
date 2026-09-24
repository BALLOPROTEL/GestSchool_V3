import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import type { DashboardSummary, ReportExportView, ReportPage } from '@gestschool/contracts';
import { S3StorageAdapter } from '@gestschool/infrastructure';
import { ReportsGeneration } from '@gestschool/worker/reports';
import {
  capture,
  financeHarness,
  invoiceFixture,
  scheduleFixture,
  validate,
  type FinanceAccount,
  type FinanceGraph,
  type FinanceHarness,
} from './finance-helpers.js';
let h: FinanceHarness,
  a: FinanceGraph,
  second: FinanceGraph,
  foreign: FinanceGraph,
  admin: FinanceAccount,
  foreignAdmin: FinanceAccount,
  accountant: FinanceAccount,
  teacher: FinanceAccount,
  parent: FinanceAccount,
  pupil: FinanceAccount,
  staff: FinanceAccount,
  pipeline: ReportsGeneration,
  storage: S3StorageAdapter,
  teacherPeriod: string,
  paymentId: string;
async function report(actor: FinanceAccount, type: string, query = '') {
  return actor.browser.send<ReportPage>(`reports/${type}?page=1&pageSize=100&search=${query}`);
}
async function requestExport(
  actor: FinanceAccount,
  reportType: string,
  format: 'CSV' | 'XLSX' | 'PDF',
  key = randomUUID(),
) {
  return actor.browser.send<ReportExportView>(
    'report-exports',
    { reportType, format, locale: 'fr', filters: { search: '' } },
    'POST',
    { 'Idempotency-Key': key },
  );
}
async function download(actor: FinanceAccount, id: string) {
  return fetch(`${h.base}/api/v1/report-exports/${id}/download`, {
    headers: { Authorization: `Bearer ${actor.browser.access}` },
  });
}
beforeAll(async () => {
  h = await financeHarness();
  const tenant = await h.tenant(),
    other = await h.tenant();
  admin = await h.account(tenant.id, 'SCHOOL_ADMIN');
  foreignAdmin = await h.account(other.id, 'SCHOOL_ADMIN');
  accountant = await h.account(tenant.id, 'ACCOUNTANT');
  teacher = await h.account(tenant.id, 'TEACHER');
  parent = await h.account(tenant.id, 'PARENT');
  pupil = await h.account(tenant.id, 'STUDENT');
  staff = await h.account(tenant.id, 'ACADEMIC_STAFF');
  a = await h.graph(tenant.id, admin.browser, pupil.userId);
  second = await h.graph(tenant.id, admin.browser);
  foreign = await h.graph(other.id, foreignAdmin.browser);
  await h.db.academicYear.update({ where: { id: a.year.id }, data: { status: 'ACTIVE' } });
  await h.db.academicYear.update({ where: { id: foreign.year.id }, data: { status: 'ACTIVE' } });
  const guardian = await h.db.guardian.create({
    data: {
      tenantId: tenant.id,
      userId: parent.userId,
      guardianReference: randomUUID(),
      firstName: 'Parent',
      lastName: 'LOT12',
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
  const teacherRow = await h.db.teacher.create({
      data: {
        tenantId: tenant.id,
        userId: teacher.userId,
        employeeNumber: randomUUID(),
        firstName: 'Teacher',
        lastName: 'LOT12',
      },
    }),
    subject = await h.db.subject.create({
      data: { tenantId: tenant.id, code: randomUUID().slice(0, 8), name: 'Mathématiques' },
    }),
    link = await h.db.classSubject.create({
      data: {
        tenantId: tenant.id,
        schoolClassId: a.classroom.id,
        subjectId: subject.id,
        coefficient: '1',
      },
    });
  teacherPeriod = (
    await h.db.academicPeriod.create({
      data: {
        tenantId: tenant.id,
        academicYearId: a.year.id,
        name: 'LOT12 period',
        type: 'SEMESTER',
        ordinal: 1,
        startsOn: new Date('2026-01-01'),
        endsOn: new Date('2026-06-30'),
      },
    })
  ).id;
  await h.db.teachingAssignment.create({
    data: {
      tenantId: tenant.id,
      teacherId: teacherRow.id,
      classSubjectId: link.id,
      academicPeriodId: teacherPeriod,
    },
  });
  const { schedule } = await scheduleFixture(admin.browser, a, '300000'),
    invoice = await invoiceFixture(admin.browser, a, schedule.id),
    payment = await capture(admin.browser, invoice, '100000');
  await validate(accountant.browser, payment);
  paymentId = payment.id;
  storage = new S3StorageAdapter(loadInfrastructureConfig().storage);
  pipeline = new ReportsGeneration(h.db, storage);
}, 120000);
afterAll(async () => {
  storage?.close();
  await h?.close();
});
describe('LOT 12 dashboards, reports and exports', () => {
  it('keeps tenant aggregates isolated and returns real role-scoped dashboards', async () => {
    const dashboard = await admin.browser.send<DashboardSummary>('dashboard/summary');
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.counts['activeStudents']).toBe(2);
    expect(dashboard.body.money[0]).toMatchObject({
      invoicedMinor: '300000',
      collectedMinor: '100000',
      outstandingMinor: '200000',
    });
    const foreignDashboard = await foreignAdmin.browser.send<DashboardSummary>('dashboard/summary');
    expect(foreignDashboard.body.counts['activeStudents']).toBe(1);
    expect(foreignDashboard.body.counts['activeStudents']).not.toBe(3);
  });
  it('paginates all MVP reports without sensitive columns', async () => {
    for (const type of [
      'students',
      'enrollments',
      'academic',
      'results',
      'finance',
      'payments',
      'outstanding_balances',
      'documents',
      'communications',
    ]) {
      const reply = await report(admin, type);
      expect(reply.status).toBe(200);
      expect(reply.body.pageSize).toBe(100);
      expect(JSON.stringify(reply.body)).not.toMatch(
        /passwordHash|mfaSecret|refreshToken|verificationTokenHash|providerSecret/i,
      );
    }
  });
  it('enforces ASSIGNED, CHILDREN and OWN before totals and filters', async () => {
    const assigned = await report(teacher, 'students');
    expect(assigned.status).toBe(200);
    expect(assigned.body.total).toBe(1);
    expect((await report(teacher, 'students', `&classId=${second.classroom.id}`)).status).toBe(404);
    const children = await report(parent, 'students');
    expect(children.body.total).toBe(1);
    expect(children.body.items[0]?.['matricule']).toBe(a.student.matricule);
    const own = await report(pupil, 'students');
    expect(own.body.total).toBe(1);
    expect((await report(pupil, 'students', `&studentId=${second.student.id}`)).status).toBe(404);
    expect((await report(admin, 'students', `&classId=${foreign.classroom.id}`)).status).toBe(404);
  });
  it('requires both reporting and source permissions', async () => {
    expect((await report(staff, 'finance')).status).toBe(403);
    expect((await report(accountant, 'results')).status).toBe(403);
  });
  it('reconciles Finance dashboard and report using completed allocations', async () => {
    const dashboard = (await accountant.browser.send<DashboardSummary>('dashboard/summary')).body,
      finance = (await report(accountant, 'finance')).body;
    const total = finance.items.reduce(
      (sum, row) => sum + BigInt(String(row['paidMinor'] ?? '0')),
      0n,
    );
    expect(total.toString()).toBe(dashboard.money[0]?.netCollectedMinor);
  });
  it('keeps dashboard and reports exact after a LOT 8 payment reversal', async () => {
    expect(
      (
        await accountant.browser.send(
          `finance/payments/${paymentId}/request-cancellation`,
          { reason: 'LOT 12 reconciliation proof' },
          'POST',
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await accountant.browser.send(
          `finance/payments/${paymentId}/cancel`,
          { reason: 'LOT 12 approved reversal' },
          'POST',
        )
      ).status,
    ).toBe(200);
    const dashboard = (await accountant.browser.send<DashboardSummary>('dashboard/summary')).body,
      finance = (await report(accountant, 'finance')).body,
      paid = finance.items.reduce((sum, row) => sum + BigInt(String(row['paidMinor'] ?? '0')), 0n),
      remaining = finance.items.reduce(
        (sum, row) => sum + BigInt(String(row['balanceMinor'] ?? '0')),
        0n,
      );
    expect(dashboard.money[0]).toMatchObject({
      collectedMinor: '0',
      reversedMinor: '100000',
      netCollectedMinor: '0',
      outstandingMinor: '300000',
    });
    expect(paid).toBe(0n);
    expect(remaining.toString()).toBe(dashboard.money[0]?.outstandingMinor);
  });
  it('commits one durable export for ten identical requests and generates an immutable private CSV', async () => {
    await h.db.student.update({
      where: { id: a.student.id },
      data: { firstName: '=HYPERLINK("https://invalid.invalid")' },
    });
    const key = randomUUID(),
      replies = await Promise.all(
        Array.from({ length: 10 }, () => requestExport(admin, 'STUDENTS', 'CSV', key)),
      );
    expect(replies.map((reply) => reply.status)).toEqual(Array.from({ length: 10 }, () => 202));
    expect(new Set(replies.map((reply) => reply.body.id)).size).toBe(1);
    const pending = replies[0]!.body;
    expect(
      await h.db.outboxEvent.count({
        where: { aggregateId: pending.id, eventType: 'reports.export.requested.v1' },
      }),
    ).toBe(1);
    await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        pipeline.run({ tenantId: a.tenantId, exportId: pending.id }),
      ),
    );
    const ready = await h.db.reportExport.findUniqueOrThrow({ where: { id: pending.id } });
    expect(ready.status).toBe('READY');
    expect(
      await h.db.auditLog.count({
        where: {
          tenantId: a.tenantId,
          entityId: pending.id,
          action: 'report.export.generated',
        },
      }),
    ).toBe(1);
    await pipeline.run({ tenantId: a.tenantId, exportId: pending.id });
    expect(
      await h.db.auditLog.count({
        where: {
          tenantId: a.tenantId,
          entityId: pending.id,
          action: 'report.export.generated',
        },
      }),
    ).toBe(1);
    const response = await download(admin, pending.id),
      bytes = Buffer.from(await response.arrayBuffer());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(bytes.toString()).toContain("'=HYPERLINK");
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(ready.checksum);
    expect((await download(foreignAdmin, pending.id)).status).toBe(404);
  });
  it('generates valid XLSX and PDF files and makes expired exports unavailable', async () => {
    for (const [type, format, prefix] of [
      ['STUDENTS', 'XLSX', 'PK'],
      ['FINANCE', 'PDF', '%PDF-'],
    ] as const) {
      const created = await requestExport(admin, type, format);
      expect(created.status).toBe(202);
      await pipeline.run({ tenantId: a.tenantId, exportId: created.body.id });
      const response = await download(admin, created.body.id),
        bytes = Buffer.from(await response.arrayBuffer());
      expect(response.status).toBe(200);
      expect(bytes.subarray(0, prefix.length).toString()).toBe(prefix);
    }
    const created = await requestExport(admin, 'STUDENTS', 'CSV');
    await pipeline.run({ tenantId: a.tenantId, exportId: created.body.id });
    await h.db.reportExport.update({
      where: { id: created.body.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await download(admin, created.body.id)).status).toBe(410);
  });
  it('exposes teacher academic data only for the assigned period', async () => {
    const result = await report(teacher, 'academic', `&periodId=${teacherPeriod}`);
    expect(result.status).toBe(200);
    expect(result.body.items.every((row) => row['className'] === a.classroom.name)).toBe(true);
  });
  it('marks the third failed generation attempt terminal without leaking an unsafe error', async () => {
    const created = await requestExport(admin, 'STUDENTS', 'CSV');
    await h.db.reportExport.update({
      where: { id: created.body.id },
      data: { actorSnapshot: {} },
    });
    for (let attempt = 0; attempt < 3; attempt += 1)
      await expect(
        pipeline.run({ tenantId: a.tenantId, exportId: created.body.id }),
      ).rejects.toThrow('REPORT_GENERATION_FAILED');
    const failed = await h.db.reportExport.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(failed).toMatchObject({
      status: 'FAILED',
      attempts: 3,
      safeErrorCode: 'REPORT_GENERATION_FAILED',
      storageKey: null,
    });
    expect(failed.failedAt).not.toBeNull();
    await pipeline.run({ tenantId: a.tenantId, exportId: created.body.id });
    expect(
      (await h.db.reportExport.findUniqueOrThrow({ where: { id: created.body.id } })).attempts,
    ).toBe(3);
  });
  it('exports a dataset above the synchronous threshold through the durable job path', async () => {
    const suffix = randomUUID().slice(0, 8);
    await h.db.student.createMany({
      data: Array.from({ length: 1001 }, (_, index) => ({
        tenantId: a.tenantId,
        matricule: `L12-${suffix}-${String(index).padStart(4, '0')}`,
        firstName: 'Performance',
        lastName: `Student ${index}`,
      })),
    });
    const created = await requestExport(admin, 'STUDENTS', 'CSV');
    expect(created.status).toBe(202);
    await pipeline.run({ tenantId: a.tenantId, exportId: created.body.id });
    const ready = await h.db.reportExport.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(ready.status).toBe('READY');
    expect(ready.rowCount).toBeGreaterThan(1000);
    expect(ready.sizeBytes).toBeGreaterThan(0n);
  });
});
