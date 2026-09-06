import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { roleGrants } from '@gestschool/contracts';
import { IamCrypto, Passwords, validatePassword } from '../infrastructure/crypto.js';
import { loadIamConfig } from '../infrastructure/iam-config.js';
import { ScopePolicy } from './scope-policy.js';
import type { RequestContext } from './context.js';

const pair = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const keys = {
  ...pair,
  mfaKeys: { test: randomBytes(32).toString('base64') },
  mfaKeyId: 'test',
  csrfKey: randomBytes(32).toString('base64'),
};
const config = loadIamConfig({
  NODE_ENV: 'test',
  IAM_ENV: 'local',
  IAM_KEYS_JSON: JSON.stringify(keys),
});
const crypto = new IamCrypto(config);
describe('password security', () => {
  it('accepts long Unicode passphrases without composition rules', () => {
    expect(() => validatePassword('une longue phrase facile à retenir')).not.toThrow();
    expect(() => validatePassword('عبارة مرور طويلة وآمنة')).not.toThrow();
  });
  it.each([
    '',
    'short',
    'a'.repeat(129),
    ' '.repeat(16),
    'passwordpassword',
    'a'.repeat(12),
    'twelve\u0000characters',
  ])('rejects invalid input %#', (value) => expect(() => validatePassword(value)).toThrow());
  it('uses Argon2id with independent salts and verifies without a plaintext fallback', async () => {
    const passwords = new Passwords();
    const password = 'une longue phrase de certification';
    const a = await passwords.hash(password);
    const b = await passwords.hash(password);
    const [, algorithm, version, parameters] = a.split('$');
    expect(algorithm).toBe('argon2id');
    expect(version).toBe('v=19');
    expect(parameters?.split(',').toSorted()).toEqual(['m=65536', 'p=1', 't=3']);
    expect(a === b).toBe(false);
    expect(await passwords.verify(a, password)).toBe(true);
    expect(await passwords.verify(a, 'incorrect')).toBe(false);
    expect(await passwords.verify(null, password)).toBe(false);
  });
});
describe('token and MFA cryptography', () => {
  it('signs minimal asymmetric JWTs and rejects tampering and wrong audience', async () => {
    const claims = { sub: randomUUID(), sid: randomUUID(), mid: randomUUID(), tid: randomUUID() };
    const token = await crypto.sign(claims);
    const result = await crypto.verify(token);
    expect(result.sub).toBe(claims.sub);
    expect(
      Object.keys(
        JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as object,
      ).toSorted(),
    ).toEqual(['aud', 'exp', 'iat', 'iss', 'mid', 'sid', 'sub', 'tid']);
    await expect(crypto.verify(`${token.slice(0, -5)}xxxxx`)).rejects.toThrow();
    await expect(new IamCrypto({ ...config, audience: 'other' }).verify(token)).rejects.toThrow();
  });
  it('authenticates encrypted TOTP secrets and binds them to the user', () => {
    const secret = crypto.newTotp().secret;
    const encrypted = crypto.encrypt(secret, 'user-a');
    expect(encrypted.includes(secret)).toBe(false);
    expect(crypto.decrypt(encrypted, 'user-a') === secret).toBe(true);
    expect(() => crypto.decrypt(encrypted, 'user-b')).toThrow();
    expect(() => crypto.decrypt(`${encrypted}corrupt`, 'user-a')).toThrow();
  });
  it('validates TOTP and rejects malformed codes', () => {
    const totp = crypto.newTotp();
    expect(crypto.counter(totp.secret, crypto.totp(totp.secret).generate())).not.toBeNull();
    expect(crypto.counter(totp.secret, 'invalid')).toBeNull();
  });
  it('rejects unsigned and altered CSRF tokens', () => {
    const csrf = crypto.csrf();
    expect(crypto.validCsrf(csrf)).toBe(true);
    expect(crypto.validCsrf(`${csrf}x`)).toBe(false);
    expect(crypto.validCsrf('arbitrary')).toBe(false);
  });
  it('requires explicit production secrets and exact HTTPS origins', () => {
    const production = {
      NODE_ENV: 'production',
      IAM_ENV: 'production',
      IAM_JWT_PRIVATE_KEY: keys.privateKey,
      IAM_JWT_PUBLIC_KEY: keys.publicKey,
      IAM_MFA_KEYS_JSON: JSON.stringify(keys.mfaKeys),
      IAM_MFA_KEY_ID: keys.mfaKeyId,
      IAM_CSRF_KEY: keys.csrfKey,
      IAM_ALLOWED_ORIGINS: 'https://school.example.invalid',
    };
    expect(loadIamConfig(production).secure).toBe(true);
    expect(() => loadIamConfig({ NODE_ENV: 'production', IAM_ENV: 'local' })).toThrow();
    expect(() => loadIamConfig({ NODE_ENV: 'production', IAM_ENV: 'production' })).toThrow();
    expect(() =>
      loadIamConfig({
        ...production,
        IAM_ALLOWED_ORIGINS: '*',
      }),
    ).toThrow();
    expect(() =>
      loadIamConfig({
        ...production,
        IAM_ENV: 'staging',
        IAM_ALLOWED_ORIGINS: 'http://insecure.invalid',
      }),
    ).toThrow();
  });
});
const context = (role: keyof typeof roleGrants): RequestContext => ({
  requestId: randomUUID(),
  ipAddress: '',
  userAgent: '',
  userId: 'user-a',
  sessionId: 'session',
  membershipId: 'membership',
  tenantId: 'tenant-a',
  roles: [role],
  grants: [...roleGrants[role]],
});

