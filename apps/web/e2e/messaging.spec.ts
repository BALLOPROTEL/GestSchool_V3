import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Locator } from '@playwright/test';
import { expect, test, type Page } from './fixtures';
import { login, overflow, watch, type Credentials } from './academic-helpers';

interface MessagingFixture {
  admin: Credentials;
  teacher: Credentials;
  parent: Credentials;
  student: Credentials;
  studentId: string;
  unassignedStudentId: string;
  classId: string;
}

function fixture(viewport: string): MessagingFixture {
  const data = JSON.parse(
    readFileSync(new URL('../../../.local/iam-e2e.json', import.meta.url), 'utf8'),
  ) as { messaging: Record<string, MessagingFixture> };
  const value = data.messaging[viewport];
  if (!value) throw new Error('Missing messaging fixture');
  return value;
}

async function resetLogin(page: Page, credentials: Credentials) {
  await page.context().clearCookies();
  await page.goto('/fr/login');
  await login(page, credentials, true);
}

async function communicationsReady(page: Page) {
  await expect(page.locator('[data-messaging-ready]')).toHaveAttribute(
    'data-messaging-ready',
    'true',
    { timeout: 30_000 },
  );
}

async function openComposer(page: Page) {
  await page.getByRole('button', { name: 'Nouveau message', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouveau message' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function previewStudent(dialog: Locator, studentId: string) {
  const audience = dialog.locator('#communication-audience-type');
  await expect(audience).toHaveAccessibleName('Audience');
  await audience.selectOption('STUDENT');
  const audienceId = dialog.locator('#communication-audience-id');
  await expect(audienceId).toHaveAccessibleName('Identifiant de l’élève ou de la classe');
  await audienceId.fill(studentId);
  const previewed = dialog
    .page()
    .waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/v1/communications/audience-preview' &&
        response.request().method() === 'POST',
    );
  await dialog.getByRole('button', { name: 'Vérifier l’audience', exact: true }).click();
  return previewed;
}

async function certifyNotifications(page: Page, credentials: Credentials) {
  await resetLogin(page, credentials);
  const bell = page.getByRole('button', { name: /notifications non lues/ });
  await expect(bell).toHaveAccessibleName(
    /[3-9]\d* notifications non lues|3 notifications non lues/,
  );
  const initialLabel = await bell.getAttribute('aria-label');
  if (!initialLabel) throw new Error('Missing notification count');
  await bell.click();
  await expect(page.getByTestId('notification-center')).toBeVisible();
  await expect(page.getByText('Paiement validé', { exact: true })).toBeVisible();
  await expect(page.getByText('Bulletin disponible', { exact: true })).toBeVisible();
  await expect(page.getByText('Document disponible', { exact: true })).toBeVisible();
  await page.getByText('Paiement validé', { exact: true }).click();
  await expect(bell).not.toHaveAccessibleName(initialLabel);
  await bell.click();
  await page.getByText('Tout marquer comme lu', { exact: true }).click();
  await expect(bell).toHaveAccessibleName('0 notifications non lues');
  await overflow(page);
}

test('LOT 11 communications, ASSIGNED audiences and notifications at every viewport', async ({
  page,
}, info) => {
  test.setTimeout(480_000);
  const data = fixture(info.project.name);

  await login(page, data.admin, true);
  const checkAdmin = watch(page);
  for (const [locale, heading] of [
    ['fr', 'Communications'],
    ['en', 'Communications'],
    ['ar', 'المراسلات'],
  ] as const) {
    await page.goto(`/${locale}/communications`);
    await communicationsReady(page);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
    await expect(page.getByText('Historique réel E2E', { exact: true })).toBeVisible();
    await overflow(page);
  }
  await page.goto('/fr/communications');
  await communicationsReady(page);
  const composer = await openComposer(page);
  expect((await previewStudent(composer, data.studentId)).status()).toBe(201);
  await expect(composer.getByRole('status')).toContainText('Confirmer l’envoi à 1 élève');
  const requested = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/communications/send' &&
      response.request().method() === 'POST',
  );
  await composer.getByRole('button', { name: 'Confirmer et envoyer', exact: true }).click();
  expect((await requested).status()).toBe(201);
  await expect(page.getByRole('status').filter({ hasText: 'file d’envoi' })).toBeVisible();
  await expect(async () => {
    await page.reload();
    await communicationsReady(page);
    await expect(
      page.getByTestId('communication-message').filter({ hasText: 'manual.school_notice' }).first(),
    ).toBeVisible();
  }).toPass({ timeout: 30_000, intervals: [1000] });
  if (info.project.name === '1440x900')
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  checkAdmin();

  await resetLogin(page, data.teacher);
  await page.goto('/fr/communications');
  await communicationsReady(page);
  const deniedComposer = await openComposer(page);
  const deniedCategory = deniedComposer.locator('#communication-category');
  await expect(deniedCategory).toHaveAccessibleName('Catégorie');
  await deniedCategory.selectOption('ACADEMIC');
  expect((await previewStudent(deniedComposer, data.unassignedStudentId)).status()).toBe(403);
  await expect(page.getByRole('alert')).toContainText('Impossible de charger');
  await page.keyboard.press('Escape');
  const checkTeacher = watch(page);
  const assignedComposer = await openComposer(page);
  const assignedCategory = assignedComposer.locator('#communication-category');
  await expect(assignedCategory).toHaveAccessibleName('Catégorie');
  await assignedCategory.selectOption('ACADEMIC');
  expect((await previewStudent(assignedComposer, data.studentId)).status()).toBe(201);
  await expect(assignedComposer.getByRole('status')).toContainText('Confirmer l’envoi à 1 élève');
  await overflow(page);
  checkTeacher();

  await certifyNotifications(page, data.parent);
  await certifyNotifications(page, data.student);
});
