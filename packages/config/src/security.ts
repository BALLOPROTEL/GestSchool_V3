import { isIP } from 'node:net';

// This validates configured destinations without performing DNS or network requests.
// It is not a DNS-rebinding defence for arbitrary user-controlled fetches: none are permitted.
export function isPrivateHost(input: string): boolean {
  const host = input
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (!host || host === 'localhost' || /\.(localhost|local|internal|invalid|test)$/.test(host))
    return true;
  const ip = isIP(host);
  if (ip === 6) return !/^[23][0-9a-f]{0,3}:/.test(host);
  if (ip === 4) {
    const [a = 0, b = 0] = host.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && [0, 168].includes(b)) ||
      (a === 198 && [18, 19].includes(b))
    );
  }
  return !host.includes('.') || host.includes('*');
}

export function requirePublicHttps(
  value: string | undefined,
  name: string,
  originOnly = false,
): URL {
  try {
    const url = new URL(value ?? '');
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      isPrivateHost(url.hostname) ||
      url.hash ||
      url.search ||
      (originOnly && url.origin !== value)
    )
      throw new Error();
    return url;
  } catch {
    throw new Error(`${name} requires an explicit public HTTPS ${originOnly ? 'origin' : 'URL'}`);
  }
}

export function requireStrongSecret(value: string | undefined, name: string, minimum = 32): string {
  if (
    !value ||
    value.length < minimum ||
    value.length > 4096 ||
    new Set(value).size < 12 ||
    /local|example|placeholder|change.?me|test[-_]|dummy|default|password|\.invalid/i.test(value)
  )
    throw new Error(`${name} requires a strong non-placeholder secret`);
  return value;
}

export function requireEncryptionKey(value: string, name: string): Buffer {
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length !== 32 || bytes.toString('base64') !== value || new Set(bytes).size < 16)
    throw new Error(`${name} requires a random canonical 256-bit key`);
  return bytes;
}

export function parseSecretJson(value: string, name: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${name} must be valid JSON`);
  }
}

export function validateDeploymentEnvironment(environment: NodeJS.ProcessEnv): void {
  const mode = environment['APP_ENV'];
  // Existing local/CI commands remain compatible; remote deployments set APP_ENV explicitly.
  if (mode === undefined) {
    if (environment['IAM_ENV'] === 'staging')
      throw new Error('Staging IAM requires explicit APP_ENV=staging');
    return;
  }
  if (!['development', 'test', 'staging', 'production'].includes(mode))
    throw new Error('APP_ENV must select development, test, staging or production');
  const remote = mode === 'staging' || mode === 'production';
  if (environment['NODE_ENV'] !== (remote ? 'production' : mode))
    throw new Error('APP_ENV and NODE_ENV must agree');
  if (environment['IAM_ENV'] !== (remote ? mode : 'local'))
    throw new Error('APP_ENV and IAM_ENV must agree');
}

export function validateProductionInfrastructure(environment: NodeJS.ProcessEnv): void {
  validateDeploymentEnvironment(environment);
  if (environment['NODE_ENV'] !== 'production') return;
  requirePublicHttps(environment['APP_PUBLIC_ORIGIN'], 'APP_PUBLIC_ORIGIN', true);
  requirePublicHttps(environment['DOCUMENT_PUBLIC_ORIGIN'], 'DOCUMENT_PUBLIC_ORIGIN', true);
  requirePublicHttps(environment['S3_ENDPOINT'], 'S3_ENDPOINT');
  requireStrongSecret(environment['S3_ACCESS_KEY_ID'], 'S3_ACCESS_KEY_ID', 16);
  requireStrongSecret(environment['S3_SECRET_ACCESS_KEY'], 'S3_SECRET_ACCESS_KEY');
  for (const name of ['DATABASE_URL', 'REDIS_URL'] as const) {
    const url = new URL(environment[name] ?? '');
    const host = new URL(`https://${url.hostname}`).hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, '')
      .replace(/\.$/, '');
    if (
      host === 'localhost' ||
      /\.(localhost|local|invalid|test)$/.test(host) ||
      host.startsWith('127.') ||
      ['::', '::1', '0.0.0.0'].includes(host) ||
      host.startsWith('::ffff:7f')
    )
      throw new Error(`${name} cannot use a local/example host`);
    requireStrongSecret(decodeURIComponent(url.password), `${name} password`);
    if (name === 'REDIS_URL' && url.protocol !== 'rediss:')
      throw new Error('Production Redis requires TLS');
    if (name === 'DATABASE_URL' && url.searchParams.get('sslmode') !== 'verify-full')
      throw new Error('Production PostgreSQL requires sslmode=verify-full');
  }
  if (environment['IAM_ENV'] !== 'production' && environment['IAM_ENV'] !== 'staging')
    throw new Error('Production forbids local IAM');
  if (environment['MESSAGING_PROVIDER'] !== 'brevo') throw new Error('Production requires Brevo');
  if (
    environment['LEGACY_TENANT_ID'] ||
    environment['DEFAULT_TENANT_ID'] ||
    environment['DEV_AUTH']
  )
    throw new Error('Production forbids DEV authentication and tenant fallbacks');
  // Production topology must be explicit: direct, or a trusted immediate loopback proxy.
  if (!['direct', 'loopback'].includes(environment['TRUST_PROXY'] ?? ''))
    throw new Error('TRUST_PROXY must explicitly select direct or loopback');
}

export function safeInternalRedirect(value: string, fallback = '/'): string {
  if (!value.startsWith('/') || value.startsWith('//') || /[\\\p{Cc}]/u.test(value))
    return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith('//') || /[\\\p{Cc}]/u.test(decoded)) return fallback;
    const url = new URL(value, 'https://gestschool.example');
    return url.origin === 'https://gestschool.example' ? value : fallback;
  } catch {
    return fallback;
  }
}

const sensitive =
  /authorization|cookie|password|token|totp|secret|key|email|phone|address|birth|grade|amount/i;
export function redactLog(input: unknown, depth = 0): unknown {
  if (depth > 6) return '[REDACTED]';
  // Free text and Error objects may contain credentials embedded in URLs or messages.
  if (typeof input === 'string' || input instanceof Error) return '[REDACTED]';
  if (Array.isArray(input)) return input.slice(0, 100).map((value) => redactLog(value, depth + 1));
  if (input && typeof input === 'object')
    return Object.fromEntries(
      Object.entries(input)
        .slice(0, 100)
        .map(([key, value]) => [
          key,
          sensitive.test(key) ? '[REDACTED]' : redactLog(value, depth + 1),
        ]),
    );
  return input;
}
