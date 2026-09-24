import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from './fixtures';
import { login, overflow, watch, type Credentials } from './academic-helpers';
type Roles = Record<
  'admin' | 'director' | 'academicStaff' | 'accountant' | 'teacher' | 'parent' | 'student',
  Credentials
>;
function fixture(viewport: string): Roles {
  const data = JSON.parse(
    readFileSync(new URL('../../../.local/iam-e2e.json', import.meta.url), 'utf8'),
  ) as { reporting: Record<string, Roles> };
  const value = data.reporting[viewport];
  if (!value) throw new Error('Missing reporting fixture');
  return value;
}
async function reset(page: Page, credentials: Credentials) {
  await page.context().clearCookies();
  await login(page, credentials, true);
}
test('LOT 12 real dashboards and reports are responsive, localized and accessible', async ({
  page,
}, info) => {
  test.slow();
  const check = watch(page),
    data = fixture(info.project.name),
    locales = ['fr', 'en', 'ar'] as const,
    locale = locales[info.project.name.length % 3] ?? 'fr';
  await reset(page, data.admin);
  await page.goto(`/${locale}`);
  await expect(page.locator('[data-dashboard-ready]')).toHaveAttribute(
    'data-dashboard-ready',
    'true',
    { timeout: 30_000 },
  );
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  await overflow(page);
  await page.goto(`/${locale}/reports`);
  await expect(page.locator('[data-reports-ready]')).toHaveAttribute('data-reports-ready', 'true', {
    timeout: 30_000,
  });
  await expect(page.getByRole('table')).toBeVisible();
  await overflow(page);
  if (info.project.name === '1440x900')
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  check();
});
test('LOT 12 role dashboards and scoped report previews load without client regressions', async ({
  page,
}, info) => {
  test.skip(info.project.name !== '1440x900', 'Role matrix certified once.');
  test.slow();
  const check = watch(page),
    data = fixture(info.project.name);
  for (const [role, credentials] of Object.entries(data)) {
    await reset(page, credentials);
    await page.goto('/fr');
    await expect(page.locator('[data-dashboard-ready]')).toHaveAttribute(
      'data-dashboard-ready',
      'true',
      { timeout: 30_000 },
    );
    await page.goto('/fr/reports');
    await expect(page.locator('[data-reports-ready]')).toHaveAttribute(
      'data-reports-ready',
      'true',
      { timeout: 30_000 },
    );
    await expect(page.getByText('Vous n’avez pas accès')).toHaveCount(0);
    await overflow(page);
    expect(role).toBeTruthy();
  }
  check();
});
test('LOT 12 admin requests, completes and securely downloads a real export', async ({
  page,
}, info) => {
  test.skip(info.project.name !== '1440x900', 'Durable export journey is certified once.');
  test.slow();
  const check = watch(page),
    data = fixture(info.project.name);
  await reset(page, data.admin);
  await page.goto('/fr');
  const enrollmentCard = page.getByText('Inscriptions actives').locator('../..'),
    initialEnrollmentValue = await enrollmentCard.textContent();
  const dashboardResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/dashboard/summary?academicYearId=') && response.ok(),
  );
  await page.getByLabel('Année scolaire', { exact: true }).selectOption({ label: 'Année témoin' });
  await dashboardResponse;
  await expect(enrollmentCard).not.toHaveText(initialEnrollmentValue ?? '');
  const periodResponse = page.waitForResponse(
    (response) => response.url().includes('periodId=') && response.ok(),
  );
  await page.getByLabel('Période scolaire').selectOption({ label: 'Trimestre témoin' });
  await periodResponse;
  await page.goto('/fr/reports');
  await expect(page.locator('[data-reports-ready]')).toHaveAttribute('data-reports-ready', 'true', {
    timeout: 30_000,
  });
  await page.getByLabel('Type de rapport').selectOption('STUDENTS');
  await page.getByLabel('Format').selectOption('CSV');
  await page.getByRole('button', { name: 'Générer un rapport' }).click();
  const ready = page.getByText('Prêt', { exact: true }).first();
  await expect(ready).toBeVisible({ timeout: 45_000 });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Télécharger' }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^gestschool-students-.+\.csv$/);
  await overflow(page);
  check();
});
