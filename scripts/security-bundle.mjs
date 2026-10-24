import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const canary = 'GESTSCHOOL_CANARY_SECRET_BUNDLE_LOT13';
const started = Date.now();
const environment = { ...process.env };
environment.NODE_ENV = 'production';
// Public, non-secret build fixtures. Production startup must match the build-time API origin.
environment.APP_PUBLIC_ORIGIN = 'https://school.example.com';
environment.API_INTERNAL_URL = 'https://api.example.com';
for (const name of [
  'DATABASE_URL',
  'REDIS_URL',
  'IAM_JWT_PRIVATE_KEY',
  'IAM_CSRF_KEY',
  'IAM_MFA_KEYS_JSON',
  'S3_SECRET_ACCESS_KEY',
  'BREVO_API_KEY',
  'BREVO_WEBHOOK_SECRET',
  'MESSAGING_TOKEN_KEY',
])
  environment[name] = canary;
environment.DATABASE_URL = `postgresql://canary:${canary}@127.0.0.1:5432/canary`;
environment.REDIS_URL = `redis://:${canary}@127.0.0.1:6379`;
const result = spawnSync('pnpm', ['build', '--env-mode=loose', '--concurrency=2', '--force'], {
  stdio: 'inherit',
  env: environment,
});
if (result.error) throw new Error('Canary build could not start');
if (result.status !== 0) process.exit(result.status ?? 1);
if (statSync('apps/web/.next/BUILD_ID').mtimeMs < started)
  throw new Error('Fresh frontend build was not produced');
let count = 0;
function scan(path) {
  for (const item of readdirSync(path, { withFileTypes: true })) {
    const file = join(path, item.name);
    if (item.isDirectory()) scan(file);
    else if (item.isFile()) {
      count++;
      if (readFileSync(file).includes(Buffer.from(canary)))
        throw new Error(`SERVER_SECRET_IN_PUBLIC_BUNDLE: ${file}`);
      if (file.endsWith('.map')) throw new Error(`PUBLIC_SOURCE_MAP: ${file}`);
    }
  }
}
scan('apps/web/.next/static');
if (!count) throw new Error('No public artifacts were scanned');
process.stdout.write(
  `Server bundle canary: PASS (${count} public artifacts, no browser source maps).\n`,
);
