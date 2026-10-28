import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

// Never print matched content. Generated local keys/captures are deliberately not Git inputs.
const git = (...args) => execFileSync('git', args, { maxBuffer: 128 * 1024 * 1024 });
const signatures = [
  [
    'private-key',
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]{32,}-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  ],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,255}|github_pat_[A-Za-z0-9_]{60,255})\b/g],
  ['brevo-api-key', /\bxkeysib-[a-f0-9]{64}-[A-Za-z0-9]{10,}\b/g],
  [
    'literal-secret',
    /(?:password|secret|api[_-]?key|refreshToken|accessToken)\s*[:=]\s*['"]([A-Za-z0-9+/_=-]{32,})['"]/gi,
  ],
];
const findings = [];
const publicFixtures = new Map([
  [
    'test-only-webhook-secret-32-bytes-long',
    new Set([
      'apps/api/src/modules/messaging/domain/webhook-auth.test.ts',
      'packages/infrastructure/src/messaging/provider.test.ts',
    ]),
  ],
  ['test-webhook-secret-at-least-32-bytes', new Set(['packages/config/src/messaging.test.ts'])],
  ['GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', new Set(['apps/web/src/e2e-mfa-state.test.ts'])],
  [
    'gestschool-lot15-capacity-ci-only',
    new Set(['scripts/lot15-capacity-certification.mjs']),
  ],
]);
function scan(content, path, revision) {
  if (content.includes('\0')) return;
  for (const [type, pattern] of signatures) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      const value = match[1] ?? match[0];
      if (type === 'literal-secret' && publicFixtures.get(value)?.has(path)) continue;
      // Repeated characters are test placeholders, not entropy-bearing credentials.
      if (new Set(value).size < 8) continue;
      findings.push({
        revision,
        path,
        type,
        fingerprint: createHash('sha256').update(value).digest('hex').slice(0, 12),
      });
    }
  }
}
const files = git('ls-files', '--cached', '--others', '--exclude-standard', '-z')
  .toString()
  .split('\0')
  .filter(Boolean);
for (const path of files)
  if (existsSync(path)) scan(readFileSync(path, 'utf8'), path, 'working-tree');
if (existsSync('.env') && !files.includes('.env'))
  scan(readFileSync('.env', 'utf8'), '.env', 'local-untracked');
if (process.argv.includes('--history')) {
  const objects = git('rev-list', '--objects', '--all').toString().trim().split('\n');
  const paths = new Map(
    objects.map((line) => [line.split(' ')[0], line.slice(line.indexOf(' ') + 1)]),
  );
  const ids = [...paths.keys()];
  const buffer = execFileSync('git', ['cat-file', '--batch'], {
    input: ids.join('\n') + '\n',
    maxBuffer: 128 * 1024 * 1024,
  });
  let offset = 0;
  while (offset < buffer.length) {
    const end = buffer.indexOf(10, offset);
    const [id, type, sizeText] = buffer.subarray(offset, end).toString().split(' ');
    const size = Number(sizeText);
    if (!Number.isFinite(size)) throw new Error('Git object inspection failed');
    offset = end + 1;
    if (type === 'blob') scan(buffer.subarray(offset, offset + size).toString(), paths.get(id), id);
    offset += size + 1;
  }
}
for (const finding of findings) {
  if (finding.revision !== 'working-tree' && finding.revision !== 'local-untracked') {
    finding.revision = git(
      'log',
      '--all',
      '-1',
      '--format=%H',
      `--find-object=${finding.revision}`,
      '--',
      finding.path,
    )
      .toString()
      .trim();
  }
  process.stdout.write(JSON.stringify(finding) + '\n');
}
process.stdout.write(`Secret signatures: ${findings.length} finding(s); values never printed.\n`);
process.exitCode = findings.length ? 1 : 0;
