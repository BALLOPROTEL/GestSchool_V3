import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: '360x800',
      use: { ...devices['Desktop Chrome'], viewport: { height: 800, width: 360 } },
    },
    {
      name: '414x896',
      use: { ...devices['Desktop Chrome'], viewport: { height: 896, width: 414 } },
    },
    {
      name: '768x1024',
      use: { ...devices['Desktop Chrome'], viewport: { height: 1024, width: 768 } },
    },
    {
      name: '1024x768',
      use: { ...devices['Desktop Chrome'], viewport: { height: 768, width: 1024 } },
    },
    {
      name: '1366x768',
      use: { ...devices['Desktop Chrome'], viewport: { height: 768, width: 1366 } },
    },
    {
      name: '1440x900',
      use: { ...devices['Desktop Chrome'], viewport: { height: 900, width: 1440 } },
    },
    {
      name: '1920x1080',
      use: { ...devices['Desktop Chrome'], viewport: { height: 1080, width: 1920 } },
    },
  ],
  webServer: {
    command: 'pnpm start --hostname 127.0.0.1 --port 3000',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
