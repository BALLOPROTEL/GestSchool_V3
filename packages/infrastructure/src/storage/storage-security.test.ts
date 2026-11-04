import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  validateAvatarImage,
  validateAvatarStorageKey,
  validateStorageKey,
} from './s3-storage-adapter.js';

describe('LOT13 object key traversal boundary', () => {
  const prefix = `tenants/${randomUUID()}/documents/${randomUUID()}/`;
  it.each([
    '../../x',
    '..\\..\\x',
    '%2e%2e/x',
    'x%2fy',
    'x%5cy',
    '',
    'image.svg',
    'receipt.pdf.html',
    'tenant@example.com.pdf',
  ])('rejects %s before any S3 request', (value) =>
    expect(() => validateStorageKey(prefix + value, 'document')).toThrow(),
  );
  it('accepts only server generated tenant/UUID/content-hash paths', () => {
    expect(() => validateStorageKey(prefix + 'a'.repeat(64) + '.pdf', 'document')).not.toThrow();
    expect(() => validateStorageKey(prefix + 'a'.repeat(64) + '.pdf', 'report')).toThrow();
    expect(() =>
      validateStorageKey(
        `tenants/${randomUUID()}/reports/${randomUUID()}/${'a'.repeat(64)}.csv`,
        'report',
      ),
    ).not.toThrow();
  });
});

describe('LOT18 private avatar boundary', () => {
  const tenantId = randomUUID();
  const ownerId = randomUUID();

  it('accepts only tenant-scoped server-generated avatar keys', () => {
    expect(() =>
      validateAvatarStorageKey(
        `tenants/${tenantId}/avatars/students/${ownerId}/${randomUUID()}.png`,
      ),
    ).not.toThrow();
    expect(() =>
      validateAvatarStorageKey(
        `tenants/${tenantId}/avatars/memberships/${ownerId}/${randomUUID()}.jpg`,
      ),
    ).not.toThrow();
    expect(() =>
      validateAvatarStorageKey(`tenants/${tenantId}/avatars/students/${ownerId}/../../x.png`),
    ).toThrow();
    expect(() =>
      validateAvatarStorageKey(`tenants/${tenantId}/avatars/users/${ownerId}/${randomUUID()}.png`),
    ).toThrow();
  });

  it('validates PNG magic bytes and dimensions', () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    png.set([0x00, 0x00, 0x01, 0x00], 16);
    png.set([0x00, 0x00, 0x01, 0x00], 20);
    expect(() => validateAvatarImage(png, 'image/png')).not.toThrow();

    const tiny = png.slice();
    tiny.set([0x00, 0x00, 0x00, 0x10], 16);
    expect(() => validateAvatarImage(tiny, 'image/png')).toThrow('AVATAR_OBJECT_INVALID');

    const spoofed = png.slice();
    spoofed[0] = 0xff;
    expect(() => validateAvatarImage(spoofed, 'image/png')).toThrow('AVATAR_OBJECT_INVALID');
  });

  it('validates JPEG SOF dimensions instead of trusting the declared MIME', () => {
    const jpeg = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x00, 0x01, 0x00, 0x03, 0x01, 0x11, 0x00,
      0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
    ]);
    expect(() => validateAvatarImage(jpeg, 'image/jpeg')).not.toThrow();
    expect(() => validateAvatarImage(jpeg, 'image/png')).toThrow('AVATAR_OBJECT_INVALID');
  });
});
