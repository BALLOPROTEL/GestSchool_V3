import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { loadIamConfig } from './iam-config.js';
import { IamCrypto } from './crypto.js';
const config = loadIamConfig();
if (!config.local || !['development', 'test'].includes(process.env['NODE_ENV'] ?? ''))
  throw new Error('Local/test only');
const data = z
  .object({ accounts: z.array(z.object({ email: z.email(), mfaSecret: z.string().optional() })) })
  .parse(
    JSON.parse(
      await readFile(new URL('../../../../../../.local/test-access.json', import.meta.url), 'utf8'),
    ),
  );
const account = data.accounts.find((entry) => entry.email === process.argv[2]);
if (!account?.mfaSecret) throw new Error('Usage: pnpm dev:totp EMAIL (a local MFA account)');
const seconds = 30 - (Math.floor(Date.now() / 1000) % 30);
process.stdout.write(
  `MFA: ${new IamCrypto(config).totp(account.mfaSecret).generate()} (${seconds}s remaining; each code can be used only once).\n`,
);
