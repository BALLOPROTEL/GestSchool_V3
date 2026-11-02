'use client';

import type { LoginResult, MembershipContextView, SessionView } from '@gestschool/contracts';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { authRequest } from '../auth/auth-client';
import { useAuth } from '../auth/auth-provider';

type Authenticated = Extract<LoginResult, { kind: 'session' }>;

interface ShellContextValue {
  memberships: MembershipContextView[];
  activeAcademicYear: MembershipContextView['activeAcademicYear'];
  contextLoading: boolean;
  switchingTenant: boolean;
  switchTenant: (membershipId: string) => Promise<void>;
}

const ShellContext = createContext<ShellContextValue | null>(null);

function currentMembership(session: SessionView): MembershipContextView {
  return {
    membershipId: session.membershipId,
    tenant: session.tenant,
    activeAcademicYear: null,
  };
}

export function ShellContextProvider({ children }: { children: ReactNode }) {
  const { session, accept } = useAuth();
  const [memberships, setMemberships] = useState<MembershipContextView[]>([]);
  const [contextLoading, setContextLoading] = useState(true);
  const [switchingTenant, setSwitchingTenant] = useState(false);
  const sessionView = session?.session;

  useEffect(() => {
    if (!sessionView) {
      setMemberships([]);
      setContextLoading(false);
      return;
    }

    let active = true;
    setContextLoading(true);
    setMemberships([currentMembership(sessionView)]);
    void authRequest<MembershipContextView[]>('memberships', undefined, 'GET')
      .then((items) => {
        if (!active) return;
        setMemberships(
          items.some((item) => item.membershipId === sessionView.membershipId)
            ? items
            : [currentMembership(sessionView), ...items],
        );
      })
      .catch(() => {
        if (active) setMemberships([currentMembership(sessionView)]);
      })
      .finally(() => {
        if (active) setContextLoading(false);
      });

    return () => {
      active = false;
    };
  }, [sessionView?.membershipId, sessionView?.tenant.id]);

  const activeAcademicYear = useMemo(
    () =>
      memberships.find((item) => item.membershipId === sessionView?.membershipId)
        ?.activeAcademicYear ?? null,
    [memberships, sessionView?.membershipId],
  );

  const switchTenant = async (membershipId: string) => {
    if (!sessionView || membershipId === sessionView.membershipId) return;
    if (!memberships.some((item) => item.membershipId === membershipId)) return;
    setSwitchingTenant(true);
    try {
      const next = await authRequest<Authenticated>('switch-tenant', { membershipId });
      accept(next);
    } finally {
      setSwitchingTenant(false);
    }
  };

  return (
    <ShellContext.Provider
      value={{
        memberships,
        activeAcademicYear,
        contextLoading,
        switchingTenant,
        switchTenant,
      }}
    >
      {children}
    </ShellContext.Provider>
  );
}

export function useShellContext(): ShellContextValue {
  const context = useContext(ShellContext);
  if (!context) throw new Error('Missing ShellContextProvider');
  return context;
}
