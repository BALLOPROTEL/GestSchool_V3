import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import * as argon2 from 'argon2';
import { jwtVerify, SignJWT } from 'jose';
import { Secret, TOTP } from 'otpauth';
import { z } from 'zod';
import { IamError, type AccessClaims } from '../domain/context.js';
import type { IamConfig } from './iam-config.js';

export const opaqueToken = (): string => randomBytes(32).toString('base64url');
export const tokenHash = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function validatePassword(password: string): void {
  if (
    [...password].length < 12 ||
    [...password].length > 128 ||
    !password.trim() ||
    /[\p{Cc}]/u.test(password) ||
    /^(.)\1+$/u.test(password) ||
    ['passwordpassword', '123456789012', 'abcdefghijkl'].includes(password.toLowerCase())
  )
    throw new IamError('AUTH_PASSWORD_POLICY', 400);
}
export class Passwords {
  private readonly dummy: Promise<string>;
  constructor() {
    this.dummy = this.hash(opaqueToken());
  }
  hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
  }
  async verify(hash: string | null | undefined, password: string): Promise<boolean> {
    const valid = await argon2.verify(hash ?? (await this.dummy), password).catch(() => false);
    return Boolean(hash) && valid;
  }
}
const claimsSchema = z.object({
  sub: z.uuid(),
  sid: z.uuid(),
  tid: z.uuid(),
  mid: z.uuid(),
  iat: z.number(),
  exp: z.number(),
});
export class IamCrypto {
  constructor(readonly config: IamConfig) {}
  sign(claims: AccessClaims): Promise<string> {
    return new SignJWT({ ...claims })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
      .setIssuedAt()
      .setExpirationTime(`${this.config.accessSeconds}s`)
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .sign(createPrivateKey(this.config.keys.privateKey));
  }
  async verify(token: string): Promise<AccessClaims> {
    try {
      const { payload } = await jwtVerify(token, createPublicKey(this.config.keys.publicKey), {
        algorithms: ['EdDSA'],
        issuer: this.config.issuer,
        audience: this.config.audience,
        requiredClaims: ['sub', 'sid', 'tid', 'mid', 'iat', 'exp'],
        maxTokenAge: this.config.accessSeconds,
      });
      return claimsSchema.parse(payload);
    } catch {
      throw new IamError('AUTH_SESSION_EXPIRED');
    }
  }
  encrypt(secret: string, userId: string): string {
    const keyId = this.config.keys.mfaKeyId;
    const key = this.config.keys.mfaKeys[keyId];
    if (!key) throw new Error('Missing active MFA key');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv);
    cipher.setAAD(Buffer.from(`GestSchool:TOTP:${userId}`));
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return [
      keyId,
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }
  decrypt(encrypted: string, userId: string): string {
    const [keyId, iv, tag, ciphertext] = encrypted.split('.');
    const key = keyId && this.config.keys.mfaKeys[keyId];
    if (!key || !iv || !tag || !ciphertext) throw new Error('Invalid MFA ciphertext');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(key, 'base64'),
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAAD(Buffer.from(`GestSchool:TOTP:${userId}`));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
  totp(secret: string): TOTP {
    return new TOTP({
      issuer: 'GestSchool',
      label: 'GestSchool',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    });
  }
  newTotp(): { secret: string; uri: string } {
    const secret = new Secret({ size: 20 }).base32;
    return { secret, uri: this.totp(secret).toString() };
  }
  counter(secret: string, code: string): bigint | null {
    if (!/^\d{6}$/.test(code)) return null;
    const timestamp = Date.now();
    const delta = this.totp(secret).validate({ token: code, window: 1, timestamp });
    return delta === null ? null : BigInt(Math.floor(timestamp / 30000) + delta);
  }
  csrf(): string {
    const nonce = opaqueToken();
    return `${nonce}.${this.csrfMac(nonce)}`;
  }
  validCsrf(value: string): boolean {
    const [nonce, mac, extra] = value.split('.');
    return Boolean(nonce && mac && !extra && safeEqual(this.csrfMac(nonce), mac));
  }
  private csrfMac(nonce: string): string {
    return createHmac('sha256', Buffer.from(this.config.keys.csrfKey, 'base64'))
      .update(nonce)
      .digest('base64url');
  }
}
