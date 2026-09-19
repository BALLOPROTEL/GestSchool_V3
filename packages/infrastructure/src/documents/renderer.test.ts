import { describe, expect, it } from 'vitest';
import type { DocumentSnapshot } from '@gestschool/contracts';
import { documentHtml, documentMoney, escapeDocumentText } from './renderer.js';
import { documentPublicOrigin } from './config.js';

const snapshot: DocumentSnapshot = {
  schemaVersion: 1,
  documentType: 'STUDENT_CARD',
  locale: 'fr',
  school: { name: 'École <img src="http://127.0.0.1/secret">', publicAddress: '' },
  holder: { name: '<script>fetch("http://169.254.169.254")</script>', matricule: 'A01' },
  academicYear: '2026–2027',
  academicPeriod: '',
  className: 'Sixième',
  issuedAt: '2026-09-13T00:00:00.000Z',
  template: {
    renderer: 'gestschool-v1',
    accent: '#3157a4',
    footer: '<iframe src="file:///etc/passwd"></iframe>',
  },
  report: null,
  receipt: null,
  enrollment: { type: 'NEW', status: 'ACTIVE', enrolledOn: '2026-09-01' },
};
describe('offline PDF template boundary', () => {
  it('formats minor amounts exactly, including above Number.MAX_SAFE_INTEGER', () => {
    expect(documentMoney('9007199254740993', 'EUR', 'en')).toContain('90,071,992,547,409.93');
    expect(documentMoney('100000', 'XOF', 'en')).toContain('100,000');
  });
  it('escapes all HTML metacharacters', () => {
    expect(escapeDocumentText('<>&"\'')).toBe('&lt;&gt;&amp;&quot;&#39;');
  });
  it.each(['fr', 'en', 'ar'] as const)(
    'embeds local fonts and a strict policy for %s',
    async (locale) => {
      const html = await documentHtml(
        { ...snapshot, locale },
        'CARD-2026-000001',
        `http://localhost:3000/${locale}/verify/${'x'.repeat(43)}`,
      );
      expect(html).toContain(`lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"`);
      expect(html).toContain('data:font/woff2;base64,');
      expect(html).toContain("default-src 'none'");
      expect(html).toContain('size:85.60mm 53.98mm');
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<iframe');
      expect(html).toContain('&lt;script&gt;');
      expect(html).not.toContain('src="http');
    },
  );
  it('rejects template CSS and remote resource injection', async () => {
    await expect(
      documentHtml(
        {
          ...snapshot,
          template: { ...snapshot.template, accent: 'red;@import url(http://127.0.0.1)' },
        },
        'REF',
        `http://localhost:3000/fr/verify/${'x'.repeat(43)}`,
      ),
    ).rejects.toThrow();
  });
  it.each([
    'file:///etc/passwd',
    'https://user:password@example.com/fr/verify/x',
    'https://example.com/?token=x',
  ])('rejects unsafe verification target %s', async (url) => {
    await expect(documentHtml(snapshot, 'REF', url)).rejects.toThrow();
  });
  it('requires HTTPS outside explicit loopback development', () => {
    expect(
      documentPublicOrigin({
        NODE_ENV: 'development',
        DOCUMENT_PUBLIC_ORIGIN: 'http://localhost:3000',
      }),
    ).toBe('http://localhost:3000');
    expect(() =>
      documentPublicOrigin({
        NODE_ENV: 'production',
        DOCUMENT_PUBLIC_ORIGIN: 'http://localhost:3000',
      }),
    ).toThrow();
    expect(() =>
      documentPublicOrigin({
        NODE_ENV: 'production',
        DOCUMENT_PUBLIC_ORIGIN: 'https://example.com/other',
      }),
    ).toThrow();
    expect(() => documentPublicOrigin({ NODE_ENV: 'production' })).toThrow();
  });
});
