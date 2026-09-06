import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';

// Independent RFC 6238 calculation for the browser enrollment check.
function totp(secret: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret]
    .map((character) => alphabet.indexOf(character).toString(2).padStart(5, '0'))
    .join('');
  const key = Buffer.from(bits.match(/.{8}/g)?.map((byte) => Number.parseInt(byte, 2)) ?? []);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}
test('requires MFA before entering the portal and revokes the session on logout', async ({
  page,
}, info) => {
  test.skip(info.project.name !== '1440x900', 'MFA flow certified once.');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const fixture = JSON.parse(
    readFileSync(new URL('../../../.local/iam-e2e.json', import.meta.url), 'utf8'),
  ) as { mfa: { email: string; password: string } };
  await page.goto('/fr/login');
  await page.getByLabel('Adresse e-mail', { exact: true }).fill(fixture.mfa.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(fixture.mfa.password);
  await page.getByRole('button', { name: /Se connecter/ }).click();
  await expect(page.getByRole('heading', { name: 'Vérification en deux étapes' })).toBeVisible();
  const secret = await page.getByTestId('mfa-secret').textContent();
  if (!secret) throw new Error('Missing enrollment key');
  await page.getByLabel('Code à six chiffres').fill(totp(secret));
  await page.getByRole('button', { name: 'Vérifier', exact: true }).click();
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
