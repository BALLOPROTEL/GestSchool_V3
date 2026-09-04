import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const routes = [
  '/',
  '/login',
  '/forgot-password',
  '/activation',
  '/students',
  '/students/EL-2024-001',
  '/parents',
  '/teachers',
  '/enrollments',
  '/classes',
  '/subjects',
  '/grades',
  '/attendance',
  '/finance',
  '/documents',
  '/communications',
  '/reports',
  '/users',
  '/audit',
  '/settings',
  '/profile',
  '/design-system',
] as const;

test('renders every LOT 1 page without runtime errors or document overflow', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const apiCalls: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) apiCalls.push(`${request.method()} ${url.pathname}`);
  });

  for (const route of routes) {
    consoleErrors.length = 0;
    pageErrors.length = 0;
    apiCalls.length = 0;

    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.ok(), `${route} should return a successful response`).toBe(true);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByRole('heading').first()).toBeVisible();
    await page.waitForTimeout(50);

    const overflow = await page.evaluate(() => ({
      body: document.body.scrollWidth - window.innerWidth,
      document: document.documentElement.scrollWidth - window.innerWidth,
    }));
    expect(overflow.document, `${route} document overflow`).toBeLessThanOrEqual(1);
    expect(overflow.body, `${route} body overflow`).toBeLessThanOrEqual(1);

    const outOfBoundsTables = await page.locator('[data-slot="data-table-scroll"]').evaluateAll(
      (tables) =>
        tables.filter((table) => {
          const bounds = table.getBoundingClientRect();
          return bounds.left < -1 || bounds.right > window.innerWidth + 1;
        }).length,
    );
    expect(outOfBoundsTables, `${route} table containers outside viewport`).toBe(0);
    expect(consoleErrors, `${route} console errors`).toEqual([]);
    expect(pageErrors, `${route} page errors`).toEqual([]);
    expect(apiCalls, `${route} unexpected API calls`).toEqual([]);
  }
});

test('supports theme persistence and complete locale switching including RTL', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== '1366x768', 'Interaction is certified once at desktop size.');
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');

  await page.getByRole('button', { name: 'Changer de thème' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page.getByLabel('Changer de langue').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

  await page.getByLabel('Change language').selectOption('ar');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const sidebarBounds = await page.locator('aside').boundingBox();
  expect(sidebarBounds?.x).toBeGreaterThan(1000);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, 'RTL document overflow').toBeLessThanOrEqual(1);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('provides working desktop and mobile navigation', async ({ page }, testInfo) => {
  test.skip(
    !['360x800', '1366x768'].includes(testInfo.project.name),
    'Certified at one mobile and one desktop width.',
  );
  await page.goto('/');
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();

  if ((viewport?.width ?? 0) >= 1024) {
    const sidebar = page.locator('aside');
    await page.keyboard.press('Control+K');
    await expect(page.getByRole('heading', { name: 'Recherche globale' })).toBeVisible();
    await page.keyboard.press('Escape');
    await sidebar.getByRole('link', { name: 'Élèves' }).click();
    await expect(page).toHaveURL(/\/students$/);
    await expect(sidebar.getByRole('link', { name: 'Élèves' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.getByRole('button', { name: 'Réduire la navigation' }).click();
    await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(60);
    await page.reload();
    await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(60);
  } else {
    await page.getByRole('button', { name: 'Ouvrir la navigation' }).click();
    await page.getByRole('link', { name: 'Élèves' }).click();
    await expect(page).toHaveURL(/\/students$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Élèves' })).toBeVisible();
  }
});

test('exercises authentication demonstration flows', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== '1440x900', 'Authentication flow is certified once.');
  await page.goto('/login');
  await page.getByLabel('Mot de passe', { exact: true }).fill('Demo2026!');
  await page.getByRole('button', { name: /Se connecter/ }).click();
  await expect(page).toHaveURL(/\/fr$/);

  await page.goto('/forgot-password');
  await page.getByRole('button', { name: /Envoyer le lien/ }).click();
  await expect(page.getByRole('heading', { name: 'E-mail envoyé !' })).toBeVisible();

  await page.goto('/activation');
  await page.getByLabel('Code de vérification').fill('123456');
  await page.getByRole('button', { name: /Mot de passe/ }).click();
  await page.getByLabel('Créer un mot de passe').fill('Demo2026!');
  await page.getByLabel('Confirmer le mot de passe').fill('Demo2026!');
  await page.getByRole('button', { name: /Activer mon compte/ }).click();
  await expect(page.getByRole('heading', { name: 'Compte activé !' })).toBeVisible();
});

test('exposes and operates the shared component catalogue', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== '1440x900', 'Component interactions are certified once.');
  await page.goto('/design-system');

  for (const slot of [
    'button',
    'input',
    'select',
    'textarea',
    'checkbox',
    'radio',
    'switch',
    'badge',
    'card',
    'status-badge',
    'data-table-scroll',
    'skeleton',
  ]) {
    await expect(
      page.locator(`[data-slot="${slot}"]`).first(),
      `${slot} should be represented`,
    ).toBeVisible();
  }

  const dialogTrigger = page.getByRole('button', { name: 'Dialog', exact: true });
  await dialogTrigger.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Confirmer l’action' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  const drawerTrigger = page.getByRole('button', { name: 'Drawer', exact: true });
  await drawerTrigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog').getByText('Tiroir de démonstration')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  const dropdownTrigger = page.getByRole('button', { name: /Dropdown/ });
  await dropdownTrigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Modifier' })).toBeVisible();
  await page.keyboard.press('Escape');
  const componentsTab = page.getByRole('tab', {
    name: 'Bibliothèque des composants réutilisables de GestSchool.',
  });
  await componentsTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('tab', { name: 'États de chargement, vide et erreur' }),
  ).toHaveAttribute('data-state', 'active');
  await page.getByRole('button', { name: '3', exact: true }).click();
  await expect(page.getByRole('button', { name: '3', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('has no automated WCAG A/AA violations on representative screens', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== '1920x1080',
    'Accessibility audit is certified at the largest desktop viewport.',
  );
  for (const route of [
    '/',
    '/login',
    '/students',
    '/students/EL-2024-001',
    '/settings',
    '/design-system',
    '/ar',
  ]) {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      results.violations,
      `${route}: ${JSON.stringify(results.violations, undefined, 2)}`,
    ).toEqual([]);
  }
});
