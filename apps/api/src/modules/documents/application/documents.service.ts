import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  documentQuery,
  documentReasonInput,
  documentTemplateInput,
  documentSourceQuery,
  generateDocumentInput,
} from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
import { IamRuntime } from '../../iam/infrastructure/iam-runtime.js';
import { DocumentsRepository } from '../domain/documents.repository.js';
import { documentAccess } from '../domain/policy.js';

@Injectable()
export class DocumentsService {
  constructor(
    @Inject(DocumentsRepository) private readonly repository: DocumentsRepository,
    @Inject(IamRuntime) private readonly iam: IamRuntime,
  ) {}
  sources(context: RequestContext, query: unknown) {
    documentAccess(context, 'documents.generate', true);
    return this.repository.sources(context, documentSourceQuery.parse(query));
  }
  list(context: RequestContext, query: unknown) {
    documentAccess(context, 'documents.read');
    return this.repository.list(context, documentQuery.parse(query));
  }
  detail(context: RequestContext, id: string) {
    documentAccess(context, 'documents.read');
    return this.repository.detail(context, z.uuid().parse(id));
  }
  generate(context: RequestContext, input: unknown, key: unknown) {
    documentAccess(context, 'documents.generate', true);
    return this.repository.generate(
      context,
      generateDocumentInput.parse(input),
      z.uuid().parse(key),
    );
  }
  revoke(context: RequestContext, id: string, input: unknown) {
    documentAccess(context, 'documents.revoke', true);
    return this.repository.revoke(
      context,
      z.uuid().parse(id),
      documentReasonInput.parse(input).reason,
    );
  }
  reissue(context: RequestContext, id: string, key: unknown) {
    documentAccess(context, 'documents.reissue', true);
    return this.repository.reissue(context, z.uuid().parse(id), z.uuid().parse(key));
  }
  download(context: RequestContext, id: string) {
    documentAccess(context, 'documents.download');
    return this.repository.download(context, z.uuid().parse(id));
  }
  async verify(token: string, ip: string) {
    await this.iam.limiter.checkPublicDocument(ip);
    return this.repository.verify(token);
  }
  templates(context: RequestContext) {
    documentAccess(context, 'document-templates.read', true);
    return this.repository.templates(context);
  }
  publishTemplate(context: RequestContext, input: unknown) {
    documentAccess(context, 'document-templates.manage', true);
    return this.repository.publishTemplate(context, documentTemplateInput.parse(input));
  }
}
