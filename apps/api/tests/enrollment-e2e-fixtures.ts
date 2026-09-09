import { randomUUID } from 'node:crypto';
import { roleGrants } from '@gestschool/contracts';
import type { GestSchoolPrismaClient } from '@gestschool/database';
import type { RequestContext } from '../src/modules/iam/domain/context.js';
import { writeEnrollment } from '../src/modules/enrollments/infrastructure/writes.js';

export async function enrollmentFixture(
  database: GestSchoolPrismaClient,
  tenantId: string,
  adminEmail: string,
  studentEmail: string,
  parentEmail: string,
) {
  return database.$transaction(
    async (db) => {
      const actor = await db.membership.findFirstOrThrow({
        where: { tenantId, user: { email: adminEmail } },
      });
      const context: RequestContext = {
        tenantId,
        userId: actor.userId,
        membershipId: actor.id,
        sessionId: randomUUID(),
        requestId: randomUUID(),
        ipAddress: '127.0.0.1',
        userAgent: 'e2e-setup',
        roles: ['SCHOOL_ADMIN'],
        grants: [...roleGrants.SCHOOL_ADMIN],
      };
      const year = await db.academicYear.create({
        data: {
          tenantId,
          code: 'ENR-2026',
          name: 'Année inscriptions',
          startsOn: new Date('2026-09-01'),
          endsOn: new Date('2027-06-30'),
        },
      });
      const level = await db.level.create({
        data: { tenantId, code: 'ENR-6E', name: 'Niveau inscriptions' },
      });
      const a = await db.schoolClass.create({
        data: {
          tenantId,
          academicYearId: year.id,
          levelId: level.id,
          code: 'A',
          name: 'Classe Alpha',
          capacity: 10,
        },
      });
      const b = await db.schoolClass.create({
        data: {
          tenantId,
          academicYearId: year.id,
          levelId: level.id,
          code: 'B',
          name: 'Classe Bêta',
          capacity: 2,
        },
      });
      const full = await db.schoolClass.create({
        data: {
          tenantId,
          academicYearId: year.id,
          levelId: level.id,
          code: 'FULL',
          name: 'Classe complète',
          capacity: 1,
        },
      });
      const user = await db.user.findUniqueOrThrow({ where: { email: studentEmail } });
      const parent = await db.user.findUniqueOrThrow({ where: { email: parentEmail } });
      const own = await db.student.create({
        data: {
          tenantId,
          userId: user.id,
          matricule: 'ENR-OWN',
          firstName: 'Élève',
          lastName: 'Lié',
        },
      });
      const candidate = await db.student.create({
        data: { tenantId, matricule: 'ENR-NEW', firstName: 'Élève', lastName: 'Candidat' },
      });
      const eligible = await db.student.create({
        data: { tenantId, matricule: 'ENR-RE', firstName: 'Élève', lastName: 'Réinscriptible' },
      });
      const other = await db.student.create({
        data: { tenantId, matricule: 'ENR-OTHER', firstName: 'Élève', lastName: 'Non lié' },
      });
      const guardian = await db.guardian.create({
        data: {
          tenantId,
          userId: parent.id,
          guardianReference: 'ENR-PARENT',
          firstName: 'Parent',
          lastName: 'Lié',
        },
      });
      await db.studentGuardian.create({
        data: {
          tenantId,
          studentId: own.id,
          guardianId: guardian.id,
          relationship: 'parent',
          isPrimary: true,
        },
      });
      const previous = await db.academicYear.create({
        data: {
          tenantId,
          code: 'ENR-PREV',
          name: 'Année précédente',
          startsOn: new Date('2025-09-01'),
          endsOn: new Date('2026-06-30'),
        },
      });
      const old = await db.schoolClass.create({
        data: {
          tenantId,
          academicYearId: previous.id,
          levelId: level.id,
          code: 'OLD',
          name: 'Classe précédente',
        },
      });
      const historic = await writeEnrollment(db, context, {
        action: 'create',
        input: {
          studentId: eligible.id,
          academicYearId: previous.id,
          classId: old.id,
          type: 'NEW',
          enrolledOn: '2025-09-01',
        },
      });
      await writeEnrollment(db, context, { action: 'confirm', id: historic.id });
      await writeEnrollment(db, context, {
        action: 'complete',
        id: historic.id,
        input: { reason: 'Année précédente terminée', effectiveDate: '2026-06-30' },
      });
      await db.academicYear.update({ where: { id: previous.id }, data: { status: 'CLOSED' } });
      const owned = await writeEnrollment(db, context, {
        action: 'create',
        input: {
          studentId: own.id,
          academicYearId: year.id,
          classId: a.id,
          type: 'NEW',
          enrolledOn: '2026-09-01',
        },
      });
      await writeEnrollment(db, context, { action: 'confirm', id: owned.id });
      await writeEnrollment(db, context, {
        action: 'transfer',
        id: owned.id,
        input: {
          targetClassId: b.id,
          reason: 'Transfert scolaire témoin',
          effectiveDate: '2026-09-02',
        },
      });
      const occupied = await writeEnrollment(db, context, {
        action: 'create',
        input: {
          studentId: other.id,
          academicYearId: year.id,
          classId: full.id,
          type: 'NEW',
          enrolledOn: '2026-09-01',
        },
      });
      await writeEnrollment(db, context, { action: 'confirm', id: occupied.id });
      return {
        yearId: year.id,
        classId: a.id,
        targetClassId: b.id,
        fullClassId: full.id,
        studentId: candidate.id,
        ownStudentId: own.id,
        otherStudentId: other.id,
        ownEnrollmentId: owned.id,
        otherEnrollmentId: occupied.id,
        eligibleStudentId: eligible.id,
      };
    },
    { timeout: 30000 },
  );
}
