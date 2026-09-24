import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module.js';
import { ReportsService } from './application/reports.service.js';
import { ReportsRepository } from './domain/reports.repository.js';
import { ReportsDatabase } from './infrastructure/database.js';
import { PrismaReportsRepository } from './infrastructure/reports.repository.js';
import { ReportsController } from './presentation/http/reports.controller.js';
@Module({
  imports: [IamModule],
  controllers: [ReportsController],
  providers: [
    ReportsDatabase,
    ReportsService,
    { provide: ReportsRepository, useClass: PrismaReportsRepository },
  ],
})
export class ReportsModule {}
