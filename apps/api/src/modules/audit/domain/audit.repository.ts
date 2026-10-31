import type { AuditListQuery, AuditListView } from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';

export abstract class AuditRepository {
  abstract list(context: RequestContext, query: AuditListQuery): Promise<AuditListView>;
}
