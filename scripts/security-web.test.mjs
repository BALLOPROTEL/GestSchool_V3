import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { securityHeaders, validateBuildApiOrigin } from '../apps/web/security-headers.mjs';

test('production CSP prevents framing, objects and eval, and sets HTTPS/browser protections', () => {
  const headers = Object.fromEntries(securityHeaders(true).map(({ key, value }) => [key, value]));
  const csp = headers['Content-Security-Policy'];
  assert.ok(csp.includes("frame-ancestors 'none'"));
  assert.ok(csp.includes("frame-src 'self' blob:"));
  assert.ok(csp.includes("object-src 'none'"));
  assert.ok(!csp.includes('unsafe-eval'));
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.ok(headers['Strict-Transport-Security']);
  assert.ok(
    !Object.fromEntries(securityHeaders(false).map(({ key, value }) => [key, value]))[
      'Strict-Transport-Security'
    ],
  );
});
test('workflow executes deterministic security certification with least privileges', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.ok(workflow.includes('Security hardening certification'));
  assert.ok(workflow.includes('pnpm security:test'));
  assert.ok(workflow.includes('contents: read'));
  assert.ok(workflow.includes('pnpm install --frozen-lockfile'));
  assert.ok(!workflow.includes('pull_request_target'));
  assert.ok(!workflow.includes('${{ github.event.'));
  for (const match of workflow.matchAll(/uses:\s+\S+@(\S+)/g))
    assert.match(match[1], /^[0-9a-f]{40}$/);
});

test('production web startup rejects missing, local and insecure origins', () => {
  for (const origin of [
    '',
    'http://school.example.com',
    'https://localhost',
    'https://school.example.invalid',
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        "import config from './next.config.ts'; config('phase-production-server');",
      ],
      {
        cwd: 'apps/web',
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_ENV: 'production',
          APP_PUBLIC_ORIGIN: origin,
          API_INTERNAL_URL: 'https://api.example.com',
        },
      },
    );
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('APP_PUBLIC_ORIGIN'));
  }
});

const manifest = (destination) => ({
  rewrites: {
    beforeFiles: [],
    afterFiles: [{ source: '/api/v1/:path*', destination }],
    fallback: [],
  },
});
test('Vercel builds require explicit remote mode and HTTPS origins before producing a bundle', () => {
  for (const changes of [
    { APP_ENV: undefined },
    { IAM_ENV: 'local' },
    { APP_PUBLIC_ORIGIN: undefined },
    { API_INTERNAL_URL: undefined },
    { API_INTERNAL_URL: 'http://127.0.0.1:3100' },
    { API_INTERNAL_URL: 'http://api.example.com' },
    { API_INTERNAL_URL: 'https://user:password@api.example.com' },
    {},
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        "import config from './next.config.ts'; config('phase-production-build');",
      ],
      {
        cwd: 'apps/web',
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_ENV: 'production',
          VERCEL: '1',
          APP_ENV: 'staging',
          IAM_ENV: 'staging',
          APP_PUBLIC_ORIGIN: 'https://web-staging.example.com',
          API_INTERNAL_URL: 'https://api-staging.example.com',
          ...changes,
        },
      },
    );
    assert.equal(result.status, Object.keys(changes).length ? 1 : 0);
  }
});
test('production refuses a hidden local or mismatched build-time API rewrite', () => {
  for (const destination of [
    'http://127.0.0.1:3100/api/v1/:path*',
    'https://other.example.com/api/v1/:path*',
    'https://user:password@api.example.com/api/v1/:path*',
  ])
    assert.throws(() => validateBuildApiOrigin(manifest(destination), 'https://api.example.com'));
  assert.throws(() => validateBuildApiOrigin({}, 'https://api.example.com'));
  assert.doesNotThrow(() =>
    validateBuildApiOrigin(
      manifest('https://api.example.com/api/v1/:path*'),
      'https://api.example.com',
    ),
  );
});
