import { spawnSync } from 'node:child_process';

// Local only: no audit API, provider calls or network scanners. One suite at a time.
const steps = [
  [
    'pnpm',
    ['--filter', '@gestschool/config...', '--filter', '@gestschool/infrastructure...', 'build'],
  ],
  ['node', ['scripts/security-secrets.mjs']],
  [
    'pnpm',
    [
      '--filter',
      '@gestschool/config',
      'exec',
      'vitest',
      'run',
      'src/security.test.ts',
      'src/messaging.test.ts',
    ],
  ],
  [
    'pnpm',
    [
      '--filter',
      '@gestschool/api',
      'exec',
      'vitest',
      'run',
      'src/security-hardening.test.ts',
      'src/infrastructure/staging-bootstrap-startup.test.ts',
      'src/modules/iam/domain/security.test.ts',
      'src/modules/messaging/domain/webhook-auth.test.ts',
      'src/modules/messaging/application/webhook.service.test.ts',
    ],
  ],
  [
    'pnpm',
    [
      '--filter',
      '@gestschool/infrastructure',
      'exec',
      'vitest',
      'run',
      'src/queue-security.test.ts',
      'src/database/postgres-health.test.ts',
      'src/storage/storage-security.test.ts',
      'src/documents/renderer.test.ts',
      'src/reports/serializers.test.ts',
      'src/messaging/provider.test.ts',
    ],
  ],
  [
    'pnpm',
    [
      '--filter',
      '@gestschool/worker',
      'exec',
      'vitest',
      'run',
      'src/jobs/reports/security.test.ts',
      'src/infrastructure/http-health.test.ts',
      'src/infrastructure/environment-verifier.service.test.ts',
    ],
  ],
  ['node', ['--test', 'scripts/security-web.test.mjs']],
  ['node', ['--test', 'scripts/staging-targets.test.mjs']],
  ['node', ['--test', 'scripts/staging-storage-probe.test.mjs']],
  ['node', ['--test', 'scripts/staging-redis-probe.test.mjs']],
  ['node', ['--test', 'scripts/staging-migrate.test.mjs']],
  ['node', ['--test', 'scripts/staging-bootstrap.test.mjs']],
  ['node', ['--test', 'scripts/security-runtime.test.mjs']],
  ['pnpm', ['--filter', '@gestschool/api', 'test:iam', 'tests/security.test.ts']],
];
for (const [command, args] of steps) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.error) throw new Error('Security command could not start');
  if (result.status !== 0) process.exit(result.status ?? 1);
}
