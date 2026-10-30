import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { createPrismaClient, Prisma } from '@gestschool/database';

@Injectable()
export class SettingsDatabase implements OnModuleDestroy {
  readonly client = createPrismaClient(loadInfrastructureConfig().databaseUrl);

  async onModuleDestroy() {
    await this.client.$disconnect();
  }

  transaction<T>(
    run: (db: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.client.$transaction(run, { maxWait: 10_000, timeout: 20_000 });
  }
}
