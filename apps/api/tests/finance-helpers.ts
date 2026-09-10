import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { Controller, Get, Module } from '@nestjs/common';
import { createPrismaClient } from '@gestschool/database';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import {
  privilegedRoles,
  type FinanceView,
  type LoginResult,
  type SystemRole,
  type EnrollmentView,
  type FeeScheduleView,
  type FeeTypeView,
  type InvoiceView,
  type PaymentView,
} from '@gestschool/contracts';
import { expect } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { IamRuntime } from '../src/modules/iam/infrastructure/iam-runtime.js';
import { opaqueToken } from '../src/modules/iam/infrastructure/crypto.js';
import {
  configureIamHttp,
  RequirePermission,
} from '../src/modules/iam/presentation/http/security.js';
@Controller('api/v1/finance-cert')
class FinancePermissionProbe {
  @Get('grades') @RequirePermission('grades.update', ['TENANT', 'PLATFORM', 'ASSIGNED']) grades() {
    return { ok: true };
  }
}
@Module({ imports: [AppModule], controllers: [FinancePermissionProbe] })
class FinanceTestModule {}
export class FinanceBrowser {
  cookies = new Map<string, string>();
  csrf = '';
  access = '';
  constructor(readonly base: string) {}
  async send<T = FinanceView>(
    path: string,
    body?: unknown,
    method = 'GET',
    headers: Record<string, string> = {},
  ) {
    const response = await fetch(`${this.base}/api/v1/${path}`, {
      method,
      headers: {
        Origin: 'http://127.0.0.1:3000',
        'Content-Type': 'application/json',
        'X-CSRF-Token': this.csrf,
        Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        ...(this.access ? { Authorization: `Bearer ${this.access}` } : {}),
        ...headers,
      },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
    });
    for (const raw of response.headers.getSetCookie()) {
      const pair = raw.split(';')[0];
      if (pair) {
        const at = pair.indexOf('=');
        this.cookies.set(pair.slice(0, at), pair.slice(at + 1));
      }
    }
    return { status: response.status, body: (await response.json()) as T };
  }
}
export async function financeHarness() {
  const db = createPrismaClient(loadInfrastructureConfig().databaseUrl),
    password = opaqueToken(),
    errors: string[] = [];
  process.env['IAM_REDIS_PREFIX'] = `gestschool:finance:test:${randomUUID()}`;
  const app = await NestFactory.create(FinanceTestModule, {
    logger: {
      log() {},
      warn(value: unknown) {
        errors.push(String(value));
      },
      error(value: unknown) {
        errors.push(String(value));
      },
    },
  });
  configureIamHttp(app);
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl(),
    iam = app.get(IamRuntime),
    hash = await iam.passwords.hash(password);
  async function account(tenantId: string, role: SystemRole | null) {
    const user = await db.user.create({
      data: {
        email: `${randomUUID()}@example.invalid`,
        displayName: `LOT 8 ${role ?? 'denied'}`,
        identity: { create: { passwordHash: hash, activatedAt: new Date() } },
      },
    });
    const membership = await db.membership.create({ data: { tenantId, userId: user.id } });
    if (role) {
      const row = await db.role.findFirstOrThrow({ where: { tenantId: null, code: role } });
      await db.membershipRole.create({
        data: { tenantId, membershipId: membership.id, roleId: row.id },
      });
    }
    const secret = role && privilegedRoles.includes(role) ? iam.crypto.newTotp().secret : null;
    if (secret)
      await db.authIdentity.update({
        where: { userId: user.id },
        data: { mfaSecret: iam.crypto.encrypt(secret, user.id), mfaEnabledAt: new Date() },
      });
    const browser = new FinanceBrowser(base);
    browser.csrf = (await browser.send<{ csrfToken: string }>('auth/csrf')).body.csrfToken;
    let reply = await browser.send<LoginResult>(
      'auth/login',
      { email: user.email, password },
      'POST',
    );
    expect(reply.status).toBe(201);
    if (secret) {
      if (reply.body.kind !== 'mfa') throw new Error('Expected MFA');
      reply = await browser.send<LoginResult>(
        'auth/mfa/verify',
        { challenge: reply.body.challenge, code: iam.crypto.totp(secret).generate() },
        'POST',
      );
    }
    if (reply.body.kind !== 'session') throw new Error('Expected authenticated session');
    browser.access = reply.body.accessToken;
    return { browser, userId: user.id, membershipId: membership.id };
  }
  async function tenant() {
    return db.tenant.create({
      data: { slug: `lot8-${randomUUID()}`, name: 'LOT 8 Finance certification' },
    });
  }
  async function graph(tenantId: string, browser: FinanceBrowser, userId?: string) {
    const code = randomUUID().slice(0, 8);
    const year = await db.academicYear.create({
      data: {
        tenantId,
        code,
        name: `Year ${code}`,
        startsOn: new Date('2026-01-01'),
        endsOn: new Date('2026-12-31'),
      },
    });
    const level = await db.level.create({ data: { tenantId, code, name: `Level ${code}` } });
    const classroom = await db.schoolClass.create({
      data: { tenantId, academicYearId: year.id, levelId: level.id, code, name: `Class ${code}` },
    });
    const student = await db.student.create({
      data: {
        tenantId,
        matricule: `LOT8-${code}`,
        firstName: 'Finance',
        lastName: code,
        ...(userId ? { userId } : {}),
      },
    });
    const enrollment = await browser.send<EnrollmentView>(
      'enrollments',
      {
        studentId: student.id,
        academicYearId: year.id,
        classId: classroom.id,
        type: 'NEW',
        enrolledOn: '2026-01-01',
      },
      'POST',
    );
    expect(enrollment.status).toBe(201);
    expect(
      (await browser.send(`enrollments/${enrollment.body.id}/confirm`, {}, 'POST')).status,
    ).toBe(200);
    return { tenantId, year, level, classroom, student, enrollment: enrollment.body };
  }
  return {
    db,
    app,
    base,
    errors,
    account,
    tenant,
    graph,
    async close() {
      await app.close();
      await db.$disconnect();
    },
  };
}
export type FinanceHarness = Awaited<ReturnType<typeof financeHarness>>;
export type FinanceGraph = Awaited<ReturnType<FinanceHarness['graph']>>;
export type FinanceAccount = Awaited<ReturnType<FinanceHarness['account']>>;
export async function scheduleFixture(
  browser: FinanceBrowser,
  g: FinanceGraph,
  amountMinor = '300000',
  currency = 'XOF',
) {
  const fee = await browser.send<FeeTypeView>(
    'finance/fee-types',
    { code: `F-${randomUUID().slice(0, 8)}`, name: 'Scolarité historique' },
    'POST',
  );
  expect(fee.status).toBe(201);
  const schedule = await browser.send<FeeScheduleView>(
    'finance/fee-schedules',
    {
      code: `G-${randomUUID().slice(0, 8)}`,
      name: 'Grille annuelle',
      academicYearId: g.year.id,
      levelId: g.level.id,
      classId: g.classroom.id,
      currency,
    },
    'POST',
  );
  expect(schedule.status).toBe(201);
  const reply = await browser.send<FeeScheduleView>(
    `finance/fee-schedules/${schedule.body.id}/items`,
    {
      feeTypeId: fee.body.id,
      amountMinor,
      dueOn: '2026-12-31',
      installments:
        amountMinor === '300000'
          ? [
              { amountMinor: '100000', ordinal: 1, dueOn: '2026-03-31' },
              { amountMinor: '100000', ordinal: 2, dueOn: '2026-06-30' },
              { amountMinor: '100000', ordinal: 3, dueOn: '2026-12-31' },
            ]
          : [],
    },
    'POST',
  );
  expect(reply.status).toBe(200);
  return { fee: fee.body, schedule: reply.body };
}
export async function invoiceFixture(browser: FinanceBrowser, g: FinanceGraph, scheduleId: string) {
  const reply = await browser.send<InvoiceView>(
    'finance/invoices',
    {
      studentId: g.student.id,
      enrollmentId: g.enrollment.id,
      feeScheduleId: scheduleId,
      issuedOn: '2026-01-01',
    },
    'POST',
  );
  expect(reply.status).toBe(201);
  return reply.body;
}
export function paymentInput(
  invoice: InvoiceView,
  amountMinor = '100000',
  method = 'BANK_TRANSFER',
  cashSessionId: string | null = null,
) {
  return {
    studentId: invoice.studentId,
    amountMinor,
    currency: invoice.currency,
    method,
    cashSessionId,
    allocations: [{ invoiceId: invoice.id, amountMinor }],
  };
}
export async function capture(browser: FinanceBrowser, invoice: InvoiceView, amount = '100000') {
  const reply = await browser.send<PaymentView>(
    'finance/payments',
    paymentInput(invoice, amount),
    'POST',
    { 'Idempotency-Key': randomUUID() },
  );
  expect(reply.status).toBe(201);
  return reply.body;
}
export async function validate(browser: FinanceBrowser, payment: PaymentView) {
  const reply = await browser.send<PaymentView>(
    `finance/payments/${payment.id}/validate`,
    {},
    'POST',
  );
  expect(reply.status).toBe(200);
  return reply.body;
}
