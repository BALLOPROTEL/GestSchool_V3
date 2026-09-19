import type { Metadata } from 'next';
import { PublicDocumentVerification } from '../../../../features/documents/public-verification';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default function Page() {
  return <PublicDocumentVerification />;
}
