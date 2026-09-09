import { Module } from '@nestjs/common';
import { EnrollmentService } from './application/enrollment.service.js';
import { EnrollmentRepository } from './domain/enrollment.repository.js';
import { EnrollmentDatabase } from './infrastructure/database.js';
import { PrismaEnrollmentRepository } from './infrastructure/enrollment.repository.js';
import {
  EnrollmentController,
  EnrollmentLookupController,
} from './presentation/http/enrollment.controller.js';
@Module({
  controllers: [EnrollmentController, EnrollmentLookupController],
  providers: [
    EnrollmentDatabase,
    EnrollmentService,
    { provide: EnrollmentRepository, useClass: PrismaEnrollmentRepository },
  ],
})
export class EnrollmentsModule {}
