import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import type { INestApplication } from '@nestjs/common';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { roleGrants, type OfficialDocumentType } from '@gestschool/contracts';
import type { GestSchoolPrismaClient } from '@gestschool/database';
import { DocumentsRuntime } from '@gestschool/worker/documents-runtime';
import type { RequestContext } from '../iam/domain/context.js';
import { EnrollmentService } from '../enrollments/application/enrollment.service.js';
import { DocumentsService } from './application/documents.service.js';

// Explicit local CLI only. The production seed and HTTP routes never call this helper.
export async function prepareDocumentsDemo(
  db: GestSchoolPrismaClient,
  app: INestApplication,
  tenantId: string,
) {
  if (
    process.env['IAM_ENV'] !== 'local' ||
    !['development', 'test'].includes(process.env['NODE_ENV'] ?? '') ||
    !['localhost', '127.0.0.1', '[::1]'].includes(
      new URL(loadInfrastructureConfig().databaseUrl).hostname,
    )
  )
    throw new Error('Document fixtures require local DEV/TEST');
  const member = await db.membership.findFirstOrThrow({
    where: {
      tenantId,
      user: { email: 'school-admin@example.invalid' },
      roles: { some: { role: { code: 'SCHOOL_ADMIN', tenantId: null } } },
    },
  });
  const context: RequestContext = {
    tenantId,
    membershipId: member.id,
    userId: member.userId,
    sessionId: randomUUID(),
    requestId: randomUUID(),
    ipAddress: '127.0.0.1',
    userAgent: 'documents-dev-fixture',
    roles: ['SCHOOL_ADMIN'],
    grants: [...roleGrants.SCHOOL_ADMIN],
  };
  const student = await db.student.findFirstOrThrow({
    where: { tenantId, user: { email: 'student@example.invalid' }, status: 'ACTIVE' },
  });
  const year = await db.academicYear.findFirstOrThrow({ where: { tenantId, status: 'ACTIVE' } });
  let enrollment = await db.enrollment.findFirst({
    where: { tenantId, studentId: student.id, academicYearId: year.id },
  });
  if (!enrollment) {
    const classroom = await db.schoolClass.findFirstOrThrow({
      where: { tenantId, academicYearId: year.id, status: 'ACTIVE' },
    });
    const created = await app.get(EnrollmentService).create(context, {
      studentId: student.id,
      academicYearId: year.id,
      classId: classroom.id,
      type: 'NEW',
      enrolledOn: year.startsOn.toISOString().slice(0, 10),
    });
    await app.get(EnrollmentService).transition(context, 'confirm', created.id, {});
    enrollment = await db.enrollment.findUniqueOrThrow({ where: { id: created.id } });
  }
  if (enrollment.status !== 'ACTIVE')
    throw new Error('DEV document source is not active; historical enrollment is preserved');
  const service = app.get(DocumentsService),
    identifiers: string[] = [];
  for (const type of ['SCHOOL_CERTIFICATE', 'STUDENT_CARD', 'ENROLLMENT_CERTIFICATE'] as const) {
    const status = type === 'ENROLLMENT_CERTIFICATE' ? 'REVOKED' : 'READY';
    const existing = await db.document.findFirst({
      where: {
        tenantId,
        enrollmentId: enrollment.id,
        documentType: type,
        locale: 'fr',
        generationStatus: status,
      },
    });
    if (existing) {
      identifiers.push(existing.id);
      continue;
    }
    const pending = await db.document.findFirst({
      where: {
        tenantId,
        enrollmentId: enrollment.id,
        documentType: type,
        locale: 'fr',
        generationStatus: { in: ['PENDING', 'PROCESSING'] },
      },
    });
    identifiers.push(
      pending?.id ??
        (
          await service.generate(
            context,
            { documentType: type, sourceId: enrollment.id, locale: 'fr' },
            randomUUID(),
          )
        ).id,
    );
  }
  const runtime = new DocumentsRuntime();
  try {
    await runtime.start();
    const deadline = Date.now() + 120000;
    while (
      await db.document.count({
        where: { id: { in: identifiers }, generationStatus: { in: ['PENDING', 'PROCESSING'] } },
      })
    ) {
      if (Date.now() > deadline) throw new Error('DEV document generation timed out');
      await setTimeout(500);
    }
    const rows = await db.document.findMany({ where: { id: { in: identifiers } } });
    if (rows.length !== 3 || rows.some((r) => r.generationStatus === 'FAILED'))
      throw new Error('DEV document generation failed');
    const historical = rows.find(
      (r) => r.documentType === ('ENROLLMENT_CERTIFICATE' satisfies OfficialDocumentType),
    );
    if (historical?.generationStatus === 'READY')
      await service.revoke(context, historical.id, {
        reason: 'Démonstration de révocation — document historique',
      });
  } finally {
    await runtime.onModuleDestroy();
  }
  return { documents: identifiers.length };
}
