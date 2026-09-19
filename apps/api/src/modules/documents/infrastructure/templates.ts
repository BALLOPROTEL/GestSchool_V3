import {
  documentTemplateLayout,
  type DocumentTemplateInput,
  type DocumentTemplateView,
  type GenerateDocumentInput,
} from '@gestschool/contracts';
import { Prisma, type DocumentTemplate } from '@gestschool/database';
import type { RequestContext } from '../../iam/domain/context.js';
import { documentFound } from '../domain/policy.js';
import { documentAudit } from './database.js';

export function templateView(row: DocumentTemplate): DocumentTemplateView {
  return {
    id: row.id,
    documentType: documentFound(row.documentType),
    locale: documentFound(row.locale) as DocumentTemplateView['locale'],
    version: documentFound(row.version),
    name: row.name,
    layout: documentTemplateLayout.parse(JSON.parse(row.body) as unknown),
    publishedAt: documentFound(row.publishedAt).toISOString(),
  };
}
export async function publishTemplate(
  db: Prisma.TransactionClient,
  context: RequestContext,
  input: DocumentTemplateInput,
) {
  const previous = await db.documentTemplate.findFirst({
    where: { tenantId: context.tenantId, documentType: input.documentType, locale: input.locale },
    orderBy: { version: 'desc' },
  });
  const version = (previous?.version ?? 0) + 1;
  const row = await db.documentTemplate.create({
    data: {
      tenantId: context.tenantId,
      code: `${input.documentType}.${input.locale}.${version}`,
      name: input.name,
      body: JSON.stringify(input.layout),
      documentType: input.documentType,
      locale: input.locale,
      version,
      publishedAt: new Date(),
    },
  });
  await documentAudit(db, context, 'template.created', row.id, { version });
  if (previous)
    await documentAudit(db, context, 'template.updated', row.id, {
      previousId: previous.id,
      version,
    });
  await documentAudit(db, context, 'template.published', row.id, { version });
  return row;
}
export async function issuanceTemplate(
  db: Prisma.TransactionClient,
  context: RequestContext,
  input: GenerateDocumentInput,
) {
  return (
    (await db.documentTemplate.findFirst({
      where: {
        tenantId: context.tenantId,
        documentType: input.documentType,
        locale: input.locale,
        publishedAt: { not: null },
      },
      orderBy: { version: 'desc' },
    })) ??
    publishTemplate(db, context, {
      documentType: input.documentType,
      locale: input.locale,
      name: input.documentType,
      layout: { renderer: 'gestschool-v1', accent: '#3157a4', footer: 'GestSchool' },
    })
  );
}
