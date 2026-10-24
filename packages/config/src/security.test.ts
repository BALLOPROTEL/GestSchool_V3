import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadInfrastructureConfig } from './environment.js';
import { loadMessagingConfig } from './messaging.js';
import {
  requireEncryptionKey,
  requirePublicHttps,
  requireStrongSecret,
  safeInternalRedirect,
  redactLog,
  validateDeploymentEnvironment,
} from './security.js';

const secret = () => randomBytes(32).toString('hex');
describe('LOT14 environment separation', () => {
  it.each(['development', 'test', 'staging', 'production'])(
    'accepts the explicit %s environment',
    (mode) => {
      const remote = mode === 'staging' || mode === 'production';
      expect(() =>
        validateDeploymentEnvironment({
          APP_ENV: mode,
          NODE_ENV: remote ? 'production' : mode,
          IAM_ENV: remote ? mode : 'local',
        }),
      ).not.toThrow();
    },
  );
  it.each([
    { NODE_ENV: 'production', IAM_ENV: 'staging' },
    { APP_ENV: 'staging', NODE_ENV: 'development', IAM_ENV: 'local' },
    { APP_ENV: 'staging', NODE_ENV: 'test', IAM_ENV: 'staging' },
    { APP_ENV: 'staging', NODE_ENV: 'production', IAM_ENV: 'local' },
    { APP_ENV: 'staging', NODE_ENV: 'production', IAM_ENV: 'production' },
    { APP_ENV: 'staging', NODE_ENV: 'production' },
    { APP_ENV: 'production', NODE_ENV: 'production', IAM_ENV: 'staging' },
    { APP_ENV: 'unknown', NODE_ENV: 'development', IAM_ENV: 'local' },
  ])('rejects environment drift (%#)', (environment) => {
    expect(() => validateDeploymentEnvironment(environment)).toThrow();
  });
  it('rejects staging-to-DEV fallback before loading infrastructure, messaging or key files', () => {
    const environment = { APP_ENV: 'staging', NODE_ENV: 'development', IAM_ENV: 'local' };
    expect(() => loadMessagingConfig(environment)).toThrow(/APP_ENV/);
    // Supply a valid local shape to reach the deployment validation.
    expect(() => loadInfrastructureConfig({ ...production(), ...environment })).toThrow(/APP_ENV/);
  });
});
function production(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    IAM_ENV: 'production',
    TRUST_PROXY: 'direct',
    MESSAGING_PROVIDER: 'brevo',
    APP_PUBLIC_ORIGIN: 'https://school.example.com',
    DOCUMENT_PUBLIC_ORIGIN: 'https://school.example.com',
    DATABASE_URL: `postgresql://app:${secret()}@db.example.com/school?sslmode=verify-full`,
    REDIS_URL: `rediss://app:${secret()}@redis.example.com:6380`,
    S3_ENDPOINT: 'https://s3.example.com',
    S3_REGION: 'eu-west-1',
    S3_BUCKET: 'school-private',
    S3_ACCESS_KEY_ID: randomBytes(20).toString('hex'),
    S3_SECRET_ACCESS_KEY: secret(),
    S3_FORCE_PATH_STYLE: 'true',
  };
}
describe('LOT13 production fail closed', () => {
  it('accepts explicit TLS infrastructure with independent non-default credentials', () => {
    expect(loadInfrastructureConfig(production()).nodeEnvironment).toBe('production');
  });
  it.each([
    ['APP_PUBLIC_ORIGIN', undefined],
    ['APP_PUBLIC_ORIGIN', 'http://school.example.com'],
    ['APP_PUBLIC_ORIGIN', 'https://localhost'],
    ['APP_PUBLIC_ORIGIN', 'https://school.example.invalid'],
    ['DOCUMENT_PUBLIC_ORIGIN', 'https://127.0.0.1'],
    ['S3_ENDPOINT', 'http://s3.example.com'],
    ['S3_SECRET_ACCESS_KEY', 'gestschool-local-secret'],
    ['S3_SECRET_ACCESS_KEY', 'a'.repeat(64)],
    ['REDIS_URL', undefined],
    ['REDIS_URL', 'redis://redis.example.com'],
    ['DATABASE_URL', 'postgresql://app:default@db.example.com/school'],
    ['MESSAGING_PROVIDER', 'local'],
    ['IAM_ENV', 'local'],
    ['TRUST_PROXY', undefined],
    ['TRUST_PROXY', 'true'],
    ['DEV_AUTH', 'true'],
    ['DEFAULT_TENANT_ID', 'legacy'],
    ['LEGACY_TENANT_ID', 'legacy'],
  ])('rejects unsafe %s (%#)', (name, value) => {
    expect(() => loadInfrastructureConfig({ ...production(), [name!]: value })).toThrow();
  });
  it('rejects weak/reused encryption material and placeholder provider secrets', () => {
    expect(() => requireEncryptionKey(Buffer.alloc(32, 1).toString('base64'), 'KEY')).toThrow();
    expect(() => requireStrongSecret('placeholder'.repeat(8), 'KEY')).toThrow();
    expect(() =>
      loadMessagingConfig({ NODE_ENV: 'production', MESSAGING_PROVIDER: 'local' }),
    ).toThrow();
  });
});
describe('LOT13 SSRF validation only — no requests', () => {
  it.each([
    'http://127.0.0.1',
    'http://localhost',
    'http://169.254.169.254',
    'http://10.0.0.1',
    'http://172.16.0.1',
    'http://192.168.0.1',
    'http://[::1]',
    'file:///etc/passwd',
    'ftp://school.example.com',
    'https://127.1',
    'https://2130706433',
    'https://0x7f000001',
    'https://[::ffff:127.0.0.1]',
    'https://[fc00::1]',
    'https://[fe80::1]',
    'https://localhost.',
    'https://user:password@school.example.com',
    'https://school.example.invalid',
    'https://100.64.0.1',
  ])('rejects %s without any network operation', (value) =>
    expect(() => requirePublicHttps(value, 'URL')).toThrow(),
  );
  it('accepts a fixed public HTTPS origin', () =>
    expect(requirePublicHttps('https://school.example.com', 'URL', true).origin).toBe(
      'https://school.example.com',
    ));
});
describe('redirect and log boundaries', () => {
  it.each([
    'https://attacker.example',
    '//attacker.example',
    'javascript:alert(1)',
    'data:text/html,x',
    '/\\attacker.example',
    '/%2fattacker.example',
    '/%5cattacker.example',
    '/%0d%0aLocation:x',
  ])('rejects %s', (value) => expect(safeInternalRedirect(value)).toBe('/'));
  it('keeps internal paths', () =>
    expect(safeInternalRedirect('/fr/login?reason=expired')).toBe('/fr/login?reason=expired'));
  it('redacts credentials, free text, errors and nested PII canaries', () => {
    const canary = 'GESTSCHOOL_CANARY_SECRET_LOG';
    const fields = [
      'authorization',
      'cookie',
      'set-cookie',
      'password',
      'passwordHash',
      'refreshToken',
      'accessToken',
      'activationToken',
      'resetToken',
      'totp',
      'totpSecret',
      'webhookSecret',
      'apiKey',
      'awsCredentials',
      'brevoCredentials',
      'email',
      'phone',
      'address',
    ];
    const output = JSON.stringify(
      redactLog({
        ...Object.fromEntries(fields.map((key) => [key, canary])),
        nested: [new Error(canary), { message: canary }],
        count: 1,
      }),
    );
    expect(output).not.toContain(canary);
    expect(output).toContain('REDACTED');
  });
});
