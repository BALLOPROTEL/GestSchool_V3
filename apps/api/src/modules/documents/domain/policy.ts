import { documentTypes, type OfficialDocumentType, type AccessScope } from '@gestschool/contracts';
import { deny, type RequestContext } from '../../iam/domain/context.js';

export const documentReadScopes: readonly AccessScope[] = ['TENANT', 'PLATFORM', 'OWN', 'CHILDREN'];
export const documentWriteScopes: readonly AccessScope[] = ['TENANT', 'PLATFORM'];
export function documentTenant(context: RequestContext, permission: string): boolean {
  return context.grants.some(
    (g) =>
      g.permission === permission &&
      (g.scope === 'TENANT' || (g.scope === 'PLATFORM' && context.roles.includes('SUPER_ADMIN'))),
  );
}
export function documentAccess(context: RequestContext, permission: string, write = false) {
  if (
    !context.grants.some(
      (g) =>
        g.permission === permission &&
        (documentTenant(context, permission) || (!write && ['OWN', 'CHILDREN'].includes(g.scope))),
    )
  )
    deny();
}
export function allowedDocumentTypes(
  context: RequestContext,
  permission: string,
): OfficialDocumentType[] {
  if (!documentTenant(context, permission)) return [...documentTypes];
  if (context.roles.some((r) => ['SUPER_ADMIN', 'SCHOOL_ADMIN'].includes(r)))
    return [...documentTypes];
  return documentTypes.filter((type) =>
    type === 'RECEIPT'
      ? context.roles.includes('ACCOUNTANT')
      : context.roles.some((r) => ['DIRECTOR', 'ACADEMIC_STAFF'].includes(r)),
  );
}
export function documentFound<T>(value: T | null | undefined): T {
  if (value == null) deny('DOCUMENT_NOT_FOUND', 404);
  return value;
}
export function documentConflict(code = 'DOCUMENT_CONFLICT'): never {
  return deny(code, 409);
}
