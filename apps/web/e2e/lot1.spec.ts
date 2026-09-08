import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from './fixtures';
import { readFileSync } from 'node:fs';

interface E2eUser {
  email: string;
  password: string;
  token?: string;
}
function fixtures(): {
  visual: Record<string, E2eUser>;
  activation: E2eUser;
  reset: E2eUser;
  studentId: string;
} {
  return JSON.parse(
    readFileSync(new URL('../../../.local/iam-e2e.json', import.meta.url), 'utf8'),
  ) as { visual: Record<string, E2eUser>; activation: E2eUser; reset: E2eUser; studentId: string };
}

async function waitForPageReady(page: Page): Promise<void> {
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('main')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('heading').first()).toBeVisible();
  if (await page.locator('[data-people-ready]').count())
    await expect(page.locator('[data-people-ready]')).toHaveAttribute('data-people-ready', 'true');
  for (const section of await page.locator('[data-academic-ready]').all())
    await expect(section).toHaveAttribute('data-academic-ready', 'true');
}

test.beforeEach(async ({ page }, testInfo) => {
  const title = testInfo.title;
  const viewport = testInfo.project.name;
  const runs =
    title.startsWith('renders every') ||
    (title.startsWith('supports theme') && viewport === '1366x768') ||
    (title.startsWith('provides working') && ['360x800', '1366x768'].includes(viewport)) ||
    (title.startsWith('exposes and') && viewport === '1440x900') ||
    (title.startsWith('has no automated') && viewport === '1920x1080');
  if (!runs) return;
  const csrf = await page.request.get('/api/v1/auth/csrf');
  const data = (await csrf.json()) as { csrfToken: string };
  const user = fixtures().visual[viewport];
  if (!user) throw new Error('Missing E2E fixture');
  const login = await page.request.post('/api/v1/auth/login', {
    data: user,
    headers: { Origin: 'http://127.0.0.1:3000', 'X-CSRF-Token': data.csrfToken },
  });
  expect(login.status()).toBe(201);
});

const routes = [
  '/',
  '/login',
  '/forgot-password',
  '/activation',
  '/reset-password',
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
  test.slow(); // This scenario loads all 23 routes, including real session restoration.
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const apiCalls: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      url.pathname.startsWith('/api/') &&
      !/^\/api\/v1\/(auth|students|guardians|teachers|academic-years|academic-periods|levels|classes|subjects|teaching-assignments|me)(\/|$)/.test(
        url.pathname,
      )
    )
      apiCalls.push(`${request.method()} ${url.pathname}`);
  });

  for (const route of routes) {
    consoleErrors.length = 0;
    pageErrors.length = 0;
    apiCalls.length = 0;

    const response = await page.goto(route.replace('EL-2024-001', fixtures().studentId), {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.ok(), `${route} should return a successful response`).toBe(true);
    await waitForPageReady(page);

    if (route === '/login')
      await expect(page.locator('h1 span.text-blue-400')).toHaveText('simplifiée');

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
  await waitForPageReady(page);
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

test('exercises real login, activation and password reset flows', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== '1440x900', 'Authentication flow is certified once.');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const fixture = fixtures();
  const user = fixture.visual['1440x900'];
  if (!user || !fixture.activation.token || !fixture.reset.token)
    throw new Error('Missing IAM fixture');
  await page.goto('/login');
  await page.getByLabel('Adresse e-mail', { exact: true }).fill(user.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: /Se connecter/ }).click();
  await expect(page).toHaveURL(/\/fr$/);

  await page.goto('/forgot-password');
  await waitForPageReady(page);
  await page.getByLabel('Adresse e-mail', { exact: true }).fill(user.email);
  await page.getByRole('button', { name: /Envoyer le lien/ }).click();
  await expect(page.getByRole('heading', { name: 'E-mail envoyé !' })).toBeVisible();

  await page.goto('/activation');
  await waitForPageReady(page);
  const activationInput = page.getByLabel('Jeton à usage unique');
  await activationInput.fill('!'.repeat(43));
  expect(
    await activationInput.evaluate((input: HTMLInputElement) => input.validity.patternMismatch),
  ).toBe(true);
  await activationInput.fill(`${'a'.repeat(41)}-_`);
  expect(await activationInput.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(
    true,
  );
  await activationInput.fill(fixture.activation.token);
  await page.getByRole('button', { name: /Mot de passe/ }).click();
  await page.getByLabel('Créer un mot de passe').fill(fixture.activation.password);
  await page.getByLabel('Confirmer le mot de passe').fill(fixture.activation.password);
  await page.getByRole('button', { name: /Activer mon compte/ }).click();
  await expect(page.getByRole('heading', { name: 'Compte activé !' })).toBeVisible();

  await page.goto('/reset-password');
  await waitForPageReady(page);
  await page.getByLabel('Jeton à usage unique').fill(fixture.reset.token);
  await page.getByRole('button', { name: /Mot de passe/ }).click();
  await page.getByLabel('Créer un mot de passe').fill(fixture.reset.password);
  await page.getByLabel('Confirmer le mot de passe').fill(fixture.reset.password);
  await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click();
  await expect(page.getByRole('heading', { name: 'Mot de passe modifié' })).toBeVisible();
  expect(errors).toEqual([]);
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
  test.slow(); // Seven full axe audits need their own aggregate time budget.
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
    await page.goto(route.replace('EL-2024-001', fixtures().studentId));
    await waitForPageReady(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      results.violations,
      `${route}: ${JSON.stringify(results.violations, undefined, 2)}`,
    ).toEqual([]);
  }
});
