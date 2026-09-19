import { describe, expect, it } from 'vitest';
import { roleGrants, systemRoles, documentTypes } from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
import { allowedDocumentTypes, documentAccess, documentTenant } from './policy.js';

const context: RequestContext = {
  tenantId: 't',
  membershipId: 'm',
  userId: 'u',
  sessionId: 's',
  requestId: 'r',
  ipAddress: 'local',
  userAgent: 'unit',
  roles: [],
  grants: [],
};
describe('document access policy', () => {
  it('denies by default', () => {
    expect(() => documentAccess(context, 'documents.read')).toThrow();
  });
  it.each(systemRoles)('bounds type and scope for %s', (role) => {
    const c = { ...context, roles: [role], grants: [...roleGrants[role]] };
    if (['PARENT', 'STUDENT'].includes(role)) {
      expect(() => documentAccess(c, 'documents.read')).not.toThrow();
      expect(() => documentAccess(c, 'documents.generate', true)).toThrow();
      expect(documentTenant(c, 'documents.read')).toBe(false);
    } else if (role === 'TEACHER') expect(() => documentAccess(c, 'documents.read')).toThrow();
    else {
      expect(() => documentAccess(c, 'documents.generate', true)).not.toThrow();
      expect(allowedDocumentTypes(c, 'documents.generate')).toEqual(
        role === 'ACCOUNTANT'
          ? ['RECEIPT']
          : role === 'DIRECTOR' || role === 'ACADEMIC_STAFF'
            ? documentTypes.filter((t) => t !== 'RECEIPT')
            : [...documentTypes],
      );
    }
  });
  it('requires SUPER_ADMIN for a PLATFORM grant', () => {
    expect(() =>
      documentAccess(
        { ...context, grants: [{ permission: 'documents.read', scope: 'PLATFORM' }] },
        'documents.read',
      ),
    ).toThrow();
  });
});
