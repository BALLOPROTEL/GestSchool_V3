import { Module } from '@nestjs/common';

import { AcademicsModule } from '../academics/academics.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { GuardiansModule } from '../guardians/guardians.module.js';
import { StudentsModule } from '../students/students.module.js';
import { TeachersModule } from '../teachers/teachers.module.js';
import { SearchService } from './application/search.service.js';
import { SearchController } from './presentation/http/search.controller.js';

@Module({
  imports: [
    StudentsModule,
    GuardiansModule,
    TeachersModule,
    AcademicsModule,
    EnrollmentsModule,
    FinanceModule,
    DocumentsModule,
  ],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
