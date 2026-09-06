import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

if (process.env.NODE_ENV === 'production')
  throw new Error('Local key generation is disabled in production');
const directory = new URL('../.local/', import.meta.url);
await mkdir(directory, { recursive: true, mode: 0o700 });
const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
try {
  await writeFile(
    new URL('iam.keys.json', directory),
    JSON.stringify({
      privateKey,
      publicKey,
      mfaKeys: { local1: randomBytes(32).toString('base64') },
      mfaKeyId: 'local1',
      csrfKey: randomBytes(32).toString('base64'),
    }),
    { mode: 0o600, flag: 'wx' },
  );
  process.stdout.write('Local IAM keys created in .local/iam.keys.json (0600). No key printed.\n');
} catch (error) {
  if (error instanceof Error && 'code' in error && error.code === 'EEXIST')
    process.stdout.write('Existing local IAM keys preserved.\n');
  else throw error;
}
