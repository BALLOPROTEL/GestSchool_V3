import { setTimeout as delay } from 'node:timers/promises';
import type { IamCrypto } from '../../modules/iam/infrastructure/crypto.js';
import { failure, type Role } from './config.js';
import { CertificationHttp, object, text } from './http.js';
import type { Account } from './fixtures.js';
import {
  authRequest,
  CertificationAuthFailure,
  preparationStep,
  type AuthFailureDetails,
} from './diagnostics.js';

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
  let operation: AuthFailureDetails['operation'] = 'CSRF';
  try {
    const { port, environment, crypto, sessions, accounts, readMfa } = dependencies;
    const http = new CertificationHttp(port, signal);
    sessions.push(http);
    const email = `lot14-${label.toLowerCase()}-${role === 'SCHOOL_ADMIN' ? 'admin' : role.toLowerCase()}@example.invalid`;
    const password = environment[`LOT14_BOOTSTRAP_${label}_${role}_PASSWORD`];
    await authRequest(http, 'CSRF', 'auth/csrf', 200);
    operation = 'LOGIN';
    let response = await authRequest(http, 'LOGIN', 'auth/login', 201, 'POST', { email, password });
    let userId = '';
    if (response.body.kind === 'mfa') {
      let challenge = text(response.body.challenge);
      let secret: string;
      if (response.body.enrollmentRequired === true) {
        if (role !== 'SCHOOL_ADMIN') throw failure();
        operation = 'MFA_ENROLL';
        const enrolled = await authRequest(http, 'MFA_ENROLL', 'auth/mfa/enroll', 201, 'POST', {
          challenge,
        });
        challenge = text(enrolled.body.challenge);
        secret = text(enrolled.body.secret);
      } else {
        // Read-only exception for reruns, after bootstrap ownership/password/role verification.
        // Only these synthetic users' encrypted seeds/counters are read. No session is forged,
        // no counter/seed is written here: the normal HTTP verify route enforces replay checks.
        operation = 'MFA_STATE_READ';
        const rows = await preparationStep('MFA_STATE_READ', 'AUTH_MFA_STATE_UNAVAILABLE', () =>
          readMfa(email, tenantId),
        );
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
      operation = 'MFA_TOTP';
      const code = crypto.totp(secret).generate();
      secret = '';
      operation = response.body.enrollmentRequired ? 'MFA_CONFIRM' : 'MFA_VERIFY';
      response = await authRequest(
        http,
        operation,
        response.body.enrollmentRequired ? 'auth/mfa/confirm' : 'auth/mfa/verify',
        201,
        'POST',
        { challenge, code },
      );
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
    operation = 'REFRESH';
    const refreshed = await authRequest(http, 'REFRESH', 'auth/refresh', 201, 'POST', {});
    if (refreshed.body.kind !== 'session') throw failure();
    http.access = text(refreshed.body.accessToken);
    operation = 'PROFILE';
    const me = await authRequest(http, 'PROFILE', 'auth/me', 200);
    if (
      me.body.tenantId !== tenantId ||
      object(me.body.user).id !== account.userId ||
      !Array.isArray(me.body.roles) ||
      me.body.roles.length !== 1 ||
      me.body.roles[0] !== role
    )
      throw failure();
    return account;
  } catch (error) {
    const details =
      error instanceof CertificationAuthFailure
        ? error.details
        : { code: 'AUTH_FIXTURE_MISMATCH' as const, operation };
    throw new CertificationAuthFailure({ ...details, tenant: label, role });
  }
}
