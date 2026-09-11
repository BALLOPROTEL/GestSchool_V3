import { Module } from '@nestjs/common';
import { ResultsService } from './application/results.service.js';
import { ResultsRepository } from './domain/results.repository.js';
import { ResultsDatabase } from './infrastructure/database.js';
import { PrismaResultsRepository } from './infrastructure/results.repository.js';
import { ResultsController } from './presentation/http/results.controller.js';

@Module({
  controllers: [ResultsController],
  providers: [
    ResultsDatabase,
    ResultsService,
    { provide: ResultsRepository, useClass: PrismaResultsRepository },
  ],
  exports: [ResultsService],
})
export class GradesModule {}
