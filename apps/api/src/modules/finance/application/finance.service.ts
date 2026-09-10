import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  financeCommand,
  financeQuery,
  type FinanceCommand,
  type FinanceResource,
} from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
import { FinanceRepository } from '../domain/finance.repository.js';
import { commandPermission, financeAccess, resourcePermission } from '../domain/policy.js';
@Injectable()
export class FinanceService {
  constructor(@Inject(FinanceRepository) private readonly repository: FinanceRepository) {}
  list(context: RequestContext, resource: FinanceResource, input: unknown) {
    financeAccess(
      context,
      resourcePermission[resource],
      !['fee-types', 'fee-schedules', 'cash-sessions'].includes(resource),
    );
    return this.repository.list(context, resource, financeQuery.parse(input));
  }
  get(context: RequestContext, resource: FinanceResource, id: string) {
    financeAccess(
      context,
      resourcePermission[resource],
      !['fee-types', 'fee-schedules', 'cash-sessions'].includes(resource),
    );
    return this.repository.get(context, resource, z.uuid().parse(id));
  }
  summary(context: RequestContext, input: unknown) {
    financeAccess(context, 'finance.read', true);
    return this.repository.summary(context, financeQuery.parse(input));
  }
  write(
    context: RequestContext,
    action: FinanceCommand['action'],
    input: unknown,
    parameters: { id?: string; itemId?: string; key?: string } = {},
  ) {
    financeAccess(context, commandPermission[action]);
    return this.repository.write(
      context,
      financeCommand.parse({ action, input: input ?? {}, ...parameters }),
    );
  }
}
