import { randomUUID } from 'node:crypto';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { roleGrants, type SystemRole } from '@gestschool/contracts';
import type { GestSchoolPrismaClient } from '@gestschool/database';
import type { RequestContext } from '../iam/domain/context.js';
import { createAssessment, day } from './infrastructure/assessments.js';
import { assessmentAction, enterGrades } from './infrastructure/grade-entry.js';
import { generateReports } from './infrastructure/reports.js';

// Explicit DEV/TEST entry point, never called by production seed or an HTTP controller.
export async function prepareResultsDemo(
  database: GestSchoolPrismaClient,
  tenantId: string,
  emails = {
    teacher: 'teacher@example.invalid',
    validator: 'school-admin@example.invalid',
    student: 'student@example.invalid',
  },
) {
  if (
    process.env['IAM_ENV'] !== 'local' ||
    !['development', 'test'].includes(process.env['NODE_ENV'] ?? '') ||
    !['localhost', '127.0.0.1', '[::1]'].includes(
      new URL(loadInfrastructureConfig().databaseUrl).hostname,
    )
  )
    throw new Error('Results fixtures require local/test and a loopback database');
  return database.$transaction(
    async (db) => {
      await db.$queryRaw`SELECT id FROM tenants WHERE id=${tenantId}::uuid FOR UPDATE`;
      const own = await db.student.findFirstOrThrow({
        where: { tenantId, user: { email: emails.student }, status: 'ACTIVE' },
      });
      const enrollment = await db.enrollment.findFirstOrThrow({
        where: {
          tenantId,
          studentId: own.id,
          status: 'ACTIVE',
          schoolClass: { academicYear: { status: { in: ['DRAFT', 'ACTIVE'] } } },
        },
        orderBy: { createdAt: 'desc' },
        include: { schoolClass: true },
      });
      const marker = await db.iamAuditLog.findFirst({
        where: { tenantId, action: 'dev.results.prepared', subjectId: enrollment.id },
      });
      if (marker) return { created: false as const, enrollmentId: enrollment.id };
      const suffix = enrollment.id.slice(-8),
        classroom = enrollment.schoolClass;
      const year = await db.academicYear.findFirstOrThrow({
        where: { tenantId, id: enrollment.academicYearId },
      });
      async function actor(email: string, role: SystemRole): Promise<RequestContext> {
        const membership = await db.membership.findFirstOrThrow({
          where: { tenantId, user: { email } },
        });
        return {
          tenantId,
          userId: membership.userId,
          membershipId: membership.id,
          sessionId: randomUUID(),
          requestId: randomUUID(),
          ipAddress: '127.0.0.1',
          userAgent: 'results-local-fixture',
          roles: [role],
          grants: [...roleGrants[role]],
        };
      }
      const teacherContext = await actor(emails.teacher, 'TEACHER');
      const validator = await db.membership.findFirstOrThrow({
        where: { tenantId, user: { email: emails.validator } },
        include: { roles: { include: { role: true } } },
      });
      const validatorContext = await actor(
        emails.validator,
        validator.roles.some((link) => link.role.code === 'DIRECTOR') ? 'DIRECTOR' : 'SCHOOL_ADMIN',
      );
      let teacher = await db.teacher.findFirst({
        where: { tenantId, userId: teacherContext.userId, status: 'ACTIVE' },
      });
      teacher ??= await db.teacher.create({
        data: {
          tenantId,
          userId: teacherContext.userId,
          employeeNumber: `RESULT-TEACHER-${suffix}`,
          firstName: 'Professeur',
          lastName: 'Résultats',
        },
      });
      const periods = await db.academicPeriod.findMany({
        where: { tenantId, academicYearId: year.id, status: 'ACTIVE' },
        orderBy: { ordinal: 'asc' },
      });
      if (!periods.length) {
        const midpoint = new Date(
          year.startsOn.getTime() +
            Math.floor((year.endsOn.getTime() - year.startsOn.getTime()) / 86400000 / 2) * 86400000,
        );
        periods.push(
          await db.academicPeriod.create({
            data: {
              tenantId,
              academicYearId: year.id,
              name: 'Semestre 1 — Résultats',
              type: 'SEMESTER',
              ordinal: 1,
              startsOn: year.startsOn,
              endsOn: midpoint,
            },
          }),
        );
        periods.push(
          await db.academicPeriod.create({
            data: {
              tenantId,
              academicYearId: year.id,
              name: 'Semestre 2 — Résultats',
              type: 'SEMESTER',
              ordinal: 2,
              startsOn: new Date(midpoint.getTime() + 86400000),
              endsOn: year.endsOn,
            },
          }),
        );
      }
      const first = periods[0],
        second = periods[1];
      if (!first || !second)
        throw new Error('Results demo requires two active periods; existing calendar preserved');
      const students = await db.student.findMany({
        where: {
          tenantId,
          enrollments: {
            some: { academicYearId: year.id, schoolClassId: classroom.id, status: 'ACTIVE' },
          },
        },
        orderBy: { id: 'asc' },
      });
      if (students.length < 2) {
        if (classroom.capacity !== null && classroom.capacity < 2)
          throw new Error('Results demo requires two places; capacity preserved');
        const extra = await db.student.create({
          data: {
            tenantId,
            matricule: `DEV-RESULT-${suffix}`,
            firstName: 'Élève',
            lastName: 'Ex æquo',
          },
        });
        await db.enrollment.create({
          data: {
            tenantId,
            studentId: extra.id,
            academicYearId: year.id,
            schoolClassId: classroom.id,
            status: 'ACTIVE',
            enrolledOn: year.startsOn,
          },
        });
        students.push(extra);
      }
      const subject = await db.subject.create({
        data: { tenantId, code: `DEV-RESULT-MATH-${suffix}`, name: 'Mathématiques — Résultats' },
      });
      const link = await db.classSubject.create({
        data: { tenantId, schoolClassId: classroom.id, subjectId: subject.id, coefficient: '4' },
      });
      for (const period of [first, second])
        await db.teachingAssignment.create({
          data: {
            tenantId,
            classSubjectId: link.id,
            teacherId: teacher.id,
            academicPeriodId: period.id,
          },
        });
      // This fixture only adds a new subject in the demonstration class. If users configured other
      // subjects, keep them untouched and leave incomplete report publication to the real workflow.
      const published = await createAssessment(db, teacherContext, {
        title: 'Évaluation publiée — Résultats',
        classSubjectId: link.id,
        academicPeriodId: first.id,
        assessedOn: day(first.endsOn),
        maxScore: '20',
        weight: '1',
      });
      let sheet = await enterGrades(db, teacherContext, published.id, {
        expectedVersion: published.version,
        grades: students.map((student) => ({
          studentId: student.id,
          score: '14',
          outcome: 'SCORED',
          comment: 'Travail régulier',
        })),
      });
      let current = await assessmentAction(db, teacherContext, published.id, 'submit', {
        expectedVersion: sheet.assessment.version,
      });
      current = await assessmentAction(db, validatorContext, published.id, 'validate', {
        expectedVersion: current.version,
      });
      await assessmentAction(db, validatorContext, published.id, 'publish', {
        expectedVersion: current.version,
      });
      const draft = await createAssessment(db, teacherContext, {
        title: 'Brouillon — Résultats',
        classSubjectId: link.id,
        academicPeriodId: second.id,
        assessedOn: day(second.endsOn),
        maxScore: '50',
        weight: '2',
      });
      const submitted = await createAssessment(db, teacherContext, {
        title: 'Évaluation soumise — Résultats',
        classSubjectId: link.id,
        academicPeriodId: second.id,
        assessedOn: day(second.endsOn),
        maxScore: '20',
        weight: '1',
      });
      sheet = await enterGrades(db, teacherContext, submitted.id, {
        expectedVersion: submitted.version,
        grades: students.map((student, index) => ({
          studentId: student.id,
          score: index === 0 ? '12' : '14',
          outcome: 'SCORED',
          comment: null,
        })),
      });
      await assessmentAction(db, teacherContext, submitted.id, 'submit', {
        expectedVersion: sheet.assessment.version,
      });
      const subjectCount = await db.classSubject.count({
        where: { tenantId, schoolClassId: classroom.id },
      });
      const reports = await generateReports(
        db,
        validatorContext,
        { classId: classroom.id, academicPeriodId: first.id },
        subjectCount === 1,
      );
      await db.iamAuditLog.create({
        data: {
          tenantId,
          requestId: randomUUID(),
          action: 'dev.results.prepared',
          subjectId: enrollment.id,
        },
      });
      return {
        created: true as const,
        enrollmentId: enrollment.id,
        yearId: year.id,
        classId: classroom.id,
        classSubjectId: link.id,
        periodId: first.id,
        workingPeriodId: second.id,
        assessedOn: day(second.endsOn),
        ownStudentId: own.id,
        studentIds: students.map((student) => student.id),
        publishedId: published.id,
        draftId: draft.id,
        submittedId: submitted.id,
        reportIds: reports.map((report) => report.id),
      };
    },
    { timeout: 60000 },
  );
}
