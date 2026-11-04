import QRCode from 'qrcode';

export async function totpQrDataUrl(uri: string): Promise<string> {
  if (uri.length > 2_048) throw new Error('TOTP_QR_URI_INVALID');
  const parsed = new URL(uri);
  if (
    parsed.protocol !== 'otpauth:' ||
    parsed.hostname !== 'totp' ||
    !parsed.pathname ||
    !parsed.searchParams.get('secret') ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  )
    throw new Error('TOTP_QR_URI_INVALID');

  return QRCode.toDataURL(uri, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 240,
  });
}
