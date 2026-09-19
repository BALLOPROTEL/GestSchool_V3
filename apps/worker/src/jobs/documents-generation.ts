import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { documentSnapshotSchema } from '@gestschool/contracts';
import { type GestSchoolPrismaClient, type Prisma } from '@gestschool/database';
import {
  documentPublicOrigin,
  renderDocumentPdf,
  type S3StorageAdapter,
} from '@gestschool/infrastructure';

export async function workerDocumentAudit(
  db: Prisma.TransactionClient,
  tenantId: string,
  id: string,
  action: string,
  metadata: Prisma.InputJsonObject = {},
) {
  await db.auditLog.create({
    data: { tenantId, action, entityType: 'document', entityId: id, metadata },
  });
}
export class DocumentsGeneration {
  constructor(
    private readonly db: GestSchoolPrismaClient,
    private readonly storage: S3StorageAdapter,
    private readonly render = renderDocumentPdf,
    private readonly origin = documentPublicOrigin(),
  ) {}

  async run(data: { tenantId: string; documentId: string }): Promise<void> {
    const { tenantId, documentId: id } = data;
    const leaseToken = randomUUID();
    const row = await this.db.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM documents WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid FOR UPDATE`;
      const current = await db.document.findFirst({
        where: { tenantId, id, documentType: { not: null } },
      });
      if (!current || ['READY', 'REVOKED', 'FAILED'].includes(current.generationStatus ?? ''))
        return null;
      if (current.leaseUntil && current.leaseUntil.getTime() > Date.now())
        throw new Error('DOCUMENT_LEASE_BUSY');
      if (current.attempts >= 3) {
        await db.document.update({
          where: { id },
          data: {
            generationStatus: 'FAILED',
            failureCode: 'DOCUMENT_ATTEMPTS_EXHAUSTED',
            leaseToken: null,
            leaseUntil: null,
          },
        });
        await workerDocumentAudit(db, tenantId, id, 'document.failed', {
          code: 'DOCUMENT_ATTEMPTS_EXHAUSTED',
        });
        return null;
      }
      return db.document.update({
        where: { id },
        data: {
          generationStatus: 'PROCESSING',
          attempts: { increment: 1 },
          leaseToken,
          leaseUntil: new Date(Date.now() + 180_000),
          failureCode: null,
        },
      });
    });
    if (!row) return;
    let candidateObject: string | undefined;
    try {
      const snapshot = documentSnapshotSchema.parse(row.snapshot);
      // Raw token never enters PostgreSQL, Redis, audit data, errors or structured logs.
      const token = randomBytes(32).toString('base64url');
      const bytes = await this.render(
        snapshot,
        row.reference,
        `${this.origin}/${snapshot.locale}/verify/${token}`,
      );
      const checksum = createHash('sha256').update(bytes).digest('hex');
      const objectKey = `tenants/${tenantId}/documents/${id}/${checksum}.pdf`;
      await this.storage.putPdf(objectKey, bytes);
      candidateObject = objectKey;
      await this.db.$transaction(
        async (db) => {
          // Serializes with source mutation/reversal and administrative revocation.
          await db.$queryRaw`SELECT id FROM tenants WHERE id=${tenantId}::uuid FOR UPDATE`;
          const current = await db.document.findFirst({
            where: { tenantId, id, generationStatus: 'PROCESSING', leaseToken },
            include: { receipt: { include: { payment: true } } },
          });
          if (!current) throw new Error('DOCUMENT_LEASE_LOST');
          const reversed =
            current.receipt !== null && current.receipt.payment.status !== 'COMPLETED';
          await db.document.update({
            where: { id },
            data: {
              objectKey,
              checksum,
              sizeBytes: BigInt(bytes.length),
              verificationTokenHash: createHash('sha256').update(token).digest('hex'),
              issuedAt: new Date(snapshot.issuedAt),
              generationStatus: reversed ? 'REVOKED' : 'READY',
              leaseToken: null,
              leaseUntil: null,
              ...(reversed ? { revokedAt: new Date(), revocationReason: 'PAYMENT_REVERSED' } : {}),
            },
          });
          await workerDocumentAudit(db, tenantId, id, 'document.generated', {
            checksum,
            attempt: row.attempts,
          });
          if (reversed)
            await workerDocumentAudit(db, tenantId, id, 'document.revoked', {
              reason: 'PAYMENT_REVERSED',
            });
        },
        { maxWait: 30_000, timeout: 30_000 },
      );
    } catch {
      let failureCode = 'DOCUMENT_GENERATION_FAILED';
      try {
        if (candidateObject) {
          // Never remove an object unless the database proves it is not the historical PDF.
          const persisted = await this.db.document.findFirst({
            where: { tenantId, id },
            select: { objectKey: true },
          });
          if (persisted && persisted.objectKey !== candidateObject)
            await this.storage.deleteUncommittedPdf(candidateObject);
        }
      } catch {
        failureCode = 'DOCUMENT_STORAGE_CLEANUP_FAILED';
      }
      // Do not propagate renderer/S3 error messages (they may contain a URL or document content).
      try {
        await this.db.$transaction(async (db) => {
          const updated = await db.document.updateMany({
            where: { tenantId, id, generationStatus: 'PROCESSING', leaseToken },
            data: {
              generationStatus: row.attempts >= 3 ? 'FAILED' : 'PENDING',
              leaseToken: null,
              leaseUntil: null,
              failureCode,
            },
          });
          if (updated.count)
            await workerDocumentAudit(db, tenantId, id, 'document.failed', {
              attempt: row.attempts,
              terminal: row.attempts >= 3,
              code: failureCode,
            });
        });
      } catch {
        // If PostgreSQL is unavailable, the persisted lease expires and permits recovery.
        throw new Error(failureCode);
      }
      throw new Error(failureCode);
    }
  }
}
