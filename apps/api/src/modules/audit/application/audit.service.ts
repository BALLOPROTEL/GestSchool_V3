import { Inject, Injectable } from '@nestjs/common';
import { auditListQuery } from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
import { AuditRepository } from '../domain/audit.repository.js';
import { auditAccess } from '../domain/policy.js';

@Injectable()
export class AuditService {
  constructor(@Inject(AuditRepository) private readonly repository: AuditRepository) {}

  list(context: RequestContext, input: unknown) {
    auditAccess(context);
    return this.repository.list(context, auditListQuery.parse(input));
  }
}
