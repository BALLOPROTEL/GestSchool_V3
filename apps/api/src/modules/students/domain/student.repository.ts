import type {
  StudentCreate,
  StudentUpdate,
  PageResult,
  PeopleQuery,
  PersonView,
} from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
export abstract class StudentRepository {
  abstract list(context: RequestContext, query: PeopleQuery): Promise<PageResult<PersonView>>;
  abstract get(context: RequestContext, id: string): Promise<PersonView>;
  abstract create(context: RequestContext, input: StudentCreate): Promise<PersonView>;
  abstract update(context: RequestContext, id: string, input: StudentUpdate): Promise<PersonView>;
  abstract archive(context: RequestContext, id: string, restore: boolean): Promise<PersonView>;
}
