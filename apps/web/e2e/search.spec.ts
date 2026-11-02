import { readFileSync } from 'node:fs';

import { login, overflow, ready, type Credentials, watch } from './academic-helpers';
import { expect, test, type Page } from './fixtures';

interface Fixtures {
  people: Record<string, { crud: Credentials; locales: Credentials }>;
}

function fixtures(): Fixtures {
  return JSON.parse(
    readFileSync(new URL('../../../.local/iam-e2e.json', import.meta.url), 'utf8'),
  ) as Fixtures;
}

async function createTeacher(page: Page, firstName: string, lastName: string) {
  await page.goto('/fr/teachers');
  await ready(page);
  await page.getByRole('button', { name: 'Ajouter un enseignant', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Prénom', { exact: true }).fill(firstName);
  await dialog.getByLabel('Nom', { exact: true }).fill(lastName);
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(dialog).toBeHidden();
}

test('LOT17.7 global search returns real permitted data and navigates with the filter', async ({
  page,
}, info) => {
  test.skip(info.project.name !== '1440x900', 'Real global search flow certified once on desktop.');
  const account = fixtures().people[info.project.name];
  if (!account) throw new Error('Missing global search fixture');
  const verifyNoErrors = watch(page);

  await login(page, account.crud, true);
  const suffix = `Search-${Date.now()}`;
  const title = `Recherche ${suffix}`;
  await createTeacher(page, 'Recherche', suffix);

  await page.goto('/fr');
  await ready(page);
  await page.keyboard.press('Control+K');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const input = dialog.locator('[data-global-search-input]');
  await expect(input).toBeFocused();

  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/search' &&
      response.request().method() === 'GET',
  );
  await input.fill(suffix);
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    items: Array<{ kind: string; title: string; resourcePath: string }>;
  };
  expect(body.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'teacher',
        title,
        resourcePath: expect.stringContaining('/teachers?search='),
      }),
    ]),
  );

  await expect(dialog.getByRole('option').filter({ hasText: title })).toBeVisible();
  await input.press('Enter');
  await expect(page).toHaveURL(/\/fr\/teachers\?search=/);

  const pageSearch = page
    .getByRole('main')
    .getByRole('searchbox', { name: 'Rechercher', exact: true });
  await expect(pageSearch).toHaveValue(title);
  await expect(page.getByRole('row').filter({ hasText: title })).toBeVisible();
  verifyNoErrors();
});

test('LOT17.7 global search dialog stays usable on mobile in FR EN AR', async ({ page }, info) => {
  test.skip(info.project.name !== '360x800', 'Mobile search dialog certified once.');
  const account = fixtures().people[info.project.name];
  if (!account) throw new Error('Missing mobile global search fixture');
  const verifyNoErrors = watch(page);

  await login(page, account.locales, true);
  for (const [locale, hint] of [
    ['fr', 'Saisissez au moins 2 caractères.'],
    ['en', 'Enter at least 2 characters.'],
    ['ar', 'أدخل حرفين على الأقل.'],
  ] as const) {
    await page.goto(`/${locale}`);
    await ready(page);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await page.keyboard.press('Control+K');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('[data-global-search-input]').fill('a');
    await expect(dialog.getByText(hint, { exact: true })).toBeVisible();
    await overflow(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  }

  verifyNoErrors();
});
