import { readFileSync } from 'node:fs';

import type { MembershipContextView } from '@gestschool/contracts';

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

test('LOT17.6 renders real tenant and active-year shell context', async ({ page }, info) => {
  test.skip(info.project.name !== '1440x900', 'Shell context certified once.');
  const account = fixtures().people[info.project.name];
  if (!account) throw new Error('Missing shell context fixture');
  const verifyNoErrors = watch(page);

  await login(page, account.crud, true);
  const membershipsResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/auth/memberships' &&
      response.request().method() === 'GET',
  );
  await page.reload();

  const memberships = (await (await membershipsResponse).json()) as MembershipContextView[];
  const school = page.locator('[data-shell-school]').first();
  await expect(school).toBeVisible();
  expect(await school.locator('option').allTextContents()).toEqual(
    memberships.map((membership) => membership.tenant.name),
  );

  const currentMembershipId = await school.inputValue();
  const current = memberships.find((membership) => membership.membershipId === currentMembershipId);
  expect(current).toBeTruthy();
  await expect(page.locator('[data-shell-tenant-name]').first()).toHaveText(
    current?.tenant.name ?? '',
  );

  const year = page.locator('[data-shell-year]').first();
  await expect(year).toBeVisible();
  await expect(year).toHaveAttribute(
    'data-shell-year',
    current?.activeAcademicYear ? 'active' : 'none',
  );
  await expect(year).toContainText(current?.activeAcademicYear?.name ?? 'Aucune année active');
  await expect(page.getByText('1K+', { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-shell-role]').first()).not.toHaveText(/_/);

  const originalTenantName = current?.tenant.name ?? '';
  const renamedTenant = `${originalTenantName} LOT17.6`;
  await page.goto('/fr/settings');
  await expect(page.locator('[data-settings-ready]')).toHaveAttribute(
    'data-settings-ready',
    'true',
  );
  const schoolName = page.getByLabel('Nom de l’établissement', { exact: true });
  await expect(schoolName).toHaveValue(originalTenantName);
  await schoolName.fill(renamedTenant);
  await page.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click();
  await expect(page.locator('[data-shell-tenant-name]').first()).toHaveText(renamedTenant);
  await expect(page.locator('[data-shell-school]').first().locator('option:checked')).toHaveText(
    renamedTenant,
  );

  await schoolName.fill(originalTenantName);
  await page.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click();
  await expect(page.locator('[data-shell-tenant-name]').first()).toHaveText(originalTenantName);

  const alternate = memberships.find(
    (membership) => membership.membershipId !== currentMembershipId,
  );
  if (alternate) {
    const switched = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/v1/auth/switch-tenant' &&
        response.request().method() === 'POST',
    );
    await school.selectOption(alternate.membershipId);
    expect((await switched).status()).toBe(201);
    await expect(page).toHaveURL(/\/fr$/);
    await expect(page.locator('[data-shell-school]').first()).toHaveValue(alternate.membershipId);
    await expect(page.locator('[data-shell-year]').first()).toContainText(
      alternate.activeAcademicYear?.name ?? 'Aucune année active',
    );

    const restored = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/v1/auth/switch-tenant' &&
        response.request().method() === 'POST',
    );
    await page.locator('[data-shell-school]').first().selectOption(currentMembershipId);
    expect((await restored).status()).toBe(201);
    await expect(page).toHaveURL(/\/fr$/);
  }

  verifyNoErrors();
});

test('LOT17.6 keeps real shell context usable on mobile', async ({ page }, info) => {
  test.skip(info.project.name !== '360x800', 'Mobile shell context certified once.');
  const account = fixtures().people[info.project.name];
  if (!account) throw new Error('Missing mobile shell context fixture');
  const verifyNoErrors = watch(page);

  await login(page, account.crud, true);
  const membershipsResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/auth/memberships' &&
      response.request().method() === 'GET',
  );
  await page.reload();
  const memberships = (await (await membershipsResponse).json()) as MembershipContextView[];

  await page.getByRole('button', { name: 'Ouvrir la navigation', exact: true }).click();
  const school = page.locator('[data-shell-school]:visible');
  await expect(school).toBeVisible();
  expect(await school.locator('option').allTextContents()).toEqual(
    memberships.map((membership) => membership.tenant.name),
  );

  const currentMembershipId = await school.inputValue();
  const current = memberships.find((membership) => membership.membershipId === currentMembershipId);
  const year = page.locator('[data-shell-year]:visible');
  await expect(year).toContainText(current?.activeAcademicYear?.name ?? 'Aucune année active');
  verifyNoErrors();
});
