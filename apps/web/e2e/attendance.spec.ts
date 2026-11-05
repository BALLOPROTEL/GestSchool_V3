import { readFileSync } from 'node:fs';
import type { LoginResult } from '@gestschool/contracts';
import { expect, test } from './fixtures';
import { login, overflow, watch, type Credentials } from './academic-helpers';

interface AttendanceFixture {
  classId: string;
  crud: Credentials;
  denied: Credentials;
  otherStudentId: string;
  ownStudentId: string;
  parent: Credentials;
  student: Credentials;
  targetClassId: string;
}

function fixtures() {
  return JSON.parse(
    readFileSync(new URL('../../../.local/iam-e2e.json', import.meta.url), 'utf8'),
  ) as { enrollments: Record<string, AttendanceFixture> };
}

function fixture(viewport: string) {
  const data = fixtures().enrollments[viewport];
  if (!data) throw new Error(`Missing attendance fixture for ${viewport}`);
  return data;
}

test('LOT18.4 certifies explicit attendance save, reload persistence, PDF export and tenant isolation', async ({
  page,
}, info) => {
  test.skip(info.project.name !== '1440x900', 'Attendance write path certified once.');
  const data = fixture(info.project.name);
  const other = Object.values(fixtures().enrollments).find(
    (candidate) => candidate.targetClassId !== data.targetClassId,
  );
  if (!other) throw new Error('Missing cross-tenant attendance fixture');

  const check = watch(page);
  const sessionResponse = page.waitForResponse((response) => {
    const path = new URL(response.url()).pathname;
    return (
      ['/api/v1/auth/mfa/confirm', '/api/v1/auth/mfa/verify'].includes(path) &&
      response.request().method() === 'POST'
    );
  });
  await login(page, data.crud, true);
  const auth = (await (await sessionResponse).json()) as LoginResult;
  if (auth.kind !== 'session') throw new Error('Expected attendance admin session');

  await page.goto('/fr/attendance');
  await expect(page.getByRole('heading', { level: 1, name: 'Suivi des présences' })).toBeVisible();

  await page
    .getByRole('combobox', { name: 'Classe', exact: true })
    .selectOption(data.targetClassId);
  await page.getByLabel('Date', { exact: true }).fill('2026-10-30');
  const row = page.locator('tbody tr').first();
  await expect(row).toBeVisible();

  const status = row.getByRole('combobox');
  await status.selectOption('ABSENT');
  await row.getByRole('textbox').fill('Certification LOT18.4');
  await expect(page.getByText('Modifications non enregistrées.', { exact: false })).toBeVisible();

  const dateInput = page.getByLabel('Date', { exact: true });
  await dateInput.fill('2026-10-31');
  const discardDialog = page.getByRole('dialog');
  await expect(
    discardDialog.getByRole('heading', { name: 'Abandonner les modifications ?' }),
  ).toBeVisible();
  await discardDialog.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(dateInput).toHaveValue('2026-10-30');

  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/attendance/sheet' &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Valider / Enregistrer la feuille', exact: true }).click();
  const savedResponse = await saved;
  expect(savedResponse.ok()).toBe(true);
  const savedSheet = (await savedResponse.json()) as { students: Array<{ studentId: string }> };
  const savedStudentId = savedSheet.students[0]?.studentId;
  if (!savedStudentId) throw new Error('Missing saved attendance student');
  await expect(page.getByText('Présences enregistrées.', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Toutes les modifications sont enregistrées.', { exact: true }),
  ).toBeVisible();
  await expect(status).toHaveValue('ABSENT');

  await page.reload();
  await page
    .getByRole('combobox', { name: 'Classe', exact: true })
    .selectOption(data.targetClassId);
  await page.getByLabel('Date', { exact: true }).fill('2026-10-30');
  const persistedRow = page.locator('tbody tr').first();
  await expect(persistedRow.getByRole('combobox')).toHaveValue('ABSENT');
  await expect(persistedRow.getByRole('textbox')).toHaveValue('Certification LOT18.4');

  await page.goto(`/fr/students/${savedStudentId}`);
  await expect(page.getByRole('tab', { name: 'Présence', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Présence', exact: true }).click();
  await expect(page.getByText('Certification LOT18.4', { exact: true })).toBeVisible();
  await expect(page.getByText('Absent', { exact: true }).first()).toBeVisible();

  await page.goto('/fr/attendance');
  await page
    .getByRole('combobox', { name: 'Classe', exact: true })
    .selectOption(data.targetClassId);
  await page.getByLabel('Date', { exact: true }).fill('2026-10-30');

  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter CSV', exact: true }).click();
  expect((await csvDownload).suggestedFilename()).toBe('gestschool-attendance-2026-10-30.csv');

  const pdfDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter PDF', exact: true }).click();
  const pdf = await pdfDownload;
  expect(pdf.suggestedFilename()).toBe('gestschool-attendance-2026-10-30.pdf');
  const pdfPath = await pdf.path();
  if (!pdfPath) throw new Error('Missing attendance PDF download');
  expect(readFileSync(pdfPath).subarray(0, 5).toString()).toBe('%PDF-');

  const hidden = await page.request.get(
    `/api/v1/attendance/sheet?classId=${other.targetClassId}&date=2026-10-30`,
    { headers: { Authorization: `Bearer ${auth.accessToken}` } },
  );
  expect(hidden.status()).toBe(404);

  await overflow(page);
  check();
});

test('LOT17.8 certifies parent CHILDREN and student OWN attendance history as read-only', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== '1366x768', 'Scoped attendance history certified once.');
  const data = fixture(info.project.name);

  for (const role of ['parent', 'student'] as const) {
    const context = await browser.newContext(
      info.project.use.viewport ? { viewport: info.project.use.viewport } : {},
    );
    const page = await context.newPage();
    const check = watch(page);
    const loginResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/v1/auth/login' &&
        response.request().method() === 'POST',
    );
    await login(page, data[role], false);
    const auth = (await (await loginResponse).json()) as LoginResult;
    if (auth.kind !== 'session') throw new Error('Expected scoped attendance session');

    await page.goto('/fr/attendance');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Suivi des présences' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Valider / Enregistrer la feuille', exact: true }),
    ).toHaveCount(0);

    const student = page.getByRole('combobox', { name: 'Élève', exact: true });
    await student.selectOption(data.ownStudentId);
    await expect(page.getByRole('table')).toBeVisible();

    const denied = await page.request.get(
      `/api/v1/attendance/history?studentId=${data.otherStudentId}&page=1&pageSize=25`,
      { headers: { Authorization: `Bearer ${auth.accessToken}` } },
    );
    expect(denied.status()).toBe(403);

    await overflow(page);
    check();
    await context.close();
  }
});
