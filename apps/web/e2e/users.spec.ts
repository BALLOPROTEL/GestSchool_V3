import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { login, type Credentials } from './academic-helpers';
import { expect, test } from './fixtures';

interface Fixtures {
  people: Record<
    string,
    {
      crud: Credentials;
      locales: Credentials;
      denied: Credentials;
    }
  >;
}

function fixtures(): Fixtures {
  return JSON.parse(
    readFileSync(new URL('../../../.local/iam-e2e.json', import.meta.url), 'utf8'),
  ) as Fixtures;
}

test('LOT17.3 invites and renders a real tenant user without mock actions', async ({
  page,
}, info) => {
  test.skip(info.project.name !== '1440x900', 'User administration flow certified once.');
  const account = fixtures().people[info.project.name];
  if (!account) throw new Error('Missing user administration fixture');

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await login(page, account.crud, true);
  await page.goto('/fr/users');
  await expect(page.locator('[data-users-ready]')).toHaveAttribute('data-users-ready', 'true');

  const suffix = Date.now().toString();
  const email = `user-admin-${suffix}@example.invalid`;
  const displayName = `Utilisateur Admin ${suffix}`;

  await page.getByRole('button', { name: 'Inviter un utilisateur', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nom affiché', { exact: true }).fill(displayName);
  await dialog.getByLabel('Adresse e-mail', { exact: true }).fill(email);
  const role = dialog.getByLabel('Rôle', { exact: true });
  await expect(role.locator('option:not([value=""])')).toHaveCount(8);
  await role.selectOption({ index: 1 });
  await dialog.getByRole('button', { name: 'Envoyer l’invitation', exact: true }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('searchbox', { name: 'Rechercher', exact: true }).fill(email);
  const row = page.getByRole('row').filter({ hasText: email });
  await expect(row).toBeVisible();
  await expect(row).toContainText(displayName);
  await expect(row).toContainText('Invitation en attente');
  await expect(row.getByRole('button', { name: /Renvoyer l’activation/ })).toBeVisible();

  await page.getByRole('button', { name: 'Inviter un utilisateur', exact: true }).click();
  await dialog.getByLabel('Nom affiché', { exact: true }).fill('Invitation à corriger');
  await dialog.getByLabel('Adresse e-mail', { exact: true }).fill(account.crud.email);
  await role.selectOption({ index: 1 });
  const rejectedInvite = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/iam/invitations') &&
      response.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Envoyer l’invitation', exact: true }).click();
  expect((await rejectedInvite).status()).toBe(409);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Nom affiché', { exact: true })).toHaveValue('Invitation à corriger');
  await expect(dialog.getByLabel('Adresse e-mail', { exact: true })).toHaveValue(account.crud.email);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  const unexpectedErrors = errors.filter(
    (message) =>
      !message.includes('Failed to load resource') ||
      !message.includes('409'),
  );
  expect(unexpectedErrors).toEqual([]);
});

test('LOT17.3 hides user administration from an unauthorized role', async ({ page }, info) => {
  test.skip(info.project.name !== '1440x900', 'Permission denial certified once.');
  const account = fixtures().people[info.project.name];
  if (!account) throw new Error('Missing user administration fixture');

  await login(page, account.denied, false);
  await page.goto('/fr/users');
  await expect(
    page.getByRole('alert').filter({
      hasText: 'Vous n’avez pas accès à l’administration des utilisateurs.',
    }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inviter un utilisateur' })).toHaveCount(0);
});
