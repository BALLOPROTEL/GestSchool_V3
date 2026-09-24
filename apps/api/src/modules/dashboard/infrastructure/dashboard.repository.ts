import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import type { DashboardQuery, ReportActor } from '@gestschool/contracts';
import { createPrismaClient } from '@gestschool/database';
import { DashboardDataEngine } from '@gestschool/infrastructure';
@Injectable()
export class DashboardRepository implements OnModuleDestroy {
  private readonly db = createPrismaClient(loadInfrastructureConfig().databaseUrl);
  private readonly engine = new DashboardDataEngine(this.db);
  summary(actor: ReportActor, query: DashboardQuery) {
    return this.engine.summary(actor, query);
  }
  async onModuleDestroy() {
    await this.db.$disconnect();
  }
}
