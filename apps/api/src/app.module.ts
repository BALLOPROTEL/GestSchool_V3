import { Module } from '@nestjs/common';

import { AppController } from './app.controller.js';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';
import { IamModule } from './modules/iam/iam.module.js';
import { PeopleDatabaseModule } from './modules/people/infrastructure/people-database.js';
import { StudentsModule } from './modules/students/students.module.js';
import { GuardiansModule } from './modules/guardians/guardians.module.js';
import { TeachersModule } from './modules/teachers/teachers.module.js';
import { AcademicsModule } from './modules/academics/academics.module.js';

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
  ],
})
export class AppModule {}
