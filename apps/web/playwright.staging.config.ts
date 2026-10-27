import { defineConfig, devices } from '@playwright/test';
import { requirePublicHttps } from '@gestschool/config/security';

const web = requirePublicHttps(process.env['STAGING_WEB_ORIGIN'], 'STAGING_WEB_ORIGIN', true);
const api = requirePublicHttps(process.env['STAGING_API_ORIGIN'], 'STAGING_API_ORIGIN', true);
if ([web, api].some((url) => url.hostname.replace(/\.$/, '') === 'gestschool.vercel.app'))
  throw new Error('The V2 demo is forbidden as a staging test target');

export default defineConfig({
  testDir: './e2e-staging',
  fullyParallel: false,
  forbidOnly: true,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  metadata: { apiOrigin: api.origin },
  use: {
    baseURL: web.origin,
    ignoreHTTPSErrors: false,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    [360, 800],
    [414, 896],
    [768, 1024],
    [1024, 768],
    [1366, 768],
    [1440, 900],
    [1920, 1080],
  ].map(([width, height]) => ({
    name: `${width}x${height}`,
    use: { ...devices['Desktop Chrome'], viewport: { width: width!, height: height! } },
  })),
  // No localhost server, DEV fixtures, credential files, writes or provider sends.
});
