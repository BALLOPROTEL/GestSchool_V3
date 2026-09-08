import { Module } from '@nestjs/common';
import { AcademicService } from './application/academic.service.js';
import { AcademicRepository } from './domain/academic.repository.js';
import { AcademicDatabase } from './infrastructure/database.js';
import { PrismaAcademicRepository } from './infrastructure/academic.repository.js';
import { AcademicYearController } from './presentation/http/academic-year.controller.js';
import { PeriodController } from './presentation/http/period.controller.js';
import { LevelController } from './presentation/http/level.controller.js';
import { ClassController } from './presentation/http/class.controller.js';
import { SubjectController } from './presentation/http/subject.controller.js';
import { ClassSubjectController } from './presentation/http/class-subject.controller.js';
import {
  AssignmentController,
  MyAssignmentsController,
} from './presentation/http/assignment.controller.js';
@Module({
  controllers: [
    AcademicYearController,
    PeriodController,
    LevelController,
    ClassController,
    SubjectController,
    ClassSubjectController,
    AssignmentController,
    MyAssignmentsController,
  ],
  providers: [
    AcademicDatabase,
    AcademicService,
    { provide: AcademicRepository, useClass: PrismaAcademicRepository },
  ],
})
export class AcademicsModule {}
