import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { Credentials } from './mfa-helpers';

interface AuthFixture {
  activation: Credentials & { token: string };
  reset: Credentials & { token: string };
}

export async function freshAuthFixture(): Promise<AuthFixture> {
  try {
    await promisify(execFile)(
      process.execPath,
      [
        '--env-file=.env.example',
        '--env-file-if-exists=.env',
        '--import',
        'tsx',
        'apps/api/tests/e2e-auth-fixture.ts',
      ],
      {
        cwd: fileURLToPath(new URL('../../../', import.meta.url)),
        env: {
          ...process.env,
          NODE_ENV: 'test',
          IAM_ENV: 'local',
          TSX_TSCONFIG_PATH: 'apps/api/tsconfig.json',
        },
        timeout: 30_000,
      },
    );
    return JSON.parse(
      await readFile(new URL('../../../.local/iam-e2e-auth.json', import.meta.url), 'utf8'),
    ) as AuthFixture;
  } catch {
    // Child process diagnostics / JSON parser errors must not disclose private credentials.
    throw new Error('Cannot prepare private E2E auth fixture (sensitive diagnostics omitted)');
  }
}
