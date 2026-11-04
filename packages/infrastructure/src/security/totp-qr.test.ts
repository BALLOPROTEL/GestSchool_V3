import { describe, expect, it } from 'vitest';
import { totpQrDataUrl } from './totp-qr.js';

describe('TOTP QR rendering', () => {
  it('renders only otpauth TOTP enrollment URIs as private data URLs', async () => {
    const image = await totpQrDataUrl(
      'otpauth://totp/GestSchool%3Aadmin%40example.invalid?secret=JBSWY3DPEHPK3PXP&issuer=GestSchool',
    );
    expect(image.startsWith('data:image/png;base64,')).toBe(true);
  });

  it.each([
    'https://example.invalid/?secret=JBSWY3DPEHPK3PXP',
    'otpauth://hotp/GestSchool?secret=JBSWY3DPEHPK3PXP',
    'otpauth://totp/GestSchool',
  ])('rejects non-TOTP enrollment input: %s', async (uri) => {
    await expect(totpQrDataUrl(uri)).rejects.toThrow('TOTP_QR_URI_INVALID');
  });
});
