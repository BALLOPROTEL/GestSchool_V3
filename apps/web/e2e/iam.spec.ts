import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures';

test('allows sign-in without MFA until the user opts in and revokes the session on logout', async ({
  page,
}, info) => {
  test.skip(info.project.name !== '1440x900', 'Optional MFA flow certified once.');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const fixture = JSON.parse(
    readFileSync(new URL('../../../.local/iam-e2e.json', import.meta.url), 'utf8'),
  ) as { mfa: { email: string; password: string } };
  await page.goto('/fr/login');
  await page.getByLabel('E-mail ou identifiant', { exact: true }).fill(fixture.mfa.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(fixture.mfa.password);
  await page.getByRole('button', { name: /Se connecter/ }).click();
  await expect(page).toHaveURL(/\/fr$/);
  await expect(page.locator('main')).toBeVisible();
  await page.getByRole('button', { name: /Utilisateur E2E/ }).click();
  await page.getByRole('menuitem', { name: 'Se déconnecter', exact: true }).click();
  await expect(page).toHaveURL(/\/fr\/login$/);
  await page.goto('/fr/students');
  await expect(page).toHaveURL(/\/fr\/login$/);
  expect(errors.length).toBe(0);
  const storage = await page.evaluate(() => ({
    local: Object.values(localStorage),
    session: Object.values(sessionStorage),
    cookie: document.cookie,
  }));
  expect(JSON.stringify(storage).includes('accessToken')).toBe(false);
  expect(storage.cookie.includes('gs_refresh')).toBe(false);
});

test('renders localized authentication forms and password recovery in FR EN AR', async ({
  page,
}, info) => {
  test.skip(info.project.name !== '1366x768', 'Auth localisation certified once.');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  for (const locale of ['fr', 'en', 'ar']) {
    for (const route of ['login', 'forgot-password', 'activation', 'reset-password']) {
      await page.goto(`/${locale}/${route}`);
      await expect(page.getByRole('heading').last()).toBeVisible();
      expect(await page.locator('html').getAttribute('dir')).toBe(locale === 'ar' ? 'rtl' : 'ltr');
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      ).toBeLessThanOrEqual(1);
    }
  }
  expect(errors.length).toBe(0);
});
