import pg from 'pg';

const databaseName = process.env['DATABASE_NAME'];
const source = process.env['DATABASE_URL'];
if (!source || !databaseName || !/^gestschool_lot11_[a-z0-9_]+$/.test(databaseName))
  throw new Error('An isolated gestschool_lot11_* database name is required');

const adminUrl = new URL(source);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(adminUrl.hostname))
  throw new Error('Isolated certification databases are restricted to localhost');
adminUrl.pathname = '/postgres';

const client = new pg.Client({ connectionString: adminUrl.toString() });
await client.connect();
try {
  const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
    databaseName,
  ]);
  if (existing.rowCount) throw new Error(`Database ${databaseName} already exists`);
  await client.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0 ENCODING 'UTF8'`);
  process.stdout.write(`Created empty isolated database ${databaseName}\n`);
} finally {
  await client.end();
}
