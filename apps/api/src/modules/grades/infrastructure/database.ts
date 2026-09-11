import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { createPrismaClient, Prisma } from '@gestschool/database';
import type { RequestContext } from '../../iam/domain/context.js';
import { resultError } from '../domain/policy.js';

@Injectable()
export class ResultsDatabase implements OnModuleDestroy {
  readonly client = createPrismaClient(loadInfrastructureConfig().databaseUrl);
  async onModuleDestroy() {
    await this.client.$disconnect();
  }
  async write<T>(
    context: RequestContext,
    run: (db: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.client.$transaction(
        async (db) => {
          // Shared lock order with Academics/Enrollments/Finance prevents eligibility/write races.
          await db.$queryRaw`SELECT id FROM tenants WHERE id=${context.tenantId}::uuid FOR UPDATE`;
          return run(db);
        },
        { maxWait: 30000, timeout: 60000 },
      );
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') resultError('RESULT_DUPLICATE');
        if (['P2003', 'P2004', 'P2010', 'P2025', 'P2034'].includes(error.code))
          resultError('RESULT_CONFLICT');
      }
      throw error;
    }
  }
}
export function auditData(
  context: RequestContext,
  action: string,
  id: string,
  before: unknown,
  after: unknown,
): Prisma.AuditLogCreateManyInput {
  return {
    tenantId: context.tenantId,
    actorMembershipId: context.membershipId,
    action,
    entityType: action.split('.')[0] ?? 'result',
    entityId: id,
    metadata: JSON.parse(
      JSON.stringify({ requestId: context.requestId, before, after }),
    ) as Prisma.InputJsonObject,
  };
}
export async function resultAudit(
  db: Prisma.TransactionClient,
  context: RequestContext,
  action: string,
  id: string,
  before: unknown,
  after: unknown,
) {
  await db.auditLog.create({ data: auditData(context, action, id, before, after) });
}
