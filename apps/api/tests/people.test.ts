import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { createPrismaClient } from '@gestschool/database';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import {
  privilegedRoles,
  type GuardianLinkView,
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
let tenantA: string;
let tenantB: string;
class Browser {
  cookies = new Map<string, string>();
  csrf = '';
  access = '';
  async send<T = PersonView>(
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
      ...(method !== 'GET' && method !== 'OPTIONS' ? { body: JSON.stringify(body ?? {}) } : {}),
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
      displayName: 'LOT 5 HTTP fixture',
      identity: { create: { passwordHash: hash, activatedAt: new Date() } },
    },
  });
  const membership = await db.membership.create({ data: { userId: user.id, tenantId } });
  if (role) {
    const roleRecord = await db.role.findFirstOrThrow({ where: { code: role, tenantId: null } });
    await db.membershipRole.create({
      data: { membershipId: membership.id, tenantId, roleId: roleRecord.id },
    });
  }
  const secret = role && privilegedRoles.includes(role) ? iam.crypto.newTotp().secret : null;
  if (secret)
    await db.authIdentity.update({
      where: { userId: user.id },
      data: { mfaSecret: iam.crypto.encrypt(secret, user.id), mfaEnabledAt: new Date() },
    });
  const browser = await new Browser().init();
  let result = await browser.send<LoginResult>('auth/login', { email, password }, 'POST');
  expect(result.status).toBe(201);
  if (secret) {
    expect(result.body.kind).toBe('mfa');
    if (result.body.kind !== 'mfa') throw new Error('MFA challenge missing');
    result = await browser.send<LoginResult>(
      'auth/mfa/verify',
      { challenge: result.body.challenge, code: iam.crypto.totp(secret).generate() },
      'POST',
    );
  }
  if (result.body.kind !== 'session') throw new Error('Session missing');
  browser.access = result.body.accessToken;
  return { browser, userId: user.id, membershipId: membership.id };
}
type Account = Awaited<ReturnType<typeof account>>;
let admin: Account;
let other: Account;
let parent: Account;
let student: Account;
let teacher: Account;
let denied: Account;
let academic: Account;
const records = new Map<string, PersonView>();
function record(kind: string): PersonView {
  const value = records.get(kind);
  if (!value) throw new Error(`Missing fixture: ${kind}`);
  return value;
}
let child: PersonView;
let guardian: PersonView;
let teacherProfile: PersonView;
beforeAll(async () => {
  process.env['IAM_REDIS_PREFIX'] = `gestschool:people:test:${randomUUID()}`;
  app = await NestFactory.create(AppModule, {
    logger: {
      log() {},
      warn() {},
      error(message: unknown) {
        errors.push(String(message));
      },
    },
  });
  configureIamHttp(app);
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  iam = app.get(IamRuntime);
  hash = await iam.passwords.hash(password);
  tenantA = (
    await db.tenant.create({ data: { slug: `people-a-${randomUUID()}`, name: 'People A' } })
  ).id;
  tenantB = (
    await db.tenant.create({ data: { slug: `people-b-${randomUUID()}`, name: 'People B' } })
  ).id;
  admin = await account(tenantA, 'SCHOOL_ADMIN');
  other = await account(tenantB, 'SCHOOL_ADMIN');
  parent = await account(tenantA, 'PARENT');
  student = await account(tenantA, 'STUDENT');
  teacher = await account(tenantA, 'TEACHER');
  denied = await account(tenantA, null);
  academic = await account(tenantA, 'ACADEMIC_STAFF');
  child = (await admin.browser.send('students', { firstName: 'Scope', lastName: 'Child' }, 'POST'))
    .body;
  guardian = (
    await admin.browser.send('guardians', { firstName: 'Scope', lastName: 'Parent' }, 'POST')
  ).body;
  teacherProfile = (
    await admin.browser.send('teachers', { firstName: 'Scope', lastName: 'Teacher' }, 'POST')
  ).body;
  await db.student.update({ where: { id: child.id }, data: { userId: student.userId } });
  await db.guardian.update({ where: { id: guardian.id }, data: { userId: parent.userId } });
  await db.teacher.update({ where: { id: teacherProfile.id }, data: { userId: teacher.userId } });
  expect(
    (
      await admin.browser.send(
        `students/${child.id}/guardians`,
        {
          guardianId: guardian.id,
          relationship: 'parent',
          isPrimary: true,
          isFinancialContact: true,
          receivesNotifications: false,
        },
        'POST',
      )
    ).status,
  ).toBe(201);
}, 60000);
afterAll(async () => {
  try {
    await app?.close();
  } finally {
    await db.$disconnect();
  }
});

