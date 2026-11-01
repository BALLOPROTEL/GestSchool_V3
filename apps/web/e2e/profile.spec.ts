import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { login, type Credentials, watch } from './academic-helpers';
import { expect, test } from './fixtures';

interface Fixtures {
  people: Record<
    string,
    {
      crud: Credentials;
    }
  >;
}

function fixtures(): Fixtures {
  return JSON.parse(
    readFileSync(new URL('../../../.local/iam-e2e.json', import.meta.url), 'utf8'),
  ) as Fixtures;
}

test('LOT17.5 uses real profile, preferences, MFA and revocable sessions', async ({
  browser,
  page,
}, info) => {
  test.skip(info.project.name !== '1440x900', 'Profile security journey certified once.');
  const account = fixtures().people[info.project.name];
  if (!account) throw new Error('Missing profile fixture');
  const verifyNoErrors = watch(page);

  await login(page, account.crud, true);
  await page.goto('/fr/profile');
  await expect(page.locator('[data-profile-ready]')).toHaveAttribute('data-profile-ready', 'true');
  await expect(page.getByText('Amadou Kouyaté', { exact: true })).toHaveCount(0);

  const displayName = page.getByLabel('Nom affiché', { exact: true });
  const locale = page.getByLabel('Langue préférée', { exact: true });
  const originalName = await displayName.inputValue();
  const originalLocale = await locale.inputValue();
  const nextName = `Profil E2E ${Date.now()}`;
  const nextLocale = originalLocale === 'fr' ? 'en' : 'fr';

  await displayName.fill(nextName);
  const profileUpdate = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/auth/profile' &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  expect((await profileUpdate).status()).toBe(200);
  await expect(page.getByRole('heading', { name: nextName, exact: true })).toBeVisible();

  await page.reload();
  await expect(page.locator('[data-profile-ready]')).toHaveAttribute('data-profile-ready', 'true');
  await expect(page.getByLabel('Nom affiché', { exact: true })).toHaveValue(nextName);
  await expect(page.getByLabel('Langue préférée', { exact: true })).toHaveValue(originalLocale);

  await page.getByLabel('Nom affiché', { exact: true }).fill(originalName);
  const restoreProfile = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/auth/profile' &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  expect((await restoreProfile).status()).toBe(200);

  await page.locator('#profile-locale').selectOption(nextLocale);
  const languageUpdate = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/auth/profile' &&
      response.request().method() === 'PUT',
  );
  await page
    .locator('form')
    .filter({ has: page.locator('#profile-locale') })
    .locator('button[type="submit"]')
    .click();
  expect((await languageUpdate).status()).toBe(200);
  await expect(page).toHaveURL(new RegExp('/' + nextLocale + '/profile$'));
  await expect(page.locator('[data-profile-ready]')).toHaveAttribute('data-profile-ready', 'true');

  await page.locator('#profile-locale').selectOption(originalLocale);
  const languageRestore = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/auth/profile' &&
      response.request().method() === 'PUT',
  );
  await page
    .locator('form')
    .filter({ has: page.locator('#profile-locale') })
    .locator('button[type="submit"]')
    .click();
  expect((await languageRestore).status()).toBe(200);
  await expect(page).toHaveURL(/\/fr\/profile$/);
  await expect(page.locator('[data-profile-ready]')).toHaveAttribute('data-profile-ready', 'true');

  await page.getByRole('tab', { name: 'Notifications', exact: true }).click();
  const email = page.getByRole('switch', { name: 'Notifications par e-mail', exact: true });
  const whatsapp = page.getByRole('switch', { name: 'Notifications WhatsApp', exact: true });
  const originalEmail = await email.isChecked();
  const originalWhatsapp = await whatsapp.isChecked();
  await email.click();
  await whatsapp.click();
  const preferencesUpdate = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/auth/preferences' &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  expect((await preferencesUpdate).status()).toBe(200);

  await page.reload();
  await expect(page.locator('[data-profile-ready]')).toHaveAttribute('data-profile-ready', 'true');
  await page.getByRole('tab', { name: 'Notifications', exact: true }).click();
  const persistedEmail = page.getByRole('switch', {
    name: 'Notifications par e-mail',
    exact: true,
  });
  const persistedWhatsapp = page.getByRole('switch', {
    name: 'Notifications WhatsApp',
    exact: true,
  });
  expect(await persistedEmail.isChecked()).toBe(!originalEmail);
  expect(await persistedWhatsapp.isChecked()).toBe(!originalWhatsapp);
  await persistedEmail.click();
  await persistedWhatsapp.click();
  const restorePreferences = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/auth/preferences' &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  expect((await restorePreferences).status()).toBe(200);

  await page.getByRole('tab', { name: 'Sécurité', exact: true }).click();
  await expect(page.getByText('Activée', { exact: true })).toBeVisible();
  await expect(
    page.getByText('L’authentification à deux facteurs est obligatoire pour votre rôle.'),
  ).toBeVisible();

  const currentPassword = page.getByLabel('Mot de passe actuel', { exact: true }).first();
  await currentPassword.fill(account.crud.password);
  await page.getByRole('button', { name: 'Afficher le mot de passe', exact: true }).first().click();
  await expect(currentPassword).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Masquer le mot de passe', exact: true }).first().click();
  await expect(currentPassword).toHaveAttribute('type', 'password');
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('Profile E2E password 1234');
  await page
    .getByLabel('Confirmer le nouveau mot de passe', { exact: true })
    .fill('Profile E2E password 5678');
  await page.getByRole('button', { name: 'Modifier le mot de passe', exact: true }).click();
  await expect(page.getByText('Les nouveaux mots de passe ne correspondent pas.')).toBeVisible();

  const baseURL = new URL(page.url()).origin;
  const secondContext = await browser.newContext({ baseURL });
  const secondPage = await secondContext.newPage();
  await login(secondPage, account.crud, true);

  await page.goto('/fr/profile');
  await expect(page.locator('[data-profile-ready]')).toHaveAttribute('data-profile-ready', 'true');
  await page.getByRole('tab', { name: 'Activité', exact: true }).click();

  const current = page.locator('[data-profile-session][data-current="true"]');
  const others = page.locator('[data-profile-session][data-current="false"]');
  const otherCount = await others.count();
  const other = others.first();
  await expect(current).toBeVisible();
  await expect(current).not.toContainText('Mozilla/5.0');
  expect(await current.textContent()).toMatch(/Chrome|Edge|Firefox|Safari|Navigateur/);
  expect(otherCount).toBeGreaterThan(0);
  await expect(other).toBeVisible();

  const revoke = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.startsWith('/api/v1/auth/sessions/') &&
      response.request().method() === 'DELETE',
  );
  await other.getByRole('button', { name: 'Révoquer', exact: true }).click();
  expect((await revoke).status()).toBe(200);
  await expect(others).toHaveCount(otherCount - 1);

  await secondContext.close();

  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  verifyNoErrors();
});
