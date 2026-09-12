import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from './fixtures';
import { readFileSync } from 'node:fs';
import { login, type Credentials } from './academic-helpers';
interface Fixtures {
  studentId: string;
  people: Record<string, { crud: Credentials; locales: Credentials; denied: Credentials }>;
}
function fixtures(): Fixtures {
  return JSON.parse(
    readFileSync(new URL('../../../.local/iam-e2e.json', import.meta.url), 'utf8'),
  ) as Fixtures;
}
function watch(page: Page) {
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
async function ready(page: Page) {
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('main')).not.toHaveAttribute('aria-busy', 'true');
  if (await page.locator('[data-people-ready]').count())
    await expect(page.locator('[data-people-ready]')).toHaveAttribute('data-people-ready', 'true');
}
async function overflow(page: Page) {
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
async function create(page: Page, route: string, add: string, firstName: string, lastName: string) {
  await page.goto(`/fr/${route}`);
  await ready(page);
  await page.getByRole('button', { name: add, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Prénom', { exact: true }).fill(firstName);
  await dialog.getByLabel('Nom', { exact: true }).fill(lastName);
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page
    .getByRole('main')
    .getByRole('searchbox', { name: 'Rechercher', exact: true })
    .fill(lastName);
  await expect(page.getByRole('row').filter({ hasText: `${firstName} ${lastName}` })).toBeVisible();
}

test('LOT 5 real CRUD, relationships and archive restore on mobile and desktop', async ({
  page,
}, info) => {
  test.skip(
    !['360x800', '1440x900'].includes(info.project.name),
    'Complete mutation flow certified at mobile and desktop widths.',
  );
  test.slow();
  const check = watch(page);
  const account = fixtures().people[info.project.name];
  if (!account) throw new Error('Missing fixture');
  await login(page, account.crud, true);
  const suffix = `E2E-${info.project.name}-${Date.now()}`;
  await create(page, 'students', 'Ajouter un élève', 'Élève', suffix);
  let row = page.getByRole('row').filter({ hasText: `Élève ${suffix}` });
  await row.getByRole('button', { name: 'Modifier', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Prénom', { exact: true }).fill('Élève Modifié');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  row = page.getByRole('row').filter({ hasText: `Élève Modifié ${suffix}` });
  await row.getByRole('link').click();
  await ready(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Élève Modifié ${suffix}`);
  const studentPath = new URL(page.url()).pathname;
  await overflow(page);
  await page.getByRole('link', { name: 'Retour aux élèves', exact: true }).click();
  // ready() alone can still see the profile's data-people-ready while Next is navigating.
  await expect(page).toHaveURL(/\/fr\/students$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Élèves', exact: true })).toBeVisible();
  await ready(page);
  await page
    .getByRole('main')
    .getByRole('searchbox', { name: 'Rechercher', exact: true })
    .fill(suffix);
  row = page.getByRole('row').filter({ hasText: suffix });
  await row.getByRole('button', { name: 'Archiver', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(row).toHaveCount(0);
  await page.getByLabel('Statut', { exact: true }).selectOption('ARCHIVED');
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Restaurer' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByLabel('Statut', { exact: true }).selectOption('ACTIVE');
  await expect(row).toBeVisible();

  await create(page, 'parents', 'Ajouter un parent', 'Parent', suffix);
  row = page.getByRole('row').filter({ hasText: suffix });
  await row.getByRole('button', { name: 'Enfants', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('searchbox', { name: 'Rechercher une fiche à associer', exact: true })
    .fill(suffix);
  await expect(dialog.getByLabel('Choisir une fiche').locator('option')).toHaveCount(2);
  await dialog.getByLabel('Choisir une fiche').selectOption({ index: 1 });
  await dialog.getByLabel('Lien de parenté', { exact: true }).fill('Responsable légal');
  await dialog.getByLabel('Contact financier', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Associer', exact: true }).click();
  await expect(dialog.getByRole('link', { name: `Élève Modifié ${suffix}` })).toBeVisible();
  await overflow(page);
  await expect(dialog.getByText('Contact financier', { exact: false }).first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click();
  await page.goto(studentPath);
  await ready(page);
  await expect(page.getByText(`Parent ${suffix}`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dissocier', exact: true }).click();
  await expect(page.getByText(`Parent ${suffix}`, { exact: true })).toBeHidden();

  await create(page, 'teachers', 'Ajouter un enseignant', 'Enseignant', suffix);
  row = page.getByRole('row').filter({ hasText: suffix });
  await row.getByRole('button', { name: 'Modifier', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Prénom', { exact: true }).fill('Professeur');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('row').filter({ hasText: `Professeur ${suffix}` })).toBeVisible();
  await overflow(page);
  check();
});

test('LOT 5 FR EN AR forms, keyboard, focus, tables and accessibility at all certified widths', async ({
  page,
}, info) => {
  test.slow();
  const check = watch(page);
  const account = fixtures().people[info.project.name];
  if (!account) throw new Error('Missing fixture');
  await login(page, account.locales, true);
  for (const locale of ['fr', 'en', 'ar']) {
    for (const route of ['students', 'parents', 'teachers']) {
      await page.goto(`/${locale}/${route}`);
      await ready(page);
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
      await expect(page.getByRole('table')).toBeVisible();
      await overflow(page);
      const add = page.locator('[data-person-focus]');
      await add.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog')).toBeVisible();
      const first = page.getByRole('dialog').locator('input[name="firstName"]');
      await expect(first).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('dialog').locator('input[name="lastName"]')).toBeFocused();
      await overflow(page);
      if (info.project.name === '1440x900')
        expect(
          (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
            .violations,
        ).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(add).toBeFocused();
    }
    await page.goto(`/${locale}/students/${fixtures().studentId}`);
    await ready(page);
    await overflow(page);
  }
  check();
});

test('LOT 5 permission denial is translated and no administrative controls leak', async ({
  page,
}, info) => {
  test.skip(
    !['360x800', '1440x900'].includes(info.project.name),
    'Read-only denial checked on mobile and desktop.',
  );
  const check = watch(page);
  const account = fixtures().people[info.project.name];
  if (!account) throw new Error('Missing fixture');
  await login(page, account.denied, false);
  for (const [locale, message] of [
    ['fr', 'Vous n’avez pas la permission'],
    ['en', 'You do not have permission'],
    ['ar', 'ليس لديك إذن'],
  ] as const) {
    await page.goto(`/${locale}/teachers`);
    await ready(page);
    await expect(page.getByRole('status').filter({ hasText: message })).toBeVisible();
    await expect(page.locator('[data-person-focus]')).toHaveCount(0);
    await overflow(page);
  }
  check();
  // Intentional negative HTTP assertion outside browser rendering/error counters.
  const response = await page.request.get('/api/v1/teachers');
  expect(response.status()).toBe(401);
});
