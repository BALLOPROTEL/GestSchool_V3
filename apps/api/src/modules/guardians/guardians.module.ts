import { Module } from '@nestjs/common';
import { GuardianRepository } from './domain/guardian.repository.js';
import { PrismaGuardianRepository } from './infrastructure/guardian.repository.js';
import { GuardianService } from './application/guardian.service.js';
import { GuardianController } from './presentation/http/guardian.controller.js';
@Module({
  controllers: [GuardianController],
  providers: [GuardianService, { provide: GuardianRepository, useClass: PrismaGuardianRepository }],
  exports: [GuardianService],
})
export class GuardiansModule {}
