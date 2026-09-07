'use client';
import { useEffect, useState } from 'react';
import { peopleRequest } from './people-client';
import { useAuth } from '../auth/auth-provider';

// Keyed results never display a previous query's rows while a new tenant/filter loads.
export function usePeopleData<T>(path: string | null, revision = 0) {
  const { session } = useAuth();
  const [state, setState] = useState<{ key: string; data?: T; error?: unknown }>();
  const key = `${session?.session.tenant.id}:${session?.session.membershipId}:${path}:${revision}`;
  useEffect(() => {
    if (!path) return;
    let active = true;
    void peopleRequest<T>(path)
      .then((data) => {
        if (active) setState({ key, data });
      })
      .catch((error: unknown) => {
        if (active) setState({ key, error });
      });
    return () => {
      active = false;
    };
  }, [path, key]);
  return {
    data: state?.key === key ? state.data : undefined,
    error: state?.key === key ? state.error : undefined,
    loading: path !== null && state?.key !== key,
  };
}
export function useDebounced(value: string): string {
  const [result, setResult] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setResult(value), 250);
    return () => clearTimeout(timer);
  }, [value]);
  return result;
}
