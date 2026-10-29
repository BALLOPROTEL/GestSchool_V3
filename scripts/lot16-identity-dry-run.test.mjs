import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyzeV2IdentityDryRun } from './lot16-identity-dry-run.mjs';

const load = async (name) =>
  JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

const happy = await load('lot16-identity-happy.json');
const happyReport = analyzeV2IdentityDryRun(happy);
assert.equal(happyReport.readyForApply, true);
assert.equal(happyReport.summary.sourceUsers, 6);
assert.equal(happyReport.summary.bcryptCompatible, 6);
assert.equal(happyReport.blockers.length, 0);
assert.deepEqual(happyReport.roleMapping, {
  'ADMIN->SCHOOL_ADMIN': 1,
  'COMPTABLE->ACCOUNTANT': 1,
  'ENSEIGNANT->TEACHER': 1,
  'PARENT->PARENT': 1,
  'SCOLARITE->ACADEMIC_STAFF': 1,
  'STUDENT->STUDENT': 1,
});

const happySerialized = JSON.stringify(happyReport);
for (const user of happy.users) {
  assert.equal(happySerialized.includes(user.email), false);
  assert.equal(happySerialized.includes(user.username), false);
}

const blocked = await load('lot16-identity-blockers.json');
const blockedReport = analyzeV2IdentityDryRun(blocked);
assert.equal(blockedReport.readyForApply, false);
const codes = new Set(blockedReport.blockers.map((finding) => finding.code));
for (const code of [
  'GLOBAL_EMAIL_REUSE_REQUIRES_REVIEW',
  'GLOBAL_USERNAME_AMBIGUITY',
  'MISSING_EMAIL_REQUIRES_POLICY',
  'UNMAPPED_ROLE',
  'UNSUPPORTED_PASSWORD_HASH_KIND',
]) {
  assert.equal(codes.has(code), true, `missing blocker ${code}`);
}

assert.throws(
  () =>
    analyzeV2IdentityDryRun({
      schemaVersion: 1,
      users: [
        {
          sourceUserId: 'forbidden',
          tenantId: 'tenant',
          username: 'forbidden',
          email: 'forbidden@example.invalid',
          role: 'ADMIN',
          status: 'ACTIVE',
          isActive: true,
          passwordHashKind: 'BCRYPT',
          passwordHash: 'must-never-enter-dry-run',
        },
      ],
    }),
  /LOT16_FORBIDDEN_CREDENTIAL_MATERIAL/,
);

process.stdout.write('LOT16 identity migration dry-run = PASS\n');
