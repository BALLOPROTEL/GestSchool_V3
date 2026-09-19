import { documentTypes, type OfficialDocumentType, type SessionView } from '@gestschool/contracts';
import { currentSession, restoreSession } from '../auth/auth-client';
import { PeopleError } from '../directory/people-client';

export function canDocuments(session: SessionView | undefined, permission: string): boolean {
  return Boolean(
    session?.grants.some(
      (g) =>
        g.permission === permission &&
        (['TENANT', 'OWN', 'CHILDREN'].includes(g.scope) ||
          (g.scope === 'PLATFORM' && session.roles.includes('SUPER_ADMIN'))),
    ),
  );
}
export function documentTypesFor(session: SessionView | undefined): OfficialDocumentType[] {
  if (!canDocuments(session, 'documents.generate')) return [];
  if (session?.roles.some((r) => ['SUPER_ADMIN', 'SCHOOL_ADMIN'].includes(r)))
    return [...documentTypes];
  return documentTypes.filter((type) =>
    type === 'RECEIPT'
      ? session?.roles.includes('ACCOUNTANT')
      : session?.roles.some((r) => ['DIRECTOR', 'ACADEMIC_STAFF'].includes(r)),
  );
}
export async function downloadDocument(id: string, retry = true): Promise<Blob> {
  const session = currentSession();
  if (!session) throw new PeopleError('AUTH_SESSION_EXPIRED');
  const response = await fetch(`/api/v1/documents/${id}/download`, {
    cache: 'no-store',
    credentials: 'include',
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (response.status === 401 && retry && (await restoreSession()))
    return downloadDocument(id, false);
  if (!response.ok) throw new PeopleError('DOCUMENT_DOWNLOAD_FAILED');
  return response.blob();
}
