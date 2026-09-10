import { randomUUID } from 'node:crypto';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { roleGrants } from '@gestschool/contracts';
import type { GestSchoolPrismaClient } from '@gestschool/database';
import type { RequestContext } from '../iam/domain/context.js';
import { writeFees } from './infrastructure/fees.js';
import { writeInvoice } from './infrastructure/invoices.js';
import { writePayment } from './infrastructure/payments.js';
import { date } from './infrastructure/views.js';
// Public local-fixture entry point: other modules never access Finance repositories.
export async function prepareFinanceDemo(
  database: GestSchoolPrismaClient,
  tenantId: string,
  actorEmail = 'accountant@example.invalid',
  studentEmail = 'student@example.invalid',
) {
  if (
    process.env['IAM_ENV'] !== 'local' ||
    !['development', 'test'].includes(process.env['NODE_ENV'] ?? '') ||
    !['localhost', '127.0.0.1', '[::1]'].includes(
      new URL(loadInfrastructureConfig().databaseUrl).hostname,
    )
  )
    throw new Error('Finance fixtures require local/test and a loopback database');
  return database.$transaction(
    async (db) => {
      await db.$queryRaw`SELECT id FROM tenants WHERE id=${tenantId}::uuid FOR UPDATE`;
      const actor = await db.membership.findFirstOrThrow({
        where: {
          tenantId,
          user: { email: actorEmail },
          roles: { some: { role: { code: 'ACCOUNTANT', tenantId: null } } },
        },
      });
      const student = await db.student.findFirstOrThrow({
        where: { tenantId, user: { email: studentEmail }, status: 'ACTIVE' },
      });
      const enrollment = await db.enrollment.findFirstOrThrow({
        where: {
          tenantId,
          studentId: student.id,
          status: 'ACTIVE',
          schoolClass: { academicYear: { status: { in: ['DRAFT', 'ACTIVE'] } } },
        },
        orderBy: { createdAt: 'desc' },
      });
      const marker = await db.iamAuditLog.findFirst({
        where: { tenantId, action: 'dev.finance.prepared', subjectId: enrollment.id },
      });
      if (marker) return { created: false, enrollmentId: enrollment.id };
      const year = await db.academicYear.findFirstOrThrow({
        where: { tenantId, id: enrollment.academicYearId },
      });
      const classroom = await db.schoolClass.findFirstOrThrow({
        where: { tenantId, id: enrollment.schoolClassId },
      });
      const context: RequestContext = {
        tenantId,
        userId: actor.userId,
        membershipId: actor.id,
        sessionId: randomUUID(),
        requestId: randomUUID(),
        ipAddress: '127.0.0.1',
        userAgent: 'finance-local-fixture',
        roles: ['ACCOUNTANT'],
        grants: [...roleGrants.ACCOUNTANT],
      };
      const suffix = enrollment.id.slice(-8);
      const fee = await writeFees(db, context, {
        action: 'fee-type.create',
        input: { code: `DEV-TUITION-${suffix}`, name: 'Scolarité — Démonstration' },
      });
      const schedule = await writeFees(db, context, {
        action: 'schedule.create',
        input: {
          code: `DEV-FIN-${suffix}`,
          name: 'Grille XOF — Démonstration',
          academicYearId: year.id,
          levelId: classroom.levelId,
          classId: null,
          currency: 'XOF',
        },
      });
      const span = year.endsOn.getTime() - year.startsOn.getTime();
      const dueDates = [
        date(new Date(year.startsOn.getTime() + Math.min(span, 29 * 86400000))),
        date(new Date(year.startsOn.getTime() + Math.floor(span / 2))),
        date(year.endsOn),
      ];
      await writeFees(db, context, {
        action: 'item.create',
        id: schedule.id,
        input: {
          feeTypeId: fee.id,
          amountMinor: '300000',
          dueOn: date(year.endsOn),
          installments: dueDates.map((dueOn, index) => ({
            dueOn,
            amountMinor: '100000',
            ordinal: index + 1,
          })),
        },
      });
      const existing = await db.cashSession.findFirst({
        where: { tenantId, openedByMembershipId: actor.id, status: 'OPEN' },
      });
      const cash =
        existing ??
        (await writePayment(db, context, {
          action: 'cash.open',
          input: { currency: 'XOF', openingAmountMinor: '10000' },
        }));
      const invoices = [];
      for (const amount of ['0', '100000', '300000']) {
        const invoice = await writeInvoice(db, context, {
          action: 'invoice.create',
          input: {
            studentId: student.id,
            enrollmentId: enrollment.id,
            feeScheduleId: schedule.id,
            issuedOn: date(year.startsOn),
          },
        });
        invoices.push(invoice.id);
        if (amount !== '0') {
          const cashPayment = amount === '300000';
          const payment = await writePayment(db, context, {
            action: 'payment.create',
            key: `demo-${invoice.id}`,
            input: {
              studentId: student.id,
              amountMinor: amount,
              currency: 'XOF',
              method: cashPayment ? 'CASH' : 'BANK_TRANSFER',
              cashSessionId: cashPayment ? cash.id : null,
              allocations: [{ invoiceId: invoice.id, amountMinor: amount }],
            },
          });
          await writePayment(db, context, {
            action: 'payment.validate',
            id: payment.id,
            input: {},
          });
        }
      }
      await db.iamAuditLog.create({
        data: {
          tenantId,
          action: 'dev.finance.prepared',
          subjectId: enrollment.id,
          requestId: context.requestId,
        },
      });
      return {
        created: true,
        enrollmentId: enrollment.id,
        invoiceIds: invoices,
        scheduleId: schedule.id,
        cashSessionId: cash.id,
      };
    },
    { timeout: 60000, maxWait: 30000 },
  );
}
