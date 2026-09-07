'use client';

import type { LoginResult } from '@gestschool/contracts';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '../../i18n/navigation';
import { authRequest, currentSession, restoreSession, setSession } from './auth-client';

type Authenticated = Extract<LoginResult, { kind: 'session' }>;
interface AuthState {
  session: Authenticated | null;
  ready: boolean;
  expired: boolean;
  accept: (value: Authenticated) => void;
  logout: () => Promise<void>;
}
const Context = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, update] = useState<Authenticated | null>(null);
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const accept = (value: Authenticated) => {
    setSession(value);
    update(value);
    setReady(true);
    setExpired(false);
  };
  useEffect(() => {
    let active = true;
    void restoreSession().then((value) => {
      if (active) {
        update(value);
        setReady(true);
      }
    });
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'gestschool:logout') {
        setSession(null);
        update(null);
      }
    };
    window.addEventListener('storage', onStorage);
    const onSession = () => {
      const value = currentSession();
      update(value);
      setExpired(!value);
    };
    window.addEventListener('gestschool:session', onSession);
    return () => {
      active = false;
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('gestschool:session', onSession);
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(
      () => {
        void restoreSession().then((value) => {
          update(value);
          if (!value) setExpired(true);
        });
      },
      Math.max(1000, (session.expiresIn - 30) * 1000),
    );
    return () => clearTimeout(timer);
  }, [session]);
  const logout = async () => {
    await authRequest('logout');
    setSession(null);
    update(null);
    // Only a logout notification is persisted; credentials stay in memory/HttpOnly cookies.
    localStorage.setItem('gestschool:logout', String(Date.now()));
  };
  return (
    <Context.Provider value={{ session, ready, expired, accept, logout }}>
      {children}
    </Context.Provider>
  );
}
export function useAuth(): AuthState {
  const context = useContext(Context);
  if (!context) throw new Error('Missing AuthProvider');
  return context;
}
export function SessionBoundary({ children }: { children: ReactNode }) {
  const { session, ready } = useAuth();
  const translate = useTranslations('Iam');
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (ready && !session) router.replace('/login');
  }, [ready, session, pathname, router]);
  if (!ready || !session)
    return (
      <main aria-busy="true" className="flex min-h-screen items-center justify-center p-6">
        <p role="status">{translate('loading')}</p>
      </main>
    );
  return children;
}
