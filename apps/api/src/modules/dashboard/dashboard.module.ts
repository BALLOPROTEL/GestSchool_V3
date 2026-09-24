import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module.js';
import { DashboardService } from './application/dashboard.service.js';
import { DashboardRepository } from './infrastructure/dashboard.repository.js';
import { DashboardController } from './presentation/http/dashboard.controller.js';
@Module({
  imports: [IamModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardRepository],
})
export class DashboardModule {}
