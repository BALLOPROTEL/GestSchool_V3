import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { AssessmentView } from '@gestschool/contracts';
import { expect, test, type Page } from './fixtures';
import { login, overflow, watch, type Credentials } from './academic-helpers';
interface ResultFixture {
  teacher: Credentials;
  director: Credentials;
  parent: Credentials;
  student: Credentials;
  accountant: Credentials;
  yearId: string;
  classId: string;
  classSubjectId: string;
  periodId: string;
  workingPeriodId: string;
  assessedOn: string;
  ownStudentId: string;
  studentIds: string[];
  publishedId: string;
  draftId: string;
  submittedId: string;
  reportIds: string[];
}
function fixture(name: string): ResultFixture {
  const data = JSON.parse(
    readFileSync(new URL('../../../.local/iam-e2e.json', import.meta.url), 'utf8'),
  ) as { results: Record<string, ResultFixture> };
  const value = data.results[name];
  if (!value) throw new Error('Missing Results fixture');
  return value;
}
async function ready(page: Page) {
  await expect(page.locator('[data-results-ready]').first()).toHaveAttribute(
    'data-results-ready',
    'true',
    { timeout: 30000 },
  );
}
async function context(page: Page, data: ResultFixture, period = data.workingPeriodId) {
  for (const [label, value] of [
    ['Année scolaire', data.yearId],
    ['Période', period],
    ['Classe', data.classId],
  ]) {
    if (!label || !value) throw new Error('Missing academic context');
    const field = page.getByRole('combobox', { name: label, exact: true });
    await expect(field).toBeEnabled();
    await expect(field.locator(`option[value="${value}"]`)).toHaveCount(1);
    await field.selectOption(value);
    await ready(page);
  }
}
async function open(page: Page, id: string) {
  // Rows are selected by the actual assessment ID, never a global mock/student order.
  const response = page.waitForResponse(
    (r) => new URL(r.url()).pathname === `/api/v1/assessments/${id}/grades`,
  );
  const button = page.locator(`button[data-assessment-open="${id}"]`);
  await button.click();
  expect((await response).ok()).toBe(true);
  await expect(page.locator(`[data-grade-sheet="${id}"]`)).toBeVisible();
}
async function transition(page: Page, name: string, id: string, verb: string) {
  await page.locator('[data-grade-sheet]').getByRole('button', { name, exact: true }).click();
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === `/api/v1/assessments/${id}/${verb}` &&
      r.request().method() === 'POST',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmer', exact: true }).click();
  expect((await response).ok()).toBe(true);
  await expect(page.getByRole('dialog')).toBeHidden();
  await ready(page);
  await expect(page.locator(`[data-grade-sheet="${id}"]`)).toBeVisible();
}
async function fillAndSave(page: Page, data: ResultFixture, id: string, maximum = 20) {
  for (const studentId of data.studentIds) {
    const score = page.locator(`[data-grade-student="${studentId}"] input[data-grade-score]`);
    await score.fill(String(((studentId === data.ownStudentId ? 12 : 14) * maximum) / 20));
    await score.press('Enter');
  }
  await expect(page.getByText('Modifications non enregistrées', { exact: true })).toBeVisible();
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === `/api/v1/assessments/${id}/grades` &&
      r.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Enregistrer le brouillon', exact: true }).click();
  expect((await response).ok()).toBe(true);
  await ready(page);
  await expect(page.getByText('Enregistré', { exact: true })).toBeVisible();
}
test('LOT 9 teacher entry, independent validation, period publication, correction and locks', async ({
  page,
  browser,
}, info) => {
  test.skip(
    !['360x800', '1440x900'].includes(info.project.name),
    'Full mutation workflow on mobile and desktop; seven-width localization and access tests below.',
  );
  test.slow();
  const data = fixture(`workflow-${info.project.name}`),
    checkTeacher = watch(page);
  await login(page, data.teacher, false);
  await page.goto('/fr/grades');
  await ready(page);
  await context(page, data);
  const classes = page.getByRole('combobox', { name: 'Classe', exact: true });
  await expect(classes.locator('option')).toHaveCount(2);
  await page.getByRole('button', { name: 'Créer une évaluation', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('combobox', { name: 'Matière', exact: true })
    .selectOption(data.classSubjectId);
  await expect(
    dialog.getByRole('combobox', { name: 'Matière', exact: true }).locator('option'),
  ).toHaveCount(2);
  await dialog
    .getByLabel('Nom de l’évaluation', { exact: true })
    .fill('Évaluation saisie au clavier');
  await dialog.getByLabel('Date', { exact: true }).fill(data.assessedOn);
  const created = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/v1/assessments' && r.request().method() === 'POST',
  );
  await expect(dialog.getByRole('button', { name: 'Enregistrer', exact: true })).toHaveAttribute(
    'type',
    'submit',
  );
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const assessment = (await response.json()) as AssessmentView;
  await expect(dialog).toBeHidden();
  await ready(page);
  await expect(page.locator(`[data-grade-sheet="${assessment.id}"]`)).toBeVisible();
  const firstScore = page.locator('input[data-grade-score]').first();
  await firstScore.fill('21');
  await expect(firstScore).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeDisabled();
  await fillAndSave(page, data, assessment.id);
  await overflow(page);
  expect(
    (
      await new AxeBuilder({ page })
        .include('main')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await transition(page, 'Soumettre', assessment.id, 'submit');
  await expect(page.locator('[data-grade-sheet] input[data-grade-score]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Valider', exact: true })).toHaveCount(0);
  await open(page, data.draftId);
  await fillAndSave(page, data, data.draftId, 50);
  await transition(page, 'Soumettre', data.draftId, 'submit');
  checkTeacher();
  const directorContext = await browser.newContext({ viewport: page.viewportSize() });
  const director = await directorContext.newPage();
  const checkDirector = watch(director);
  try {
    await login(director, data.director, true);
    await director.goto('/fr/grades');
    await ready(director);
    await context(director, data);
    for (const id of [assessment.id, data.draftId, data.submittedId]) {
      await open(director, id);
      await transition(director, 'Valider', id, 'validate');
      await transition(director, 'Publier', id, 'publish');
    }
    await director.getByRole('tab', { name: 'Résultats de classe', exact: true }).click();
    await expect(director.locator('[data-class-results]')).toContainText('12.00');
    await expect(director.locator('[data-class-results]')).toContainText('14.00');
    for (const [name, verb] of [
      ['Générer les bulletins', 'generate'],
      ['Publier les bulletins', 'publish'],
    ]) {
      if (!name || !verb) throw new Error('Missing action');
      await director.getByRole('button', { name, exact: true }).click();
      const result = director.waitForResponse(
        (r) => new URL(r.url()).pathname === `/api/v1/report-cards/${verb}`,
      );
      await director
        .getByRole('dialog')
        .getByRole('button', { name: 'Confirmer', exact: true })
        .click();
      expect((await result).ok()).toBe(true);
      await expect(director.getByRole('dialog')).toBeHidden();
    }
    await director.getByRole('tab', { name: 'Bulletins', exact: true }).click();
    await director
      .getByRole('row')
      .filter({ hasText: 'Élève Lié' })
      .getByRole('button', { name: 'Voir le bulletin' })
      .click();
    const preview = director.locator('[data-report-preview]');
    await expect(preview).toContainText('12.00');
    const before = await preview.textContent();
    await director.getByRole('tab', { name: 'Évaluations', exact: true }).click();
    await open(director, assessment.id);
    await director
      .locator(`[data-grade-student="${data.ownStudentId}"]`)
      .getByRole('button', { name: 'Corriger', exact: true })
      .click();
    await director.getByRole('dialog').getByLabel('Note', { exact: true }).fill('14');
    await director
      .getByRole('dialog')
      .getByLabel('Raison obligatoire', { exact: true })
      .fill('Erreur de saisie vérifiée');
    const corrected = director.waitForResponse((r) =>
      /\/grades\/[^/]+\/correct$/.test(new URL(r.url()).pathname),
    );
    await director
      .getByRole('dialog')
      .getByRole('button', { name: 'Confirmer', exact: true })
      .click();
    expect((await corrected).ok()).toBe(true);
    await expect(director.getByRole('dialog')).toBeHidden();
    await ready(director);
    await director
      .locator(`[data-grade-student="${data.ownStudentId}"]`)
      .getByRole('button', { name: 'Historique', exact: true })
      .click();
    await expect(director.getByRole('dialog')).toContainText('12.00 → 14.00');
    await expect(director.getByRole('dialog')).toContainText('Erreur de saisie vérifiée');
    await director.getByRole('dialog').getByRole('button', { name: 'Fermer', exact: true }).click();
    await transition(director, 'Verrouiller', assessment.id, 'lock');
    await expect(director.locator('[data-grade-sheet]')).toContainText('Évaluation verrouillée');
    await expect(
      director.locator('[data-grade-sheet]').getByRole('button', { name: 'Corriger', exact: true }),
    ).toHaveCount(0);
    await director.getByRole('tab', { name: 'Bulletins', exact: true }).click();
    await director
      .getByRole('row')
      .filter({ hasText: 'Élève Lié' })
      .getByRole('button', { name: 'Voir le bulletin' })
      .click();
    await expect(preview).toHaveText(before ?? '');
    await director.getByRole('button', { name: 'Verrouiller le bulletin' }).click();
    const locked = director.waitForResponse((r) =>
      /\/report-cards\/[^/]+\/lock$/.test(new URL(r.url()).pathname),
    );
    await director
      .getByRole('dialog')
      .getByRole('button', { name: 'Confirmer', exact: true })
      .click();
    expect((await locked).ok()).toBe(true);
    await expect(director.getByRole('dialog')).toBeHidden();
    await expect(preview).toContainText('Verrouillé');
    await overflow(director);
    checkDirector();
  } finally {
    await directorContext.close();
  }
});

test('LOT 9 real teacher grade entry in FR EN AR, keyboard, accessibility and seven viewports', async ({
  page,
}, info) => {
  test.slow();
  const data = fixture(info.project.name),
    check = watch(page);
  await login(page, data.teacher, false);
  for (const [locale, title] of [
    ['fr', 'Notes et résultats'],
    ['en', 'Grades and results'],
    ['ar', 'العلامات والنتائج'],
  ]) {
    if (!locale || !title) throw new Error('Missing locale fixture');
    await page.goto(`/${locale}/grades`);
    await ready(page);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await open(page, data.draftId);
    await expect(page.locator('input[data-grade-score]')).toHaveCount(2);
    await page.locator('input[data-grade-score]').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('input[data-grade-score]').nth(1)).toBeFocused();
    await page.keyboard.press('Shift+Enter');
    await expect(page.locator('input[data-grade-score]').first()).toBeFocused();
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await overflow(page);
    expect(
      (
        await new AxeBuilder({ page })
          .include('main')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
  check();
});

test('LOT 9 parent CHILDREN, student OWN and accountant denial across seven viewports', async ({
  browser,
  page,
}, info) => {
  test.slow();
  const data = fixture(info.project.name);
  for (const role of ['parent', 'student', 'accountant'] as const) {
    const actorContext = await browser.newContext({ viewport: page.viewportSize() }),
      actor = await actorContext.newPage(),
      check = watch(actor);
    try {
      await login(actor, data[role], role === 'accountant');
      await actor.goto('/fr/grades');
      if (role === 'accountant') {
        await expect(
          actor.getByText('Vous n’êtes pas autorisé à consulter ces résultats.', { exact: true }),
        ).toBeVisible();
        await expect(actor.getByRole('button', { name: 'Créer une évaluation' })).toHaveCount(0);
      } else {
        await ready(actor);
        await expect(actor.locator('button[data-assessment-open]')).toHaveCount(1);
        await open(actor, data.publishedId);
        await expect(actor.locator('[data-grade-student]')).toHaveCount(1);
        await expect(actor.locator('[data-grade-student]')).toHaveAttribute(
          'data-grade-student',
          data.ownStudentId,
        );
        await expect(actor.locator('[data-grade-sheet]')).toContainText('14.00');
        await actor.getByRole('tab', { name: 'Bulletins', exact: true }).click();
        await expect(actor.locator('[data-reports-ready]')).toHaveAttribute(
          'data-reports-ready',
          'true',
        );
        await expect(
          actor.getByRole('button', { name: 'Voir le bulletin', exact: true }),
        ).toHaveCount(1);
        await actor.getByRole('button', { name: 'Voir le bulletin', exact: true }).click();
        await expect(actor.locator('[data-report-preview]')).toContainText('14.00');
        await expect(actor.locator('[data-report-preview]')).not.toContainText('Ex æquo');
        await expect(actor.getByRole('button', { name: 'Verrouiller le bulletin' })).toHaveCount(0);
        await actor.goto(`/fr/students/${data.ownStudentId}`);
        await ready(actor);
        await expect(actor.locator('[data-results-ready]')).toHaveAttribute(
          'data-results-ready',
          'true',
        );
        await expect(actor.getByRole('heading', { level: 1 })).toHaveCount(1);
        await expect(
          actor.getByRole('heading', { level: 2, name: 'Notes et résultats', exact: true }),
        ).toBeVisible();
      }
      await overflow(actor);
      check();
    } finally {
      await actorContext.close();
    }
  }
});
