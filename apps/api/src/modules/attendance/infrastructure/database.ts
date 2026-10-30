import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { createPrismaClient, Prisma } from '@gestschool/database';
import type { RequestContext } from '../../iam/domain/context.js';
import { attendanceError } from '../domain/policy.js';

@Injectable()
export class AttendanceDatabase implements OnModuleDestroy {
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
          await db.$queryRaw`SELECT id FROM tenants WHERE id = ${context.tenantId}::uuid FOR UPDATE`;
          return run(db);
        },
        { maxWait: 15_000, timeout: 30_000 },
      );
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') attendanceError('ATTENDANCE_CONFLICT');
        if (error.code === 'P2025') attendanceError('ATTENDANCE_NOT_FOUND', 404);
        if (['P2003', 'P2004', 'P2034'].includes(error.code))
          attendanceError('ATTENDANCE_CONFLICT');
      }
      throw error;
    }
  }
}
