import type {
  FinanceCommand,
  FinanceList,
  FinanceQuery,
  FinanceResource,
  FinanceSummary,
  FinanceView,
} from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
export abstract class FinanceRepository {
  abstract list(
    context: RequestContext,
    resource: FinanceResource,
    query: FinanceQuery,
  ): Promise<FinanceList>;
  abstract get(
    context: RequestContext,
    resource: FinanceResource,
    id: string,
  ): Promise<FinanceView>;
  abstract summary(context: RequestContext, query: FinanceQuery): Promise<FinanceSummary>;
  abstract write(context: RequestContext, command: FinanceCommand): Promise<FinanceView>;
}
