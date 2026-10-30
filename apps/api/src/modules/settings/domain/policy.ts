import type { RequestContext } from '../../iam/domain/context.js';
import { IamError } from '../../iam/domain/context.js';

export function settingsAccess(
  context: RequestContext,
  permission: 'settings.read' | 'settings.write',
) {
  const allowed = context.grants.some(
    (grant) =>
      grant.permission === permission &&
      ((grant.scope === 'TENANT' && context.tenantId) ||
        (grant.scope === 'PLATFORM' && context.roles.includes('SUPER_ADMIN'))),
  );
  if (!allowed) throw new IamError('AUTH_FORBIDDEN', 403);
}
