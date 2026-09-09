import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { createPrismaClient } from '@gestschool/database';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import {
  privilegedRoles,
  type EnrollmentEventView,
  type EnrollmentList,
  type EnrollmentView,
  type LoginResult,
  type PageResult,
  type SystemRole,
} from '@gestschool/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { IamRuntime } from '../src/modules/iam/infrastructure/iam-runtime.js';
import { opaqueToken } from '../src/modules/iam/infrastructure/crypto.js';
import { configureIamHttp } from '../src/modules/iam/presentation/http/security.js';
const db = createPrismaClient(loadInfrastructureConfig().databaseUrl);
const password = opaqueToken();
let hash: string;
let app: INestApplication;
let iam: IamRuntime;
let base: string;
const errors: string[] = [];
class Browser {
  cookies = new Map<string, string>();
  csrf = '';
  access = '';
  async send<T = EnrollmentView>(
    path: string,
    body?: unknown,
    method = 'GET',
    headers: Record<string, string> = {},
  ) {
    const response = await fetch(`${base}/api/v1/${path}`, {
      method,
      headers: {
        Origin: 'http://127.0.0.1:3000',
        'Content-Type': 'application/json',
        'X-CSRF-Token': this.csrf,
        Cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        ...(this.access ? { Authorization: `Bearer ${this.access}` } : {}),
        ...headers,
      },
      ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}),
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
async function account(tenantId: string, role: SystemRole | null) {
  const user = await db.user.create({
    data: {
      email: `${randomUUID()}@example.invalid`,
      displayName: `LOT 7 ${role ?? 'denied'}`,
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
  const browser = new Browser();
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
  if (reply.body.kind !== 'session') throw new Error('Expected session');
  browser.access = reply.body.accessToken;
  return { browser, userId: user.id, membershipId: membership.id };
}
async function graph(tenantId: string, calendarYear = 2026, capacity: number | null = 10) {
  const code = randomUUID().slice(0, 8);
  const year = await db.academicYear.create({
    data: {
      tenantId,
      code,
      name: `Year ${code}`,
      startsOn: new Date(`${calendarYear}-09-01`),
      endsOn: new Date(`${calendarYear + 1}-06-30`),
    },
  });
  const level = await db.level.create({ data: { tenantId, code, name: `Level ${code}` } });
  const classes = [];
  for (const suffix of ['A', 'B', 'C'])
    classes.push(
      await db.schoolClass.create({
        data: {
          tenantId,
          academicYearId: year.id,
          levelId: level.id,
          code: suffix,
          name: `Class ${code} ${suffix}`,
          capacity,
        },
      }),
    );
  const [a, b, c] = classes;
  if (!a || !b || !c) throw new Error('Missing fixture class');
  return { tenantId, year, level, a, b, c };
}
async function student(tenantId: string, userId?: string) {
  return db.student.create({
    data: {
      tenantId,
      matricule: `LOT7-${randomUUID().slice(0, 8)}`,
      firstName: 'Enrollment',
      lastName: `Student ${randomUUID().slice(0, 8)}`,
      ...(userId ? { userId } : {}),
    },
  });
}
type Account = Awaited<ReturnType<typeof account>>;
type Graph = Awaited<ReturnType<typeof graph>>;
const dateOf = (g: Graph) => g.year.startsOn.toISOString().slice(0, 10);
async function pending(g: Graph, who = admin, studentId?: string, classId = g.a.id, type = 'NEW') {
  const learner = studentId ?? (await student(g.tenantId)).id;
  const reply = await who.browser.send(
    'enrollments',
    { studentId: learner, academicYearId: g.year.id, classId, type, enrolledOn: dateOf(g) },
    'POST',
  );
  expect(reply.status).toBe(201);
  return reply.body;
}
async function active(g: Graph, who = admin, studentId?: string) {
  const row = await pending(g, who, studentId);
  const reply = await who.browser.send(`enrollments/${row.id}/confirm`, {}, 'POST');
  expect(reply.status).toBe(200);
  return reply.body;
}
async function transfer(row: EnrollmentView, classId: string, date = '2026-09-02', who = admin) {
  return who.browser.send(
    `enrollments/${row.id}/transfer`,
    { targetClassId: classId, reason: 'Class change requested', effectiveDate: date },
    'POST',
  );
}
let tenantA: string;
let tenantB: string;
let admin: Account;
let other: Account;
let director: Account;
let staff: Account;
let parent: Account;
let pupil: Account;
let denied: Account;
let forbidden: Account[];
let a: Graph;
let b: Graph;
beforeAll(async () => {
  process.env['IAM_REDIS_PREFIX'] = `gestschool:enrollments:test:${randomUUID()}`;
  app = await NestFactory.create(AppModule, {
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
  base = await app.getUrl();
  iam = app.get(IamRuntime);
  hash = await iam.passwords.hash(password);
  tenantA = (await db.tenant.create({ data: { slug: `lot7-a-${randomUUID()}`, name: 'LOT 7 A' } }))
    .id;
  tenantB = (await db.tenant.create({ data: { slug: `lot7-b-${randomUUID()}`, name: 'LOT 7 B' } }))
    .id;
  admin = await account(tenantA, 'SCHOOL_ADMIN');
  other = await account(tenantB, 'SCHOOL_ADMIN');
  director = await account(tenantA, 'DIRECTOR');
  staff = await account(tenantA, 'ACADEMIC_STAFF');
  parent = await account(tenantA, 'PARENT');
  pupil = await account(tenantA, 'STUDENT');
  denied = await account(tenantA, null);
  forbidden = [
    await account(tenantA, 'TEACHER'),
    await account(tenantA, 'ACCOUNTANT'),
    parent,
    pupil,
  ];
  a = await graph(tenantA);
  b = await graph(tenantB);
}, 120000);
afterAll(async () => {
  await app?.close();
  await db.$disconnect();
});

describe('LOT 7 real enrollment HTTP workflow', () => {
  it('creates NEW as PENDING, reserves a place and confirms the same enrollment', async () => {
    const row = await pending(a);
    expect(row).toMatchObject({ type: 'NEW', status: 'PENDING', academicYearId: a.year.id });
    const reply = await admin.browser.send(`enrollments/${row.id}/confirm`, {}, 'POST');
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ id: row.id, status: 'ACTIVE' });
  });
  it('refuses duplicate student/year even after cancellation', async () => {
    const g = await graph(tenantA);
    const row = await pending(g);
    expect(
      (
        await admin.browser.send(
          `enrollments/${row.id}/cancel`,
          { reason: 'Family request', effectiveDate: dateOf(g) },
          'POST',
        )
      ).status,
    ).toBe(200);
    const reply = await admin.browser.send<{ code: string }>(
      'enrollments',
      {
        studentId: row.studentId,
        academicYearId: g.year.id,
        classId: g.b.id,
        type: 'NEW',
        enrolledOn: dateOf(g),
      },
      'POST',
    );
    expect(reply.status).toBe(409);
    expect(reply.body.code).toBe('ENROLLMENT_DUPLICATE');
  });
  it('allows the same student in another academic year without changing prior data', async () => {
    const g = await graph(tenantA);
    const row = await active(g);
    const next = await graph(tenantA, 2027);
    const second = await pending(next, admin, row.studentId);
    expect(second.id).not.toBe(row.id);
    expect((await admin.browser.send(`enrollments/${row.id}`)).body).toEqual(row);
  });
  it('re-enrolls from a prior confirmed history and rejects an already used target year', async () => {
    const g = await graph(tenantA);
    const row = await active(g);
    const next = await graph(tenantA, 2027);
    const result = await pending(next, admin, row.studentId, next.b.id, 'RE_ENROLLMENT');
    expect(result.type).toBe('RE_ENROLLMENT');
    expect(
      (
        await admin.browser.send(
          'enrollments',
          {
            studentId: row.studentId,
            academicYearId: next.year.id,
            classId: next.c.id,
            type: 'RE_ENROLLMENT',
            enrolledOn: dateOf(next),
          },
          'POST',
        )
      ).status,
    ).toBe(409);
  });
  it('rejects re-enrollment without earlier relevant history', async () => {
    const s = await student(tenantA);
    expect(
      (
        await admin.browser.send(
          'enrollments',
          {
            studentId: s.id,
            academicYearId: a.year.id,
            classId: a.a.id,
            type: 'RE_ENROLLMENT',
            enrolledOn: dateOf(a),
          },
          'POST',
        )
      ).status,
    ).toBe(409);
  });
  it.each(['PENDING', 'WITHDRAWN'] as const)(
    'does not use a %s record as re-enrollment proof',
    async (status) => {
      const g = await graph(tenantA);
      const row = await pending(g);
      const next = await graph(tenantA, 2027);
      if (status === 'WITHDRAWN')
        await admin.browser.send(
          `enrollments/${row.id}/cancel`,
          { reason: 'Never attended', effectiveDate: dateOf(g) },
          'POST',
        );
      expect(
        (
          await admin.browser.send(
            'enrollments',
            {
              studentId: row.studentId,
              academicYearId: next.year.id,
              classId: next.a.id,
              type: 'RE_ENROLLMENT',
              enrolledOn: dateOf(next),
            },
            'POST',
          )
        ).status,
      ).toBe(409);
    },
  );
  it('allows pending edits but blocks active class PATCH bypasses', async () => {
    const g = await graph(tenantA);
    const row = await pending(g);
    const edit = await admin.browser.send(`enrollments/${row.id}`, { classId: g.b.id }, 'PATCH');
    expect(edit.status).toBe(200);
    expect(edit.body.classId).toBe(g.b.id);
    await admin.browser.send(`enrollments/${row.id}/confirm`, {}, 'POST');
    expect(
      (await admin.browser.send(`enrollments/${row.id}`, { classId: g.c.id }, 'PATCH')).status,
    ).toBe(409);
  });
  it.each(['student', 'class', 'level'] as const)(
    'rejects archived %s references',
    async (kind) => {
      const g = await graph(tenantA);
      const s = await student(tenantA);
      const data = { status: 'ARCHIVED' as const, archivedAt: new Date() };
      if (kind === 'student') await db.student.update({ where: { id: s.id }, data });
      else if (kind === 'class') await db.schoolClass.update({ where: { id: g.a.id }, data });
      else await db.level.update({ where: { id: g.level.id }, data });
      expect(
        (
          await admin.browser.send(
            'enrollments',
            {
              studentId: s.id,
              academicYearId: g.year.id,
              classId: g.a.id,
              type: 'NEW',
              enrolledOn: dateOf(g),
            },
            'POST',
          )
        ).status,
      ).toBe(409);
    },
  );
  it.each(['CLOSED', 'ARCHIVED'] as const)(
    'freezes every mutation in a %s year',
    async (status) => {
      const g = await graph(tenantA);
      const row = await active(g);
      const draft = await pending(g);
      await db.academicYear.update({
        where: { id: g.year.id },
        data: { status, archivedAt: status === 'ARCHIVED' ? new Date() : null },
      });
      expect((await transfer(row, g.b.id)).status).toBe(409);
      for (const action of ['cancel', 'complete'])
        expect(
          (
            await admin.browser.send(
              `enrollments/${row.id}/${action}`,
              { reason: 'Should be frozen', effectiveDate: dateOf(g) },
              'POST',
            )
          ).status,
        ).toBe(409);
      expect((await admin.browser.send(`enrollments/${draft.id}/confirm`, {}, 'POST')).status).toBe(
        409,
      );
      expect(
        (await admin.browser.send(`enrollments/${draft.id}`, { enrolledOn: dateOf(g) }, 'PATCH'))
          .status,
      ).toBe(409);
      expect(
        (
          await admin.browser.send(
            'enrollments',
            {
              studentId: (await student(tenantA)).id,
              academicYearId: g.year.id,
              classId: g.a.id,
              type: 'NEW',
              enrolledOn: dateOf(g),
            },
            'POST',
          )
        ).status,
      ).toBe(409);
      expect((await admin.browser.send(`enrollments/${row.id}`)).status).toBe(200);
    },
  );
  it('completes ACTIVE but never revives a terminal enrollment', async () => {
    const g = await graph(tenantA);
    const row = await active(g);
    const reply = await admin.browser.send(
      `enrollments/${row.id}/complete`,
      { reason: 'School year completed', effectiveDate: '2027-06-30' },
      'POST',
    );
    expect(reply.status).toBe(200);
    expect(reply.body.status).toBe('COMPLETED');
    expect((await transfer(row, g.b.id)).status).toBe(409);
    expect((await admin.browser.send(`enrollments/${row.id}/confirm`, {}, 'POST')).status).toBe(
      409,
    );
  });
});
describe('capacity and append-only enrollment history', () => {
  it('allows exactly one concurrent reservation for the last place', async () => {
    const g = await graph(tenantA, 2026, 1);
    const students = [await student(tenantA), await student(tenantA)];
    const results = await Promise.all(
      students.map((s) =>
        admin.browser.send(
          'enrollments',
          {
            studentId: s.id,
            academicYearId: g.year.id,
            classId: g.a.id,
            type: 'NEW',
            enrolledOn: dateOf(g),
          },
          'POST',
        ),
      ),
    );
    expect(results.map((row) => row.status).toSorted()).toEqual([201, 409]);
    expect(
      await db.enrollment.count({
        where: { tenantId: tenantA, schoolClassId: g.a.id, status: { in: ['PENDING', 'ACTIVE'] } },
      }),
    ).toBe(1);
  });
  it('does not double-count confirmation and cancellation releases the place', async () => {
    const g = await graph(tenantA, 2026, 1);
    const row = await active(g);
    const reply = await admin.browser.send(
      `enrollments/${row.id}/cancel`,
      { reason: 'Family withdrawal', effectiveDate: dateOf(g) },
      'POST',
    );
    expect(reply.body).toMatchObject({ status: 'WITHDRAWN', endedOn: dateOf(g) });
    expect((await pending(g)).status).toBe('PENDING');
    expect((await admin.browser.send(`enrollments/${row.id}/confirm`, {}, 'POST')).status).toBe(
      409,
    );
  });
  it('rejects capacity reduction below occupied or reserved places through Academics', async () => {
    const g = await graph(tenantA, 2026, 2);
    await active(g);
    await pending(g);
    const reply = await admin.browser.send<{ code: string }>(
      `classes/${g.a.id}`,
      { capacity: 1 },
      'PATCH',
    );
    expect(reply.status).toBe(409);
    expect(reply.body.code).toBe('ACADEMIC_CAPACITY_RESERVED');
  });
  it('treats null capacity as unlimited and returns tenant-safe counts', async () => {
    const g = await graph(tenantA, 2026, null);
    await active(g);
    await pending(g);
    const reply = await admin.browser.send<
      PageResult<{ id: string; occupiedPlaces: number; availablePlaces: number | null }>
    >(`enrollment-classes?academicYearId=${g.year.id}`);
    expect(reply.status).toBe(200);
    expect(reply.body.items.find((row) => row.id === g.a.id)).toMatchObject({
      occupiedPlaces: 2,
      availablePlaces: null,
    });
  });
  it('serializes capacity reduction against a concurrent last-place reservation', async () => {
    const g = await graph(tenantA, 2026, 2);
    await active(g);
    const learner = await student(tenantA);
    const [reservation, reduction] = await Promise.all([
      admin.browser.send(
        'enrollments',
        {
          studentId: learner.id,
          academicYearId: g.year.id,
          classId: g.a.id,
          type: 'NEW',
          enrolledOn: dateOf(g),
        },
        'POST',
      ),
      admin.browser.send(`classes/${g.a.id}`, { capacity: 1 }, 'PATCH'),
    ]);
    expect([
      [201, 409],
      [409, 200],
    ]).toContainEqual([reservation.status, reduction.status]);
    const classroom = await db.schoolClass.findUniqueOrThrow({ where: { id: g.a.id } });
    expect(
      await db.enrollment.count({
        where: { tenantId: tenantA, schoolClassId: g.a.id, status: { in: ['PENDING', 'ACTIVE'] } },
      }),
    ).toBeLessThanOrEqual(classroom.capacity ?? 0);
  });
  it('paginates append-only events without dropping or repeating historical versions', async () => {
    const g = await graph(tenantA);
    const row = await pending(g);
    for (let index = 0; index < 26; index++)
      expect(
        (
          await admin.browser.send(
            `enrollments/${row.id}`,
            { classId: index % 2 ? g.a.id : g.b.id },
            'PATCH',
          )
        ).status,
      ).toBe(200);
    const first = (
      await admin.browser.send<PageResult<EnrollmentEventView>>(
        `enrollments/${row.id}/events?page=1&pageSize=25`,
      )
    ).body;
    const second = (
      await admin.browser.send<PageResult<EnrollmentEventView>>(
        `enrollments/${row.id}/events?page=2&pageSize=25`,
      )
    ).body;
    expect(first.total).toBe(27);
    expect(first.items).toHaveLength(25);
    expect(second.items).toHaveLength(2);
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(27);
  });
  it('enforces composite event foreign keys for tenant, year and actor in PostgreSQL', async () => {
    const row = await pending(await graph(tenantA));
    const record = await db.enrollmentEvent.findFirstOrThrow({ where: { enrollmentId: row.id } });
    for (const data of [
      { ...record, tenantId: tenantB },
      { ...record, toClassId: b.a.id },
      { ...record, academicYearId: b.year.id },
      { ...record, actorMembershipId: other.membershipId },
    ])
      await expect(
        db.enrollmentEvent.create({ data: { ...data, id: randomUUID() } }),
      ).rejects.toThrow();
    expect(await db.enrollmentEvent.count({ where: { enrollmentId: row.id } })).toBe(1);
  });
  it('preserves the exact A → B → C chain, effective dates, reasons and actors', async () => {
    const g = await graph(tenantA);
    const row = await active(g);
    expect((await transfer(row, g.b.id, '2026-09-02')).status).toBe(200);
    expect((await transfer(row, g.c.id, '2026-09-03', director)).status).toBe(200);
    const history = (
      await admin.browser.send<PageResult<EnrollmentEventView>>(`enrollments/${row.id}/events`)
    ).body;
    const moves = history.items.filter((item) => item.kind === 'TRANSFERRED');
    expect(moves.map((item) => [item.fromClassId, item.toClassId])).toEqual([
      [g.a.id, g.b.id],
      [g.b.id, g.c.id],
    ]);
    expect(moves.map((item) => item.effectiveDate)).toEqual(['2026-09-02', '2026-09-03']);
    expect(moves.map((item) => item.actorMembershipId)).toEqual([
      admin.membershipId,
      director.membershipId,
    ]);
    expect(moves.every((item) => item.reason && item.actorName && item.requestId)).toBe(true);
    await db.schoolClass.update({ where: { id: g.a.id }, data: { name: 'Renamed class' } });
    expect(
      (await admin.browser.send<PageResult<EnrollmentEventView>>(`enrollments/${row.id}/events`))
        .body,
    ).toEqual(history);
    const current = (await admin.browser.send(`enrollments/${row.id}`)).body;
    expect(current).toMatchObject({ classId: g.c.id, type: 'NEW', status: 'ACTIVE' });
    expect(
      await db.enrollment.count({
        where: { tenantId: tenantA, studentId: row.studentId, academicYearId: g.year.id },
      }),
    ).toBe(1);
  });
  it('rejects full transfer targets and preserves the source when transfer fails', async () => {
    const g = await graph(tenantA, 2026, 1);
    const row = await active(g);
    await pending(g, admin, undefined, g.b.id);
    expect((await transfer(row, g.b.id)).status).toBe(409);
    expect((await admin.browser.send(`enrollments/${row.id}`)).body).toEqual(row);
    expect(
      await db.enrollmentEvent.count({ where: { enrollmentId: row.id, kind: 'TRANSFERRED' } }),
    ).toBe(0);
  });
  it('serializes concurrent transfers to the same final place', async () => {
    const g = await graph(tenantA, 2026, 1);
    const first = await active(g);
    const second = await pending(g, admin, undefined, g.b.id);
    await admin.browser.send(`enrollments/${second.id}/confirm`, {}, 'POST');
    const results = await Promise.all([transfer(first, g.c.id), transfer(second, g.c.id)]);
    expect(results.map((reply) => reply.status).toSorted()).toEqual([200, 409]);
  });
  it('rejects same-class and backwards-dated transfers', async () => {
    const g = await graph(tenantA);
    const row = await active(g);
    expect((await transfer(row, g.a.id)).status).toBe(409);
    expect((await transfer(row, g.b.id, '2026-09-04')).status).toBe(200);
    expect((await transfer(row, g.c.id, '2026-09-03')).status).toBe(409);
  });
  it('requires a cancellation reason, preserves history and rejects cancelled transfers', async () => {
    const g = await graph(tenantA);
    const row = await active(g);
    expect(
      (
        await admin.browser.send(
          `enrollments/${row.id}/cancel`,
          { effectiveDate: dateOf(g) },
          'POST',
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.browser.send(
          `enrollments/${row.id}/cancel`,
          { reason: 'Family request', effectiveDate: dateOf(g) },
          'POST',
        )
      ).status,
    ).toBe(200);
    expect((await transfer(row, g.b.id)).status).toBe(409);
    const history = (
      await admin.browser.send<PageResult<EnrollmentEventView>>(`enrollments/${row.id}/events`)
    ).body;
    expect(history.items.at(-1)).toMatchObject({
      kind: 'CANCELLED',
      reason: 'Family request',
      toStatus: 'WITHDRAWN',
      actorMembershipId: admin.membershipId,
    });
  });
  it('has no hard-delete endpoint and PostgreSQL rejects history mutation/deletion', async () => {
    const row = await pending(await graph(tenantA));
    expect((await admin.browser.send(`enrollments/${row.id}`, {}, 'DELETE')).status).toBe(404);
    const record = await db.enrollmentEvent.findFirstOrThrow({ where: { enrollmentId: row.id } });
    await expect(
      db.enrollmentEvent.update({ where: { id: record.id }, data: { toClassName: 'Tampered' } }),
    ).rejects.toThrow();
    await expect(db.enrollmentEvent.delete({ where: { id: record.id } })).rejects.toThrow();
    await expect(db.enrollment.delete({ where: { id: row.id } })).rejects.toThrow();
  });
});
describe('tenant and scope boundaries', () => {
  it.each(['class', 'year', 'student'] as const)(
    'rejects a cross-tenant %s on creation',
    async (kind) => {
      const s = await student(kind === 'student' ? tenantB : tenantA);
      const reply = await admin.browser.send(
        'enrollments',
        {
          studentId: s.id,
          academicYearId: kind === 'year' ? b.year.id : a.year.id,
          classId: kind === 'class' ? b.a.id : a.a.id,
          type: 'NEW',
          enrolledOn: dateOf(a),
        },
        'POST',
      );
      expect(reply.status).toBe(404);
    },
  );
  it('rejects a class from another year within the same tenant', async () => {
    const g = await graph(tenantA);
    const s = await student(tenantA);
    expect(
      (
        await admin.browser.send(
          'enrollments',
          {
            studentId: s.id,
            academicYearId: a.year.id,
            classId: g.a.id,
            type: 'NEW',
            enrolledOn: dateOf(a),
          },
          'POST',
        )
      ).status,
    ).toBe(409);
  });
  it('hides exact cross-tenant enrollment/history/student UUIDs and list results', async () => {
    const row = await pending(b, other);
    for (const path of [
      `enrollments/${row.id}`,
      `enrollments/${row.id}/events`,
      `students/${row.studentId}/enrollments`,
      `enrollment-classes?academicYearId=${b.year.id}`,
    ])
      expect((await admin.browser.send(path)).status).toBe(404);
    expect(
      (await admin.browser.send<EnrollmentList>(`enrollments?academicYearId=${b.year.id}`)).body
        .total,
    ).toBe(0);
  });
  it('rejects cross-tenant and cross-year transfer targets', async () => {
    const g = await graph(tenantA);
    const row = await active(g);
    expect((await transfer(row, b.a.id)).status).toBe(404);
    expect((await transfer(row, a.a.id)).status).toBe(409);
  });
  it('rejects unknown fields and arbitrary tenant headers', async () => {
    const row = await pending(await graph(tenantA));
    expect(
      (await admin.browser.send(`enrollments/${row.id}`, { status: 'ACTIVE' }, 'PATCH')).status,
    ).toBe(400);
    expect((await admin.browser.send(`enrollments?tenantId=${tenantB}`)).status).toBe(400);
    expect(
      (await admin.browser.send('enrollments', undefined, 'GET', { 'X-Tenant-ID': tenantB }))
        .status,
    ).toBe(403);
  });
  it('requires authentication and permissions', async () => {
    expect((await new Browser().send('enrollments')).status).toBe(401);
    expect((await denied.browser.send('enrollments')).status).toBe(403);
  });
  it('does not grant administrative CRUD to teacher, accountant, parent or student', async () => {
    for (const who of forbidden)
      expect((await who.browser.send('enrollments', {}, 'POST')).status).toBe(403);
  });
  it('grants tenant-scoped administration to director and academic staff', async () => {
    for (const who of [director, staff])
      expect((await pending(await graph(tenantA), who)).status).toBe('PENDING');
  });
  it('enforces OWN for list, detail, student history and event history', async () => {
    const s = await student(tenantA, pupil.userId);
    const own = await active(await graph(tenantA), admin, s.id);
    const foreign = await active(await graph(tenantA));
    const list = await pupil.browser.send<EnrollmentList>('enrollments');
    expect(list.body.items.map((row) => row.id)).toEqual([own.id]);
    expect((await pupil.browser.send(`enrollments/${own.id}/events`)).status).toBe(200);
    expect((await pupil.browser.send(`students/${s.id}/enrollments`)).status).toBe(200);
    for (const path of [
      `enrollments/${foreign.id}`,
      `enrollments/${foreign.id}/events`,
      `students/${foreign.studentId}/enrollments`,
    ])
      expect((await pupil.browser.send(path)).status).toBe(404);
  });
  it('enforces CHILDREN and immediately revokes it when the real link disappears', async () => {
    const s = await student(tenantA);
    const row = await active(await graph(tenantA), admin, s.id);
    const stranger = await active(await graph(tenantA));
    const guardian = await db.guardian.create({
      data: {
        tenantId: tenantA,
        userId: parent.userId,
        firstName: 'Parent',
        lastName: 'Scope',
        guardianReference: `P-${randomUUID().slice(0, 8)}`,
      },
    });
    await db.studentGuardian.create({
      data: { tenantId: tenantA, studentId: s.id, guardianId: guardian.id, relationship: 'parent' },
    });
    expect(
      (await parent.browser.send<EnrollmentList>('enrollments')).body.items.map((item) => item.id),
    ).toEqual([row.id]);
    expect((await parent.browser.send(`students/${s.id}/enrollments`)).status).toBe(200);
    expect((await parent.browser.send(`enrollments/${row.id}/events`)).status).toBe(200);
    expect((await parent.browser.send(`enrollments/${stranger.id}`)).status).toBe(404);
    await db.studentGuardian.delete({
      where: {
        tenantId_studentId_guardianId: {
          tenantId: tenantA,
          studentId: s.id,
          guardianId: guardian.id,
        },
      },
    });
    expect((await parent.browser.send(`enrollments/${row.id}`)).status).toBe(404);
    expect((await parent.browser.send<EnrollmentList>('enrollments')).body.total).toBe(0);
  });
  it('paginates and searches in SQL with year, class, level, status and type filters', async () => {
    const g = await graph(tenantA);
    const rows = [await pending(g), await pending(g), await pending(g)];
    const first = (
      await admin.browser.send<EnrollmentList>(
        `enrollments?academicYearId=${g.year.id}&classId=${g.a.id}&levelId=${g.level.id}&status=PENDING&type=NEW&pageSize=2&sort=name`,
      )
    ).body;
    const second = (
      await admin.browser.send<EnrollmentList>(
        `enrollments?academicYearId=${g.year.id}&pageSize=2&page=2&sort=name`,
      )
    ).body;
    expect(first.total).toBe(3);
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map((row) => row.id)).size).toBe(3);
    for (const row of rows)
      expect(
        (
          await admin.browser.send<EnrollmentList>(
            `enrollments?search=${encodeURIComponent(row.matricule)}`,
          )
        ).body.items.map((item) => item.id),
      ).toEqual([row.id]);
    expect((await admin.browser.send('enrollments?pageSize=101')).status).toBe(400);
  });
  it('records all six requested audit actions with context and transfer metadata', async () => {
    const rows = await db.auditLog.findMany({
      where: { tenantId: tenantA, action: { startsWith: 'enrollment.' } },
    });
    expect(new Set(rows.map((row) => row.action))).toEqual(
      new Set([
        'enrollment.created',
        'enrollment.updated',
        'enrollment.confirmed',
        'enrollment.cancelled',
        'enrollment.transferred',
        'enrollment.completed',
      ]),
    );
    for (const row of rows) {
      expect(row.actorMembershipId).toBeTruthy();
      expect(row.metadata).toMatchObject({
        requestId: expect.any(String),
        membershipId: expect.any(String),
        resourceId: row.entityId,
      });
    }
    const move = rows.find((row) => row.action === 'enrollment.transferred');
    expect(move?.metadata).toMatchObject({
      after: {
        oldClassId: expect.any(String),
        newClassId: expect.any(String),
        reason: expect.any(String),
        effectiveDate: expect.any(String),
        actor: expect.any(String),
      },
    });
    expect(errors).toEqual([]);
  });
});
