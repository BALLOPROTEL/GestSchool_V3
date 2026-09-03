import { expect, test } from '@playwright/test';

test('shows the foundation-ready page', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'GestSchool — Foundation Ready' })).toBeVisible();
});
