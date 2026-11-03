import { constants } from 'node:fs';
import { access, readdir, readFile } from 'node:fs/promises';
import { extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('../apps/web/src/', import.meta.url));

const forbiddenFiles = ['mocks/data.ts', 'features/shared/mock-action.ts'];
const forbiddenDirectories = ['mocks/'];

const visibleRoutes = [
  'app/[locale]/(portal)/page.tsx',
  'app/[locale]/(portal)/students/page.tsx',
  'app/[locale]/(portal)/parents/page.tsx',
  'app/[locale]/(portal)/teachers/page.tsx',
  'app/[locale]/(portal)/attendance/page.tsx',
  'app/[locale]/(portal)/enrollments/page.tsx',
  'app/[locale]/(portal)/classes/page.tsx',
  'app/[locale]/(portal)/subjects/page.tsx',
  'app/[locale]/(portal)/grades/page.tsx',
  'app/[locale]/(portal)/finance/page.tsx',
  'app/[locale]/(portal)/documents/page.tsx',
  'app/[locale]/(portal)/communications/page.tsx',
  'app/[locale]/(portal)/reports/page.tsx',
  'app/[locale]/(portal)/settings/page.tsx',
  'app/[locale]/(portal)/users/page.tsx',
  'app/[locale]/(portal)/audit/page.tsx',
  'app/[locale]/(portal)/profile/page.tsx',
];

const forbiddenPatterns = [
  {
    code: 'LEGACY_MOCK_ACTION',
    pattern: /\buseMockAction\b/u,
  },
  {
    code: 'LEGACY_MOCK_IMPORT',
    pattern: /from\s+['"][^'"]*(?:mocks\/data|mock-action)[^'"]*['"]/u,
  },
  {
    code: 'LEGACY_MOCK_DYNAMIC_IMPORT',
    pattern: /import\s*\(\s*['"][^'"]*(?:mocks\/data|mock-action)[^'"]*['"]\s*\)/u,
  },
];

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await walk(path)));
    } else {
      files.push(path);
    }
  }
  return files;
}

const failures = [];

for (const path of forbiddenFiles) {
  if (await exists(`${webRoot}/${path}`)) {
    failures.push({ code: 'LEGACY_MOCK_FILE', path });
  }
}

for (const path of visibleRoutes) {
  if (!(await exists(`${webRoot}/${path}`))) {
    failures.push({ code: 'VISIBLE_ROUTE_MISSING', path });
  }
}

const sourceFiles = (await walk(webRoot)).filter((path) => {
  if (!['.ts', '.tsx'].includes(extname(path))) {
    return false;
  }
  const normalized = relative(webRoot, path).replaceAll('\\', '/');
  return !normalized.endsWith('.test.ts') && !normalized.endsWith('.test.tsx');
});

for (const path of sourceFiles) {
  const normalized = relative(webRoot, path).replaceAll('\\', '/');
  if (forbiddenDirectories.some((prefix) => normalized.startsWith(prefix))) {
    failures.push({ code: 'LEGACY_MOCK_DIRECTORY', path: normalized });
  }

  const content = await readFile(path, 'utf8');
  for (const rule of forbiddenPatterns) {
    if (rule.pattern.test(content)) {
      failures.push({ code: rule.code, path: normalized });
    }
  }
}

if (failures.length) {
  process.stderr.write(
    `LOT17 zero-mock certification = FAIL\n${JSON.stringify(failures, null, 2)}\n`,
  );
  process.exitCode = 1;
} else {
  const message =
    `LOT17 zero-mock certification = PASS (${sourceFiles.length} production source files, ` +
    `${visibleRoutes.length} visible routes)\n`;
  process.stdout.write(message);
}
