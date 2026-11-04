import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { login, overflow, ready, watch, type Credentials } from './academic-helpers';

interface Fixture {
  crud: Credentials;
  locales: Credentials;
  teacher: Credentials;
  classId: string;
  yearId: string;
  teacherName: string;
}
function fixture(viewport: string): Fixture {
  const data = JSON.parse(
    readFileSync(new URL('../../../.local/iam-e2e.json', import.meta.url), 'utf8'),
  ) as { academics: Record<string, Fixture> };
  const found = data.academics[viewport];
  if (!found) throw new Error('Missing academic fixture');
  return found;
}
async function openCreate(page: Page, entity: string) {
  await page.getByRole('button', { name: `Créer · ${entity}`, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}
async function fields(page: Page, data: Record<string, string>) {
  for (const [name, value] of Object.entries(data))
    await page.getByRole('dialog').locator(`input[name="${name}"]`).fill(value);
}
async function save(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await ready(page);
}
async function pick(page: Page, label: string, text: string) {
  const select = page.getByRole('dialog').getByRole('combobox', { name: label, exact: true });
  await expect(select).toBeEnabled();
  const option = select.locator('option').filter({ hasText: text }).first();
  await expect(option).toHaveCount(1);
  const value = await option.getAttribute('value');
  if (!value) throw new Error('Missing academic choice');
  await select.selectOption(value);
}

test('LOT 18.2 guided academic workflow with real teacher assignments on mobile and desktop', async ({
  page,
  browser,
}, info) => {
  test.skip(
    !['360x800', '1440x900'].includes(info.project.name),
    'Full mutation journey certified on mobile and desktop.',
  );
  test.slow();
  const check = watch(page);
  const account = fixture(info.project.name);
  await login(page, account.crud, true);

  if (info.project.name === '1440x900') {
    for (const label of [
      'Années scolaires',
      'Niveaux',
      'Périodes',
      'Classes',
      'Matières',
      'Affectations',
      'Notes & Bulletins',
      'Présences',
    ])
      await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible();
  }

  const code = `L182-${Date.now()}`;

  await page.goto('/fr/academic-years');
  await ready(page);
  await openCreate(page, 'Années scolaires');
  await fields(page, { name: `Année ${code}`, code, startsOn: '2027-09-01', endsOn: '2028-06-30' });
  await save(page);
  const yearRow = page.getByRole('row').filter({ hasText: `Année ${code}` });
  await yearRow.getByRole('button', { name: 'Activer', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(yearRow).toContainText('Actif');

  if (info.project.name === '360x800') {
    await page.getByRole('button', { name: 'Ouvrir la navigation', exact: true }).click();
    await expect(page.locator('[data-shell-year]:visible')).toContainText(`Année ${code}`);
    await page.keyboard.press('Escape');
  } else {
    await expect(page.locator('[data-shell-year]').first()).toContainText(`Année ${code}`);
  }

  await page.goto('/fr/periods');
  await ready(page);
  await page
    .getByRole('combobox', { name: 'Année scolaire', exact: true })
    .selectOption({ label: `Année ${code} · ${code}` });
  await ready(page);
  for (const [ordinal, startsOn, endsOn] of [
    ['1', '2027-09-01', '2028-01-31'],
    ['2', '2028-02-01', '2028-06-30'],
  ] as const) {
    await openCreate(page, 'Périodes');
    await fields(page, {
      name: `Semestre ${ordinal} ${code}`,
      ordinal,
      startsOn,
      endsOn,
    });
    await page
      .getByRole('dialog')
      .getByLabel('Type de période', { exact: true })
      .selectOption('SEMESTER');
    await save(page);
  }
  await expect(page.getByRole('row').filter({ hasText: `Semestre 2 ${code}` })).toBeVisible();

  await page.goto('/fr/levels');
  await ready(page);
  await openCreate(page, 'Niveaux');
  await fields(page, { name: `Niveau ${code}`, code, position: '6' });
  await save(page);

  await page.goto('/fr/classes');
  await ready(page);
  await openCreate(page, 'Classes');
  await fields(page, { name: `Classe ${code}`, code, capacity: '32' });
  await pick(page, 'Année scolaire', `Année ${code}`);
  await pick(page, 'Niveau', `Niveau ${code}`);
  await save(page);
  await page.getByRole('searchbox', { name: 'Rechercher', exact: true }).fill(code);
  await expect(page.getByRole('heading', { name: `Classe ${code}`, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Classe témoin', exact: true })).toHaveCount(0);
  await overflow(page);

  await page.goto('/fr/subjects');
  await ready(page);
  await openCreate(page, 'Matières');
  await fields(page, { name: `Matière ${code}`, code });
  await save(page);
  const subjectRow = page.getByRole('row').filter({ hasText: `Matière ${code}` });
  await subjectRow.getByRole('button', { name: 'Modifier', exact: true }).click();
  await fields(page, { name: `Matière modifiée ${code}` });
  await save(page);
  await expect(page.getByRole('columnheader', { name: /Coefficient/ })).toHaveCount(0);

  await page.goto('/fr/classes');
  await ready(page);
  await page.getByRole('searchbox', { name: 'Rechercher', exact: true }).fill(code);
  await page.getByRole('button', { name: 'Voir le détail' }).click();
  await ready(page);
  await openCreate(page, 'Matières et coefficients');
  await pick(page, 'Matière', `Matière modifiée ${code}`);
  await fields(page, { coefficient: '4.25' });
  await save(page);
  await expect(page.getByRole('row').filter({ hasText: `Matière modifiée ${code}` })).toContainText(
    '4.25',
  );

  await page.getByRole('link', { name: 'Gérer les affectations de cette classe', exact: true }).click();
  await ready(page);
  await expect(page).toHaveURL(/\/fr\/assignments\?classId=/);
  await openCreate(page, 'Affectations');
  await pick(page, 'Matière', `Matière modifiée ${code}`);
  await pick(page, 'Enseignant', account.teacherName);
  await pick(page, 'Période', `Semestre 1 ${code}`);
  await save(page);

  const assignments = page.getByRole('region', { name: 'Affectations', exact: true });
  const assignment = assignments.getByRole('row').filter({ hasText: account.teacherName });
  await assignment.getByRole('button', { name: 'Modifier', exact: true }).click();
  await pick(page, 'Période', `Semestre 2 ${code}`);
  await save(page);
  await expect(assignment).toContainText(`Semestre 2 ${code}`);
  await overflow(page);

  const teacherContext = await browser.newContext({ viewport: page.viewportSize() });
  try {
    const teacherPage = await teacherContext.newPage();
    const teacherCheck = watch(teacherPage);
    await login(teacherPage, account.teacher, false);
    await teacherPage.goto('/fr/assignments');
    await ready(teacherPage);
    await expect(
      teacherPage.getByRole('row').filter({ hasText: `Matière modifiée ${code}` }),
    ).toBeVisible();
    await expect(teacherPage.locator('[data-academic-create]')).toHaveCount(0);
    await expect(teacherPage.getByRole('button', { name: 'Modifier', exact: true })).toHaveCount(0);
    await overflow(teacherPage);
    teacherCheck();
  } finally {
    await teacherContext.close();
  }

  await assignment.getByRole('button', { name: 'Archiver', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await assignments.getByRole('combobox', { name: 'Statut', exact: true }).selectOption('ARCHIVED');
  await expect(assignment).toContainText('Archivé');
  check();
});

test('LOT 18.2 FR EN AR guided routes, keyboard forms and RTL at all widths', async ({
  page,
}, info) => {
  test.slow();
  const check = watch(page);
  const account = fixture(info.project.name);
  await login(page, account.locales, true);

  for (const locale of ['fr', 'en', 'ar']) {
    for (const route of ['academic-years', 'levels', 'classes', 'subjects']) {
      await page.goto(`/${locale}/${route}`);
      await ready(page);
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
      await overflow(page);

      const add = page.locator('[data-academic-create]');
      await add.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('dialog').locator('input[name="name"]')).toBeFocused();
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

    await page.goto(`/${locale}/periods`);
    await ready(page);
    await page.locator('main').getByRole('combobox').first().selectOption(account.yearId);
    await ready(page);
    await page.locator('[data-academic-create]').click();
    await expect(page.getByRole('dialog').locator('input[name="ordinal"]')).toBeVisible();
    await overflow(page);
    await page.keyboard.press('Escape');

    await page.goto(`/${locale}/classes`);
    await ready(page);
    const card = page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByRole('heading', { name: 'Classe témoin', exact: true }) });
    await card.getByRole('button').first().click();
    await ready(page);
    await page.locator('[data-academic-create]').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await overflow(page);
    await page.keyboard.press('Escape');

    await page.goto(`/${locale}/assignments`);
    await ready(page);
    await page.locator('main').getByRole('combobox').first().selectOption(account.classId);
    await ready(page);
    await page.locator('[data-academic-create]').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await overflow(page);
    if (info.project.name === '1440x900')
      expect(
        (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
          .violations,
      ).toEqual([]);
    await page.keyboard.press('Escape');
  }

  check();
});

test('LOT 18.2 teacher reads assigned classes and assignments without academic administration', async ({
  page,
}, info) => {
  const check = watch(page);
  const account = fixture(info.project.name);
  await login(page, account.teacher, false);

  for (const locale of ['fr', 'en', 'ar']) {
    await page.goto(`/${locale}/classes`);
    await ready(page);
    await expect(page.getByRole('heading', { name: 'Classe témoin', exact: true })).toBeVisible();
    await expect(page.locator('[data-academic-create]')).toHaveCount(0);
    await overflow(page);

    await page.goto(`/${locale}/assignments`);
    await ready(page);
    await expect(page.getByRole('row').filter({ hasText: 'Matière témoin' })).toBeVisible();
    await expect(page.locator('[data-academic-create]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Modifier', exact: true })).toHaveCount(0);
    await overflow(page);
  }

  check();

  const csrfResponse = await page.request.get('/api/v1/auth/csrf');
  const csrf = (await csrfResponse.json()) as { csrfToken: string };
  const headers = { Origin: 'http://127.0.0.1:3000', 'X-CSRF-Token': csrf.csrfToken };
  const response = await page.request.post('/api/v1/auth/login', {
    data: account.teacher,
    headers,
  });
  expect(response.status()).toBe(201);
  const auth = (await response.json()) as { accessToken: string };
  const denied = await page.request.post('/api/v1/classes', {
    data: {},
    headers: { ...headers, Authorization: `Bearer ${auth.accessToken}` },
  });
  expect(denied.status()).toBe(403);
});
