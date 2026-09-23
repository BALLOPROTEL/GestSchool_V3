import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptMessagingToken, encryptMessagingToken } from './token.js';

describe('one-time delivery token envelope', () => {
  it('round-trips without plaintext and binds ciphertext to user and purpose', () => {
    const key = randomBytes(32).toString('base64');
    const raw = randomBytes(32).toString('base64url');
    const encrypted = encryptMessagingToken(raw, 'user-1', 'ACTIVATION', key);
    expect(encrypted).not.toContain(raw);
    expect(decryptMessagingToken(encrypted, 'user-1', 'ACTIVATION', key)).toBe(raw);
    expect(() => decryptMessagingToken(encrypted, 'user-2', 'ACTIVATION', key)).toThrow();
    expect(() => decryptMessagingToken(encrypted, 'user-1', 'PASSWORD_RESET', key)).toThrow();
  });
});
