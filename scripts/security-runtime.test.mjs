import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function rejects(entry, tsconfig) {
  const result = spawnSync(
    process.execPath,
    ['--env-file=.env.example', '--import', 'tsx', entry],
    {
      encoding: 'utf8',
      timeout: 15_000,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        IAM_ENV: 'local',
        ...(tsconfig ? { TSX_TSCONFIG_PATH: tsconfig } : {}),
      },
    },
  );
  assert.equal(result.status, 1, `${entry} must reject DEV configuration in production`);
  assert.ok(!result.error, `${entry} should exit explicitly rather than timing out`);
}
test('API and worker startup refuse production with DEV configuration before serving', () => {
  rejects('apps/api/src/main.ts', 'apps/api/tsconfig.json');
  rejects('apps/worker/src/main.ts', 'apps/worker/tsconfig.json');
});
test('DEV commands refuse production without displaying access material', () => {
  for (const entry of [
    'scripts/iam-keys.mjs',
    'scripts/messaging-dev.mjs',
    'apps/api/src/modules/iam/infrastructure/dev-access.ts',
    'apps/api/src/modules/iam/infrastructure/dev-totp.ts',
    'apps/api/src/modules/iam/infrastructure/dev-cli.ts',
    'packages/database/prisma/seed.ts',
  ])
    rejects(entry, 'apps/api/tsconfig.json');
});
test('the LOCAL provider cannot be constructed in production even with forged config', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import {LocalMessagingProvider} from './packages/infrastructure/dist/index.js'; new LocalMessagingProvider();",
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'production' },
    },
  );
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('LOCAL_PROVIDER_FORBIDDEN'));
});
