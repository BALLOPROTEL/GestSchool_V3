import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const V2_TO_V3_ROLE_MAP = Object.freeze({
  ADMIN: 'SCHOOL_ADMIN',
  SCOLARITE: 'ACADEMIC_STAFF',
  ENSEIGNANT: 'TEACHER',
  COMPTABLE: 'ACCOUNTANT',
  PARENT: 'PARENT',
  STUDENT: 'STUDENT',
});

const FORBIDDEN_KEYS = new Set([
  'password',
  'passwordHash',
  'refreshToken',
  'refreshTokens',
  'accessToken',
  'securityToken',
  'securityTokens',
  'activationToken',
  'resetToken',
  'cookie',
  'cookies',
  'session',
  'sessions',
  'mfaSecret',
  'jwt',
]);

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const normalized = (value) => text(value).toLowerCase();
const fingerprint = (value) =>
  createHash('sha256').update(String(value)).digest('hex').slice(0, 16);

function recordFingerprint(user) {
  return fingerprint(
    [
      text(user.tenantId),
      text(user.sourceUserId),
      normalized(user.username),
      normalized(user.email),
    ].join('|'),
  );
}

function scanForbidden(value, path = []) {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => scanForbidden(entry, [...path, String(index)]));
  }
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, entry]) => {
    const current = [...path, key];
    if (FORBIDDEN_KEYS.has(key)) return [current.join('.')];
    return scanForbidden(entry, current);
  });
}

function addFinding(map, code, user) {
  const current = map.get(code) ?? new Set();
  current.add(recordFingerprint(user));
  map.set(code, current);
}

function findings(map) {
  return [...map.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([code, values]) => ({
      code,
      count: values.size,
      fingerprints: [...values].toSorted(),
    }));
}

export function analyzeV2IdentityDryRun(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    input.schemaVersion !== 1 ||
    !Array.isArray(input.users)
  ) {
    throw new Error('LOT16_INPUT_INVALID');
  }

  const forbidden = scanForbidden(input);
  if (forbidden.length) {
    throw new Error(`LOT16_FORBIDDEN_CREDENTIAL_MATERIAL:${forbidden.toSorted().join(',')}`);
  }

  const blockers = new Map();
  const warnings = new Map();
  const roleCounts = new Map();
  const emailGroups = new Map();
  const usernameGroups = new Map();
  const tenantUsernameGroups = new Map();
  const tenantEmailGroups = new Map();

  let active = 0;
  let inactive = 0;
  let withEmail = 0;
  let missingEmail = 0;
  let bcryptCompatible = 0;

  for (const user of input.users) {
    const sourceUserId = text(user.sourceUserId);
    const tenantId = text(user.tenantId);
    const username = text(user.username);
    const email = normalized(user.email);
    const role = text(user.role).toUpperCase();
    const status = text(user.status || 'ACTIVE').toUpperCase();
    const hashKind = text(user.passwordHashKind).toUpperCase();
    const enabled = user.isActive !== false && !user.disabledAt && status === 'ACTIVE';

    if (!sourceUserId || !tenantId || !username)
      addFinding(blockers, 'INVALID_SOURCE_IDENTITY', user);

    if (enabled) active += 1;
    else {
      inactive += 1;
      addFinding(warnings, 'INACTIVE_ACCOUNT_WILL_REMAIN_DISABLED', user);
    }

    if (email) {
      withEmail += 1;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        addFinding(blockers, 'INVALID_EMAIL', user);
      }
      const group = emailGroups.get(email) ?? [];
      group.push(user);
      emailGroups.set(email, group);

      const tenantEmailKey = `${tenantId}|${email}`;
      const tenantEmailGroup = tenantEmailGroups.get(tenantEmailKey) ?? [];
      tenantEmailGroup.push(user);
      tenantEmailGroups.set(tenantEmailKey, tenantEmailGroup);
    } else {
      missingEmail += 1;
      addFinding(blockers, 'MISSING_EMAIL_REQUIRES_POLICY', user);
    }

    const usernameKey = normalized(username);
    const usernameGroup = usernameGroups.get(usernameKey) ?? [];
    usernameGroup.push(user);
    usernameGroups.set(usernameKey, usernameGroup);

    const tenantUsernameKey = `${tenantId}|${usernameKey}`;
    const tenantUsernameGroup = tenantUsernameGroups.get(tenantUsernameKey) ?? [];
    tenantUsernameGroup.push(user);
    tenantUsernameGroups.set(tenantUsernameKey, tenantUsernameGroup);

    const targetRole = V2_TO_V3_ROLE_MAP[role];
    if (!targetRole) addFinding(blockers, 'UNMAPPED_ROLE', user);
    else
      roleCounts.set(`${role}->${targetRole}`, (roleCounts.get(`${role}->${targetRole}`) ?? 0) + 1);

    if (hashKind === 'BCRYPT') bcryptCompatible += 1;
    else addFinding(blockers, 'UNSUPPORTED_PASSWORD_HASH_KIND', user);
  }

  for (const group of emailGroups.values()) {
    const sourceIds = new Set(group.map((user) => text(user.sourceUserId)));
    if (sourceIds.size > 1) {
      for (const user of group) addFinding(blockers, 'GLOBAL_EMAIL_REUSE_REQUIRES_REVIEW', user);
    }
  }

  for (const group of usernameGroups.values()) {
    const identityKeys = new Set(
      group.map((user) => {
        const email = normalized(user.email);
        return email ? `email:${email}` : `source:${text(user.sourceUserId)}`;
      }),
    );
    if (identityKeys.size > 1) {
      for (const user of group) addFinding(blockers, 'GLOBAL_USERNAME_AMBIGUITY', user);
    }
  }

  for (const group of tenantUsernameGroups.values()) {
    if (group.length > 1) {
      for (const user of group) addFinding(blockers, 'V2_TENANT_USERNAME_DUPLICATE', user);
    }
  }

  for (const group of tenantEmailGroups.values()) {
    if (group.length > 1) {
      for (const user of group) addFinding(blockers, 'V2_TENANT_EMAIL_DUPLICATE', user);
    }
  }

  const blockerList = findings(blockers);
  return {
    schemaVersion: 1,
    mode: 'DRY_RUN_ONLY',
    readyForApply: blockerList.length === 0,
    summary: {
      sourceUsers: input.users.length,
      active,
      inactive,
      withEmail,
      missingEmail,
      bcryptCompatible,
      mappedRoles: [...roleCounts.values()].reduce((sum, count) => sum + count, 0),
      uniqueEmailIdentities: emailGroups.size,
    },
    roleMapping: Object.fromEntries(
      [...roleCounts.entries()].toSorted(([a], [b]) => a.localeCompare(b)),
    ),
    blockers: blockerList,
    warnings: findings(warnings),
    guardrails: {
      reportContainsRawIdentifiers: false,
      acceptsCredentialMaterial: false,
      importsSessionsOrTokens: false,
      mutatesDatabase: false,
      requiresExplicitApplyAuthorization: true,
    },
  };
}

async function main() {
  const inputIndex = process.argv.indexOf('--input');
  const inputPath = inputIndex >= 0 ? process.argv[inputIndex + 1] : undefined;
  if (!inputPath) {
    process.stderr.write('Usage: pnpm lot16:identity:dry-run -- --input <export.json>\n');
    process.exitCode = 64;
    return;
  }

  const input = JSON.parse(await readFile(inputPath, 'utf8'));
  const report = analyzeV2IdentityDryRun(input);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.readyForApply ? 0 : 2;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
