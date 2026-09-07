import { Inject, Injectable } from '@nestjs/common';
import { peopleQuery, personId, guardianCreate, guardianUpdate } from '@gestschool/contracts';
import { deny, type RequestContext } from '../../iam/domain/context.js';
import { requireWrite, readScopes } from '../../people/domain/policy.js';
import { GuardianRepository } from '../domain/guardian.repository.js';

@Injectable()
export class GuardianService {
  constructor(@Inject(GuardianRepository) private readonly repository: GuardianRepository) {}
  private read(context: RequestContext) {
    if (
      !context.grants.some(
        (grant) =>
          grant.permission === 'guardians.read' &&
          readScopes.some((scope) => scope === grant.scope),
      )
    )
      deny();
  }
  list(context: RequestContext, query: unknown) {
    this.read(context);
    return this.repository.list(context, peopleQuery.parse(query));
  }
  get(context: RequestContext, id: unknown) {
    this.read(context);
    return this.repository.get(context, personId.parse(id));
  }
  create(context: RequestContext, input: unknown) {
    requireWrite(context, 'guardians', 'create');
    return this.repository.create(context, guardianCreate.parse(input));
  }
  update(context: RequestContext, id: unknown, input: unknown) {
    requireWrite(context, 'guardians', 'update');
    return this.repository.update(context, personId.parse(id), guardianUpdate.parse(input));
  }
  archive(context: RequestContext, id: unknown, restore: boolean) {
    requireWrite(context, 'guardians', 'archive');
    return this.repository.archive(context, personId.parse(id), restore);
  }
}
