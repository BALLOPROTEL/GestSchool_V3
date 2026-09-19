import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { S3StorageAdapter } from '@gestschool/infrastructure';
import {
  DOCUMENT_GENERATION_EVENT,
  documentSnapshotSchema,
  reportSnapshotSchema,
  type DocumentList,
  type DocumentQuery,
  type DocumentSourceQuery,
  type DocumentTemplateInput,
  type DocumentVerification,
  type DocumentView,
  type GenerateDocumentInput,
} from '@gestschool/contracts';
import { Prisma, type Document } from '@gestschool/database';
import { deny, type RequestContext } from '../../iam/domain/context.js';
import { DocumentsRepository } from '../domain/documents.repository.js';
import {
  allowedDocumentTypes,
  documentConflict,
  documentFound,
  documentTenant,
} from '../domain/policy.js';
import { DocumentsDatabase, documentAudit } from './database.js';
import { captureDocumentSource } from './snapshots.js';
import { issuanceTemplate, publishTemplate, templateView } from './templates.js';

function scope(context: RequestContext, permission: string): Prisma.DocumentWhereInput {
  const students: Prisma.StudentWhereInput[] = [];
  if (documentTenant(context, permission)) students.push({ tenantId: context.tenantId });
  else {
    if (context.grants.some((g) => g.permission === permission && g.scope === 'OWN'))
      students.push({ userId: context.userId });
    if (context.grants.some((g) => g.permission === permission && g.scope === 'CHILDREN'))
      students.push({
        guardians: {
          some: {
            tenantId: context.tenantId,
            guardian: { userId: context.userId, status: 'ACTIVE' },
          },
        },
      });
  }
  return {
    tenantId: context.tenantId,
    generationStatus: { not: null },
    documentType: { in: allowedDocumentTypes(context, permission) },
    student: { is: { tenantId: context.tenantId, OR: students } },
  };
}
function sourceId(row: Document) {
  return documentFound(row.enrollmentId ?? row.reportCardId ?? row.receiptId);
}
function view(row: Document): DocumentView {
  const s = documentSnapshotSchema.parse(row.snapshot);
  return {
    id: row.id,
    reference: row.reference,
    documentType: s.documentType,
    status: documentFound(row.generationStatus),
    locale: s.locale,
    studentId: documentFound(row.studentId),
    sourceId: sourceId(row),
    holder: s.holder.name,
    academicYear: s.academicYear,
    className: s.className,
    matricule: s.holder.matricule,
    createdAt: row.createdAt.toISOString(),
    issuedAt: row.issuedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    revocationReason: row.revocationReason,
    checksum: row.checksum,
    sizeBytes: row.sizeBytes.toString(),
    templateVersion: documentFound(row.templateVersion),
    supersedesId: row.supersedesId,
  };
}
const prefix = {
  REPORT_CARD: 'BUL',
  TRANSCRIPT: 'REL',
  SCHOOL_CERTIFICATE: 'CERT',
  ENROLLMENT_CERTIFICATE: 'INS',
  STUDENT_CARD: 'CARD',
  RECEIPT: 'REC',
} as const;

