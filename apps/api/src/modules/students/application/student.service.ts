import { Inject, Injectable } from '@nestjs/common';
import { peopleQuery, personId, studentCreate, studentUpdate } from '@gestschool/contracts';
import { deny, type RequestContext } from '../../iam/domain/context.js';
import { requireWrite, readScopes } from '../../people/domain/policy.js';
import { StudentRepository } from '../domain/student.repository.js';

@Injectable()
export class StudentService {
  constructor(@Inject(StudentRepository) private readonly repository: StudentRepository) {}
  private read(context: RequestContext) {
    if (
      !context.grants.some(
        (grant) =>
          grant.permission === 'students.read' && readScopes.some((scope) => scope === grant.scope),
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
    requireWrite(context, 'students', 'create');
    return this.repository.create(context, studentCreate.parse(input));
  }
  update(context: RequestContext, id: unknown, input: unknown) {
    requireWrite(context, 'students', 'update');
    return this.repository.update(context, personId.parse(id), studentUpdate.parse(input));
  }
  archive(context: RequestContext, id: unknown, restore: boolean) {
    requireWrite(context, 'students', 'archive');
    return this.repository.archive(context, personId.parse(id), restore);
  }
}
