import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { createPrismaClient, Prisma } from '@gestschool/database';
import type { RequestContext } from '../../iam/domain/context.js';
import { financeConflict } from '../domain/policy.js';
export { audit } from '../../people/infrastructure/people-database.js';
@Injectable()
export class FinanceDatabase implements OnModuleDestroy {
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
          await db.$queryRaw`SELECT id FROM tenants WHERE id=${context.tenantId}::uuid FOR UPDATE`;
          return run(db);
        },
        { maxWait: 30000, timeout: 30000 },
      );
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') financeConflict('FINANCE_REFERENCE_CONFLICT');
        if (['P2003', 'P2004', 'P2010', 'P2025', 'P2034'].includes(error.code))
          financeConflict('FINANCE_CONFLICT');
      }
      throw error;
    }
  }
}
