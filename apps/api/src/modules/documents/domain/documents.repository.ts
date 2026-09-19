import type {
  DocumentList,
  DocumentQuery,
  DocumentSourceQuery,
  DocumentSourceView,
  DocumentTemplateInput,
  DocumentTemplateView,
  DocumentVerification,
  DocumentView,
  GenerateDocumentInput,
} from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';

export abstract class DocumentsRepository {
  abstract sources(
    context: RequestContext,
    query: DocumentSourceQuery,
  ): Promise<DocumentSourceView[]>;
  abstract list(context: RequestContext, query: DocumentQuery): Promise<DocumentList>;
  abstract detail(context: RequestContext, id: string): Promise<DocumentView>;
  abstract generate(
    context: RequestContext,
    input: GenerateDocumentInput,
    idempotencyKey: string,
  ): Promise<DocumentView>;
  abstract revoke(context: RequestContext, id: string, reason: string): Promise<DocumentView>;
  abstract reissue(
    context: RequestContext,
    id: string,
    idempotencyKey: string,
  ): Promise<DocumentView>;
  abstract download(
    context: RequestContext,
    id: string,
  ): Promise<{ bytes: Uint8Array; fileName: string }>;
  abstract verify(token: string): Promise<DocumentVerification>;
  abstract templates(context: RequestContext): Promise<DocumentTemplateView[]>;
  abstract publishTemplate(
    context: RequestContext,
    input: DocumentTemplateInput,
  ): Promise<DocumentTemplateView>;
}
