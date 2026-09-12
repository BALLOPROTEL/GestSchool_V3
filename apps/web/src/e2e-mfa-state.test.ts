import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { nextMfaCounter, readMfaState, totp, writeMfaState } from '../e2e/mfa-state';

const directories: string[] = [];
async function directory() {
  const path = await mkdtemp(join(tmpdir(), 'gestschool-mfa-state-'));
  directories.push(path);
  return pathToFileURL(`${path}/`);
}
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true });
});

describe('E2E MFA retry state (test infrastructure only)', () => {
  it('starts without assuming an enrollment has already occurred', async () => {
    expect(await readMfaState('fresh@example.invalid', await directory())).toBeNull();
  });
  it('persists enrollment and consumed counters independently of worker memory', async () => {
    const root = await directory();
    // Public RFC 6238 vector, never a real account secret.
    const state = { secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', counter: 42 };
    await writeMfaState('retry@example.invalid', state, root);
    expect(await readMfaState('retry@example.invalid', root)).toEqual(state);
    expect(await readMfaState('other@example.invalid', root)).toBeNull();
    const files = await readdir(root);
    expect(files).toHaveLength(1);
    expect(files[0]).not.toContain('retry@example.invalid');
    expect((await stat(root)).mode & 0o777).toBe(0o700);
    expect((await stat(new URL(files[0]!, root))).mode & 0o777).toBe(0o600);
  });
  it('never exposes corrupt private JSON in the thrown error', async () => {
    const root = await directory();
    await writeMfaState(
      'retry@example.invalid',
      { secret: 'public-test-vector', counter: 1 },
      root,
    );
    const files = await readdir(root);
    await writeFile(new URL(files[0]!, root), '{"secret":"public-test-vector",');
    await expect(readMfaState('retry@example.invalid', root)).rejects.toThrow(
      /^Invalid private E2E MFA state$/,
    );
  });
  it('does not wait for a code that has never been used', () => {
    expect(nextMfaCounter(65_000)).toEqual({ counter: 2, waitMs: 0 });
  });
  it('waits for a fresh counter even if the previous worker lost the server response', () => {
    expect(nextMfaCounter(65_000, 2)).toEqual({ counter: 3, waitMs: 25_100 });
    expect(nextMfaCounter(90_100, 2)).toEqual({ counter: 3, waitMs: 0 });
  });
  it('fails explicitly if the host clock moves backwards', () => {
    expect(() => nextMfaCounter(65_000, 3)).toThrow('E2E MFA clock moved backwards');
  });
  it('generates the six-digit RFC 6238 SHA1 test vector without using production code', () => {
    expect(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1)).toBe('287082');
  });
});
