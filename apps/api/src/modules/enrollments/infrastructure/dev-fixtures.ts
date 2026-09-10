import { randomUUID } from 'node:crypto';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { roleGrants } from '@gestschool/contracts';
import type { GestSchoolPrismaClient } from '@gestschool/database';
import type { RequestContext } from '../../iam/domain/context.js';
import { writeEnrollment } from './writes.js';

export async function prepareEnrollmentDemo(database: GestSchoolPrismaClient, tenantId: string) {
  if (
    process.env['IAM_ENV'] !== 'local' ||
    !['development', 'test'].includes(process.env['NODE_ENV'] ?? '') ||
    !['localhost', '127.0.0.1', '[::1]'].includes(
      new URL(loadInfrastructureConfig().databaseUrl).hostname,
    )
  )
    throw new Error('Enrollment demo requires local/test and a loopback database');
  return database.$transaction(
    async (db) => {
      await db.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId}::uuid FOR UPDATE`;
      const year = await db.academicYear.findFirstOrThrow({
        where: {
          tenantId,
          code: { startsWith: 'DEV-ACADEMIC-' },
          status: { in: ['DRAFT', 'ACTIVE'] },
        },
        orderBy: { createdAt: 'desc' },
      });
      const marker = await db.iamAuditLog.findFirst({
        where: { tenantId, action: 'dev.enrollments.prepared', subjectId: year.id },
      });
      if (marker) return { academicYearId: year.id, created: false };
      const classroom = await db.schoolClass.findFirstOrThrow({
        where: { tenantId, academicYearId: year.id, code: 'DEMO-6E-A', status: 'ACTIVE' },
      });
      const actor = await db.membership.findFirstOrThrow({
        where: { tenantId, user: { email: 'school-admin@example.invalid' } },
      });
      const own = await db.student.findFirstOrThrow({
        where: { tenantId, user: { email: 'student@example.invalid' } },
      });
      const context: RequestContext = {
        tenantId,
        userId: actor.userId,
        membershipId: actor.id,
        sessionId: randomUUID(),
        requestId: randomUUID(),
        ipAddress: '127.0.0.1',
        userAgent: 'dev:access',
        roles: ['SCHOOL_ADMIN'],
        grants: [...roleGrants.SCHOOL_ADMIN],
      };
      const suffix = year.code.slice(-8);
      const createStudent = (code: string, firstName: string) =>
        db.student.create({
          data: {
            tenantId,
            matricule: `DEV-ENR-${code}-${suffix}`,
            firstName,
            lastName: 'Démonstration',
          },
        });
      const unregistered = await createStudent('NEW', 'Élève sans inscription');
      const eligible = await createStudent('RE', 'Élève réinscriptible');
      const occupied = await createStudent('FULL', 'Élève déjà inscrit');
      const target = await db.schoolClass.create({
        data: {
          tenantId,
          academicYearId: year.id,
          levelId: classroom.levelId,
          code: `DEV-ENR-B-${suffix}`,
          name: 'Sixième B — Démo inscriptions',
          capacity: 2,
        },
      });
      const full = await db.schoolClass.create({
        data: {
          tenantId,
          academicYearId: year.id,
          levelId: classroom.levelId,
          code: `DEV-ENR-C-${suffix}`,
          name: 'Sixième C — Démo complète',
          capacity: 1,
        },
      });
      const calendarYear = year.startsOn.getUTCFullYear();
      const previous = await db.academicYear.create({
        data: {
          tenantId,
          code: `DEV-ENR-PREV-${suffix}`,
          name: `Historique démo ${calendarYear - 1}–${calendarYear}`,
          startsOn: new Date(`${calendarYear - 1}-09-01`),
          endsOn: new Date(`${calendarYear}-06-30`),
          status: 'DRAFT',
        },
      });
      const oldClass = await db.schoolClass.create({
        data: {
          tenantId,
          academicYearId: previous.id,
          levelId: classroom.levelId,
          code: `DEV-PREV-${suffix}`,
          name: 'Classe précédente — Démo',
          capacity: null,
        },
      });
      for (const learner of [own, eligible]) {
        // Reuse the real student's existing history when a later demo cycle is requested.
        if (
          learner.id === own.id &&
          (await db.enrollment.count({
            where: {
              tenantId,
              studentId: own.id,
              status: { in: ['ACTIVE', 'COMPLETED', 'TRANSFERRED'] },
              schoolClass: { academicYear: { endsOn: { lt: year.startsOn } } },
            },
          }))
        )
          continue;
        const pending = await writeEnrollment(db, context, {
          action: 'create',
          input: {
            studentId: learner.id,
            academicYearId: previous.id,
            classId: oldClass.id,
            enrolledOn: `${calendarYear - 1}-09-01`,
            type: 'NEW',
          },
        });
        await writeEnrollment(db, context, { action: 'confirm', id: pending.id });
        await writeEnrollment(db, context, {
          action: 'complete',
          id: pending.id,
          input: {
            reason: 'Année de démonstration terminée',
            effectiveDate: `${calendarYear}-06-30`,
          },
        });
      }
      // Import a closed historical demo year without disturbing the tenant's existing ACTIVE year.
      await db.academicYear.update({ where: { id: previous.id }, data: { status: 'CLOSED' } });
      const enrolled = await writeEnrollment(db, context, {
        action: 'create',
        input: {
          studentId: own.id,
          academicYearId: year.id,
          classId: classroom.id,
          enrolledOn: `${calendarYear}-09-01`,
          type: 'RE_ENROLLMENT',
        },
      });
      await writeEnrollment(db, context, { action: 'confirm', id: enrolled.id });
      await writeEnrollment(db, context, {
        action: 'transfer',
        id: enrolled.id,
        input: {
          targetClassId: target.id,
          effectiveDate: `${calendarYear}-09-02`,
          reason: 'Changement de classe de démonstration',
        },
      });
      const fullEnrollment = await writeEnrollment(db, context, {
        action: 'create',
        input: {
          studentId: occupied.id,
          academicYearId: year.id,
          classId: full.id,
          enrolledOn: `${calendarYear}-09-01`,
          type: 'NEW',
        },
      });
      await writeEnrollment(db, context, { action: 'confirm', id: fullEnrollment.id });
      await db.iamAuditLog.create({
        data: {
          tenantId,
          action: 'dev.enrollments.prepared',
          subjectId: year.id,
          requestId: context.requestId,
        },
      });
      return {
        academicYearId: year.id,
        created: true,
        unregisteredStudentId: unregistered.id,
        reenrollableStudentId: eligible.id,
        historyEnrollmentId: enrolled.id,
      };
    },
    { timeout: 30000 },
  );
}
