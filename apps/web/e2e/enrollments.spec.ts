import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { login, overflow, watch, type Credentials } from './academic-helpers';

interface Fixture {
  crud: Credentials;
  locales: Credentials;
  student: Credentials;
  parent: Credentials;
  denied: Credentials;
  yearId: string;
  classId: string;
  targetClassId: string;
  fullClassId: string;
  studentId: string;
  ownStudentId: string;
  otherStudentId: string;
  ownEnrollmentId: string;
  otherEnrollmentId: string;
  eligibleStudentId: string;
}
function fixture(viewport: string): Fixture {
  const data = JSON.parse(
    readFileSync(new URL('../../../.local/iam-e2e.json', import.meta.url), 'utf8'),
  ) as { enrollments: Record<string, Fixture> };
  const found = data.enrollments[viewport];
  if (!found) throw new Error('Missing enrollment fixture');
  return found;
}
async function ready(page: Page) {
  await expect(page.locator('[data-enrollment-ready]').first()).toHaveAttribute(
    'data-enrollment-ready',
    'true',
  );
  for (const section of await page.locator('[data-enrollment-ready]').all())
    await expect(section).toHaveAttribute('data-enrollment-ready', 'true');
}
async function pick(page: Page, label: string, value: string) {
  const select = page.getByRole('dialog').getByRole('combobox', { name: label, exact: true });
  await expect(select).toBeEnabled();
  await expect(select.locator(`option[value="${value}"]`)).toHaveCount(1);
  await select.selectOption(value);
}
async function wizard(page: Page, data: Fixture, studentId = data.studentId, type = 'NEW') {
  await page.locator('[data-enrollment-create]').click();
  await page
    .getByRole('dialog')
    .getByRole('searchbox')
    .fill(
      studentId === data.studentId
        ? 'Candidat'
        : studentId === data.eligibleStudentId
          ? 'Réinscriptible'
          : 'Lié',
    );
  await pick(page, 'Élève', studentId);
  await pick(page, 'Type d’inscription', type);
  await page.getByRole('dialog').getByRole('button', { name: 'Continuer', exact: true }).click();
  await pick(page, 'Année scolaire', data.yearId);
  await pick(page, 'Classe', data.classId);
  await expect(
    page.getByRole('dialog').getByText('Places disponibles', { exact: true }),
  ).toBeVisible();
}
async function savePending(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Continuer', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Enregistrer en attente', exact: true })
    .click();
}
async function confirmDialog(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await ready(page);
}
test('LOT 7 real new and re-enrollment, full capacity, duplicate, transfer, cancellation and profile', async ({
  page,
}, info) => {
  test.skip(
    !['360x800', '1440x900'].includes(info.project.name),
    'Mutation journey on mobile and desktop; localization and scopes at every width.',
  );
  test.slow();
  const data = fixture(info.project.name);
  const check = watch(page);
  await login(page, data.crud, true);
  await page.goto('/fr/enrollments');
  await ready(page);
  await wizard(page, data);
  await pick(page, 'Classe', data.fullClassId);
  await expect(
    page
      .getByRole('dialog')
      .getByText('Cette classe est complète : aucune place supplémentaire disponible.'),
  ).toBeVisible();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Continuer', exact: true }),
  ).toBeDisabled();
  await overflow(page);
  await pick(page, 'Classe', data.classId);
  await savePending(page);
  await expect(page.getByRole('dialog')).toBeHidden();
  const row = page.getByRole('row').filter({ hasText: 'ENR-NEW' });
  await expect(row).toContainText('En attente');
  await row.getByRole('button', { name: 'Confirmer l’inscription', exact: true }).click();
  await confirmDialog(page);
  await expect(row).toContainText('Active');
  await expect(row.getByRole('button', { name: 'Modifier l’inscription' })).toHaveCount(0);

  // Deliberate negative UI case isolated from the zero-error happy-path page.
  const negative = await page.context().newPage();
  try {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const responses: string[] = [];
    negative.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    negative.on('pageerror', (error) => pageErrors.push(error.message));
    negative.on('response', (response) => {
      if (new URL(response.url()).pathname.startsWith('/api/') && response.status() >= 400)
        responses.push(`${response.status()} ${new URL(response.url()).pathname}`);
    });
    await negative.goto('/fr/enrollments');
    await ready(negative);
    await wizard(negative, data);
    await savePending(negative);
    await expect(negative.getByRole('alert')).toContainText(
      'Cet élève possède déjà une inscription',
    );
    await overflow(negative);
    expect(responses).toEqual(['409 /api/v1/enrollments']);
    expect(pageErrors).toEqual([]);
    expect(
      consoleErrors.filter(
        (message) =>
          !message.startsWith(
            'Failed to load resource: the server responded with a status of 409 ',
          ),
      ),
    ).toEqual([]);
    expect(consoleErrors.length).toBeLessThanOrEqual(1);
  } finally {
    await negative.close();
  }

  await row.getByRole('button', { name: 'Transférer de classe', exact: true }).click();
  await pick(page, 'Classe', data.targetClassId);
  await page.getByRole('dialog').getByLabel('Date d’effet', { exact: true }).fill('2026-09-03');
  await page
    .getByRole('dialog')
    .getByLabel('Motif', { exact: true })
    .fill('Transfert de certification navigateur');
  await confirmDialog(page);
  await expect(row).toContainText('Classe Bêta');
  await row.getByRole('button', { name: 'Historique des inscriptions', exact: true }).click();
  await ready(page);
  await expect(page.locator('[data-enrollment-history]')).toContainText(
    'Classe Alpha → Classe Bêta',
  );
  await expect(page.locator('[data-enrollment-history]')).toContainText(
    'Transfert de certification navigateur',
  );
  await expect(page.locator('[data-enrollment-history]')).toContainText('2026-09-03');
  await overflow(page);
  await page.keyboard.press('Escape');
  await row.getByRole('button', { name: 'Annuler l’inscription', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Date d’effet', { exact: true }).fill('2026-09-04');
  await page
    .getByRole('dialog')
    .getByLabel('Motif', { exact: true })
    .fill('Annulation de certification navigateur');
  await confirmDialog(page);
  await expect(row).toContainText('Annulée');
  await expect(row.getByRole('button')).toHaveCount(1);
  await wizard(page, data, data.eligibleStudentId, 'RE_ENROLLMENT');
  await savePending(page);
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(
    page.getByRole('row').filter({ hasText: 'ENR-RE' }).filter({ hasText: 'Année inscriptions' }),
  ).toContainText('Réinscription');
  await page.goto(`/fr/students/${data.studentId}`);
  await page.getByRole('tab', { name: 'Historique des inscriptions', exact: true }).click();
  await ready(page);
  await expect(page.getByRole('row').filter({ hasText: 'ENR-NEW' })).toContainText('Annulée');
  await page.getByRole('button', { name: 'Historique des inscriptions', exact: true }).click();
  await ready(page);
  await expect(page.locator('[data-enrollment-history]')).toContainText('Inscription annulée');
  await overflow(page);
  check();
});

test('LOT 7 FR EN AR wizard steps, dialogs, keyboard, labels and RTL at all widths', async ({
  page,
}, info) => {
  test.slow();
  const data = fixture(info.project.name);
  const check = watch(page);
  await login(page, data.locales, true);
  for (const locale of ['fr', 'en', 'ar']) {
    await page.goto(`/${locale}/enrollments`);
    await ready(page);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await overflow(page);
    const add = page.locator('[data-enrollment-create]');
    await add.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('searchbox')).toBeFocused();
    await expect(dialog.getByRole('combobox').first()).toBeEnabled();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('combobox').first()).toBeFocused();
    await dialog.getByRole('combobox').first().selectOption(data.studentId);
    await expect(dialog.locator('button[type="submit"]')).toBeEnabled();
    await dialog.locator('button[type="submit"]').click();
    await expect(dialog.getByRole('heading', { level: 3 })).toBeFocused();
    await dialog.getByRole('combobox').nth(0).selectOption(data.yearId);
    await expect(dialog.getByRole('combobox').nth(2)).toBeEnabled();
    await dialog.getByRole('combobox').nth(2).selectOption(data.classId);
    await expect(dialog.locator('button[type="submit"]')).toBeEnabled();
    await overflow(page);
    if (locale === 'ar' && ['360x800', '1440x900'].includes(info.project.name))
      await page.screenshot({ path: info.outputPath('lot7-wizard-ar.png') });
    if (info.project.name === '1440x900')
      expect(
        (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
          .violations,
      ).toEqual([]);
    await dialog.locator('button[type="submit"]').click();
    await expect(dialog.locator('dl')).toContainText('Classe Alpha');
    await overflow(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(add).toBeFocused();
    const owned = page.getByRole('row').filter({ hasText: 'ENR-OWN' });
    await owned.getByRole('button').first().click();
    await ready(page);
    await expect(page.locator('[data-enrollment-history]')).toContainText(
      'Classe Alpha → Classe Bêta',
    );
    await overflow(page);
    await page.keyboard.press('Escape');
    // Transfer dialog retains date/reason labels and keyboard focus in every locale.
    await owned.getByRole('button').nth(1).click();
    await expect(dialog.locator('textarea')).toBeVisible();
    await expect(dialog.locator('input[type="date"]')).toHaveAccessibleName(/.+/);
    await expect(dialog.locator('textarea')).toHaveAccessibleName(/.+/);
    await overflow(page);
    await page.keyboard.press('Escape');
  }
  check();
});

test('LOT 7 real parent CHILDREN, student OWN and denied administration at all widths', async ({
  page,
}, info) => {
  test.slow();
  const data = fixture(info.project.name);
  for (const code of ['parent', 'student', 'denied'] as const) {
    const context = await page.context().browser()!.newContext({ viewport: page.viewportSize() });
    try {
      const scoped = await context.newPage();
      const check = watch(scoped);
      const authentication = scoped.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/v1/auth/login' &&
          response.request().method() === 'POST',
      );
      await login(scoped, data[code], false);
      const auth = (await (await authentication).json()) as { accessToken: string };
      const headers = { Authorization: `Bearer ${auth.accessToken}` };
      await scoped.goto('/fr/enrollments');
      await ready(scoped);
      await expect(scoped.locator('[data-enrollment-create]')).toHaveCount(0);
      if (code === 'denied') {
        await expect(scoped.getByText('Vous n’avez pas accès à ces inscriptions.')).toBeVisible();
        expect((await scoped.request.get('/api/v1/enrollments', { headers })).status()).toBe(403);
      } else {
        await expect(scoped.getByRole('row').filter({ hasText: 'ENR-OWN' })).toBeVisible();
        await expect(scoped.getByRole('row').filter({ hasText: 'ENR-OTHER' })).toHaveCount(0);
        await expect(scoped.getByRole('button', { name: 'Confirmer l’inscription' })).toHaveCount(
          0,
        );
        expect(
          (
            await scoped.request.get(`/api/v1/enrollments/${data.otherEnrollmentId}`, { headers })
          ).status(),
        ).toBe(404);
        expect(
          (
            await scoped.request.get(`/api/v1/students/${data.otherStudentId}/enrollments`, {
              headers,
            })
          ).status(),
        ).toBe(404);
        await scoped
          .getByRole('button', { name: 'Historique des inscriptions', exact: true })
          .click();
        await ready(scoped);
        await expect(scoped.locator('[data-enrollment-history]')).toContainText(
          'Classe Alpha → Classe Bêta',
        );
      }
      await overflow(scoped);
      check();
    } finally {
      await context.close();
    }
  }
});
