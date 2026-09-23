import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export function encryptMessagingToken(
  token: string,
  userId: string,
  purpose: string,
  keyBase64: string,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyBase64, 'base64'), iv);
  cipher.setAAD(Buffer.from(`GestSchool:Messaging:${userId}:${purpose}`));
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptMessagingToken(
  encrypted: string,
  userId: string,
  purpose: string,
  keyBase64: string,
): string {
  const parts = encrypted.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error('MESSAGING_TOKEN_INVALID');
  const [iv, tag, ciphertext] = parts as [string, string, string];
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(keyBase64, 'base64'),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAAD(Buffer.from(`GestSchool:Messaging:${userId}:${purpose}`));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
