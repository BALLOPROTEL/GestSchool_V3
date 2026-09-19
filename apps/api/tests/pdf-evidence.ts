import { decodePDFRawStream, PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';
import jsQR, { type QRCode } from 'jsqr';

// jsQR is a CommonJS callable; its published default declaration is interpreted as a
// namespace under NodeNext. Keep the interoperability assertion at this one boundary.
const decodeQr = jsQR as unknown as (
  data: Uint8ClampedArray,
  width: number,
  height: number,
) => QRCode | null;

// Read the QR image embedded in the actual Chromium PDF, not a mocked token or HTML string.
// Callers must not log/serialize the returned URL.
export async function pdfEvidence(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes);
  let verificationUrl: string | null = null;
  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    if (
      !(object instanceof PDFRawStream) ||
      object.dict.get(PDFName.of('Subtype'))?.toString() !== '/Image'
    )
      continue;
    const width = object.dict.lookup(PDFName.of('Width'), PDFNumber).asNumber(),
      height = object.dict.lookup(PDFName.of('Height'), PDFNumber).asNumber();
    if (width < 100 || height < 100 || width > 1200 || height > 1200) continue;
    const raw = decodePDFRawStream(object).decode();
    const channels = raw.length / (width * height);
    if (channels !== 1 && channels !== 3) continue;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = raw[i * channels] ?? 0;
      rgba[i * 4 + 1] = raw[i * channels + (channels === 3 ? 1 : 0)] ?? 0;
      rgba[i * 4 + 2] = raw[i * channels + (channels === 3 ? 2 : 0)] ?? 0;
      rgba[i * 4 + 3] = 255;
    }
    const decoded = decodeQr(rgba, width, height);
    if (decoded) {
      verificationUrl = decoded.data;
      break;
    }
  }
  return { pages: pdf.getPages().map((p) => p.getSize()), verificationUrl };
}
