import { createHash, createHmac } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';

export interface MfaState {
  secret: string;
  counter: number;
}

const defaultDirectory = new URL('../../../.local/e2e-mfa/', import.meta.url);
function stateFile(email: string, directory: URL) {
  return new URL(`${createHash('sha256').update(email).digest('hex')}.json`, directory);
}

// Test-only state survives Playwright worker replacement. Never log or attach its contents.
export async function readMfaState(
  email: string,
  directory = defaultDirectory,
): Promise<MfaState | null> {
  let text: string;
  try {
    text = await readFile(stateFile(email, directory), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw new Error('Cannot read private E2E MFA state', { cause: error });
  }
  try {
    const value: unknown = JSON.parse(text);
    if (
      typeof value === 'object' &&
      value !== null &&
      'secret' in value &&
      typeof value.secret === 'string' &&
      value.secret.length > 0 &&
      'counter' in value &&
      typeof value.counter === 'number' &&
      Number.isSafeInteger(value.counter) &&
      value.counter >= 0
    )
      return { secret: value.secret, counter: value.counter };
  } catch {
    // JSON parser messages can quote input, including the secret.
  }
  throw new Error('Invalid private E2E MFA state');
}

export async function writeMfaState(email: string, state: MfaState, directory = defaultDirectory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const file = stateFile(email, directory);
  await writeFile(file, JSON.stringify(state), { mode: 0o600 });
  await chmod(file, 0o600);
}

export function nextMfaCounter(now: number, previous = -1) {
  const current = Math.floor(now / 30_000);
  if (previous > current) throw new Error('E2E MFA clock moved backwards');
  const counter = Math.max(current, previous + 1);
  return { counter, waitMs: counter > current ? counter * 30_000 - now + 100 : 0 };
}

// Independent RFC 6238 calculation; no production authenticator or bypass endpoint.
export function totp(secret: string, counter: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret]
    .map((letter) => alphabet.indexOf(letter).toString(2).padStart(5, '0'))
    .join('');
  const key = Buffer.from(bits.match(/.{8}/g)?.map((byte) => Number.parseInt(byte, 2)) ?? []);
  const time = Buffer.alloc(8);
  time.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(time).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}
