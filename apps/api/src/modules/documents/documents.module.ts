import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module.js';
import { DocumentsService } from './application/documents.service.js';
import { DocumentsRepository } from './domain/documents.repository.js';
import { DocumentsDatabase } from './infrastructure/database.js';
import { PrismaDocumentsRepository } from './infrastructure/documents.repository.js';
import { DocumentsController } from './presentation/http/documents.controller.js';

@Module({
  imports: [IamModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsDatabase,
    DocumentsService,
    { provide: DocumentsRepository, useClass: PrismaDocumentsRepository },
  ],
  exports: [DocumentsService],
})
export class DocumentsModule {}
