import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { loadIamConfig } from './iam-config.js';
import { IamRuntime } from './iam-runtime.js';

const config = loadIamConfig();
if (!config.local || process.env['NODE_ENV'] === 'production')
  throw new Error('IAM dev delivery is local/test only');
const [operation, email] = process.argv.slice(2);
if (!email?.endsWith('.invalid') || !['activation', 'reset'].includes(operation ?? ''))
  throw new Error('Usage: pnpm iam:dev activation|reset user@example.invalid');
const infrastructure = loadInfrastructureConfig();
const iam = new IamRuntime(config, infrastructure.databaseUrl, infrastructure.redisUrl);
try {
  const token = await iam.credentials.issue(
    email,
    operation === 'activation' ? 'ACTIVATION' : 'PASSWORD_RESET',
    { requestId: randomUUID(), ipAddress: 'local-cli', userAgent: 'local-cli' },
  );
  if (!token) throw new Error('No eligible local account');
  const directory = new URL('../../../../../../.local/', import.meta.url);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const page = operation === 'activation' ? 'activation' : 'reset-password';
  await writeFile(
    new URL('iam-delivery.json', directory),
    JSON.stringify({ email, url: `http://127.0.0.1:3000/fr/${page}#token=${token}` }),
    { mode: 0o600 },
  );
  process.stdout.write(
    'Local one-time link written to .local/iam-delivery.json (0600); no token printed.\n',
  );
} finally {
  await iam.repository.close();
}
