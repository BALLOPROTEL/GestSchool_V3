import { expect, type Page } from './fixtures';
import { createHmac } from 'node:crypto';
export interface Credentials {
  email: string;
  password: string;
}
function totp(secret: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret]
    .map((letter) => alphabet.indexOf(letter).toString(2).padStart(5, '0'))
    .join('');
  const key = Buffer.from(bits.match(/.{8}/g)?.map((byte) => Number.parseInt(byte, 2)) ?? []);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}
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
  if (mfa) {
    await expect(page.getByTestId('mfa-secret')).toBeVisible();
    const secret = await page.getByTestId('mfa-secret').textContent();
    if (!secret) throw new Error('Missing MFA enrollment secret');
    await page.getByLabel('Code à six chiffres').fill(totp(secret));
    await page.getByRole('button', { name: 'Vérifier', exact: true }).click();
  }
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
