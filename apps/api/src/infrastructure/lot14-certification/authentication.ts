import { setTimeout as delay } from 'node:timers/promises';
import type { IamCrypto } from '../../modules/iam/infrastructure/crypto.js';
import { failure, type Role } from './config.js';
import { CertificationHttp, object, requireStatus, text } from './http.js';
import type { Account } from './fixtures.js';

export interface AuthenticationDependencies {
  port: number;
  environment: NodeJS.ProcessEnv;
  crypto: IamCrypto;
  sessions: CertificationHttp[];
  accounts: Account[];
  readMfa(email: string, tenantId: string): Promise<Record<string, unknown>[]>;
}

export async function authenticate(
  label: 'A' | 'B',
  role: Role,
  tenantId: string,
  signal: AbortSignal,
  dependencies: AuthenticationDependencies,
): Promise<Account> {
  const { port, environment, crypto, sessions, accounts, readMfa } = dependencies;
  const http = new CertificationHttp(port, signal);
  sessions.push(http);
  const email = `lot14-${label.toLowerCase()}-${role === 'SCHOOL_ADMIN' ? 'admin' : role.toLowerCase()}@example.invalid`;
  const password = environment[`LOT14_BOOTSTRAP_${label}_${role}_PASSWORD`];
  const csrf = await http.send('auth/csrf');
  requireStatus(csrf, 200);
  let response = await http.send('auth/login', 'POST', { email, password });
  requireStatus(response, 201);
  let userId = '';
  if (response.body.kind === 'mfa') {
    let challenge = text(response.body.challenge);
    let secret: string;
    if (response.body.enrollmentRequired === true) {
      if (role !== 'SCHOOL_ADMIN') throw failure();
      const enrolled = await http.send('auth/mfa/enroll', 'POST', { challenge });
      requireStatus(enrolled, 201);
      challenge = text(enrolled.body.challenge);
      secret = text(enrolled.body.secret);
    } else {
      // Read-only exception for reruns, after bootstrap ownership/password/role verification.
      // Only these synthetic users' encrypted seeds/counters are read. No session is forged,
      // no counter/seed is written here: the normal HTTP verify route enforces replay checks.
      const rows = await readMfa(email, tenantId);
      if (rows.length !== 1) throw failure();
      userId = text(rows[0]!.id);
      secret = crypto.decrypt(text(rows[0]!.mfa_secret), userId);
      const counter = BigInt(String(rows[0]!.mfa_last_counter));
      if (BigInt(Math.floor(Date.now() / 30_000)) <= counter) {
        const wait = Number((counter + 1n) * 30_000n - BigInt(Date.now())) + 100;
        if (wait < 0 || wait > 30_200) throw failure();
        await delay(wait, undefined, { signal });
      }
    }
    const code = crypto.totp(secret).generate();
    secret = '';
    response = await http.send(
      response.body.enrollmentRequired ? 'auth/mfa/confirm' : 'auth/mfa/verify',
      'POST',
      { challenge, code },
    );
    requireStatus(response, 201);
  } else if (role === 'SCHOOL_ADMIN') throw failure();
  if (response.body.kind !== 'session') throw failure();
  http.access = text(response.body.accessToken);
  const session = object(response.body.session);
  const account: Account = {
    http,
    userId: text(object(session.user).id),
    tenantId,
    membershipId: text(session.membershipId),
    sessionId: text(session.sessionId),
  };
  // Register immediately so a subsequent refresh/profile assertion failure still revokes it.
  accounts.push(account);
  if (object(session.tenant).id !== tenantId || (userId && account.userId !== userId))
    throw failure();
  const refreshed = await http.send('auth/refresh', 'POST', {});
  requireStatus(refreshed, 201);
  if (refreshed.body.kind !== 'session') throw failure();
  http.access = text(refreshed.body.accessToken);
  const me = await http.send('auth/me');
  requireStatus(me, 200);
  if (
    me.body.tenantId !== tenantId ||
    object(me.body.user).id !== account.userId ||
    !Array.isArray(me.body.roles) ||
    me.body.roles.length !== 1 ||
    me.body.roles[0] !== role
  )
    throw failure();
  return account;
}
