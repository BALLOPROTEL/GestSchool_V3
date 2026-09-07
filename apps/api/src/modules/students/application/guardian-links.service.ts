import { Inject, Injectable } from '@nestjs/common';
import {
  guardianLinkCreate,
  guardianLinkUpdate,
  peopleQuery,
  personId,
} from '@gestschool/contracts';
import { GuardianLinksRepository } from '../domain/guardian-links.repository.js';
import { requireWrite } from '../../people/domain/policy.js';
import { deny, type RequestContext } from '../../iam/domain/context.js';
@Injectable()
export class GuardianLinksService {
  constructor(
    @Inject(GuardianLinksRepository) private readonly repository: GuardianLinksRepository,
  ) {}
  list(context: RequestContext, id: unknown, side: 'student' | 'guardian', query: unknown) {
    for (const permission of ['students.read', 'guardians.read']) {
      if (
        !context.grants.some((grant) => grant.permission === permission && grant.scope !== 'NONE')
      )
        deny();
    }
    return this.repository.list(context, personId.parse(id), side, peopleQuery.parse(query));
  }
  private write(context: RequestContext) {
    requireWrite(context, 'students', 'update');
    requireWrite(context, 'guardians', 'update');
  }
  link(context: RequestContext, id: unknown, input: unknown) {
    this.write(context);
    return this.repository.link(context, personId.parse(id), guardianLinkCreate.parse(input));
  }
  update(
    context: RequestContext,
    id: unknown,
    guardianId: unknown,
    input: unknown,
    unlink = false,
  ) {
    this.write(context);
    return this.repository.update(
      context,
      personId.parse(id),
      personId.parse(guardianId),
      unlink ? null : guardianLinkUpdate.parse(input),
    );
  }
}
