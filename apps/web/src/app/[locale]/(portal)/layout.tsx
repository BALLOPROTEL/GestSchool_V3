import type { ReactNode } from 'react';

import { PortalShell } from '../../../components/portal-shell';
import { SessionBoundary } from '../../../features/auth/auth-provider';

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <SessionBoundary>
      <PortalShell>{children}</PortalShell>
    </SessionBoundary>
  );
}
