import { Module } from '@nestjs/common';
import { StudentRepository } from './domain/student.repository.js';
import { PrismaStudentRepository } from './infrastructure/student.repository.js';
import { StudentService } from './application/student.service.js';
import { StudentController } from './presentation/http/student.controller.js';
import { GuardianLinksController } from './presentation/http/guardian-links.controller.js';
import { GuardianLinksService } from './application/guardian-links.service.js';
import { GuardianLinksRepository } from './domain/guardian-links.repository.js';
import { PrismaGuardianLinksRepository } from './infrastructure/guardian-links.repository.js';
@Module({
  controllers: [StudentController, GuardianLinksController],
  providers: [
    StudentService,
    GuardianLinksService,
    { provide: GuardianLinksRepository, useClass: PrismaGuardianLinksRepository },
    { provide: StudentRepository, useClass: PrismaStudentRepository },
  ],
  exports: [StudentService],
})
export class StudentsModule {}
