import { Module } from '@nestjs/common';
import { AuditService } from './application/audit.service.js';
import { AuditRepository } from './domain/audit.repository.js';
import { AuditDatabase } from './infrastructure/database.js';
import { PrismaAuditRepository } from './infrastructure/audit.repository.js';
import { AuditController } from './presentation/http/audit.controller.js';

@Module({
  controllers: [AuditController],
  providers: [
    AuditDatabase,
    AuditService,
    { provide: AuditRepository, useClass: PrismaAuditRepository },
  ],
})
export class AuditModule {}
