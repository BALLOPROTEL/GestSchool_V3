import { expect, test } from '@playwright/test';

process.env['PLAYWRIGHT_NO_COPY_PROMPT'] = '1';

for (const locale of ['fr', 'en', 'ar']) {
  for (const theme of ['light', 'dark']) {
    test(`${locale} / ${theme}: HTTPS login, headers, layout and zero browser errors`, async ({
      page,
      context,
    }, info) => {
      let consoleErrors = 0;
      let pageErrors = 0;
      let apiErrors = 0;
      let apiRequests = 0;
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors++;
      });
      page.on('pageerror', () => {
        pageErrors++;
      });
      page.on('requestfailed', (request) => {
        if (new URL(request.url()).pathname.startsWith('/api/v1/')) apiErrors++;
      });
      page.on('response', (response) => {
        if (new URL(response.url()).pathname.startsWith('/api/v1/')) {
          apiRequests++;
          if (response.status() >= 400) apiErrors++;
        }
      });
      await page.addInitScript((value) => localStorage.setItem('theme', value), theme);
      const start = performance.now();
      const response = await page.goto(`/${locale}/login`);
      expect(response?.status()).toBe(200);
      await expect(page.locator('#login-email')).toBeVisible();
      await expect(page.locator('#login-password')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeEnabled();
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
      await expect(page.locator('html')).toHaveClass(new RegExp(theme));
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      ).toBeLessThanOrEqual(1);
      const headers = response?.headers() ?? {};
      expect(headers['cache-control']?.includes('no-store')).toBe(true);
      expect(headers['content-security-policy']?.includes("frame-ancestors 'none'")).toBe(true);
      expect(headers['content-security-policy']?.includes('unsafe-eval')).toBe(false);
      expect(Boolean(headers['strict-transport-security'])).toBe(true);
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['x-powered-by'] === undefined).toBe(true);
      const cookies = await context.cookies();
      const csrf = cookies.find((cookie) => cookie.name === '__Host-gs_csrf');
      // Only booleans/counters are asserted: cookie/token values never enter reports.
      expect(
        Boolean(
          csrf && csrf.secure && csrf.httpOnly && csrf.sameSite === 'Strict' && csrf.path === '/',
        ),
      ).toBe(true);
      expect(apiRequests > 0).toBe(true);
      expect(apiErrors).toBe(0);
      expect(consoleErrors).toBe(0);
      expect(pageErrors).toBe(0);
      info.annotations.push({
        type: 'observed-login-ms',
        description: String(Math.round(performance.now() - start)),
      });
    });
  }
}

test('API liveness, readiness, request IDs and exact CORS', async ({ request, baseURL }, info) => {
  const api = info.config.metadata['apiOrigin'] as string;
  for (const endpoint of ['/health/live', '/health/ready']) {
    const response = await request.get(`${api}${endpoint}`);
    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      status?: string;
      dependencies?: Record<string, string>;
    };
    expect(body.status === 'ok').toBe(true);
    if (endpoint.endsWith('ready')) {
      expect(
        ['postgres', 'redis', 'storage'].every((name) => body.dependencies?.[name] === 'up'),
      ).toBe(true);
    }
    expect(Boolean(response.headers()['x-request-id'])).toBe(true);
  }
  const allowed = await request.get(`${api}/api/v1/auth/csrf`, { headers: { Origin: baseURL! } });
  expect(allowed.status()).toBe(200);
  expect(allowed.headers()['access-control-allow-origin'] === baseURL).toBe(true);
  expect(allowed.headers()['access-control-allow-credentials']).toBe('true');
  const rejected = await request.get(`${api}/api/v1/auth/csrf`, {
    headers: { Origin: 'https://rejected.example.com' },
  });
  expect(rejected.status()).toBe(403);
});
