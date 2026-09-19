import { proxyDocumentVerification } from '../../../../../../../features/documents/verification-proxy';

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  return proxyDocumentVerification((await context.params).token);
}
