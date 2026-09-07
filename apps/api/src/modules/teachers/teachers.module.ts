import { Module } from '@nestjs/common';
import { TeacherRepository } from './domain/teacher.repository.js';
import { PrismaTeacherRepository } from './infrastructure/teacher.repository.js';
import { TeacherService } from './application/teacher.service.js';
import { TeacherController } from './presentation/http/teacher.controller.js';
@Module({
  controllers: [TeacherController],
  providers: [TeacherService, { provide: TeacherRepository, useClass: PrismaTeacherRepository }],
  exports: [TeacherService],
})
export class TeachersModule {}