describe('RBAC and scopes', () => {
  const policy = new ScopePolicy();

  it('grants accountant payments.create and denies grades.update', () => {
    expect(policy.allows(context('ACCOUNTANT'), 'payments.create', { tenantId: 'tenant-a' })).toBe(
      true,
    );
    expect(policy.allows(context('ACCOUNTANT'), 'grades.update', { tenantId: 'tenant-a' })).toBe(
      false,
    );
  });
  it('limits teacher grading to assigned resources and denies payment cancellation', () => {
    expect(
      policy.allows(context('TEACHER'), 'grades.create', {
        tenantId: 'tenant-a',
        assignedUserIds: ['user-a'],
      }),
    ).toBe(true);
    expect(
      policy.allows(context('TEACHER'), 'grades.create', {
        tenantId: 'tenant-a',
        assignedUserIds: [],
      }),
    ).toBe(false);
    expect(policy.allows(context('TEACHER'), 'payments.cancel', { tenantId: 'tenant-a' })).toBe(
      false,
    );
  });
  it('limits parents to CHILDREN', () => {
    expect(
      policy.allows(context('PARENT'), 'students.read', {
        tenantId: 'tenant-a',
        guardianUserIds: ['user-a'],
      }),
    ).toBe(true);
    expect(
      policy.allows(context('PARENT'), 'students.read', {
        tenantId: 'tenant-a',
        guardianUserIds: ['other'],
      }),
    ).toBe(false);
  });
  it('limits students to OWN', () => {
    expect(
      policy.allows(context('STUDENT'), 'students.read', {
        tenantId: 'tenant-a',
        ownerUserId: 'user-a',
      }),
    ).toBe(true);
    expect(
      policy.allows(context('STUDENT'), 'students.read', {
        tenantId: 'tenant-a',
        ownerUserId: 'other',
      }),
    ).toBe(false);
  });
  it('denies missing permissions, NONE and cross-tenant facts including PLATFORM', () => {
    expect(policy.allows(context('STUDENT'), 'unknown.permission', { tenantId: 'tenant-a' })).toBe(
      false,
    );
    expect(
      policy.allows(
        { ...context('STUDENT'), grants: [{ permission: 'students.read', scope: 'NONE' }] },
        'students.read',
        { tenantId: 'tenant-a' },
      ),
    ).toBe(false);
    for (const role of Object.keys(roleGrants) as (keyof typeof roleGrants)[])
      expect(
        policy.allows(context(role), 'students.read', {
          tenantId: 'tenant-b',
          ownerUserId: 'user-a',
          guardianUserIds: ['user-a'],
          assignedUserIds: ['user-a'],
        }),
      ).toBe(false);
  });
});
