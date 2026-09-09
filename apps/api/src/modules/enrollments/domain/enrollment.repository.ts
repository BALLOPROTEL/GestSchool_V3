import type {
  EnrollmentClassQuery,
  EnrollmentClassView,
  EnrollmentCreate,
  EnrollmentEnd,
  EnrollmentEventView,
  EnrollmentList,
  EnrollmentPage,
  EnrollmentQuery,
  EnrollmentTransfer,
  EnrollmentUpdate,
  EnrollmentView,
  PageResult,
} from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
export type EnrollmentCommand =
  | { action: 'create'; input: EnrollmentCreate }
  | { action: 'update'; id: string; input: EnrollmentUpdate }
  | { action: 'confirm'; id: string }
  | { action: 'cancel' | 'complete'; id: string; input: EnrollmentEnd }
  | { action: 'transfer'; id: string; input: EnrollmentTransfer };
export abstract class EnrollmentRepository {
  abstract list(context: RequestContext, query: EnrollmentQuery): Promise<EnrollmentList>;
  abstract get(context: RequestContext, id: string): Promise<EnrollmentView>;
  abstract history(
    context: RequestContext,
    id: string,
    query: EnrollmentPage,
  ): Promise<PageResult<EnrollmentEventView>>;
  abstract classes(
    context: RequestContext,
    query: EnrollmentClassQuery,
  ): Promise<PageResult<EnrollmentClassView>>;
  abstract write(context: RequestContext, command: EnrollmentCommand): Promise<EnrollmentView>;
}
