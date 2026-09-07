import type {
  GuardianLinkCreate,
  GuardianLinkUpdate,
  GuardianLinkView,
  PageResult,
  PeopleQuery,
} from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
export abstract class GuardianLinksRepository {
  abstract list(
    context: RequestContext,
    id: string,
    side: 'student' | 'guardian',
    query: PeopleQuery,
  ): Promise<PageResult<GuardianLinkView>>;
  abstract link(
    context: RequestContext,
    studentId: string,
    input: GuardianLinkCreate,
  ): Promise<GuardianLinkView>;
  abstract update(
    context: RequestContext,
    studentId: string,
    guardianId: string,
    input: GuardianLinkUpdate | null,
  ): Promise<{ ok: true }>;
}
