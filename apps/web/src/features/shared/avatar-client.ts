import { useEffect, useState } from 'react';
import { csrfState, currentSession, restoreSession } from '../auth/auth-client';

const AVATAR_CHANGED = 'gestschool:avatar-changed';

export class AvatarClientError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function authorizedFetch(
  path: string,
  method = 'GET',
  body?: unknown,
  retry = true,
): Promise<Response> {
  const session = currentSession();
  if (!session) throw new AvatarClientError('AUTH_SESSION_EXPIRED');

  const mutating = !['GET', 'HEAD'].includes(method);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.accessToken}`,
  };
  if (mutating) {
    const { csrfToken } = await csrfState();
    headers['Content-Type'] = 'application/json';
    headers['X-CSRF-Token'] = csrfToken;
  }

  const response = await fetch(path, {
    method,
    credentials: 'include',
    cache: 'no-store',
    headers,
    ...(mutating && method !== 'DELETE' ? { body: JSON.stringify(body ?? {}) } : {}),
  });

  if (response.status === 401 && retry) {
    const renewed = await restoreSession();
    window.dispatchEvent(new Event('gestschool:session'));
    if (renewed) return authorizedFetch(path, method, body, false);
  }
  return response;
}

async function avatarPayload(file: File): Promise<{ mimeType: 'image/jpeg' | 'image/png'; base64: string }> {
  if (
    (file.type !== 'image/jpeg' && file.type !== 'image/png') ||
    file.size === 0 ||
    file.size > 2_000_000
  )
    throw new AvatarClientError('AVATAR_INVALID');

  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32_768)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));

  return {
    mimeType: file.type,
    base64: btoa(binary),
  };
}

export async function uploadPrivateAvatar(path: string, file: File): Promise<void> {
  const response = await authorizedFetch(path, 'PUT', await avatarPayload(file));
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { code?: string };
    throw new AvatarClientError(error.code ?? 'AVATAR_UNAVAILABLE');
  }
  window.dispatchEvent(new Event(AVATAR_CHANGED));
}

export async function deletePrivateAvatar(path: string): Promise<void> {
  const response = await authorizedFetch(path, 'DELETE');
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { code?: string };
    throw new AvatarClientError(error.code ?? 'AVATAR_UNAVAILABLE');
  }
  window.dispatchEvent(new Event(AVATAR_CHANGED));
}

export function usePrivateAvatar(path: string | null, identity?: string | null): string {
  const [url, setUrl] = useState('');

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setUrl('');

    const load = async () => {
      if (!path) {
        setUrl('');
        return;
      }
      try {
        const response = await authorizedFetch(path);
        if (response.status === 204 || response.status === 404) {
          if (active) setUrl('');
          return;
        }
        if (!response.ok) throw new AvatarClientError('AVATAR_UNAVAILABLE');
        const blob = await response.blob();
        const next = URL.createObjectURL(blob);
        if (!active) {
          URL.revokeObjectURL(next);
          return;
        }
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = next;
        setUrl(next);
      } catch {
        if (active) setUrl('');
      }
    };

    void load();
    const reload = () => void load();
    window.addEventListener(AVATAR_CHANGED, reload);
    return () => {
      active = false;
      window.removeEventListener(AVATAR_CHANGED, reload);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [identity, path]);

  return url;
}
