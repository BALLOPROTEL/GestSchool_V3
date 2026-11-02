import type { ReactNode } from 'react';

import { PortalShell } from '../../../components/portal-shell';
import { SessionBoundary } from '../../../features/auth/auth-provider';

export default function PortalLayout({ children }: { children: ReactNode }) {
  const showDemoBanner = process.env['APP_ENV'] !== 'production';
  return (
    <SessionBoundary>
      <PortalShell showDemoBanner={showDemoBanner}>{children}</PortalShell>
    </SessionBoundary>
  );
}
