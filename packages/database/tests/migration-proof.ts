import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { createPrismaClient } from '../src/client.js';

const config = loadInfrastructureConfig(),
  file = resolve(process.env['MIGRATION_PROOF_FILE'] ?? ''),
  root = resolve(process.cwd(), '.local');
if (
  !['127.0.0.1', 'localhost'].includes(new URL(config.databaseUrl).hostname) ||
  !/^\/gestschool_lot(?:10|12)_upgrade_[a-z0-9_]+$/.test(new URL(config.databaseUrl).pathname) ||
  !relative(root, file) ||
  relative(root, file).startsWith('..')
)
  throw new Error(
    'Migration proof requires an isolated local upgrade database and a private .local proof file',
  );
const db = createPrismaClient(config.databaseUrl);
type TableProof = { table: string; columns: string[]; count: number; hash: string };
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
async function capture(table: string, columns: string[]): Promise<TableProof> {
  const rows = await db.$queryRawUnsafe<{ row: string }[]>(
    `SELECT row_to_json(t)::text AS row FROM (SELECT ${columns.map(quote).join(',')} FROM public.${quote(table)}) t ORDER BY row_to_json(t)::text`,
  );
  const hash = createHash('sha256');
  for (const r of rows) hash.update(r.row + '\n');
  return { table, columns, count: rows.length, hash: hash.digest('hex') };
}
try {
  if (process.env['MIGRATION_PROOF_MODE'] === 'before') {
    const tables = await db.$queryRaw<
      { table_name: string; columns: string[] }[]
    >`SELECT table_name,array_agg(column_name::text ORDER BY ordinal_position) AS columns FROM information_schema.columns WHERE table_schema='public' AND table_name<>'_prisma_migrations' GROUP BY table_name ORDER BY table_name`;
    const proof: TableProof[] = [];
    for (const table of tables) proof.push(await capture(table.table_name, table.columns));
    await writeFile(file, JSON.stringify(proof, null, 2), { mode: 0o600 });
    process.stdout.write(`Baseline recorded: ${proof.length} tables; row values are not logged.\n`);
  } else if (process.env['MIGRATION_PROOF_MODE'] === 'after') {
    const previous = JSON.parse(await readFile(file, 'utf8')) as TableProof[];
    for (const before of previous) {
      const after = await capture(before.table, before.columns);
      if (after.hash !== before.hash || after.count !== before.count)
        throw new Error(`Migration changed historical data in ${before.table}`);
    }
    process.stdout.write(
      `Upgrade preservation PASS: ${previous.length} tables, all pre-existing columns and rows byte-equivalent.\n`,
    );
  } else throw new Error('Expected MIGRATION_PROOF_MODE=before|after');
} finally {
  await db.$disconnect();
}
