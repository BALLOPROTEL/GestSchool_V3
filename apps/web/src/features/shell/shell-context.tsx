'use client';

import type { LoginResult, MembershipContextView, SessionView } from '@gestschool/contracts';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { authRequest } from '../auth/auth-client';
import { useAuth } from '../auth/auth-provider';
import { shellContextRefreshEvent } from './shell-events';

type Authenticated = Extract<LoginResult, { kind: 'session' }>;

interface ShellContextValue {
  memberships: MembershipContextView[];
  currentTenant: MembershipContextView['tenant'] | null;
  activeAcademicYear: MembershipContextView['activeAcademicYear'];
  contextError: boolean;
  contextLoading: boolean;
  switchingTenant: boolean;
  switchTenant: (membershipId: string) => Promise<void>;
}

const ShellContext = createContext<ShellContextValue | null>(null);

function fallbackMembershipContext(session: SessionView): MembershipContextView {
  return {
    membershipId: session.membershipId,
    tenant: session.tenant,
    activeAcademicYear: null,
  };
}

export function ShellContextProvider({ children }: { children: ReactNode }) {
  const { session, accept } = useAuth();
  const [memberships, setMemberships] = useState<MembershipContextView[]>([]);
  const [contextError, setContextError] = useState(false);
  const [contextLoading, setContextLoading] = useState(true);
  const [switchingTenant, setSwitchingTenant] = useState(false);
  const [revision, setRevision] = useState(0);
  const sessionView = session?.session;

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener(shellContextRefreshEvent, refresh);
    return () => window.removeEventListener(shellContextRefreshEvent, refresh);
  }, []);

  useEffect(() => {
    if (!sessionView) {
      setMemberships([]);
      setContextError(false);
      setContextLoading(false);
      return;
    }

    let active = true;
    setContextError(false);
    setContextLoading(true);
    setMemberships([fallbackMembershipContext(sessionView)]);
    void authRequest<MembershipContextView[]>('memberships', undefined, 'GET')
      .then((items) => {
        if (!active) return;
        setMemberships(
          items.some((item) => item.membershipId === sessionView.membershipId)
            ? items
            : [fallbackMembershipContext(sessionView), ...items],
        );
      })
      .catch(() => {
        if (active) {
          setContextError(true);
          setMemberships([fallbackMembershipContext(sessionView)]);
        }
      })
      .finally(() => {
        if (active) setContextLoading(false);
      });

    return () => {
      active = false;
    };
  }, [revision, sessionView?.membershipId, sessionView?.tenant.id]);

  const currentMembership = useMemo(
    () => memberships.find((item) => item.membershipId === sessionView?.membershipId) ?? null,
    [memberships, sessionView?.membershipId],
  );
  const currentTenant = currentMembership?.tenant ?? sessionView?.tenant ?? null;
  const activeAcademicYear = currentMembership?.activeAcademicYear ?? null;

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
        currentTenant,
        activeAcademicYear,
        contextError,
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