describe.each([
  ['students', 'matricule', 'student'],
  ['guardians', 'guardianReference', 'guardian'],
  ['teachers', 'employeeNumber', 'teacher'],
] as const)('%s tenant CRUD', (kind, reference, entity) => {
  it('creates without User and generates a tenant-local reference', async () => {
    const reply = await admin.browser.send(
      kind,
      { firstName: 'Directory', lastName: kind },
      'POST',
    );
    expect(reply.status).toBe(201);
    expect(reply.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(reply.body[reference]).toMatch(/^[A-Z]{3}-\d{4}-\d{6}$/);
    expect(reply.body).not.toHaveProperty('userId');
    expect(reply.body).not.toHaveProperty('tenantId');
    records.set(kind, reply.body);
    const row = await db.$queryRaw<
      { user_id: string | null }[]
    >`SELECT user_id FROM students WHERE id = ${reply.body.id}::uuid UNION ALL SELECT user_id FROM guardians WHERE id = ${reply.body.id}::uuid UNION ALL SELECT user_id FROM teachers WHERE id = ${reply.body.id}::uuid`;
    expect(row[0]?.user_id).toBeNull();
  });
  it('rejects duplicate references within a tenant and permits them in another tenant', async () => {
    const input = {
      firstName: 'Duplicate',
      lastName: kind,
      [reference]: record(kind)[reference],
    };
    const conflict = await admin.browser.send<{ code: string; requestId: string }>(
      kind,
      input,
      'POST',
    );
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('PERSON_REFERENCE_CONFLICT');
    expect(conflict.body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect((await other.browser.send(kind, input, 'POST')).status).toBe(201);
  });
  it('scopes detail, update, archive and restore to the authenticated tenant', async () => {
    const id = record(kind).id;
    for (const [suffix, method, body] of [
      ['', 'GET', undefined],
      ['', 'PATCH', { firstName: 'Leaked' }],
      ['/archive', 'POST', {}],
      ['/restore', 'POST', {}],
    ] as const) {
      expect((await other.browser.send(`${kind}/${id}${suffix}`, body, method)).status).toBe(404);
    }
    expect((await admin.browser.send(`${kind}/${id}`)).body.firstName).toBe('Directory');
  });
  it('updates with transactional before/after audit', async () => {
    const id = record(kind).id;
    const reply = await admin.browser.send(`${kind}/${id}`, { firstName: 'Updated' }, 'PATCH');
    expect(reply.status).toBe(200);
    expect(reply.body.firstName).toBe('Updated');
    const audit = await db.auditLog.findFirstOrThrow({
      where: { tenantId: tenantA, entityId: id, action: `${entity}.updated` },
    });
    expect(audit.actorMembershipId).toBe(admin.membershipId);
    expect(audit.metadata).toMatchObject({
      userId: admin.userId,
      membershipId: admin.membershipId,
      resourceId: id,
      before: { firstName: 'Directory' },
      after: { firstName: 'Updated' },
    });
    expect(JSON.stringify(audit.metadata)).not.toContain(password);
  });
  it('archives without deleting, hides from defaults, rejects edits, then restores', async () => {
    const id = record(kind).id;
    const archived = await admin.browser.send(`${kind}/${id}/archive`, {}, 'POST');
    expect(archived.status).toBe(200);
    expect(archived.body.status).toBe('ARCHIVED');
    expect(archived.body.archivedAt).not.toBeNull();
    const active = await admin.browser.send<PageResult<PersonView>>(`${kind}?search=${kind}`);
    expect(active.body.items.some((item) => item.id === id)).toBe(false);
    const archivedList = await admin.browser.send<PageResult<PersonView>>(
      `${kind}?status=ARCHIVED&search=${kind}`,
    );
    expect(archivedList.body.items.some((item) => item.id === id)).toBe(true);
    expect((await admin.browser.send(`${kind}/${id}`, { firstName: 'No' }, 'PATCH')).status).toBe(
      409,
    );
    expect((await admin.browser.send(`${kind}/${id}`)).status).toBe(200);
    const restored = await admin.browser.send(`${kind}/${id}/restore`, {}, 'POST');
    expect(restored.body.status).toBe('ACTIVE');
    expect(restored.body.archivedAt).toBeNull();
    expect(
      await db.auditLog.count({
        where: {
          tenantId: tenantA,
          entityId: id,
          action: { in: [`${entity}.archived`, `${entity}.restored`] },
        },
      }),
    ).toBe(2);
  });
  it('does not expose physical deletion endpoints', async () => {
    expect([403, 404]).toContain(
      (await admin.browser.send(`${kind}/${record(kind).id}`, {}, 'DELETE')).status,
    );
    expect((await admin.browser.send(`${kind}/${record(kind).id}`)).status).toBe(200);
  });
  it('paginates and searches in SQL with stable order and tenant-safe totals', async () => {
    const first = await admin.browser.send<PageResult<PersonView>>(
      `${kind}?pageSize=1&sort=reference`,
    );
    const second = await admin.browser.send<PageResult<PersonView>>(
      `${kind}?pageSize=1&page=2&sort=reference`,
    );
    expect(first.body.items).toHaveLength(1);
    expect(second.body.items).toHaveLength(1);
    expect(first.body.items[0]?.id).not.toBe(second.body.items[0]?.id);
    const leak = await other.browser.send<PageResult<PersonView>>(
      `${kind}?search=Updated&status=ALL`,
    );
    expect(leak.body.total).toBe(0);
    expect(leak.body.items).toEqual([]);
  });
  it('denies unauthenticated and unprivileged writes', async () => {
    expect((await (await new Browser().init()).send(kind)).status).toBe(401);
    expect((await denied.browser.send(kind)).status).toBe(403);
    for (const browser of [student.browser, parent.browser, teacher.browser]) {
      expect(
        (await browser.send(kind, { firstName: 'No', lastName: 'Permission' }, 'POST')).status,
      ).toBe(403);
      expect(
        (await browser.send(`${kind}/${record(kind).id}`, { firstName: 'No' }, 'PATCH')).status,
      ).toBe(403);
      expect((await browser.send(`${kind}/${record(kind).id}/archive`, {}, 'POST')).status).toBe(
        403,
      );
    }
  });
});

describe('relationships, validation and scopes', () => {
  it('enforces OWN on actual student and teacher lists and detail', async () => {
    expect(
      (await student.browser.send<PageResult<PersonView>>('students')).body.items.map(
        (item) => item.id,
      ),
    ).toEqual([child.id]);
    expect((await student.browser.send(`students/${record('students').id}`)).status).toBe(404);
    expect(
      (await teacher.browser.send<PageResult<PersonView>>('teachers')).body.items.map(
        (item) => item.id,
      ),
    ).toEqual([teacherProfile.id]);
    expect((await teacher.browser.send(`teachers/${record('teachers').id}`)).status).toBe(404);
  });
  it('enforces CHILDREN and guardian OWN from stored associations', async () => {
    expect(
      (await parent.browser.send<PageResult<PersonView>>('students')).body.items.map(
        (item) => item.id,
      ),
    ).toEqual([child.id]);
    expect((await parent.browser.send(`students/${record('students').id}`)).status).toBe(404);
    const links = await parent.browser.send<PageResult<GuardianLinkView>>(
      `guardians/${guardian.id}/students`,
    );
    expect(links.body.total).toBe(1);
    expect(links.body.items[0]?.person.id).toBe(child.id);
    expect((await parent.browser.send(`guardians/${record('guardians').id}/students`)).status).toBe(
      404,
    );
  });
  it('does not expose co-guardian contacts outside the reader scope', async () => {
    const otherGuardian = records.get('guardians');
    expect(
      (
        await admin.browser.send(
          `students/${child.id}/guardians`,
          { guardianId: otherGuardian?.id, relationship: 'other' },
          'POST',
        )
      ).status,
    ).toBe(201);
    const links = await parent.browser.send<PageResult<GuardianLinkView>>(
      `students/${child.id}/guardians`,
    );
    expect(links.body.items.map((link) => link.guardianId)).toEqual([guardian.id]);
  });
  it('denies cross-tenant association even with known valid UUIDs', async () => {
    const foreign = (
      await other.browser.send('guardians', { firstName: 'Foreign', lastName: 'Parent' }, 'POST')
    ).body;
    expect(
      (
        await admin.browser.send(
          `students/${child.id}/guardians`,
          { guardianId: foreign.id, relationship: 'parent' },
          'POST',
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await other.browser.send(
          `students/${child.id}/guardians/${guardian.id}`,
          { relationship: 'changed' },
          'PATCH',
        )
      ).status,
    ).toBe(404);
    expect(
      (await other.browser.send(`students/${child.id}/guardians/${guardian.id}`, {}, 'DELETE'))
        .status,
    ).toBe(404);
  });
  it('updates all relationship flags then deletes only the link and audits all transitions', async () => {
    const path = `students/${child.id}/guardians/${guardian.id}`;
    expect((await admin.browser.send(path, { relationship: 'guardian' }, 'PATCH')).status).toBe(
      200,
    );
    expect(
      await db.studentGuardian.findFirst({
        where: { studentId: child.id, guardianId: guardian.id },
      }),
    ).toMatchObject({ isPrimary: true, isFinancialContact: true, receivesNotifications: false });
    expect(
      (
        await admin.browser.send(
          path,
          {
            relationship: 'legal guardian',
            isPrimary: false,
            isFinancialContact: false,
            receivesNotifications: true,
          },
          'PATCH',
        )
      ).status,
    ).toBe(200);
    expect(
      await db.studentGuardian.findFirst({
        where: { studentId: child.id, guardianId: guardian.id },
      }),
    ).toMatchObject({
      relationship: 'legal guardian',
      isPrimary: false,
      isFinancialContact: false,
      receivesNotifications: true,
    });
    expect((await admin.browser.send(path, {}, 'DELETE')).status).toBe(200);
    expect((await admin.browser.send(`guardians/${guardian.id}`)).status).toBe(200);
    expect((await parent.browser.send<PageResult<PersonView>>('students')).body.total).toBe(0);
    expect(
      await db.auditLog.count({
        where: {
          tenantId: tenantA,
          entityId: child.id,
          action: { in: ['student.guardian.updated', 'student.guardian.unlinked'] },
        },
      }),
    ).toBe(3);
  });
  it('does not broaden academic staff administration privileges', async () => {
    expect(
      (
        await academic.browser.send(
          'students',
          { firstName: 'Academic', lastName: 'Allowed' },
          'POST',
        )
      ).status,
    ).toBe(201);
    for (const kind of ['teachers', 'guardians'])
      expect(
        (await academic.browser.send(kind, { firstName: 'No', lastName: 'Permission' }, 'POST'))
          .status,
      ).toBe(403);
    expect((await academic.browser.send(`students/${child.id}/archive`, {}, 'POST')).status).toBe(
      403,
    );
  });
  it('denies ASSIGNED without stored teaching assignments', async () => {
    expect((await teacher.browser.send<PageResult<PersonView>>('students')).body.total).toBe(0);
    expect((await teacher.browser.send(`students/${child.id}`)).status).toBe(404);
  });
  it('enforces ASSIGNED from existing tenant-scoped academic fixtures', async () => {
    // Test-only graph for the existing LOT 3 model; no academic API is introduced.
    const year = await db.academicYear.create({
      data: {
        tenantId: tenantA,
        code: 'SCOPE-YEAR',
        name: 'Scope year',
        startsOn: new Date('2026-09-01'),
        endsOn: new Date('2027-06-30'),
      },
    });
    const period = await db.academicPeriod.create({
      data: {
        tenantId: tenantA,
        academicYearId: year.id,
        name: 'Scope period',
        type: 'TRIMESTER',
        ordinal: 1,
        startsOn: new Date('2026-09-01'),
        endsOn: new Date('2026-12-31'),
      },
    });
    const level = await db.level.create({
      data: { tenantId: tenantA, code: 'SCOPE', name: 'Scope level', position: 1 },
    });
    const classroom = await db.schoolClass.create({
      data: {
        tenantId: tenantA,
        academicYearId: year.id,
        levelId: level.id,
        code: 'SCOPE',
        name: 'Scope class',
      },
    });
    const subject = await db.subject.create({
      data: { tenantId: tenantA, code: 'SCOPE', name: 'Scope subject' },
    });
    const classSubject = await db.classSubject.create({
      data: { tenantId: tenantA, schoolClassId: classroom.id, subjectId: subject.id },
    });
    await db.teachingAssignment.create({
      data: {
        tenantId: tenantA,
        classSubjectId: classSubject.id,
        teacherId: teacherProfile.id,
        academicPeriodId: period.id,
      },
    });
    const enrollment = await db.enrollment.create({
      data: {
        tenantId: tenantA,
        studentId: child.id,
        schoolClassId: classroom.id,
        academicYearId: year.id,
        enrolledOn: new Date('2026-09-01'),
      },
    });
    expect(
      (await teacher.browser.send<PageResult<PersonView>>('students')).body.items.map(
        (person) => person.id,
      ),
    ).toEqual([child.id]);
    expect((await teacher.browser.send(`students/${child.id}`)).status).toBe(200);
    expect((await teacher.browser.send(`students/${record('students').id}`)).status).toBe(404);
    await db.enrollment.update({ where: { id: enrollment.id }, data: { status: 'WITHDRAWN' } });
    expect((await teacher.browser.send<PageResult<PersonView>>('students')).body.total).toBe(0);
  });
  it.each([
    'tenantId=x',
    'page=0',
    'page=-1',
    'page=1.5',
    'pageSize=101',
    'pageSize=0',
    'pageSize=1e2',
    'sort=raw_sql',
    'status=DELETED',
    'search=' + 'a'.repeat(101),
  ])('rejects invalid/unknown query %s', async (query) => {
    expect((await admin.browser.send(`students?${query}`)).status).toBe(400);
  });
  it.each([
    { tenantId: randomUUID() },
    { userId: randomUUID() },
    { firstName: '' },
    { firstName: 'a'.repeat(101) },
    { birthDate: '2026-02-30' },
    { birthDate: '2999-01-01' },
    { birthDate: '2020-01-01T00:00:00Z' },
    { status: 'ARCHIVED' },
    { archivedAt: null },
    { matricule: 'bad reference' },
  ])('strictly validates student fields %j', async (input) => {
    expect(
      (
        await admin.browser.send(
          'students',
          { firstName: 'Test', lastName: 'Validation', ...input },
          'POST',
        )
      ).status,
    ).toBe(400);
  });
  it('validates UUID, partial updates, email, phone and relationship booleans', async () => {
    expect((await admin.browser.send('students/not-a-uuid')).status).toBe(400);
    expect((await admin.browser.send(`students/${child.id}`, {}, 'PATCH')).status).toBe(400);
    for (const input of [{ email: 'invalid' }, { phone: 'abcde' }, { phone: '123' }])
      expect(
        (
          await admin.browser.send(
            'guardians',
            { firstName: 'Test', lastName: 'Validation', ...input },
            'POST',
          )
        ).status,
      ).toBe(400);
    expect(
      (
        await admin.browser.send(
          `students/${child.id}/guardians`,
          { guardianId: guardian.id, relationship: 'parent', isPrimary: 'true' },
          'POST',
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.browser.send('students', { firstName: 'Header', lastName: 'Tenant' }, 'POST', {
          'X-Tenant-ID': tenantB,
        })
      ).status,
    ).toBe(403);
  });
  it('generates distinct sequential references under concurrent creation', async () => {
    const replies = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        admin.browser.send(
          'students',
          { firstName: 'Concurrent', lastName: String(index) },
          'POST',
        ),
      ),
    );
    expect(replies.every((reply) => reply.status === 201)).toBe(true);
    expect(new Set(replies.map((reply) => reply.body.matricule)).size).toBe(12);
  });
  it('has no cross-tenant links, orphan directory records, failed migrations or internal errors', async () => {
    const violations = await db.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*) FROM student_guardians sg LEFT JOIN students s ON s.id = sg.student_id AND s.tenant_id = sg.tenant_id LEFT JOIN guardians g ON g.id = sg.guardian_id AND g.tenant_id = sg.tenant_id WHERE s.id IS NULL OR g.id IS NULL`;
    expect(violations[0]?.count).toBe(0n);
    const migrations = await db.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL`;
    expect(migrations[0]?.count).toBe(0n);
    expect(errors).toEqual([]);
  });
});
