import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { login, watch, type Credentials } from './academic-helpers';
import { expect, test } from './fixtures';

interface Fixtures {
  people: Record<
    string,
    {
      crud: Credentials;
      denied: Credentials;
    }
  >;
}

function fixtures(): Fixtures {
  return JSON.parse(
    readFileSync(new URL('../../../.local/iam-e2e.json', import.meta.url), 'utf8'),
  ) as Fixtures;
}

test('LOT17.4 renders a real tenant audit event with bounded filters', async ({ page }, info) => {
  test.skip(info.project.name !== '1440x900', 'Audit journey certified once.');
  const account = fixtures().people[info.project.name];
  if (!account) throw new Error('Missing audit fixture');
  const verifyNoErrors = watch(page);

  await login(page, account.crud, true);
  await page.goto('/fr/settings');
  await expect(page.locator('[data-settings-ready]')).toHaveAttribute(
    'data-settings-ready',
    'true',
  );

  const address = page.getByLabel('Adresse', { exact: true });
  const originalAddress = await address.inputValue();
  const marker = `Audit E2E ${Date.now()}`;
  await address.fill(marker);
  const saveResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/settings' &&
      response.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: 'Enregistrer les modifications' }).click();
  expect((await saveResponse).status()).toBe(200);

  const initialAudit = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/audit' &&
      response.request().method() === 'GET',
  );
  await page.goto('/fr/audit');
  expect((await initialAudit).status()).toBe(200);
  await expect(page.locator('[data-audit-ready]')).toHaveAttribute('data-audit-ready', 'true');

  const actionResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === '/api/v1/audit' &&
      url.searchParams.get('action') === 'settings.tenant.updated'
    );
  });
  await page.getByLabel('Action', { exact: true }).fill('settings.tenant.updated');
  const filteredResponse = await actionResponse;
  expect(filteredResponse.status()).toBe(200);
  const body = (await filteredResponse.json()) as {
    items: Array<Record<string, unknown>>;
  };
  expect(body.items.length).toBeGreaterThan(0);
  expect(body.items[0]).not.toHaveProperty('metadata');

  await page.getByLabel('Entité', { exact: true }).fill('tenant');
  await page.getByLabel('Du', { exact: true }).fill('2000-01-01');
  await page.getByLabel('Au', { exact: true }).fill('2099-12-31');
  await expect(page.locator('[data-audit-ready]')).toHaveAttribute('data-audit-ready', 'true');

  const row = page.getByRole('row').filter({ hasText: 'settings.tenant.updated' }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText('Utilisateur E2E');
  await expect(row).toContainText('tenant');

  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);

  await page.getByRole('button', { name: 'Effacer', exact: true }).click();

  await page.goto('/fr/settings');
  await expect(page.locator('[data-settings-ready]')).toHaveAttribute(
    'data-settings-ready',
    'true',
  );
  await page.getByLabel('Adresse', { exact: true }).fill(originalAddress);
  const restoreResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/settings' &&
      response.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: 'Enregistrer les modifications' }).click();
  expect((await restoreResponse).status()).toBe(200);
  verifyNoErrors();
});

test('LOT17.4 denies the audit log to a student role', async ({ page }, info) => {
  test.skip(info.project.name !== '1440x900', 'Audit denial certified once.');
  const account = fixtures().people[info.project.name];
  if (!account) throw new Error('Missing audit fixture');

  await login(page, account.denied, false);
  await page.goto('/fr/audit');
  await expect(
    page.getByRole('alert').filter({
      hasText: 'Vous n’avez pas accès au journal d’audit.',
    }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Audit', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-audit-ready]')).toHaveCount(0);
});
