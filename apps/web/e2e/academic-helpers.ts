import { expect, type Page } from './fixtures';
import { completeMfa, type Credentials } from './mfa-helpers';
export type { Credentials } from './mfa-helpers';
export function watch(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const apiErrors: string[] = [];
  page.on('console', (entry) => {
    if (entry.type() === 'error') consoleErrors.push(entry.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.startsWith('/api/') && response.status() >= 400)
      apiErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  return () => {
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(apiErrors).toEqual([]);
  };
}
export async function ready(page: Page) {
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('main')).not.toHaveAttribute('aria-busy', 'true');
  for (const section of await page.locator('[data-academic-ready]').all())
    await expect(section).toHaveAttribute('data-academic-ready', 'true');
}
export async function login(page: Page, credentials: Credentials, mfa: boolean) {
  await page.goto('/fr/login');
  await page.getByLabel('Adresse e-mail', { exact: true }).fill(credentials.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: /Se connecter/ }).click();
  if (mfa) await completeMfa(page, credentials);
  await expect(page).toHaveURL(/\/fr$/);
  await ready(page);
}
export async function overflow(page: Page) {
  expect(
    await page.evaluate(
      () => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  for (const locator of [page.getByRole('dialog'), page.locator('[data-slot="data-table-scroll"]')])
    for (const box of await locator.all()) {
      if (await box.isVisible()) {
        const bounds = await box.boundingBox();
        expect(bounds?.x).toBeGreaterThanOrEqual(-1);
        expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(
          (page.viewportSize()?.width ?? 0) + 1,
        );
      }
    }
}
