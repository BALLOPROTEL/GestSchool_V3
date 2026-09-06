import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const keySchema = z.object({
  privateKey: z.string().min(100),
  publicKey: z.string().min(60),
  mfaKeys: z.record(z.string().regex(/^[a-zA-Z0-9_-]+$/), z.string()),
  mfaKeyId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  csrfKey: z.string(),
});
export type IamKeys = z.infer<typeof keySchema>;
export interface IamConfig {
  keys: IamKeys;
  origins: string[];
  secure: boolean;
  issuer: string;
  audience: string;
  accessSeconds: number;
  sessionSeconds: number;
  redisPrefix: string;
  local: boolean;
}
export function loadIamConfig(environment: NodeJS.ProcessEnv = process.env): IamConfig {
  const mode = z.enum(['local', 'staging', 'production']).parse(environment['IAM_ENV'] ?? 'local');
  if (environment['NODE_ENV'] === 'production' && mode === 'local')
    throw new Error('IAM_ENV must be staging or production with NODE_ENV=production');
  const local = mode === 'local';
  const encodedKeys = environment['IAM_KEYS_JSON'];
  const raw: unknown = environment['IAM_MFA_KEYS_JSON']
    ? {
        privateKey: environment['IAM_JWT_PRIVATE_KEY'],
        publicKey: environment['IAM_JWT_PUBLIC_KEY'],
        mfaKeys: JSON.parse(environment['IAM_MFA_KEYS_JSON']),
        mfaKeyId: environment['IAM_MFA_KEY_ID'],
        csrfKey: environment['IAM_CSRF_KEY'],
      }
    : encodedKeys && local
      ? JSON.parse(encodedKeys)
      : local
        ? JSON.parse(
            readFileSync(
              fileURLToPath(new URL('../../../../../../.local/iam.keys.json', import.meta.url)),
              'utf8',
            ),
          )
        : null;
  const keys = keySchema.parse(raw);
  if (
    Buffer.from(keys.csrfKey, 'base64').length !== 32 ||
    !keys.mfaKeys[keys.mfaKeyId] ||
    Object.values(keys.mfaKeys).some((value) => Buffer.from(value, 'base64').length !== 32)
  )
    throw new Error('IAM requires independent 256-bit encryption and CSRF keys');
  const origins = (
    environment['IAM_ALLOWED_ORIGINS'] ??
    (local ? 'http://localhost:3000,http://127.0.0.1:3000' : '')
  )
    .split(',')
    .filter(Boolean);
  if (
    !origins.length ||
    origins.some((origin) => {
      const url = new URL(origin);
      return (
        url.origin !== origin ||
        url.username ||
        url.password ||
        !['http:', 'https:'].includes(url.protocol) ||
        (!local && url.protocol !== 'https:') ||
        origin.includes('*')
      );
    })
  )
    throw new Error(
      'IAM requires exact HTTP origins locally and HTTPS origins in staging/production',
    );
  return {
    keys,
    origins,
    secure: !local,
    local,
    issuer: 'gestschool-iam',
    audience: 'gestschool-api',
    accessSeconds: 300,
    sessionSeconds: 604800,
    redisPrefix: environment['IAM_REDIS_PREFIX'] ?? `gestschool:iam:${mode}`,
  };
}
