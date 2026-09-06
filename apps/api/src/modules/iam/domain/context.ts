import type { Grant } from '@gestschool/contracts';

export interface RequestMetadata {
  requestId: string;
  ipAddress: string;
  userAgent: string;
}
export interface RequestContext extends RequestMetadata {
  userId: string;
  sessionId: string;
  membershipId: string;
  tenantId: string;
  roles: string[];
  grants: Grant[];
}
export interface AccessClaims {
  sub: string;
  sid: string;
  tid: string;
  mid: string;
}
export class IamError extends Error {
  constructor(
    readonly code: string,
    readonly status = 401,
  ) {
    super(code);
  }
}
export function deny(code = 'AUTH_FORBIDDEN', status = 403): never {
  throw new IamError(code, status);
}
