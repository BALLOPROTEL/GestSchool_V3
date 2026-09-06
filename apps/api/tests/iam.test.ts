import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Controller, Get, Module, Req } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { createPrismaClient } from '@gestschool/database';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import type { SystemRole } from '@gestschool/contracts';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { IamRuntime } from '../src/modules/iam/infrastructure/iam-runtime.js';
import { opaqueToken, tokenHash } from '../src/modules/iam/infrastructure/crypto.js';
import {
  configureIamHttp,
  RequirePermission,
  requestContext,
  type IamRequest,
  cookieOptions,
} from '../src/modules/iam/presentation/http/security.js';
import { ScopePolicy } from '../src/modules/iam/domain/scope-policy.js';

@Controller('iam-cert')
class ProbeController {
  @Get('unannotated') unannotated() {
    return { ok: true };
  }
  @Get('payments') @RequirePermission('payments.create') payments() {
    return { ok: true };
  }
  @Get('grades') @RequirePermission('grades.update', ['TENANT', 'PLATFORM', 'ASSIGNED']) grades() {
    return { ok: true };
  }
  @Get('cancel') @RequirePermission('payments.cancel') cancel() {
    return { ok: true };
  }
  @Get('scope')
  @RequirePermission('students.read', ['TENANT', 'PLATFORM', 'OWN', 'CHILDREN', 'ASSIGNED'])
  scope(@Req() request: IamRequest) {
    const context = requestContext(request);
    const policy = new ScopePolicy();
    return {
      own: policy.allows(context, 'students.read', {
        tenantId: context.tenantId,
        ownerUserId: context.userId,
        guardianUserIds: [context.userId],
        assignedUserIds: [context.userId],
      }),
      other: policy.allows(context, 'students.read', {
        tenantId: context.tenantId,
        ownerUserId: 'other',
        guardianUserIds: [],
        assignedUserIds: [],
      }),
      cross: policy.allows(context, 'students.read', {
        tenantId: randomUUID(),
        ownerUserId: context.userId,
        guardianUserIds: [context.userId],
        assignedUserIds: [context.userId],
      }),
    };
  }
}
@Module({ imports: [AppModule], controllers: [ProbeController] })
class TestModule {}
const infrastructure = loadInfrastructureConfig();
const database = createPrismaClient(infrastructure.databaseUrl);
const password = `Certification ${opaqueToken()}`;
const secretValues = new Set<string>([password]);
const capturedLogs: string[] = [];
const operationalErrors: string[] = [];
const prefix = `gestschool:iam:cert:${randomUUID()}`;
let app: INestApplication;
let iam: IamRuntime;
let baseUrl: string;
let passwordHash: string;
interface Reply {
  status: number;
  body: Record<string, unknown>;
  headers: Headers;
}
function field(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string') throw new Error(`Missing response field: ${key}`);
  return value;
}
class Browser {
  readonly cookies = new Map<string, string>();
  csrf = '';
  access = '';
  async init() {
    const result = await this.send('/api/v1/auth/csrf', undefined, 'GET');
    this.csrf = field(result.body, 'csrfToken');
    return this;
  }
  clone() {
    const result = new Browser();
    for (const [key, value] of this.cookies) result.cookies.set(key, value);
    result.csrf = this.csrf;
    result.access = this.access;
    return result;
  }
  async send(
    path: string,
    body?: unknown,
    method = 'POST',
    headers: Record<string, string> = {},
  ): Promise<Reply> {
    const response = await fetch(`${baseUrl}${path}`, {
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
      const [pair] = raw.split(';');
      const split = pair?.indexOf('=') ?? -1;
      if (pair && split !== -1) {
        const name = pair.slice(0, split);
        const value = pair.slice(split + 1);
        if (value) this.cookies.set(name, value);
        else this.cookies.delete(name);
      }
    }
    const result =
      response.status === 204 ? {} : ((await response.json()) as Record<string, unknown>);
    if (typeof result['accessToken'] === 'string') {
      this.access = result['accessToken'];
      secretValues.add(this.access);
    }
    const refresh = this.cookies.get('gs_refresh');
    if (refresh) secretValues.add(refresh);
    return { status: response.status, body: result, headers: response.headers };
  }
}
async function fixture(role: SystemRole = 'STUDENT', active = true) {
  const suffix = randomUUID();
  const tenant = await database.tenant.create({
    data: { slug: `iam-${suffix}`, name: 'IAM certification' },
  });
  const user = await database.user.create({
    data: {
      email: `${suffix}@example.invalid`,
      displayName: 'IAM Test',
      identity: { create: active ? { passwordHash, activatedAt: new Date() } : {} },
    },
  });
  const membership = await database.membership.create({
    data: { userId: user.id, tenantId: tenant.id },
  });
  const systemRole = await database.role.findFirstOrThrow({
    where: { code: role, tenantId: null },
  });
  await database.membershipRole.create({
    data: { tenantId: tenant.id, membershipId: membership.id, roleId: systemRole.id },
  });
  return { tenant, user, membership, role: systemRole };
}
async function signIn(record: Awaited<ReturnType<typeof fixture>>, browser?: Browser) {
  const client = browser ?? (await new Browser().init());
  const result = await client.send('/api/v1/auth/login', { email: record.user.email, password });
  if (result.status !== 201) throw new Error(`Login fixture failed with status ${result.status}`);
  if (result.body['kind'] === 'mfa') {
    const enrollment = await client.send('/api/v1/auth/mfa/enroll', {
      challenge: field(result.body, 'challenge'),
    });
    const secret = field(enrollment.body, 'secret');
    secretValues.add(secret);
    const confirmation = await client.send('/api/v1/auth/mfa/confirm', {
      challenge: field(enrollment.body, 'challenge'),
      code: iam.crypto.totp(secret).generate(),
    });
    if (confirmation.status !== 201)
      throw new Error(`MFA fixture failed with status ${confirmation.status}`);
  }
  return client;
}
beforeAll(async () => {
  process.env['IAM_REDIS_PREFIX'] = prefix;
  app = await NestFactory.create(TestModule, {
    logger: {
      log: (...messages: unknown[]) => capturedLogs.push(JSON.stringify(messages)),
      warn: (...messages: unknown[]) => {
        const entry = JSON.stringify(messages);
        capturedLogs.push(entry);
        operationalErrors.push(entry);
      },
      error: (...messages: unknown[]) => {
        const entry = JSON.stringify(messages);
        capturedLogs.push(entry);
        operationalErrors.push(entry);
      },
    },
  });
  configureIamHttp(app);
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
  iam = app.get(IamRuntime);
  passwordHash = await iam.passwords.hash(password);
});
beforeEach(async () => {
  const keys = await iam.limiter.client.keys(`${prefix}:*`);
  if (keys.length) await iam.limiter.client.del(keys);
});
afterAll(async () => {
  const keys = await iam.limiter.client.keys(`${prefix}:*`);
  if (keys.length) await iam.limiter.client.del(keys);
  await app.close();
  await database.$disconnect();
});

describe('auth tests', () => {
  it('accepts valid credentials and returns only the session contract', async () => {
    const user = await fixture();
    const browser = await signIn(user);
    const result = await browser.send('/api/v1/auth/me', undefined, 'GET');
    expect(result.status).toBe(200);
    expect(result.body['tenantId']).toBe(user.tenant.id);
    expect(JSON.stringify(result.body).includes('passwordHash')).toBe(false);
  });
  it('uses indistinguishable errors for wrong password and unknown user', async () => {
    const user = await fixture();
    const browser = await new Browser().init();
    const a = await browser.send('/api/v1/auth/login', {
      email: user.user.email,
      password: 'incorrect passphrase',
    });
    const b = await browser.send('/api/v1/auth/login', {
      email: 'absent@example.invalid',
      password,
    });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body['code']).toBe(b.body['code']);
    expect(Object.keys(a.body).toSorted()).toEqual(['code', 'requestId', 'status']);
  });
  it.each(['user', 'membership', 'tenant'] as const)('rejects disabled %s', async (target) => {
    const user = await fixture();
    if (target === 'user')
      await database.user.update({ where: { id: user.user.id }, data: { disabledAt: new Date() } });
    if (target === 'membership')
      await database.membership.update({
        where: { id: user.membership.id },
        data: { status: 'SUSPENDED' },
      });
    if (target === 'tenant')
      await database.tenant.update({
        where: { id: user.tenant.id },
        data: { status: 'SUSPENDED' },
      });
    const result = await (
      await new Browser().init()
    ).send('/api/v1/auth/login', { email: user.user.email, password });
    expect(result.status).toBe(401);
  });
  it('rejects anonymous requests and protected routes without explicit permission metadata', async () => {
    const browser = await new Browser().init();
    expect((await browser.send('/api/v1/auth/me', undefined, 'GET')).status).toBe(401);
    await signIn(await fixture(), browser);
    expect((await browser.send('/iam-cert/unannotated', undefined, 'GET')).status).toBe(403);
  });
});
describe('session tests', () => {
  it('rejects an access token immediately after revocation', async () => {
    const user = await fixture();
    const browser = await signIn(user);
    const current = await browser.send('/api/v1/auth/me', undefined, 'GET');
    const result = await browser.send(
      `/api/v1/auth/sessions/${field(current.body, 'sessionId')}`,
      {},
      'DELETE',
    );
    expect(result.status).toBe(200);
    expect((await browser.send('/api/v1/auth/me', undefined, 'GET')).status).toBe(401);
  });
  it('logout-all revokes every session and refresh token for that user', async () => {
    const user = await fixture();
    const a = await signIn(user);
    const b = await signIn(user);
    expect((await a.send('/api/v1/auth/logout-all')).status).toBe(201);
    expect((await b.send('/api/v1/auth/me', undefined, 'GET')).status).toBe(401);
    expect((await b.send('/api/v1/auth/refresh')).status).toBe(401);
  });
  it('does not list or revoke another user’s session', async () => {
    const a = await signIn(await fixture());
    const b = await signIn(await fixture());
    const other = await b.send('/api/v1/auth/me', undefined, 'GET');
    expect(
      (await a.send(`/api/v1/auth/sessions/${field(other.body, 'sessionId')}`, {}, 'DELETE'))
        .status,
    ).toBe(404);
    const sessions = await a.send('/api/v1/auth/sessions', undefined, 'GET');
    expect(JSON.stringify(sessions.body).includes(field(other.body, 'sessionId'))).toBe(false);
    expect(JSON.stringify(sessions.body).includes('tokenHash')).toBe(false);
  });
  it('rechecks account state after issuing a valid access token', async () => {
    const user = await fixture();
    const browser = await signIn(user);
    await database.user.update({ where: { id: user.user.id }, data: { disabledAt: new Date() } });
    expect((await browser.send('/api/v1/auth/me', undefined, 'GET')).status).toBe(401);
  });
});
describe('refresh rotation tests', () => {
  it('rotates opaque tokens, stores only hashes and detects historical reuse', async () => {
    const browser = await signIn(await fixture());
    const old = browser.clone();
    const oldValue = browser.cookies.get('gs_refresh') ?? '';
    expect((await browser.send('/api/v1/auth/refresh')).status).toBe(201);
    expect(browser.cookies.get('gs_refresh') === oldValue).toBe(false);
    const stored = await database.refreshToken.findUniqueOrThrow({
      where: { tokenHash: tokenHash(oldValue) },
    });
    expect(stored.consumedAt).not.toBeNull();
    expect(stored.tokenHash === oldValue).toBe(false);
    expect((await old.send('/api/v1/auth/refresh')).status).toBe(401);
    expect((await browser.send('/api/v1/auth/me', undefined, 'GET')).status).toBe(401);
    expect(
      await database.iamAuditLog.count({
        where: { action: 'refresh.reuse_detected', subjectId: stored.sessionId },
      }),
    ).toBe(1);
  });
  it('serializes simultaneous refresh requests and revokes the compromised family', async () => {
    const browser = await signIn(await fixture());
    const other = browser.clone();
    const results = await Promise.all([
      browser.send('/api/v1/auth/refresh'),
      other.send('/api/v1/auth/refresh'),
    ]);
    expect(results.map((result) => result.status).toSorted()).toEqual([201, 401]);
    expect((await browser.send('/api/v1/auth/me', undefined, 'GET')).status).toBe(401);
  });
  it('rejects expired sessions', async () => {
    const user = await fixture();
    const browser = await signIn(user);
    await database.session.updateMany({
      where: { userId: user.user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await browser.send('/api/v1/auth/refresh')).status).toBe(401);
  });
});
describe('activation and password reset tests', () => {
  const metadata = { requestId: randomUUID(), ipAddress: 'test', userAgent: 'test' };
  it('activates once, hashes the password and refuses token reuse', async () => {
    const user = await fixture('STUDENT', false);
    const token = await iam.credentials.issue(user.user.email, 'ACTIVATION', metadata);
    if (!token) throw new Error('Missing fixture token');
    secretValues.add(token);
    const browser = await new Browser().init();
    const body = { token, password };
    expect((await browser.send('/api/v1/auth/activation', body)).status).toBe(201);
    expect((await browser.send('/api/v1/auth/activation', body)).status).toBe(400);
    expect(
      (
        await database.authIdentity.findUniqueOrThrow({ where: { userId: user.user.id } })
      ).passwordHash?.startsWith('$argon2id$'),
    ).toBe(true);
    await signIn(user);
  });
  it('gives a generic forgot-password response without returning the reset token', async () => {
    const user = await fixture();
    const browser = await new Browser().init();
    const known = await browser.send('/api/v1/auth/forgot-password', { email: user.user.email });
    const unknown = await browser.send('/api/v1/auth/forgot-password', {
      email: 'nobody@example.invalid',
    });
    expect(known.status).toBe(201);
    expect(known.body).toEqual(unknown.body);
    expect(known.body).toEqual({ ok: true });
  });
  it('rejects expired reset tokens', async () => {
    const user = await fixture();
    const token = await iam.credentials.issue(user.user.email, 'PASSWORD_RESET', metadata);
    if (!token) throw new Error('Missing fixture token');
    await database.authToken.update({
      where: { tokenHash: tokenHash(token) },
      data: { createdAt: new Date(Date.now() - 3000), expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (await (await new Browser().init()).send('/api/v1/auth/reset-password', { token, password }))
        .status,
    ).toBe(400);
  });
  it('resets once, revokes sessions and invalidates pending MFA challenges', async () => {
    const user = await fixture();
    const browser = await signIn(user);
    const token = await iam.credentials.issue(user.user.email, 'PASSWORD_RESET', metadata);
    if (!token) throw new Error('Missing fixture token');
    secretValues.add(token);
    const body = { token, password: `${password} new` };
    expect((await browser.send('/api/v1/auth/reset-password', body)).status).toBe(201);
    expect((await browser.send('/api/v1/auth/reset-password', body)).status).toBe(400);
    expect((await browser.send('/api/v1/auth/me', undefined, 'GET')).status).toBe(401);
    expect(await database.authToken.count({ where: { userId: user.user.id, usedAt: null } })).toBe(
      0,
    );
  });
});
describe('multi-tenant tests', () => {
  it('switches only to an active membership belonging to the authenticated user', async () => {
    const user = await fixture();
    const target = await fixture();
    const membership = await database.membership.create({
      data: {
        userId: user.user.id,
        tenantId: target.tenant.id,
        roles: { create: { roleId: user.role.id } },
      },
    });
    const browser = await signIn(user);
    const old = browser.clone();
    expect(
      (await browser.send('/api/v1/auth/switch-tenant', { membershipId: membership.id })).status,
    ).toBe(201);
    expect((await browser.send('/api/v1/auth/me', undefined, 'GET')).body['tenantId']).toBe(
      target.tenant.id,
    );
    expect((await old.send('/api/v1/auth/me', undefined, 'GET')).status).toBe(401);
    expect(
      (await browser.send('/api/v1/auth/switch-tenant', { membershipId: target.membership.id }))
        .status,
    ).toBe(401);
  });
  it('rejects X-Tenant-ID and extra frontend-controlled tenant claims', async () => {
    const browser = await signIn(await fixture());
    expect(
      (await browser.send('/api/v1/auth/me', undefined, 'GET', { 'X-Tenant-ID': randomUUID() }))
        .status,
    ).toBe(403);
    expect(
      (
        await browser.send('/api/v1/auth/switch-tenant', {
          membershipId: randomUUID(),
          tenantId: randomUUID(),
        })
      ).status,
    ).toBe(400);
  });
  it('rejects suspended memberships at switch time', async () => {
    const user = await fixture();
    const browser = await signIn(user);
    await database.membership.update({
      where: { id: user.membership.id },
      data: { status: 'SUSPENDED' },
    });
    expect(
      (await browser.send('/api/v1/auth/switch-tenant', { membershipId: user.membership.id }))
        .status,
    ).toBe(401);
  });
});
describe('RBAC tests', () => {
  it('audits tenant-local role changes and revokes affected sessions without granting SUPER_ADMIN', async () => {
    const actor = await fixture('SCHOOL_ADMIN');
    const admin = await signIn(actor);
    const target = await fixture();
    const membership = await database.membership.create({
      data: { tenantId: actor.tenant.id, userId: target.user.id },
    });
    const student = await signIn(target);
    const role = await database.role.findFirstOrThrow({
      where: { code: 'TEACHER', tenantId: null },
    });
    expect(
      (
        await admin.send(
          `/api/v1/iam/memberships/${membership.id}/role`,
          { roleId: role.id },
          'PUT',
        )
      ).status,
    ).toBe(200);
    expect((await student.send('/api/v1/auth/me', undefined, 'GET')).status).toBe(401);
    expect(
      await database.iamAuditLog.count({
        where: { action: 'role.changed', subjectId: membership.id },
      }),
    ).toBe(1);
    const superRole = await database.role.findFirstOrThrow({
      where: { code: 'SUPER_ADMIN', tenantId: null },
    });
    expect(
      (
        await admin.send(
          `/api/v1/iam/memberships/${membership.id}/role`,
          { roleId: superRole.id },
          'PUT',
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await admin.send(
          `/api/v1/iam/memberships/${target.membership.id}/role`,
          { roleId: role.id },
          'PUT',
        )
      ).status,
    ).toBe(403);
  });
  it('invites an inactive fictitious account without exposing its activation token', async () => {
    const actor = await fixture('SCHOOL_ADMIN');
    const admin = await signIn(actor);
    const role = await database.role.findFirstOrThrow({
      where: { code: 'TEACHER', tenantId: null },
    });
    const email = `${randomUUID()}@example.invalid`;
    const result = await admin.send('/api/v1/iam/invitations', {
      email,
      displayName: 'Invited IAM',
      roleId: role.id,
    });
    expect(result.status).toBe(201);
    expect(result.body).toEqual({ ok: true });
    const invited = await database.user.findUniqueOrThrow({
      where: { email },
      include: { identity: true },
    });
    expect(invited.identity?.activatedAt).toBeNull();
    expect(
      await database.authToken.count({
        where: { userId: invited.id, purpose: 'ACTIVATION', usedAt: null },
      }),
    ).toBe(1);
  });
  it('allows accountant payment creation and forbids grade updates through the guard chain', async () => {
    const browser = await signIn(await fixture('ACCOUNTANT'));
    expect((await browser.send('/iam-cert/payments', undefined, 'GET')).status).toBe(200);
    expect((await browser.send('/iam-cert/grades', undefined, 'GET')).status).toBe(403);
  });
  it('grants teacher grading and forbids payment cancellation', async () => {
    const browser = await signIn(await fixture('TEACHER'));
    expect((await browser.send('/iam-cert/grades', undefined, 'GET')).status).toBe(200);
    expect((await browser.send('/iam-cert/cancel', undefined, 'GET')).status).toBe(403);
  });
  it('forbids student invitations and role escalation', async () => {
    const browser = await signIn(await fixture());
    expect(
      (
        await browser.send('/api/v1/iam/invitations', {
          email: 'invited@example.invalid',
          displayName: 'Invited',
          roleId: randomUUID(),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await browser.send(
          `/api/v1/iam/memberships/${randomUUID()}/role`,
          { roleId: randomUUID() },
          'PUT',
        )
      ).status,
    ).toBe(403);
  });
});
describe('scope tests', () => {
  it.each(['PARENT', 'STUDENT', 'TEACHER'] as const)(
    'resolves %s scopes server-side and rejects unrelated or cross-tenant resources',
    async (role) => {
      const browser = await signIn(await fixture(role));
      const result = await browser.send('/iam-cert/scope', undefined, 'GET');
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ own: true, other: false, cross: false });
    },
  );
});
describe('MFA tests', () => {
  it('rejects enrollment setup with a context revoked after authentication', async () => {
    const user = await fixture();
    const browser = await signIn(user);
    const context = await iam.sessions.context(await iam.crypto.verify(browser.access), {
      requestId: randomUUID(),
      ipAddress: '127.0.0.1',
      userAgent: 'certification',
    });
    await iam.sessions.revoke(context, context.sessionId);
    await expect(iam.mfa.setup(context, password)).rejects.toMatchObject({
      code: 'AUTH_SESSION_EXPIRED',
    });
    expect(await database.authToken.count({ where: { userId: user.user.id } })).toBe(0);
  });
  it('verifies enrolled TOTP at login and allows controlled disabling for a non-privileged account', async () => {
    const user = await fixture('STUDENT');
    const browser = await signIn(user);
    const setup = await browser.send('/api/v1/auth/mfa/setup', { password });
    const enrollment = await browser.send('/api/v1/auth/mfa/enroll', {
      challenge: field(setup.body, 'challenge'),
    });
    const secret = field(enrollment.body, 'secret');
    secretValues.add(secret);
    expect(
      (
        await browser.send('/api/v1/auth/mfa/confirm', {
          challenge: field(enrollment.body, 'challenge'),
          code: iam.crypto.totp(secret).generate(),
        })
      ).status,
    ).toBe(201);
    const login = await browser.send('/api/v1/auth/login', { email: user.user.email, password });
    expect(login.body['enrollmentRequired']).toBe(false);
    const nextCode = iam.crypto.totp(secret).generate({ timestamp: Date.now() + 30000 });
    expect(
      (
        await browser.send('/api/v1/auth/mfa/verify', {
          challenge: field(login.body, 'challenge'),
          code: nextCode,
        })
      ).status,
    ).toBe(201);
    // Isolate the disabling check from replay prevention already certified above.
    await database.authIdentity.update({
      where: { userId: user.user.id },
      data: { mfaLastCounter: -1 },
    });
    expect(
      (
        await browser.send('/api/v1/auth/mfa/disable', {
          password,
          code: iam.crypto.totp(secret).generate(),
        })
      ).status,
    ).toBe(201);
    expect((await browser.send('/api/v1/auth/me', undefined, 'GET')).status).toBe(401);
    expect(
      (await database.authIdentity.findUniqueOrThrow({ where: { userId: user.user.id } }))
        .mfaSecret,
    ).toBeNull();
  });
  it.each(['SUPER_ADMIN', 'SCHOOL_ADMIN', 'DIRECTOR', 'ACCOUNTANT'] as const)(
    'requires TOTP enrollment for %s before granting a session',
    async (role) => {
      const user = await fixture(role);
      const browser = await new Browser().init();
      const result = await browser.send('/api/v1/auth/login', { email: user.user.email, password });
      expect(result.body['kind']).toBe('mfa');
      expect(result.body['enrollmentRequired']).toBe(true);
      expect(result.body['accessToken']).toBeUndefined();
      expect(browser.cookies.has('gs_refresh')).toBe(false);
    },
  );
  it('requires a valid first code, stores encrypted secrets, detects code replay and controls disabling', async () => {
    const user = await fixture('SCHOOL_ADMIN');
    const browser = await new Browser().init();
    const login = await browser.send('/api/v1/auth/login', { email: user.user.email, password });
    const setup = await browser.send('/api/v1/auth/mfa/enroll', {
      challenge: field(login.body, 'challenge'),
    });
    const secret = field(setup.body, 'secret');
    secretValues.add(secret);
    const challenge = field(setup.body, 'challenge');
    expect(
      (await browser.send('/api/v1/auth/mfa/confirm', { challenge, code: 'invalid' })).status,
    ).toBe(400);
    const code = iam.crypto.totp(secret).generate();
    expect((await browser.send('/api/v1/auth/mfa/confirm', { challenge, code })).status).toBe(201);
    const identity = await database.authIdentity.findUniqueOrThrow({
      where: { userId: user.user.id },
    });
    expect(identity.mfaSecret?.includes(secret)).toBe(false);
    const nextLogin = await browser.send('/api/v1/auth/login', {
      email: user.user.email,
      password,
    });
    expect(
      (
        await browser.send('/api/v1/auth/mfa/verify', {
          challenge: field(nextLogin.body, 'challenge'),
          code,
        })
      ).status,
    ).toBe(401);
    expect((await browser.send('/api/v1/auth/mfa/disable', { password, code })).status).toBe(403);
  });
});
describe('CSRF and CORS tests', () => {
  it('rejects missing and mismatched CSRF tokens, missing and hostile origins', async () => {
    const browser = await new Browser().init();
    for (const headers of [
      { 'X-CSRF-Token': '' },
      { 'X-CSRF-Token': iam.crypto.csrf() },
      { Origin: 'https://evil.example.invalid' },
      { Origin: '' },
    ])
      expect(
        (
          await browser.send(
            '/api/v1/auth/forgot-password',
            { email: 'nobody@example.invalid' },
            'POST',
            headers,
          )
        ).status,
      ).toBe(403);
  });
  it('serves only exact allowlisted CORS origins with credentials', async () => {
    const browser = await new Browser().init();
    const allowed = await browser.send('/api/v1/auth/login', undefined, 'OPTIONS');
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:3000');
    expect(allowed.headers.get('access-control-allow-credentials')).toBe('true');
    const denied = await browser.send('/api/v1/auth/login', undefined, 'OPTIONS', {
      Origin: 'https://evil.example.invalid',
    });
    expect(denied.status).toBe(403);
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('sets HttpOnly and SameSite cookies, uses Secure in staging/prod and disables caching', async () => {
    const user = await fixture();
    const browser = await new Browser().init();
    const result = await browser.send('/api/v1/auth/login', { email: user.user.email, password });
    const header = result.headers.getSetCookie().join(';');
    expect(header.includes('HttpOnly')).toBe(true);
    expect(header.includes('SameSite=Strict')).toBe(true);
    expect(header.includes('Path=/api/v1/auth')).toBe(true);
    expect(result.headers.get('cache-control')).toBe('no-store');
    const production = { config: { ...iam.config, secure: true } } as IamRuntime;
    expect(cookieOptions(production, true).secure).toBe(true);
  });
});
describe('rate-limit tests', () => {
  it.each([
    'login',
    'forgot-password',
    'reset-password',
    'refresh',
    'activation',
    'mfa/enroll',
    'mfa/confirm',
    'mfa/verify',
    'mfa/disable',
  ])('applies the Redis IP budget to %s', async (endpoint) => {
    const browser = await new Browser().init();
    await iam.limiter.client.set(
      `${prefix}:/api/v1/auth/${endpoint}:ip:${tokenHash('127.0.0.1')}`,
      '150',
      { EX: 60 },
    );
    expect((await browser.send(`/api/v1/auth/${endpoint}`, {})).status).toBe(429);
  });
  it('fails closed when its Redis connection is unavailable', async () => {
    const browser = await new Browser().init();
    const logCount = capturedLogs.length;
    await iam.limiter.close();
    try {
      expect(
        (
          await browser.send('/api/v1/auth/forgot-password', {
            email: 'unavailable@example.invalid',
          })
        ).status,
      ).toBe(503);
      expect(capturedLogs.length).toBe(logCount + 1);
      expect(capturedLogs.at(-1)).toContain('AUTH_UNAVAILABLE');
    } finally {
      await iam.limiter.open();
    }
  });
  it('throttles repeated sensitive requests by account and IP using Redis and recovers after expiry', async () => {
    const browser = await new Browser().init();
    let status = 0;
    for (let index = 0; index < 11; index++)
      status = (
        await browser.send('/api/v1/auth/forgot-password', { email: 'limited@example.invalid' })
      ).status;
    expect(status).toBe(429);
    const keys = await iam.limiter.client.keys(`${prefix}:*`);
    expect(keys.length).toBeGreaterThan(1);
    expect(await iam.limiter.client.pTTL(keys[0] ?? '')).toBeGreaterThan(0);
    for (const key of keys) await iam.limiter.client.pExpire(key, 1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(
      (await browser.send('/api/v1/auth/forgot-password', { email: 'limited@example.invalid' }))
        .status,
    ).toBe(201);
  });
});
describe('audit tests', () => {
  it('preserves append-only IAM and LOT 3 audit and never stores or logs credentials', async () => {
    const row = await database.iamAuditLog.findFirstOrThrow();
    await expect(
      database.iamAuditLog.update({ where: { id: row.id }, data: { action: 'tamper' } }),
    ).rejects.toThrow();
    await expect(database.iamAuditLog.delete({ where: { id: row.id } })).rejects.toThrow();
    const logs = capturedLogs.join('\n');
    const audit = JSON.stringify(await database.iamAuditLog.findMany({ take: 100 }));
    for (const secret of secretValues) {
      expect(logs.includes(secret)).toBe(false);
      expect(audit.includes(secret)).toBe(false);
    }
    // The intentionally unavailable Redis test emits one sanitized operational error.
    expect(operationalErrors.length).toBe(1);
    expect(operationalErrors[0]).toContain('AUTH_UNAVAILABLE');
  });
});
