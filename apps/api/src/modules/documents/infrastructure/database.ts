import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { createPrismaClient, Prisma } from '@gestschool/database';
import type { RequestContext } from '../../iam/domain/context.js';
import { documentConflict } from '../domain/policy.js';

@Injectable()
export class DocumentsDatabase implements OnModuleDestroy {
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
          // Same lock order as Academics, Enrollments, Finance and Results.
          await db.$queryRaw`SELECT id FROM tenants WHERE id=${context.tenantId}::uuid FOR UPDATE`;
          return run(db);
        },
        { maxWait: 30_000, timeout: 60_000 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2003', 'P2004', 'P2010', 'P2025', 'P2034'].includes(error.code)
      )
        documentConflict();
      throw error;
    }
  }
}
export async function documentAudit(
  db: Prisma.TransactionClient,
  context: RequestContext,
  action: string,
  id: string,
  metadata: Prisma.InputJsonObject = {},
) {
  await db.auditLog.create({
    data: {
      tenantId: context.tenantId,
      actorMembershipId: context.membershipId,
      action,
      entityType: action.startsWith('template.') ? 'document_template' : 'document',
      entityId: id,
      metadata: { requestId: context.requestId, ...metadata },
    },
  });
}
