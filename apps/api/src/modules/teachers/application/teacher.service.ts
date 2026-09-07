import { Inject, Injectable } from '@nestjs/common';
import { peopleQuery, personId, teacherCreate, teacherUpdate } from '@gestschool/contracts';
import { deny, type RequestContext } from '../../iam/domain/context.js';
import { requireWrite, readScopes } from '../../people/domain/policy.js';
import { TeacherRepository } from '../domain/teacher.repository.js';

@Injectable()
export class TeacherService {
  constructor(@Inject(TeacherRepository) private readonly repository: TeacherRepository) {}
  private read(context: RequestContext) {
    if (
      !context.grants.some(
        (grant) =>
          grant.permission === 'teachers.read' && readScopes.some((scope) => scope === grant.scope),
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
    requireWrite(context, 'teachers', 'create');
    return this.repository.create(context, teacherCreate.parse(input));
  }
  update(context: RequestContext, id: unknown, input: unknown) {
    requireWrite(context, 'teachers', 'update');
    return this.repository.update(context, personId.parse(id), teacherUpdate.parse(input));
  }
  archive(context: RequestContext, id: unknown, restore: boolean) {
    requireWrite(context, 'teachers', 'archive');
    return this.repository.archive(context, personId.parse(id), restore);
  }
}
