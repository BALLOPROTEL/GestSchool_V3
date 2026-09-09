import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { createPrismaClient, Prisma } from '@gestschool/database';
import { IamError, type RequestContext } from '../../iam/domain/context.js';
export { audit } from '../../people/infrastructure/people-database.js';
@Injectable()
export class EnrollmentDatabase implements OnModuleDestroy {
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
          // Same lock as Students/Academics: capacity, archive and year-close races serialize too.
          await db.$queryRaw`SELECT id FROM tenants WHERE id = ${context.tenantId}::uuid FOR UPDATE`;
          return run(db);
        },
        { maxWait: 15000, timeout: 15000 },
      );
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') throw new IamError('ENROLLMENT_DUPLICATE', 409);
        if (error.code === 'P2025') throw new IamError('ENROLLMENT_NOT_FOUND', 404);
        if (['P2003', 'P2004'].includes(error.code)) throw new IamError('ENROLLMENT_CONFLICT', 409);
      }
      throw error;
    }
  }
}
