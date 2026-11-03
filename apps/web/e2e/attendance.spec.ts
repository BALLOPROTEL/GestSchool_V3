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

test('LOT17.8 certifies the real attendance sheet, export and tenant isolation', async ({
  page,
}, info) => {
  test.skip(info.project.name !== '1440x900', 'Attendance write path certified once.');
  const data = fixture(info.project.name);
  const other = Object.values(fixtures().enrollments).find(
    (candidate) => candidate.targetClassId !== data.targetClassId,
  );
  if (!other) throw new Error('Missing cross-tenant attendance fixture');

  const check = watch(page);
  const loginResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/auth/login' &&
      response.request().method() === 'POST',
  );
  await login(page, data.crud, false);
  const auth = (await (await loginResponse).json()) as LoginResult;
  if (auth.kind !== 'session') throw new Error('Expected attendance admin session');

  await page.goto('/fr/attendance');
  await expect(page.getByRole('heading', { level: 1, name: 'Suivi des présences' })).toBeVisible();

  await page.getByRole('combobox', { name: 'Classe', exact: true }).selectOption(data.targetClassId);
  await page.getByLabel('Date', { exact: true }).fill('2026-10-30');
  const row = page.locator('tbody tr').first();
  await expect(row).toBeVisible();

  const status = row.getByRole('combobox');
  await status.selectOption('ABSENT');
  await row.getByRole('textbox').fill('Certification LOT17.8');

  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/attendance/sheet' &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  expect((await saved).ok()).toBe(true);
  await expect(page.getByText('Présences enregistrées.', { exact: true })).toBeVisible();
  await expect(status).toHaveValue('ABSENT');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter la feuille', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('gestschool-attendance-2026-10-30.csv');

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
    await expect(page.getByRole('heading', { level: 1, name: 'Suivi des présences' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enregistrer', exact: true })).toHaveCount(0);

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
