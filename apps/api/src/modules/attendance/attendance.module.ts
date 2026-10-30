import { Module } from '@nestjs/common';
import { AttendanceService } from './application/attendance.service.js';
import { AttendanceRepository } from './domain/attendance.repository.js';
import { AttendanceDatabase } from './infrastructure/database.js';
import { PrismaAttendanceRepository } from './infrastructure/attendance.repository.js';
import { AttendanceController } from './presentation/http/attendance.controller.js';

@Module({
  controllers: [AttendanceController],
  providers: [
    AttendanceDatabase,
    AttendanceService,
    { provide: AttendanceRepository, useClass: PrismaAttendanceRepository },
  ],
})
export class AttendanceModule {}
