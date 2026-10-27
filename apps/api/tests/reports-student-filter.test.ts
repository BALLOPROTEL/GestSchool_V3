import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import type { ReportExportView, ReportPage } from '@gestschool/contracts';
import { S3StorageAdapter } from '@gestschool/infrastructure';
import { ReportsGeneration } from '@gestschool/worker/reports';
import {
  financeHarness,
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
  teacher: FinanceAccount,
  parent: FinanceAccount,
  pupil: FinanceAccount,
  pipeline: ReportsGeneration,
  storage: S3StorageAdapter;

async function report(actor: FinanceAccount, filters: Record<string, string> = {}) {
  const query = new URLSearchParams({
    page: '1',
    pageSize: '100',
    search: '',
    ...filters,
  });
  return actor.browser.send<ReportPage>(`reports/students?${query.toString()}`);
}

async function requestExport(actor: FinanceAccount, format: 'CSV' | 'XLSX', studentId: string) {
  return actor.browser.send<ReportExportView>(
    'report-exports',
    {
      reportType: 'STUDENTS',
      format,
      locale: 'fr',
      filters: { search: '', studentId },
    },
    'POST',
    { 'Idempotency-Key': randomUUID() },
  );
}

async function download(actor: FinanceAccount, id: string) {
  return fetch(`${h.base}/api/v1/report-exports/${id}/download`, {
    headers: { Authorization: `Bearer ${actor.browser.access}` },
  });
}

beforeAll(async () => {
  h = await financeHarness();
  const tenant = await h.tenant();
  const other = await h.tenant();

  admin = await h.account(tenant.id, 'SCHOOL_ADMIN');
  foreignAdmin = await h.account(other.id, 'SCHOOL_ADMIN');
  teacher = await h.account(tenant.id, 'TEACHER');
  parent = await h.account(tenant.id, 'PARENT');
  pupil = await h.account(tenant.id, 'STUDENT');

  a = await h.graph(tenant.id, admin.browser, pupil.userId);
  second = await h.graph(tenant.id, admin.browser);
  foreign = await h.graph(other.id, foreignAdmin.browser);

  const guardian = await h.db.guardian.create({
    data: {
      tenantId: tenant.id,
      userId: parent.userId,
      guardianReference: randomUUID(),
      firstName: 'Parent',
      lastName: 'LOT15',
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
      lastName: 'LOT15',
    },
  });
  const subject = await h.db.subject.create({
    data: {
      tenantId: tenant.id,
      code: randomUUID().slice(0, 8),
      name: 'LOT15 student filter',
    },
  });
  const classSubject = await h.db.classSubject.create({
    data: {
      tenantId: tenant.id,
      schoolClassId: a.classroom.id,
      subjectId: subject.id,
      coefficient: '1',
    },
  });
  const period = await h.db.academicPeriod.create({
    data: {
      tenantId: tenant.id,
      academicYearId: a.year.id,
      name: 'LOT15 filter period',
      type: 'SEMESTER',
      ordinal: 1,
      startsOn: new Date('2026-01-01'),
      endsOn: new Date('2026-06-30'),
    },
  });
  await h.db.teachingAssignment.create({
    data: {
      tenantId: tenant.id,
      teacherId: teacherRow.id,
      classSubjectId: classSubject.id,
      academicPeriodId: period.id,
    },
  });

  storage = new S3StorageAdapter(loadInfrastructureConfig().storage);
  pipeline = new ReportsGeneration(h.db, storage);
}, 120000);

afterAll(async () => {
  storage?.close();
  await h?.close();
});

describe('LOT 15 students report studentId filter', () => {
  it('returns exactly the requested same-tenant student for a tenant admin', async () => {
    const response = await report(admin, { studentId: a.student.id });
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]?.['matricule']).toBe(a.student.matricule);
    expect(JSON.stringify(response.body)).not.toContain(second.student.matricule);
  });

  it('rejects a foreign-tenant studentId without leaking its row', async () => {
    const response = await report(admin, { studentId: foreign.student.id });
    expect(response.status).toBe(404);
    expect(JSON.stringify(response.body)).not.toContain(foreign.student.matricule);
  });

  it('keeps OWN, CHILDREN and ASSIGNED scopes on the requested studentId', async () => {
    const own = await report(pupil, { studentId: a.student.id });
    expect(own.status).toBe(200);
    expect(own.body.total).toBe(1);
    expect((await report(pupil, { studentId: second.student.id })).status).toBe(404);

    const child = await report(parent, { studentId: a.student.id });
    expect(child.status).toBe(200);
    expect(child.body.total).toBe(1);
    expect((await report(parent, { studentId: second.student.id })).status).toBe(404);

    const assigned = await report(teacher, { studentId: a.student.id });
    expect(assigned.status).toBe(200);
    expect(assigned.body.total).toBe(1);
    expect((await report(teacher, { studentId: second.student.id })).status).toBe(404);
  });

  it('combines studentId with classId and preserves classId-only behavior', async () => {
    const matching = await report(admin, {
      studentId: a.student.id,
      classId: a.classroom.id,
    });
    expect(matching.status).toBe(200);
    expect(matching.body.total).toBe(1);

    const inconsistent = await report(admin, {
      studentId: a.student.id,
      classId: second.classroom.id,
    });
    expect(inconsistent.status).toBe(200);
    expect(inconsistent.body.total).toBe(0);
    expect(inconsistent.body.items).toHaveLength(0);

    const classOnly = await report(admin, { classId: a.classroom.id });
    expect(classOnly.status).toBe(200);
    expect(classOnly.body.total).toBe(1);
    expect(classOnly.body.items[0]?.['matricule']).toBe(a.student.matricule);
  });

  it('applies the same studentId filter to CSV and XLSX exports', async () => {
    for (const format of ['CSV', 'XLSX'] as const) {
      const created = await requestExport(admin, format, a.student.id);
      expect(created.status).toBe(202);

      await pipeline.run({ tenantId: a.tenantId, exportId: created.body.id });
      const ready = await h.db.reportExport.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      expect(ready.status).toBe('READY');
      expect(ready.rowCount).toBe(1);

      const response = await download(admin, created.body.id);
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(response.status).toBe(200);
      if (format === 'CSV') {
        const csv = bytes.toString('utf8');
        expect(csv).toContain(a.student.matricule);
        expect(csv).not.toContain(second.student.matricule);
        expect(csv).not.toContain(foreign.student.matricule);
      } else {
        expect(bytes.subarray(0, 2).toString()).toBe('PK');
      }
    }
  });
});
