import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { createPrismaClient } from '@gestschool/database';

@Injectable()
export class NotificationsDatabase implements OnModuleDestroy {
  readonly client = createPrismaClient(loadInfrastructureConfig().databaseUrl);
  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