@Injectable()
export class PrismaDocumentsRepository extends DocumentsRepository implements OnModuleDestroy {
  private readonly storage = new S3StorageAdapter(loadInfrastructureConfig().storage);
  constructor(@Inject(DocumentsDatabase) private readonly database: DocumentsDatabase) {
    super();
  }
  onModuleDestroy() {
    this.storage.close();
  }
  override async sources(context: RequestContext, q: DocumentSourceQuery) {
    if (!allowedDocumentTypes(context, 'documents.generate').includes(q.documentType)) deny();
    const tenantId = context.tenantId,
      student: Prisma.StudentWhereInput = {
        tenantId,
        ...(q.studentId ? { id: q.studentId } : {}),
        ...(q.search
          ? {
              OR: [
                { firstName: { contains: q.search, mode: 'insensitive' } },
                { lastName: { contains: q.search, mode: 'insensitive' } },
                { matricule: { contains: q.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
    if (q.documentType === 'RECEIPT') {
      return (
        await this.database.client.receipt.findMany({
          where: { tenantId, payment: { status: 'COMPLETED', student: { is: student } } },
          include: { payment: { include: { student: true } } },
          orderBy: { issuedAt: 'desc' },
          take: 50,
        })
      ).map((r) => ({
        id: r.id,
        label: `${r.receiptNumber} · ${r.payment.student?.firstName ?? ''} ${r.payment.student?.lastName ?? ''}`,
      }));
    }
    if (q.documentType === 'REPORT_CARD' || q.documentType === 'TRANSCRIPT') {
      const rows = await this.database.client.reportCard.findMany({
        where: { tenantId, status: { in: ['PUBLISHED', 'LOCKED'] }, student: { is: student } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return rows.flatMap((r) => {
        const parsed = reportSnapshotSchema.safeParse(r.snapshot);
        const snapshot = parsed.success ? parsed.data : null;
        return snapshot
          ? [
              {
                id: r.id,
                label: `${snapshot.student?.firstName ?? ''} ${snapshot.student?.lastName ?? ''} · ${snapshot.academicPeriod?.name ?? ''}`,
              },
            ]
          : [];
      });
    }
    return (
      await this.database.client.enrollment.findMany({
        where: {
          tenantId,
          status: 'ACTIVE',
          endedOn: null,
          student: { is: { ...student, status: 'ACTIVE' } },
          schoolClass: { academicYear: { status: 'ACTIVE' } },
        },
        include: { student: true, schoolClass: { include: { academicYear: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
    ).map((r) => ({
      id: r.id,
      label: `${r.student.firstName} ${r.student.lastName} · ${r.student.matricule} · ${r.schoolClass.name} · ${r.schoolClass.academicYear.name}`,
    }));
  }
  override async list(context: RequestContext, q: DocumentQuery): Promise<DocumentList> {
    const where: Prisma.DocumentWhereInput = {
      ...scope(context, 'documents.read'),
      ...(q.studentId ? { studentId: q.studentId } : {}),
      ...(q.documentType ? { AND: [{ documentType: q.documentType }] } : {}),
      ...(q.status ? { generationStatus: q.status } : {}),
      ...(q.search
        ? {
            OR: [
              { reference: { contains: q.search, mode: 'insensitive' } },
              {
                snapshot: {
                  path: ['holder', 'name'],
                  string_contains: q.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
    if (q.sourceId)
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            { enrollmentId: q.sourceId },
            { reportCardId: q.sourceId },
            { receiptId: q.sourceId },
          ],
        },
      ];
    const [total, rows] = await this.database.client.$transaction([
      this.database.client.document.count({ where }),
      this.database.client.document.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items: rows.map(view), total, page: q.page, pageSize: q.pageSize };
  }
  override async detail(context: RequestContext, id: string) {
    return view(
      documentFound(
        await this.database.client.document.findFirst({
          where: { ...scope(context, 'documents.read'), id },
        }),
      ),
    );
  }
  private async issue(
    db: Prisma.TransactionClient,
    context: RequestContext,
    input: GenerateDocumentInput,
    key: string,
    supersedesId: string | null = null,
  ) {
    if (
      !allowedDocumentTypes(
        context,
        supersedesId ? 'documents.reissue' : 'documents.generate',
      ).includes(input.documentType)
    )
      deny();
    const old = await db.document.findUnique({
      where: { tenantId_idempotencyKey: { tenantId: context.tenantId, idempotencyKey: key } },
    });
    if (old) {
      if (
        old.documentType !== input.documentType ||
        old.locale !== input.locale ||
        sourceId(old) !== input.sourceId ||
        old.supersedesId !== supersedesId
      )
        documentConflict('DOCUMENT_IDEMPOTENCY_CONFLICT');
      return view(old);
    }
    const source = await captureDocumentSource(db, context, input),
      template = await issuanceTemplate(db, context, input);
    const snapshot = { ...source.snapshot, template: templateView(template).layout };
    const year = new Date().getUTCFullYear(),
      p = prefix[input.documentType];
    const counter = await db.documentCounter.upsert({
      where: { tenantId_prefix_year: { tenantId: context.tenantId, prefix: p, year } },
      create: { tenantId: context.tenantId, prefix: p, year, value: 1 },
      update: { value: { increment: 1 } },
    });
    const reference = `${p}-${year}-${String(counter.value).padStart(6, '0')}`,
      id = randomUUID();
    const row = await db.document.create({
      data: {
        id,
        tenantId: context.tenantId,
        studentId: source.studentId,
        enrollmentId: source.enrollmentId ?? null,
        reportCardId: source.reportCardId ?? null,
        receiptId: source.receiptId ?? null,
        documentTemplateId: template.id,
        templateVersion: template.version,
        documentType: input.documentType,
        locale: input.locale,
        generationStatus: 'PENDING',
        snapshot: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonObject,
        reference,
        fileName: `${reference}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 0n,
        objectKey: `tenants/${context.tenantId}/documents/${id}/pending.pdf`,
        idempotencyKey: key,
        requestedByMembershipId: context.membershipId,
        supersedesId,
      },
    });
    await db.outboxEvent.create({
      data: {
        tenantId: context.tenantId,
        aggregateType: 'document',
        aggregateId: id,
        eventType: DOCUMENT_GENERATION_EVENT,
        payload: { schemaVersion: 1, documentId: id },
      },
    });
    await documentAudit(db, context, 'document.requested', id, {
      documentType: input.documentType,
    });
    if (supersedesId) await documentAudit(db, context, 'document.reissued', id, { supersedesId });
    return view(row);
  }
  override generate(context: RequestContext, input: GenerateDocumentInput, key: string) {
    return this.database.write(context, (db) => this.issue(db, context, input, key));
  }
  override reissue(context: RequestContext, id: string, key: string) {
    return this.database.write(context, async (db) => {
      const old = documentFound(
        await db.document.findFirst({ where: { ...scope(context, 'documents.reissue'), id } }),
      );
      if (!['READY', 'REVOKED', 'FAILED'].includes(old.generationStatus ?? ''))
        documentConflict('DOCUMENT_NOT_READY');
      const s = documentSnapshotSchema.parse(old.snapshot);
      return this.issue(
        db,
        context,
        { documentType: s.documentType, locale: s.locale, sourceId: sourceId(old) },
        key,
        old.id,
      );
    });
  }
  override revoke(context: RequestContext, id: string, reason: string) {
    return this.database.write(context, async (db) => {
      const row = documentFound(
        await db.document.findFirst({ where: { ...scope(context, 'documents.revoke'), id } }),
      );
      if (row.generationStatus === 'REVOKED') return view(row);
      if (row.generationStatus !== 'READY') documentConflict('DOCUMENT_NOT_READY');
      const after = await db.document.update({
        where: { tenantId_id: { tenantId: context.tenantId, id } },
        data: {
          generationStatus: 'REVOKED',
          revokedAt: new Date(),
          revokedByMembershipId: context.membershipId,
          revocationReason: reason,
        },
      });
      await documentAudit(db, context, 'document.revoked', id, { reason });
      return view(after);
    });
  }
  override async download(context: RequestContext, id: string) {
    const row = documentFound(
      await this.database.client.document.findFirst({
        where: { ...scope(context, 'documents.download'), id },
      }),
    );
    if (!['READY', 'REVOKED'].includes(row.generationStatus ?? '') || !row.checksum)
      documentConflict('DOCUMENT_NOT_READY');
    const bytes = await this.storage.getPdf(row.objectKey);
    if (
      createHash('sha256').update(bytes).digest('hex') !== row.checksum ||
      BigInt(bytes.length) !== row.sizeBytes
    )
      deny('DOCUMENT_OBJECT_INVALID', 503);
    // Authorization is re-evaluated after the object fetch (relationships may have changed).
    documentFound(
      await this.database.client.document.findFirst({
        where: { ...scope(context, 'documents.download'), id },
        select: { id: true },
      }),
    );
    await documentAudit(this.database.client, context, 'document.downloaded', id);
    return { bytes, fileName: row.fileName };
  }
  override async verify(token: string): Promise<DocumentVerification> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return { status: 'INVALID' };
    const row = await this.database.client.document.findUnique({
      where: { verificationTokenHash: createHash('sha256').update(token).digest('hex') },
      include: { tenant: true, receipt: { include: { payment: true } } },
    });
    if (
      !row ||
      !['READY', 'REVOKED'].includes(row.generationStatus ?? '') ||
      !row.issuedAt ||
      row.tenant.status !== 'ACTIVE'
    )
      return { status: 'INVALID' };
    const s = documentSnapshotSchema.parse(row.snapshot);
    return {
      status:
        row.generationStatus === 'REVOKED' ||
        (row.receipt && row.receipt.payment.status !== 'COMPLETED')
          ? 'REVOKED'
          : 'VALID',
      documentType: s.documentType,
      reference: row.reference,
      school: s.school.name,
      holder: s.holder.name,
      academicYear: s.academicYear,
      academicPeriod: s.academicPeriod,
      issuedAt: row.issuedAt.toISOString(),
    };
  }
  override async templates(context: RequestContext) {
    return (
      await this.database.client.documentTemplate.findMany({
        where: {
          tenantId: context.tenantId,
          documentType: { in: allowedDocumentTypes(context, 'document-templates.read') },
          publishedAt: { not: null },
        },
        orderBy: [{ documentType: 'asc' }, { locale: 'asc' }, { version: 'desc' }],
      })
    ).map(templateView);
  }
  override publishTemplate(context: RequestContext, input: DocumentTemplateInput) {
    return this.database.write(context, async (db) =>
      templateView(await publishTemplate(db, context, input)),
    );
  }
}
