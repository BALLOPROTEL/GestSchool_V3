import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function list(changes) {
  return spawnSync('pnpm', ['staging:test:e2e', '--list'], {
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      ...process.env,
      STAGING_WEB_ORIGIN: 'https://web-staging.example.com',
      STAGING_API_ORIGIN: 'https://api-staging.example.com',
      ...changes,
    },
  });
}

test('staging suite refuses missing, local, insecure and V2 targets before making requests', () => {
  for (const changes of [
    { STAGING_WEB_ORIGIN: undefined },
    { STAGING_API_ORIGIN: undefined },
    { STAGING_WEB_ORIGIN: 'http://127.0.0.1:3000' },
    { STAGING_API_ORIGIN: 'http://api.example.com' },
    { STAGING_WEB_ORIGIN: 'https://gestschool.vercel.app' },
    { STAGING_WEB_ORIGIN: 'https://gestschool.vercel.app.' },
    { STAGING_API_ORIGIN: 'https://gestschool.vercel.app' },
  ]) {
    const result = list(changes);
    assert.equal(result.status, 1);
    assert.ok(!result.error);
    assert.ok(!result.stdout.includes('Total: 49 tests'));
  }
});

test('staging suite discovers all languages, themes and seven viewports without a local server', () => {
  const result = list({});
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('Total: 49 tests'));
  for (const viewport of [
    '360x800',
    '414x896',
    '768x1024',
    '1024x768',
    '1366x768',
    '1440x900',
    '1920x1080',
  ])
    assert.ok(result.stdout.includes(`[${viewport}]`));
  for (const locale of ['fr', 'en', 'ar'])
    for (const theme of ['light', 'dark'])
      assert.ok(result.stdout.includes(`${locale} / ${theme}`));
});
