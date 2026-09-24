import { Inject, Injectable } from '@nestjs/common';
import { dashboardQuery, type ReportActor } from '@gestschool/contracts';
import { ZodError } from 'zod';
import type { RequestContext } from '../../iam/domain/context.js';
import { IamError } from '../../iam/domain/context.js';
import { DashboardRepository } from '../infrastructure/dashboard.repository.js';
@Injectable()
export class DashboardService {
  constructor(@Inject(DashboardRepository) private readonly repository: DashboardRepository) {}
  async summary(context: RequestContext, query: unknown) {
    const actor: ReportActor = {
      tenantId: context.tenantId,
      membershipId: context.membershipId,
      userId: context.userId,
      roles: context.roles,
      grants: context.grants,
    };
    try {
      return await this.repository.summary(actor, dashboardQuery.parse(query));
    } catch (error) {
      if (error instanceof ZodError) throw error;
      const code = error instanceof Error ? error.message : 'DASHBOARD_UNAVAILABLE';
      throw new IamError(code, code.endsWith('NOT_FOUND') ? 404 : 403);
    }
  }
}
