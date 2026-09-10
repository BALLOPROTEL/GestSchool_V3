import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { createPrismaClient } from '@gestschool/database';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import {
  privilegedRoles,
  type AcademicView,
  type LoginResult,
  type PageResult,
  type PersonView,
  type SystemRole,
} from '@gestschool/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { IamRuntime } from '../src/modules/iam/infrastructure/iam-runtime.js';
import { opaqueToken } from '../src/modules/iam/infrastructure/crypto.js';
import { configureIamHttp } from '../src/modules/iam/presentation/http/security.js';

const db = createPrismaClient(loadInfrastructureConfig().databaseUrl);
const password = opaqueToken();
const errors: string[] = [];
let app: INestApplication;
let iam: IamRuntime;
let base: string;
let hash: string;
class Browser {
  cookies = new Map<string, string>();
  csrf = '';
  access = '';
  async send<T = AcademicView>(
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
    return {
      status: response.status,
      body: (await response.json()) as T,
      headers: response.headers,
    };
  }
  async init() {
    this.csrf = (await this.send<{ csrfToken: string }>('auth/csrf')).body.csrfToken;
    return this;
  }
}
async function account(tenantId: string, role: SystemRole | null) {
  const email = `${randomUUID()}@example.invalid`;
  const user = await db.user.create({
    data: {
      email,
      displayName: 'LOT 6 HTTP fixture',
      identity: { create: { passwordHash: hash, activatedAt: new Date() } },
    },
  });
  const membership = await db.membership.create({ data: { userId: user.id, tenantId } });
  if (role) {
    const roleRow = await db.role.findFirstOrThrow({ where: { tenantId: null, code: role } });
    await db.membershipRole.create({
      data: { membershipId: membership.id, tenantId, roleId: roleRow.id },
    });
  }
  const secret = role && privilegedRoles.includes(role) ? iam.crypto.newTotp().secret : null;
  if (secret)
    await db.authIdentity.update({
      where: { userId: user.id },
      data: { mfaSecret: iam.crypto.encrypt(secret, user.id), mfaEnabledAt: new Date() },
    });
  const browser = await new Browser().init();
  let reply = await browser.send<LoginResult>('auth/login', { email, password }, 'POST');
  expect(reply.status).toBe(201);
  if (secret) {
    if (reply.body.kind !== 'mfa') throw new Error('Expected MFA challenge');
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
type Account = Awaited<ReturnType<typeof account>>;
async function create(browser: Browser, path: string, input: unknown) {
  const reply = await browser.send(path, input, 'POST');
  expect(reply.status, `${path} creation`).toBe(201);
  return reply.body;
}
const yearInput = {
  code: '2026-2027',
  name: 'Academic year',
  startsOn: '2026-09-01',
  endsOn: '2027-06-30',
};
const periodInput = {
  name: 'Trimester 1',
  type: 'TRIMESTER',
  ordinal: 1,
  startsOn: '2026-09-01',
  endsOn: '2026-12-18',
};
async function graph(browser: Browser, teacherUserId?: string) {
  const year = await create(browser, 'academic-years', yearInput);
  const period = await create(browser, `academic-years/${year.id}/periods`, periodInput);
  const level = await create(browser, 'levels', { code: '6E', name: 'Sixième' });
  const classroom = await create(browser, 'classes', {
    academicYearId: year.id,
    levelId: level.id,
    code: '6E-A',
    name: 'Sixième A',
    capacity: 36,
  });
  const subject = await create(browser, 'subjects', { code: 'MATH', name: 'Mathematics' });
  const link = await create(browser, `classes/${classroom.id}/subjects`, {
    subjectId: subject.id,
    coefficient: '4.25',
  });
  const teacherReply = await browser.send<PersonView>(
    'teachers',
    { firstName: 'Teacher', lastName: 'Academic' },
    'POST',
  );
  expect(teacherReply.status).toBe(201);
  const teacher = teacherReply.body;
  if (teacherUserId)
    await db.teacher.update({ where: { id: teacher.id }, data: { userId: teacherUserId } });
  const assignment = await create(browser, 'teaching-assignments', {
    classSubjectId: link.id,
    teacherId: teacher.id,
    academicPeriodId: period.id,
  });
  return { year, period, level, classroom, subject, link, teacher, assignment };
}
let tenantA: string;
let tenantB: string;
let admin: Account;
let other: Account;
let teacher: Account;
let teacherOther: Account;
let director: Account;
let staff: Account;
let denied: Account;
let accountant: Account;
let forbiddenRoles: Account[];
let a: Awaited<ReturnType<typeof graph>>;
let b: Awaited<ReturnType<typeof graph>>;
beforeAll(async () => {
  process.env['IAM_REDIS_PREFIX'] = `gestschool:academics:test:${randomUUID()}`;
  app = await NestFactory.create(AppModule, {
    logger: {
      log() {},
      warn() {},
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
  tenantA = (
    await db.tenant.create({ data: { slug: `academic-a-${randomUUID()}`, name: 'Academic A' } })
  ).id;
  tenantB = (
    await db.tenant.create({ data: { slug: `academic-b-${randomUUID()}`, name: 'Academic B' } })
  ).id;
  admin = await account(tenantA, 'SCHOOL_ADMIN');
  other = await account(tenantB, 'SCHOOL_ADMIN');
  teacher = await account(tenantA, 'TEACHER');
  teacherOther = await account(tenantA, 'TEACHER');
  director = await account(tenantA, 'DIRECTOR');
  staff = await account(tenantA, 'ACADEMIC_STAFF');
  denied = await account(tenantA, null);
  accountant = await account(tenantA, 'ACCOUNTANT');
  forbiddenRoles = [await account(tenantA, 'PARENT'), await account(tenantA, 'STUDENT')];
  a = await graph(admin.browser, teacher.userId);
  b = await graph(other.browser);
}, 120000);
afterAll(async () => {
  try {
    await app?.close();
  } finally {
    await db.$disconnect();
  }
});

describe('LOT 6 academic workflows over authenticated HTTP', () => {
  it('creates DRAFT years and enforces a single ACTIVE year per tenant', async () => {
    expect(a.year.status).toBe('DRAFT');
    expect(
      (await admin.browser.send(`academic-years/${a.year.id}/activate`, {}, 'POST')).body.status,
    ).toBe('ACTIVE');
    const second = await create(admin.browser, 'academic-years', { ...yearInput, code: 'SECOND' });
    const conflict = await admin.browser.send<{ code: string; requestId: string }>(
      `academic-years/${second.id}/activate`,
      {},
      'POST',
    );
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('ACADEMIC_ACTIVE_YEAR_EXISTS');
    expect(conflict.body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      (await other.browser.send(`academic-years/${b.year.id}/activate`, {}, 'POST')).status,
    ).toBe(200);
    await expect(
      db.academicYear.create({
        data: {
          tenantId: tenantA,
          code: 'DIRECT-ACTIVE',
          name: 'Invalid',
          startsOn: new Date(yearInput.startsOn),
          endsOn: new Date(yearInput.endsOn),
          status: 'ACTIVE',
        },
      }),
    ).rejects.toThrow();
  });
  it('serializes concurrent activation attempts', async () => {
    const tenant = await db.tenant.create({
      data: { slug: `academic-race-${randomUUID()}`, name: 'Race' },
    });
    const actor = await account(tenant.id, 'SCHOOL_ADMIN');
    const first = await create(actor.browser, 'academic-years', { ...yearInput, code: 'ONE' });
    const second = await create(actor.browser, 'academic-years', { ...yearInput, code: 'TWO' });
    const replies = await Promise.all(
      [first, second].map((year) =>
        actor.browser.send(`academic-years/${year.id}/activate`, {}, 'POST'),
      ),
    );
    expect(replies.map((reply) => reply.status).toSorted()).toEqual([200, 409]);
    expect(await db.academicYear.count({ where: { tenantId: tenant.id, status: 'ACTIVE' } })).toBe(
      1,
    );
  });
  it('rejects invalid workflows and preserves merged date validation', async () => {
    expect(
      (await admin.browser.send(`academic-years/${a.year.id}/archive`, {}, 'POST')).status,
    ).toBe(409);
    expect(
      (await admin.browser.send(`academic-years/${a.year.id}`, { startsOn: '2028-01-01' }, 'PATCH'))
        .status,
    ).toBe(409);
    expect(
      (await admin.browser.send(`academic-years/${a.year.id}`, { startsOn: '2026-10-01' }, 'PATCH'))
        .status,
    ).toBe(409);
    expect(
      (
        await admin.browser.send(
          `academic-years/${a.year.id}`,
          { name: 'Updated academic year' },
          'PATCH',
        )
      ).status,
    ).toBe(200);
  });
  it.each([
    { ...periodInput, ordinal: 2, startsOn: '2026-08-01' },
    { ...periodInput, name: 'Duplicate sequence' },
    { ...periodInput, ordinal: 2, startsOn: '2026-12-18', endsOn: '2027-01-31' },
    { ...periodInput, ordinal: 2, type: 'SEMESTER', startsOn: '2027-01-01', endsOn: '2027-06-30' },
  ])('rejects invalid periods %#', async (input) =>
    expect(
      (await admin.browser.send(`academic-years/${a.year.id}/periods`, input, 'POST')).status,
    ).toBe(409),
  );
  it('supports both period types in distinct years and updates periods', async () => {
    const year = await create(admin.browser, 'academic-years', { ...yearInput, code: 'SEMESTERS' });
    await create(admin.browser, `academic-years/${year.id}/periods`, {
      ...periodInput,
      type: 'SEMESTER',
      endsOn: '2027-01-31',
    });
    await create(admin.browser, `academic-years/${year.id}/periods`, {
      ...periodInput,
      name: 'Semester 2',
      type: 'SEMESTER',
      ordinal: 2,
      startsOn: '2027-02-01',
      endsOn: '2027-06-30',
    });
    expect(
      (
        await admin.browser.send<PageResult<AcademicView>>(
          `academic-years/${year.id}/periods?pageSize=1`,
        )
      ).body.total,
    ).toBe(2);
    expect(
      (
        await admin.browser.send(
          `academic-periods/${a.period.id}`,
          { name: 'Updated trimester' },
          'PATCH',
        )
      ).status,
    ).toBe(200);
  });
  it.each(['levels', 'classes', 'subjects'] as const)(
    'updates, archives and restores %s without physical deletes',
    async (kind) => {
      const row = kind === 'levels' ? a.level : kind === 'classes' ? a.classroom : a.subject;
      expect(
        (await admin.browser.send(`${kind}/${row.id}`, { name: `Updated ${kind}` }, 'PATCH'))
          .status,
      ).toBe(200);
      expect((await admin.browser.send(`${kind}/${row.id}/archive`, {}, 'POST')).body.status).toBe(
        'ARCHIVED',
      );
      expect(
        (await admin.browser.send(`${kind}/${row.id}`, { name: 'Illegal' }, 'PATCH')).status,
      ).toBe(409);
      expect(
        (await admin.browser.send<PageResult<AcademicView>>(kind)).body.items.map(
          (item) => item.id,
        ),
      ).not.toContain(row.id);
      expect(
        (
          await admin.browser.send<PageResult<AcademicView>>(`${kind}?status=ARCHIVED`)
        ).body.items.map((item) => item.id),
      ).toContain(row.id);
      expect((await admin.browser.send(`${kind}/${row.id}/restore`, {}, 'POST')).body.status).toBe(
        'ACTIVE',
      );
      expect((await admin.browser.send(`${kind}/${row.id}`, {}, 'DELETE')).status).toBe(404);
      expect((await admin.browser.send(`${kind}/${row.id}`)).status).toBe(200);
    },
  );
  it('rejects duplicate codes in one tenant/year and permits the same references in another tenant', async () => {
    expect(a.classroom.code).toBe(b.classroom.code);
    expect(a.level.code).toBe(b.level.code);
    expect(a.subject.code).toBe(b.subject.code);
    for (const [path, input] of [
      ['academic-years', yearInput],
      ['levels', { code: '6E', name: 'Duplicate' }],
      ['subjects', { code: 'MATH', name: 'Duplicate' }],
      [
        'classes',
        { academicYearId: a.year.id, levelId: a.level.id, code: '6E-A', name: 'Duplicate' },
      ],
    ] as const)
      expect((await admin.browser.send(path, input, 'POST')).status).toBe(409);
  });
  it.each(['academic-years', 'levels', 'classes', 'subjects'] as const)(
    'rejects cross-tenant detail and mutations for %s',
    async (kind) => {
      const row =
        kind === 'academic-years'
          ? a.year
          : kind === 'levels'
            ? a.level
            : kind === 'classes'
              ? a.classroom
              : a.subject;
      expect((await other.browser.send(`${kind}/${row.id}`)).status).toBe(404);
      expect(
        (await other.browser.send(`${kind}/${row.id}`, { name: 'Cross tenant' }, 'PATCH')).status,
      ).toBe(404);
      for (const action of kind === 'academic-years'
        ? ['activate', 'close', 'archive']
        : ['archive', 'restore'])
        expect((await other.browser.send(`${kind}/${row.id}/${action}`, {}, 'POST')).status).toBe(
          404,
        );
    },
  );
  it('rejects every cross-tenant academic relationship even with known UUIDs', async () => {
    for (const input of [
      { academicYearId: b.year.id, levelId: a.level.id, code: 'CROSS-Y', name: 'Cross year' },
      { academicYearId: a.year.id, levelId: b.level.id, code: 'CROSS-L', name: 'Cross level' },
    ])
      expect((await admin.browser.send('classes', input, 'POST')).status).toBe(404);
    expect(
      (await admin.browser.send(`classes/${a.classroom.id}`, { levelId: b.level.id }, 'PATCH'))
        .status,
    ).toBe(404);
    expect(
      (
        await admin.browser.send(
          `classes/${a.classroom.id}/subjects`,
          { subjectId: b.subject.id, coefficient: 1 },
          'POST',
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await admin.browser.send(
          `classes/${b.classroom.id}/subjects`,
          { subjectId: a.subject.id, coefficient: 1 },
          'POST',
        )
      ).status,
    ).toBe(404);
    expect((await other.browser.send(`classes/${a.classroom.id}/subjects`)).status).toBe(404);
    expect((await other.browser.send(`academic-years/${a.year.id}/periods`)).status).toBe(404);
    expect(
      (await other.browser.send(`academic-years/${a.year.id}/periods`, periodInput, 'POST')).status,
    ).toBe(404);
    expect(
      (await other.browser.send(`academic-periods/${a.period.id}`, { name: 'Leak' }, 'PATCH'))
        .status,
    ).toBe(404);
    expect(
      (await other.browser.send(`academic-periods/${a.period.id}/archive`, {}, 'POST')).status,
    ).toBe(404);
    const input = {
      classSubjectId: a.link.id,
      academicPeriodId: a.period.id,
      teacherId: a.teacher.id,
    };
    for (const item of [
      { ...input, teacherId: b.teacher.id },
      { ...input, classSubjectId: b.link.id },
      { ...input, academicPeriodId: b.period.id },
    ])
      expect((await admin.browser.send('teaching-assignments', item, 'POST')).status).toBe(404);
    expect(
      (
        await other.browser.send(
          `teaching-assignments/${a.assignment.id}`,
          { teacherId: b.teacher.id },
          'PATCH',
        )
      ).status,
    ).toBe(404);
    expect(
      (await other.browser.send(`teaching-assignments/${a.assignment.id}/archive`, {}, 'POST'))
        .status,
    ).toBe(404);
  });
  it('rejects cross-year assignments and archived teachers', async () => {
    const year = await create(admin.browser, 'academic-years', {
      ...yearInput,
      code: 'OTHER-YEAR',
    });
    const period = await create(admin.browser, `academic-years/${year.id}/periods`, periodInput);
    const input = {
      classSubjectId: a.link.id,
      academicPeriodId: period.id,
      teacherId: a.teacher.id,
    };
    expect((await admin.browser.send('teaching-assignments', input, 'POST')).status).toBe(409);
    await expect(
      db.teachingAssignment.create({ data: { tenantId: tenantA, ...input } }),
    ).rejects.toThrow();
    expect((await admin.browser.send(`teachers/${a.teacher.id}/archive`, {}, 'POST')).status).toBe(
      200,
    );
    expect(
      (
        await admin.browser.send(
          'teaching-assignments',
          { ...input, academicPeriodId: a.period.id },
          'POST',
        )
      ).status,
    ).toBe(409);
    expect((await admin.browser.send(`teachers/${a.teacher.id}/restore`, {}, 'POST')).status).toBe(
      200,
    );
  });
  it.each(['academic-years', 'levels', 'classes', 'subjects', 'teaching-assignments'] as const)(
    'paginates/searches %s in SQL without tenant leaks',
    async (kind) => {
      const page = await admin.browser.send<PageResult<AcademicView>>(
        `${kind}?pageSize=1&status=ALL&sort=-createdAt`,
      );
      expect(page.status).toBe(200);
      expect(page.body.items).toHaveLength(1);
      expect(page.body.pageSize).toBe(1);
      const otherRows = (await other.browser.send<PageResult<AcademicView>>(`${kind}?status=ALL`))
        .body.items;
      expect(otherRows.map((row) => row.id)).not.toContain(page.body.items[0]?.id);
      expect(
        (
          await admin.browser.send<PageResult<AcademicView>>(
            `${kind}?search=NONEXISTENT-${randomUUID()}`,
          )
        ).body.total,
      ).toBe(0);
      expect(page.body.items[0]).not.toHaveProperty('tenantId');
      expect(page.body.items[0]).not.toHaveProperty('passwordHash');
    },
  );
  it('applies academic-year/level/class/teacher/subject filters before totals', async () => {
    expect(
      (
        await admin.browser.send<PageResult<AcademicView>>(
          `classes?academicYearId=${a.year.id}&levelId=${a.level.id}`,
        )
      ).body.total,
    ).toBe(1);
    expect(
      (await admin.browser.send<PageResult<AcademicView>>(`classes?academicYearId=${b.year.id}`))
        .body.total,
    ).toBe(0);
    expect(
      (await admin.browser.send<PageResult<AcademicView>>(`subjects?classId=${b.classroom.id}`))
        .body.total,
    ).toBe(0);
    expect(
      (
        await admin.browser.send<PageResult<AcademicView>>(
          `teaching-assignments?academicYearId=${a.year.id}&classId=${a.classroom.id}&subjectId=${a.subject.id}&teacherId=${a.teacher.id}&levelId=${a.level.id}`,
        )
      ).body.total,
    ).toBe(1);
  });
  it('enforces positive exact coefficients and protects historical links', async () => {
    expect(a.link.coefficient).toBe('4.25');
    for (const coefficient of [0, -1, 1000, '0', '1.001'])
      expect(
        (
          await admin.browser.send(
            `classes/${a.classroom.id}/subjects/${a.subject.id}`,
            { coefficient },
            'PATCH',
          )
        ).status,
      ).toBe(400);
    expect(
      (
        await admin.browser.send(
          `classes/${a.classroom.id}/subjects/${a.subject.id}`,
          { coefficient: '2.75' },
          'PATCH',
        )
      ).body.coefficient,
    ).toBe('2.75');
    expect(
      (
        await admin.browser.send(
          `classes/${a.classroom.id}/subjects`,
          { subjectId: a.subject.id },
          'POST',
        )
      ).status,
    ).toBe(409);
    expect(
      (await admin.browser.send(`classes/${a.classroom.id}/subjects/${a.subject.id}`, {}, 'DELETE'))
        .status,
    ).toBe(409);
    const free = await create(admin.browser, 'subjects', {
      code: 'FREE',
      name: 'Unreferenced subject',
    });
    await create(admin.browser, `classes/${a.classroom.id}/subjects`, { subjectId: free.id });
    expect(
      (await admin.browser.send(`classes/${a.classroom.id}/subjects/${free.id}`, {}, 'DELETE'))
        .status,
    ).toBe(200);
    expect(await db.subject.findUnique({ where: { id: free.id } })).not.toBeNull();
  });
  it('limits teachers to their real assignments and never lets them self-assign', async () => {
    for (const path of [
      'classes',
      'subjects',
      'academic-years',
      'levels',
      'teaching-assignments',
      'me/teaching-assignments',
    ]) {
      expect((await teacher.browser.send<PageResult<AcademicView>>(path)).body.total).toBe(1);
      expect((await teacherOther.browser.send<PageResult<AcademicView>>(path)).body.total).toBe(0);
    }
    expect((await teacher.browser.send(`classes/${b.classroom.id}`)).status).toBe(404);
    expect(
      (await teacher.browser.send<PageResult<AcademicView>>(`classes/${a.classroom.id}/subjects`))
        .body.items[0]?.id,
    ).toBe(a.link.id);
    expect(
      (
        await teacher.browser.send(
          'classes',
          {
            academicYearId: a.year.id,
            levelId: a.level.id,
            code: 'ILLEGAL',
            name: 'Self assigned',
          },
          'POST',
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await teacher.browser.send(
          'teaching-assignments',
          { classSubjectId: a.link.id, teacherId: a.teacher.id, academicPeriodId: a.period.id },
          'POST',
        )
      ).status,
    ).toBe(403);
    expect(
      (await teacher.browser.send(`teaching-assignments/${a.assignment.id}/archive`, {}, 'POST'))
        .status,
    ).toBe(403);
    expect(
      (
        await teacher.browser.send<PageResult<AcademicView>>(
          `me/teaching-assignments?teacherId=${b.teacher.id}`,
        )
      ).body.total,
    ).toBe(0);
  });
  it('does not reveal an unassigned class through a shared subject filter or a period parent', async () => {
    const year = await create(admin.browser, 'academic-years', {
      ...yearInput,
      code: 'PRIVATE-YEAR',
    });
    const classroom = await create(admin.browser, 'classes', {
      academicYearId: year.id,
      levelId: a.level.id,
      code: 'PRIVATE-CLASS',
      name: 'Unassigned class',
    });
    await create(admin.browser, `classes/${classroom.id}/subjects`, { subjectId: a.subject.id });
    for (const filter of [`classId=${classroom.id}`, `academicYearId=${year.id}`]) {
      expect(
        (await teacher.browser.send<PageResult<AcademicView>>(`subjects?${filter}`)).body.total,
      ).toBe(0);
      expect(
        (await admin.browser.send<PageResult<AcademicView>>(`subjects?${filter}`)).body.total,
      ).toBe(1);
    }
    expect((await teacher.browser.send(`academic-years/${year.id}/periods`)).status).toBe(404);
    expect((await teacher.browser.send(`classes/${classroom.id}/subjects`)).status).toBe(404);
  });
  it('grants academic administration to director/staff without person-administration privileges', async () => {
    for (const actor of [director, staff]) {
      const row = await create(actor.browser, 'levels', {
        code: randomUUID().slice(0, 8),
        name: 'Managed by academic role',
      });
      expect((await actor.browser.send(`levels/${row.id}/archive`, {}, 'POST')).status).toBe(200);
      expect((await actor.browser.send('teachers')).status).toBe(200);
    }
    expect(
      (await staff.browser.send('teachers', { firstName: 'No', lastName: 'Grant' }, 'POST')).status,
    ).toBe(403);
  });
  it.each([
    'academic-years',
    'levels',
    'classes',
    'subjects',
    'teaching-assignments',
    'me/teaching-assignments',
  ])('denies unauthenticated and unprivileged readers of %s', async (path) => {
    expect((await new Browser().send(path)).status).toBe(401);
    for (const actor of [denied, ...forbiddenRoles])
      expect((await actor.browser.send(path)).status).toBe(403);
    expect((await accountant.browser.send(path)).status).toBe(
      ['academic-years', 'levels', 'classes'].includes(path) ? 200 : 403,
    );
  });
  it('keeps accountant academic mutations denied after LOT 8 lookup grants', async () => {
    for (const path of ['academic-years', 'levels', 'classes', 'subjects', 'teaching-assignments'])
      expect((await accountant.browser.send(path, {}, 'POST')).status).toBe(403);
  });
  it.each([
    'tenantId=arbitrary',
    'page=0',
    'page=1.5',
    'pageSize=101',
    'sort=sql',
    'academicYearId=invalid',
    'status=DELETED',
    'search=' + 'x'.repeat(101),
  ])('rejects invalid/unknown query %s', async (query) =>
    expect((await admin.browser.send(`classes?${query}`)).status).toBe(400),
  );
  it('rejects forged tenant context, unknown fields and empty patches', async () => {
    expect(
      (await admin.browser.send('academic-years', { ...yearInput, tenantId: tenantB }, 'POST'))
        .status,
    ).toBe(400);
    expect(
      (await admin.browser.send('academic-years', { ...yearInput, status: 'ACTIVE' }, 'POST'))
        .status,
    ).toBe(400);
    expect(
      (await admin.browser.send('classes', undefined, 'GET', { 'X-Tenant-ID': tenantB })).status,
    ).toBe(403);
    expect((await admin.browser.send(`classes/${a.classroom.id}`, {}, 'PATCH')).status).toBe(400);
    expect(
      (
        await admin.browser.send(
          `classes/${a.classroom.id}`,
          { academicYearId: b.year.id },
          'PATCH',
        )
      ).status,
    ).toBe(400);
    expect((await admin.browser.send(`levels/not-a-uuid`)).status).toBe(400);
  });
  it('updates/archives assignments and revokes the corresponding LOT 5 student scope', async () => {
    const child = await admin.browser.send<PersonView>(
      'students',
      { firstName: 'Academic', lastName: 'Scope fixture' },
      'POST',
    );
    // Existing foundation table used only as a test fixture: no enrollment module or API.
    await db.enrollment.create({
      data: {
        tenantId: tenantA,
        studentId: child.body.id,
        schoolClassId: a.classroom.id,
        academicYearId: a.year.id,
        enrolledOn: new Date('2026-09-01'),
      },
    });
    expect((await teacher.browser.send<PageResult<PersonView>>('students')).body.total).toBe(1);
    expect(
      (
        await admin.browser.send(
          `teaching-assignments/${a.assignment.id}`,
          { teacherId: a.teacher.id },
          'PATCH',
        )
      ).status,
    ).toBe(200);
    expect(
      (await admin.browser.send(`academic-periods/${a.period.id}/archive`, {}, 'POST')).status,
    ).toBe(200);
    expect(
      (await teacher.browser.send<PageResult<AcademicView>>('me/teaching-assignments')).body.total,
    ).toBe(0);
    expect((await teacher.browser.send<PageResult<PersonView>>('students')).body.total).toBe(0);
    expect(
      (await admin.browser.send(`teaching-assignments/${a.assignment.id}/archive`, {}, 'POST')).body
        .status,
    ).toBe('ARCHIVED');
    expect(
      await db.teachingAssignment.findUnique({ where: { id: a.assignment.id } }),
    ).not.toBeNull();
    expect(
      (await admin.browser.send(`classes/${a.classroom.id}/subjects/${a.subject.id}`, {}, 'DELETE'))
        .status,
    ).toBe(409);
  });
  it('closes/archives years irreversibly and blocks every normal child mutation', async () => {
    expect(
      (await admin.browser.send(`academic-years/${a.year.id}/close`, {}, 'POST')).body.status,
    ).toBe('CLOSED');
    for (const [path, method, input] of [
      [`academic-years/${a.year.id}`, 'PATCH', { name: 'Closed change' }],
      [`academic-years/${a.year.id}/periods`, 'POST', { ...periodInput, ordinal: 2 }],
      [`academic-periods/${a.period.id}`, 'PATCH', { name: 'Closed period' }],
      [`academic-periods/${a.period.id}/archive`, 'POST', {}],
      [
        'classes',
        'POST',
        { academicYearId: a.year.id, levelId: a.level.id, code: 'CLOSED', name: 'Closed class' },
      ],
      [`classes/${a.classroom.id}`, 'PATCH', { name: 'Closed class' }],
      [`classes/${a.classroom.id}/archive`, 'POST', {}],
      [`classes/${a.classroom.id}/restore`, 'POST', {}],
      [`classes/${a.classroom.id}/subjects`, 'POST', { subjectId: a.subject.id }],
      [`classes/${a.classroom.id}/subjects/${a.subject.id}`, 'PATCH', { coefficient: 3 }],
      [`classes/${a.classroom.id}/subjects/${a.subject.id}`, 'DELETE', {}],
      [
        'teaching-assignments',
        'POST',
        { classSubjectId: a.link.id, teacherId: a.teacher.id, academicPeriodId: a.period.id },
      ],
      [`teaching-assignments/${a.assignment.id}`, 'PATCH', { teacherId: a.teacher.id }],
      [`teaching-assignments/${a.assignment.id}/archive`, 'POST', {}],
    ] as const)
      expect((await admin.browser.send(path, input, method)).status, path).toBe(409);
    expect(
      (await admin.browser.send(`academic-years/${a.year.id}/archive`, {}, 'POST')).body.status,
    ).toBe('ARCHIVED');
    expect(
      (await admin.browser.send(`academic-years/${a.year.id}/activate`, {}, 'POST')).status,
    ).toBe(409);
    expect((await other.browser.send(`academic-years/${b.year.id}`)).body.status).toBe('ACTIVE');
  });
  it('records all requested audit actions atomically and emits no internal errors', async () => {
    const logs = await db.auditLog.findMany({ where: { tenantId: tenantA } });
    const actions = new Set(logs.map((row) => row.action));
    for (const action of [
      'academic_year.created',
      'academic_year.updated',
      'academic_year.activated',
      'academic_year.closed',
      'academic_year.archived',
      'academic_period.created',
      'academic_period.updated',
      'academic_period.archived',
      'level.created',
      'level.updated',
      'level.archived',
      'level.restored',
      'class.created',
      'class.updated',
      'class.archived',
      'class.restored',
      'subject.created',
      'subject.updated',
      'subject.archived',
      'subject.restored',
      'class_subject.created',
      'class_subject.updated',
      'class_subject.removed',
      'teaching_assignment.created',
      'teaching_assignment.updated',
      'teaching_assignment.archived',
    ])
      expect(actions.has(action), action).toBe(true);
    const updated = logs.find((row) => row.action === 'class.updated');
    expect(updated?.actorMembershipId).toBe(admin.membershipId);
    expect(updated?.metadata).toMatchObject({
      userId: admin.userId,
      membershipId: admin.membershipId,
      resourceId: a.classroom.id,
      before: { name: 'Sixième A' },
      after: { name: 'Updated classes' },
    });
    expect(updated?.metadata).toHaveProperty('requestId');
    expect(errors).toEqual([]);
  });
});
