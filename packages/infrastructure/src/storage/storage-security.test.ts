import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateStorageKey } from './s3-storage-adapter.js';

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
