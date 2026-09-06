import type { RequestContext } from './context.js';

// Resource facts come from a tenant-filtered server-side repository, never a request body.
export interface ResourceFacts {
  tenantId: string;
  ownerUserId?: string;
  assignedUserIds?: readonly string[];
  guardianUserIds?: readonly string[];
}
export class ScopePolicy {
  allows(context: RequestContext, permission: string, facts: ResourceFacts): boolean {
    if (context.tenantId !== facts.tenantId) return false;
    return context.grants.some((grant) => {
      if (grant.permission !== permission) return false;
      switch (grant.scope) {
        case 'PLATFORM':
          return context.roles.includes('SUPER_ADMIN');
        case 'TENANT':
          return true;
        case 'OWN':
          return facts.ownerUserId === context.userId;
        case 'ASSIGNED':
          return facts.assignedUserIds?.includes(context.userId) === true;
        case 'CHILDREN':
          return facts.guardianUserIds?.includes(context.userId) === true;
        case 'NONE':
          return false;
      }
    });
  }
}
