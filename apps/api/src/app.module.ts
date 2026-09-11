import { Module } from '@nestjs/common';

import { AppController } from './app.controller.js';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';
import { IamModule } from './modules/iam/iam.module.js';
import { PeopleDatabaseModule } from './modules/people/infrastructure/people-database.js';
import { StudentsModule } from './modules/students/students.module.js';
import { GuardiansModule } from './modules/guardians/guardians.module.js';
import { TeachersModule } from './modules/teachers/teachers.module.js';
import { AcademicsModule } from './modules/academics/academics.module.js';
import { EnrollmentsModule } from './modules/enrollments/enrollments.module.js';
import { FinanceModule } from './modules/finance/finance.module.js';
import { GradesModule } from './modules/grades/grades.module.js';

@Module({
  controllers: [AppController],
  imports: [
    InfrastructureModule,
    IamModule,
    PeopleDatabaseModule,
    StudentsModule,
    GuardiansModule,
    TeachersModule,
    AcademicsModule,
    EnrollmentsModule,
    FinanceModule,
    GradesModule,
  ],
})
export class AppModule {}
