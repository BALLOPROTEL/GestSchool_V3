import { Module } from '@nestjs/common';
import { FinanceService } from './application/finance.service.js';
import { FinanceRepository } from './domain/finance.repository.js';
import { FinanceDatabase } from './infrastructure/database.js';
import { PrismaFinanceRepository } from './infrastructure/finance.repository.js';
import { FinanceController } from './presentation/http/finance.controller.js';
@Module({
  controllers: [FinanceController],
  providers: [
    FinanceDatabase,
    FinanceService,
    { provide: FinanceRepository, useClass: PrismaFinanceRepository },
  ],
  exports: [FinanceService],
})
export class FinanceModule {}
